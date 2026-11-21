# Fase 2b — Tus propios proyectos (ruta local + git), streaming LLM, informe PDF completo

Fecha: 2026-11-21 · Estado: diseño propuesto (usuario delegó el scope: «hazlo como mejor consideres»)
Depende de: Fase 2a completa (`v0.2.0`) — motor de 11 agentes LLM, SSE, modo live, miniapp.

## 1. Intención

En la Fase 2a la herramienta solo audita los proyectos de ejemplo de `samples/`. La 2b la convierte en **herramienta de trabajo real**: el usuario audita **cualquier carpeta local de su máquina** y **cualquier repo git público**, sin techos artificiales de duración (streaming), y obtiene un **informe PDF completo** (no solo el alcance). De paso se endurecen los puntos débiles aparcados en las reviews de la 2a (cancel robusto, desduplicación y los 8 minors diferidos).

**Por qué ahora:** el usuario preguntó en QA «¿se supone que la aplicación ya está lista para evaluar vulnerabilidades de cualquier proyecto que cargue?». La respuesta honesta es «solo samples; lo demás es 2b». Esta fase cierra esa brecha: es el paso en que la herramienta le es útil con su propio código.

## 2. Objetivos

| # | Objetivo | Criterio de aceptación |
|---|---|---|
| G1 | Auditar **cualquier carpeta local** por ruta | El usuario pega una ruta en la UI (modo live) → el backend la escanea directamente del disco (sin subir nada) → análisis normal con todos los flujos de la 2a (SSE, cancel, resumen, PDFs) |
| G2 | Auditar **cualquier repo git público** por URL | El usuario pega una URL `http(s)` → el backend hace `git clone --depth 1` en un workspace gitignored → el proyecto queda listado y auditable |
| G3 | **Streaming del cliente LLM** (`stream: true`) | Las respuestas largas ya no chocan con el timeout de gateway (~60 s): el scope completo de DVWA (430k chars, 12 módulos fuera) vuelve a ser auditable; `usage` y tk/s siguen llegando (chunk final) |
| G4 | **Informe PDF completo** (nuevo artefacto, distinto del alcance) | Un botón en el resumen descarga `informe-<proyecto>.pdf`: portada + perfil + meta + hallazgos agrupados por categoría con snippet/exploit/consecuencias/solución |
| G5 | **Cancel robusto** | Cancelar un run en vuelo termina en < 1 s: las llamadas LLM en vuelo se abortan (no se espera a que acaben), se emite `run:cancelled` y el slot se libera al instante |
| G6 | **Desduplicación de hallazgos** | La misma `file:line` reportada por varias categorías se consolida en UN hallazgo (categoría canónica primero) con `alsoCategories: [...]`; la UI y el PDF lo reflejan; el ruido del run DVWA (126 → ~90) desaparece |
| G7 | **Triage de minors diferidos** (de las reviews de la 2a, ledger SDD) | M1 normalizar campos opcionales de finding (`snippet/exploit/consequences/solution` → `""`); M2 `projects: []`/JSON no-array en la autodetección → fallback mock; M4 unificar shape de `run:cancelled` (siempre con `findings`); M5 poda de `RUNS.runs` (terminales del run anterior se limpian en el siguiente `start`); M7 `FakeVulnLLM` propio en `test_runs_api.py` (o fixture compartido declarado); M8 `requirements.txt` → `requirements.txt` (runtime) + `requirements-dev.txt` (test) |

## 3. No-objetivos (2c y más allá)

- **Híbrido reglas (semgrep) + LLM** — es una segunda arquitectura de detección (set de reglas a escribir/mantener); merece su propio diseño (2c). El motor LLM puro ya da 10/10 en miniapp y hallazgos reales en DVWA.
- **Relocalización exacta de línea** por búsqueda (2c): hoy la validación exige rango y el snippet ancla; suficiente.
- Docker «descargable» (Fase 3). Persistencia, multiusuario, i18n, auth.
- Subir la carpeta **desde el picker del navegador** (webkitdirectory → multipart/zip): rechazada como vía principal (ver §6); el picker sigue sirviendo al modo mock.
- Subir/escribir reglas propias; auditoría incremental; diffs entre runs.

