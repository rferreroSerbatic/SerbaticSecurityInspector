"""Proyectos de ejemplo dentro de SAMPLES_DIR."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.scanner import ScanResult, scan_project

PROJECT_SCOPES: dict[str, list[str]] = {
    "miniapp": ["."],
    # DVWA master reorganizó la estructura: módulos de vulneraciones clásicas por carpeta.
    # Scope acotado a 12 módulos clásicos (≈127k chars): con el scope completo
    # (vulnerabilities/ + dvwa/includes/ ≈ 430k chars) y también con los 16 módulos
    # (≈220k chars), las llamadas LLM no-streaming superaban el timeout de gateway
    # (~60 s, 504) del endpoint en parte de los agentes. Ver registro de decisiones en
    # PROGRESS.md (Task 8, 2026-11-21).
    "dvwa": [
        "vulnerabilities/sqli",
        "vulnerabilities/sqli_blind",
        "vulnerabilities/xss_s",
        "vulnerabilities/exec",
        "vulnerabilities/fi",
        "vulnerabilities/upload",
        "vulnerabilities/brute",
        "vulnerabilities/authbypass",
        "vulnerabilities/csrf",
        "vulnerabilities/weak_id",
        "vulnerabilities/open_redirect",
        "vulnerabilities/csp",
    ],
}


@dataclass
class ProjectInfo:
    id: str
    name: str
    path: str
    files: int
    lines: int
    kind: str = "sample"


def _info(entry: Path, scan: ScanResult) -> ProjectInfo:
    return ProjectInfo(
        id=entry.name,
        name=entry.name,
        path=entry.resolve().as_posix(),
        files=len(scan.files),
        lines=sum(f.lines for f in scan.files),
    )


def list_projects(samples_dir: Path) -> list[ProjectInfo]:
    if not samples_dir.is_dir():
        return []
    projects: list[ProjectInfo] = []
    for entry in sorted(samples_dir.iterdir(), key=lambda p: p.name):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        scope = PROJECT_SCOPES.get(entry.name, ["."])
        scan = scan_project(entry, scope)
        if not scan.files:
            continue
        projects.append(_info(entry, scan))
    return projects


def get_project(samples_dir: Path, project_id: str) -> tuple[ProjectInfo, ScanResult] | None:
    if not project_id or project_id in {".", ".."}:
        return None
    entry = samples_dir / project_id
    # Evita saltarse fuera de samples_dir (p. ej. ".." o rutas absolutas)
    if entry.resolve().parent != samples_dir.resolve():
        return None
    if not entry.is_dir() or entry.name.startswith("."):
        return None
    scope = PROJECT_SCOPES.get(project_id, ["."])
    scan = scan_project(entry, scope)
    if not scan.files:
        return None
    return _info(entry, scan), scan
