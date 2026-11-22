"""PDF del alcance (reportlab): generador puro + endpoint de descarga."""
import base64
import re
import zlib

from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm

from app.main import app
from app.pdf_report import _MARGIN, _winansi, build_report_pdf, build_scope_pdf


def _scope_content(data: bytes) -> bytes:
    """Stream de contenido del scope PDF (ahora sin comprimir; hay también el stream del logo)."""
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        raw = m.group(1)
        # El stream del logo (a85, termina en ~>) puede contener "Tj" por azar:
        # el de contenido es el único no-a85 (pageCompression=0) con Tj dentro de BT/ET.
        if b"Tj" in raw and b"BT" in raw and not raw.rstrip().endswith(b"~>"):
            return raw
        try:
            dec = zlib.decompress(base64.a85decode(raw, adobe=True))
            if b"Tj" in dec and b"BT" in dec:
                return dec
        except Exception:
            continue
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


def test_endpoint_scope_pdf_filename_con_proyecto():
    """QA-iter 4: el PDF se descarga como alcance-<proyecto>.pdf (misma regla que informe-<proyecto>.pdf)."""
    r = TestClient(app).post(
        "/api/reports/scope-pdf",
        json={"text": "texto de prueba", "projectName": "Mi App (E2E)"},
    )
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="alcance-mi-app-e2e.pdf"'


def test_endpoint_scope_pdf_filename_sin_proyecto():
    """Sin projectName (cliente antiguo) el nombre sigue siendo alcance.pdf."""
    r = TestClient(app).post("/api/reports/scope-pdf", json={"text": "texto de prueba"})
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="alcance.pdf"'


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


# --- Reestilo del PDF de alcance (Fase 2c, G4) ---
def _scope_payload() -> str:
    header = (
        "ALCANCE TÉCNICO DE MEJORA — SEGURIDAD\n"
        "Proyecto: miniapp · 22/11/2026 · Serbatic Security Inspector"
    )
    blocks = [
        "1. EVALUACIÓN INSEGURA (A05 CONFIGURACIÓN INSEGURA) — CRÍTICO\n"
        "Objetivo: eliminar evaluación insegura detectado en app.js.\n"
        "· Revisar la ocurrencia en app.js:1 y aplicar la solución recomendada.\n"
        "· Validar el cambio con una prueba que cubra el caso.\n"
        "Estimación: 4 h · Prioridad: inmediata",
        "2. XSS REFLEJADO (A03 INYECCIÓN) — ALTO\n"
        "Objetivo: eliminar xss reflejado detectado en server.js.\n"
        "· Revisar la ocurrencia en server.js:7 y aplicar la solución recomendada.\n"
        "· Validar el cambio con una prueba que cubra el caso.\n"
        "Estimación: 3 h · Prioridad: alta",
        "3. CABECERAS AUSENTES (A05 CONFIGURACIÓN INSEGURA) — MEDIO\n"
        "Objetivo: eliminar cabeceras ausentes detectado en server.js.\n"
        "· Revisar la ocurrencia en server.js:2 y aplicar la solución recomendada.\n"
        "· Validar el cambio con una prueba que cubra el caso.\n"
        "Estimación: 2 h · Prioridad: media",
    ]
    return header + "\n\n" + "\n\n".join(blocks)


def test_scope_pdf_cards_con_titulos_chips_y_colores_severidad():
    data = build_scope_pdf(_scope_payload())
    assert data[:5] == b"%PDF-"
    assert b"Helvetica-Bold" in data  # títulos de card en negrita (stream sin comprimir)
    drawn = _drawn_strings(data)
    # título de la card 1 (Ó = 0xD3 → escape octal \323)
    assert b"1. EVALUACI\\323N INSEGURA" in drawn
    # chips de severidad (Í = 0xCD → \315; ALTO/MEDIO son ASCII)
    assert b"CR\\315TICO" in drawn
    assert b"ALTO" in drawn
    assert b"MEDIO" in drawn
    # la línea de estimación, entera en una sola cadena dibujada (· = 0xB7 → \267)
    assert b"4 h \\267 Prioridad: inmediata" in drawn
    # colores de los chips (los hex de _SEV)
    got = _rg_colors(data)
    for hx in ("#be185d", "#c2410c", "#a16207"):
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
        assert any(abs(a - r) < 0.01 and abs(bg - g) < 0.01 and abs(cc - b) < 0.01
                   for a, bg, cc in got), hx


