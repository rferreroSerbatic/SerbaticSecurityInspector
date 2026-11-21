# Fase 2c — Pulido post-QA (eliminar proyectos, marcar todos, orden del resumen, PDF de alcance): Design

> Autoridad: documento de diseño de la fase. El plan de tasks se deriva de aquí.
> Contexto: la Fase 2b.1 (tag `v0.3.1`) dejó la herramienta completa y presentable. El usuario la probó (QA-iter 3, 2026-11-22) y pidió 4 cosas + los diferidos de 2b.1. **Scope cerrado por el usuario (rulings 2026-11-22, ver PROGRESS.md «Siguiente» + registro de decisiones): esta fase se ejecuta desatendida, sin preguntas al usuario.** El híbrido semgrep se retiró del roadmap (ruling 2026-11-22). Tag de cierre previsto: `v0.3.2`.

## 1. Intención y porqué

La 2b.1 hizo la herramienta presentable; la 2c la hace *completa en el ciclo de vida del proyecto* y *ajustada a cómo trabaja el usuario*:

1. **Eliminar proyectos (p. ej. QA-iter 3, vía R12):** tras probar el navegador, el usuario pidió poder eliminar proyectos de la lista. Hoy no hay forma: lo local solo se «desregistra» mentalmente, y un clon git ocupa `workspace/repos/<slug>-<hash6>` para siempre.
2. **Marcar/desmarcar todos (hallazgos):** el resumen permite marcar hallazgos uno a uno «para el alcance posterior»; con 51 hallazgos (DVWA) marcarlos todos es tedioso. Faltan los botones «MARCAR TODOS / DESMARCAR TODOS» (la pantalla de selección de *vulnerabilidades* ya tiene su equivalente desde Fase 1).
3. **Orden del resumen:** el usuario quiere alternar el orden desde la vista de hallazgos: **criticidad** (siempre el más crítico arriba — comportamiento fijo, «no hace falta que preguntes») o **tipo de vulnerabilidad** (grupos OWASP en orden canónico A01→A10; dentro del grupo, por criticidad). Se descarta «diferenciar por color el grupo» (ruling del usuario 2026-11-22).
4. **Reestilo del PDF de ALCANCE** (`alcance.pdf`; el usuario confirmó 2026-11-22 que es el de alcance, **no** el de reporte — el de reporte queda intacto): hoy es casi todo negro salvo una barra azul de 2×5,5 mm («el cuadro azul minusculo»). Se pide: apartados (los bloques numerados «N. TÍTULO (VULN) — SEVERIDAD») con estilo/negrita, más color, fondo claro pero más elegante (cajas), título centrado, mejor control de saltos de línea (p. ej. la línea «Estimación: X h · Prioridad: Y», que salta mal).
5. **Diferidos de 2b.1:** el error genérico del BrowseModal sin el `detail` del backend (final review 2b.1) + los minors del ledger SDD que son robustez de ese flujo (ruling §9 sobre cuáles entran).

No es una fase de motor ni de arquitectura: es pulido de ciclo de vida + presentación de documentos.

## 2. Objetivos

- **G1 — Eliminar proyectos en modo live:** botón de eliminar en la lista de `SourceScreen` (filas local/git; los sample no se eliminan). `DELETE /api/projects/{id}`: **git → borrar el clon de `workspace/repos/<slug>-<hash6>` + desregistrar; local → solo desregistrar (NUNCA tocar los archivos originales)**; sample → 409; run en curso sobre el proyecto → 409.
- **G2 — Marcar/desmarcar todos los hallazgos** del resumen (para el alcance): botón «MARCAR TODOS» / «DESMARCAR TODOS» en el pie del `SummaryScreen`.
- **G3 — Orden alternativo en el resumen:** control «ORDEN: CRITICIDAD | TIPO» en el `SummaryScreen`. `criticidad` (default): el más crítico arriba (estable). `tipo`: grupos A01→A10 canónico; dentro del grupo, por criticidad (estable). Sin separadores ni color de grupo (ruling del usuario).
- **G4 — Reestilo del PDF de alcance:** `build_scope_pdf` pasa de «texto plano a ciegas» a layout estructurado: cabecera centrada (logo + título + sub), cada bloque numerado como **caja** con barra de acento y **chip de severidad a color**, líneas «Objetivo:»/«Estimación:» con label estilizado, la línea de estimación con filete y en una sola línea, y páginas 2+ con cabecera/pie. El texto sigue siendo **la fuente** (el usuario lo edita en el textarea del ScopeModal): se parsea con fallback gracioso. **`build_report_pdf` queda intacto.**
- **G5 — Diferidos de 2b.1 (robustez BrowseModal/browse):** (a) el error del modal muestra el `detail` del backend; (b) guard anti-race de navegaciones in-flight (una respuesta lenta no pisa a una más reciente); (c) path con null-byte en `GET /api/browse` → 400 (hoy ValueError → 500).