## 4. Restricciones

- **Stack invariante**: backend FastAPI + httpx + reportlab; front React 18 + Vite + TS + Tailwind (sin router, sin librería de estado, sin nuevas libs de UI). Todo el copy en español.
- **Herramienta local single-user**: el backend escanea rutas del disco del usuario **a propósito** (confianza = la máquina del usuario; el servidor solo escucha en localhost). Es la decisión central de la 2b y lo que hace viable G1 sin uploads.
- **Endpoint LLM**: OpenAI-compatible **con streaming SSE** (`data: {chunk}\n\n`, `choices[0].delta.content`; el request mandará `stream_options: {"include_usage": true}` para que el chunk final lleve `usage`). `temperature: 0`, `max_tokens: 8000`, `enable_thinking: false` (siguen aplicando). **Aviso (builder check):** el streaming contra `aitana.serbatic.es` **no está verificado todavía** (el spike 2a midió la vía no-streaming). Con streaming, el timeout de gateway (~60 s) pasa a aplicarse solo al **primer byte** (TTFT) — y con prompts de ~100k+ tokens el TTFT puede superar esos 60 s (504 antes del primer chunk, streaming o no). **Por eso la T3 empieza por un spike real contra el endpoint** y la aceptación de G3/T10 es condicional: «el mayor scope que cruce el gateway según el spike» (ver §6.2, §8, §10).
- **Contexto LLM (256k tokens)**: el guard `MAX_TOTAL_CHARS = 600_000` se **mantiene** (≈ 150k tokens + prompt, cabe con margen). Un repo grande que no cabe → el usuario apunta a una subcarpeta (la ruta puede ser cualquier subdirectorio, p. ej. `C:\proyectos\miapp\src`).
- **git** disponible en PATH (v2.56, verificado). Clonado solo `http(s)` (sin `file://`, ssh ni protocolos locales), `--depth 1`, timeout 120 s.

## 5. Enfoques considerados (y decisión)

**¿Cómo llegan los proyectos propios al escáner?**

- **A — El backend escanea la ruta local directamente + clona git en un workspace** (elegido). El backend corre en la máquina del usuario: leer el disco es trivial, sin techos de upload, sin memoria duplicada, y reutiliza `scan_project` tal cual. UX = dos campos en la SourceScreen live: «ruta local» y «URL git».
- **B — Upload desde el picker (webkitdirectory → leer archivos en el navegador → POST multipart/zip)**: experiencia «elegir carpeta» nativa, pero duplica todo el repo en memoria del navegador, tiene techos de tamaño y complejidad (zip, límites, progreso de upload). Rechazada como vía principal; se revisa si A resulta incómodo en uso real.
- **C — Solo git, sin rutas locales**: no cubre la necesidad principal (carpetas de trabajo en curso, sin repo).

**Streaming**: httpx nativo (`client.stream(...)`) — sin añadir el SDK `openai` (dependencia innecesaria; el cliente actual ya modela el contrato).

**Desduplicación**: **consolidar** (un hallazgo + `alsoCategories`) — frente a (i) descartar la categoría posterior: pierde información (la línea era A03 *y* A05) y (ii) badge solo en UI: el ruido seguiría en datos, PDF y conteos.

## 6. Diseño detallado

### 6.1 Proyectos propios (G1, G2) — `backend/app/local_projects.py` (nuevo)

