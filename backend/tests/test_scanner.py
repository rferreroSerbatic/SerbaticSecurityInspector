import pytest

from app.scanner import MAX_FILE_BYTES, scan_project


@pytest.fixture
def proj(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.js").write_text("line1\nline2\n", encoding="utf-8")
    (tmp_path / "b.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "x.js").write_text("x\n", encoding="utf-8")
    (tmp_path / "package.json").write_text('{"name": "proj", "version": "1.0.0"}\n', encoding="utf-8")
    (tmp_path / "big.js").write_text("a" * (MAX_FILE_BYTES + 1), encoding="utf-8")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "c.ts").write_text("let x = 0\n", encoding="utf-8")
    return tmp_path


def test_scans_code_and_manifests(proj):
    r = scan_project(proj, ["."])
    assert {f.path for f in r.files} == {"src/a.js", "b.py", "sub/c.ts"}
    assert [m.path for m in r.manifests] == ["package.json"]
    assert r.all_paths == {"src/a.js", "b.py", "sub/c.ts", "package.json"}
    assert r.total_chars == len("line1\nline2\n") + len("x = 1\n") + len("let x = 0\n")


def test_scope_limits_files(proj):
    r = scan_project(proj, ["sub"])
    assert [f.path for f in r.files] == ["sub/c.ts"]
