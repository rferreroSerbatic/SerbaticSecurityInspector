"""Pipeline de 2 oleadas: perfilador → agentes A01–A10 en paralelo (pool con semáforo)."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable

from app.agents.guides import run_guides
from app.agents.profile import run_profile
from app.agents.vulns import build_vuln_prompt, parse_findings, validate_finding
from app.llm import LLMClient, LLMError
from app.runs import RunState, RunStatus, emit
from app.scanner import MAX_TOTAL_CHARS, ScanResult

ALL_VULN_IDS = tuple(f"A{i:02d}" for i in range(1, 11))

SEVERITY_ES = {"critical": "CRÍTICO", "high": "ALTO", "medium": "MEDIO", "low": "BAJO"}


def _consolidate(findings: list[dict]) -> tuple[list[dict], int]:
    """Consolida hallazgos de la misma (file, line) reportados por varias categorías.

    Gana la categoría canónica menor (A01 < A02 < ...); las demás quedan en
    ``alsoCategories``. Devuelve (consolidados ordenados, n_descartados).
    Los ``id`` se renumeran por categoría ganadora: ``{vulnId}-{n}`` 1-based.
    Los duplicados intra-categoría (mismo agente, misma línea) se conservan.
    """
    groups: dict[tuple[str, int], list[dict]] = {}
    order: list[tuple[str, int]] = []
    for f in findings:
        key = (f["file"], f["line"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(f)
    out: list[dict] = []
    discarded = 0
    for key in order:
        members = sorted(groups[key], key=lambda f: f["vulnId"])
        winner_vid = members[0]["vulnId"]
        kept = [dict(m) for m in members if m["vulnId"] == winner_vid]
        also = sorted({m["vulnId"] for m in members if m["vulnId"] != winner_vid})
        if also:
            for k in kept:
                k["alsoCategories"] = also
        discarded += len(members) - len(kept)
        out.extend(kept)
    out.sort(key=lambda f: (f["vulnId"], f["file"], f["line"]))
    counters: dict[str, int] = {}
    for f in out:
        counters[f["vulnId"]] = counters.get(f["vulnId"], 0) + 1
        f["id"] = f"{f['vulnId']}-{counters[f['vulnId']]}"
    return out, discarded


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

    try:
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

        # QA-iter 5: tk/s en vivo → evento ``agent:progress`` con throttle de
        # ~1 s por agente (la estimación de tokens la manda el cliente LLM).
        last_progress: dict[str, float] = {}

        def on_progress_for(v: str) -> Callable[[float, int], None]:
            def _on_progress(elapsed: float, est_tokens: int) -> None:
                now = time.monotonic()
                if now - last_progress.get(v, 0.0) < 1.0:
                    return
                if run.status in (RunStatus.ERROR, RunStatus.CANCELLING, RunStatus.CANCELLED):
                    return
                last_progress[v] = now
                emit(
                    run,
                    "agent:progress",
                    vulnId=v,
                    tokens=est_tokens,
                    tps=round(est_tokens / elapsed, 1) if elapsed > 0 else 0,
                )
            return _on_progress

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
                    res = await llm.chat(system, user, on_progress=on_progress_for(v))
                except LLMError as e:
                    if run.status != RunStatus.ERROR:
                        run.status = RunStatus.ERROR
                        emit(run, "run:error", message=str(e))
                    return
                # La llamada ya se gastó aunque el resultado se descarte (run terminal en vuelo).
                total_tokens += res.completion_tokens
                total_llm_s += res.elapsed_s
                # Si el run ya falló (ERROR) o fue suplantado (CANCELLED) en vuelo: descartar
                # sin emitir. CANCELLING no es terminal (runs.py): el cierre emite run:cancelled
                # con los findings acumulados, así un cancel justo al terminar la oleada 2
                # conserva sus hallazgos (spec 2d «findings parciales»; RF4 de Task 3).
                if run.status in (RunStatus.ERROR, RunStatus.CANCELLED):
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
                    run.findings.append({
                        **f,
                        "id": f"{v}-{i}",
                        "vulnId": v,
                        "snippet": str(f.get("snippet") or ""),
                        "exploit": str(f.get("exploit") or ""),
                        "consequences": str(f.get("consequences") or ""),
                        "solution": str(f.get("solution") or ""),
                    })
                if discarded > 0:
                    emit(run, "log", vulnId=v, message=f"descartados {discarded} hallazgo(s) inválido(s)")
                criticals = sum(1 for f in valid if f.get("severity") == "critical")
                emit(run, "agent:done", vulnId=v, findingsCount=len(valid), criticalCount=criticals,
                     tokens=res.completion_tokens, tps=round(res.tps, 1))

        await asyncio.gather(*(agent(v) for v in ordered))

        # Desduplicación entre categorías (Task 5): un solo punto, tras el gather y
        # antes del cierre, DENTRO del try (cubre también el run:cancelled de T4).
        run.findings, dupes = _consolidate(run.findings)
        if dupes:
            emit(run, "log", vulnId="global",
                 message=f"consolidados {dupes} hallazgo(s) duplicado(s) entre categorías")

        # Oleada 3 (Fase 2d): guías de explotación — 1 llamada LLM por hallazgo
        # (pool acotado). Solo con el run vivo: ERROR/CANCELLING se cierran en su rama.
        if run.status == RunStatus.RUNNING and run.findings:
            g_tokens, g_llm_s = await run_guides(llm, run.findings, scan, profile,
                                                 project_name, run, concurrency)
            total_tokens += g_tokens
            total_llm_s += g_llm_s

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
    except asyncio.CancelledError:
        # Cancel robusto (T4): el endpoint (o el supersede) canceló la task en vuelo.
        if run.status == RunStatus.CANCELLING:
            emit(run, "run:cancelled", findings=run.findings)
            run.status = RunStatus.CANCELLED
        raise