- `register_local(path: str) -> ProjectInfo | None`:
  - `p = Path(path).expanduser().resolve()`; debe existir, ser directorio; **no** dentro de `samples/` (ya se listan solos). **Dentro de `workspace/repos/` SÍ se permite — solo subcarpetas de un clon** (p. ej. `.../dvwa/vulnerabilities`): es la vía de escape para repos grandes (ruling builder-check Q3). Queda prohibido registrar la **raíz exacta** de un clon ya listado como proyecto git (doble registro; 400 «ya está listado como proyecto git»). `scan_project(p, ["."])`; si `scan.files` vacío → `None` (404 en el endpoint).
  - `id` = slug determinista del nombre de carpeta + hash corto del path (evita colisiones entre carpetas homónimas). Se registra en un registry en memoria `LOCAL: dict[id, (root: Path, scope)]` (sin persistencia — Fase 3).
- `register_git(url: str) -> ProjectInfo`:
  - Solo `http://`/`https://`; slug desde el host+repo (p. ej. `github.com-digininja-dvwa`); workspace `workspace/repos/<slug>/` (raíz de repo gitignored, como `samples/dvwa`).
  - Si ya existe el clon → reutilizar (no reclonar); si no, `git clone --depth 1 <url> <dest>` vía `subprocess` con timeout 120 s → error 502 «no se pudo clonar (timeout/fallo git)» si falla.
  - `scope` = `["."]` (el clon completo; si pasa el guard, bien; si no, el usuario puede usar la ruta local del clon apuntando a una subcarpeta).
- **API**:
  - `POST /api/projects/local` `{path}` → 201 `{project: ProjectInfo}` | 400 (mal path) | 404 (sin archivos de código).
  - `POST /api/projects/git` `{url}` → 201 `{project}` | 400 (URL inválida) | 502 (fallo clon).
  - `GET /api/projects` → samples + locales + git (orden: samples primero, luego por nombre). Los proyectos propios llevan `kind: 'local' | 'git'` en el `ProjectInfo` (campo nuevo, opcional) para que la UI los distinga.
- `/api/analyze` funciona sin cambios: `get_project` se extiende para resolver también `LOCAL` (el scan se hace bajo demanda como hoy).
- **Seguridad**: validación de ruta (resolve + `is_dir` + no escapar a samples/workspace); git solo http(s). Es una herramienta local de confianza — no se expone a red.

### 6.2 Streaming del cliente LLM (G3) — `backend/app/llm.py`

- `chat()` mantiene firma y devuelve `ChatResult` igual que hoy, pero **por dentro** usa `client.stream("POST", ...)`:
  - Lee los chunks `data: {...}`; acumula `choices[0].delta.content`; al ver `[DONE]` cierra.
  - `usage`: si el chunk final (o cualquiera) lo trae → lo usa; si no → 0 (tps 0, cosmético; el endpoint del usuario lo trae, verificado en spike 2a).
  - `elapsed_s` se mide igual (t0 → fin del stream) → tk/s real.
  - Error a mitad de stream → `LLMError` (el pipeline ya gestiona: run a ERROR).
- Test con `httpx.MockTransport` emitiendo stream real (múltiples chunks + usage final) — incluido el caso «usage ausente».
- **Consecuencia liberada (condicionada al spike)**: con streaming, el tope real pasa a ser el TTFT del gateway, no la duración de la respuesta. **Ruling (builder-check Q2):** el clon git de DVWA se audita en el E2E apuntando a su **subcarpeta `vulnerabilities/`** (343.622 chars medidos en 2a; el clon completo con `["."]` rozaría el guard y arrastraría `dvwa/js`, `tests/`, etc., que no es corpus de vulnerabilidades). El `PROJECT_SCOPES["dvwa"]` **no** se restaura: DVWA no vive en `samples/` (decisión del usuario) y su scope lo da la ruta registrada.

### 6.3 Cancel robusto (G5) — `main.py` + `pipeline.py` + `runs.py`

