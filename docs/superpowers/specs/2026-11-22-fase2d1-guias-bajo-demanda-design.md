# Diseño — Fase 2d.1 «Guías bajo demanda» (cómo explotar al pinchar + al exportar)

Fecha: 2026-11-22 · Status: PENDIENTE DE APROBACIÓN · Tag previsto: `v0.4.1`

## Intención y porqué

La Fase 2d generaba la guía de explotación **durante el análisis** (oleada 3: 1 llamada
LLM por hallazgo, +5–7 min en un run de 51 hallazgos). Al verlo en uso, el usuario
percibe el botón «CÓMO EXPLOTAR ▸» como «ya renderizado» y quiere que la llamada LLM
se pague **solo cuando la guía se consume de verdad** (ruling 2026-11-22): al pinchar
el botón (ver la guía) o al exportar el PDF de resultados (todas a la vez). Modo
elegido por el usuario: **híbrido** — al pinchar se genera esa una; al exportar se
generan solo las que faltan. El análisis vuelve a 2 oleadas (rápido). Se conserva el
ruling «siempre modo real»: sin guías mock; en modo mock no hay botón.

## Objetivos

- **G1** — `run_pipeline` deja de generar guías: sin oleada 3; los findings de
  `run:done`/`run:cancelled` no llevan `guide`; el coste del análisis vuelve al de la 2c.
- **G2** — Botón «CÓMO EXPLOTAR ▸» (modo live): al pinchar, el backend genera la guía
  de ese hallazgo al momento (1 llamada LLM); el modal muestra estado de carga; al
  terminar, la guía se guarda en el estado de la UI (re-pinchazo = instantáneo, sin
  re-gastar).
- **G3** — «EXPORTAR RESULTADOS A PDF»: el backend genera en paralelo (pool
  `llm_concurrency`) **solo** las guías de los hallazgos que no lleven `guide` y el
  PDF sale completo (todos con el bloque GUÍA DE EXPLOTACIÓN de la 2d).
- **G4** — Samples corregidos: la vulnerabilidad del nombre de cada demo queda dentro
  del alcance detectable de los agentes (todo en extensiones que el scanner lee).

## No-objetivos (anti-goals)

- Sin eventos SSE ni tk/s en vivo para las guías (ni al pinchar ni al exportar).
- Sin persistencia de guías en disco (mueren con la sesión UI).
- Sin regeneración/refresco de una guía ya generada.
- Sin guías en modo mock (ruling «siempre modo real»).
- Sin cambios en los prompts de los agentes de vulnerabilidad (el XSS/DOM sigue fuera
  de scope de A03).
- Sin cambios en el PDF de alcance (`build_scope_pdf` y `/api/reports/scope-pdf`).
- Sin nueva generación «bajo demanda» para otros artefactos (solo guías).

## Restricciones

- Stack inmutable: Vite 5 + React 18 + TS strict + Tailwind 3.4 + Vitest / FastAPI +
  reportlab. Cero dependencias nuevas.
- Contrato SSE inmutable: ningún tipo de evento nuevo; la guía bajo demanda es REST
  normal.
- Copy de UI en español; paleta inmutable.
- I/O de disco fuera del event loop (re-escaneo en `asyncio.to_thread`); build del PDF
  también fuera (threadpool) al hacerse ahora en endpoint `async def`.
- Workflow del repo: TDD estricto, 1 commit convencional por task, suites completas
  una vez al final de cada task, push + tag del coordinador tras final review.

## Enfoques considerados (decisión del usuario)

| Opción | Qué pasa | Qué pierde |
|---|---|---|
| **A · Al pinchar** | 1 llamada por clic; análisis rápido | PDF incompleto: solo guían los hallazgos abiertos a mano |
| **B · Al exportar** | N llamadas en paralelo al exportar; PDF completo | El botón/modal no tiene nada que mostrar en la vista (muere) |
| **Híbrido (elegido)** | A para la vista + B para el export, reutilizando lo generado en la UI | Más superficie (endpoint nuevo + estados de carga), pero sin llamadas desperdiciadas: cada guía se genera a lo sumo una vez |

El análisis de la 2d (oleada 3) se descarta como opción: el usuario no quiere pagar
la guía en el análisis si no la consume.

## Cómo — Backend

