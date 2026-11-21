"""Configuración: lee backend/.env (parser propio) y el entorno del sistema (prioridad)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
_DEFAULT_SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"


@dataclass
class Settings:
    llm_api_key: str
    llm_base_url: str
    llm_model: str
    llm_concurrency: int
    samples_dir: Path


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        # utf-8-sig: tolera el BOM que escribe PowerShell 5.1 con -Encoding utf8
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return values
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key:
            values[key] = value.strip()
    return values


def load_settings() -> Settings:
    from_env_file = _parse_env_file(_ENV_FILE)

    def value(key: str, default: str) -> str:
        return os.environ.get(key) or from_env_file.get(key) or default

    return Settings(
        llm_api_key=value("LLM_API_KEY", ""),
        llm_base_url=value("LLM_BASE_URL", "https://aitana.serbatic.es/v1"),
        llm_model=value("LLM_MODEL", "qwen3.8-fp8"),
        llm_concurrency=int(value("LLM_CONCURRENCY", "3")),
        samples_dir=Path(value("SAMPLES_DIR", str(_DEFAULT_SAMPLES_DIR))),
    )