## 3. No-objetivos

- No tocar `build_report_pdf` ni el informe de reporte (el usuario lo vio bien; el pedido es solo el de alcance).
- No persistir nada (registros en memoria; el DELETE git sí borra el clon del disco — es el workspace, no el proyecto del usuario).
- No añadir separadores visuales ni color por grupo en el resumen (descartado por el usuario).
- No tocar `VulnSelectScreen` (ya tiene SELECCIONAR TODAS / DESELECCIONAR TODAS desde Fase 1).
- Docker (Fase 3), semgrep (retirado), i18n, auth, router, librerías de estado/UI (constraints heredadas).
- Los demás minors del ledger 2b.1 no relacionados con G5 (ruling §9).

## 4. Restricciones

**Heredadas (inmutables):**
- Windows + PowerShell 5.1 (separador `;`, nunca `&&`); Python siempre `backend\.venv\Scripts\python.exe`; pytest con workdir `backend/`; Node v26.13.1.
- API key solo en `backend/.env` (gitignored). Nunca en código, front, git ni reports.
- Copy de UI en español. **Sin nuevas librerías de front.** Sin router ni librería de estado.
- Paleta de la app (fondo oscuro) invariante: bg `#06060b`, panel `#0a0a14`, cian `#00e5ff`, magenta `#ff2d95`; severidades UI: crítico `#ff2d95`, alto `#ff9f43`, medio `#ffd23f`, bajo `#00e5ff`; texto `#f4f4f8` / `#8b8b98` / `#5a5a68` (`ink`/`ink-dim`/`ink-faint`).
- Contrato SSE inmutable; shape de `findings` inmutable.
- TDD estricto (rojo→verde del test de la task; suite completa + `npm run build` UNA vez al final de la task); commits convencionales, **uno por task** (fix rounds amendados); **el implementer no pusha** (push único del coordinador tras review); subagentes con `aitana/qwen3.8-fp8`.
- I/O de disco nunca en el event loop: endpoints que tocan disco → `def` (threadpool).
- PDF: fuentes estándar reportlab = WinAnsi; `_winansi()` (cp1252 → `?`) en TODO texto dibujado. `VULN_NAMES` de `pdf_report.py` idéntico byte a byte a `src/data/owasp.ts` (invariante). `pageCompression=0` en los PDFs que los tests inspeccionan por bytes.
- `SEVERITY_ES = {"critical": "CRÍTICO", "high": "ALTO", "medium": "MEDIO", "low": "BAJO"}` (`app/pipeline.py`).

**Nuevas de esta fase:**
- **Cero dependencias nuevas** (front ni backend).
- El DELETE git borra **solo** el clon de `workspace/repos/` (gitignored); nunca el proyecto original del usuario.
- El contrato `POST /api/reports/scope-pdf` no cambia: `{text, title?}` — el reestilo es 100 % backend (el front no modifica el ScopeModal).

## 5. G1 — Eliminar proyectos

