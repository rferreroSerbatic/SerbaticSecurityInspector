# Serbatic Security Inspector — Diseño (Fase 1: Frontend)

Fecha: 2026-11-20 · Estado: borrador para aprobación

## 1. Intención

Serbatic Security Inspector analiza el código fuente de una aplicación (carpeta local o repo git) en busca de vulnerabilidades del **OWASP Top 10**, ejecutando **agentes especializados** (uno por vulnerabilidad) que localizan el problema en el código, explican cómo explotarlo, sus consecuencias y la solución. El resultado final es un **alcance técnico de mejora** exportable a PDF para presentar al cliente.

**Esta fase (Fase 1) construye solo el frontend**, con el análisis simulado (mock), para validar y pulir la experiencia de usuario completa antes de implementar los agentes reales. El usuario ha decidido explícitamente empezar por el front.

## 2. Objetivos (Fase 1)

- UI completa y pulida de todo el flujo: home → fuente → selección de vulnerabilidades → progreso → resumen → alcance editable.
- Estética "Cyberpunk" acordada por mockups: fondo casi negro `#06060b`, doble neón **cian `#00e5ff`** + **magenta `#ff2d95`**, brillos (box-shadows), degradados cian→magenta en elementos clave.
- Servicio de análisis **mock** detrás de una interfaz (`AnalysisService`) que simula la ejecución secuencial de los agentes con progreso en vivo y hallazgos de ejemplo realistas, para que todo el flujo sea navegable de punta a punta.
- Interfaz en **español**.
- Arquitectura lista para sustituir el mock por el backend real sin tocar las pantallas.

## 3. No-objetivos (Fase 1)

- Análisis real del código (semgrep, AST, LLMs) → Fase 2.
- Backend FastAPI, lectura de carpeta local real, clonado git real → Fase 2.
- Generación real de PDF → Fase 2 (en Fase 1, el botón genera un stub con aviso "demo").
- Gestión de API key de LLM → Fase 2 (vivirá en `.env` del backend, nunca en el front).
- Docker → al final del proyecto (se mantiene la estructura amigable: sin rutas absolutas, dependencias limpias).
- Multi-idioma, autenticación, multiusuario.

## 4. Restricciones

- Desarrollo en Windows. La máquina tiene **Node 14 (EOL) y Python no instalado**: paso de setup inicial = instalar **Node 20 LTS** (necesario para Vite/React modernos). Python no se necesita en Fase 1. *Call del diseñador: Node 20 sustituye al Node 14 (instalador oficial); si el usuario lo necesitara para otros proyectos, se recurre a nvm-windows con versión por proyecto.*
- Herramienta local: se sirve en `http://localhost:5173` (dev) y como build estático.
- El selector de carpeta en Fase 1 es un **mock** (no puede leer el filesystem desde el navegador); en Fase 2 el backend real lo resolverá. La UI ya debe dejar claro que se elige un proyecto.

## 5. Enfoques considerados

1. **React (Vite) + Tailwind, con backend FastAPI (Python) en Fase 2 — ELEGIDO.** Los agentes vivirán en un backend Python de todos modos (leer carpetas, clonar git, generar PDFs, LLMs); la SPA en React da el control total sobre el diseño multietapa, el progreso en vivo (SSE en Fase 2), el modal editable y la estética. En Fase 1 el backend se sustituye por un servicio mock dentro de la SPA.
2. **Streamlit** — más rápido para prototipar, todo en Python, pero el wizard multietapa con animaciones, modales y diseño "atractivo" choca con las limitaciones del framework; el usuario lo mencionó como posibilidad pero prioriza el acabado.
3. **Next.js completo** — overkill: herramienta local sin necesidad de SSR ni routing de servidor.

El usuario aprobó la opción 1.

## 6. Flujo y pantallas (validadas por mockups en el navegador)

Indicador de pasos persistente en cabecera: `1 FUENTE · 2 VULNERABILIDADES · 3 ANÁLISIS · 4 INFORME` (con ✓ en los completados). Marca: `SERBATIC` (cian) + `INSPECTOR` (magenta).

### 6.1 Home
- Kicker: `OWASP TOP 10 · AUDITORÍA AUTOMATIZADA`.
- Titular: «Encuentra la brecha antes que el atacante.» (texto con degradado cian→magenta).
- Sub: «Análisis con agentes especializados, informe y alcance de mejora.»
- CTA principal: `ANALIZAR APLICACIÓN` (degradado cian→magenta, brillo).
- Métricas de pie: `10 AGENTES · PDF INFORME · GIT · CARPETA`.

### 6.2 Paso 1 · Fuente
- Dos opciones en pestaña o tarjeta conmutable: **Carpeta local** (input de ruta; en Fase 1 mock: lista de proyectos de ejemplo para elegir) o **Repositorio git** (input de URL con validación básica).
- Botón `CONTINUAR ▸` (deshabilitado hasta elegir fuente).

