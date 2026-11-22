"""Generación de PDFs (reportlab): alcance técnico e informe completo.

Tema claro para cliente (G3): portada con marca (logo), jerarquía
tipográfica, severidades en color, barra de distribución de hallazgos
con leyenda, resaltado de sintaxis de snippets con pygments y, a
partir de la página 2, cabecera y pie con numeración y marca.

Las fuentes estándar de reportlab usan WinAnsiEncoding, que cubre el
acentuado español (por eso no hay emojis en el layout). El contenido de
usuario (títulos, snippets, textos de alcance) se sanea a WinAnsi antes
de dibujar: lo no representable pasa a «?».
"""

from __future__ import annotations

import io
import os
import re
from collections.abc import Callable
from datetime import date
from pathlib import Path

from pygments.lexers import get_lexer_for_filename, TextLexer
from pygments.token import Token
from pygments.util import ClassNotFound
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as _canvas

from app.pipeline import SEVERITY_ES

_MARGIN = 20 * mm
_LEADING = 5.2 * mm
_TEXT_SIZE = 10
_SECTION_SIZE = 12
_SNIPPET_FONT = "Courier"
_SNIPPET_SIZE = 8

# Tema claro para cliente (G3): legible sobre blanco, imprimible, coherente con la marca.
_TXT = HexColor("#1f2937")
_TXT_SEC = HexColor("#6b7280")
_ACCENT = HexColor("#0891b2")
_SEV: dict[str, HexColor] = {
    "critical": HexColor("#be185d"),
    "high": HexColor("#c2410c"),
    "medium": HexColor("#a16207"),
    "low": HexColor("#0e7490"),
}
_SEV_ORDER = ("critical", "high", "medium", "low")
_SEV_LEGEND: dict[str, str] = {"critical": "críticos", "high": "altos", "medium": "medios", "low": "bajos"}
_BOX_BG = HexColor("#f3f4f6")
_BOX_BORDER = HexColor("#e5e7eb")
_WHITE = HexColor("#ffffff")
_LOGO = Path(__file__).resolve().parents[2] / "assets" / "serbatic-logo.png"
_LOGO_W = 45 * mm
_LOGO_H = 45 * mm * 237 / 757   # ratio 757×237
_CODE_PAD = 3 * mm
_CODE_LINE_H = 4.0 * mm
_LEGEND_DOT_R = 0.9 * mm

# Nombres de las 10 categorías OWASP, idénticos byte a byte a src/data/owasp.ts.
VULN_NAMES: dict[str, str] = {
    "A01": "Fallos de control de acceso",
    "A02": "Fallos criptográficos",
    "A03": "Inyección",
    "A04": "Diseño inseguro",
    "A05": "Configuración insegura",
    "A06": "Componentes vulnerables u obsoletos",
    "A07": "Identificación y autenticación",
    "A08": "Integridad del software",
    "A09": "Registro y monitorización",
    "A10": "Suplantición de servidor (SSRF)",
}

# QA-iter 6: CVE representativo de cada categoría (idéntico byte a byte a
# src/data/owasp.ts; verificado contra la API oficial del CVE el 2026-11-22).
VULN_CVES: dict[str, str] = {
    "A01": "CVE-2024-38816",  # Spring Framework: path traversal
    "A02": "CVE-2014-0160",   # OpenSSL: Heartbleed
    "A03": "CVE-2021-44228",  # Log4Shell (Apache Log4j2)
    "A04": "CVE-2020-1472",   # Zerologon (MS-NRPC)
    "A05": "CVE-2020-1938",   # Apache Tomcat AJP («Ghostcat»)
    "A06": "CVE-2021-45046",  # Apache Log4j 2.15.0 (fix incompleto)
    "A07": "CVE-2019-11510",  # Pulse Secure (sin autenticación)
    "A08": "CVE-2024-3094",   # XZ Utils (cadena de suministro)
    "A09": "CVE-2019-8123",   # Magento (registro y monitorización)
    "A10": "CVE-2023-44256",  # Fortinet (SSRF, CWE-918)
}

# Clave de ``meta`` → etiqueta de la portada (solo se imprime si la clave existe).
_META_LABELS: tuple[tuple[str, str], ...] = (
    ("files", "Archivos"),
    ("lines", "Líneas"),
    ("durationMin", "Duración (min)"),
    ("model", "Modelo"),
    ("totalTokens", "Tokens totales"),
    ("avgTps", "Velocidad media (tk/s)"),
)