**Backend — `DELETE /api/projects/{project_id}`** (nuevo en `main.py`):
- Orden de decisión: (1) si `RUNS.active` está RUNNING o CANCELLING y su `project_id` coincide → **409** «Hay un análisis en curso para este proyecto; cancela antes de eliminarlo». (2) Si está en `LOCAL` → `local_projects.remove_local(pid)` → 200 `{"ok": true, "kind": "local"}`. (3) Si está en `GIT` → `git_projects.remove_git(pid)` (pops el registro y `shutil.rmtree(dest, ignore_errors=True)`) → 200 `{"ok": true, "kind": "git"}`. (4) Si es un sample (`samples_dir / project_id` es directorio, con la misma salvaguarda de `.`/`..`/rutas absolutas que `get_project`) → **409** «Los proyectos de ejemplo no se pueden eliminar». (5) Si no → **404** «Proyecto no encontrado».
- Helpers nuevos: `local_projects.remove_local(project_id) -> bool` (pop del dict; sin I/O) y `git_projects.remove_git(project_id) -> bool` (pop + `rmtree`). El endpoint es `def` (el rmtree es I/O de disco → threadpool).
- **Local nunca toca el disco** (el registro solo apunta a la carpeta del usuario). El clon git es propiedad del workspace: se borra entero.
- Seguridad: mismo nivel de confianza que el resto de la API (solo localhost, single-user por diseño); el path borrado siempre proviene del propio registro `GIT` (nunca del usuario).

**Front — `SourceScreen` (rama live, fila de proyecto):**
- Las filas live pasan de `<button role="radio">` a `<div role="radio" tabIndex={0}>` (un `<button>` anidado sería HTML inválido) con `onClick` y `onKeyDown` (Enter/Espacio) para seleccionar; el aria se conserva (`aria-checked`).
- En cada fila con `kind === 'local'` o `kind === 'git'` aparece a la derecha un botón pequeño «🗑 ELIMINAR» (aria-label `Eliminar <name>`, estilo ghost del repo, `onClick` con `stopPropagation`). Las filas `sample` (o sin `kind`) **no** lo muestran.
- Flujo: click → `window.confirm(...)` con copy según kind:
  - git: `¿Eliminar "<name>" de la lista? Se borrará su clon del workspace. El repositorio original no se toca.`
  - local: `¿Eliminar "<name>" de la lista? La carpeta original y sus archivos no se tocan.`
  - `confirm` falso → no pasa nada. Verdadero → `DELETE /api/projects/<id>`:
    - 200 → `await onRefresh?.()`; si la fila eliminada era la seleccionada → `setSelected(null)` (CONTINUAR queda deshabilitado).
    - 409 → error inline bajo la lista (monospace `text-sev-critical`, mismo patrón que `localError`): el `detail` del backend.
    - 404 → «El proyecto ya no existe» + `onRefresh()`.
    - otra cosa / red → «Error de conexión con el backend».
  - Mientras se elimina (estado `deletingId`): el botón queda deshabilitado con «…».
- Modo mock: sin cambios (los proyectos mock no se eliminan).

**Tests:** backend en `backend/tests/test_projects_delete.py` (nuevo): local 200 + desaparece de `/api/projects` + **los archivos siguen en disco**; git 200 + **el directorio del clon desaparece** + desaparece de la lista; sample 409; desconocido 404; run activo (fijado sobre el registry) 409. Front en `SourceScreen.test.tsx`: botón presente solo en local/git (no en sample); confirm→true dispara `DELETE /api/projects/<id>` y `onRefresh`; confirm→false no dispara nada; eliminar la fila seleccionada limpia la selección; 409 → mensaje inline.

## 6. G2 — Marcar/desmarcar todos (resumen)

**`useAnalysis`:** nuevo `setAllFindingIds(ids: string[])` (setter directo de `selectedFindingIds`, mismo patrón que `setAllVulns`). `App.tsx` lo pasa a `SummaryScreen` como `onSetAllFindings`.

**`SummaryScreen`:** en el pie, junto al contador «N DE M HALLAZGOS MARCADOS PARA EL ALCANCE», un botón small (estilo texto como «← Volver»: `font-mono text-xs uppercase tracking-widest text-ink-dim hover:text-neon-cyan`):
- `allMarked = total > 0 && findings.every(f => selectedFindingIds.includes(f.id))`.
- `allMarked` → label «DESMARCAR TODOS», click → `onSetAllFindings([])`.
- Si no → label «MARCAR TODOS», click → `onSetAllFindings(findings.map(f => f.id))`.
- `total === 0` → deshabilitado.
- El contador, el enable de «GENERAR ALCANCE DE MEJORA ▸» y el ScopeModal funcionan igual que hoy (ya leen `selectedFindingIds`).

