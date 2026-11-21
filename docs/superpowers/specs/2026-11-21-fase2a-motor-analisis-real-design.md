# Serbatic Security Inspector — Diseño (Fase 2a: Motor de análisis real)

Fecha: 2026-11-21 · Estado: aprobado por el usuario («haz tú todo, adelante», tras ver el alcance)

## 1. Intención

Sustituir el análisis mock por un **motor real**: un backend FastAPI que lee el código de un proyecto de ejemplo, ejecuta **11 agentes LLM** (1 perfilador + 1 por vulnerabilidad OWASP) contra **qwen3.8 FP8** vía el endpoint OpenAI-compatible del usuario, y **transmite el progreso real por SSE** al frontend existente. Las pantallas del frontend no cambian: se añade un `liveAnalysisService` que implementa la interfaz `AnalysisService` ya diseñada para esto en la spec de Fase 1.

**Por qué ahora:** Fase 1 y 1.1 completas (77/77 tests). El usuario quiere analizar un proyecto real (DVWA como showcase) y materializar el concepto de «agentes» de la spec.

**Por qué es viable (spike 2026-11-21, verificado con llamada real):**
- Endpoint: `POST https://aitana.serbatic.es/v1/chat/completions`, `Authorization: Bearer <key>`, modelo `qwen3.8-fp8`.
- Contexto **262k tokens**, output 128k → el código del proyecto entero cabe en cada prompt; no hace falta chunking en 2a.
- Hay que pasar `chat_template_kwargs: {enable_thinking: false}` (verificado: sin él, el modelo «piensa» y consume tokens; con él, respuesta directa en ~0,4 s para prompts cortos).
- La API key ya vive en `~/.config/opencode/opencode.json` (la del usuario); se copia a `backend/.env` (gitignored). Nunca en el frontend, nunca en git.

## 2. Objetivos (2a)

1. Análisis **real y verificable** de un proyecto real: `samples/miniapp` (regresión) + `samples/dvwa` (showcase; el usuario lo clona o se clona en setup).
2. **11 agentes LLM**: perfilador (lenguaje, frameworks, versiones, estructura) + 10 de vulnerabilidad (A01–A10). Cada uno emite hallazgos en el **shape exacto de `Finding`** del frontend (`file`, `line`, `snippet`, `severity`, `title`, `exploit`, `consequences`, `solution`).
3. **Progreso real por SSE**: inicio de run, perfil, inicio/fin de cada agente, línea de log por hallazgo (`[SEV] archivo:linea — título`), meta final real (archivos, líneas, duración).
4. **Frontend prácticamente sin cambios**: `liveAnalysisService` + autodetección de backend (fetch `/api/health` al arrancar; si no responde, mock). `SourceScreen` en modo live muestra la lista real de proyectos; el picker de carpeta y el tab git se ocultan (Fase 2b). Adición mínima: banner de error en `ProgressScreen` (ruling R1).
5. **Ground truth**: `samples/miniapp` lleva `expected-findings.json` (1 vuln sembrada por categoría); test de regresión (marcado, no en CI): run real del motor debe localizar **≥ 8/10**.

## 3. No-objetivos (2a → 2b)

- Carpeta real desde el picker (webkitdirectory) — oculta en 2a, se reactiva en 2b.
- Clonado git real desde la UI (DVWA se clona a mano en setup).
- PDF real (el stub + «Copiar texto» se mantienen).
- Docker (Fase 3). Persistencia, multiusuario, i18n, auth.
- Reglas/semgrep/híbrido: mejora de 2b.
- Concurrency compleja: solo un pool fijo configurable (default 3).

## 4. Restricciones

- Windows + PowerShell. **Python no está instalado** → primera task: `winget install Python.Python.3.12` (ya lanzado 2026-11-21). Venv en `backend/.venv` (gitignored).
- LLM: endpoint y modelo de §1; `enable_thinking: false`; `temperature: 0`; `max_tokens: 8000` por llamada; timeout 180 s.
- 11 llamadas LLM por run → duración estimada 1–4 min según proyecto. La UI ya avisa «puede tardar varios minutos».
- Guardas de tamaño: el escaneo descarta binarios/assets y archivos > 200 KB; si el código acotado supera ~600 KB de texto (~150k tokens), el run falla con mensaje claro (Fase 2a no hace chunking).
- TDD estricto, comprobaciones reducidas y 1 commit por task (AGENTS.md).

## 5. Enfoques considerados

