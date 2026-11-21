"""Pipeline de 2 oleadas: secuencia de eventos, validación de hallazgos, error y cancel."""

import asyncio
import json
import re

from app.llm import ChatResult, LLMError
from app.pipeline import run_pipeline
from app.runs import RunRegistry, RunStatus
from app.scanner import CodeFile, MAX_TOTAL_CHARS, ScanResult

# Fixture idéntico al de Task 4 (test_vulns.py): dos archivos de código + manifiesto
scan = ScanResult(
    files=[
        CodeFile(path="routes/orders.js", lines=10, content="l1\n" * 9 + "l10"),
        CodeFile(path="routes/admin.js", lines=6, content="a\n" * 5 + "a"),
    ],
    manifests=[CodeFile(path="package.json", lines=3, content="{\n  \"name\": \"miniapp\"\n}\n")],
    all_paths={"routes/orders.js", "routes/admin.js", "package.json"},
    total_chars=0,
)

PROFILE_JSON = json.dumps(
    {
        "name": "miniapp",
        "language": "JavaScript",
        "frameworks": [{"name": "Express", "version": "4.19"}],
        "entry_points": ["routes/orders.js"],
        "description": "API Express de ejemplo",
        "notes": "",
    }
)


def _finding(**overrides):
    base = {
        "severity": "high",
        "title": "t",
        "file": "routes/orders.js",
        "line": 4,
        "snippet": "s",
        "exploit": "e",
        "consequences": "c",
        "solution": "s",
    }
    base.update(overrides)
    return base


# A01: 1 hallazgo válido · A03: 1 válido + 2 inválidos (file inexistente y línea fuera de rango)
A01_JSON = json.dumps([_finding(file="routes/admin.js", line=5, title="Admin sin autorización")])
A03_JSON = json.dumps(
    [
        _finding(title="SQLi en orders"),
        _finding(file="nope.js", line=1, title="en archivo inexistente"),
        _finding(line=99999, title="con línea fuera de rango"),
    ]
)


class FakeVulnLLM:
    """Responde por categorías: perfil si el system contiene 'perfilador';
    si no, extrae la categoría de la línea 'Categoría: A0X' del user.
    Implementa `close()` porque la API lo llama en `finally`."""

    # usage fijo y determinista: perfil 10 tokens/0,1 s · agente 5 tokens/0,2 s (tps 25)
    def __init__(self, canned_by_vuln, profile_raw, fail_vulns=(), delay=0.0):
        self.canned_by_vuln = canned_by_vuln
        self.profile_raw = profile_raw
        self.fail_vulns = set(fail_vulns)
        self.delay = delay
        self.systems = []  # registro de los `system` recibidos (add-on: contrato del perfilador)
        self.model = "qwen3.8-fp8"

    async def chat(self, system, user, max_tokens=8000):
        self.systems.append(system)
        if "perfilador" in system:
            return ChatResult(content=self.profile_raw, prompt_tokens=100, completion_tokens=10, elapsed_s=0.1)
        m = re.search(r"Categoría: (A\d+)", user)
        v = m.group(1)
        if v in self.fail_vulns:
            raise LLMError("boom de prueba")
        if self.delay:
            await asyncio.sleep(self.delay)
        return ChatResult(content=self.canned_by_vuln[v], prompt_tokens=100, completion_tokens=5, elapsed_s=0.2)

    async def close(self):
        pass


def types(events):
    return [e["type"] for e in events]


def test_pipeline_full_sequence():
    run = RunRegistry().start("miniapp", ["A01", "A03"])
    llm = FakeVulnLLM({"A01": A01_JSON, "A03": A03_JSON}, PROFILE_JSON)
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=2))
    # run:start → profile:done → log del perfil → los agent:start (todos antes del pool)
    assert types(run.events)[:4] == ["run:start", "profile:done", "log", "agent:start"]
    assert [e["vulnId"] for e in run.events if e["type"] == "agent:start"] == ["A01", "A03"]
    assert types(run.events)[-1] == "run:done"
    assert [f["id"] for f in run.findings] == ["A01-1", "A03-1"]
    assert run.findings[0]["vulnId"] == "A01"
    assert any("descartados 2 hallazgo(s) inválido(s)" in e.get("message", "") for e in run.events)
    assert run.status == RunStatus.DONE
    # Add-on: el system de la llamada de perfil contiene la frase load-bearing
    assert any("agente perfilador" in s for s in llm.systems)
    # Modelo + velocidad visibles (run:start, agent:done y meta de run:done)
    start = run.events[0]
    assert start["type"] == "run:start" and start["model"] == "qwen3.8-fp8"
    done = {e["vulnId"]: e for e in run.events if e["type"] == "agent:done"}
    assert done["A01"]["tokens"] == 5 and done["A01"]["tps"] == 25.0
    final = run.events[-1]
    assert final["meta"]["model"] == "qwen3.8-fp8"
    assert final["meta"]["totalTokens"] == 10  # A01 + A03 (el perfil no cuenta)
    assert final["meta"]["avgTps"] == 25.0


