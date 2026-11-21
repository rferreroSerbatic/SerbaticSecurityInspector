"""Generación de PDFs (reportlab): alcance técnico e informe completo.

Documentos planos A4: título + texto con salto de línea automático y
paginación. Las fuentes estándar de reportlab usan WinAnsiEncoding,
que cubre el acentuado español (por eso no hay emojis en el layout).
El contenido de usuario (títulos, snippets, textos de alcance) se
sanea a WinAnsi antes de dibujar: lo no representable pasa a «?».
"""

from __future__ import annotations

import io
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as _canvas

from app.pipeline import SEVERITY_ES

_MARGIN = 20 * mm
_LEADING = 5.2 * mm
_TITLE_SIZE = 14
_TEXT_SIZE = 10
_SECTION_SIZE = 12
_SNIPPET_FONT = "Courier"
_SNIPPET_SIZE = 8

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


def build_scope_pdf(text: str, title: str = "Alcance técnico de mejora") -> bytes:
    """Devuelve los bytes de un PDF A4 con ``title`` y el ``text`` del alcance."""
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    max_width = width - 2 * _MARGIN
    y = height - _MARGIN

    c.setFont("Helvetica-Bold", _TITLE_SIZE)
    c.drawString(_MARGIN, y, _winansi(title))
    y -= 10 * mm

    c.setFont("Helvetica", _TEXT_SIZE)
    for line in _wrap_lines(c, text, "Helvetica", _TEXT_SIZE, max_width):
        if y < _MARGIN:
            c.showPage()
            y = height - _MARGIN
        c.drawString(_MARGIN, y, _winansi(line))
        y -= _LEADING
    c.save()
    return buf.getvalue()


def build_report_pdf(project_name: str, profile: dict, meta: dict, findings: list[dict],
                     pageCompression: int = 0) -> bytes:
    """PDF A4 completo: portada, perfil del proyecto y hallazgos por categoría.

    ``pageCompression=0`` por defecto: streams sin comprimir (contenido
    inspeccionable en tests; los archivos siguen siendo pequeños).
    """
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4, pageCompression=pageCompression)
    width, height = A4
    max_width = width - 2 * _MARGIN
    y = height - _MARGIN

    def line(text: str, font: str = "Helvetica", size: float = _TEXT_SIZE) -> None:
        """Dibuja ``text`` (envuelto en ``max_width``) y baja el cursor, paginando si hace falta."""
        nonlocal y
        for wrapped in _wrap_lines(c, text, font, size, max_width):
            if y < _MARGIN:
                c.showPage()
                y = height - _MARGIN
            c.setFont(font, size)
            c.drawString(_MARGIN, y, _winansi(wrapped))
            y -= _LEADING

    def gap(mm_value: float) -> None:
        """Aire extra (decorativo: si cae por debajo del margen, la siguiente línea pagina)."""
        nonlocal y
        y -= mm_value

    def section_title(title: str) -> None:
        gap(8 * mm)
        line(title, font="Helvetica-Bold", size=_SECTION_SIZE)

    # Portada
    line("INFORME DE AUDITORÍA DE SEGURIDAD", font="Helvetica-Bold", size=_TITLE_SIZE)
    gap(10 * mm)
    line(project_name)
    line(date.today().isoformat())
    meta_lines = [f"{label}: {meta[key]}" for key, label in _META_LABELS
                  if key in meta and meta[key] is not None]
    if meta_lines:
        gap(6 * mm)
        for m in meta_lines:
            line(m)

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
        gap(4 * mm)
        line(f"{vid} · {VULN_NAMES.get(vid, vid).upper()} ({len(cat_findings)})",
             font="Helvetica-Bold")
        for f in cat_findings:
            gap(2 * mm)
            severity = f.get("severity") or ""
            line(f"[{SEVERITY_ES.get(severity, severity)}] {f.get('title') or f.get('id') or 'Hallazgo'}",
                 font="Helvetica-Bold")
            location = str(f.get("file") or "")
            if f.get("line") not in (None, ""):
                location = f"{location}:{f['line']}"
            line(f"Ubicación: {location}")
            if f.get("snippet"):
                line(str(f["snippet"]), font=_SNIPPET_FONT, size=_SNIPPET_SIZE)
            for key, label in (("exploit", "EXPLOIT"), ("consequences", "CONSECUENCIAS"),
                               ("solution", "SOLUCIÓN")):
                if f.get(key):
                    line(f"{label}: {f[key]}")
            also = f.get("alsoCategories") or []
            if also:
                line(f"También reportado como: {', '.join(str(a) for a in also)}")
    c.save()
    return buf.getvalue()
