# Fase 2b.1 — Pulido y marca (logo, navegador de carpetas, PDF para cliente, arranque 1-comando): Design

> Autoridad: documento de diseño de la fase. El plan de tasks se deriva de aquí.
> Contexto: la Fase 2b (tag `v0.3.0`) ya permite auditar cualquier carpeta local y repo git, con streaming, informe PDF, cancel robusto y dedup. La herramienta se dirige a uso real en **Serbatic (A Vass Company)** y a entregables para cliente.

## 1. Intención y porqué

La 2b hizo la herramienta *útil*; la 2b.1 la hace *presentable y cómoda*:

1. **Marca de empresa**: hoy el front solo dice «SERBATIC INSPECTOR» y no hay logo en ninguna parte. Serbatic es empresa: el logo y el título completo («SERBATIC SECURITY INSPECTOR») van en el front y en el PDF.
2. **Fricción de la ruta**: en modo live solo se puede escribir la ruta a mano. El usuario pidió «cargar una carpeta». Los navegadores no pueden pasar una ruta absoluta desde un picker al backend (limitación de seguridad; por eso el picker del modo mock solo *lee* ficheros dentro del navegador y no llega al motor real). Lo que sí es posible, porque el backend corre en la máquina del usuario: un **mini-navegador de carpetas** en la propia app.
3. **El PDF es para el cliente**: el actual es texto plano Helvetica en blanco y negro, sin jerarquía ni color. Se pide un estilo claro/limpio (no oscuro: es un documento que se imprime y se envía), con logo, títulos con jerarquía, severidades en color y código con colores.
4. **Arranque local**: hoy son 3 terminales (backend, front, demo miniapp). El usuario quiere un solo comando para arrancar y parar todo, **sin hacer imprescindible Docker** (el Docker es un plan futuro suyo, no una dependencia de esta fase).
5. **El 404 del log**: el backend registra cada pocos segundos `GET /v1/models 404` (y `/health 200`). Investigado 2026-11-21: **nada del repo lo llama** (grep verificado; la config de OpenCode apunta a `aitana.serbatic.es`, no al puerto 8000). Es un proceso externo de la máquina del usuario que hace polling a `localhost:8000` buscando un servidor OpenAI-compatible. El usuario no conoce la causa → la fase la identifica y decide.

No es una fase de arquitectura de detección: eso es la Fase 2c (semgrep-híbrido + relocalización exacta), que se queda pendiente e intocada.

## 2. Objetivos

- **G1 — Marca en el front**: logo + título completo «SERBATIC SECURITY INSPECTOR» en la cabecera de `AppShell` y en el título de la pestaña (`document.title`).
- **G2 — Navegador de carpetas (modo live)**: seleccionar el proyecto propio navegando por carpetas con clics (backend lista subcarpetas); la entrada de ruta manual **se conserva** (lo «ambas» del usuario).
- **G3 — PDF para cliente (claro)**: `POST /api/reports/full-pdf` (y el PDF de alcance) con tema claro/imprimible: portada con logo, jerarquía tipográfica, severidades en color de marca, **código con resaltado de sintaxis** (pygments), barra de distribución de severidades y numeración de páginas.
- **G4 — Arranque/parada 1-comando**: scripts PowerShell para arrancar y parar las 3 apps (backend :8000, front :5173, miniapp demo :3000). Sin Docker.
- **G5 — Identificar el 404**: determinar qué proceso hace polling a `localhost:8000` y decidir (ruling documentado): mover el puerto o documentar como ruido inofensivo.

## 3. No-objetivos

- **Docker**: no entra en esta fase (no ser imprescindible es el requisito; el plan de contenedores del usuario es futuro).
- Semgrep-híbrido + relocalización exacta → **Fase 2c** (diseño propio pendiente).
- Variantes de logo: se usa el fichero proporcionado tal cual. No se piden más versiones.
- Mover el puerto del backend **de antemano**: solo si G5 lo justifica (ruling en PROGRESS si ocurre).
- i18n, auth, persistencia, router, librerías de estado/UI (constraints globales).

## 4. Restricciones