**Tests** (`SummaryScreen.test.tsx`): «MARCAR TODOS» → `onSetAllFindings` con los 4 ids → contador «4 DE 4» → label cambia a «DESMARCAR TODOS» → click → `onSetAllFindings([])` → contador «0 DE 4». Con 0 hallazgos: deshabilitado.

## 7. G3 — Orden alternativo (resumen)

**`SummaryScreen`:** estado local `order: 'severity' | 'type'` (default `'severity'`). La lista renderiza:

```ts
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const ordered = useMemo(() => {
  const arr = [...findings]
  if (order === 'severity') {
    arr.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  } else {
    arr.sort((a, b) =>
      a.vulnId === b.vulnId
        ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        : a.vulnId < b.vulnId ? -1 : 1)
  }
  return arr
}, [findings, order])
```

- `Array.prototype.sort` es estable: igual criterio conserva el orden de llegada del motor (invariante heredada: no reordenar dentro de un empate).
- Control de UI sobre la lista de hallazgos: `role="group" aria-label="Orden de los hallazgos"` con label «ORDEN» + 2 botones pequeños (estilo de las tabs de SourceScreen: `font-mono text-[10px] uppercase tracking-widest`, activo = `border-neon-cyan bg-neon-cyan/10 text-neon-cyan`, inactivo = `border-ink-faint text-ink-faint hover:text-ink-dim`): **«CRITICIDAD»** y **«TIPO»**. Sin separadores de grupo ni color de grupo (ruling del usuario); las cards ya llevan el tag `A0X · NOMBRE`.
- La expansión por defecto no cambia (`findings.find(critical) ?? findings[0]` sobre el array original; en modo criticidad coincide con el primer elemento mostrado).
- El badge/barra de severidad, el contador de marcados, el PDF y el scope **no** dependen del orden (los hallazgos viajan tal cual; el texto del alcance y el PDF de reporte ordenan por su cuenta).

**Tests** (`SummaryScreen.test.tsx`): fixture desordenado `[low A09, critical A01, high A03, medium A02, low A03]` → por defecto el documento lista critical→high→medium→low→low; en «TIPO» → A01, A02, A03(high), A03(low), A09 (grupo A03 con el high antes del low). La conmutación re-renderiza en el nuevo orden (assert por orden de los `data-testid="finding-card"`).

## 8. G4 — Reestilo del PDF de alcance

**Fórmula: el texto plano del usuario sigue siendo la fuente; el backend lo parsea y estila lo que reconoce, y lo que no reconozca se imprime como párrafo plano (fallback gracioso).** No cambia el contrato `POST /api/reports/scope-pdf` ni el ScopeModal (el usuario edita el texto y el PDF refleja sus ediciones).

**Parser (`_parse_scope_text` en `pdf_report.py`):**
- Bloques = `re.split(r"\n\s*\n", text.strip())` no vacíos.
- **Cabecera:** el primer bloque es cabecera si tiene ≤ 2 líneas Y su primera línea NO encaja en el patrón de card. Lnea 1 → título del documento (centrado); línea 2 → subtítulo (centrado, secundario). Sin cabecera → se usa el parámetro `title` (default «Alcance técnico de mejora»).
- **Card:** primera línea `^(\d+)\.\s+(.+?)(?:\s+—\s+(CRÍTICO|ALTO|MEDIO|BAJO))?$` → `{num, title, severity | None}` + resto de líneas = cuerpo. Mapa a severidad: CRÍTICO→critical, ALTO→high, MEDIO→medium, BAJO→low.
- **Plano:** cualquier otro bloque → párrafo plano (wrap normal). Cubre texto editado por el usuario que no encaje.

