"""PDF del alcance (reportlab): generador puro + endpoint de descarga."""
import base64
import re
import zlib

from fastapi.testclient import TestClient

from app.main import app
from app.pdf_report import build_report_pdf, build_scope_pdf


def _scope_content(data: bytes) -> bytes:
    """Stream de contenido del scope PDF descomprimido (ahora hay también el stream del logo)."""
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        try:
            raw = zlib.decompress(base64.a85decode(m.group(1), adobe=True))
        except Exception:
            continue
        if b"Tj" in raw:
            return raw
    raise AssertionError("stream de contenido no encontrado")


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


def test_report_pdf_snippet_no_winansi_se_sustituye():
    """Revisión F3: contenido no-WinAnsi del usuario (CJK/emoji) → «?», no corruption ni crash."""
    f = _finding("A03", 1, title="日本語テスト 🚨", snippet="日本語テスト 日本語 emoji 🚨",
                 solution="日本語")
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"
    assert b"?????? ?" in data     # título/snippet sanitizados a «?»
    assert b"nnnnnn" not in data   # sin la sustitución silenciosa «n» de reportlab


def test_scope_pdf_texto_no_winansi_se_sustituye():
    """Revisión F3: igual para el PDF del alcance (texto + título del usuario)."""
    data = build_scope_pdf("Alcance con CJK: 日本語テスト 🚨", "Título 日本語")
    assert data[:5] == b"%PDF-"
    content = _scope_content(data)
    assert b"?????? ?" in content
    assert b"nnnnnn" not in content


def _drawn_strings(data: bytes) -> bytes:
    """Todas las cadenas dibujadas (operador Tj); en build_report_pdf el contenido va sin comprimir."""
    return b"".join(re.findall(rb"\(((?:[^()\\]|\\.)*)\)\s*Tj", data))


def test_report_pdf_logo_embebido():
    assert b"/Subtype /Image" in build_report_pdf("p", {}, {}, [_finding("A01", 1)])
    assert b"/Subtype /Image" in build_scope_pdf("breve")


def test_report_pdf_51_hallazgos_multipagina():
    findings = [
        _finding(f"A{str(i % 10 + 1).zfill(2)}", i + 1,
                 title=f"Hallazgo de prueba número {i} con texto bastante largo para forzar la paginación")
        for i in range(51)
    ]
    meta = {"files": 162, "lines": 9970, "durationMin": 3.2, "model": "qwen3.8-fp8",
            "totalTokens": 12345, "avgTps": 16.3}
    data = build_report_pdf("dvwa", {"language": "PHP", "frameworks": [], "entry_points": [],
                                      "description": "d"}, meta, findings)
    assert data[:5] == b"%PDF-"
    assert len(re.findall(rb"/Type /Page\b", data)) >= 3


def _rg_colors(data: bytes) -> list[tuple[float, float, float]]:
    return [tuple(map(float, m)) for m in re.findall(rb"([\d.]+) ([\d.]+) ([\d.]+) rg", data)]


def test_report_pdf_barra_leyenda_y_colores_severidad():
    findings = [_finding("A01", i + 1, severity=s)
                for i, s in enumerate(["critical"] * 7 + ["high"] * 25 + ["medium"] * 14 + ["low"] * 5)]
    data = build_report_pdf("dvwa", {}, {}, findings)
    drawn = _drawn_strings(data)
    assert b"7 cr" in drawn      # «7 críticos» (WinAnsi: í = 0xED)
    assert b"25 altos" in drawn
    assert b"14 medios" in drawn
    assert b"5 bajos" in drawn
    got = _rg_colors(data)
    for hx in ("#be185d", "#c2410c", "#a16207", "#0e7490"):
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
        assert any(abs(a - r) < 0.01 and abs(bg - g) < 0.01 and abs(c - b) < 0.01
                   for a, bg, c in got), hx


def test_report_pdf_empty_findings_sin_barra():
    data = build_report_pdf("p", {}, {}, [])
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"cr" not in drawn and b"altos" not in drawn   # sin barra ni leyenda


def test_report_pdf_pie_con_numero_y_marca():
    findings = [_finding("A01", 1)] + [
        _finding(f"A{str(i % 10 + 1).zfill(2)}", i + 1, title="título largo " * 5) for i in range(20)
    ]
    data = build_report_pdf("Mi Proyecto", {}, {}, findings)
    drawn = _drawn_strings(data)
    assert b"Serbatic Security Inspector" in drawn   # pie de las páginas 2+
    # «Página N» (WinAnsi: á = 0xE1). reportlab escribe los bytes >= 0x7F de las
    # cadenas del stream como escape octal: 0xE1 aparece como «\341» en el PDF crudo.
    assert b"P\\341gina" in drawn


def test_report_pdf_snippet_cjk_por_token():
    """Snippet no-WinAnsi con el dibujado por tokens (T3): «?» por pieza, ASCII intacto."""
    f = _finding("A03", 1, snippet="日本語テスト 日本語 emoji 🚨")
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"??????" in drawn      # «日本語テスト» (6) → 6 «?»
    assert b"emoji" in drawn       # el ASCII se conserva
    assert b"nnnnnn" not in data   # sin la sustitución silenciosa «n» de reportlab
