# Backend — Serbatic Security Inspector

API FastAPI del motor de análisis (Fase 2a).

## Orden de arranque

1. Crear el venv: `py -3.12 -m venv .venv`
2. Instalar dependencias: `.venv\Scripts\python.exe -m pip install -r requirements.txt`
3. Crear `.env` desde `.env.example` (copiar la API key de tu config de OpenCode, `~/.config\opencode\opencode.json`, `provider.aitana.options.apiKey` / `.baseURL`)
4. Arrancar el servidor, desde `backend/`: `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`

## Tests

Desde `backend/`: `.venv\Scripts\python.exe -m pytest`

Los tests marcados con `llm` requieren LLM real (API key + red).