**Heredadas (inmutables):**
- Windows + PowerShell 5.1 (separador `;`, nunca `&&`); Python siempre `backend\.venv\Scripts\python.exe` (sin `Activate.ps1`); pytest con workdir `backend/`; Node v26.13.1.
- API key solo en `backend/.env` (gitignored). Nunca en código, front, git ni reports.
- Copy de UI en español. **Sin nuevas librerías de front.** Sin router ni librería de estado.
- Paleta de la app (fondo oscuro) invariante: bg `#06060b`, panel `#0a0a14`, cian `#00e5ff`, magenta `#ff2d95`; severidades: crítico `#ff2d95`, alto `#ff9f43`, medio `#ffd23f`, bajo `#00e5ff`; texto `#f4f4f8` / `#8b8b98` / `#5a5a68`.
- Contrato SSE inmutable: `data: {json}\n\n`, `{"type","t",...}`; terminales `run:done`/`run:error`/`run:cancelled`.
- Shape de `findings` inmutable (`id, vulnId, severity, title, file, line, snippet, exploit, consequences, solution` + opcional `alsoCategories`).
- TDD estricto (rojo→verde del test de la task; suite completa + `npm run build` UNA vez al final); commits convencionales, uno por task (fix rounds amendados); **el implementer no pusha** (push único del coordinador tras review); subagentes con `aitana/qwen3.8-fp8`.
- Lección de la fix wave de la 2b: **I/O de disco nunca en el event loop** (los endpoints que tocan disco son `def` → threadpool).
- PDF: fuentes estándar de reportlab = WinAnsi; la sanitización `_winansi()` (cp1252 → `?`) de la 2b se conserva en todo texto dibujado, incluidos los tokens de código.

**Nuevas de esta fase:**
- **`pygments` es la única dependencia nueva** (backend, runtime → `requirements.txt`, respetando la split runtime/dev de la M8).
- El logo se **commitea en el repo** (`assets/serbatic-logo.png`); front y backend leen el mismo fichero.

## 5. Logo (verificado)

- Fichero: `assets/serbatic-logo.png` (el usuario lo dejó en la raíz como `serbatic_logo_2024.png`; ya movido a `assets/`).
- Verificado por bytes: **757×237 px, 8-bit, RGBA con alpha** (fondo transparente) → funciona sobre oscuro (front) y sobre blanco (PDF), como confirmó el usuario.
- Contenido: wordmark «serbatic» en gris oscuro (bajo contraste sobre negro, por diseño de marca) + tagline «A VASS COMPANY» en cian claro.

## 6. G1 — Marca en el front

**Dónde está hoy:** `src/components/layout/AppShell.tsx:27-41` — `<header class="relative z-10 flex items-center justify-between gap-4 px-6 py-4">` con un único `<span class="text-sm font-extrabold tracking-[0.25em]">` que contiene «SERBATIC» (`text-neon-cyan` + glow cian) + «INSPECTOR» (`text-neon-magenta` + glow magenta). Test existente: `AppShell.test.tsx` aserta `SERBATIC`.

**Cambios:**
- En `AppShell`, delante del texto: `<img src={logoUrl} alt="Serbatic" className="h-7" />` (≈28 px), importado desde `../../assets/serbatic-logo.png` (Vite resuelve assets dentro del proyecto; si faltara la referencia de tipos `vite/client` para assets, se añade el `vite-env.d.ts` estándar).
- El texto pasa a «SERBATIC **SECURITY** INSPECTOR» conservando el estilo actual: «SERBATIC» cian con glow, «SECURITY» en `#f4f4f8` (neutro, sin glow), «INSPECTOR» magenta con glow.
- `index.html`: el título ya es «Serbatic Security Inspector» (verificado por el builder check) — sin cambio; solo se comprueba en el test de T1.
- Tests: `AppShell.test.tsx` actualizado (img con `alt="Serbatic"` + los tres fragmentos de texto) + que el resto de pantallas no se vea afectado (la suite completa lo cubre).

## 7. G2 — Navegador de carpetas

**Backend — `GET /api/browse`** (nuevo en `main.py`):
- `GET /api/browse?path=<opcional>` — sin parámetro → `Path.home()`.
- Respuesta 200: `{"path": "<absoluta normalizada>", "parent": "<path padre>" | null, "folders": [{"name", "path", "registered"}, ...]}`.
- `folders`: **subdirectorios directos** (nada de recursión), excluyendo directorios con punto, ordenados por nombre case-insensitive; `registered`: `"local"` | `"git"` | `null` — a qué registry (LOCAL o GIT, in-memory; `main.py` ya importa ambos módulos) pertenece la raíz de esa carpeta, o `null` si no está registrada. (Ruling de builder check: el diseño original decía `bool`, pero el modal necesita distinguir el tag `LOCAL` vs `GIT`; lo resuelve el servidor, sin acoplamiento de formatos de path en el cliente.)
- Path inexistente o no directorio → 400. Endpoint `def` (síncrono → threadpool, no bloquea el loop).
- Seguridad: mismo nivel de confianza que `POST /api/projects/local` (cualquier ruta local; servidor solo localhost, herramienta single-user por diseño). No añade una nueva clase de acceso.

