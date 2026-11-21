# Serbatic Security Inspector — Hoja de progreso

> **Fuente de verdad de «dónde estamos».** Actualízala al final de cada sesión (1 minuto).
> Una sesión nueva empieza leyendo `AGENTS.md` y esta hoja; no necesita el historial del chat.

## Estado actual

- **Fase:** 1 + 1.1 — **COMPLETA** (15/15 + 4/4, push + tag v0.1.0; 77/77 tests, build limpio)
- **Fase 2a** (motor de análisis real: backend FastAPI + 11 agentes LLM + SSE + modo live en el front) — **COMPLETA** (8/8 tasks, push; tag `v0.2.0` pendiente de la final review del coordinador)
- **Tarea en curso:** ninguna
- **Siguiente:** **Fase 2b** (carpeta real desde el picker, clonado git, PDF real, cancel robusto, híbrido reglas+LLM, relocalización de línea) + pendiente del coordinador: final review de rama `main..HEAD` de Fase 2a + tag `v0.2.0`. **Pendiente del usuario:** QA visual en navegador del modo live (ver «Instrucciones de prueba para el usuario» en `.superpowers/sdd/fase2a-motor-analisis-real/task-8-report.md`)
- **QA visual pendiente (navegador, `npm run dev` → http://localhost:5173, mockups en `.superpowers/brainstorm/430-1795195954/content/`):**
  - R1: H1 de home — degradado cian→magenta vs plano del mockup; comprobar en pantalla.
  - R2: formato de línea del log en vivo (ProgressScreen): `[mm:ss]` + tag + mensaje.
  - R3: glow y cabecera del modal de alcance (borde cian, sub bajo el título).
  - R4: opacidades sutiles (filas no seleccionadas, estados pending).
  - R5: SourceScreen no tiene mockup — comprobar que sigue la plantilla de diseño.
  - R6: salto de línea del titular de home según ancho.
  - R7 (nuevo 1.1): fondo ambiental full-bleed — el glow cian/magenta cubre toda la viewport (no el «recuadro»); el resumen se ve algo más intenso que antes (alfas 0.22/0.18 vs 0.10/0.08 anteriores, prescritos por el plan).
  - R8 (nuevo 1.1): carpeta real — en «Carpeta local», 📂 SELECCIONAR CARPETA abre el picker de carpetas (Chrome/Edge); confirmar nombre + nº de archivos, CONTINUAR habilitado, y que deselecciona el proyecto demo. Nota: elegir la MISMA carpeta de nuevo no dispara el evento (estándar de los navegadores).
  - R9 (nuevo 2a, modo live con backend real): con `uvicorn` corriendo, la fuente debe listar los proyectos reales (dvwa + miniapp, sin los 3 demos ni git); el análisis debe mostrar progreso real (log con hallazgos reales, tiempos de agentes) y el resumen con snippets/exploit/solución reales. Con el backend **apagado**: banner de error y caída al modo mock con la lista de demos.
- **Bloqueos / pendientes externos:**
  - ✅ **Node:** instalado **Node 26.13.1** + npm 11.20 (cumple el floor Node ≥ 20 del plan).
  - ✅ **GitHub:** repo `rferreroSerbatic/SerbaticSecurityInspector` (privado) creado; `main` + tag `v0.1.0` pushados (2026-11-21).
  - ✅ **Python:** 3.12.10 instalado (2026-11-21, winget) + venv `backend/.venv`.

## Cómo retomar (para una sesión nueva)

1. Leer `AGENTS.md` (guía operativa del proyecto).
2. Leer la sección «Estado actual» de esta hoja.
3. Localizar la **primera task sin `- [x]`** en las listas «Progreso del plan (Fase 1)» y «Progreso Fase 1.1» de esta hoja (los checkboxes de los planes son por paso, no por task).
4. Ejecutarla con TDD (test → fail → implementar → pass) y terminar con commit + push (pauta 2026-11-21: **commits agrupados** — uno por task con sus fix rounds incluidos — y **comprobaciones reducidas**: suite completa + build solo al final de la task; ver `AGENTS.md` «Reglas de trabajo»).
5. Marcar la task `- [x]` en el plan, actualizar «Estado actual» aquí y, si hubo decisiones nuevas, el registro de abajo.
6. Si la sesión se agota a medio task: dejar la task con lo hecho anotado en «Tarea en curso» (qué falta).

## Progreso del plan (Fase 1)

- [x] Task 1: Scaffold + git + GitHub *(commit 550fd40, review limpia; push hecho 2026-11-21)*
- [x] Task 2: Primitivas UI (NeonButton, SeverityBadge, ProgressBar, Modal) *(commit 23326b5, review limpia)*
- [x] Task 3: Tipos de dominio + datos OWASP Top 10 *(commit 1fb3f66, review limpia)*
- [x] Task 4: Hallazgos mock (A10 con 0 a propósito) *(commits 0f5957e+5f0f3a7, review limpia tras 1 fix round)*
- [x] Task 5: Máquina de estados `useAnalysis` *(commit abe7aca, review limpia)*
- [x] Task 6: `mockAnalysisService` (agentes secuenciales, log, cancel) *(commit 8a72961, review limpia)*
- [x] Task 7: AppShell + StepIndicator *(commit 5f1ff7f, review limpia)*
- [x] Task 8: HomeScreen *(commit 5339a1e, review limpia)*
- [x] Task 9: SourceScreen (carpeta mock + URL git) *(commit 4634703, review limpia)*
- [x] Task 10: VulnSelectScreen (lista vertical) *(commits 49b69bc+91b3c97, review limpia tras 1 fix round)*
- [x] Task 11: ProgressScreen (progreso en vivo) *(commits 7f6ba72+a469c9a, review limpia tras 1 fix round)*
- [x] Task 12: SummaryScreen (resumen de hallazgos) *(commit b1ce397, review limpia)*
- [x] Task 13: `buildScopeText` (texto del alcance) *(commit 33aa870, review limpia tras 1 fix round: ruling de casing + enmienda del plan)*
- [x] Task 14: ScopeModal (editable, copiar, PDF-stub) *(commit bd20dab, review limpia — el checkbox quedó sin marcar por error de bookkeeping; corregido 2026-11-21)*
- [x] Task 15: Cableado E2E + QA visual contra mockups *(commit ccba51e, review limpia; QA browser residual R1–R6 para el usuario)*

## Progreso Fase 1.1 (plan `2026-11-21-fase1-1-ux-fondo-navegacion-carpeta.md`)

- [x] Task 1: Fondo ambiental full-bleed en AppShell *(commits c82c8c9+ed79be3 — incluye glow de VulnSelectScreen, ruling; review limpia)*
- [x] Task 2: Navegación hacia atrás (goVulns, migas de pan clicables, Volver en Progreso/Resumen) *(commits 64814dc+59749de — fix round: afterEach(cleanup); review limpia)*
- [x] Task 3: Selector de carpeta real (webkitdirectory) en SourceScreen *(commits 9f888ee+33398b3 — fix round: webkitdirectory="" sin warning de React; review limpia)*
- [x] Task 4: E2E de «volver» + verificación final *(commit 36f1f6f; review limpia)*
- **Final review de rama (79974a2..36f1f6f): limpia** — 5 Review Focus PASS, sin Critical/Important, 5 minors diferidos (ver registro de decisiones).

## Progreso del plan (Fase 2a) — plan `2026-11-21-fase2a-motor-analisis-real-plan.md`

- [x] Task 1: Setup Python + scaffold backend (FastAPI, `.env`, pytest) *(commit 99645be, review limpia)*
- [x] Task 2: Scanner + miniapp de ejemplo + `GET /api/projects` *(commit 762ce06 — 1 fix round: pytest.ini amendado al commit; review limpia)*
- [x] Task 3: Cliente LLM + agente perfilador *(commit 22d8137, review limpia)*
- [x] Task 4: Agentes de vulnerabilidad A01–A10 (prompts, parse, validación) *(commit 5c26bb5, review limpia)*
- [x] Task 5: Pipeline de 2 oleadas + registro de runs + SSE + cancel/supersede *(commit ed4ee4c — 1 fix round: race check-then-act de `cancel_run` → `async def`; review limpia)*
- [x] Task 6: `liveAnalysisService` (SSE) + estado de error en el front *(commit 79cc5a7, review limpia)*
- [x] Task 7: Modo live (autodetección, proyectos reales, banner de error, proxy Vite) *(commit 51cce1b, review limpia)*
- [x] Task 8: E2E real (LLM + DVWA) + ground truth + cierre *(commit `test: ground truth miniapp y cierre E2E de Fase 2a`, ver git log; final review de rama + tag `v0.2.0` pendientes del coordinador)*

## Entorno

| Cosa | Estado |
|---|---|
| Node | **v26.13.1** ✓ (instalado 2026-11-20) |
| npm | 11.20.0 ✓ |
| git | 2.56 ✓ (repo local inicializado, commit 0 hecho) |
| Python | **3.12.10** ✓ (instalado 2026-11-21, winget) + venv `backend/.venv` |
| GitHub | ✅ `rferreroSerbatic/SerbaticSecurityInspector` (privado) — `main` + `v0.1.0` pushados (2026-11-21) |
| Mockups aprobados | `.superpowers/brainstorm/430-1795195954/content/*.html` — **no borrar** (QA visual de la Task 15); están gitignored |

## Registro de decisiones

- 2026-11-20 — Stack: **React (Vite) + Tailwind**, backend FastAPI (Python) en Fase 2. Aprobado.
- 2026-11-20 — Estética: **Cyberpunk** (negro `#06060b`, cian `#00e5ff`, magenta `#ff2d95`). 5 mockups aprobados en navegador.
- 2026-11-20 — Selección de vulnerabilidades: **lista vertical** (sobre cuadrícula de tarjetas).
- 2026-11-20 — Node 20 **sustituye** al Node 14 (nvm-windows si hiciera falta).
- 2026-11-20 — Estado de la app **en memoria** (sin persistencia) en Fase 1.
- 2026-11-20 — Modal del alcance con botón **«Copiar texto»** (el PDF sigue siendo stub en Fase 1).
- 2026-11-20 — Mock: **A10 (SSRF) sin hallazgos**, para ejercitar el estado vacío.
- 2026-11-20 — Design doc aprobado; plan de 15 tasks escrito (en `docs/superpowers/plans/`).
- 2026-11-20 — **Fase 1 completa**: 15/15 tasks + final review de rama completa + fix wave (`60ccef8`). 65/65 tests, build limpio.
- 2026-11-21 — Push a GitHub: `main` + tag `v0.1.0` en `rferreroSerbatic/SerbaticSecurityInspector` (privado). Queda pendiente QA visual en navegador (R1–R6).
- 2026-11-21 — **Fase 1.1** (pedida por el usuario tras probar en navegador): fondo a ancho completo, volver entre fases + migas de pan, selector de carpeta real en el front (análisis sigue mock). Los 3 proyectos demo se conservan. **Pendiente de conversación:** proyectos demo reales (p. ej. un form sencillo con vulnerabilidades básicas que se pueda probar de verdad).
- 2026-11-21 — **Fase 1.1 completada** (4/4 tasks + reviews por task + final review de rama limpia; 77/77 tests, build limpio). Rulings que desviaron del texto literal del plan (todos en el ledger SDD, verificado por el final reviewer): (1) el glow de `VulnSelectScreen` también se eliminó (la lista de archivos del brief lo omitía, pero su texto normativo exige «ninguna pantalla renderiza radial-gradient»); (2) `webkitdirectory=""` + ampliación `declare module 'react'` en vez del `declare global` del brief (incompilable con TS 5.6: lib.dom ya declara `webkitdirectory: boolean`; y el atributo sin valor generaba warning de React 18, prohibido por el propio criterio «output sin warnings» del plan); (3) la prioridad de la carpeta real sobre los demos es incondicional (el brief lo prescribe) → si el usuario elige carpeta y luego un radio demo, CONTINUAR sigue mandando la carpeta (la línea de confirmación lo hace visible) — **diferido a Fase 2** como UX a resolver junto con el análisis real; (4) duplicación del par cancel en `useAnalysis` (ahora 5×) — diferido a Fase 2 (helper `cancelCurrent()`); (5) la ampliación de tipos de `webkitdirectory` vive en `SourceScreen.tsx` — mover a tipos compartidos cuando aparezca un segundo consumidor; (6) doc-level: la spec dice «Seleccionar carpeta…» y el plan/la app usan «📂 SELECCIONAR CARPETA» (el plan manda; alinear la spec en la próxima edición).
- 2026-11-21 — Sesión de ejecución: por instrucción del usuario, todos los subagentes corrieron con `aitana/qwen3.8-fp8` (Qwen3.8 Aitana LLM) a partir de media Fase 1.1 (la implementación de la Task 2 ya estaba hecha con otro modelo y se mantuvo).
- 2026-11-21 — **Pautas de trabajo nuevas (usuario, tras Fase 1.1):** (1) **menos commits, agrupados**: uno por task, con la implementación y sus fix rounds de review en el mismo commit (amendar antes de pushear; push único al terminar la task) — en Fase 1.1 salieron 9 commits + 1 docs; objetivo a partir de ahora ≈1 commit por task. (2) **menos comprobaciones**: rojo→verde solo del test de la task; suite completa + `npm run build` una sola vez al final de la task; sin re-ejecuciones del coordinador que dupliquen evidencia ya dejada en el report del subagente. Detalle en `AGENTS.md` «Reglas de trabajo».
- 2026-11-21 — **Sesión Fase 2a — Tasks 5–7 completadas** (backend: pipeline + runs + SSE; front: liveAnalysisService + modo live). 27/27 tests backend, 89/89 front, builds limpios. Rulings relevantes (detalle en el ledger SDD): (1) **race real encontrada en review de Task 5**: el endpoint `cancel_run` síncrono (threadpool) podía dejar un run zombie `CANCELLING` tras `run:done` y colgar el stream SSE de un cliente tardío → fix `async def cancel_run` (check-then-act atómico en el event loop); (2) **Task 7**: `AbortSignal.timeout(1500)` verificado presente en jsdom/Vitest (no hizo falta fallback `AbortController`); timeout también en el fetch de `/api/projects` (fuera de brief, razonable); autodetección con 3 modos (`service` / `projects` / auto) y modo mock intacto. **Minors diferidos a la final review** (ver ledger): descarte post-terminal de un run suplantado (cosmético), `res.json()` sin `Array.isArray` en App.tsx, `projects: []` en modo live = callejón sin salida (revisar en E2E de la Task 8), + nits de tests.
- 2026-11-21 — **Fase 2a completada (8/8) — Task 8 (E2E real + ground truth + cierre).** DVWA desde el zip del usuario (master de GitHub, misma rama que `git clone`): el master reorganizó la estructura (no existe `include/`; el equivalente es `dvwa/includes/`, 4 archivos, ~87k chars, dominados por `Parsedown.php` de 1994 líneas). **El scope completo (166 files, 430.418 chars < MAX_TOTAL_CHARS 600k) no era viable**: el endpoint del LLM tiene un timeout de gateway (~60 s, nginx) y el cliente es no-streaming (no llega ningún byte hasta terminar toda la respuesta): run 1 (430k) → 504 en los 3 agentes de la 1ª oleada (~61 s); run 2 (16 módulos, 220k) → 1/3 OK en 48 s, 504 en el resto; probe de latencia directa a 127k chars → 23,1 s. **Scope final de DVWA: 12 módulos clásicos** (`sqli, sqli_blind, xss_s, exec, fi, upload, brute, authbypass, csrf, weak_id, open_redirect, csp` = 89 files, 127k chars) — documentado con comentario en `PROJECT_SCOPES`. **E2E DVWA (run `36a0f679`): `run:done`, 126 hallazgos** (40 críticos, 58 altos, 24 medios, 4 bajos; por categoría: A08 29, A04 26, A05 25, A03 17, A02 12, A07 8, A09 5, A01 3, A06 1, A10 0) en 89 files/3716 líneas, **123,8 s (~2 min)**; hallazgos reales y localizados (SQLi en `sqli/source/low.php:10`, RCE vía `shell_exec` en `exec/source/low.php:10`, credenciales hardcodeadas en `sqli/test.php:2`, MD5 en `brute/source/*`). **Ground truth miniapp: 10/10 a la primera** (sin fix round de prompts; el test verbatim del brief tenía un error de sintaxis — genexp asignada sin paréntesis — y se corrigió a set comprehension). Pendiente: final review de rama + tag `v0.2.0` (coordinador) y QA visual del modo live (R9). **Diferido a Fase 2b:** streaming en el cliente LLM (`stream: true` — el timeout de 60 s solo aplicaría al TTFT y permitiría scopes mayores, p. ej. los 430k completos) y desduplicación de hallazgos (la misma línea puede reportarse por varias categorías, p. ej. `sqli/source/low.php:10` por A03 y A05).
- 2026-11-21 — **Fase 2a aprobada** (diseño + plan): motor de análisis real = backend FastAPI + **11 agentes LLM** (1 perfilador + 10 OWASP) contra **qwen3.8 FP8** vía el endpoint del usuario (`https://aitana.serbatic.es/v1`, OpenAI-compatible; `enable_thinking: false` — verificado 2026-11-21 con llamada real; contexto 256k). El análisis lo ejecuta **la app en runtime** (el usuario descartó expresamente usar el agente de desarrollo/OpenCode como motor). API key en `backend/.env` (gitignored; copiada de la config de OpenCode, nunca en el front ni en git). Proyectos de ejemplo: `samples/miniapp` (Express, 10 vulns sembradas, una por categoría; test de regresión ≥ 8/10 contra `expected-findings.json`) + `samples/dvwa` (se clona; scope de análisis `vulnerabilities/` + `include/`). Frontend: `liveAnalysisService` tras `AnalysisService` + autodetección de backend + banner de error; picker/git ocultos en modo live (→ 2b). **Rulings del builder check (R1–R3):** (1) `run:error`/409 → nuevo `status: 'error'` + banner mínimo en ProgressScreen; el cancel no necesita estado nuevo (la máquina `useAnalysis` ya lo gestiona); (2) el escaneo distingue `files` de `manifests` y ambos son `file` válido (ruling para que A06 —`package.json`— no se descarte sistemáticamente); (3) el slot de run se libera al terminar el enfriamiento, pero un run en estado `cancelling` puede ser **suplantado** (supersede) por un `POST /api/analyze` nuevo → «volver y relanzar» funciona al instante. Python **3.12.10** instalado vía winget. Design: `docs/superpowers/specs/2026-11-21-fase2a-motor-analisis-real-design.md`; plan de 8 tasks: `docs/superpowers/plans/2026-11-21-fase2a-motor-analisis-real-plan.md`.

## Fuera de scope (fases futuras)

- **Fase 2a (COMPLETA):** motor real — backend FastAPI, 11 agentes LLM, SSE, proyectos de ejemplo (miniapp + DVWA), modo live en el front. Ver plan de Fase 2a.
- **Fase 2b:** carpeta real desde el picker, clonado git, PDF real (reportlab/weasyprint), cancel robusto, híbrido reglas (semgrep)+LLM, relocalización exacta de línea.
- **Fase 3:** imagen Docker «descargable».