def _winansi(text: str) -> str:
    """Las fuentes estándar solo cubren WinAnsi: lo no representable pasa a «?»."""
    return text.encode("cp1252", "replace").decode("cp1252")


def _wrap_lines(c, text: str, font: str, size: float, max_width: float) -> list[str]:
    """Rompela el texto en líneas que caben en ``max_width`` (conserva saltos de línea)."""
    lines: list[str] = []
    for raw in text.split("\n"):
        current = ""
        for word in raw.split(" "):
            trial = f"{current} {word}".strip()
            if c.stringWidth(trial, font, size) <= max_width:
                current = trial
                continue
            if current:
                lines.append(current)
            # Palabra más ancha que la línea: corte duro (no ocurre en textos normales).
            while word and c.stringWidth(word, font, size) > max_width:
                lo, hi = 1, len(word)
                while lo < hi:
                    mid = (lo + hi + 1) // 2
                    if c.stringWidth(word[:mid], font, size) <= max_width:
                        lo = mid
                    else:
                        hi = mid - 1
                lines.append(word[:lo])
                word = word[lo:]
            current = word
        lines.append(current)
    return lines


# Resaltado de sintaxis (pygments) sobre las paletas del tema claro.
_TOKEN_COLORS: dict = {
    Token: "#1f2937",                  # texto base
    Token.Comment: "#6b7280",          # comentarios: gris secundario
    Token.Comment.Preproc: "#a16207",  # directivas (#include, etc.)
    Token.Keyword: "#0e7490",          # palabras clave: cian oscuro de marca
    Token.Name.Builtin: "#0e7490",
    Token.Name.Function: "#be185d",    # funciones: magenta oscuro de marca
    Token.Name.Class: "#c2410c",       # clases: naranja quemado
    Token.Literal.String: "#a16207",   # cadenas: ámbar oscuro
    Token.Literal.String.Doc: "#6b7280",
    Token.Literal.Number: "#166534",   # números: verde oscuro
    Token.Operator: "#6b7280",
    Token.Punctuation: "#1f2937",
    Token.Error: "#be185d",
    Token.Generic.Deleted: "#be185d",
    Token.Generic.Inserted: "#166534",
    Token.Generic.Error: "#be185d",
}


def _token_color(ttype) -> str:
    """Color del token: sube por la jerarquía de pygments hasta un color conocido."""
    t = ttype
    while t is not None:
        if t in _TOKEN_COLORS:
            return _TOKEN_COLORS[t]
        t = t.parent
    return _TOKEN_COLORS[Token]


_CODE_WORD_RE = re.compile(r"[^\s]+|\n|[ \t]+")


def _code_lines(c, code: str, file_name: str, max_width: float) -> list[list[tuple[str, str]]]:
    """Tokeniza ``code`` (lexer por extensión del archivo, fallback ``TextLexer``) y agrupa
    las piezas ``(texto, color_hex)`` en líneas que caben en ``max_width``.

    - Cada pieza se sanea a WinAnsi (``_winansi``) antes de medir/dibujar.
    - El ``\n`` de la pieza rompe la línea forzosamente.
    - Piezas más anchas que la línea: corte duro con la misma búsqueda binaria que ``_wrap_lines``.
    """
    base = _TOKEN_COLORS[Token]
    words: list[tuple[str, str]] = []
    try:
        lexer = get_lexer_for_filename(os.path.basename(file_name), stripnl=False)
    except ClassNotFound:
        lexer = TextLexer(stripnl=False)
    for ttype, value in lexer.get_tokens(code):
        color = _token_color(ttype)
        for m in _CODE_WORD_RE.finditer(value):
            piece = _winansi(m.group(0))
            words.append((piece, base if piece.isspace() else color))
    lines: list[list[tuple[str, str]]] = []
    cur: list[tuple[str, str]] = []
    cur_w = 0.0
    for text, color in words:
        if text == "\n":
            lines.append(cur)
            cur, cur_w = [], 0.0
            continue
        w = c.stringWidth(text, _SNIPPET_FONT, _SNIPPET_SIZE)
        if cur and cur_w + w > max_width:
            lines.append(cur)
            cur, cur_w = [], 0.0
        while w > max_width:  # corte duro de pieza insoslayable
            if cur:  # sin esta guarda, un corte al inicio crearía una línea vacía
                lines.append(cur)
                cur, cur_w = [], 0.0
            lo, hi = 1, len(text)
            while lo < hi:
                mid = (lo + hi + 1) // 2
                if c.stringWidth(text[:mid], _SNIPPET_FONT, _SNIPPET_SIZE) <= max_width:
                    lo = mid
                else:
                    hi = mid - 1
            lines.append([(text[:lo], color)])
            cur, cur_w = [], 0.0
            text = text[lo:]
            w = c.stringWidth(text, _SNIPPET_FONT, _SNIPPET_SIZE)
        cur.append((text, color))
        cur_w += w
    if cur:
        lines.append(cur)
    return lines