def test_scope_pdf_cabecera_centrada_y_subtitulo():
    drawn = _drawn_strings(build_scope_pdf(_scope_payload()))
    # título del documento (É = 0xC9 → \311; — = 0x97 → \227)
    assert b"ALCANCE T\\311CNICO DE MEJORA \\227 SEGURIDAD" in drawn
    assert b"Proyecto: miniapp" in drawn  # subtítulo de la cabecera


def test_scope_pdf_sincabecera_usa_title_del_parametro():
    data = build_scope_pdf(
        "1. COSA (A01) — ALTO\nObjetivo: corregir cosa.\nEstimación: 1 h · Prioridad: baja",
        "Mi Título",
    )
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"Mi T\\355tulo" in drawn  # í = 0xED → \355


def test_scope_pdf_bloque_plano_por_fallback():
    data = build_scope_pdf("ALCANCE\n\nTexto libre editado por el usuario\nque no encaja en el patrón")
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"Texto libre editado por el usuario" in drawn
    assert b"que no encaja en el patr\\363n" in drawn  # ó = 0xF3 → \363


def test_scope_pdf_card_sin_severidad_sin_chip():
    data = build_scope_pdf(
        "ALCANCE\n\n1. TITULO LIBRE (A01)\nObjetivo: cosa.\nEstimación: 1 h · Prioridad: baja"
    )
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    # ( y ) se escapan como \( \) en los strings literales del PDF
    assert b"1. TITULO LIBRE \\(A01\\)" in drawn
    got = _rg_colors(data)
    for hx in ("#be185d", "#c2410c", "#a16207", "#0e7490"):  # sin colores de chip
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
        assert not any(abs(a - r) < 0.01 and abs(bg - g) < 0.01 and abs(cc - b) < 0.01
                       for a, bg, cc in got), hx


def test_scope_pdf_multipagina_y_pie():
    blocks = []
    for i in range(30):
        sev = ("CRÍTICO", "ALTO", "MEDIO", "BAJO")[i % 4]
        blocks.append(
            f"{i + 1}. TÍTULO LARGO DE PRUEBA NÚMERO {i + 1} (A01 INYECCIÓN) — {sev}\n"
            f"Objetivo: eliminar el problema {i + 1} detectado en archivo_{i + 1}.js.\n"
            f"· Revisar la ocurrencia en archivo_{i + 1}.js:{i + 1} y aplicar la solución.\n"
            f"· Validar el cambio con una prueba que cubra el caso del hallazgo.\n"
            f"Estimación: {4 - i % 4} h · Prioridad: alta"
        )
    data = build_scope_pdf("ALCANCE\n\n" + "\n\n".join(blocks))
    assert data[:5] == b"%PDF-"
    assert len(re.findall(rb"/Type /Page\b", data)) >= 2
    drawn = _drawn_strings(data)
    assert b"P\\341gina" in drawn  # «Página N» del pie (páginas 2+)
    assert b"Serbatic Security Inspector" in drawn  # marca en el pie
    # cabecera de páginas 2+ (title param); «técnico» lleva é = 0xE9 → \351
    assert b"Alcance t\\351cnico de mejora" in drawn


# --- R6: relleno completo de la card (fix round 1) ---
# reportlab (pageCompression=0) escribe cada `re` precedido por su color
# `rg`/`RG` (el más cercano por delante).
_BOX_BG_RGB = (0.952941, 0.956863, 0.964706)      # #f3f4f6
_BOX_BORDER_RGB = (0.898039, 0.905882, 0.921569)  # #e5e7eb (paleta real del módulo)


def _scope_content_streams(data: bytes) -> list[bytes]:
    """Streams de contenido por página (pageCompression=0; el logo a85 se excluye como en D1)."""
    out = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        raw = m.group(1)
        if b"Tj" in raw and b"BT" in raw and not raw.rstrip().endswith(b"~>"):
            out.append(raw)
    return out


def _rects_by_color(stream: bytes, rgb: tuple[float, float, float]) -> list[tuple[float, float, float, float, str]]:
    """(x, y, w, h, op) de cada `re` del stream cuyo color más cercano ≈ rgb (tol 0.001).
    ops: f (solo relleno), S (solo trazo), B (relleno + trazo, ej. caja de meta del informe;
    ahí el color relevante es el último `rg`, porque reportlab escribe el `RG` después)."""
    out = []
    for rm in re.finditer(rb"([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re ([fSB])", stream):
        x, y, w, h = (float(v) for v in rm.groups()[:4])
        op = rm.group(5).decode()
        pat = rb"([\d.]+) ([\d.]+) ([\d.]+) rg\b" if op == "B" else rb"([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)"
        cms = list(re.finditer(pat, stream[: rm.start()]))
        if not cms:
            continue
        col = tuple(float(v) for v in cms[-1].groups()[:3])
        if all(abs(a - b) < 0.001 for a, b in zip(col, rgb)):
            out.append((x, y, w, h, op))
    return out


