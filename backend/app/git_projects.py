"""Proyectos por repo git público: clone --depth 1 en workspace/repos/<slug>/."""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
import urllib.parse
from pathlib import Path

from app.projects import ProjectInfo
from app.scanner import ScanResult, scan_project

WORKSPACE: Path = Path(__file__).resolve().parents[2] / "workspace"

GIT: dict[str, Path] = {}


class GitCloneError(Exception):
    """Fallo al clonar (timeout, git inexistente, URL inalcanzable)."""


def normalize_git_url(url: str) -> str | None:
    u = (url or "").strip()
    if not u or " " in u or u.startswith("git@"):
        return None
    if "://" not in u:
        u = "https://" + u
    parts = urllib.parse.urlparse(u)
    if parts.scheme not in ("http", "https") or not parts.netloc or not parts.path:
        return None
    return u


def git_slug(url: str) -> str:
    parts = urllib.parse.urlparse(normalize_git_url(url) or "")
    host = parts.netloc.lower().replace(":", "_")
    path = re.sub(r"\.git$", "", parts.path.strip("/").lower())
    path = re.sub(r"[^a-z0-9]+", "-", path).strip("-")
    return f"{host}-{path}".strip("-")


def _git_clone(url: str, dest: Path) -> None:
    try:
        proc = subprocess.run(
            ["git", "clone", "--depth", "1", url, str(dest)],
            timeout=120, capture_output=True, text=True,
        )
    except (subprocess.SubprocessError, FileNotFoundError) as exc:
        raise GitCloneError(f"git clone falló: {exc}") from exc
    if proc.returncode != 0:
        raise GitCloneError(f"git clone falló: {proc.stderr.strip()[-200:]}")


def _info(dest: Path, pid: str, scan: ScanResult, name: str) -> ProjectInfo:
    return ProjectInfo(
        id=pid, name=name, path=dest.as_posix(),
        files=len(scan.files), lines=sum(f.lines for f in scan.files), kind="git",
    )


def _slug_of(dest: Path) -> str:
    """El name legible del proyecto: ``dest.name`` es ``<slug>-<hash6>``."""
    return dest.name.rsplit("-", 1)[0]


def register_git(url: str) -> ProjectInfo:
    normalized = normalize_git_url(url)
    if normalized is None:
        raise ValueError("URL no válida")
    slug = git_slug(normalized)
    # Canonical (sin '/' final ni '.git'): las variantes de URL comparten clon,
    # y la hash de 6 hex rompe colisiones de slug (p. ej. /org/repo vs /org-repo).
    canonical = normalized.rstrip("/").removesuffix(".git")
    hash6 = hashlib.md5(canonical.encode()).hexdigest()[:6]
    dest = WORKSPACE / "repos" / f"{slug}-{hash6}"
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            _git_clone(normalized, dest)
        except GitCloneError:
            # Clonado parcial (p. ej. timeout): lo borra para que el reintento reclone.
            shutil.rmtree(dest, ignore_errors=True)
            raise
    scan = scan_project(dest, ["."])
    if not scan.files:
        raise GitCloneError("El repo clonado no tiene archivos de código")
    pid = f"git-{slug}-{hash6}"
    GIT[pid] = dest
    return _info(dest, pid, scan, slug)


def git_list() -> list[ProjectInfo]:
    out: list[ProjectInfo] = []
    for pid, dest in list(GIT.items()):
        if not dest.is_dir():
            del GIT[pid]
            continue
        scan = scan_project(dest, ["."])
        if not scan.files:
            del GIT[pid]
            continue
        out.append(_info(dest, pid, scan, _slug_of(dest)))
    return out


def git_analyze(project_id: str) -> tuple[ProjectInfo, ScanResult] | None:
    dest = GIT.get(project_id)
    if dest is None or not dest.is_dir():
        return None
    scan = scan_project(dest, ["."])
    if not scan.files:
        return None
    return _info(dest, project_id, scan, _slug_of(dest)), scan