1. **FastAPI + agentes LLM-only — ELEGIDO.** El backend lee el código y lo envía al LLM con prompt por categoría; output JSON estricto. Sin dependencias de scanner (semgrep/AST) que mantener antes de validar el loop LLM; el contexto de 262k elimina el chunking en el scope de 2a. FastAPI ya estaba aprobado para Fase 2 en la spec original.
2. **Reglas (semgrep) + LLM para explicar.** Más precisión en patrones conocidos, pero añade una dependencia pesada y un set de reglas que escribir y mantener antes de haber validado el loop LLM; se pospone como mejora híbrida de 2b.
3. **Análisis en el navegador.** Descartado: no se puede leer una carpeta arbitraria ni exponer la API key en el front.
4. **OpenCode como motor (descartado por el usuario).** El análisis lo hace la app en runtime, no un agente de desarrollo.

## 6. Arquitectura

```
Frontend (React — pantallas sin cambios)
   │  GET /api/projects · POST /api/analyze · SSE /api/runs/{id}/events
   ▼  (Vite proxy /api → localhost:8000 en dev)
backend/ (FastAPI, Python 3.12)
   scanner.py  → lista de archivos + líneas (reglas, sin LLM)
   llm.py      → cliente httpx OpenAI-compatible (enable_thinking: false)
   agents/     → prompts: profile.py + vulns.py (A01..A10)
   pipeline.py → 2 oleadas: perfilador (1) → 10 agentes (pool de 3)
                validación de hallazgos · buffer de eventos · cancel
   main.py     → endpoints + CORS/proxy + registro de runs en memoria
```

### 6.1 Backend (`backend/`)

- Deps: `fastapi`, `uvicorn[standard]`, `httpx`, `pydantic`; tests: `pytest`, `httpx` (MockTransport), `anyio`.
- **`.env`** (gitignored; `.env.example` documentado): `LLM_API_KEY`, `LLM_BASE_URL=https://aitana.serbatic.es/v1`, `LLM_MODEL=qwen3.8-fp8`, `LLM_CONCURRENCY=3`, `SAMPLES_DIR` (default `../samples`).
- Endpoints:
  - `GET /api/health` → `{status: "ok"}`.
  - `GET /api/projects` → `[{id, name, path, files, lines}]` de `SAMPLES_DIR` (subcarpetas con código; `dvwa` solo si existe).
  - `POST /api/analyze` `{projectId, vulnIds[]}` → `202 {runId}`; si hay run activo → `409`.
  - `GET /api/runs/{runId}/events` → SSE (`data: {json}\n\n`); re-emite el buffer y sigue en vivo (un cliente que llega tarde recupera).
  - `POST /api/runs/{runId}/cancel` → flag; el pipeline lo comprueba entre agentes (la llamada LLM en vuelo termina pero sus hallazgos se descartan).
- **Escaneo** (`scanner.py`): extensiones de código `{py, js, ts, jsx, tsx, php, java, rb, go, cs}`; excluye dirs `{node_modules, .git, dist, build, __pycache__, .venv, venv, assets, static, img, images}` y archivos > 200 KB; scope por proyecto (miniapp: `.`; dvwa: `vulnerabilities`, `include`). Salida: `{files: [{path, lines}]}` (código), `{manifests: string[]}` (ficheros manifiesto encontrados: `package.json`, `composer.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml`, `Cargo.toml`) y `allPaths` (código ∪ manifiestos, para validación — ruling R2).
- **Guarda de tamaño**: total > 600 KB de texto → `run:error` con mensaje claro.

### 6.2 Pipeline (2 oleadas)

