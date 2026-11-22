"""Agente de guías de explotación (Fase 2d): prompt anti-alucinación y parseo tolerante."""
import re

from app.agents.guides import GUIDE_MAX_TOKENS, build_guide_prompt, extract_guide
from app.agents.profile import Profile

FINDING = {
    "id": "A03-1", "vulnId": "A03", "severity": "high", "title": "SQLi en get_orders",
    "file": "routes/orders.js", "line": 4, "snippet": "q = 'SELECT * FROM orders WHERE user = ' + user",
    "exploit": "user=1 OR 1=1--", "consequences": "lectura de la tabla completa",
    "solution": "consulta parametrizada",
}
PROFILE = Profile(name="miniapp", language="JavaScript",
                  frameworks=[{"name": "Express", "version": "4.19"}],
                  entry_points=["routes/orders.js"], description="API Express de ejemplo", notes="")


def test_guide_max_tokens():
    assert GUIDE_MAX_TOKENS == 1600


def test_build_guide_prompt_system_anti_alucion_y_estructura():
    system, _ = build_guide_prompt(FINDING, "x = 1", PROFILE, "miniapp")
    assert system.startswith("Eres el agente de guías de explotación")
    assert "prohibido inventar" in system
    for h in ("## RESUMEN", "## PASOS", "## PAYLOAD DE EJEMPLO", "## IMPACTO EN ESTE PROYECTO"):
        assert h in system


def test_build_guide_prompt_user_ancla_datos_reales():
    _, user = build_guide_prompt(FINDING, "const a = 1;", PROFILE, "miniapp")
    assert "Proyecto: miniapp" in user
    assert "JavaScript" in user
    assert "A03" in user and "Inyección" in user
    assert "routes/orders.js:4" in user
    assert "SQLi en get_orders" in user
    assert FINDING["snippet"] in user
    assert "const a = 1;" in user  # archivo completo incluido


def test_build_guide_prompt_sin_archivo_ni_perfil():
    _, user = build_guide_prompt(FINDING, None, None, "miniapp")
    assert "Código completo" not in user
    assert FINDING["snippet"] in user  # el snippet sigue ahí


def test_build_guide_prompt_user_no_colision_con_despacho():
    """Review Focus 3: los fakes despachan por 'Categoría: A0X'; el prompt de guía
    no debe contener ese patrón (usar 'ID: {id} · {vulnId} (nombre)', no 'Categoría: A0X')."""
    _, user = build_guide_prompt(FINDING, "x", PROFILE, "miniapp")
    assert re.search(r"Categoría: A\d+", user) is None


def test_extract_guide_limpia_fences_y_espacios():
    assert extract_guide("```text\n## RESUMEN\nhola\n```") == "## RESUMEN\nhola"
    assert extract_guide("  guía sin fences  \n") == "guía sin fences"


def test_extract_guide_vacio():
    assert extract_guide("```") == ""
    assert extract_guide("   \n  ") == ""


import asyncio

from app.agents.guides import run_guides
from app.llm import ChatResult, LLMError
from app.runs import RunRegistry, RunStatus
from app.scanner import CodeFile, ScanResult

scan = ScanResult(
    files=[CodeFile(path="routes/orders.js", lines=10, content="const l1 = 'SQL';\n" * 9 + "l10"),
           CodeFile(path="routes/admin.js", lines=6, content="a\n" * 5 + "a")],
    manifests=[], all_paths={"routes/orders.js", "routes/admin.js"}, total_chars=0,
)


def _finding(fid, vid, **kw):
    base = {"id": fid, "vulnId": vid, "severity": "high", "title": "t",
            "file": "routes/orders.js", "line": 4, "snippet": "s", "exploit": "e",
            "consequences": "c", "solution": "s"}
    base.update(kw)
    return base


class FakeGuideLLM:
    """Canned guide por llamada; cuenta llamadas, in-flight y fallos por índice."""

    def __init__(self, canned="## RESUMEN\nguía de prueba", fail_indexes=(), delay=0.0):
        self.canned = canned
        self.fail_indexes = set(fail_indexes)
        self.delay = delay
        self.calls = 0
        self.users = []
        self.in_flight = 0
        self.max_in_flight = 0

    async def chat(self, system, user, max_tokens=8000, on_progress=None):
        i = self.calls
        self.calls += 1
        self.users.append(user)
        if i in self.fail_indexes:
            raise LLMError("boom guía")
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        if self.delay:
            await asyncio.sleep(self.delay)
        self.in_flight -= 1
        return ChatResult(content=self.canned, prompt_tokens=50, completion_tokens=7, elapsed_s=0.1)