def test_pipeline_llm_error_emits_error_and_finishes():
    reg = RunRegistry()
    run = reg.start("miniapp", ["A01"])
    llm = FakeVulnLLM({}, PROFILE_JSON, fail_vulns={"A01"})
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01"], run, concurrency=1))
    assert types(run.events)[-1] == "run:error"
    assert run.status == RunStatus.ERROR
    reg.finish(run)
    assert reg.active is None


def test_pipeline_size_guard():
    big = ScanResult(
        files=[CodeFile("a.js", 1, "x" * (MAX_TOTAL_CHARS + 1))],
        manifests=[],
        all_paths={"a.js"},
        total_chars=MAX_TOTAL_CHARS + 1,
    )
    run = RunRegistry().start("miniapp", ["A01"])
    asyncio.run(run_pipeline(FakeVulnLLM({}, PROFILE_JSON), big, "miniapp", ["A01"], run, concurrency=1))
    assert types(run.events) == ["run:start", "run:error"]
    assert "demasiado grande" in run.events[1]["message"]


def test_pipeline_cancelled_skips_agents():
    reg = RunRegistry()
    run = reg.start("miniapp", ["A01", "A03"])
    assert reg.cancel(run.id)
    llm = FakeVulnLLM({"A01": A01_JSON, "A03": A03_JSON}, PROFILE_JSON)
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=2))
    assert types(run.events)[-1] == "run:cancelled"
    assert run.findings == [] and run.status == RunStatus.CANCELLED


def test_supersede_no_wasted_llm_calls():
    """Fix I1 (rama CANCELLED): tras un supersede, los agentes del run viejo que aún
    esperan el semáforo NO hacen llamadas LLM (el guard se evalúa al adquirirlo, tras
    el flip CANCELLING → CANCELLED de ``RunRegistry.start``).

    Mecanismo: con ``concurrency=1`` y ``delay=0.4``, A01 agota el semáforo durante su
    chat (0.4 s); el main cancela (→ CANCELLING) y suple el run (→ CANCELLED) a los
    ~0,01-0,05 s, mientras A03 sigue en cola. Al despertar A03 (~0,4 s, ya tras el
    flip), el guard debe saltarlo sin llamar al LLM. Pre-fix veía ``CANCELLING ≠
    CANCELLED`` y hacía la llamada (que luego se descartaba post-chat).
    """
    reg = RunRegistry()
    run = reg.start("miniapp", ["A01", "A03"])
    llm = FakeVulnLLM({"A01": A01_JSON, "A03": A03_JSON}, PROFILE_JSON, delay=0.4)
    new_run = None

    async def go():
        nonlocal new_run
        task = asyncio.create_task(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=1))
        # Espera a que A01 esté en vuelo: systems = [perfil, A01]
        for _ in range(200):
            await asyncio.sleep(0.01)
            if len(llm.systems) >= 2:
                break
        assert reg.cancel(run.id)  # RUNNING → CANCELLING
        new_run = reg.start("miniapp", ["A01"])  # supersede (ruling R3) → run CANCELLED
        await task
        await llm.close()

    asyncio.run(go())
    assert new_run is not None and new_run.status == RunStatus.RUNNING
    assert run.status == RunStatus.CANCELLED
    # La aserción del fix: solo 2 llamadas (perfil + A01, en vuelo al flip);
    # A03, en cola al flip, NUNCA llama al LLM.
    assert len(llm.systems) == 2
    # A03 cerrado vía guard (skip), no vía chat descartado:
    assert any(
        e["type"] == "agent:done" and e["vulnId"] == "A03" and e["findingsCount"] == 0
        for e in run.events
    )
    # El run suplantado se cerró en el supersede (el registry emitió run:cancelled en el
    # flip); después solo quedan los skips de los agentes en cola:
    assert any(e["type"] == "run:cancelled" for e in run.events)
    assert not any(e["type"] == "run:done" for e in run.events)


