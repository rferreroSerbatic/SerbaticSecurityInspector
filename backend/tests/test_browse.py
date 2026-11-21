"""Navegador de carpetas: GET /api/browse (T2 Fase 2b.1)."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT
from app.local_projects import LOCAL
from app.main import app


@pytest.fixture(autouse=True)
def clean_registries():
    LOCAL.clear()
    GIT.clear()
    yield
    LOCAL.clear()
    GIT.clear()


def test_browse_default_home():
    with TestClient(app) as c:
        j = c.get("/api/browse").json()
        assert j["path"] == Path.home().resolve().as_posix()
        assert j["parent"] is not None  # home no es raíz
        assert isinstance(j["folders"], list)


def test_browse_lists_subdirs_sorted_sin_dots_ni_files(tmp_path):
    (tmp_path / "Zeta").mkdir()
    (tmp_path / "alfa").mkdir()
    (tmp_path / ".git").mkdir()
    (tmp_path / "fichero.txt").write_text("x", encoding="utf-8")
    with TestClient(app) as c:
        j = c.get("/api/browse", params={"path": str(tmp_path)}).json()
        assert [f["name"] for f in j["folders"]] == ["alfa", "Zeta"]
        assert all(f["registered"] is None for f in j["folders"])
        assert j["path"] == tmp_path.resolve().as_posix()


def test_browse_400_inexistente_y_no_dir(tmp_path):
    f = tmp_path / "f.txt"
    f.write_text("x", encoding="utf-8")
    with TestClient(app) as c:
        assert c.get("/api/browse", params={"path": str(tmp_path / "noexiste")}).status_code == 400
        assert c.get("/api/browse", params={"path": str(f)}).status_code == 400


def test_browse_parent_nulo_en_raiz():
    with TestClient(app) as c:
        j = c.get("/api/browse", params={"path": "/"}).json()
        assert j["parent"] is None


def test_browse_registered_local_y_git(tmp_path):
    local = tmp_path / "mi app (copia)"  # Review Focus 1: espacios + paréntesis
    local.mkdir()
    (local / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    clone = tmp_path / "clon-repo"
    clone.mkdir()
    (clone / "x.py").write_text("x = 1\n", encoding="utf-8")
    GIT["git-test-abc123"] = clone
    with TestClient(app) as c:
        assert c.post("/api/projects/local", json={"path": str(local)}).status_code == 201
        j = c.get("/api/browse", params={"path": str(tmp_path)}).json()
        reg = {f["name"]: f["registered"] for f in j["folders"]}
        assert reg["mi app (copia)"] == "local"
        assert reg["clon-repo"] == "git"
