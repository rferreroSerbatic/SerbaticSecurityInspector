"""DELETE /api/projects/{id}: local (solo desregistra), git (borra el clon), samples, run en curso."""
import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT
from app.local_projects import LOCAL
from app.main import RUNS, app


@pytest.fixture(autouse=True)
def clean_registries():
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()
    yield
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()


@pytest.fixture
def env_dirs(tmp_path, monkeypatch):
    samples = tmp_path / "samples"
    (samples / "miniapp").mkdir(parents=True)
    (samples / "miniapp" / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    monkeypatch.setenv("SAMPLES_DIR", str(samples))
    return tmp_path


def test_delete_local_project_desregistra_y_no_toca_archivos(env_dirs):
    code = env_dirs / "mi app"
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        pid = c.post("/api/projects/local", json={"path": str(code)}).json()["project"]["id"]
        r = c.delete(f"/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "kind": "local"}
        assert (code / "a.js").exists()  # los archivos del usuario siguen íntegros
        assert (code / "a.js").read_text(encoding="utf-8") == "const a = 1;\n"
        assert pid not in [p["id"] for p in c.get("/api/projects").json()]


def test_delete_git_project_borra_el_clon(env_dirs):
    clone = env_dirs / "workspace" / "repos" / "github.com-x-y-a1b2c3"
    clone.mkdir(parents=True)
    (clone / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    GIT["git-x-y-a1b2c3"] = clone
    with TestClient(app) as c:
        r = c.delete("/api/projects/git-x-y-a1b2c3")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "kind": "git"}
        assert not clone.exists()  # el clon del workspace se borra entero
        assert "git-x-y-a1b2c3" not in [p["id"] for p in c.get("/api/projects").json()]


def test_delete_sample_409(env_dirs):
    with TestClient(app) as c:
        r = c.delete("/api/projects/miniapp")
        assert r.status_code == 409
        assert "ejemplo" in r.json()["detail"]


def test_delete_unknown_404(env_dirs):
    with TestClient(app) as c:
        assert c.delete("/api/projects/nope").status_code == 404


def test_delete_while_running_409(env_dirs):
    code = env_dirs / "miproy"
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        pid = c.post("/api/projects/local", json={"path": str(code)}).json()["project"]["id"]
        run = RUNS.start(pid, ["A01"])
        assert run is not None  # run RUNNING sobre este proyecto
        assert c.delete(f"/api/projects/{pid}").status_code == 409
        assert pid in LOCAL  # sigue registrado
        RUNS.active = None  # cleanup (el fixture autouse también limpia)


def test_delete_git_project_clon_inexistente_200(env_dirs):
    # Clon borrado a mano con el proyecto aún registrado: el desregistro basta.
    # rmtree sobre path inexistente levanta FileNotFoundError → 500 (fix wave).
    GIT["git-x-y-a7b8c9"] = env_dirs / "workspace" / "repos" / "github.com-x-y-a7b8c9"  # NO existe
    with TestClient(app) as c:
        r = c.delete("/api/projects/git-x-y-a7b8c9")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "kind": "git"}


def test_delete_git_project_con_packs_readonly(env_dirs):
    # git-for-windows deja los packs read-only; rmtree debe limpiar el bit (E2E 2c).
    import os
    import stat

    clone = env_dirs / "workspace" / "repos" / "github.com-x-y-d4e5f6"
    packdir = clone / ".git" / "objects" / "pack"
    packdir.mkdir(parents=True)
    (clone / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    for name in ("pack-deadbeef.pack", "pack-deadbeef.idx", "pack-deadbeef.rev"):
        f = packdir / name
        f.write_bytes(b"\x00" * 8)
        os.chmod(f, stat.S_IREAD)  # atributo read-only real en NTFS
    GIT["git-x-y-d4e5f6"] = clone
    with TestClient(app) as c:
        r = c.delete("/api/projects/git-x-y-d4e5f6")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "kind": "git"}
        assert not clone.exists()  # los packs read-only no pueden sobrevivir