def test_pipeline_error_skips_queued_agents():
    """Fix I1 (rama ERROR): si un agente falla (p. ej. 504) y el run pasa a ERROR,
    los agentes en cola no hacen llamadas LLM (se saltan en el guard). Determinista
    sin timing: con ``concurrency=1`` y sin delay, A01 falla de forma síncrona (el
    raise no cede el event loop) y el run está en ERROR antes de que A03 arranque."""
    reg = RunRegistry()
    run = reg.start("miniapp", ["A01", "A03"])
    llm = FakeVulnLLM({"A01": A01_JSON, "A03": A03_JSON}, PROFILE_JSON, fail_vulns={"A01"})
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=1))
    # run:error emitido al fallar A01; después solo quedan los skips de los agentes en cola:
    assert any(e["type"] == "run:error" for e in run.events)
    assert not any(e["type"] == "run:done" for e in run.events)
    assert run.status == RunStatus.ERROR
    # Solo 2 llamadas (perfil + A01, que falló): A03 no llega a llamar.
    assert len(llm.systems) == 2
    # A03 cerrado vía guard (skip), con el run ya en ERROR:
    assert any(
        e["type"] == "agent:done" and e["vulnId"] == "A03" and e["findingsCount"] == 0
        for e in run.events
    )
    assert run.findings == []


def test_consolidate_two_categories_same_line():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(file="routes/orders.js", line=4, vulnId="A03", id="A03-1")},
        {**_finding(file="routes/orders.js", line=4, vulnId="A05", id="A05-1")},
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 1 and len(out) == 1
    assert out[0]["vulnId"] == "A03"
    assert out[0]["alsoCategories"] == ["A05"]


def test_consolidate_three_categories_and_renumbers():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(line=10, vulnId="A05", id="A05-1")},
        {**_finding(line=10, vulnId="A01", id="A01-1")},
        {**_finding(line=10, vulnId="A03", id="A03-1")},
        {**_finding(line=20, vulnId="A03", id="A03-2")},
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 2
    assert [f["id"] for f in out] == ["A01-1", "A03-1"]
    assert out[0]["alsoCategories"] == ["A03", "A05"]
    assert out[1]["line"] == 20


def test_consolidate_no_duplicates_keeps_all():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(line=1, vulnId="A01", id="A01-1")},
        {**_finding(line=2, vulnId="A01", id="A01-2")},  # intra-categoría: se conserva
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 0 and len(out) == 2
    assert "alsoCategories" not in out[0]


def test_consolidate_intra_category_duplicates_kept():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(file="a.js", line=7, vulnId="A01", id="A01-1", title="t1")},
        {**_finding(file="a.js", line=7, vulnId="A01", id="A01-2", title="t2")},
        {**_finding(file="a.js", line=7, vulnId="A03", id="A03-1")},
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 1
    assert len(out) == 2
    assert [f["id"] for f in out] == ["A01-1", "A01-2"]
    for f in out:
        assert f["alsoCategories"] == ["A03"]


def test_pipeline_consolidates_cross_category_duplicates():
    run = RunRegistry().start("miniapp", ["A01", "A03"])
    llm = FakeVulnLLM(
        {"A01": json.dumps([_finding(file="routes/orders.js", line=4)]),
         "A03": json.dumps([_finding(file="routes/orders.js", line=4),
                             _finding(file="routes/orders.js", line=9)])},
        PROFILE_JSON,
    )
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=2))
    done = run.events[-1]
    assert done["type"] == "run:done"
    assert [f["id"] for f in done["findings"]] == ["A01-1", "A03-1"]
    assert done["findings"][0]["alsoCategories"] == ["A03"]
    assert any("consolidados 1 hallazgo(s) duplicado(s) entre categorías" in e.get("message", "")
               for e in run.events)


def test_pipeline_finding_without_optional_fields_gets_empty_strings():
    """M1 (diferido de la 2a): un finding del LLM sin las keys opcionales
    (snippet/exploit/consequences/solution) llega a UI/PDF con "" y nunca sin key."""
    finding = _finding(file="routes/admin.js", line=5, title="Admin sin autorización")
    finding.pop("snippet")
    finding.pop("exploit")
    run = RunRegistry().start("miniapp", ["A01"])
    llm = FakeVulnLLM({"A01": json.dumps([finding])}, PROFILE_JSON)
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01"], run, concurrency=1))
    assert run.status == RunStatus.DONE
    assert run.findings[0]["snippet"] == ""
    assert run.findings[0]["exploit"] == ""