- Hoy: cancel → estado CANCELLING; los agentes **en vuelo** acaban su llamada LLM real (20–60 s) antes de descartar; solo los de cola se saltan.
- Nuevo:
  - `RunState` guarda la `asyncio.Task` del `_wrapped` (la crea `POST /api/analyze`).
  - `POST /api/runs/{id}/cancel` (y el supersede) además de pasar a CANCELLING: **`task.cancel()`** sobre la task del pipeline.
  - `run_pipeline` envuelve su cuerpo en `try/except asyncio.CancelledError`: emite `run:cancelled` (con `findings` hasta ahora — shape unificado, ver M4), fija `status = CANCELLED`, y **re-lanza** el `CancelledError` (para que la semántica de task sea correcta).
  - El `finally` de `_wrapped` (cierre de `llm` + `RUNS.finish`) sigue ejecutándose → slot libre < 1 s.
  - El httpx en vuelo se interrumpe con el cancel de la task (httpx respeta cancellation de asyncio).
- Test: run en vuelo (FakeLLM con `delay=0.5`) → cancel a los ~0,1 s → asertar: termina < 0,3 s, `run:cancelled` emitido, `status == CANCELLED`, slot libre, y un run nuevo arranca al instante.

### 6.4 Informe PDF completo (G4) — `backend/app/pdf_report.py` (extender)

- `build_report_pdf(project_name, profile: dict, meta: dict, findings: list[dict]) -> bytes`:
  - Portada: título, fecha, proyecto, meta (archivos/líneas/duración/modelo/tokens).
  - Perfil: lenguaje, frameworks, entry points, descripción.
  - Hallazgos agrupados por categoría (orden canónico A01..A10): cabecera de categoría + count; por hallazgo: `[SEVERIDAD] title`, `file:line`, snippet en bloque monospace, EXPLOIT / CONSECUENCIAS / SOLUCIÓN, y `alsoCategories` si hay.
  - Paginación A4 (reutilizar el wrap de `build_scope_pdf`); fuente Helvetica (WinAnsi cubre el español).
- Endpoint: `POST /api/reports/full-pdf` `{projectName, profile, meta, findings}` → `attachment; filename="informe-<slug>.pdf"`. (Los datos viajan del front que ya los tiene — `run:done` trae findings+meta, y `profile:done` el perfil: el servicio live los guarda.)
- Front: botón **«INFORME PDF ▸»** en el footer del `SummaryScreen` (junto a «GENERAR ALCANCE DE MEJORA»); descarga el blob; toast de éxito/error como el PDF de alcance.

### 6.5 Front — `SourceScreen` modo live (G1, G2 UI)

- Debajo de la lista de proyectos, un bloque **«AUDITAR UN PROYECTO PROPIO»**:
  - Fila 1: input texto (placeholder `C:\proyectos\miapp` o `/home/user/proj`) + botón **«AUDITAR RUTA»** → `POST /api/projects/local` → si ok, el proyecto aparece en la lista y queda seleccionado; si 400/404, inline error bajo la fila.
  - Fila 2: input URL (`https://github.com/...`) + botón **«CLONAR Y AUDITAR»** → `POST /api/projects/git` → estado «clonando…» (el clone tarda) → idem.
- Sustituye la nota actual «Fase 2b: carpeta local y repositorio git».
- `ProjectInfo.kind` → las filas propias llevan un tag discreto (`LOCAL` / `GIT`) a la derecha.
- El resto del flujo (vulns → progreso → resumen → alcance) es idéntico: `source.value` ya es el `id` del proyecto.

### 6.6 Desduplicación (G6) — `pipeline.py`

- Tras validar los hallazgos de todos los agentes, antes de `run:done`: consolidar por `(file, line)`:
  - El primero en orden canónico de categoría gana (`vulnId`, `title`, snippet, etc.); los demás aportan su `vulnId` a `alsoCategories: string[]` (solo si ≥ 1; campo opcional → shape de `Finding` invariante hacia atrás).
  - El `id` se renumera por categoría ganadora (`A03-1`, `A03-2`, …) — el contrato `id = "{vulnId}-{n}"` se mantiene.