def test_run_guides_ataca_guide_y_emite_logs():
    run = RunRegistry().start("miniapp", ["A01", "A03"])
    fs = [_finding("A01-1", "A01"), _finding("A03-1", "A03", file="routes/admin.js")]
    llm = FakeGuideLLM()
    tokens, llm_s = asyncio.run(run_guides(llm, fs, scan, None, "miniapp", run, concurrency=2))
    assert (tokens, llm_s) == (14, 0.2)
    assert all(f["guide"] == "## RESUMEN\nguía de prueba" for f in fs)
    msgs = [e.get("message", "") for e in run.events if e["type"] == "log"]
    assert msgs[0] == "Guías de explotación: 2 hallazgo(s) → generando…"
    assert any(m.startswith("Guía lista: A01-1") and re.search(r"\(\d/2\)$", m) for m in msgs)
    assert any(m.startswith("Guía lista: A03-1") and re.search(r"\(\d/2\)$", m) for m in msgs)


def test_run_guides_respeta_concurrency():
    run = RunRegistry().start("miniapp", ["A01", "A03", "A02"])
    fs = [_finding(f"A01-{i}", "A01") for i in (1, 2, 3)]
    llm = FakeGuideLLM(delay=0.05)
    asyncio.run(run_guides(llm, fs, scan, None, "p", run, concurrency=2))
    assert llm.max_in_flight == 2
    run2 = RunRegistry().start("miniapp", ["A01", "A03", "A02"])
    fs2 = [_finding(f"A01-{i}", "A01") for i in (1, 2, 3)]
    llm2 = FakeGuideLLM(delay=0.05)
    asyncio.run(run_guides(llm2, fs2, scan, None, "p", run2, concurrency=1))
    assert llm2.max_in_flight == 1


def test_run_guides_fallo_no_falla_run():
    run = RunRegistry().start("miniapp", ["A01", "A03"])
    fs = [_finding("A01-1", "A01"), _finding("A03-1", "A03")]
    llm = FakeGuideLLM(fail_indexes={1})
    tokens, _ = asyncio.run(run_guides(llm, fs, scan, None, "p", run, concurrency=2))
    assert run.status == RunStatus.RUNNING
    assert "guide" in fs[0] and "guide" not in fs[1]
    assert tokens == 7  # solo la que funcionó
    assert any("Guía no disponible: A03-1" in e.get("message", "") for e in run.events)
    assert not any(e["type"] == "run:error" for e in run.events)


def test_run_guides_vacio_no_ataca_guide():
    """Review Focus 5: el LLM devuelve solo fences/espacios → sin key guide + log."""
    run = RunRegistry().start("miniapp", ["A01"])
    fs = [_finding("A01-1", "A01")]
    llm = FakeGuideLLM(canned="```\n```")
    asyncio.run(run_guides(llm, fs, scan, None, "p", run, concurrency=1))
    assert "guide" not in fs[0]
    assert any("Guía no disponible: A01-1" in e.get("message", "") for e in run.events)


def test_run_guides_terminal_salta_sin_gastar():
    run = RunRegistry().start("miniapp", ["A01"])
    run.status = RunStatus.CANCELLING
    fs = [_finding("A01-1", "A01")]
    llm = FakeGuideLLM()
    tokens, llm_s = asyncio.run(run_guides(llm, fs, scan, None, "p", run, concurrency=2))
    assert (llm.calls, tokens, llm_s) == (0, 0, 0.0)
    assert "guide" not in fs[0]


def test_run_guides_buscarchivo_incluido_en_prompt():
    run = RunRegistry().start("miniapp", ["A01"])
    fs = [_finding("A01-1", "A01"), _finding("A01-2", "A01", file="ghost.js")]
    llm = FakeGuideLLM()
    asyncio.run(run_guides(llm, fs, scan, None, "p", run, concurrency=1))
    assert "SQL" in llm.users[0]      # orders.js está en el scan → contenido incluido
    assert "SQL" not in llm.users[1]   # ghost.js no: solo snippet, sin crash
