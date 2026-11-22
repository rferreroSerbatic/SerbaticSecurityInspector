"""Proyectos por ruta local: registro en memoria del scan de una carpeta del usuario."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from app.config import load_settings
from app.git_projects import GIT
from app.projects import ProjectInfo
from app.scanner import ScanResult, scan_project

LOCAL: dict[str, tuple[Path, list[str]]] = {}


def resolve_local(path: str) -> Path | None:
    """Valida la ruta: debe existir, ser directorio y no estar dentro de SAMPLES_DIR."""
    try:
        p = Path(path).expanduser().resolve()
    except OSError:
        return None
    if not p.is_dir():
        return None
    samples = load_settings().samples_dir.resolve()
    if p == samples or samples in p.parents:
        return None
    if any(p == g.resolve() for g in GIT.values()):
        return None
    return p


def _id_for(p: Path) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", p.name.lower()).strip("-") or "proj"
    return f"local-{slug}-{hashlib.md5(str(p).encode()).hexdigest()[:6]}"


def _info(p: Path, pid: str, scan: ScanResult) -> ProjectInfo:
    return ProjectInfo(
        id=pid, name=p.name, path=p.as_posix(),
        files=len(scan.files), lines=sum(f.lines for f in scan.files), kind="local",
    )


def register_local(path: str) -> ProjectInfo | None:
    p = resolve_local(path)
    if p is None:
        return None
    scan = scan_project(p, ["."])
    if not scan.files:
        return None
    pid = _id_for(p)
    LOCAL[pid] = (p, ["."])
    return _info(p, pid, scan)


def local_list() -> list[ProjectInfo]:
    out: list[ProjectInfo] = []
    for pid, (root, scope) in list(LOCAL.items()):
        if not root.is_dir():
            del LOCAL[pid]
            continue
        scan = scan_project(root, scope)
        if not scan.files:
            del LOCAL[pid]
            continue
        out.append(_info(root, pid, scan))
    return out


def local_analyze(project_id: str) -> tuple[ProjectInfo, ScanResult] | None:
    entry = LOCAL.get(project_id)
    if entry is None:
        return None
    root, scope = entry
    scan = scan_project(root, scope)
    if not scan.files:
        return None
    return _info(root, project_id, scan), scan


def remove_local(project_id: str) -> bool:
    """Desregistra un proyecto local. NUNCA toca la carpeta del usuario."""
    return LOCAL.pop(project_id, None) is not None