1. **Perfilador (1 llamada LLM).** Entrada: árbol de ficheros + ficheros manifiesto completos (`package.json`, `composer.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml` — los que existan). Output JSON estricto: `{name, language, frameworks: [{name, version}], entryPoints: string[], description, notes}`. Si falla a parsear → se reutiliza un perfil mínimo derivado del escaneo (lenguaje por extensión dominante) y se avisa en el log.
2. **Agentes A01–A10 (1 llamada LLM cada uno, pool de `LLM_CONCURRENCY`).** Entrada = resumen del perfil + lista de ficheros + **código completo acotado** (bloque por fichero, `// ── relative/path ──`) + **manifiestos completos como bloques propios** (R2) + prompt específico de la categoría OWASP. Reglas del prompt (comunes a los 10): eres un auditor de seguridad; **solo reportas lo que ves en el código** (nada de suposiciones ni de «podría»); línea = número real del fichero; severidad según impacto; si no hay hallazgos, **array vacío**; devuelves **solo JSON**, un array de `{severity, title, file, line, snippet, exploit, consequences, solution}`. El prompt de **A06** añade explícitamente: revisar los manifiestos de dependencias en busca de versiones conocidas como vulnerables (CVE públicos).
3. **Validación (reglas, tras cada agente):** `file` existe en `allPaths` del escaneo (código ∪ manifiestos; ruta relativa, `/`), `line` dentro de rango (para manifiestos: ≤ nº de líneas del manifiesto), `severity` ∈ enum, `title` no vacío → inválidos se descartan y se cuenta en el log. `id` = `${vulnId}-${n}`, `vulnId` añadido.
4. **Eventos SSE** (contrato):
   - `run:start {runId, projectId, vulnIds, files, lines}`
   - `profile:done {profile}`
   - `agent:start {vulnId}` · `agent:done {vulnId, findingsCount, criticalCount}`
   - `log {vulnId, severity?, message}` (por hallazgo: `[CRÍTICO] file:line — title`; también avisos)
   - `run:done {findings, meta: {files, lines, durationMin}}`
   - `run:error {message}` · `run:cancelled`
5. **Runs en memoria**: `dict runId → RunState` (estado, buffer de eventos, findings). Single-user: un run activo a la vez (409 el resto).

### 6.3 Frontend

- **`src/services/liveAnalysisService.ts`** — `createLiveAnalysisService(): AnalysisService` (URL relativa `/api` vía Vite proxy). `run()`: POST `/api/analyze` → `EventSource` → mapea eventos a `AnalysisProgress` (mismo shape que el mock). `cancel()`: POST cancel + cierra el stream + para la interpolación.
  - **Errores (R1):** `run:error` o `POST /api/analyze` → `409`/red → estado final `{status: 'error', error: message}`. `types.ts` gana `status: … | 'error'` y `error?: string` (el mock nunca emite `'error'`; backward-compatible). `useAnalysis` ya solo auto-avanza con `'done'` → con `'error'` se queda en progreso. `ProgressScreen`: banner de error (mensaje + botón `← Volver` que reutiliza `goVulns` del flujo actual).
  - *Call del diseñador:* el progreso fino de cada agente se **interpola en el cliente** (easing hacia 90 % desde `agent:start`, snap a 100 en `agent:done`); los eventos reales mandan para log/hallazgos/estado. Así la UX del mock se mantiene sin complicar el backend. `globalProgress` = media de agentes (misma fórmula que el mock).
- **Autodetección (`App.tsx`)**: al montar, `fetch('/api/health', {timeout ~1,5 s})` → ok: `createLiveAnalysisService()`; fail: `createMockAnalysisService()`. Sin variables de entorno.
- **`SourceScreen`**: prop `projects` (o fetch propio) — en modo live: lista de `/api/projects` (nombre, path, `N archivos`); **tab git y picker de carpeta ocultos**, con nota «Fase 2b: carpeta local y repositorio git». En modo mock: se mantiene exactamente como hoy.
- `ScopeModal`/`buildScopeText`: sin cambios (el nombre real del proyecto fluye por `source.label`; la meta real llega por `run:done`).
- **Vite**: `server.proxy { '/api': 'http://localhost:8000' }` (sin CORS en dev).

### 6.4 Proyectos de ejemplo (`samples/`)

- **`samples/miniapp/`** — API Express **pequeña (~12 archivos, sin dependencias nativas**: solo `express`, «DB» en memoria), con **10 vulnerabilidades sembradas, una por categoría**:
  - A01 `routes/admin.js` (endpoint de admin sin check de autorización) · A02 `utils/crypto.js` (MD5 + secret hardcodeado) · A03 `routes/orders.js` (concatenación SQL) · A04 `routes/transfer.js` (límite de negocio no validado en servidor) · A05 `middleware/cors.js` (CORS `*` con credentials) · A06 `package.json` (deps vulnerables conocidas, p. ej. `debug@2.6.9`, `lodash@4.17.15`) · A07 `routes/login.js` (sin rate-limit, token `Math.random()`) · A08 `routes/plugins.js` (`eval` de código remoto) · A09 `middleware/audit.js` (no loguea fallos de auth) · A10 `routes/report.js` (fetch de URL del usuario sin allowlist).
  - `expected-findings.json` (1 entrada por categoría: `vulnId` + `file`); **no es código → el escaneo lo ignora**.
  - Arrancable: `npm install && npm start` (para verificar a mano; no es requisito del análisis).
