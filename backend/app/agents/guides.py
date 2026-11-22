"""Agente de guías de explotación (Fase 2d): prompt anti-alucinación y parseo tolerante.

Una guía por hallazgo: texto libre (no JSON) anclado al código real analizado,
con estructura obligatoria de 4 encabezados. Ver spec §5.1 (Fase 2d).
"""

from __future__ import annotations

import asyncio

from app.agents.profile import Profile
from app.agents.vulns import VULN_NAMES
from app.llm import LLMError
from app.runs import RunStatus, emit

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


async def run_guides(llm, findings, scan, profile, project_name, run, concurrency):
    """Oleada 3 (Fase 2d): una llamada LLM por hallazgo, pool acotado por semáforo.

    Muta ``finding["guide"]`` in situ (solo si la guía queda no vacía) y devuelve
    ``(Σ completion_tokens, Σ elapsed_s)``. Patrón de ``agent()`` en
    ``app/pipeline.py``: guard de estado terminal al tomar el semáforo (no gastar
    la llamada) y descarte del resultado si el run pasa a terminal en vuelo
    (la llamada ya se gastó). El fallo de una guía no falla el run: solo un log.
    """
    if not findings or run.status != RunStatus.RUNNING:
        return 0, 0.0
    n = len(findings)
    emit(run, "log", vulnId="global",
         message=f"Guías de explotación: {n} hallazgo(s) → generando…")
    sem = asyncio.Semaphore(concurrency)
    done = 0
    tokens = 0
    llm_s = 0.0

    async def guide(f: dict) -> None:
        nonlocal done, tokens, llm_s
        async with sem:
            if run.status in (RunStatus.CANCELLING, RunStatus.ERROR, RunStatus.CANCELLED):
                return  # no gastar la llamada (cancel llegado en cola)
            file_content = next(
                (cf.content for cf in [*scan.files, *scan.manifests]
                 if cf.path == f.get("file")), None)
            system, user = build_guide_prompt(f, file_content, profile, project_name)
            try:
                res = await llm.chat(system, user, max_tokens=GUIDE_MAX_TOKENS)
            except LLMError:
                emit(run, "log", vulnId=f["vulnId"], message=f"Guía no disponible: {f['id']}")
                return
            if run.status in (RunStatus.CANCELLING, RunStatus.ERROR, RunStatus.CANCELLED):
                return  # la llamada ya se gastó; se descarta (run terminal en vuelo)
            tokens += res.completion_tokens
            llm_s += res.elapsed_s
            done += 1
            guide_text = extract_guide(res.content)
            if guide_text:
                f["guide"] = guide_text
                emit(run, "log", vulnId=f["vulnId"],
                     message=f"Guía lista: {f['id']} ({done}/{n})")
            else:
                emit(run, "log", vulnId=f["vulnId"], message=f"Guía no disponible: {f['id']}")

    await asyncio.gather(*(guide(f) for f in findings))
    return tokens, llm_s
