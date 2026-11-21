"""Proyectos por ruta local: registro, listing y análisis (T1 Fase 2b)."""
import json

import pytest
from fastapi.testclient import TestClient

from app.llm import ChatResult
from app.local_projects import LOCAL
from app.main import RUNS, app


def _finding(file="a.js", line=1):
    return {"severity": "high", "title": "ruta sin autorización", "file": file, "line": line,
            "snippet": "s", "exploit": "e", "consequences": "c", "solution": "s"}


class FakeLocalLLM:
    """Fake autocontenido (patrón M7): 1 hallazgo válido para a.js + perfil."""
    model = "qwen3.8-fp8"

    async def chat(self, system, user, max_tokens=8000):
        if "perfilador" in system:
            prof = {"name": "p", "language": "JavaScript", "frameworks": [],
                    "entry_points": [], "description": "p", "notes": ""}
            return ChatResult(content=json.dumps(prof), prompt_tokens=100,
                              completion_tokens=10, elapsed_s=0.1)
        return ChatResult(content=json.dumps([_finding()]), prompt_tokens=100,
                          completion_tokens=5, elapsed_s=0.2)

    async def close(self):
        pass


@pytest.fixture(autouse=True)
def clean_registries():
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    yield
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()


@pytest.fixture
def env_dirs(tmp_path, monkeypatch):
    samples = tmp_path / "samples"
    (samples / "miniapp").mkdir(parents=True)
    (samples / "miniapp" / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    monkeypatch.setenv("SAMPLES_DIR", str(samples))
    return tmp_path


def _drain(client, run_id):
    events = []
    with client.stream("GET", f"/api/runs/{run_id}/events") as r:
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


def test_register_local_and_list(env_dirs):
    code = env_dirs / "mi app (copia)"  # espacios + paréntesis (Review Focus 1)
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        r = c.post("/api/projects/local", json={"path": str(code)})
        assert r.status_code == 201
        p = r.json()["project"]
        assert p["kind"] == "local" and p["name"] == "mi app (copia)"
        assert p["files"] >= 1
        assert p["id"] in [x["id"] for x in c.get("/api/projects").json()]


def test_invalid_paths_400(env_dirs):
    with TestClient(app) as c:
        assert c.post("/api/projects/local", json={"path": "C:/no/existe"}).status_code == 400
        assert c.post("/api/projects/local", json={"path": str(env_dirs / "samples")}).status_code == 400
        assert c.post("/api/projects/local",
                      json={"path": str(env_dirs / "samples" / "miniapp")}).status_code == 400


def test_no_code_files_404(env_dirs):
    empty = env_dirs / "vacio"
    empty.mkdir()
    (empty / "leeme.txt").write_text("hola\n", encoding="utf-8")
    with TestClient(app) as c:
        assert c.post("/api/projects/local", json={"path": str(empty)}).status_code == 404


def test_analyze_local_project(env_dirs, monkeypatch):
    monkeypatch.setattr("app.main.build_llm", lambda: FakeLocalLLM())
    code = env_dirs / "miproy"
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        pid = c.post("/api/projects/local", json={"path": str(code)}).json()["project"]["id"]
        r = c.post("/api/analyze", json={"projectId": pid, "vulnIds": ["A01"]})
        assert r.status_code == 202
        ev = _drain(c, r.json()["runId"])
        assert ev[0]["type"] == "run:start" and ev[-1]["type"] == "run:done"
        assert len(ev[-1]["findings"]) == 1
