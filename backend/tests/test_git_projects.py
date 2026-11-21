"""Proyectos por repo git: normalización, slug, clonado (mock) y registro (T2 Fase 2b)."""
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT, git_slug, normalize_git_url
from app.llm import ChatResult
from app.local_projects import LOCAL
from app.main import RUNS, app


@pytest.fixture(autouse=True)
def clean_registries(monkeypatch, tmp_path):
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()
    monkeypatch.setattr("app.git_projects.WORKSPACE", tmp_path / "workspace")
    samples = tmp_path / "samples"
    samples.mkdir()
    monkeypatch.setenv("SAMPLES_DIR", str(samples))
    yield
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()


def _finding(file="a.js", line=1):
    return {"severity": "high", "title": "ruta sin autorización", "file": file, "line": line,
            "snippet": "s", "exploit": "e", "consequences": "c", "solution": "s"}


class FakeGitLLM:
    """Fake autocontenido (misma forma que el de test_local_projects.py, sin imports cruzados)."""
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


def _drain(client, run_id):
    events = []
    with client.stream("GET", f"/api/runs/{run_id}/events") as r:
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


@pytest.fixture
def seed_repo(tmp_path):
    seed = tmp_path / "seed"
    seed.mkdir()
    (seed / "a.js").write_text("console.log(1);\n", encoding="utf-8")
    (seed / "src").mkdir()
    (seed / "src" / "app.js").write_text("const x = 1;\n", encoding="utf-8")
    return seed


def test_normalize_git_url():
    assert normalize_git_url("github.com/u/r") == "https://github.com/u/r"
    assert normalize_git_url("https://github.com/u/r.git/") == "https://github.com/u/r.git/"
    assert normalize_git_url("http://x:8080/u/r") == "http://x:8080/u/r"
    assert normalize_git_url("ftp://x/y") is None
    assert normalize_git_url("git@github.com:u/r.git") is None
    assert normalize_git_url("https://") is None
    assert normalize_git_url("") is None


def test_git_slug():
    assert git_slug("https://github.com/digininja/DVWA") == "github.com-digininja-dvwa"
    assert git_slug("https://github.com/digininja/DVWA.git/") == "github.com-digininja-dvwa"


def test_register_git_flow(seed_repo, monkeypatch):
    calls = {"n": 0}

    def fake_clone(url, dest):
        calls["n"] += 1
        shutil.copytree(seed_repo, dest)

    monkeypatch.setattr("app.git_projects._git_clone", fake_clone)
    with TestClient(app) as c:
        r = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"})
        assert r.status_code == 201
        p = r.json()["project"]
        assert p["kind"] == "git" and p["name"] == "test.local-org-repo"
        assert c.post("/api/projects/git", json={"url": "https://test.local/org/repo"}).status_code == 201
        assert calls["n"] == 1  # reuse del clon (Review Focus 3)


def test_register_git_bad_url_400():
    with TestClient(app) as c:
        assert c.post("/api/projects/git", json={"url": "ftp://x/y"}).status_code == 400
        assert c.post("/api/projects/git", json={"url": "git@github.com:u/r.git"}).status_code == 400


def test_register_git_clone_fails_502(seed_repo, monkeypatch):
    from app.git_projects import GitCloneError

    def boom(url, dest):
        raise GitCloneError("boom")

    monkeypatch.setattr("app.git_projects._git_clone", boom)
    with TestClient(app) as c:
        assert c.post("/api/projects/git", json={"url": "https://test.local/x"}).status_code == 502


def test_register_git_timeout_partial_dir_retry_reclones(seed_repo, monkeypatch):
    from app.git_projects import GitCloneError

    calls = {"n": 0}

    def flaky_clone(url, dest):
        calls["n"] += 1
        if calls["n"] == 1:
            # clonado matado a mitad (timeout): deja un directorio a medias
            dest.mkdir(parents=True, exist_ok=True)
            (dest / "partial.js").write_text("incompleto\n", encoding="utf-8")
            raise GitCloneError("timeout")
        shutil.copytree(seed_repo, dest)

    monkeypatch.setattr("app.git_projects._git_clone", flaky_clone)
    with TestClient(app) as c:
        r1 = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"})
        assert r1.status_code == 502
        r2 = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"})
        assert r2.status_code == 201
        assert calls["n"] == 2  # el reintento reclonó (I1)
        assert r2.json()["project"]["files"] == 2  # archivos del seed, no el partial.js


def test_slug_collision_produces_distinct_clones(seed_repo, monkeypatch):
    def clone(url, dest):
        shutil.copytree(seed_repo, dest)
        marker = "repo_one.js" if url.rstrip("/").endswith("/repo") else "repo_two.js"
        (dest / marker).write_text("x = 1;\n", encoding="utf-8")

    monkeypatch.setattr("app.git_projects._git_clone", clone)
    with TestClient(app) as c:
        p1 = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"}).json()["project"]
        p2 = c.post("/api/projects/git", json={"url": "https://test.local/org-repo"}).json()["project"]
        assert p1["id"] != p2["id"] and p1["path"] != p2["path"]
        assert p1["files"] == 3 and p2["files"] == 3
        listed = {x["id"]: x for x in c.get("/api/projects").json()}
        assert p1["id"] in listed and p2["id"] in listed
        # cada clon tiene su propio contenido (no se sirve el clon equivocado)
        assert (Path(p1["path"]) / "repo_one.js").is_file()
        assert (Path(p2["path"]) / "repo_two.js").is_file()
        assert not (Path(p1["path"]) / "repo_two.js").exists()
        assert not (Path(p2["path"]) / "repo_one.js").exists()


def test_get_projects_includes_git_entry(seed_repo, monkeypatch):
    monkeypatch.setattr("app.git_projects._git_clone", lambda u, d: shutil.copytree(seed_repo, d))
    with TestClient(app) as c:
        c.post("/api/projects/git", json={"url": "https://test.local/org/repo"})
        git_entries = [x for x in c.get("/api/projects").json() if x["id"].startswith("git-")]
        assert len(git_entries) == 1
        assert git_entries[0]["kind"] == "git"


def test_analyze_git_project_resolves_and_runs(seed_repo, monkeypatch):
    monkeypatch.setattr("app.git_projects._git_clone", lambda u, d: shutil.copytree(seed_repo, d))
    monkeypatch.setattr("app.main.build_llm", lambda: FakeGitLLM())
    with TestClient(app) as c:
        pid = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"}).json()["project"]["id"]
        r = c.post("/api/analyze", json={"projectId": pid, "vulnIds": ["A01"]})
        assert r.status_code == 202
        ev = _drain(c, r.json()["runId"])
        assert ev[0]["type"] == "run:start" and ev[-1]["type"] == "run:done"
        assert len(ev[-1]["findings"]) == 1
        assert ev[-1]["findings"][0]["file"] == "a.js" and ev[-1]["findings"][0]["line"] == 1


def test_local_register_of_clone_root_400_but_subpath_ok(seed_repo, monkeypatch):
    monkeypatch.setattr("app.git_projects._git_clone", lambda u, d: shutil.copytree(seed_repo, d))
    with TestClient(app) as c:
        p = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"}).json()["project"]
        # raíz del clon ya listada → 400 (Review Focus 3)
        assert c.post("/api/projects/local", json={"path": p["path"]}).status_code == 400
        # pero una SUBcarpeta del clon sí (ruling Q3)
        assert c.post("/api/projects/local", json={"path": str(Path(p["path"]) / "src")}).status_code == 201