def test_scope_pdf_g1_relleno_coincide_con_el_borde_de_la_card():
    data = build_scope_pdf(
        "ALCANCE\n\n1. COSA (A01) — ALTO\n"
        "Objetivo: corregir cosa.\n"
        "· Revisar la ocurrencia en app.js:1 y aplicar la solución.\n"
        "Estimación: 1 h · Prioridad: baja"
    )
    assert data[:5] == b"%PDF-"
    streams = _scope_content_streams(data)
    assert len(streams) == 1  # 1 página
    stream = streams[0]
    border = _rects_by_color(stream, _BOX_BORDER_RGB)
    assert len(border) == 1 and border[0][4] == "S"  # el borde (S) es único
    bg = _rects_by_color(stream, _BOX_BG_RGB)
    assert bg
    max_width = A4[0] - 2 * _MARGIN
    for x, y, w, h, op in bg:
        assert op == "f"
        assert abs(x - _MARGIN) < 0.05
        assert abs(w - max_width) < 0.05  # R6: el fondo llega al borde derecho (Fix 1)
    bx, by, _bw, bh, _op = border[0]
    ivals = sorted((y, y + h) for _x, y, _w, h, _op in bg)
    assert abs(ivals[0][0] - by) < 0.05            # el primero arranca en el bottom del borde (Fix 3)
    assert abs(ivals[-1][1] - (by + bh)) < 0.05    # el último llega al top del borde (Fix 2)
    for (lo1, hi1), (lo2, _hi2) in zip(ivals, ivals[1:]):
        assert lo2 - hi1 <= 0.05                   # sin huecos entre segmentos consecutivos


def test_scope_pdf_g2_card_partida_contiguo_entre_paginas():
    body = "\n".join(f"· línea {i} de prueba para forzar el salto de página" for i in range(1, 41))
    data = build_scope_pdf(
        "ALCANCE\n\n1. CARD LARGA (A01) — ALTO\nObjetivo: cosa.\n" + body +
        "\nEstimación: 1 h · Prioridad: baja"
    )
    assert data[:5] == b"%PDF-"
    assert len(re.findall(rb"/Type /Page\b", data)) >= 2
    streams = _scope_content_streams(data)
    assert len(streams) >= 2
    max_width = A4[0] - 2 * _MARGIN
    bg1 = _rects_by_color(streams[0], _BOX_BG_RGB)
    bg2 = _rects_by_color(streams[1], _BOX_BG_RGB)
    for bg in (bg1, bg2):
        assert bg
        for x, y, w, h, op in bg:
            assert op == "f"
            assert abs(x - _MARGIN) < 0.05
            assert abs(w - max_width) < 0.05  # R6: ancho completo en ambas páginas (Fix 1)
    ivals1 = sorted((y, y + h) for _x, y, _w, h, _op in bg1)
    assert abs(ivals1[0][0] - _MARGIN) < 0.05  # pág. 1: el más bajo llega al margen inferior
    for (lo1, hi1), (lo2, _hi2) in zip(ivals1, ivals1[1:]):
        assert lo2 - hi1 <= 0.05  # pág. 1: contiguo, sin huecos > 0.05 pt (Fix 4 en el salto)
    top2 = max(y + h for _x, y, _w, h, _op in bg2)
    assert abs(top2 - (A4[1] - _MARGIN)) < 0.05  # pág. 2: el más alto llega al tope (Fix 4)


# --- QA-iter 4: salto de línea entre el chip de severidad y el título ---
def _drawn_triples(data: bytes) -> list[tuple[float, float, bytes]]:
    """(x, y, texto) de cada cadena dibujada: reportlab emite «1 0 0 1 x y Tm (texto) Tj»."""
    return [
        (float(x), float(y), t)
        for x, y, t in re.findall(rb"1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj", data)
    ]


