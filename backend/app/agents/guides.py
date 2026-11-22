"""Agente de guías de explotación (Fase 2d): prompt anti-alucinación y parseo tolerante.

Una guía por hallazgo: texto libre (no JSON) anclado al código real analizado,
con estructura obligatoria de 4 encabezados. Ver spec §5.1 (Fase 2d).
"""

from __future__ import annotations

from app.agents.profile import Profile
from app.agents.vulns import VULN_NAMES

GUIDE_MAX_TOKENS: int = 1600

GUIDE_SYSTEM = (
    "Eres el agente de guías de explotación de Serbatic Security Inspector. Recibes un "
    "hallazgo concreto (vulnerabilidad real, ya localizada) de un proyecto concreto y "
    "escribes, en español, la guía paso a paso para explotarla en este código. Reglas: "
    "(1) Solo referencia archivos, líneas, funciones, parámetros, endpoints y datos que "
    "aparecen en los datos proporcionados; está prohibido inventar endpoints, rutas o "
    "comportamiento que no estén en el código. (2) Si el contexto es insuficiente para "
    "algún paso, dilo explícitamente («hay que verificar…») en lugar de inventar. "
    "(3) Tono técnico y directo, para el equipo que va a corregir el fallo. Estructura "
    "obligatoria, empezando directamente por el primer encabezado: "
    "`## RESUMEN` (2–3 líneas: qué se explota y por qué, en este código) · "
    "`## PASOS` (numerados 1., 2., …, concretos: archivo, función, parámetro, petición) · "
    "`## PAYLOAD DE EJEMPLO` (bloque de código con la petición/payload real) · "
    "`## IMPACTO EN ESTE PROYECTO` (qué datos o flujos concretos se alcanzan). "
    "Nada de introducciones ni despedidas."
)


def build_guide_prompt(finding: dict, file_content: str | None,
                       profile: Profile | None, project_name: str) -> tuple[str, str]:
    """Devuelve ``(system, user)`` para la guía de un hallazgo concreto.

    ``file_content`` es el contenido completo del archivo que apunta el hallazgo
    (acotado ya por el límite por archivo del scanner); si es ``None`` el prompt
    solo lleva el snippet del hallazgo.
    """
    vuln_id = str(finding.get("vulnId") or "")
    lines = [f"Proyecto: {project_name}", ""]
    if profile is not None:
        frameworks = ", ".join(
            f"{fw.get('name')} {fw.get('version', '')}".strip()
            for fw in profile.frameworks
        ) or "(ninguno detectado)"
        lines.append(f"Perfil: {profile.language} · frameworks: {frameworks}")
        if profile.description:
            lines.append(f"Descripción: {profile.description}")
        lines.append("")
    lines.extend([
        f"ID: {finding.get('id')} · {vuln_id} ({VULN_NAMES[vuln_id]}) · severidad: {finding.get('severity')}",
        f"Título: {finding.get('title')}",
        f"Ubicación: {finding.get('file')}:{finding.get('line')}",
        f"Explotación breve (del agente auditor): {finding.get('exploit')}",
        f"Consecuencias: {finding.get('consequences')}",
        "",
        "## Snippet del hallazgo:",
        "```",
        str(finding.get("snippet") or ""),
        "```",
    ])
    if file_content is not None:
        lines.extend([
            "",
            f"## Código completo del archivo ({finding.get('file')}):",
            "```",
            file_content,
            "```",
        ])
    return GUIDE_SYSTEM, "\n".join(lines)


def extract_guide(raw: str) -> str:
    """Limpia fences ``` exteriores y espacio sobrante; '' si no hay contenido."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text
