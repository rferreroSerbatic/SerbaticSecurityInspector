"""PDF del alcance (reportlab): generador puro + endpoint de descarga."""

from fastapi.testclient import TestClient

from app.main import app
from app.pdf_report import build_report_pdf, build_scope_pdf


def test_build_scope_pdf_devuelve_pdf():
    data = build_scope_pdf("Hola mundo\nsegunda línea con acentos: á é í ó ú ñ", "Título de prueba")
    assert data[:5] == b"%PDF-"
    assert len(data) > 500


def test_build_scope_pdf_texto_mas_largo_pdf_mas_grande():
    corto = build_scope_pdf("breve")
    largo = build_scope_pdf("palabra " * 400)
    assert len(largo) > len(corto)


def test_endpoint_scope_pdf():
    r = TestClient(app).post(
        "/api/reports/scope-pdf",
        json={"text": "texto de prueba del alcance", "title": "Alcance"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"]
    assert r.content[:5] == b"%PDF-"


def _finding(fv, line, **kw):
    base = {"id": f"{fv}-1", "vulnId": fv, "severity": "critical", "title": "t",
            "file": "a.js", "line": line, "snippet": "s", "exploit": "e",
            "consequences": "c", "solution": "s"}
    base.update(kw)
    return base


def test_report_pdf_cover_and_category_order():
    data = build_report_pdf("miniapp", {"language": "JavaScript", "frameworks": [],
                                        "entry_points": [], "description": "d"},
                            {"files": 3, "lines": 10, "durationMin": 1},
                            [_finding("A03", 4), _finding("A01", 7)])
    assert data[:5] == b"%PDF-"
    assert b"miniapp" in data
    assert data.index(b"A01") < data.index(b"A03")  # orden canónico


def test_report_pdf_empty_findings_ok():
    data = build_report_pdf("p", {}, {}, [])
    assert data[:5] == b"%PDF-"


def test_report_pdf_long_unbreakable_snippet():
    f = _finding("A02", 1, snippet="x" * 5000, title="ñ" * 100)  # Review Focus 5
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"


def test_report_pdf_also_categories_line():
    f = _finding("A03", 1, alsoCategories=["A05"])
    data = build_report_pdf("p", {}, {}, [f])
    assert b"Tambi" in data and b"A05" in data  # «También…» sin acentos en la aserción


def test_full_pdf_endpoint():
    r = TestClient(app).post("/api/reports/full-pdf", json={
        "projectName": "Mi Proyecto", "profile": {"language": "JS"},
        "meta": {"files": 1}, "findings": [_finding("A01", 1)]})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == 'attachment; filename="informe-mi-proyecto.pdf"'
    assert r.content[:5] == b"%PDF-"