def test_scope_pdf_salto_de_linea_tras_el_chip_de_severidad():
    """Entre el chip (p. ej. «ALTO») y el título de la card debe haber un salto
    de línea: el chip queda fijo al tope de la caja y el título baja una línea."""
    data = build_scope_pdf(
        "ALCANCE\n\n1. TITULO DE PRUEBA (A03 INYECCIÓN) — ALTO\n"
        "Objetivo: corregir cosa.\nEstimación: 1 h · Prioridad: alta"
    )
    assert data[:5] == b"%PDF-"
    triples = _drawn_triples(data)
    chip = [y for _x, y, t in triples if t == b"ALTO"]
    title = [y for _x, y, t in triples if t.startswith(b"1. TITULO DE PRUEBA")]
    assert len(chip) == 1 and len(title) == 1
    assert chip[0] - title[0] > 8 * mm  # pre-fix: 5 mm (chip pegado al título)


# --- QA-iter 5: informe — salto tras chip, aire entre apartados, portada centrada ---

def test_report_pdf_salto_tras_chip_de_severidad():
    """QA-iter 5: entre el chip de severidad y el título del hallazgo debe haber
    un salto de línea (mismo fix que el alcance en QA-iter 4): el título no debe
    caer dentro del rectángulo del chip."""
    f = _finding("A03", 4, title="SQL injection en get_orders()")
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"
    triples = _drawn_triples(data)
    chip = [y for _x, y, t in triples if t == b"CR\\315TICO"]  # «CRÍTICO» (Í = 0xCD)
    title = [y for _x, y, t in triples if t.startswith(b"SQL injection")]
    assert len(chip) == 1 and len(title) == 1
    assert chip[0] - title[0] > 5 * mm  # pre-fix: 2 mm (el título caía dentro del chip)


