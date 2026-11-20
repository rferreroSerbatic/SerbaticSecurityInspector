# AGENTS.md — Serbatic Security Inspector

Guía operativa para cualquier agente/sesión que trabaje en este repositorio.

## Dónde estamos (lee esto primero, en orden)

1. **`PROGRESS.md`** — estado actual, siguiente task, bloqueos, registro de decisiones.
2. **`docs/superpowers/plans/2026-11-20-serbatic-frontend-plan.md`** — el plan: 15 tasks con tests, interfaces exactas y commits (sus checkboxes son por paso; la fuente de verdad de tareas es la lista «Progreso del plan» de PROGRESS.md).
3. **`docs/superpowers/specs/2026-11-20-serbatic-security-inspector-front-design.md`** — el porqué: intención, pantallas, decisiones de diseño.

## Reglas de trabajo

- **Una task a la vez, en orden**, TDD estricto: escribir el test → verlo fallar → implementar mínimo → verlo pasar → `npm run build` limpio → commit + push.
- **Al terminar una task:** marcarla `- [x]` en la lista «Progreso del plan» de `PROGRESS.md` y actualizar su «Estado actual» (decisiones nuevas al registro).
- **A media task al agotar contexto:** anotar en `PROGRESS.md` «Tarea en curso» qué falta exactamente.
- **Commits:** convencionales (`feat:`, `test:`, `chore:`, `docs:`), uno por task, con push.
- **Ritmo sugerido:** 2–4 tasks por sesión; no intentar la fase completa en una.

## Stack y restricciones (Fase 1)

- Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS 3.4 + Vitest/Testing Library/jsdom.
- **Sin** router, **sin** librería de estado, **sin** librería de UI, **sin** persistencia, **sin** llamadas de red.
- Todo el copy de la UI en **español**.
- Paleta exacta: bg `#06060b`, panel `#0a0a14`, cian `#00e5ff`, magenta `#ff2d95`, severidades: crítico `#ff2d95`, alto `#ff9f43`, medio `#ffd23f`, bajo `#00e5ff`; texto `#f4f4f8` / `#8b8b98` / `#5a5a68`.
- Comandos: `npm run dev` (localhost:5173) · `npm test` · `npm run build` (incluye `tsc --noEmit`).
- Mockups de referencia (QA visual de la Task 15): `.superpowers/brainstorm/430-1795195954/content/*.html` — abrir en el navegador; **no borrar** (gitignored a propósito).

## Fuera de scope (Fase 1) — no construir

Backend real, análisis real de código, PDF real, API keys, Docker, i18n, auth. Ver spec §3 y §10.

## Entorno

- Windows + PowerShell. Node instalado: **v26.13.1** (el floor del plan es Node ≥ 20). Si `node --version` da otra cosa, avisar antes de nada.
- GitHub: cuenta `rferreroSerbatic`, repo `SerbaticSecurityInspector` (privado).
