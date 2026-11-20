# Serbatic Security Inspector — Hoja de progreso

> **Fuente de verdad de «dónde estamos».** Actualízala al final de cada sesión (1 minuto).
> Una sesión nueva empieza leyendo `AGENTS.md` y esta hoja; no necesita el historial del chat.

## Estado actual

- **Fase:** 1 — Frontend con análisis mock (15 tasks en el plan)
- **Tarea en curso:** ninguna — **15/15 tasks completadas**; en final review de rama completa (SDD)
- **Siguiente tarea:** final review → fix wave si procede → QA visual en navegador (residuales R1–R6) → push a GitHub + tag v0.1.0
- **Bloqueos / pendientes externos:**
  - ✅ **Node:** instalado **Node 26.13.1** + npm 11.20 (cumple el floor Node ≥ 20 del plan).
  - ⚠️ **GitHub:** sin remote y sin CLI `gh`. Crear el repo `rferreroSerbatic/SerbaticSecurityInspector` (privado) en la web y `git remote add origin …` + `git push` (o `winget install GitHub.cli`). Los commits van acumulando localmente.
  - Python no instalado (solo se necesita en Fase 2).

## Cómo retomar (para una sesión nueva)

1. Leer `AGENTS.md` (guía operativa del proyecto).
2. Leer la sección «Estado actual» de esta hoja.
3. Abrir `docs/superpowers/plans/2026-11-20-serbatic-frontend-plan.md` → localizar la **primera task sin `- [x]`**.
4. Ejecutarla con TDD (test → fail → implementar → pass) y terminar con commit + push.
5. Marcar la task `- [x]` en el plan, actualizar «Estado actual» aquí y, si hubo decisiones nuevas, el registro de abajo.
6. Si la sesión se agota a medio task: dejar la task con lo hecho anotado en «Tarea en curso» (qué falta).

## Progreso del plan (Fase 1)

- [x] Task 1: Scaffold + git + GitHub *(commit 550fd40, review limpia; push a GitHub pendiente de remote)*
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
- [ ] Task 14: ScopeModal (editable, copiar, PDF-stub)
- [x] Task 15: Cableado E2E + QA visual contra mockups *(commit ccba51e, review limpia; QA browser residual R1–R6 para el usuario)*

## Entorno

| Cosa | Estado |
|---|---|
| Node | **v26.13.1** ✓ (instalado 2026-11-20) |
| npm | 11.20.0 ✓ |
| git | 2.56 ✓ (repo local inicializado, commit 0 hecho) |
| Python | no instalado (Fase 2) |
| GitHub | pendiente (repo de la cuenta `rferreroSerbatic`, privado) |
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

## Fuera de scope (fases futuras)

- **Fase 2:** backend FastAPI — carpeta real, clonado git, agentes reales (reglas + LLM con API key en `.env`), progreso SSE, PDF real (reportlab/weasyprint).
- **Fase 3:** imagen Docker «descargable».
