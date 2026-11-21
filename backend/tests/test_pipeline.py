"""Pipeline de 2 oleadas: secuencia de eventos, validación de hallazgos, error y cancel."""

import asyncio
import json
import re

from app.llm import LLMError
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

    def __init__(self, canned_by_vuln, profile_raw, fail_vulns=(), delay=0.0):
        self.canned_by_vuln = canned_by_vuln
        self.profile_raw = profile_raw
        self.fail_vulns = set(fail_vulns)
        self.delay = delay
        self.systems = []  # registro de los `system` recibidos (add-on: contrato del perfilador)

    async def chat(self, system, user, max_tokens=8000):
        self.systems.append(system)
        if "perfilador" in system:
            return self.profile_raw
        m = re.search(r"Categoría: (A\d+)", user)
        v = m.group(1)
        if v in self.fail_vulns:
            raise LLMError("boom de prueba")
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.canned_by_vuln[v]

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
