"""API de análisis: POST /api/analyze, SSE con replay, cancel y supersede (ruling R3)."""

import asyncio
import json
import re

import pytest
from fastapi.testclient import TestClient

from app.llm import ChatResult, LLMError
from app.main import RUNS, app

PROFILE_JSON = json.dumps(
    {
        "name": "miniapp",
        "language": "JavaScript",
        "frameworks": [{"name": "Express", "version": "4.19"}],
        "entry_points": [],
        "description": "miniapp de prueba",
        "notes": "",
    }
)


def _finding(file: str, line: int, severity: str = "high", title: str = "t") -> dict:
    return {
        "severity": severity,
        "title": title,
        "file": file,
        "line": line,
        "snippet": "s",
        "exploit": "e",
        "consequences": "c",
        "solution": "s",
    }


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

    async def chat(self, system, user, max_tokens=8000, on_progress=None):
        # on_progress: el pipeline lo pasa (tk/s en vivo, QA-iter 5); el fake lo ignora.
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


def make_llm(delay: float = 0.5) -> FakeVulnLLM:
    """FakeVulnLLM con hallazgos válidos contra la samples_dir de Task 2 (a.js/b.js).

    ``delay=0.5`` para que el run siga activo durante las pruebas.
    """
    canned = {
        "A01": json.dumps([_finding("a.js", 1, "high", "ruta sin autorización")]),
        "A03": json.dumps([_finding("b.js", 2, "medium", "posible inyección")]),
    }
    return FakeVulnLLM(canned, PROFILE_JSON, delay=delay)


@pytest.fixture
def samples_dir(tmp_path):
    """Proyecto de ejemplo idéntico al de Task 2 (test_projects.py)."""
    miniapp = tmp_path / "miniapp"
    miniapp.mkdir()
    (miniapp / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    (miniapp / "b.js").write_text("const b = 2;\nconst c = 3;\n", encoding="utf-8")
    (miniapp / "package.json").write_text('{"name": "miniapp"}\n', encoding="utf-8")

    dvwa = tmp_path / "dvwa"
    (dvwa / "vulnerabilities" / "sqli").mkdir(parents=True)
    (dvwa / "vulnerabilities" / "sqli" / "x.php").write_text("<?php\n", encoding="utf-8")
    (dvwa / "vulnerabilities" / "xss_s").mkdir(parents=True)
    (dvwa / "vulnerabilities" / "xss_s" / "y.php").write_text("<?php\n", encoding="utf-8")
    return tmp_path


@pytest.fixture(autouse=True)
def clean_runs():
    """El RUNS es global en app.main: sin restos entre tests."""
    RUNS.active = None
    RUNS.runs.clear()
    yield
    RUNS.active = None
    RUNS.runs.clear()


def drain_events(client, run_id):
    events = []
    with client.stream("GET", f"/api/runs/{run_id}/events") as r:
        assert r.status_code == 200
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


def test_analyze_202_and_sse_full_replay(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: make_llm())
    with TestClient(app) as c:
        r = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01", "A03"]})
        assert r.status_code == 202
        run_id = r.json()["runId"]
        ev = drain_events(c, run_id)  # llega tarde: replay completo
    assert ev[0]["type"] == "run:start" and ev[-1]["type"] == "run:done"
    assert "findings" in ev[-1] and "meta" in ev[-1]


def test_409_when_run_active(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: make_llm())
    with TestClient(app) as c:
        assert c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01"]}).status_code == 202
        r = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A03"]})
        assert r.status_code == 409 and r.json()["detail"] == "Ya hay un análisis en curso"


def test_supersede_after_cancel(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: make_llm())
    with TestClient(app) as c:
        first = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01"]}).json()["runId"]
        assert c.post(f"/api/runs/{first}/cancel").json()["ok"] is True
        # M4: el run:cancelled entregado al cliente lleva findings.
        # (El brief lo situaba tras el 2º POST, pero con T4 (task.cancel) + M5 (poda en
        # start) el run ya es terminal y podado antes del 2º POST → el drain daría 404.
        # Aquí se verifica el mismo contrato observable: el último evento del run cancelado.)
        ev_first = drain_events(c, first)
        assert ev_first[-1]["type"] == "run:cancelled" and "findings" in ev_first[-1]
        second = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A03"]})
        assert second.status_code == 202  # supersede (ruling R3)


def test_cancel_in_flight_is_fast(monkeypatch, samples_dir):
    import time as _time
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: make_llm(delay=0.5))
    with TestClient(app) as c:
        run_id = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01", "A03"]}).json()["runId"]
        _time.sleep(0.1)  # el run está en vuelo (LLM fake de 0.5 s)
        assert c.post(f"/api/runs/{run_id}/cancel").json()["ok"] is True
        t0 = _time.monotonic()
        ev = drain_events(c, run_id)  # debe cerrar < 0.3 s después del cancel
        elapsed = _time.monotonic() - t0
    assert elapsed < 0.3  # sin task.cancel sería >= 0.4 s (la llamada en vuelo)
    assert ev[-1]["type"] == "run:cancelled" and "findings" in ev[-1]
    assert not any(e["type"] == "agent:done" and e.get("findingsCount", 0) > 0 for e in ev)
    with TestClient(app) as c2:  # slot libre: un run nuevo arranca al instante
        assert c2.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01"]}).status_code == 202


def test_start_purges_terminal_runs():
    from app.runs import RunRegistry, RunState, RunStatus
    reg = RunRegistry()
    reg.runs["old"] = RunState(id="old", project_id="p", vuln_ids=["A01"], status=RunStatus.DONE)
    new = reg.start("p", ["A01"])
    assert new is not None and "old" not in reg.runs and new.id in reg.runs


def test_unknown_project_404(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    r = TestClient(app).post("/api/analyze", json={"projectId": "nope", "vulnIds": ["A01"]})
    assert r.status_code == 404 and r.json()["detail"] == "Proyecto no encontrado"