**Front — `SourceScreen` (rama live, fila local):**
- Botón `NeonButton` (variant `ghost`) «📂 NAVEGAR» junto al input de ruta (disabled si busy), que abre un modal (reutilizando `Modal` de `ui/`).
- **BrowseModal**: breadcrumbs (segmentos de la ruta actual, clicables), «↑ SUBIR» (si `parent` existe), lista de subcarpetas (clic → navegar a esa carpeta; las `registered` llevan un tag cian `LOCAL`/`GIT`), y al pie «USAR ESTA CARPETA» (primario) + «CANCELAR».
- La carpeta con `registered` no-null lleva un tag cian `LOCAL` o `GIT` (según el valor) en la lista.
- «USAR ESTA CARPETA» = cerrar modal + rellenar el input con la ruta + ejecutar **el mismo flujo que «AUDITAR RUTA»** con esa ruta (misma `POST /api/projects/local`, mismos errores 400/404/red inline, mismo `onRefresh`). La entrada manual sigue existiendo y funcionando igual.
- Tests backend: default → home; path explícito; 400 inexistente/no-dir; exclusión de dot-dirs; orden; `registered` = `"local"` (proyecto LOCAL registrado), `"git"` (proyecto GIT registrado) y `null` (sin registro).
- Tests front: el modal se abre; navegar a una subcarpeta hace `GET /api/browse` con su path; breadcrumbs; SUBIR; «USAR ESTA CARPETA» rellena el input y dispara `POST /api/projects/local` con la ruta elegida; error 400 del registro se muestra inline.

## 8. G3 — PDF para cliente (claro)

**Paleta sobre blanco** (variantes oscuras de la marca, legibles sobre claro):
- Texto principal `#1f2937`, secundario `#6b7280`; acento de marca cian oscuro `#0891b2`.
- Severidades (mismos tonos de marca, oscurecidos): crítico `#be185d`, alto `#c2410c`, medio `#a16207`, bajo `#0e7490`.
- Cajas de fondo `#f3f4f6`, bordes `#e5e7eb`.

**Portada (página 1):**
- Logo arriba (ancho natural ≈ 45 mm) sobre blanco (fondo transparente verificado).
- «INFORME DE AUDITORÍA DE SEGURIDAD» (Helvetica-Bold ≈ 20), nombre del proyecto (≈ 14, `#0891b2`), fecha.
- Meta (archivos, líneas, modelo, tokens, tk/s, duración) en una caja `#f3f4f6` (las claves de `_META_LABELS` actuales, solo si existen).
- **Barra de distribución de severidades**: barra horizontal apilada (4 colores, ancho ∝ nº de hallazgos) + leyenda «● 7 críticos · 25 altos · 14 medios · 5 bajos». Si `findings` está vacío: sin barra.

**Estructura (páginas 2+):**
- Cabecera: título del documento (pequeño, izquierda); pie: número de página + «Serbatic Security Inspector».
- «PERFIL DEL PROYECTO»: título de sección con barra de acento cian a la izquierda; campos como hoy (lenguaje, frameworks, entry points, descripción).
- «HALLAZGOS (N total)»: por categoría (orden canónico A01→A10, desconocidos al final) — cabecera `A0X · NOMBRE (n)` con acento; por hallazgo:
  - **badge de severidad** (rectángulo pequeño con texto blanco, color de severidad) + título en negrita;
  - «Ubicación: file:line» en monospace;
  - **snippet en caja `#f3f4f6` con resaltado de sintaxis** (ver abajo);
  - «EXPLOIT:», «CONSECUENCIAS:», «SOLUCIÓN:» con sus labels en color;
  - «También reportado como: …» si hay `alsoCategories`.
- **Resaltado (pygments)**: lexer por extensión del archivo (fallback `TextLexer`); paleta light (el builder elige la base — p. ej. derivada de «friendly»/«stata-light» — y fija el mapa token→hex en el diseño de implementación). Implementación: tokenizar → aplanar a (palabra, color) → wrap respetando los bordes de token (agrupar palabras en líneas por `stringWidth`) → dibujar cada palabra con `drawString` en su offset-x. `_winansi()` por token (lo no-WinAnsi → `?`).
- **`build_scope_pdf`** (PDF de alcance): mismo tema claro — logo, título con acento, texto gris oscuro. Sin barra ni código.
- `VULN_NAMES` sigue idéntico byte a byte a `src/data/owasp.ts` (invariante de la 2b).
- `pageCompression=0` se conserva (tests inspeccionan los bytes).

**Tests (`test_pdf_report.py`, patrones existentes):**
- PDF válido (header `%PDF-`, nº de páginas) con payload tipo DVWA (51 hallazgos).
- Logo incrustado: el PDF crudo contiene `/Subtype /Image`.
- Snippet CJK/emoji → `?` sin crash (conserva el test de la fix wave, adaptado a tokens).
- Snippet de 5000 chars sin espacios → paginación sin crash (conservado).
- Colores de severidad presentes en el PDF crudo (operadores de color) y barra en la portada (operadores de rectángulo en la zona de la portada).
- PDF de alcance: tema nuevo, válido.

