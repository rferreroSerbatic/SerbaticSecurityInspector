"""PDF del alcance (reportlab): generador puro + endpoint de descarga."""

from fastapi.testclient import TestClient

from app.main import app
from app.pdf_report import build_scope_pdf


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
