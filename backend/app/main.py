"""API de Serbatic Security Inspector: proyectos, análisis (runs) y eventos SSE."""

from __future__ import annotations

import asyncio
import json
import re

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from app.config import load_settings
from app.git_projects import GitCloneError, git_analyze, git_list, register_git
from app.llm import LLMClient
from app.local_projects import local_analyze, local_list, register_local, resolve_local
from app.pdf_report import build_report_pdf, build_scope_pdf
from app.pipeline import ALL_VULN_IDS, run_pipeline
from app.projects import get_project, list_projects
from app.runs import TERMINAL, TERMINAL_EVENTS, RunRegistry, RunState
from app.scanner import ScanResult

app = FastAPI(title="Serbatic Security Inspector API")

# Registro global de runs (single-user: un run activo a la vez)
RUNS = RunRegistry()


def build_llm() -> LLMClient:
    """Construye el cliente LLM desde la configuración (los tests lo monkeypatchean)."""
    s = load_settings()
    return LLMClient(base_url=s.llm_base_url, api_key=s.llm_api_key, model=s.llm_model)


class AnalyzeBody(BaseModel):
    projectId: str
    vulnIds: list[str]


async def _wrapped(run: RunState, scan: ScanResult, project_name: str, vuln_ids: list[str]) -> None:
    """Ejecuta el pipeline y siempre libera los recursos del run (finally)."""
    llm = build_llm()
    try:
        await run_pipeline(llm, scan, project_name, vuln_ids, run, load_settings().llm_concurrency)
    finally:
        await llm.close()
        RUNS.finish(run)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/health")
def health_alias():
    """Alias sin prefijo /api para comprobación manual directa a :8000."""
    return {"status": "ok"}


@app.get("/api/projects")
def get_projects():
    return list_projects(load_settings().samples_dir) + local_list() + git_list()


class LocalProjectBody(BaseModel):
    path: str


@app.post("/api/projects/local", status_code=201)
def add_local_project(body: LocalProjectBody):
    if resolve_local(body.path) is None:
        raise HTTPException(status_code=400,
                            detail="Ruta no válida: debe existir, ser una carpeta y no estar dentro de samples/")
    info = register_local(body.path)
    if info is None:
        raise HTTPException(status_code=404, detail="Sin archivos de código en esa ruta")
    return {"project": info}


class GitProjectBody(BaseModel):
    url: str


@app.post("/api/projects/git", status_code=201)
def add_git_project(body: GitProjectBody):
    try:
        info = register_git(body.url)
    except ValueError:
        raise HTTPException(status_code=400, detail="URL de git no válida (usa una URL http/https)")
    except GitCloneError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo clonar: {exc}")
    return {"project": info}


@app.post("/api/analyze", status_code=202)
async def analyze(body: AnalyzeBody):
    settings = load_settings()
    # Resolución + escaneo en un hilo (rglob + lectura de todos los archivos): fuera del
    # event loop para no congelar la API con proyectos locales grandes (SSE, /api/projects, /health).
    # RUNS.start sigue en el loop: la atomicidad check-then-act de cancel/supersede se conserva.
    got = await asyncio.to_thread(
        lambda: local_analyze(body.projectId)
        or git_analyze(body.projectId)
        or get_project(settings.samples_dir, body.projectId))
    if got is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    project, scan = got
    vuln_ids = [v for v in ALL_VULN_IDS if v in body.vulnIds]
    run = RUNS.start(project.id, vuln_ids)
    if run is None:
        raise HTTPException(status_code=409, detail="Ya hay un análisis en curso")
    task = asyncio.create_task(_wrapped(run, scan, project.name, vuln_ids))
    run.task = task
    return {"runId": run.id}


@app.get("/api/runs/{run_id}/events")
async def run_events(run_id: str):
    run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run no encontrado")

    async def stream():
        q: asyncio.Queue = asyncio.Queue()
        run.subscribers.append(q)
        try:
            for ev in list(run.events):  # replay del buffer
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            if run.status in TERMINAL:
                return
            while True:  # en vivo hasta el evento terminal
                ev = await q.get()
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                if ev["type"] in TERMINAL_EVENTS:
                    return
        finally:
            run.subscribers.remove(q)

    return StreamingResponse(stream(), media_type="text/event-stream")


class ScopePdfBody(BaseModel):
    text: str
    title: str = "Alcance técnico de mejora"


@app.post("/api/reports/scope-pdf")
def scope_pdf(body: ScopePdfBody):
    """PDF real del texto del alcance (el front lo descarga como attachment)."""
    return Response(
        content=build_scope_pdf(body.text, body.title),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="alcance.pdf"'},
    )


class ReportPdfBody(BaseModel):
    projectName: str
    profile: dict
    meta: dict
    findings: list[dict]


@app.post("/api/reports/full-pdf")
def full_pdf(body: ReportPdfBody):
    """Informe PDF completo: portada + perfil + hallazgos por categoría."""
    slug = re.sub(r"[^a-z0-9]+", "-", body.projectName.lower()).strip("-") or "proyecto"
    return Response(
        content=build_report_pdf(body.projectName, body.profile, body.meta, body.findings),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="informe-{slug}.pdf"'},
    )


@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    # `async def` a propósito: el check-then-act de RUNS.cancel corre en el event loop,
    # atómico con el pipeline (evita la race threadpool que dejaba un run zombie).
    if RUNS.get(run_id) is None:
        raise HTTPException(status_code=404, detail="Run no encontrado")
    return {"ok": RUNS.cancel(run_id)}