def test_report_pdf_titulo_principal_centrado():
    """QA-iter 5: el título principal de la portada queda centrado horizontalmente
    (como la portada del alcance), no alineado al margen izquierdo."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    data = build_report_pdf("miniapp", {}, {}, [_finding("A01", 1)])
    assert data[:5] == b"%PDF-"
    triples = _drawn_triples(data)
    # La cabecera de páginas 2+ («Informe de auditoría…», minúscula) no coincide.
    title = [(x, y) for x, y, t in triples if t.startswith(b"INFORME DE AUDITOR")]
    assert len(title) == 1
    x, _y = title[0]
    w = stringWidth("INFORME DE AUDITORÍA DE SEGURIDAD", "Helvetica-Bold", 20)
    assert abs(x - (A4[0] - w) / 2) < 1  # pre-fix: alineado a la izquierda (_MARGIN)


def test_report_pdf_categoria_con_cve_y_enlace_a_su_ficha():
    """QA-iter 6/7: cada categoría del informe muestra su CVE (id real, sin el
    prefijo «representativo») como enlace clicable a su ficha en cve.org, con el
    rectángulo del link pegado al texto (el puntero debe aparecer sobre el texto
    visible, no sobre el aire de la siguiente línea)."""
    f = _finding("A03", 4, title="SQL injection en get_orders()")
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"
    assert b"CVE representativo" not in data  # QA-iter 7: sin prefijo
    drawn = _drawn_strings(data)
    assert b"CVE-2021-44228" in drawn
    assert b"https://www.cve.org/CVERecord?id=CVE-2021-44228" in data
    assert b"/Subtype /Link" in data
    # El rectángulo del link abarca el texto (subrayado incluido), no la línea de abajo.
    triples = _drawn_triples(data)
    y_t = [y for _x, y, t in triples if t == b"CVE-2021-44228"]
    assert len(y_t) == 1
    rect = re.search(rb"/Rect\s*[\(\[]\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*[\)\]]", data)
    assert rect is not None
    _x1, y1, _x2, y2 = (float(g) for g in rect.groups())
    assert abs(y1 - (y_t[0] - 1.2 * mm)) < 1  # borde inferior: justo bajo el subrayado
    assert abs(y2 - (y_t[0] + 2.4 * mm)) < 1  # borde superior: justo bajo el cuerpo


def test_report_pdf_caja_de_meta_centrada_sobre_su_fondo():
    """QA-iter 7: las líneas de la caja de datos de la portada quedan centradas
    verticalmente sobre su fondo gris (pre-fix: el texto apretado al tope y ~6 mm
    de fondo vacío en la base de la caja)."""
    meta = {"files": 13, "lines": 233, "durationMin": 1, "model": "qwen3.8-fp8",
            "totalTokens": 2487, "avgTps": 77.3}
    data = build_report_pdf("p", {}, meta, [])
    assert data[:5] == b"%PDF-"
    streams = _scope_content_streams(data)
    assert len(streams) == 1
    box = _rects_by_color(streams[0], _BOX_BG_RGB)
    assert len(box) == 1
    _bx, box_y, _bw, box_h, box_op = box[0]
    assert box_op == "B"  # relleno + trazo
    triples = _drawn_triples(data)
    first = [y for _x, y, t in triples if t == b"Archivos: 13"]
    last = [y for _x, y, t in triples if t.startswith(b"Velocidad media \\(")]
    assert len(first) == 1 and len(last) == 1
    _ASC, _DESC = 7.18, 2.07  # ascensor/descensor de Helvetica 10 pt (en pt)
    top_gap = (box_y + box_h) - (first[0] + _ASC)
    bottom_gap = (last[0] - _DESC) - box_y
    assert abs(top_gap - bottom_gap) < 1 * mm  # pre-fix: ~20 pt de diferencia


def test_report_pdf_el_mapeo_de_cves_cubre_las_10_categorias():
    from app.pdf_report import VULN_CVES, VULN_NAMES
    assert set(VULN_CVES) == set(VULN_NAMES)


def test_report_pdf_aire_entre_apartados():
    """QA-iter 5: más aire entre apartados: la distancia de la portada (fecha) al
    primer título de sección crece (gap 8 mm → 12 mm)."""
    from datetime import date as _date
    data = build_report_pdf("miniapp", {}, {}, [])
    assert data[:5] == b"%PDF-"
    triples = _drawn_triples(data)
    date_y = [y for _x, y, t in triples if t == _date.today().isoformat().encode()]
    perfil_y = [y for _x, y, t in triples if t == b"PERFIL DEL PROYECTO"]
    assert len(date_y) == 1 and len(perfil_y) == 1
    # pre-fix: 5.2 (línea) + 8 (gap) = 13.2 mm
    assert date_y[0] - perfil_y[0] > 15 * mm


# --- Task 4 (Fase 2d): bloque GUÍA DE EXPLOTACIÓN por hallazgo ---

GUIDE = (
    "## RESUMEN\nEl parámetro user se concatena directamente en la query.\n\n"
    "## PASOS\n1. Llamar a GET /api/orders?user=1 OR 1=1--\n\n"
    "## PAYLOAD DE EJEMPLO\n```\nuser=1 OR 1=1--\n```\n\n"
    "## IMPACTO EN ESTE PROYECTO\nExposición completa de la tabla orders.\n"
)


def _b(s: str) -> bytes:
    r"""La cadena tal y como aparece en el stream del PDF (pageCompression=0):
    reportlab serializa las strings WinAnsi escapando los bytes < 32 o >= 127
    como octal de 3 dígitos y contrabarra/paréntesis con backslash (misma
    regla que _ESCAPEDICT; ver los literales b"P\341gina" / b"CR\315TICO"
    de este fichero)."""
    out = bytearray()
    for byte in _winansi(s).encode("cp1252"):
        if byte < 32 or byte >= 0x7F:
            out += b"\\%03o" % byte
        elif byte in (0x5C, 0x28, 0x29):
            out += b"\\" + bytes((byte,))
        else:
            out.append(byte)
    return bytes(out)


def test_report_pdf_con_guide_dibuja_bloque():
    data = build_report_pdf("miniapp", {}, {"files": 1, "lines": 10, "durationMin": 1},
                            [_finding("A03", 4, guide=GUIDE)])
    assert _b("GUÍA DE EXPLOTACIÓN:") in data
    assert _b("RESUMEN") in data
    assert _b("user=1 OR 1=1--") in data
    assert data.index(_b("SOLUCIÓN:")) < data.index(_b("GUÍA DE EXPLOTACIÓN:"))


def test_report_pdf_sin_guide_no_bloque():
    data = build_report_pdf("miniapp", {}, {}, [_finding("A03", 4)])
    assert _b("GUÍA DE EXPLOTACIÓN:") not in data


def test_report_pdf_guide_larga_pagina_sin_crash():
    """Review Focus 1: una guía de cientos de líneas pagina sin romperse."""
    guide = "## RESUMEN\n" + "paso " * 80 + "\n" + "\n".join(f"línea {i}" for i in range(400))
    data = build_report_pdf("miniapp", {}, {}, [_finding("A03", 4, guide=guide)])
    assert data[:5] == b"%PDF-"
    assert _b("GUÍA DE EXPLOTACIÓN:") in data


def test_report_pdf_guide_caracteres_fuera_winansi():
    """Review Focus 2: flechas/emoji → «?» vía _winansi, sin excepción."""
    data = build_report_pdf("miniapp", {}, {},
                            [_finding("A03", 4, guide="## RESUMEN\nataque → listo 🔒")])
    assert data[:5] == b"%PDF-"
    assert _b("GUÍA DE EXPLOTACIÓN:") in data