- Log: una línea `descartados N duplicado(s) entre categorías`.
- Front: el tag de `FindingCard` pasa a `A03 · INYECCIÓN +1` (cyan discreto) cuando `alsoCategories.length > 0`; el tooltip enumera las categorías. El texto del alcance cuenta hallazgos consolidados.
- **No** cambia: validación anti-alucinación, severidades, ni el ground truth (miniapp no tiene duplicados → 10/10 se mantiene).

### 6.7 Minors diferidos (G7)

- **M1** — `pipeline.py` al añadir a `run.findings`: `snippet/exploit/consequences/solution = str(f.get(k) or "")`.
- **M2** — `App.tsx`: `.then(list => { if (!Array.isArray(list) || list.length === 0) throw ...; ... })` → `projects: []` o JSON roto caen al mock (cierra también el `res.json()` sin `Array.isArray` aparcado en la Task 7).
- **M4** — `run:cancelled` siempre con `findings` (el del supersede de `runs.py` pasa a incluir `active.findings`).
- **M5** — `RunRegistry.start`: al arrancar un run nuevo, purgar de `runs` los terminales anteriores (el activo se conserva siempre).
- **M7** — `test_runs_api.py`: `FakeVulnLLM` local (duplicar los ~25 líneas) o fixture en `conftest.py`; decisión del builder.
- **M8** — `requirements.txt` (fastapi, uvicorn, httpx, reportlab) + `requirements-dev.txt` (`-r requirements.txt`, pytest, anyio); documentar en README.
- **Out-of-scope (re-review 2a)**: en supersede/cancel, el agente en vuelo no emite su `agent:done` — con el cancel robusto (G5) el run muere < 1 s y el front ya cerró en `run:cancelled`; se documenta como comportamiento conocido, sin cambiar.

## 7. Riesgos y limitaciones conocidas

| Riesgo | Mitigación |
|---|---|
| Clones grandes/lentos (repo de 10 GB) | `--depth 1` + timeout 120 s + mensaje de error claro; el usuario puede clonarlo a mano y usar la ruta local (G1) |
| Provider sin `usage` en streaming | tk/s = 0 (cosmético); el análisis no se ve afectado |
| Repros que superan 600k chars | El usuario apunta a una subcarpeta (la ruta puede ser cualquiera); se documenta en UI y README |
| Cancellation de httpx en Windows/edge cases | Cubierto por test de cancel en vuelo; si httpx no respeta el cancel, fallback: el run aún termina al acabar la llamada (comportamiento 2a) |
| Dos proyectos con el mismo nombre de carpeta | id = slug + hash del path (colisiones imposibles en la práctica) |

## 8. Estrategia de tests y aceptación

- **Backend (pytest)**: registro local/git (git contra un **bare repo local** en tmp — sin red), streaming con `MockTransport` multi-chunk, cancel en vuelo (< 1 s), consolidación de duplicados (2 categorías misma línea → 1 hallazgo + `alsoCategories`), informe PDF (header `%PDF-`, página por categoría, contenido presente), triage M1–M8 (uno o dos asserts cada uno), suite completa limpia.
- **Front (vitest)**: SourceScreen con los 2 campos (ok/error/clonando), tag `+N` en `FindingCard`, botón informe PDF (fetch + download), autodetección con `projects: []` → mock (M2).
- **E2E real (última task)**: clonar DVWA **vía la propia API git** (prueba G2 con red real) → registrar su subcarpeta `vulnerabilities/` como proyecto local (343k; valida también la vía de escape del Q3) → run completo con streaming (scope mayor al de la 2a si el spike lo permite; anotar el TTFT medido), informe PDF descargado y abierto, ground truth miniapp **10/10** intacto (regresión), tag `v0.3.0`.

## 9. Desglose de tasks (borrador para el plan)

