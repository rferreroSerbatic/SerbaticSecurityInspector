"""API de Serbatic Security Inspector: proyectos, análisis (runs) y eventos SSE."""

from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import load_settings
from app.llm import LLMClient
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


@app.get("/api/projects")
def get_projects():
    return list_projects(load_settings().samples_dir)


@app.post("/api/analyze", status_code=202)
async def analyze(body: AnalyzeBody):
    settings = load_settings()
    got = get_project(settings.samples_dir, body.projectId)
    if got is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    project, scan = got
    vuln_ids = [v for v in ALL_VULN_IDS if v in body.vulnIds]
    run = RUNS.start(project.id, vuln_ids)
    if run is None:
        raise HTTPException(status_code=409, detail="Ya hay un análisis en curso")
    asyncio.create_task(_wrapped(run, scan, project.name, vuln_ids))
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


@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    # `async def` a propósito: el check-then-act de RUNS.cancel corre en el event loop,
    # atómico con el pipeline (evita la race threadpool que dejaba un run zombie).
    if RUNS.get(run_id) is None:
        raise HTTPException(status_code=404, detail="Run no encontrado")
    return {"ok": RUNS.cancel(run_id)}