**Layout (página 1):**
- Logo **centrado** (`drawImage` con `mask="auto"`, ancho 45 mm como hoy).
- Título **centrado** (`drawCentredString`, Helvetica-Bold 16, `_TXT`) + subtítulo centrado (10 pt, `_TXT_SEC`) + filete de acento centrado (30 mm × 0,8 mm, `_ACCENT`).
- **Cada card = caja** con: fondo `#f3f4f6` (`_BOX_BG`), borde `#e5e7eb` (`_BOX_BORDER`, 0,5 pt), **barra de acento izquierda 1,6 mm** en el color de severidad (`_SEV`; sin severidad → `_ACCENT`), padding 4 mm. Dentro, arriba→abajo:
  1. **Chip de severidad** (solo si hay severidad): rectángulo relleno del color de severidad, h 5 mm, texto blanco 8 pt bold (CRÍTICO/ALTO/MEDIO/BAJO), ancho = texto + 4 mm.
  2. **Título** `f"{num}. {title}"` Helvetica-Bold 11 `_TXT` (wrap).
  3. **Cuerpo** (10 pt `_TXT`, wrap): línea con prefijo `Objetivo:` → label en bold 9 pt `_ACCENT` + resto en la misma línea (corte en el primer `: `); el resto de líneas (p. ej. «· Revisar…») tal cual (la media «·» U+00B7 está en WinAnsi).
  4. **Línea `Estimación:`** (prefijo): filete fino (`_BOX_BORDER`, 0,3 pt) 1,5 mm antes + label bold 9,5 pt `_TXT` + resto 9,5 pt `_TXT_SEC` — siempre cabe en una línea (≈ 45 mm a 9,5 pt sobre 170 mm de ancho útil): resuelve el «salta mal» de la frase de estimación.
- Aire entre cards: 4 mm. Párrafos planos: 10 pt `_TXT` con 2 mm de aire.
- **Control de saltos:** antes de empezar una card, `ensure(5mm + línea de título + 1 línea de cuerpo)` (el chip + título + al menos una línea deben caber juntos; si no, salta de página). La caja **puede** partirse entre páginas: fondo y barra de acento se pintan por segmento de línea (mismo patrón que `code_box` de `build_report_pdf`), así un bloque grande se ve continuo.

**Páginas 2+:** cabecera izquierda = parámetro `title` (8 pt `_TXT_SEC`); pie = «Página N» a la izquierda + «Serbatic Security Inspector» a la derecha (misma función `_page_deco` que el reporte). `pageCompression=0` (los tests inspeccionan bytes; el helper `_scope_content` de `test_pdf_report.py` se actualiza para aceptar streams sin comprimir).

**Tests** (`test_pdf_report.py`, patrones existentes — `_drawn_strings`, `_rg_colors`, octal `P\341gina`):
- Payload realista (cabecera + 3 cards: una por severidad, con líneas Objetivo/·/Estimación) → `%PDF-`, título centrado presente, **colores de los chips** (los 4 hex de `_SEV` como `rg`), `Helvetica-Bold` presente, línea de estimación entera en una sola cadena dibujada, sin `nnnnnn`.
- Cabecera ausente (el usuario la borró) → título = parámetro `title`.
- Bloque plano (texto editado que no encaja) → se imprime plano, PDF válido.
- Sin severidad en el título de una card (editado) → card sin chip (acento `_ACCENT`), PDF válido.
- Texto largo (p. ej. 30 cards) → multipágina + «Página 2» (octal) + marca en el pie.
- CJK/emoji → «?» (test existente sigue pasando); `longo > corto` sigue pasando; endpoint 200 + attachment sigue pasando.
- **`build_report_pdf` intacto:** todos sus tests actuales pasan sin cambios (el reestilo solo toca `build_scope_pdf` + el parser nuevo).

## 9. G5 — Diferidos de 2b.1 (BrowseModal + browse)

**Ruling de scope (autónomo, sin usuario):** «minors del ledger» = solo los de robustez del flujo browse (G5a–c). Se diferirán explícitamente al ledger los demás minors de 2b.1: doble pintado de `_BOX_BG` (mandado por el brief de la época), header sin wrap para nombres ~120+ chars (cosmético), glifos ✓/⚠ en consola cp850 (cosmético de scripts), semántica «mata cualquier listener del puerto» de `stop-all` (mandada por el brief), parámetro `doc` sin uso en `_page_deco` (cosmético), underflow del helper `bodies` en tests (solo test). Coste si es erróneo: nada funcional — son polish que el usuario no pidió.