### 6.3 Paso 2 · Vulnerabilidades (layout: **lista vertical**, elegido sobre cuadrícula de tarjetas)
- 10 filas OWASP Top 10 (2021): checkbox, icono, código `A01–A10` (cian), nombre, descripción breve. Fila seleccionada: borde izquierdo magenta + fondo tinte magenta + checkbox con degradado.
- Botón `SELECCIONAR TODAS` (outline magenta; altoggle deselecciona todas).
- Pie: contador `N DE 10 SELECCIONADAS` + botón `EJECUTAR ANÁLISIS ▸`.

### 6.4 Paso 3 · Progreso (aprobado en mockup)
- Aviso: «El análisis puede tardar varios minutos» (chip amarillo).
- Barra global con % (degradado cian→magenta, brillo magenta).
- Lista de agentes **en orden de ejecución**, estados:
  - `COMPLETADO` (cian, ✓) + `N hallazgos · X crítico(s)`.
  - `EN CURSO` (magenta brillante, borde con glow) + mini-progreso propio + archivo actual en mono (`api/users.py …`).
  - `EN ESPERA` (atenenuado).
- Registro en vivo inferior (consola, mono): líneas `[mm:ss] Agente · severidad → archivo:línea — detalle`.

### 6.5 Paso 4 · Resumen (aprobado en mockup)
- «Análisis completado» + métricas (agentes, archivos, líneas, duración).
- Barra apilada por severidad con leyenda: crítico (magenta) / alto (naranja `#ff9f43`) / medio (amarillo `#ffd23f`) / bajo (cian).
- Hallazgos: tarjeta expandida con badge de severidad, tag OWASP (A03 · INYECCIÓN), título, ubicación `📍 archivo:línea` + snippet de código (mono), y tres bloques: **EXPLOIT**, **CONSECUENCIAS**, **SOLUCIÓN**. El resto, filas colapsadas compactas.
- Checkbox «incluir en el alcance» por hallazgo.
- Pie: contador de seleccionados + botón `GENERAR ALCANCE DE MEJORA ▸`.

### 6.6 Modal · Alcance técnico (aprobado en mockup)
- Oscurece el resumen; modal con borde cian + glow.
- Cabecera: `ALCANCE TÉCNICO DE MEJORA` + hallazgos en que se basa.
- Área de texto **editable** pre-rellenada: encabezado (proyecto, fecha) y un bloque por vulnerabilidad seleccionada: objetivo, acciones concretas con archivo/línea, estimación y prioridad.
- Pie: contador de palabras, `CANCELAR`, botón secundario `COPIAR TEXTO` (portapapeles; *call del diseñador: coste mínimo y útil para la demo mientras el PDF es stub*), y `GENERAR PDF ▸` (Fase 1: stub — toast «PDF generado (demo)»).

## 7. Datos (mock)

- `Vuln { id: "A01"–"A10", name, icon, description }` — los 10 del OWASP Top 10 2021.
- `Finding { id, vulnId, severity: critical|high|medium|low, title, file, line, codeSnippet, exploit, consequences, solution }`.
- `AnalysisState { status: idle|running|done, agents: AgentState[], globalProgress: number, logLines: LogLine[] }`.
- Hallazgos de ejemplo realistas (3–8) por vulnerabilidad, para que el resumen se vea creíble.

## 8. Stack (decisiones del diseñador)

- **Vite + React 18 + TypeScript**.
- **Tailwind CSS** con tokens de la paleta cyberpunk (colores, brillos, fuentes: sans + mono para código/consola).
- **Sin librería de UI pesada**: componentes hechos a medida (pocas pantallas, look muy propio).
- **Sin router**: navegación por estado (máquina de estados simple del flujo).
- Servicio mock: `src/services/analysisService.ts` (interfaz) + `mockAnalysisService.ts` (implementación con temporizadores: cada agente tarda ~3–6 s en demo, con ticks de progreso y líneas de log).
- Tests ligeros: **Vitest** para el servicio mock y las utilidades.
- **Estado en memoria** (sin persistencia a disco/localStorage) en Fase 1: es un flujo de sesión única y la demo de punta a punta; una recarga reinicia. *Call del diseñador; se revisará en Fase 2 cuando el análisis sea real y largo.*
- **Mockups de referencia** (acordados en esta sesión) viven en el proyecto en `.superpowers/brainstorm/*/content/*.html`; el constructor puede abrirlos en el navegador para igualar el look pixel a pixel.
- Dev: `npm run dev` → `http://localhost:5173`.

## 9. Delegado al constructor

- Textos/copy exactos (los de los mockups son de partida).
- Duraciones exactas de la simulación (con opción "demo rápida").
- Detalle del mock de selector de carpeta (lista de proyectos de ejemplo).
- Organización interna de archivos/componentes.
- Animaciones: pulsos y transiciones suaves, nada ruidoso.

## 10. Fases siguientes (contexto, fuera de scope)

- **Fase 2**: backend FastAPI (Python) — endpoints para listar/elegir carpeta, clonar git, ejecutar agentes reales (reglas + LLM con API key en `.env`), progreso por SSE, y generación de PDF real (reportlab/weasyprint) a partir del texto final editado.
- **Fase 3**: Docker "descargable".