**QA visual (usuario):** se regenera el informe del run real DVWA de la 2b con el nuevo estilo y se inspecciona portada, colores, código y paginación.

## 9. G4 — Arranque/parada 1-comando

- `scripts/start-all.ps1` y `scripts/stop-all.ps1` (raíz del repo; PowerShell 5.1; **sin dependencias nuevas**).
- **start-all**:
  - Comprueba los puertos 8000/5173/3000 (si uno está ocupado: avisa y arranca los demás).
  - Arranca en background: (1) backend — uvicorn con workdir `backend/`; (2) front — `npm run dev`; (3) demo miniapp — `npm --prefix samples/miniapp start`.
  - Logs en `.tmp/logs/{backend,front,miniapp}.log` (`.tmp/` se añade a `.gitignore`) y resumen en consola: «backend ✓ :8000 (log: .tmp/logs/backend.log) …».
- **stop-all**: mata por puerto (`Get-NetTCPConnection -LocalPort <p>` → `OwningProcess` → `Stop-Process -Force`), con resumen de lo matado (y «nada que matar» si un puerto estaba libre).
- **README**: el quickstart principal pasa a ser 1 terminal (`.\scripts\start-all.ps1` / `.\scripts\stop-all.ps1`); el modo 3 terminales queda como opción avanzada.
- Verificación manual (task de cierre): start → 3 puertos escuchando + 3 logs creciendo; stop → 3 puertos libres.
- Fuera de scope: multiplataforma (el entorno documentado es Windows/PowerShell).

## 10. G5 — Identificar el 404

- **Paso 0 (coordinador, al inicio de la fase)**: con uvicorn corriendo, capturar el poller: `netstat -ano | findstr :8000` en varios intentos (para atrapar el estado ESTABLISHED) → PID → `Get-Process -Id <pid>` → nombre/ruta del programa. Se documenta en PROGRESS.
- **Ruling tras identificar** (se registra en PROGRESS):
  - Si es un servicio del usuario que espera vivir en :8000 → **mover el backend a 8001**: default de uvicorn, proxy de Vite, README, AGENTS.md y scripts de G4. (Cambia 4–5 ficheros, se hace en la task que toque.)
  - Si es desconocido/irrelevante → se documenta en el README (nota de operación) como ruido externo inofensivo y no se toca nada.

## 11. Estructura de la fase (tasks, se detallan en el plan)

1. **T1 — Marca en el front (G1)**: logo + título completo en `AppShell` + `document.title`.
2. **T2 — Navegador de carpetas (G2)**: `GET /api/browse` + `BrowseModal` + cableado en `SourceScreen`.
3. **T3 — PDF para cliente (G3)**: tema claro + logo + colores de severidad + pygments + barra + numeración + alcance; nueva dep `pygments`.
4. **T4 — Arranque/parada (G4)**: scripts `.ps1` + README + `.tmp/` en gitignore.
5. **T5 — Cierre**: paso 0 de G5 (si no se hizo antes) + E2E real (navegador con una carpeta real, informe nuevo desde un run real, 3 apps con los scripts) + suites completas + **final review de rama desde `v0.3.0`** + tag `v0.3.1` + cierre de PROGRESS.

## 12. Aceptación (fina de fase)

- **G1**: cabecera con logo + «SERBATIC SECURITY INSPECTOR» en todas las pantallas (mock y live); pestaña con el título completo.
- **G2**: desde la home del usuario, navegar con clics hasta una carpeta real (con espacios en el nombre) y auditarla sin teclear la ruta (201 + run); la ruta manual sigue funcionando.
- **G3**: informe DVWA (run real) claro con logo, colores, código coloreado, barra y páginas; imprimible; ground truth y suites en verde.
- **G4**: una terminal → 3 apps arriba; stop-all → 3 puertos libres.
- **G5**: poller identificado (nombre de programa) + ruling documentado (mover puerto o ruido).
- Suites finales: backend `pytest -q` (incluye gate LLM real) y front `npx vitest run` + `npm run build` — todo verde.

## 13. Libre del builder (no hay preguntas abiertas al usuario)

- Mapa token→hex exacto de pygments (paleta light) y dimensiones mm exactas del layout del PDF: criterio «claro, imprimible, para cliente, coherente con la marca».
- Detalles de los breadcrumbs (nº de segmentos, elipsis) y de la lista de carpetas (orden, etiquetas).
- Formato de logs/consola de los scripts `.ps1`.
- Si el polling del G5 obliga a mover el puerto, los detalles del cambio (vite proxy, etc.): el ruling de G5 lo fija.