def _draw_logo(c, y: float) -> None:
    """Logo de marca con su transparencia (SMask; sin «auto» reportlab aplastaría
    el canal alfa sobre negro)."""
    c.drawImage(str(_LOGO), _MARGIN, y - _LOGO_H, width=_LOGO_W, height=_LOGO_H, mask="auto")


# --- Reestilo del PDF de alcance (Fase 2c, G4) ---
# Primera línea de card: «N. TÍTULO (VULN) — SEVERIDAD» (severidad opcional).
_CARD_RE = re.compile(r"^(\d+)\.\s+(.+?)(?:\s+—\s+(CRÍTICO|ALTO|MEDIO|BAJO))?$")
_SEV_WORD = {"CRÍTICO": "critical", "ALTO": "high", "MEDIO": "medium", "BAJO": "low"}
_SEV_WORD_ES = {v: k for k, v in _SEV_WORD.items()}

_CARD_PAD = 4 * mm
_CARD_BAR = 1.6 * mm
_CARD_TITLE_H = 6.2 * mm
_CARD_CHIP_H = 7 * mm
_CARD_EST_H = 5.5 * mm
_CARD_GAP = 4 * mm


def _parse_scope_text(text: str) -> tuple[list[str], list[dict]]:
    """Parsea el texto del alcance en (cabecera, bloques).

    - Cabecera: el primer bloque, si tiene ≤ 2 líneas y su primera línea no es
      una card numerada (línea 1 = título, línea 2 = subtítulo).
    - Card: primera línea ``N. TÍTULO (VULN) — SEVERIDAD`` + líneas de cuerpo.
    - Plano: cualquier otro bloque (texto editado por el usuario) → párrafo.
    """
    raw = [b for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    blocks: list[dict] = []
    start = 0
    header: list[str] = []
    if raw:
        first = [ln for ln in raw[0].split("\n") if ln.strip()]
        if len(first) <= 2 and not _CARD_RE.match(first[0].strip()):
            header = first
            start = 1
    for blk in raw[start:]:
        lines = [ln.strip() for ln in blk.split("\n") if ln.strip()]
        m = _CARD_RE.match(lines[0])
        if m:
            blocks.append({
                "kind": "card",
                "num": m.group(1),
                "title": m.group(2).strip(),
                "severity": _SEV_WORD.get(m.group(3) or ""),
                "body": lines[1:],
            })
        else:
            blocks.append({"kind": "plain", "body": lines})
    return header, blocks


def build_scope_pdf(text: str, title: str = "Alcance técnico de mejora") -> bytes:
    """Devuelve los bytes de un PDF A4 del alcance con layout estructurado (G4 2c).

    El texto plano del usuario es la fuente: lo reconocible se estila
    (cabecera centrada, cajas con chip de severidad a color y barra de
    acento, línea de estimación con filete) y lo que no encaja se imprime
    como párrafo plano (fallback gracioso). ``pageCompression=0``: los
    tests inspeccionan los bytes.
    """
    buf = io.BytesIO()
    width, height = A4
    max_width = width - 2 * _MARGIN
    c = _canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    y = height - _MARGIN

    def page_deco(cnv) -> None:
        """Páginas 2+: cabecera (title, izquierda) + pie («Página N» + marca)."""
        cnv.saveState()
        cnv.setFont("Helvetica", 8)
        cnv.setFillColor(_TXT_SEC)
        cnv.drawString(_MARGIN, height - 12 * mm, _winansi(title))
        cnv.drawString(_MARGIN, 10 * mm, _winansi(f"Página {cnv.getPageNumber()}"))
        cnv.drawRightString(width - _MARGIN, 10 * mm, "Serbatic Security Inspector")
        cnv.restoreState()

    def new_page() -> None:
        nonlocal y
        c.showPage()
        y = height - _MARGIN
        page_deco(c)

    def ensure(space: float) -> None:
        nonlocal y
        if y - space < _MARGIN:
            new_page()

    # --- Página 1: cabecera centrada (logo + título + subtítulo + filete) ---
    c.drawImage(str(_LOGO), (width - _LOGO_W) / 2, y - _LOGO_H,
                width=_LOGO_W, height=_LOGO_H, mask="auto")
    y -= _LOGO_H + 10 * mm
    header, blocks = _parse_scope_text(text)
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(_TXT)
    c.drawCentredString(width / 2, y, _winansi(header[0] if header else title))
    y -= 8 * mm
    if len(header) > 1:
        c.setFont("Helvetica", 10)
        c.setFillColor(_TXT_SEC)
        c.drawCentredString(width / 2, y, _winansi(header[1]))
        y -= 5 * mm
    c.setFillColor(_ACCENT)
    c.rect(width / 2 - 15 * mm, y - 4.5 * mm, 30 * mm, 0.8 * mm, fill=1, stroke=0)
    y -= 12 * mm

    bar = _CARD_BAR
    inner_w = max_width - bar - 2 * _CARD_PAD
    text_x = _MARGIN + bar + _CARD_PAD

    def draw_card(num: str, card_title: str, severity: str | None, body: list[str]) -> None:
        """Card de alcance: caja (#f3f4f6) con barra de acento de severidad, chip,
        título en negrita, cuerpo y línea de estimación con filete. Puede partir
        de página: la caja continua (fondo + acento por segmento)."""
        nonlocal y
        sev_color = _SEV.get(severity, _ACCENT) if severity else _ACCENT

        def seg(bottom: float, h: float) -> None:
            c.setFillColor(_BOX_BG)
            c.rect(_MARGIN, bottom, max_width, h, fill=1, stroke=0)  # R6: fondo hasta el borde (no max_width - bar)
            c.setFillColor(sev_color)
            c.rect(_MARGIN, bottom, bar, h, fill=1, stroke=0)

        # Filas (h, draw): el slot de una fila con baseline y es [y + 2mm, y + 2mm - h].
        rows: list[tuple[float, Callable[[], None]]] = []
        if severity:
            label = _SEV_WORD_ES[severity]
            chip_w = c.stringWidth(label, "Helvetica-Bold", 8) + 4 * mm

            def chip_row() -> None:
                c.setFillColor(sev_color)
                c.rect(text_x, y - 3.5 * mm, chip_w, 4.5 * mm, fill=1, stroke=0)
                c.setFillColor(_WHITE)
                c.setFont("Helvetica-Bold", 8)
                c.drawString(text_x + 2 * mm, y - 2 * mm, _winansi(label))

            # QA-iter 4: un salto de línea entre el chip y el título (el chip queda
            # fijo al tope de la caja; el título baja una línea de leading).
            rows.append((_CARD_CHIP_H + _LEADING, chip_row))

        for wl in _wrap_lines(c, f"{num}. {card_title}", "Helvetica-Bold", 11, inner_w):
            def title_row(wl=wl) -> None:
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(_TXT)
                c.drawString(text_x, y, _winansi(wl))
            rows.append((_CARD_TITLE_H, title_row))

        for raw_line in body:
            stripped = raw_line.strip()
            if stripped.startswith("Estimación:"):
                rest = _winansi(stripped[len("Estimación:"):].strip())

                def est_row(rest=rest) -> None:
                    c.setFont("Helvetica-Bold", 9.5)
                    c.setFillColor(_TXT)
                    c.drawString(text_x, y, "Estimación:")
                    x2 = text_x + c.stringWidth("Estimación:", "Helvetica-Bold", 9.5) + 1.5 * mm
                    c.setFont("Helvetica", 9.5)
                    c.setFillColor(_TXT_SEC)
                    c.drawString(x2, y, rest)
                    c.setStrokeColor(_BOX_BORDER)
                    c.setLineWidth(0.3)
                    c.line(text_x, y - 1.5 * mm, text_x + inner_w, y - 1.5 * mm)

                rows.append((_CARD_EST_H, est_row))
                continue
            if stripped.startswith("Objetivo:"):
                rest = stripped[len("Objetivo:"):].strip()
                label_w = c.stringWidth("Objetivo:", "Helvetica-Bold", 9)
                parts = _wrap_lines(c, rest, "Helvetica", _TEXT_SIZE,
                                    max(inner_w - label_w - 2 * mm, 10 * mm)) or [""]

                def obj_first(first=parts[0]) -> None:
                    c.setFont("Helvetica-Bold", 9)
                    c.setFillColor(_ACCENT)
                    c.drawString(text_x, y, "Objetivo:")
                    x2 = text_x + label_w + 2 * mm
                    c.setFont("Helvetica", _TEXT_SIZE)
                    c.setFillColor(_TXT)
                    c.drawString(x2, y, _winansi(first))

                rows.append((_LEADING, obj_first))
                for rp in parts[1:]:
                    def obj_cont(rp=rp) -> None:
                        c.setFont("Helvetica", _TEXT_SIZE)
                        c.setFillColor(_TXT)
                        c.drawString(text_x, y, _winansi(rp))
                    rows.append((_LEADING, obj_cont))
                continue
            for wl in _wrap_lines(c, stripped, "Helvetica", _TEXT_SIZE, inner_w):
                def body_row(wl=wl) -> None:
                    c.setFont("Helvetica", _TEXT_SIZE)
                    c.setFillColor(_TXT)
                    c.drawString(text_x, y, _winansi(wl))
                rows.append((_LEADING, body_row))

        total_h = _CARD_PAD * 2 + sum(h for h, _ in rows)
        box_top = y
        if total_h <= box_top - _MARGIN:
            c.setStrokeColor(_BOX_BORDER)
            c.setLineWidth(0.5)
            c.rect(_MARGIN, box_top - total_h, max_width, total_h, fill=0, stroke=1)
        y = box_top - _CARD_PAD  # padding superior de la caja
        first_row = True
        for h, draw in rows:
            if y - h + 2 * mm < _MARGIN:
                if not first_row:
                    seg(_MARGIN, y + 2 * mm - _MARGIN)  # R6: contigua al slot previo (bottom = y + 2mm)
                new_page()
                y -= 2 * mm  # el slot empieza en el borde superior de la página
                first_row = False  # R6: tras el salto, el tope ya es el margen (sin extensión)
            ext = 2 * mm if first_row else 0  # R6: el primer slot pinta hasta box_top
            seg(y + 2 * mm - h, h + ext)  # fondo + acento del slot
            draw()
            y -= h
            first_row = False
        bottom_pad = min(_CARD_PAD, y - _MARGIN)
        if bottom_pad > 0:
            seg(y - bottom_pad, bottom_pad + 2 * mm)  # R6: contigua al último slot (top = y + 2mm)
            y -= bottom_pad
        y -= _CARD_GAP

    def draw_plain(lines: list[str]) -> None:
        nonlocal y
        for ln in lines:
            for wl in _wrap_lines(c, ln, "Helvetica", _TEXT_SIZE, max_width):
                if y < _MARGIN:
                    new_page()
                c.setFont("Helvetica", _TEXT_SIZE)
                c.setFillColor(_TXT)
                c.drawString(_MARGIN, y, _winansi(wl))
                y -= _LEADING
        y -= 2 * mm

    for blk in blocks:
        if blk["kind"] == "card":
            # Sin cabecera de card huérfana: chip (+ salto, QA-iter 4) + título + 1 línea deben caber.
            ensure(_CARD_PAD * 2 + _CARD_CHIP_H + _LEADING + _CARD_TITLE_H + _LEADING)
            draw_card(blk["num"], blk["title"], blk["severity"], blk["body"])
        else:
            draw_plain(blk["body"])
    c.save()
    return buf.getvalue()


def build_report_pdf(project_name: str, profile: dict, meta: dict, findings: list[dict],
                     pageCompression: int = 0) -> bytes:
    """PDF A4 completo para cliente (G3): portada con marca, perfil del proyecto,
    barra de distribución de severidades y hallazgos por categoría con resaltado.

    ``pageCompression=0`` por defecto: streams sin comprimir (contenido
    inspeccionable en tests; los archivos siguen siendo pequeños).
    """
    buf = io.BytesIO()
    width, height = A4
    max_width = width - 2 * _MARGIN

    def _page_deco(cnv, doc) -> None:
        """Páginas 2+: cabecera (título a la izquierda) + pie («Página N» + marca)."""
        cnv.saveState()
        cnv.setFont("Helvetica", 8)
        cnv.setFillColor(_TXT_SEC)
        cnv.drawString(_MARGIN, height - 12 * mm,
                       _winansi(f"Informe de auditoría de seguridad — {project_name}"))
        cnv.drawString(_MARGIN, 10 * mm, _winansi(f"Página {cnv.getPageNumber()}"))
        cnv.drawRightString(width - _MARGIN, 10 * mm, "Serbatic Security Inspector")
        cnv.restoreState()

    c = _canvas.Canvas(buf, pagesize=A4, pageCompression=pageCompression)
    y = height - _MARGIN

    def new_page() -> None:
        nonlocal y
        c.showPage()
        y = height - _MARGIN
        _page_deco(c, None)  # la portada (página 1) queda sin decorado

    def line(text: str, font: str = "Helvetica", size: float = _TEXT_SIZE,
             color=_TXT) -> None:
        """Dibuja ``text`` (envuelto en ``max_width``) y baja el cursor, paginando si hace falta."""
        nonlocal y
        for wrapped in _wrap_lines(c, text, font, size, max_width):
            if y < _MARGIN:
                new_page()
            c.setFont(font, size)
            c.setFillColor(color)
            c.drawString(_MARGIN, y, _winansi(wrapped))
            y -= _LEADING

    def gap(mm_value: float) -> None:
        """Aire extra (decorativo: si cae por debajo del margen, la siguiente línea pagina)."""
        nonlocal y
        y -= mm_value

    def ensure(space: float) -> None:
        """Salta de página si no caben ``space`` puntos entre el cursor y el margen."""
        nonlocal y
        if y - space < _MARGIN:
            new_page()

    def section_title(title: str) -> None:
        nonlocal y
        gap(12 * mm)  # QA-iter 5: más aire entre apartados (antes 8 mm)
        ensure(8 * mm)
        c.setFillColor(_ACCENT)
        c.rect(_MARGIN, y - 4.5 * mm, 2 * mm, 5.5 * mm, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", _SECTION_SIZE)
        c.setFillColor(_TXT)
        c.drawString(_MARGIN + 5 * mm, y, _winansi(title))
        y -= 8 * mm

    def category_title(vid: str, n: int) -> None:
        nonlocal y
        gap(7 * mm)  # QA-iter 5: más aire entre apartados (antes 4 mm)
        cve = VULN_CVES.get(vid)
        ensure(7 * mm + (_LEADING if cve else 0))  # QA-iter 6: línea del CVE
        c.setFillColor(_ACCENT)
        c.rect(_MARGIN, y - 3.5 * mm, 2 * mm, 4.5 * mm, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(_TXT)
        c.drawString(_MARGIN + 5 * mm, y,
                     _winansi(f"{vid} · {VULN_NAMES.get(vid, vid).upper()} ({n})"))
        y -= 7 * mm
        if cve:
            # QA-iter 6/7: CVE de la categoría como enlace a su ficha en cve.org,
            # sin prefijo «representativo»: color de acento + subrayado, con el
            # rectángulo del link pegado al texto (el puntero aparece sobre el
            # texto visible, no sobre el aire de la línea siguiente).
            c.setFont("Helvetica", 9)
            c.setFillColor(_ACCENT)
            c.drawString(_MARGIN + 5 * mm, y, cve)
            w = c.stringWidth(cve, "Helvetica", 9)
            c.setStrokeColor(_ACCENT)
            c.setLineWidth(0.4)
            c.line(_MARGIN + 5 * mm, y - 1 * mm, _MARGIN + 5 * mm + w, y - 1 * mm)
            c.linkURL(
                f"https://www.cve.org/CVERecord?id={cve}",
                # reportlab espera esquinas (lx, ly, ux, uy), no (x, y, w, h):
                # con w/h el rect queda con área negativa y el visor lo
                # normaliza a una lámina invisible (QA-iter 7).
                (_MARGIN + 5 * mm, y - 1.2 * mm, _MARGIN + 5 * mm + w, y + 2.4 * mm),
            )
            y -= _LEADING

    def finding_header(severity: str, title: str) -> None:
        nonlocal y
        gap(4 * mm)  # QA-iter 5: más aire entre apartados (antes 2 mm)
        ensure(5 * mm + 2 * _LEADING)
        label = SEVERITY_ES.get(severity, (severity or "hallazgo").upper())
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(_SEV.get(severity, _TXT_SEC))
        c.rect(_MARGIN, y - 5 * mm, c.stringWidth(label, "Helvetica-Bold", 8) + 4 * mm,
               5 * mm, fill=1, stroke=0)
        c.setFillColor(_WHITE)
        c.drawString(_MARGIN + 2 * mm, y - 3 * mm, _winansi(label))
        # QA-iter 5: salto de línea tras el chip (mismo fix que el alcance en
        # QA-iter 4): el título ya no cae dentro del rectángulo del chip.
        y -= 5 * mm + _LEADING
        line(title, font="Helvetica-Bold")

    def code_box(code: str, file_name: str) -> None:
        nonlocal y
        if not code.strip():
            return
        clines = _code_lines(c, code, file_name, max_width - 2 * _CODE_PAD)
        if len(clines) * _CODE_LINE_H + 2 * _CODE_PAD <= y - _MARGIN:
            # Cabe entero: caja completa (fondo + borde) antes de dibujar las líneas.
            c.setFillColor(_BOX_BG)
            c.setStrokeColor(_BOX_BORDER)
            c.setLineWidth(0.5)
            c.rect(_MARGIN, y - len(clines) * _CODE_LINE_H + _CODE_PAD, max_width,
                   len(clines) * _CODE_LINE_H, fill=1, stroke=1)
        for cl in clines:
            if y < _MARGIN + _CODE_PAD + _CODE_LINE_H:
                new_page()
            # Fondo por línea: un bloque que pagina se ve como caja continua.
            c.setFillColor(_BOX_BG)
            c.rect(_MARGIN, y - _CODE_LINE_H + _CODE_PAD, max_width, _CODE_LINE_H,
                   fill=1, stroke=0)
            x = _MARGIN + _CODE_PAD
            c.setFont(_SNIPPET_FONT, _SNIPPET_SIZE)
            for piece, color in cl:
                if not piece:
                    continue
                c.setFillColor(HexColor(color))
                c.drawString(x, y, piece)
                x += c.stringWidth(piece, _SNIPPET_FONT, _SNIPPET_SIZE)
            y -= _CODE_LINE_H

    def guide_block(guide_text: str) -> None:
        """Bloque GUÍA DE EXPLOTACIÓN del hallazgo: label + líneas de la guía.

        Por línea de la guía: ``## X`` → subtítulo en negrita con color de
        crítico; una línea que empieza por ``` alterna modo código (se
        acumulan las líneas interiores y al cerrar se dibuja una
        ``code_box`` con TextLexer, misma caja que los snippets; fence sin
        cerrar al final → se vuelca lo acumulado como código); el resto de
        líneas no vacías → ``line`` (texto normal).
        """
        line("GUÍA DE EXPLOTACIÓN:", font="Helvetica-Bold", size=9, color=_SEV["critical"])
        in_code = False
        code_lines: list[str] = []
        for raw in guide_text.split("\n"):
            if raw.startswith("```"):
                if in_code:
                    code_box("\n".join(code_lines), "guide.txt")
                    code_lines = []
                in_code = not in_code
                continue
            if in_code:
                code_lines.append(raw)
                continue
            if raw.startswith("## "):
                line(raw[3:].strip(), font="Helvetica-Bold", size=9, color=_SEV["critical"])
            elif raw.strip():
                line(raw)
        if in_code:  # fence sin cerrar al final: se vuelca lo acumulado
            code_box("\n".join(code_lines), "guide.txt")

    # Portada
    _draw_logo(c, y)
    y -= _LOGO_H + 10 * mm
    # QA-iter 5: título principal de la portada centrado (como la del alcance).
    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(_TXT)
    c.drawCentredString(width / 2, y, _winansi("INFORME DE AUDITORÍA DE SEGURIDAD"))
    y -= _LEADING
    gap(4 * mm)
    line(project_name, size=14, color=_ACCENT)
    line(date.today().isoformat(), size=10, color=_TXT_SEC)

    meta_lines = [f"{label}: {meta[key]}" for key, label in _META_LABELS
                  if key in meta and meta[key] is not None]
    if meta_lines:
        n = len(meta_lines)
        # QA-iter 7: texto centrado verticalmente en la caja (métricas de
        # Helvetica 10 pt: ascensor 7.18 pt, descensor 2.07 pt). Antes la primera
        # línea quedaba a 2 mm del tope (el ascensor salía de la caja) y había
        # ~7 mm de fondo vacío en la base.
        _asc, _desc = 7.18, 2.07  # pt
        _pad = 7.0  # pt ≈ 2.5 mm
        box_h = (n - 1) * _LEADING + _asc + _desc + 2 * _pad
        box_bottom = y - box_h
        c.setFillColor(_BOX_BG)
        c.setStrokeColor(_BOX_BORDER)
        c.setLineWidth(0.5)
        c.rect(_MARGIN, box_bottom, max_width, box_h, fill=1, stroke=1)
        c.setFont("Helvetica", _TEXT_SIZE)
        c.setFillColor(_TXT)
        for i, m in enumerate(meta_lines):
            c.drawString(_MARGIN + 3 * mm, y - _pad - _asc - i * _LEADING, _winansi(m))
        y = box_bottom

    # Barra de distribución de severidades + leyenda (solo si hay hallazgos)
    if findings:
        gap(6 * mm)
        total = len(findings)
        counts = {sev: sum(1 for f in findings if (f.get("severity") or "") == sev)
                  for sev in _SEV_ORDER}
        x = _MARGIN
        for sev in _SEV_ORDER:
            n = counts[sev]
            if n == 0:
                continue
            w = max_width * n / total
            c.setFillColor(_SEV[sev])
            c.rect(x, y - 4 * mm, w, 6 * mm, fill=1, stroke=0)
            x += w
        y -= 10 * mm
        c.setFont("Helvetica", 10)
        x = _MARGIN
        present = [sev for sev in _SEV_ORDER if counts[sev] > 0]
        for i, sev in enumerate(present):
            # Punto de la leyenda: «•» (U+2022) mapea en reportlab al byte 0x7F,
            # indefinido en el /WinAnsiEncoding predefinido del visor; se dibuja
            # como círculo relleno en la misma posición (misma coloración).
            c.setFillColor(_SEV[sev])
            c.circle(x + _LEGEND_DOT_R, y + 1.7 * mm, _LEGEND_DOT_R, fill=1, stroke=0)
            seg = f"{counts[sev]} {_SEV_LEGEND[sev]}"
            x += 2 * _LEGEND_DOT_R + 1.2 * mm
            c.setFillColor(_TXT)
            c.drawString(x, y, _winansi(seg))
            x += c.stringWidth(seg, "Helvetica", 10)
            if i < len(present) - 1:
                c.setFillColor(_TXT_SEC)
                c.drawString(x, y, " · ")
                x += c.stringWidth(" · ", "Helvetica", 10)

    # Perfil del proyecto
    section_title("PERFIL DEL PROYECTO")
    profile_lines: list[str] = []
    if profile.get("language"):
        profile_lines.append(f"Lenguaje: {profile['language']}")
    frameworks = profile.get("frameworks") or []
    fw_names = [f"{fw['name']} v{fw['version']}" if fw.get("version") else str(fw["name"])
                for fw in frameworks if isinstance(fw, dict) and fw.get("name")]
    if fw_names:
        profile_lines.append(f"Frameworks: {', '.join(fw_names)}")
    entry_points = profile.get("entry_points") or []
    if entry_points:
        profile_lines.append(f"Entry points: {', '.join(str(ep) for ep in entry_points)}")
    if profile.get("description"):
        profile_lines.append(f"Descripción: {profile['description']}")
    for p in profile_lines:
        line(p)

    # Hallazgos, agrupados por categoría en orden canónico A01→A10 (desconocidos al final)
    section_title(f"HALLAZGOS ({len(findings)} total)")
    by_cat: dict[str, list[dict]] = {}
    for f in findings:
        by_cat.setdefault(str(f.get("vulnId") or "?"), []).append(f)
    ordered_ids = [vid for vid in VULN_NAMES if vid in by_cat]
    ordered_ids += sorted(vid for vid in by_cat if vid not in VULN_NAMES)
    for vid in ordered_ids:
        cat_findings = by_cat[vid]
        category_title(vid, len(cat_findings))
        for f in cat_findings:
            finding_header(f.get("severity") or "", f.get("title") or f.get("id") or "Hallazgo")
            location = str(f.get("file") or "")
            if f.get("line") not in (None, ""):
                location = f"{location}:{f['line']}"
            line(f"Ubicación: {location}", font=_SNIPPET_FONT, size=_SNIPPET_SIZE,
                 color=_TXT_SEC)
            if f.get("snippet"):
                code_box(str(f["snippet"]), str(f.get("file") or ""))
            for key, label in (("exploit", "EXPLOIT:"), ("consequences", "CONSECUENCIAS:"),
                               ("solution", "SOLUCIÓN:")):
                if f.get(key):
                    line(label, font="Helvetica-Bold", size=9, color=_ACCENT)
                    line(str(f[key]))
            if f.get("guide"):
                guide_block(str(f["guide"]))
            also = f.get("alsoCategories") or []
            if also:
                line(f"También reportado como: {', '.join(str(a) for a in also)}",
                     size=9, color=_TXT_SEC)

    # Cada página 2+ recibe el decorado en new_page() al crearse; nada que añadir al final.
    c.save()
    return buf.getvalue()
