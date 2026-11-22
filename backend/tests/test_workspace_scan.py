"""QA-iter 4: al arrancar, escanear los clones existentes de workspace/repos/ y
re-registrarlos en memoria (hoy, tras un restart, desaparecían de la lista hasta
re-añadirlos a mano)."""
import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT, git_list, register_git, scan_workspace
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


def _mk_clone(tmp_path: Path, name: str) -> Path:
    clone = tmp_path / "workspace" / "repos" / name
    clone.mkdir(parents=True)
    (clone / ".git").mkdir()
    (clone / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    return clone


def test_scan_registers_existing_clones(tmp_path):
    clone = _mk_clone(tmp_path, "github.com-x-y-a1b2c3")
    scan_workspace()
    assert "git-github.com-x-y-a1b2c3" in GIT
    assert GIT["git-github.com-x-y-a1b2c3"] == clone
    listed = git_list()
    assert [p.id for p in listed] == ["git-github.com-x-y-a1b2c3"]
    assert listed[0].name == "github.com-x-y"


def test_scan_skips_dirs_sin_git_y_ficheros(tmp_path):
    stray = tmp_path / "workspace" / "repos" / "no-es-un-clon"
    stray.mkdir(parents=True)
    (stray / "a.js").write_text("x", encoding="utf-8")
    (tmp_path / "workspace" / "repos" / "nota.txt").write_text("x", encoding="utf-8")
    scan_workspace()
    assert GIT == {}


def test_scan_sin_carpeta_repos_es_noop(tmp_path):
    (tmp_path / "workspace").mkdir()
    scan_workspace()
    assert GIT == {}


def test_re_register_tras_scan_reutiliza_el_clon(tmp_path, monkeypatch):
    """El pid del escaneo es el mismo que genera register_git para la misma URL:
    re-añadir el repo no reclona ni duplica el registro."""
    calls = {"n": 0}

    def fake_clone(url, dest):
        calls["n"] += 1
        raise AssertionError("no debe reclonarse: el clon ya existía en el workspace")

    monkeypatch.setattr("app.git_projects._git_clone", fake_clone)
    hash6 = hashlib.md5(b"https://github.com/x/y").hexdigest()[:6]
    _mk_clone(tmp_path, f"github.com-x-y-{hash6}")
    scan_workspace()
    assert len(GIT) == 1
    info = register_git("https://github.com/x/y")
    assert calls["n"] == 0  # el clon ya existía: se reutiliza, sin re-clonado
    assert info.id == f"git-github.com-x-y-{hash6}"
    assert len(GIT) == 1


def test_al_arrancar_los_clones_del_workspace_aparecen_en_projects(tmp_path):
    _mk_clone(tmp_path, "github.com-x-y-a1b2c3")
    with TestClient(app) as c:  # lifespan: scan_workspace()
        ids = [p["id"] for p in c.get("/api/projects").json()]
    assert "git-github.com-x-y-a1b2c3" in ids
