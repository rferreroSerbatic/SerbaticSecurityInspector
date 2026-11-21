"""Registro de análisis (runs): estados, emisión de eventos y la regla de slot (ruling R3)."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field


class RunStatus:
    RUNNING = "running"
    CANCELLING = "cancelling"
    DONE = "done"
    ERROR = "error"
    CANCELLED = "cancelled"


TERMINAL = {RunStatus.DONE, RunStatus.ERROR, RunStatus.CANCELLED}
TERMINAL_EVENTS = ("run:done", "run:error", "run:cancelled")


@dataclass
class RunState:
    id: str
    project_id: str
    vuln_ids: list[str]
    status: str = RunStatus.RUNNING
    events: list[dict] = field(default_factory=list)
    findings: list[dict] = field(default_factory=list)
    subscribers: list = field(default_factory=list)  # de asyncio.Queue
    start_time: float = field(default_factory=time.time)


def emit(run: RunState, etype: str, **payload) -> None:
    """Añade el evento al buffer del run y lo encola en cada subscriber (sin bloquear)."""
    event = {"type": etype, "t": round(time.time() - run.start_time, 1), **payload}
    run.events.append(event)
    for q in run.subscribers:
        q.put_nowait(event)


class RunRegistry:
    """Runs en memoria (single-user): a lo sumo un run activo a la vez (ruling R3)."""

    def __init__(self) -> None:
        self.active: RunState | None = None
        self.runs: dict[str, RunState] = {}

    def start(self, project_id: str, vuln_ids: list[str]) -> RunState | None:
        """Arranca un run. Devuelve ``None`` si hay un run RUNNING (conflicto → 409).

        Regla de slot (ruling R3): un run en CANCELLING puede ser suplantado
        (supersede) → se marca CANCELLED al instante y arranca el nuevo.
        """
        active = self.active
        if active is not None and active.status == RunStatus.RUNNING:
            return None
        if active is not None and active.status == RunStatus.CANCELLING:
            emit(active, "run:cancelled")
            active.status = RunStatus.CANCELLED
        run = RunState(id=uuid.uuid4().hex[:8], project_id=project_id, vuln_ids=list(vuln_ids))
        self.active = run
        self.runs[run.id] = run
        return run

    def get(self, run_id: str) -> RunState | None:
        return self.runs.get(run_id)

    def cancel(self, run_id: str) -> bool:
        """Pasa un run RUNNING a CANCELLING (lo termina el pipeline); False si no procede."""
        run = self.runs.get(run_id)
        if run is None or run.status != RunStatus.RUNNING:
            return False
        run.status = RunStatus.CANCELLING
        return True

    def finish(self, run: RunState) -> None:
        """Libera el slot si ``run`` era el activo y terminó (DONE/ERROR/CANCELLED)."""
        if self.active is run and run.status in TERMINAL:
            self.active = None
