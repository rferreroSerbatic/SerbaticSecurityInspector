"""Generación del PDF del alcance técnico de mejora (reportlab).

Documento plano A4: título + texto con salto de línea automático y
paginación. Las fuentes estándar de reportlab usan WinAnsiEncoding,
que cubre el acentuado español.
"""

from __future__ import annotations

import io

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as _canvas

_MARGIN = 20 * mm
_LEADING = 5.2 * mm
_TITLE_SIZE = 14
_TEXT_SIZE = 10


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
    c.drawString(_MARGIN, y, title)
    y -= 10 * mm

    c.setFont("Helvetica", _TEXT_SIZE)
    for line in _wrap_lines(c, text, "Helvetica", _TEXT_SIZE, max_width):
        if y < _MARGIN:
            c.showPage()
            y = height - _MARGIN
        c.drawString(_MARGIN, y, line)
        y -= _LEADING
    c.save()
    return buf.getvalue()
