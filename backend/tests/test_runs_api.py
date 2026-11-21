"""API de análisis: POST /api/analyze, SSE con replay, cancel y supersede (ruling R3)."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import RUNS, app
from test_pipeline import FakeVulnLLM

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
        second = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A03"]})
        assert second.status_code == 202  # supersede (ruling R3)


def test_unknown_project_404(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    r = TestClient(app).post("/api/analyze", json={"projectId": "nope", "vulnIds": ["A01"]})
    assert r.status_code == 404 and r.json()["detail"] == "Proyecto no encontrado"
