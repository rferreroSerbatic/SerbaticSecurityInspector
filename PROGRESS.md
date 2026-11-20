# Serbatic Security Inspector — Hoja de progreso

> **Fuente de verdad de «dónde estamos».** Actualízala al final de cada sesión (1 minuto).
> Una sesión nueva empieza leyendo `AGENTS.md` y esta hoja; no necesita el historial del chat.

## Estado actual

- **Fase:** 1 — Frontend con análisis mock (15 tasks en el plan)
- **Tarea en curso:** ninguna
- **Siguiente tarea:** **Task 1** del plan (scaffold Vite+React+TS+Tailwind + git/GitHub)
- **Bloqueos / pendientes externos:**
  - ⚠️ **Instalar Node 20 LTS** (la máquina tiene Node 14 EOL). Sin esto no arranca la Task 1.
  - ⚠️ **GitHub:** CLI `gh` no está instalado. Opción A: crear el repo `rferreroSerbatic/SerbaticSecurityInspector` (privado) en la web y `git remote add origin …` + `git push`. Opción B: `winget install GitHub.cli` y `gh auth login`.
  - Python no instalado (solo se necesita en Fase 2).

## Cómo retomar (para una sesión nueva)

1. Leer `AGENTS.md` (guía operativa del proyecto).
2. Leer la sección «Estado actual» de esta hoja.
3. Abrir `docs/superpowers/plans/2026-11-20-serbatic-frontend-plan.md` → localizar la **primera task sin `- [x]`**.
4. Ejecutarla con TDD (test → fail → implementar → pass) y terminar con commit + push.
5. Marcar la task `- [x]` en el plan, actualizar «Estado actual» aquí y, si hubo decisiones nuevas, el registro de abajo.
6. Si la sesión se agota a medio task: dejar la task con lo hecho anotado en «Tarea en curso» (qué falta).

## Progreso del plan (Fase 1)

- [ ] Task 1: Scaffold + git + GitHub *(git init ya hecho con los docs; el scaffold espera a Node 20)*
- [ ] Task 2: Primitivas UI (NeonButton, SeverityBadge, ProgressBar, Modal)
- [ ] Task 3: Tipos de dominio + datos OWASP Top 10
- [ ] Task 4: Hallazgos mock (A10 con 0 a propósito)
- [ ] Task 5: Máquina de estados `useAnalysis`
- [ ] Task 6: `mockAnalysisService` (agentes secuenciales, log, cancel)
- [ ] Task 7: AppShell + StepIndicator
- [ ] Task 8: HomeScreen
- [ ] Task 9: SourceScreen (carpeta mock + URL git)
- [ ] Task 10: VulnSelectScreen (lista vertical)
- [ ] Task 11: ProgressScreen (progreso en vivo)
- [ ] Task 12: SummaryScreen (resumen de hallazgos)
- [ ] Task 13: `buildScopeText` (texto del alcance)
- [ ] Task 14: ScopeModal (editable, copiar, PDF-stub)
- [ ] Task 15: Cableado E2E + QA visual contra mockups

## Entorno

| Cosa | Estado |
|---|---|
| Node | v14 (EOL) → **instalar Node 20 LTS** antes de Task 1 |
| npm | 6.14 (viene con Node 14; se actualiza con Node 20) |
| git | 2.56 ✓ (repo local inicializado) |
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