1. **Revertir la oleada 3** en `pipeline.py`: borrar el bloque `run_guides` tras
   `_consolidate` y su import. **Se conserva** la línea R3-1 del check post-chat
   (`(ERROR, CANCELLED)` sin `CANCELLING`): es independiente de las guías (findings
   parciales en `run:cancelled`). Revertir en los fakes de `test_pipeline.py` y
   `test_runs_api.py` la rama «guías de explotación» y restaurar
   `test_pipeline_full_sequence` a `totalTokens==10 / avgTps==25.0`.
   `run_guides` y el resto de `guides.py` se **conservan** (se reutilizan en G3).
   Los tests de la oleada 3 (`test_pipeline_wave3_*`) se eliminan en el revert; el
   comportamiento R3-1 que queda vivo (findings del agente en vuelo sobreviven a
   `CANCELLING` y llegan en `run:cancelled`) **debe seguir cubierto por algún test**
   tras el revert (el plan decide cuál se adapta quitando lo específico de guías).
2. **Refactor de reuso** en `guides.py`: extraer el núcleo por hallazgo como
   `async def one_guide(llm, finding: dict, file_content: str | None, profile: Profile | None,
   project_name: str) -> str | None`
   (`build_guide_prompt` → `llm.chat(system, user, max_tokens=GUIDE_MAX_TOKENS)` sin
   `on_progress` → `extract_guide`; devuelve `None` en `LLMError` o texto vacío —
   misma semántica que «Guía no disponible»). `run_guides` pasa a llamar `one_guide`
   dentro del pool, sin cambiar comportamiento ni logs.
3. **Nuevo endpoint** `POST /api/guides` (la guía al pinchar):
   - Body: `{"projectId": str, "finding": dict, "profile": dict | None}` (el finding
     tal cual del estado de la UI; el profile opcional lo reconstruye el backend como
     `Profile` con sus campos conocidos; si no, `None` — el prompt ya soporta sin perfil).
   - Resuelve el proyecto con la misma cadena que `analyze`
     (`local_analyze or git_analyze or get_project(samples_dir, projectId)`) y
     re-escanea en `asyncio.to_thread` → `(project, scan)`.
   - `file_content` = contenido de `finding["file"]` si está en el escaneo, si no
     `None` (degradación: la guía se ancla al snippet; mismo caso que ya maneja el
     prompt).
   - `guide = await one_guide(build_llm(), finding, file_content, profile, project.name)`.
   - 200 `{"guide": <texto>}` · 404 proyecto no encontrado · 502 `{"detail": "No se
     pudo generar la guía"}` si `one_guide` da `None` o falla el LLM.
   - Endpoint `async def`.
4. **`POST /api/reports/full-pdf`** (el PDF con guías al exportar):
   - `ReportPdfBody` gana `projectId: str | None = None` (aditivo; sin `projectId`
     comportamiento actual, sin generación — backward compatible).
   - El endpoint pasa a `async def`. Si hay `projectId` y algún finding **sin**
     `guide`: resolver+re-escanear (to_thread) → reconstruir `profile` desde el body
     (el front ya lo manda) → `await run_guides(build_llm(), findings, scan, profile,
     project.name, run=None, concurrency=llm_concurrency)` (muta los findings in situ,
     añade `guide` solo a los que salgan con texto).
   - `run_guides` admite `run: RunState | None = None`: con `None` no hay guards de
     estado ni eventos `log` (no hay run a quien emitírselos); con run, igual que hoy.
   - El PDF se construye con `build_report_pdf` (sin cambios: ya dibuja el bloque si
     hay `guide`) dentro de `asyncio.to_thread`.
   - **Si `projectId` está pero el proyecto ya no se resuelve** (registro `LOCAL`
     en memoria no sobrevive a un reinicio del backend; o la carpeta fue borrada):
     **404** `{"detail": "Proyecto no encontrado"}` (mismo contrato que
     `POST /api/guides`). El frontend decide la degradación (ver sección Frontend 3):
     nunca hay degradación silenciosa del backend.

## Cómo — Frontend

1. **`FindingCard`**: el botón se renderiza si `finding.guide` **o** el prop
   `canGenerateGuide` (true solo en modo live con `projectId`). Al pinchar:
   - con `finding.guide` → abre el modal con contenido (como hoy);
   - sin ella → abre el modal en estado **carga** y llama a
     `POST /api/guides {projectId, finding, profile}`; a 200 invoca
     `onGuideReady(finding.id, guide)` (actualiza el estado compartido del análisis)
     y el modal muestra el contenido; a error muestra estado **error** con botón
     «REINTENTAR» (repite la misma llamada).
   - Props nuevas: `projectId?: string`, `profile?: object | null`,
     `canGenerateGuide: boolean`, `onGuideReady: (id: string, guide: string) => void`.
