"""Escáner de proyectos: recorre el scope y clasifica archivos de código y manifiestos."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

CODE_EXTS = {".py", ".js", ".ts", ".jsx", ".tsx", ".php", ".java", ".rb", ".go", ".cs"}
EXCLUDED_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    "venv",
    "assets",
    "static",
    "img",
    "images",
}
MANIFEST_NAMES = {
    "package.json",
    "composer.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "pom.xml",
    "Cargo.toml",
}
MAX_FILE_BYTES = 200_000
MAX_TOTAL_CHARS = 600_000


@dataclass
class CodeFile:
    path: str
    lines: int
    content: str


@dataclass
class ScanResult:
    files: list[CodeFile] = field(default_factory=list)
    manifests: list[CodeFile] = field(default_factory=list)
    all_paths: set[str] = field(default_factory=set)
    total_chars: int = 0


def _count_lines(content: str) -> int:
    return content.count("\n") + (0 if content.endswith("\n") or not content else 1)


def _is_excluded(rel_parts: tuple[str, ...]) -> bool:
    return any(part in EXCLUDED_DIRS for part in rel_parts[:-1])


def scan_project(root: Path, scope: list[str]) -> ScanResult:
    files: list[CodeFile] = []
    manifests: list[CodeFile] = []
    total_chars = 0
    for entry in scope:
        base = root / entry
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            rel_parts = path.relative_to(root).parts
            if _is_excluded(rel_parts):
                continue
            rel = path.relative_to(root).as_posix()
            if path.name in MANIFEST_NAMES:
                content = path.read_text(encoding="utf-8", errors="ignore")
                manifests.append(CodeFile(path=rel, lines=_count_lines(content), content=content))
            elif path.suffix in CODE_EXTS and path.stat().st_size <= MAX_FILE_BYTES:
                content = path.read_text(encoding="utf-8", errors="ignore")
                files.append(CodeFile(path=rel, lines=_count_lines(content), content=content))
                total_chars += len(content)
    return ScanResult(
        files=files,
        manifests=manifests,
        all_paths={f.path for f in files} | {m.path for m in manifests},
        total_chars=total_chars,
    )
