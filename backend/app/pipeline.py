"""Pipeline de 2 oleadas: perfilador → agentes A01–A10 en paralelo (pool con semáforo)."""

from __future__ import annotations

import asyncio
import time

from app.agents.profile import run_profile
from app.agents.vulns import build_vuln_prompt, parse_findings, validate_finding
from app.llm import LLMClient, LLMError
from app.runs import RunState, RunStatus, emit
from app.scanner import MAX_TOTAL_CHARS, ScanResult

ALL_VULN_IDS = tuple(f"A{i:02d}" for i in range(1, 11))

SEVERITY_ES = {"critical": "CRÍTICO", "high": "ALTO", "medium": "MEDIO", "low": "BAJO"}


async def run_pipeline(
    llm: LLMClient,
    scan: ScanResult,
    project_name: str,
    vuln_ids: list[str],
    run: RunState,
    concurrency: int,
) -> None:
    """Ejecuta las 2 oleadas y emite los eventos del contrato SSE en ``run``."""
    lines = sum(f.lines for f in scan.files)
    emit(run, "run:start", projectId=project_name, vulnIds=vuln_ids, files=len(scan.files), lines=lines,
         model=llm.model)

    # Guarda de tamaño (Fase 2a): nada de proyectos enormes
    if scan.total_chars > MAX_TOTAL_CHARS:
        emit(
            run,
            "run:error",
            message=f"Proyecto demasiado grande para la Fase 2a ({scan.total_chars // 1000} KB de código)",
        )
        run.status = RunStatus.ERROR
        return

    # Oleada 1: perfilador (1 llamada LLM)
    if run.status in (RunStatus.CANCELLING, RunStatus.ERROR, RunStatus.CANCELLED):
        # Run ya terminal antes de la primera llamada (p. ej. cancel+supersede inmediato):
        # no gastar la llamada de perfil; los agentes saltan en su guard sin usar el perfil.
        profile = None
    else:
        profile, used_fallback = await run_profile(llm, scan, project_name)
        emit(run, "profile:done", profile=profile.to_dict())
        emit(
            run,
            "log",
            vulnId="global",
            message=f"Perfil: {profile.language} — {len(profile.frameworks)} frameworks · {len(scan.files)} archivos, {lines} líneas",
        )
        if used_fallback:
            emit(run, "log", vulnId="global", message="Perfil generado por reglas (el LLM no devolvió JSON válido)")

    # Oleada 2: agentes de vulnerabilidad (1 llamada LLM por categoría, pool acotado)
    ordered = [v for v in ALL_VULN_IDS if v in vuln_ids]
    for v in ordered:
        emit(run, "agent:start", vulnId=v)  # todos los starts antes de lanzar el pool

    sem = asyncio.Semaphore(concurrency)

    # Uso acumulado de las llamadas de agentes (para la velocidad media de run:done).
    total_tokens = 0
    total_llm_s = 0.0

    async def agent(v: str) -> None:
        async with sem:
            # Guard evaluado al adquirir el semáforo (fix I1 final review): un run puede
            # pasar a ERROR (504 de otro agente) o CANCELLED (supersede) mientras este
            # agente espera en cola; sin este check haría una llamada LLM real descartada.
            if run.status in (RunStatus.ERROR, RunStatus.CANCELLING, RunStatus.CANCELLED):
                emit(run, "agent:done", vulnId=v, findingsCount=0, criticalCount=0)
                emit(run, "log", vulnId=v, message="agente cancelado")
                return
            nonlocal total_tokens, total_llm_s
            system, user = build_vuln_prompt(v, profile, scan)
            try:
                res = await llm.chat(system, user)
            except LLMError as e:
                if run.status != RunStatus.ERROR:
                    run.status = RunStatus.ERROR
                    emit(run, "run:error", message=str(e))
                return
            # La llamada ya se gastó aunque el resultado se descarte (run terminal en vuelo).
            total_tokens += res.completion_tokens
            total_llm_s += res.elapsed_s
            # Si el run ya falló o se canceló (p. ej. supersede) en vuelo: descartar sin emitir
            if run.status in (RunStatus.ERROR, RunStatus.CANCELLING, RunStatus.CANCELLED):
                return
            raw = res.content
            raw_findings = parse_findings(raw, v)
            valid = [f for f in raw_findings if validate_finding(f, scan)]
            discarded = len(raw_findings) - len(valid)
            for i, f in enumerate(valid, start=1):
                emit(
                    run,
                    "log",
                    vulnId=v,
                    severity=f["severity"],
                    message=f"[{SEVERITY_ES[f['severity']]}] {f['file']}:{f['line']} — {f['title']}",
                )
                run.findings.append({**f, "id": f"{v}-{i}", "vulnId": v})
            if discarded > 0:
                emit(run, "log", vulnId=v, message=f"descartados {discarded} hallazgo(s) inválido(s)")
            criticals = sum(1 for f in valid if f.get("severity") == "critical")
            emit(run, "agent:done", vulnId=v, findingsCount=len(valid), criticalCount=criticals,
                 tokens=res.completion_tokens, tps=round(res.tps, 1))

    await asyncio.gather(*(agent(v) for v in ordered))

    # Cierre del run
    if run.status == RunStatus.CANCELLING:
        emit(run, "run:cancelled", findings=run.findings)
        run.status = RunStatus.CANCELLED
    elif run.status == RunStatus.RUNNING:
        emit(
            run,
            "run:done",
            findings=run.findings,
            meta={
                "files": len(scan.files),
                "lines": lines,
                "durationMin": max(1, round((time.time() - run.start_time) / 60)),
                "model": llm.model,
                "totalTokens": total_tokens,
                "avgTps": round(total_tokens / total_llm_s, 1) if total_llm_s > 0 else 0,
            },
        )
        run.status = RunStatus.DONE
    # ERROR: ya se emitió run:error en su momento · CANCELLED: supersede ya emitió run:cancelled
