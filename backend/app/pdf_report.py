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


def build_scope_pdf(text: str, title: str = "Alcance técnico de mejora") -> bytes:
    """Devuelve los bytes de un PDF A4 con la marca, ``title`` y el ``text`` del alcance."""
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    max_width = width - 2 * _MARGIN
    y = height - _MARGIN

    _draw_logo(c, y)
    y -= _LOGO_H + 12 * mm

    c.setFillColor(_ACCENT)
    c.rect(_MARGIN, y - 4.5 * mm, 2 * mm, 5.5 * mm, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(_TXT)
    c.drawString(_MARGIN + 5 * mm, y, _winansi(title))
    y -= 10 * mm

    for line in _wrap_lines(c, text, "Helvetica", _TEXT_SIZE, max_width):
        if y < _MARGIN:
            c.showPage()
            y = height - _MARGIN
        c.setFont("Helvetica", _TEXT_SIZE)
        c.setFillColor(_TXT)
        c.drawString(_MARGIN, y, _winansi(line))
        y -= _LEADING
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
        gap(8 * mm)
        ensure(8 * mm)
        c.setFillColor(_ACCENT)
        c.rect(_MARGIN, y - 4.5 * mm, 2 * mm, 5.5 * mm, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", _SECTION_SIZE)
        c.setFillColor(_TXT)
        c.drawString(_MARGIN + 5 * mm, y, _winansi(title))
        y -= 8 * mm

    def category_title(vid: str, n: int) -> None:
        nonlocal y
        gap(4 * mm)
        ensure(7 * mm)
        c.setFillColor(_ACCENT)
        c.rect(_MARGIN, y - 3.5 * mm, 2 * mm, 4.5 * mm, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(_TXT)
        c.drawString(_MARGIN + 5 * mm, y,
                     _winansi(f"{vid} · {VULN_NAMES.get(vid, vid).upper()} ({n})"))
        y -= 7 * mm

    def finding_header(severity: str, title: str) -> None:
        nonlocal y
        gap(2 * mm)
        ensure(5 * mm + _LEADING)
        label = SEVERITY_ES.get(severity, (severity or "hallazgo").upper())
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(_SEV.get(severity, _TXT_SEC))
        c.rect(_MARGIN, y - 5 * mm, c.stringWidth(label, "Helvetica-Bold", 8) + 4 * mm,
               5 * mm, fill=1, stroke=0)
        c.setFillColor(_WHITE)
        c.drawString(_MARGIN + 2 * mm, y - 3 * mm, _winansi(label))
        y -= 5 * mm
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

    # Portada
    _draw_logo(c, y)
    y -= _LOGO_H + 10 * mm
    line("INFORME DE AUDITORÍA DE SEGURIDAD", font="Helvetica-Bold", size=20)
    gap(4 * mm)
    line(project_name, size=14, color=_ACCENT)
    line(date.today().isoformat(), size=10, color=_TXT_SEC)

    meta_lines = [f"{label}: {meta[key]}" for key, label in _META_LABELS
                  if key in meta and meta[key] is not None]
    if meta_lines:
        n = len(meta_lines)
        box_bottom = y - n * _LEADING - 4 * mm
        c.setFillColor(_BOX_BG)
        c.setStrokeColor(_BOX_BORDER)
        c.setLineWidth(0.5)
        c.rect(_MARGIN, box_bottom, max_width, y - box_bottom, fill=1, stroke=1)
        c.setFont("Helvetica", _TEXT_SIZE)
        c.setFillColor(_TXT)
        for i, m in enumerate(meta_lines):
            c.drawString(_MARGIN + 3 * mm, y - 2 * mm - i * _LEADING, _winansi(m))
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
            also = f.get("alsoCategories") or []
            if also:
                line(f"También reportado como: {', '.join(str(a) for a in also)}",
                     size=9, color=_TXT_SEC)

    # Cada página 2+ recibe el decorado en new_page() al crearse; nada que añadir al final.
    c.save()
    return buf.getvalue()
