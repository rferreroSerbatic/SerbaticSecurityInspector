"""Agente perfilador: describe el proyecto (lenguaje, frameworks, entry points) antes del análisis."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.llm import LLMClient, LLMError
from app.scanner import ScanResult

_EXT_LANGUAGE = {
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".py": "Python",
    ".php": "PHP",
    ".java": "Java",
    ".rb": "Ruby",
    ".go": "Go",
    ".cs": "C#",
}


@dataclass
class Profile:
    name: str
    language: str
    frameworks: list[dict]
    entry_points: list[str]
    description: str
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "language": self.language,
            "frameworks": self.frameworks,
            "entry_points": self.entry_points,
            "description": self.description,
            "notes": self.notes,
        }


def build_profile_prompt(scan: ScanResult, project_name: str) -> tuple[str, str]:
    system = (
        "Eres el agente perfilador de Serbatic Security Inspector. "
        "A partir de la información que te damos, devuelve SOLO un objeto JSON válido, "
        "sin markdown ni texto alrededor, con estas claves: "
        '"name" (nombre del proyecto), '
        '"language" (lenguaje principal, p. ej. "JavaScript"), '
        '"frameworks" (lista de objetos {"name", "version"}; [] si no se detecta ninguno), '
        '"entry_points" (lista de rutas relativas de archivos principales; [] si no se identifican), '
        '"description" (una frase corta sobre lo que hace el proyecto) y '
        '"notes" (observaciones breves; "" si no hay nada relevante).'
    )
    lines = [
        f"## Proyecto: {project_name}",
        "",
        "### Archivos",
    ]
    if scan.files:
        lines.extend(f"- {f.path}" for f in scan.files)
    else:
        lines.append("(sin archivos de código)")
    lines.extend(["", "### Manifiestos"])
    if scan.manifests:
        for m in scan.manifests:
            lines.extend([f"#### {m.path}", m.content])
    else:
        lines.append("(sin manifiestos)")
    return system, "\n".join(lines)


def _first_json_object(raw: str) -> dict | None:
    decoder = json.JSONDecoder()
    start = raw.find("{")
    while start != -1:
        try:
            obj, _ = decoder.raw_decode(raw[start:])
        except json.JSONDecodeError:
            start = raw.find("{", start + 1)
            continue
        if isinstance(obj, dict):
            return obj
        start = raw.find("{", start + 1)
    return None


def parse_profile(raw: str) -> Profile | None:
    """Extrae el primer objeto JSON válido de ``raw`` (tolerante a fences ```json y prosa)."""
    data = _first_json_object(raw)
    if data is None:
        return None
    return Profile(
        name=str(data.get("name") or ""),
        language=str(data.get("language") or "Desconocido"),
        frameworks=list(data.get("frameworks") or []),
        entry_points=list(data.get("entry_points") or []),
        description=str(data.get("description") or ""),
        notes=str(data.get("notes") or ""),
    )


def fallback_profile(scan: ScanResult, project_name: str) -> Profile:
    """Perfil por reglas: lenguaje por extensión dominante de ``scan.files``."""
    counts: Counter[str] = Counter()
    for f in scan.files:
        language = _EXT_LANGUAGE.get(Path(f.path).suffix.lower())
        if language:
            counts[language] += 1
    language = counts.most_common(1)[0][0] if counts else "Desconocido"
    return Profile(
        name=project_name,
        language=language,
        frameworks=[],
        entry_points=[],
        description="",
        notes="perfil generado por reglas",
    )


async def run_profile(llm: LLMClient, scan: ScanResult, project_name: str) -> tuple[Profile, bool]:
    """Devuelve ``(profile, used_fallback)``; usa el fallback si el LLM falla o no responde con JSON."""
    system, user = build_profile_prompt(scan, project_name)
    try:
        raw = await llm.chat(system, user)
    except LLMError:
        return fallback_profile(scan, project_name), True
    profile = parse_profile(raw)
    if profile is None:
        return fallback_profile(scan, project_name), True
    return profile, False