- **G5a — `detail` del backend en el error del modal:** en `BrowseModal.navigate`, si la respuesta no es 200 → `const detail = (await res.json().catch(() => null))?.detail` → `setError(typeof detail === 'string' && detail ? detail : 'No se pudo leer la carpeta')`. El `catch` de red (backend caído) sigue mostrando «No se pudo leer la carpeta».
- **G5b — guard anti-race in-flight:** `const navSeq = useRef(0)`; en `navigate`: `const seq = ++navSeq.current` antes del `await`; después, `if (seq !== navSeq.current) return` antes de tocar el estado (una respuesta lenta de una navegación obsoleta no pisa la más reciente).
- **G5c — null-byte → 400 en `GET /api/browse`:** el `try` que construye `Path(path)` captura también `ValueError` (hoy solo `OSError`; un null-byte en la query levanta `ValueError` → 500). → 400 «Ruta no válida».

**Tests:** backend (en `test_browse.py`): `GET /api/browse?path=C:/x%00y` → 400 (no 500). Front (en `BrowseModal.test.tsx`): (a) 400 con body `{"detail": "La ruta no es una carpeta"}` → el modal muestra ese detail; (b) race: primera navegación lenta (promesa pendiente), segunda navegación se dispara y resuelve, la primera resuelve después → el DOM muestra la segunda (la obsoleta se descarta).

## 10. Estructura de la fase (tasks, se detallan en el plan)

1. **T1 — Backend: `DELETE /api/projects/{id}`** (G1): helpers `remove_local`/`remove_git` + endpoint (guard de run, sample 409, 404) + `test_projects_delete.py`.
2. **T2 — Front: botón eliminar en SourceScreen live** (G1): fila `div role="radio"` + botón 🗑 + confirm + DELETE + refresh + selección + error 409/404 + tests.
3. **T3 — Front: orden + marcar todos en SummaryScreen** (G2+G3): `setAllFindingIds` en `useAnalysis` + prop/cableado en `App.tsx` + control de orden + botón marcar/desmarcar + tests.
4. **T4 — Backend: reestilo del PDF de alcance** (G4): parser + layout de cards + cabecera centrada + deco páginas 2+ + tests (reporte intacto).
5. **T5 — BrowseModal + browse: diferidos** (G5): detail + guard in-flight + null-byte 400 + tests.
6. **T6 — Cierre:** E2E real (DELETE git/local por la API + re-clon + PDF de alcance real + run miniapp de saneidad) + suites completas + **final review de rama desde `v0.3.1`** + tag `v0.3.2` + cierre de PROGRESS con lista QA R14+ para el usuario.

## 11. Aceptación (fina de fase)

- **G1:** en modo live, una fila git se elimina (confirm) → el clon de `workspace/repos/…` desaparece del disco y la fila de la lista; una fila local se elimina → la fila desaparece y **la carpeta original sigue íntegra**; las filas sample no tienen botón; cancelar el confirm no hace nada; con un run en curso → 409 y la fila sigue.
- **G2:** «MARCAR TODOS» marca los M hallazgos (contador «M DE M», GENERAR ALCANCE habilitado); «DESMARCAR TODOS» limpia.
- **G3:** el resumen cambia de orden al conmutar; en CRITICIDAD el más crítico siempre arriba; en TIPO los grupos van A01→A10 con el más crítico dentro de cada grupo.
- **G4:** `alcance.pdf` nuevo: título centrado, cada apartado en caja con chip de severidad a color + barra de acento, «Estimación…» en una línea con filete, páginas 2+ con pie; el PDF de reporte es byte-a-byte igual en comportamiento (tests sin cambios).
- **G5:** error del navegador con el detail del backend; navegación rápida sin pisar; path con null-byte → 400.
- Suites finales: backend `pytest -q` (incluye gate LLM real) y front `npx vitest run` + `npm run build` — todo verde. E2E real documentado en PROGRESS.

## 12. Libre del builder (no hay preguntas abiertas al usuario)

- Dimensiones mm exactas del layout de cards (padding, alto de chip, filetes): criterio «claro, elegante, coherente con la paleta del PDF de cliente (G3 2b.1)».
- Copy exacto de los confirms de borrado y de los mensajes de error de DELETE (español, tono del repo).
- Posición exacta del control «ORDEN» y del botón «MARCAR TODOS» (criterio: sin romper el layout existente, visible junto a la lista/pie).
- Umbral del parser de cabecera (≤ 2 líneas): criterio «reconocer la cabecera generada y las ediciones leves; todo lo demás, plano».
