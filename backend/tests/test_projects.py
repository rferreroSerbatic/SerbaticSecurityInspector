import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.projects import get_project, list_projects


@pytest.fixture
def samples_dir(tmp_path):
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
    (dvwa / "setup").mkdir()
    (dvwa / "setup" / "zz.php").write_text("<?php\n", encoding="utf-8")
    return tmp_path


def test_lists_both_projects(samples_dir):
    ps = list_projects(samples_dir)
    assert [(p.id, p.files) for p in ps] == [("dvwa", 2), ("miniapp", 2)]


def test_missing_dvwa_is_fine(tmp_path):
    (tmp_path / "miniapp").mkdir()
    (tmp_path / "miniapp" / "a.js").write_text("x\n", encoding="utf-8")
    ps = list_projects(tmp_path)
    assert [p.id for p in ps] == ["miniapp"]


def test_get_project_returns_scan(samples_dir):
    info, scan = get_project(samples_dir, "dvwa")
    assert info.id == "dvwa"
    assert {f.path for f in scan.files} == {"vulnerabilities/sqli/x.php", "vulnerabilities/xss_s/y.php"}


def test_api_projects(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    r = TestClient(app).get("/api/projects")
    assert r.status_code == 200
    assert {p["id"] for p in r.json()} == {"dvwa", "miniapp"}
