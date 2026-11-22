# Serbatic Security Inspector

Herramienta web de auditoría de seguridad de código. **La propia aplicación ejecuta el análisis**: un motor de 11 agentes LLM (1 perfilador + 10 especialistas, uno por categoría OWASP Top 10) audita el proyecto contra tu endpoint LLM OpenAI-compatible y emite el progreso en vivo a una UI React de estética cyberpunk.

**Estado: Fase 2c completa (tag `v0.3.2`)** — motor de análisis real + modo live en el front + proyectos propios (carpeta local y repo git) + streaming LLM + informe PDF completo + PDF claro para cliente.

## Cómo funciona

```
┌─────────────┐   POST /api/analyze    ┌──────────────────────────────┐
│  React (UI) │ ─────────────────────► │  FastAPI (motor de análisis) │
│  modo live  │ ◄───────────────────── │  11 agentes LLM + pipeline   │
└─────────────┘   SSE /api/runs/{id}/  └──────────────────────────────┘
                   events (progreso en vivo)
```

- **Backend (FastAPI, Python)**: escanea el proyecto (archivos de código + manifiestos), ejecuta un pipeline de 2 oleadas — **perfilador** (lenguaje, frameworks, entry points) → **10 agentes de vulnerabilidad en paralelo** — y emite por SSE: arranque, perfil, agentes, log de hallazgos `[SEVERIDAD] archivo:linea — título` y resultado final.
- **Agentes (11)**: 1 perfilador + 1 especialista por categoría **OWASP Top 10** — A01 control de acceso, A02 criptografía, A03 inyección, A04 diseño inseguro, A05 configuración, A06 componentes vulnerables, A07 identificación/autenticación, A08 ejecución de código no verificado, A09 registro/monitoreo, A10 integraciones de terceros (SSRF). Cada agente tiene su prompt propio; los hallazgos se **validan contra el escaneo real** (el archivo debe existir y la línea estar en rango): lo que no se ancla al código se descarta.
- **Frontend (React + Vite + TypeScript + Tailwind)**: autodetecta el backend (`GET /api/health`, timeout 1500 ms). Si hay → **modo live** (proyectos reales, análisis real con modelo y velocidad en pantalla `⚡ modelo · N tk/s`, resumen con snippet/exploit/solución, alcance técnico exportable a PDF). Si no → **modo mock** (demo sin backend, con los proyectos demo).
- **E2E verificado con LLM real**: DVWA → 126 hallazgos en ~2 min (Fase 2a) y 51 en ~190 s con streaming (Fase 2b); `mi app (e2e)` → 2 hallazgos en ~10 s (evidencia en `PROGRESS.md`).

## Requisitos

- Node.js ≥ 20
- Python 3.11+
- API key de un endpoint LLM **OpenAI-compatible** (el cliente usa `POST {base}/chat/completions`; para el modelo Qwen es obligatorio `enable_thinking: false`, que el cliente ya manda)

## Quickstart (1 terminal)

**Setup de primera vez**

Backend (motor de análisis, puerto 8000): crea el venv e instala las dependencias:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows (en Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
```

`requirements.txt` = solo runtime; `requirements-dev.txt` = runtime + pytest/anyio.

Crea `backend/.env` (está gitignored; **nunca commitees la key**):

```ini
LLM_API_KEY=tu_api_key
LLM_BASE_URL=https://tu-endpoint/v1
LLM_MODEL=nombre-del-modelo
LLM_CONCURRENCY=3
```

Dependencias del front:

```bash
npm install
```

**Arranque y parada**

```bash
.\scripts\start-all.ps1     # arranca backend :8000 + front :5173 (los que no estén)
.\scripts\stop-all.ps1      # para las 2 (mata por puerto)
```

Abre http://localhost:5173: la app detecta el backend y te deja elegir entre los **proyectos de ejemplo** (las carpetas de `samples/`) y los **proyectos propios** (carpeta local o repo git) para auditoriarlos de verdad.

### Opción avanzada: 2 terminales

Si prefieres lanzar cada app a mano:

**1. Backend (puerto 8000)**

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

> **Nota de operación:** si en el log de uvicorn ves líneas periódicas de `GET /health 200` + `GET /v1/models 404`, es sondeo del CLI de OpenCode contra servidores OpenAI-compatible locales (8000 es el puerto por defecto de vLLM). Ruido inofensivo, no hay acción.

**2. Frontend (puerto 5173)**

```bash
npm run dev        # http://localhost:5173 (proxy /api → :8000)
```

## Proyectos de ejemplo (`samples/`)

Cada **carpeta** copiada en `samples/` se convierte automáticamente en un
proyecto de ejemplo en la app (aparece en la lista de proyectos al arrancar el
backend, auditable de verdad). No hay que registrar nada. Ver
`samples/README.md`.

## Tests

```bash
cd backend && .venv\Scripts\python.exe -m pytest -q   # motor (sin LLM) + API + SSE + pipeline
npx vitest run                                        # frontend (130+ tests)
npm run build                                         # tsc --noEmit + vite build
```

## Arquitectura (mapa rápido)

| Dónde | Qué |
|---|---|
| `backend/app/llm.py` | Cliente LLM OpenAI-compatible (usage + tiempo por llamada) |
| `backend/app/agents/profile.py` | Agente perfilador (con fallback por reglas) |
| `backend/app/agents/vulns.py` | Prompts A01–A10, parse tolerante y validación anti-alucinación |
| `backend/app/pipeline.py` | Pipeline de 2 oleadas + eventos del contrato SSE |
| `backend/app/runs.py` | Registro de runs: slot único, cancel y supersede |
| `backend/app/main.py` | API: `health`, `projects`, `analyze`, `runs/{id}/events` (SSE con replay), `cancel`, `reports/scope-pdf` |
| `src/services/liveAnalysisService.ts` | Servicio live (SSE) tras la interfaz `AnalysisService` |
| `src/services/mockAnalysisService.ts` | Servicio mock (Fase 1, intacto como fallback) |
| `samples/` | Proyectos de ejemplo: cada subcarpeta = 1 proyecto (auto-detectado) |

## Fases

- **Fase 1 / 1.1** (completa, `v0.1.0`): UI completa + mock + navegación + fondo ambiental.
- **Fase 2a** (completa, `v0.2.0`): motor de análisis real (FastAPI + 11 agentes LLM + SSE), modo live en el front, miniapp + ground truth, PDF del alcance, modelo/tk/s en pantalla.
- **Fase 2b** (completa, `v0.3.0`): auditar **cualquier carpeta local** y repos git, streaming del cliente LLM (scopes mayores), PDF del informe completo, cancel robusto, desduplicación de hallazgos y minors de la 2a.
- **Fase 2b.1** (completa, `v0.3.1`): pulido y marca — logo + título, navegador de carpetas en modo live, PDF claro para cliente con código coloreado, arranque/parada 1-comando.
- **Fase 2c** (completa, `v0.3.2`): híbrido reglas (semgrep) + LLM, relocalización exacta de línea.
- **Fase 3**: imagen Docker «descargable».

## Notas de operación

- Un run a la vez: lanzar otro devuelve 409 («Ya hay un análisis en curso»); cancelar y relanzar funciona al instante (supersede).
- El endpoint LLM con gateway de timeout corto (~60 s) limita el tamaño de proyecto auditable a la vez; por eso el scope de DVWA quedó acotado a sus 12 módulos clásicos (ver design doc de Fase 2a).
- La API key vive **solo** en `backend/.env` (gitignored). No aparece en código, ni en el front, ni en logs.