1. **T1** — Proyecto por ruta local (`local_projects.py`, `POST /api/projects/local`, `kind` en `ProjectInfo`, tests).
2. **T2** — Proyecto por git (workspace, `POST /api/projects/git`, tests con bare repo local).
3. **T3** — Streaming en `LLMClient`: **paso 0 = spike real** contra `aitana.serbatic.es` con `stream: true` (¿funciona? ¿llega `usage` con `stream_options`? ¿TTFT con prompt ~100k+ tokens?) — el spike fija la aceptación de G3/T10; luego implementación (MockTransport multi-chunk, usage, fallback 0).
4. **T4** — Cancel robusto (task.cancel + `CancelledError` en pipeline + test < 1 s) + M4/M5 en el proceso.
5. **T5** — Desduplicación (consolidación + `alsoCategories` + log + test).
6. **T6** — Informe PDF completo (`build_report_pdf` + endpoint + test).
7. **T7** — Front SourceScreen: ruta local + URL git (tests).
8. **T8** — Front: botón informe PDF + tag `+N` de duplicados (tests).
9. **T9** — Triage de minors restantes (M1, M2, M7, M8 + README de requirements).
10. **T10** — E2E real (DVWA vía git + subcarpeta `vulnerabilities/` vía ruta local, run con streaming al mayor scope que pase el gateway, PDF, ground truth 10/10, final review, tag `v0.3.0`).

Ritmo previsto: 2–4 tasks por sesión (AGENTS.md) → 3 sesiones de ejecución.

## 10. Decisiones del coordinador (delegación del usuario)

- **Scope 2b = núcleo** (G1–G7). Semgrep-híbrido y relocalización exacta → **Fase 2c** (propio diseño): el motor LLM puro ya es útil (10/10 + DVWA real) y el híbrido es una segunda arquitectura que no conviene mezclar con el «poder auditar mis proyectos», que es lo que el usuario necesita ya.
- **Vía de entrada: ruta local (A)**, no upload desde picker (B): la 2b se apoya en que el backend corre en la máquina del usuario; el upload duplica datos y añade techos. Si en uso real resulta incómodo, B se revisa con datos.
- **Guard de 600k chars se mantiene**: con streaming el cuello de botella pasa a ser el contexto del LLM, y 600k chars ≈ 150k tokens cabe en 256k con margen; apuntar a subcarpetas cubre lo grande.
- **Informe PDF desde el front** (el front ya tiene findings+meta+perfil de `run:done`/`profile:done`): evita que el backend guarde runs para siempre (M5 los poda).
- **DVWA**: se deja fuera de `samples/` (decisión del usuario en QA); en el E2E de la T10 vuelve **vía git** (prueba real de G2) y queda en `workspace/repos/` (gitignored — **añadido al `.gitignore`**).
- **Rulings del builder check** (2026-11-21, subagente fresco contra el diseño): (Q1) el streaming no estaba verificado contra el endpoint real y el TTFT de prompts grandes puede superar el timeout de gateway → la T3 empieza por spike real y la aceptación de G3/T10 es «el mayor scope que cruce el gateway según el spike»; el request mandará `stream_options: {"include_usage": true}` y, si el provider no devuelve `usage` en streaming, tk/s=0 (cosmético, ya estaba en riesgos). (Q2) scope del clon DVWA en el E2E = subcarpeta `vulnerabilities/` (343k), no el clon completo ni el `PROJECT_SCOPES` restaurado. (Q3) `register_local` permite subcarpetas de `workspace/repos/` (vía de escape para repos grandes) salvo la raíz exacta de un clon ya listado. Resuelto también por el builder sin riesgo: `workspace/` al `.gitignore`; dedup solo entre categorías (los dobles intra-categoría se conservan); `profile:done` se guarda en el servicio live para el informe PDF; `workspace/` no existe aún en `.gitignore` → se añade en la T2.
- **Pendiente del usuario (única cuestión externa):** si el spike T3 mide TTFT > 60 s para prompts grandes, la solución barata es subir `proxy_read_timeout` en el gateway de `aitana.serbatic.es` (el usuario es el dueño); si no puede, la aceptación queda en «el mayor scope que cruce» y se documenta.