- **`samples/dvwa/`** — **gitignored**; se clona en el setup: `git clone --depth 1 https://github.com/digininja/DVWA samples/dvwa`. Scope de análisis: `vulnerabilities/` + `include/`. Si no existe, `/api/projects` solo muestra miniapp (sin error).
- **`samples/README.md`** — cómo clonar DVWA y arrancar miniapp.

### 6.5 Tests

- **Backend (pytest):**
  - `scanner`: fixture de proyecto temporal (contar archivos/líneas, exclusiones, scope, guarda de tamaño).
  - `GET /api/projects` con `SAMPLES_DIR` en fixture temporal.
  - `llm.py` con `httpx.MockTransport` (body correcto: `enable_thinking: false`, parse de errores).
  - **Pipeline con `FakeLLM` determinista** (devuelve JSON canned por categoría): secuencia completa de eventos SSE, mapeo a `Finding`, validación descarta inválidos, 409 con run activo, cancel.
  - **Ground truth (marcado `@pytest.mark.llm`, fuera del `pytest` por defecto):** run real sobre miniapp ≥ 8/10 de `expected-findings.json` (match por `vulnId` + `file`).
- **Frontend (vitest):** `liveAnalysisService` con `EventSource` stubbed + `fetch` mock (mapeo de eventos, cancel, fallback de error); autodetección en `App` (fetch ok → live, fail → mock); `SourceScreen` modo live (lista real, tabs ocultos).

### 6.6 Rulings del builder check (2026-11-21)

El builder check (subagente independiente) devolvió 3 preguntas; resueltas como llamadas del diseñador (no cambian el alcance aprobado):

- **R1 — Error/cancel en la UI.** `run:error`/`409` → estado `'error'` con banner mínimo en `ProgressScreen` (reutiliza la navegación existente; sin nueva pantalla). El **cancel no necesita estado nuevo**: la máquina `useAnalysis` ya lo gestiona (quien cancela decide el paso destino: `goVulns`, `newAudit` o un nuevo `startAnalysis`); el live service solo debe cerrar stream + POST cancel de forma idempotente.
- **R2 — A06 y manifiestos.** El escaneo distingue `files` (código, para los bloques) de `manifests` (manifiestos de dependencias, que **sí** se envían a todos los agentes como bloques y **sí** son válidos como `file` de hallazgo, vía `allPaths`). Sin esto, el hallazgo A06 (`file: package.json`) se descartaría sistemáticamente y la compuerta ≥ 8/10 se rompería.
- **R3 — Slot de run tras cancel / 409.** El slot se libera cuando la task de pipeline termina realmente (la llamada LLM en vuelo se enfría hasta 180 s). Pero: si el run activo está en estado **cancelling** (flag de cancel puesto), un nuevo `POST /api/analyze` lo **suplanta** (supersede): el run viejo se marca `cancelled`, sus eventos pendientes se descartan y el nuevo toma el slot al instante. Así «Volver y relanzar» funciona sin espera. El `409` solo se devuelve contra un run `running` no cancelado; el cliente lo mapea a `status: 'error'` (R1) con «Ya hay un análisis en curso».

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El LLM inventa hallazgos | Prompts estrictos («solo lo que veas»), validación por reglas, ground truth miniapp ≥ 8/10 |
| Líneas de `line` inexactas del LLM | La validación solo exige rango; el snippet ancla; en 2b se podría relocalizar por búsqueda |
| vLLM con 3 llamadas en paralelo (GPU única) puede colarse | `LLM_CONCURRENCY` en `.env` (bajar a 1 si hace falta) |
| DVWA grande | Scope `vulnerabilities/` + `include/` + guarda de 600 KB con error claro |
| Fuga de API key | `.env` gitignored; key solo en backend; frontend solo `/api` |
| Backend caído en dev | Autodetección → mock (la app siempre funciona) |

## 8. Delegado al constructor

- Copy exacto en modo live (mínimo; coherente con la estética).
- Redacción exacta de los 11 prompts (boceto en el plan; iterar contra la regresión de miniapp).
- Detalle del registro de runs en memoria y del buffer de eventos.
- Organización interna de `backend/` (módulos, fixtures).
- Estructura exacta de miniapp (nombres de rutas/ficheros), siempre que conserve las 10 vulns y `expected-findings.json`.

## 9. Fases siguientes

- **2b:** carpeta real desde el picker, clonado git, PDF real (reportlab), cancel robusto, híbrido reglas+LLM, relocalización exacta de línea.
- **3:** Docker.