2. **`ExploitGuideModal`**: props aditivos `loading?: boolean`, `error?: string | null`,
   `onRetry?: () => void`. Vista carga: spinner + «GENERANDO GUÍA DE EXPLOTACIÓN…» +
   «puede tardar 15–30 s». Vista error: mensaje + botón «REINTENTAR». Vista contenido
   invariable (parseo `##`/fences de la 2d).
3. **Export** (`SummaryScreen.downloadReport`): el body de `/api/reports/full-pdf`
   gana `projectId` (solo modo live; mock no lo manda y no genera). El `reportBusy`
   «GENERANDO…» existente cubre la espera (con muchos hallazgos sin guía puede durar
   minutos; es el coste que el usuario eligió pagar en el export).
   - **Si el backend devuelve 404** (proyecto ya no resoluble): el front **reintenta
     la exportación sin `projectId`** (el PDF se genera como hoy, sin guías faltantes)
     y muestra la nota «Informe exportado sin las guías pendientes (el proyecto ya no
     está disponible)» en la zona de estado/error existente. El export nunca falla por
     esto y nunca degrada en silencio.
4. **Estado compartido**: el dueño del estado de análisis expone
   `updateFindingGuide(id, guide)` (o equivalente) para que la guía generada sobreviva:
   re-pinchazo instantáneo y el export la reutiliza sin re-gastar.

## Cómo — Samples (cambio pequeño, contenido)

Root cause diagnosticado (run real `19978d77` + `CODE_EXTS` del scanner): el scanner
solo lee `.py .js .ts .jsx .tsx .php .java .rb .go .cs` (los `.html` son invisibles)
y el prompt de A03 busca solo inyección de lado servidor (SQL/comandos/`eval` vía
`req.*`).

- **`DEMO-Injection/`** → sustituir el XSS por **SQLi de libro en `.js`** (~15 líneas,
  autocontenido sin express): un handler que construye
  `SELECT * FROM users WHERE user = '<entrada>'` por concatenación (`req.query.user`)
  y lo pasa a un `db.exec` stub inline (comentario: en un sistema real sería la BD).
  README actualizado (payload tipo `?user=' OR '1'='1`).
- **`DEMO-Broken-Access-Control/`** → mover `API_KEY`/`DB_PASS` a un nuevo
  **`admin.js`** escaneable (constantes del panel + cero comprobación de auth) y que
  `admin.html` lo cargue (el `<pre>` con los secretos sale del HTML). README actualizado.
- **`DEMO-Authentication-Failures/`** → sin cambios (ya funciona: credenciales en `app.js`).
- **Verificación**: run real de DEMO-Injection → ≥1 hallazgo A03 en `app.js`; run de
  DEMO-Broken-Access-Control → ≥1 hallazgo que ancle `admin.js`.

## E2E final (LLM real, cierre de fase)

1. Re-run de los 3 samples (G4): Injection ≥1 A03; BAC incluye `admin.js`; Auth igual.
2. Run híbrido: analizar un sample → el run **no** tiene log de oleada 3 ni `guide` en
   findings (G1) → `POST /api/guides` a 1 hallazgo (G2) → `POST /api/reports/full-pdf`
   con `projectId` y findings (el del clic con `guide`, el resto sin) → PDF verificado
   por bytes: label de guía en **todos** los hallazgos (los faltantes se generaron en
   el export, G3); `scope-pdf` sin bloque.
3. Front: botón visible en live; clic → carga → guía; re-clic instantáneo; modo mock
   sin botón; export con `reportBusy`.
4. Servidores dejados ARRANCADOS para QA del usuario.

## Lo que queda al builder (el plan)

- Nombres exactos de tests, fakes y valores (tokens de los fakes de guía ya existen en
  `test_guides.py`), mensajes exactos de los estados de carga/error/retry en español,
  `data-testid` de los nuevos estados, orden de tasks y commits.
- Decidido aquí y no al builder: interfaces y firmas de los 4 puntos de backend, los
  props del front, el body de los endpoints, la degradación `profile=None`/
  `file_content=None`, y `run=None` en `run_guides`.
