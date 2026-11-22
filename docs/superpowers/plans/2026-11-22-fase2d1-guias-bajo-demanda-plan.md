# Plan Fase 2d.1 — Guías bajo demanda (híbrido) + samples corregidos

Para el trabajador (agente de ejecución SDD): trabaja TASK por TASK, en orden. TDD
estricto: escribe el test → véELO fallar (rojo) → implementa el mínimo → véELO pasar
(verde). Al final de CADA task: suite completa una sola vez y UN commit con el mensaje
exacto indicado. No hagas commits intermedios ni por bookkeeping.

- **Spec (fuente del porqué y de lo decidido):**
  `docs/superpowers/specs/2026-11-22-fase2d1-guias-bajo-demanda-design.md`
- **Progreso:** `PROGRESS.md` (sección «Progreso Fase 2d.1» al final de este plan).
- **Repo:** `rferreroSerbatic/SerbaticSecurityInspector` (privado), rama `main` directa
  (sin worktree). Tag previsto al cierre: `v0.4.1` (lo hace el coordinador, no el implementador).

## Goal

Las llamadas LLM de guías de explotación dejan de hacerse durante el análisis (se
elimina la «oleada 3» del pipeline) y pasan a ser **bajo demanda**: (a) al pinchar
«CÓMO EXPLOTAR» en un hallazgo sin guía (`POST /api/guides`), y (b) al exportar el
informe PDF, que genera solo las guías faltantes si el `projectId` se resuelve
(`POST /api/reports/full-pdf` con `projectId`). Además: los 2 samples rotos se
corrigen para que la vulnerabilidad de su nombre sea detectable.

## Architecture

- **Backend:** `agents/guides.py` gana `one_guide` (1 hallazgo → 1 llamada → texto o
  None) y `run_guides` acepta `run=None` (pool sin guards ni logs, para el export).
  El pipeline vuelve a 2 oleadas (revert del bloque oleada 3; se conserva el
  comportamiento R3-1: findings de agente en vuelo sobreviven al cancel).
  Nuevo endpoint REST `POST /api/guides`; `full-pdf` es `async`, resuelve el proyecto
  (local → git → samples) en `to_thread`, genera guías faltantes y 404 si el proyecto
  no se resuelve. Sin nuevos eventos SSE, sin nuevas dependencias.
- **Front:** botón «CÓMO EXPLOTAR ▸» también en hallazgos sin guía **solo en modo
  live**; modal con estados de carga y error + REINTENTAR; la guía generada se guarda
  en el estado compartido del análisis (`updateFindingGuide`); el export manda
  `projectId` y, si el backend da 404, reintenta sin él y avisa con una nota
  (el export nunca falla silenciosamente). Modo mock: sin botón, sin `projectId`.
- **Samples:** DEMO-Injection → SQLi de libro en `app.js` (escaneable, `.html` no se
  escanea); DEMO-Broken-Access-Control → secretos en `admin.js` (escaneable) en vez
  de en el `<pre>` de `admin.html`.

## Tech Stack

Vite 5 + React 18 + TypeScript strict + Tailwind 3.4 + Vitest/Testing Library/jsdom
(front); FastAPI + reportlab + httpx (backend). **Cero dependencias nuevas.**

## Restricciones globales (inviolables)

1. **Stack inmutable:** nada de router, librerías de estado, librerías de UI,
   persistencia, ni dependencias nuevas.
2. **Contrato SSE inmutable:** la guía bajo demanda es REST normal. No se crean
   eventos SSE nuevos ni se cambian los existentes.
3. **Copy de la UI en español.** Paletas inmutables (Tailwind del repo).
4. **Ruling «siempre modo real»:** `mockFindings.ts` NO se toca; el mock no lleva
   guías ni botón «CÓMO EXPLOTAR» (no hay `canGenerateGuide` en mock).
5. **`build_scope_pdf` / `scope-pdf` no se tocan** (ruling 2d). El PDF de alcance no
   lleva guías (lo verifica la Task 7).
6. **I/O de disco fuera del event loop** (resolución de proyecto y build del PDF en
   `asyncio.to_thread`).
7. **Prompts de agentes de vulnerabilidad y del perfilador: NO se tocan.** Solo se
   reutiliza `build_guide_prompt` (guides.py).
8. **Windows + PowerShell 5.1:** separador `;` en cadenas de comandos; mensajes de
   commit ASCII sin acentos (el repo lleva esa convención); Python SIEMPRE
   `.\.venv\Scripts\python.exe` con workdir `backend/` (o raíz, según indique la task);
   `git push` en PS 5.1 reporta `NativeCommandError` aunque funcione: comprueba la
   línea `old..new main -> main` para confirmar.
9. **TDD estricto:** rojo→verde SOLO de los tests de la task (fichero concreto).
   Suite completa (`pytest -q` backend / `npx vitest run` + `npm run build` front)
   UNA sola vez al final de la task. No re-ejecues en cada paso.
10. **PDF (reportlab 5.1.0):** bytes ≥0x7F se escriben como escape octal
    (`GU\315A DE EXPLOTACI\323N` para «GUÍA DE EXPLOTACIÓN»). Deriva SIEMPRE el patrón
    con el helper `_b()` de `backend/tests/test_pdf_report.py` (replica la
    serialización de reportlab) o con la función `esc()` que incluye la Task 7.
    NUNCA asumas cp1252 crudo en los bytes.
11. **Bookkeeping** (checkboxes de PROGRESS/plan): NO lo committee el implementador;
    lo hace el coordinador en el commit de cierre.
12. **Servidores al terminar (Task 7):** backend uvicorn :8000 y front Vite :5173
    ARRANCADOS (QA del usuario).
13. **No borrar** `.tmp/` (gitignored; ahí viven los scripts de E2E y su evidencia).

## Review Focus (modos de fallo no obvios, con test anclado)

| # | Modo de fallo | Test que lo fija |
|---|---|---|
| RF1 | El archivo del hallazgo ya no existe en el proyecto al pinchar (se borró tras el análisis) → la guía se genera anclada SOLO al snippet (200, no 404/500) | `test_guides_endpoint_archivo_borrado_dada_guia_con_snippet` (Task 4) |
| RF2 | `profile` del request es dict parcial o malformado (cliente antiguo) → no crash; guía sin perfil | `test_guides_endpoint_profile_incompleto_no_crasha` (Task 4) |
| RF3 | Export con un finding `guide: ""` (vacío) → se trata como faltante y se genera | `test_full_pdf_guide_vacia_se_genera` (Task 5) |
| RF4 | Export con TODOS los findings ya con guía (vistos al pinchar) → cero llamadas LLM | `test_full_pdf_todas_con_guide_no_llm` (Task 5) |
| RF5 | Modo mock: sin botón «CÓMO EXPLOTAR» y export sin `projectId` (sin generación) | tests de base del fixture + `test_full_pdf_sin_projectId_no_llm` (Task 6 y 5) |

---

## Task 1 — Samples: DEMO-Injection (SQLi) y DEMO-Broken-Access-Control (admin.js)

Archivos:
- Modificar: `samples/DEMO-Injection/app.js` (reescrito completo)
- Borrar: `samples/DEMO-Injection/index.html`
- Modificar: `samples/DEMO-Injection/README.md` (reescrito completo)
- Crear: `samples/DEMO-Broken-Access-Control/admin.js`
- Modificar: `samples/DEMO-Broken-Access-Control/admin.html` (quitar el `<pre>` de secretos, cargar `admin.js`)
- Modificar: `samples/DEMO-Broken-Access-Control/README.md`
- Crear (verificación, gitignored): `.tmp/verify-samples.py`

**AVISO (comprobado contra el repo):** los tres directorios `samples/DEMO-*` están
**sin trackear** (existen en disco pero nunca se commitearon). El commit de esta
task los añade al repo **por primera vez**, incluido `DEMO-Authentication-Failures/`
(intacto) para que un clone fresco tenga los 3 demos. Por eso el paso 2 borra el
`index.html` con un borrado plano (no `git rm`) y el paso 6 hace `git add` de los 3
directorios.

**Contexto del diagnóstico (evidencia en `.tmp/diag-injection.json`):** los `.html` no
se escanean (`CODE_EXTS` en `backend/app/scanner.py` línea 8) y el prompt A03
(`agents/vulns.py` línea 37) busca inyección de lado servidor. Por eso: el SQLi va a
`app.js` (patrón de lado servidor) y los secretos BAC van a `admin.js`.

### Paso 1 — Nuevo `samples/DEMO-Injection/app.js` (contenido verbatim completo)

```js
// Vulnerabilidad: SQL Injection (A03:2021). La consulta se construye
// concatenando la entrada del usuario (req.query.user) sin parametrizar
// ni escapar. `db` es un stub: en un sistema real ejecutaría la query
// contra la base de datos.
var db = {
  exec: function (sql, cb) {
    console.log('SQL:', sql)
    cb(null, [{ user: 'maria' }, { user: 'jose' }])
  },
}

app.get('/api/users', function (req, res) {
  var sql = "SELECT * FROM users WHERE user = '" + req.query.user + "'"
  db.exec(sql, function (err, rows) {
    if (err) return res.status(500).send('Error de BD')
    res.json(rows)
  })
})
```

### Paso 2 — Borrar `samples/DEMO-Injection/index.html` y nuevo `README.md` (verbatim)

Borrado plano (el fichero está sin trackear; `git rm` fallaría):
`Remove-Item samples\DEMO-Injection\index.html`

```md
# DEMO - Injection / SQL Injection (A03:2021)

El handler `/api/users` construye la consulta SQL concatenando la entrada del
usuario (`req.query.user`) sin parametrizar ni escapar.

## Cómo explotarla
1. Pide `GET /api/users?user=' OR '1'='1`.
2. La query resultante (`... WHERE user = '' OR '1'='1'`) siempre es verdadera:
   devuelve la tabla completa sin credenciales.
3. Variante: `?user=maria' --` comenta el resto de la query.

## Test para el scanner
- La concatenación está en `app.js` (línea `var sql =`).
- El análisis (agente A03) debe reportar inyección SQL en `app.js`.

## Ejecución
Proyecto de ejemplo para auditar (no se ejecuta: `db` es un stub).
```

### Paso 3 — Nuevo `samples/DEMO-Broken-Access-Control/admin.js` (verbatim)

```js
// Vulnerabilidad: el panel de administración (admin.html) se sirve sin
// comprobar autenticación alguna y expone los secretos del sistema en el
// código que cualquier visitante recibe.
var CONFIG = {
  API_KEY: 'sk-1234567890abcdef',
  DB_HOST: '10.0.0.5',
  DB_PASS: 'SuperSecret99',
}

function renderConfig() {
  document.getElementById('admin-config').textContent =
    'API_KEY=' + CONFIG.API_KEY + '\n' +
    'DB_HOST=' + CONFIG.DB_HOST + '\n' +
    'DB_PASS=' + CONFIG.DB_PASS
}

renderConfig()
```

### Paso 4 — `admin.html` + `README.md` de DEMO-Broken-Access-Control

- `admin.html`: sustituir el bloque `<pre>` que contiene los secretos en claro
  (`API_KEY=...`, `DB_HOST=...`, `DB_PASS=...`) por `<pre id="admin-config"></pre>`
  (el contenido ahora lo pinta `admin.js`), y añadir `<script src="admin.js"></script>`
  justo antes de `</body>`. No tocar el resto (tabla de usuarios, etc.).
- `README.md`: añadir/actualizar las líneas de «Test para el scanner»: los secretos
  están en `admin.js` (escaneable; los `.html` no se escanean) y el análisis debe
  reportar hallazgos en `admin.js` (A02 claves hardcoded, A01 panel sin autenticación).

### Paso 5 — Verificación con runs REALES (es el «test» de esta task)

Prerrequisito: backend arrancado en :8000 (si no lo está: workdir `backend/`,
`.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` en background).

Crear `.tmp/verify-samples.py` (verbatim) y ejecutarlo desde la raíz del repo:
`.\backend\.venv\Scripts\python.exe .tmp\verify-samples.py`

```python
"""Verificacion de los samples corregidos (Fase 2d.1, Task 1): run real por proyecto."""
import json
import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

B = "http://localhost:8000"
c = httpx.Client(timeout=900)


def run_project(name: str) -> list:
    projs = c.get(f"{B}/api/projects").json()
    proj = [p for p in projs if p.get("name") == name][0]
    r = c.post(
        f"{B}/api/analyze",
        json={"projectId": proj["id"],
              "vulnIds": ["A01", "A02", "A03", "A04", "A05",
                          "A06", "A07", "A08", "A09", "A10"]},
    )
    assert r.status_code == 202, r.text
    run_id = r.json()["runId"]
    events = []
    with c.stream("GET", f"{B}/api/runs/{run_id}/events") as resp:
        for line in resp.iter_lines():
            if line.startswith("data:"):
                ev = json.loads(line[5:])
                events.append(ev)
                if ev.get("type") in ("run:done", "run:cancelled", "run:error"):
                    break
    done = [e for e in events if e["type"] == "run:done"]
    if not done:
        print("ERROR:", name, "sin run:done:", events[-1] if events else "sin eventos")
        sys.exit(1)
    return done[0]["findings"]


ok = True

inj = run_project("DEMO-Injection")
a03 = [f for f in inj if f.get("vulnId") == "A03" and f.get("file") == "app.js"]
print("DEMO-Injection findings:", len(inj), "| A03 en app.js:", len(a03))
ok = ok and bool(a03)

bac = run_project("DEMO-Broken-Access-Control")
adm = [f for f in bac if f.get("file") == "admin.js"]
print("DEMO-Broken-Access-Control findings:", len(bac), "| en admin.js:", len(adm))
ok = ok and bool(adm)

sys.exit(0 if ok else 1)
```

Verde = exit 0 y `A03 en app.js: ≥1` y `en admin.js: ≥1`. Si falla: NO adivines —
inspecciona los eventos del run (`.tmp/` o el log de uvicorn) y ajusta el sample
(para qué sirve el sample: que la vulnerabilidad de su nombre sea detectable).

### Paso 6 — Commit

Los samples van al repo **por primera vez** (estaban sin trackear). Se añaden los 3
demos para que un clone fresco los tenga completos (Authentication intacto):

```
git add samples/DEMO-Injection samples/DEMO-Broken-Access-Control samples/DEMO-Authentication-Failures
git commit -m "fix(samples): demo de inyeccion con SQLi y secretos BAC en admin.js (+samples a git)"
```

---

## Task 2 — Backend: `one_guide` + `run_guides(run=None)` (reuso para guías bajo demanda)

Archivos:
- Modificar: `backend/app/agents/guides.py`
- Modificar: `backend/tests/test_guides.py`

**Consume:** `build_guide_prompt`, `extract_guide`, `GUIDE_MAX_TOKENS`, `LLMError`,
`Profile`, `ScanResult` (todo ya existe en guides.py / su entorno).

**Produce (interfaces exactas):**
- `find_file_content(scan, finding: dict) -> str | None` — público; contenido del
  archivo que apunta el hallazgo (`cf.path == finding.get("file")`) buscando en
  `[*scan.files, *scan.manifests]`; `None` si no está.
- `async def one_guide(llm, finding: dict, file_content: str | None,
  profile: Profile | None, project_name: str) -> str | None` — 1 llamada LLM
  (`llm.chat(system, user, max_tokens=GUIDE_MAX_TOKENS)`, SIN `on_progress`);
  `None` si `LLMError` o si el texto extraído queda vacío.
- `async def run_guides(llm, findings, scan, profile, project_name, run=None,
  concurrency=3)` — con `run=None`: pool de `one_guide` limitado por semáforo, SIN
  guards de estado, SIN eventos, muta `finding["guide"]` solo si el texto no es
  vacío, devuelve `(0, 0.0)`. Con `run` (posicional, como hoy): comportamiento
  idéntico al actual (logs, guards, totales), usando `find_file_content` para el
  lookup. El default `concurrency=3` replica el default de `llm_concurrency` (config).

### Paso 1 — Rojo: tests nuevos en `backend/tests/test_guides.py`

Actualizar la import de la línea 66 a:
`from app.agents.guides import find_file_content, one_guide, run_guides`

Añadir al final del fichero (verbatim):

```python
def test_find_file_content_localiza_el_archivo_del_hallazgo():
    assert find_file_content(scan, _finding("A01-1", "A01")) == "const l1 = 'SQL';\n" * 9 + "l10"
    assert find_file_content(scan, _finding("A01-1", "A01", file="no-existe.js")) is None


def test_one_guide_devuelve_texto_limpio():
    llm = FakeGuideLLM()
    g = asyncio.run(one_guide(llm, _finding("A03-1", "A03"), "content", None, "miniapp"))
    assert g == llm.canned


def test_one_guide_llm_error_da_none():
    llm = FakeGuideLLM(fail_indexes={0})
    assert asyncio.run(one_guide(llm, _finding("A03-1", "A03"), None, None, "p")) is None


def test_one_guide_vacio_da_none():
    llm = FakeGuideLLM(canned="```\n```")
    assert asyncio.run(one_guide(llm, _finding("A03-1", "A03"), None, None, "p")) is None


def test_run_guides_run_none_genera_sus_guias():
    fs = [_finding("A01-1", "A01"), _finding("A03-1", "A03", file="routes/admin.js")]
    llm = FakeGuideLLM()
    tokens, llm_s = asyncio.run(run_guides(llm, fs, scan, None, "miniapp", None, concurrency=2))
    assert (tokens, llm_s) == (0, 0.0)
    assert all(f["guide"] == llm.canned for f in fs)
    assert llm.calls == 2


def test_run_guides_run_none_fallo_no_falla():
    fs = [_finding("A01-1", "A01"), _finding("A03-1", "A03", file="routes/admin.js")]
    llm = FakeGuideLLM(fail_indexes={0})
    # concurrency=1: determinista (la llamada 0 es la del primer finding)
    asyncio.run(run_guides(llm, fs, scan, None, "p", None, concurrency=1))
    assert "guide" not in fs[0]
    assert fs[1]["guide"] == llm.canned
```

Nota: `FakeGuideLLM`, `_finding` y `scan` son los helpers existentes del fichero
(`FakeGuideLLM(canned=..., fail_indexes=(), delay=0.0)`, `.calls`, `.users`).

Ejecutar: `pytest tests/test_guides.py -v` → **ROJO** (ImportError: `one_guide`,
`find_file_content`).

### Paso 2 — Implementar en `backend/app/agents/guides.py`

Añadir (ubicación: `find_file_content` y `one_guide` antes de `run_guides`):

```python
def find_file_content(scan, finding: dict) -> str | None:
    """Contenido del archivo que apunta el hallazgo (o None si no está en el escaneo)."""
    return next((cf.content for cf in [*scan.files, *scan.manifests]
                 if cf.path == finding.get("file")), None)


async def one_guide(llm, finding: dict, file_content: str | None,
                    profile: Profile | None, project_name: str) -> str | None:
    """Guía de un hallazgo: 1 llamada LLM. ``None`` si el LLM falla o el texto queda vacío."""
    system, user = build_guide_prompt(finding, file_content, profile, project_name)
    try:
        res = await llm.chat(system, user, max_tokens=GUIDE_MAX_TOKENS)
    except LLMError:
        return None
    return extract_guide(res.content) or None
```

`run_guides`: cambiar la firma a `(llm, findings, scan, profile, project_name,
run=None, concurrency=3)` y reorganizar el inicio:

```python
    if not findings:
        return 0, 0.0
    if run is None:
        # Fase 2d.1: export bajo demanda — sin run no hay guards ni eventos.
        sem = asyncio.Semaphore(concurrency)

        async def g(f):
            async with sem:
                text = await one_guide(llm, f, find_file_content(scan, f),
                                       profile, project_name)
                if text:
                    f["guide"] = text

        await asyncio.gather(*(g(f) for f in findings))
        return 0, 0.0
    if run.status != RunStatus.RUNNING:
        return 0, 0.0
    # ... (cuerpo con run: SIN CAMBIOS respecto a hoy; el lookup de file_content
    #     que hacía inline se sustituye por find_file_content(scan, f))
```

El cuerpo «con run» se mantiene idéntico en comportamiento (emit del log inicial,
semáforo, guards `run.status in (ERROR, CANCELLED)` antes y tras la llamada,
totales `tokens`/`llm_s`, asignación de `f["guide"]`).

### Paso 3 — Verde

`pytest tests/test_guides.py -v` → 19 pass (13 + 6 nuevos).

### Paso 4 — Suite completa

`pytest -q` (workdir `backend/`) → 140 pass (134 + 6).

### Paso 5 — Commit

```
git add backend/app/agents/guides.py backend/tests/test_guides.py
git commit -m "feat(backend): one_guide y run_guides(run=None) para guias bajo demanda"
```

---

## Task 3 — Revert del pipeline: la oleada 3 desaparece (2 oleadas)

Archivos:
- Modificar: `backend/app/pipeline.py`
- Modificar: `backend/tests/test_pipeline.py`
- Modificar: `backend/tests/test_runs_api.py`

**Produce:** el pipeline ya no llama a `run_guides`; los findings de `run:done` /
`run:cancelled` NO llevan `guide`; no hay log «Guías de explotación…». Se conserva
el comportamiento R3-1 (línea ~155 de pipeline.py: el check post-chat
`if run.status in (RunStatus.ERROR, RunStatus.CANCELLED): return` y su comentario,
y el cierre que emite `run:cancelled` con los findings acumulados).

### Paso 1 — Rojo: actualizar tests al comportamiento esperado

`backend/tests/test_pipeline.py`:

1. **Borrar** `test_pipeline_wave3_run_done_findings_del_evento_llevan_guide`
   (~línea 357) y `test_pipeline_wave3_cancel_en_vuelo_de_guia` (~línea 387) enteros.
2. **Sustituir** `test_pipeline_wave3_cancel_en_oleada2_salta_guías` (~línea 368)
   por este (conserva el coverage R3-1):

```python
def test_pipeline_cancel_en_oleada2_conserva_findings_del_agente_en_vuelo():
    """R3-1 (2d): cancel justo al terminar la oleada 2 -> CANCELLING no es terminal:
    los findings del agente en vuelo llegan en run:cancelled. (2d.1: sin oleada 3,
    el finding no lleva guía.)"""
    run = RunRegistry().start("miniapp", ["A01"])
    llm = FakeVulnLLM({"A01": A01_JSON}, PROFILE_JSON)
    orig_chat = llm.chat

    async def cancel_after_agent(system, user, max_tokens=8000, on_progress=None):
        res = await orig_chat(system, user, max_tokens=max_tokens, on_progress=on_progress)
        if "perfilador" not in system:
            run.status = RunStatus.CANCELLING
        return res

    llm.chat = cancel_after_agent
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01"], run, concurrency=1))
    cancelled = run.events[-1]
    assert types(run.events)[-1] == "run:cancelled"
    assert cancelled["findings"][0]["id"] == "A01-1"
    assert "guide" not in cancelled["findings"][0]
```

3. **`test_pipeline_full_sequence`** (~línea 106): las 2 aserciones de meta
   (~127–128) vuelven a:
   ```python
    assert final["meta"]["totalTokens"] == 10  # 2 agentes x 5 tokens
    assert final["meta"]["avgTps"] == 25.0  # 10 tokens / 0,4 s
   ```
   y se borran las 3 aserciones de guías (~129–131: prefijo de guía en cada finding
   y el log «Guías de explotación: 2 hallazgo(s) → generando…»).
4. **FakeVulnLLM**: borrar el parámetro `guide_raw` (~línea 71), los atributos
   `self.guide_raw` / `self.guide_calls` (~76–77) y la rama de guías (~87–89):
   ```python
            if "guías de explotación" in system:
                self.guide_calls += 1
                return ChatResult(content=self.guide_raw, prompt_tokens=100, completion_tokens=7, elapsed_s=0.1)
   ```

`backend/tests/test_runs_api.py`: mismo limpieza en su FakeVulnLLM (parámetro
~línea 45, atributos ~50–51, rama ~60–62).

Ejecutar: `pytest tests/test_pipeline.py tests/test_runs_api.py -v` → **ROJO**:
`test_pipeline_full_sequence` falla (el pipeline sigue generando guías:
`totalTokens` 24 ≠ 10, y el fake, sin rama de guías, se atasca en la llamada de
guía). Los demás tests de cancel/error pasan.

### Paso 2 — Revert de `backend/app/pipeline.py`

1. Borrar el import (~línea 24): `from app.agents.guides import run_guides`
2. Borrar el bloque oleada 3 (líneas 193–199, verbatim a eliminar):
   ```python
           # Oleada 3 (Fase 2d): guías de explotación — 1 llamada LLM por hallazgo
           # (pool acotado). Solo con el run vivo: ERROR/CANCELLING se cierran en su rama.
           if run.status == RunStatus.RUNNING and run.findings:
               g_tokens, g_llm_s = await run_guides(llm, run.findings, scan, profile,
                                                    project_name, run, concurrency)
               total_tokens += g_tokens
               total_llm_s += g_llm_s
   ```
3. **NO tocar** la línea R3-1 (~155) ni su comentario (~151–154), ni el cierre
   `run:cancelled` (~202–204).

### Paso 3 — Verde

`pytest tests/test_pipeline.py tests/test_runs_api.py -v` → todo pasa.

### Paso 4 — Suite completa

`pytest -q` (workdir `backend/`) → 138 pass (140 − 2 tests borrados; el test
adaptado sustituye a uno existente, sin cambio neto).

### Paso 5 — Commit

```
git add backend/app/pipeline.py backend/tests/test_pipeline.py backend/tests/test_runs_api.py
git commit -m "refactor(backend): revert de la oleada 3 del pipeline (guias bajo demanda)"
```

---

## Task 4 — Endpoint `POST /api/guides` (guía bajo demanda al pinchar)

Archivos:
- Modificar: `backend/app/main.py`
- Crear: `backend/tests/test_guides_api.py`

**Consume:** `one_guide`, `find_file_content` (Task 2); `local_analyze` /
`git_analyze` / `get_project` (misma cadena de resolución que `analyze`);
`load_settings` (lee env en cada llamada → el test puede monkeypatchear
`SAMPLES_DIR`); `build_llm` (definida en `main.py`; los tests lo monkeypatchean en
`app.main.build_llm`, patrón ya documentado en su docstring).

**Produce:**
- `POST /api/guides` — body `{projectId: str, finding: dict, profile: dict | None = None}`
  → `200 {"guide": str}` · `404 {"detail": "Proyecto no encontrado"}` ·
  `502 {"detail": "No se pudo generar la guía"}`.
- Helper privado `_profile_from_dict(data) -> Profile | None` en `main.py`
  (reconstruye el `Profile` del dict que manda el front — el shape de `to_dict()`
  del evento `profile:done` — con defaults; `None` si no es dict o falla).

Nota: `LLMClient.close()` es **async** (`llm.py:133`); el endpoint cierra el cliente
con `await llm.close()` en `finally` (mismo patrón que `analyze`).

### Paso 1 — Rojo: crear `backend/tests/test_guides_api.py` (verbatim completo)

```python
"""API POST /api/guides: guía bajo demanda de un hallazgo (Fase 2d.1)."""

import pytest
from fastapi.testclient import TestClient

from app.llm import ChatResult, LLMError
from app.main import app

FINDING = {
    "id": "A03-1", "vulnId": "A03", "severity": "critical",
    "title": "SQL Injection en /api/users", "file": "app.js", "line": 14,
    "snippet": "var sql = 'SELECT * FROM users WHERE user = ' + req.query.user",
    "exploit": "e", "consequences": "c", "solution": "s",
}


class FakeGuideAPI:
    """Guía canned para los tests del endpoint (close async: la API lo llama en finally)."""

    def __init__(self, canned="## RESUMEN\nguía api", fail=False):
        self.canned = canned
        self.fail = fail
        self.calls = 0
        self.users = []

    async def chat(self, system, user, max_tokens=8000, on_progress=None):
        self.calls += 1
        self.users.append(user)
        if self.fail:
            raise LLMError("boom")
        return ChatResult(content=self.canned, prompt_tokens=10, completion_tokens=7,
                          elapsed_s=0.1)

    async def close(self):
        pass


@pytest.fixture
def samples_dir(tmp_path):
    """Proyecto de ejemplo con un solo archivo .js (mismo patrón que test_runs_api.py)."""
    demo = tmp_path / "miniapp"
    demo.mkdir()
    (demo / "app.js").write_text("var sql = 'x';\n", encoding="utf-8")
    return tmp_path


def test_guides_endpoint_devuelve_guia(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuideAPI()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp", "finding": FINDING})
    assert r.status_code == 200
    assert r.json() == {"guide": "## RESUMEN\nguía api"}
    assert fake.calls == 1


def test_guides_endpoint_proyecto_inexistente_404(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: FakeGuideAPI())
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "no-existe", "finding": FINDING})
    assert r.status_code == 404
    assert r.json()["detail"] == "Proyecto no encontrado"


def test_guides_endpoint_llm_falla_502(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    monkeypatch.setattr("app.main.build_llm", lambda: FakeGuideAPI(fail=True))
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp", "finding": FINDING})
    assert r.status_code == 502
    assert r.json()["detail"] == "No se pudo generar la guía"


def test_guides_endpoint_archivo_borrado_dada_guia_con_snippet(monkeypatch, samples_dir):
    """RF1: el archivo del hallazgo ya no está en el proyecto -> guía anclada al snippet."""
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuideAPI()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp",
                                         "finding": {**FINDING, "file": "borrado.js"}})
    assert r.status_code == 200
    assert "Código completo del archivo" not in fake.users[0]


def test_guides_endpoint_profile_incompleto_no_crasha(monkeypatch, samples_dir):
    """RF2: profile dict parcial (cliente antiguo) -> guía sin perfil, sin crash."""
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuideAPI()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/guides", json={"projectId": "miniapp", "finding": FINDING,
                                         "profile": {"language": "Python"}})
    assert r.status_code == 200
    assert "Perfil:" not in fake.users[0]
```

Nota: los textos «Código completo del archivo» y «Perfil:» son secciones existentes
del user prompt de `build_guide_prompt` (ver `guides.py`); si el implementador ve
que han cambiado, ajusta la aserción al texto real del prompt (la intención: sin
sección de archivo completo / sin sección de perfil).

Ejecutar: `pytest tests/test_guides_api.py -v` → **ROJO** (la ruta no existe: todo 404
«Not Found»).

### Paso 2 — Implementar en `backend/app/main.py`

1. Imports: añadir `from app.agents.guides import find_file_content, one_guide` y
   `from app.agents.profile import Profile`.
2. Helper (junto a los otros helpers, p. ej. cerca de `build_llm`):

```python
def _profile_from_dict(data) -> Profile | None:
    """Reconstruye el Profile del dict que manda el front (shape de to_dict del
    evento profile:done); None si no es dict (el prompt de guía funciona sin perfil)."""
    if not isinstance(data, dict):
        return None
    try:
        return Profile(
            name=str(data.get("name", "")),
            language=str(data.get("language", "")),
            frameworks=list(data.get("frameworks") or []),
            entry_points=list(data.get("entry_points") or []),
            description=str(data.get("description", "")),
            notes=str(data.get("notes", "")),
        )
    except (TypeError, ValueError):
        return None
```

3. Endpoint (colócalo tras el bloque de endpoints de análisis, antes de reports):

```python
class GuideBody(BaseModel):
    projectId: str
    finding: dict
    profile: dict | None = None


@app.post("/api/guides")
async def generate_guide(body: GuideBody):
    """Guía de explotación bajo demanda de UN hallazgo (Fase 2d.1): 1 llamada LLM."""
    settings = load_settings()
    got = await asyncio.to_thread(
        lambda: local_analyze(body.projectId)
        or git_analyze(body.projectId)
        or get_project(settings.samples_dir, body.projectId))
    if got is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    project, scan = got
    llm = build_llm()
    try:
        guide = await one_guide(llm, body.finding,
                                find_file_content(scan, body.finding),
                                _profile_from_dict(body.profile), project.name)
    finally:
        await llm.close()
    if guide is None:
        raise HTTPException(status_code=502, detail="No se pudo generar la guía")
    return {"guide": guide}
```

### Paso 3 — Verde

`pytest tests/test_guides_api.py -v` → 5 pass.

### Paso 4 — Suite completa

`pytest -q` (workdir `backend/`) → 143 pass (138 + 5).

### Paso 5 — Commit

```
git add backend/app/main.py backend/tests/test_guides_api.py
git commit -m "feat(backend): endpoint POST /api/guides (guia bajo demanda)"
```

---

## Task 5 — `full-pdf` con `projectId`: genera las guías faltantes al exportar

Archivos:
- Modificar: `backend/app/main.py` (`ReportPdfBody`, endpoint `full_pdf`)
- Modificar: `backend/tests/test_pdf_report.py`

**Consume:** `run_guides` (Task 2, rama `run=None`), `_profile_from_dict` (Task 4),
`build_llm`, la cadena de resolución local→git→samples.

**Produce:** `ReportPdfBody.projectId: str | None = None` (aditivo; clientes
antiguos siguen funcionando). `full_pdf` pasa a `async def`: si hay `projectId` →
resolver el proyecto en `to_thread` (404 si no se resuelve) → si algún finding no
lleva `guide` (o la lleva vacía), generarlas con `run_guides(..., run=None,
concurrency=settings.llm_concurrency)` → build del PDF en `to_thread` (comportamiento
existente). Sin `projectId`: cero cambios respecto a hoy.

### Paso 1 — Rojo: tests nuevos en `backend/tests/test_pdf_report.py`

El fichero ya tiene `TestClient`, `app`, `_b()` (helper de bytes reportlab) y el
helper `_finding(fv, line, **kw)` (~línea 71; `file` por defecto `"a.js"`, acepta
`guide=` entre los kwargs). Añadir al inicio (tras los imports existentes):

```python
import pytest

from app.llm import ChatResult


class FakeGuidePDF:
    """Guía canned para los tests de full-pdf con projectId (Fase 2d.1)."""

    def __init__(self):
        self.calls = 0

    async def chat(self, system, user, max_tokens=8000, on_progress=None):
        self.calls += 1
        return ChatResult(content="## RESUMEN\nguía pdf", prompt_tokens=10,
                          completion_tokens=7, elapsed_s=0.1)

    async def close(self):
        pass


@pytest.fixture
def samples_dir(tmp_path):
    demo = tmp_path / "miniapp"
    demo.mkdir()
    (demo / "app.js").write_text("var sql = 'x';\n", encoding="utf-8")
    return tmp_path
```

Añadir al final del fichero (verbatim):

```python
def test_full_pdf_con_projectId_genera_guias_faltantes(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuidePDF()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    fs = [_finding("A03", 1, file="app.js")]
    r = client.post("/api/reports/full-pdf", json={
        "projectName": "P", "profile": {},
        "meta": {"files": 1, "lines": 1, "durationMin": 1},
        "findings": fs, "projectId": "miniapp"})
    assert r.status_code == 200
    assert fake.calls == 1
    assert _b("GUÍA DE EXPLOTACIÓN:") in r.content
    assert fs[0]["guide"] == "## RESUMEN\nguía pdf"


def test_full_pdf_projectId_inexistente_404(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    client = TestClient(app)
    r = client.post("/api/reports/full-pdf", json={
        "projectName": "P", "profile": {}, "meta": {},
        "findings": [_finding("A03", 1)], "projectId": "no-existe"})
    assert r.status_code == 404


def test_full_pdf_sin_projectId_no_llm(monkeypatch):
    """RF5: sin projectId no se resuelve proyecto ni se genera nada."""
    def _boom():
        raise AssertionError("build_llm no debe llamarse sin projectId")
    monkeypatch.setattr("app.main.build_llm", _boom)
    client = TestClient(app)
    r = client.post("/api/reports/full-pdf", json={
        "projectName": "P", "profile": {}, "meta": {},
        "findings": [_finding("A03", 1)]})
    assert r.status_code == 200
    assert _b("GUÍA DE EXPLOTACIÓN:") not in r.content


def test_full_pdf_guide_vacia_se_genera(monkeypatch, samples_dir):
    """RF3: guide == "" se trata como faltante y se genera."""
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    fake = FakeGuidePDF()
    monkeypatch.setattr("app.main.build_llm", lambda: fake)
    client = TestClient(app)
    r = client.post("/api/reports/full-pdf", json={
        "projectName": "P", "profile": {}, "meta": {},
        "findings": [dict(_finding("A03", 1, file="app.js"), guide="")],
        "projectId": "miniapp"})
    assert r.status_code == 200
    assert fake.calls == 1
    assert _b("GUÍA DE EXPLOTACIÓN:") in r.content


def test_full_pdf_todas_con_guide_no_llm(monkeypatch, samples_dir):
    """RF4: projectId + todos los findings ya llevan guía -> se resuelve el proyecto
    pero no se llama al LLM."""
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))

    def _boom():
        raise AssertionError("build_llm no debe llamarse: todos los findings tienen guía")
    monkeypatch.setattr("app.main.build_llm", _boom)
    client = TestClient(app)
    r = client.post("/api/reports/full-pdf", json={
        "projectName": "P", "profile": {}, "meta": {},
        "findings": [dict(_finding("A03", 1, file="app.js"), guide="## RESUMEN\nguía previa")],
        "projectId": "miniapp"})
    assert r.status_code == 200
    assert _b("GUÍA DE EXPLOTACIÓN:") in r.content
```

Ejecutar: `pytest tests/test_pdf_report.py -v` → **ROJO**: `genera_guias_faltantes`
falla (el endpoint ignora `projectId` → sin bloque de guía), `projectId_inexistente_404`
falla (200 en vez de 404), `guide_vacia` falla; `sin_projectId` y `todas_con_guide`
pasan ya (comportamiento existente). El test existente `test_full_pdf_endpoint`
sigue pasando (no manda `projectId`).

### Paso 2 — Implementar en `backend/app/main.py`

1. Import: ampliar el de la Task 4 → `from app.agents.guides import find_file_content, one_guide, run_guides`.
2. `ReportPdfBody`: añadir `projectId: str | None = None`.
3. Sustituir el endpoint `full_pdf` (líneas ~258) por:

```python
@app.post("/api/reports/full-pdf")
async def full_pdf(body: ReportPdfBody):
    """Informe PDF completo: portada + perfil + hallazgos por categoría.

    Fase 2d.1: con `projectId` y hallazgos sin `guide`, se generan las guías
    faltantes antes de dibujar (pool `llm_concurrency`). 404 si el proyecto ya
    no se resuelve (el front reintenta sin `projectId`)."""
    settings = load_settings()
    if body.projectId:
        got = await asyncio.to_thread(
            lambda: local_analyze(body.projectId)
            or git_analyze(body.projectId)
            or get_project(settings.samples_dir, body.projectId))
        if got is None:
            raise HTTPException(status_code=404, detail="Proyecto no encontrado")
        project, scan = got
        if any(not f.get("guide") for f in body.findings):
            llm = build_llm()
            try:
                await run_guides(llm, body.findings, scan,
                                 _profile_from_dict(body.profile),
                                 project.name, None, settings.llm_concurrency)
            finally:
                await llm.close()
    slug = re.sub(r"[^a-z0-9]+", "-", body.projectName.lower()).strip("-") or "proyecto"
    pdf = await asyncio.to_thread(build_report_pdf, body.projectName, body.profile,
                                  body.meta, body.findings)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="informe-{slug}.pdf"'},
    )
```

(Mantién el `slug`/filename exactamente como los calcula el endpoint actual; la
intención es solo añadir la rama de guías y el `to_thread` del build. `run_guides`
por posicionales: `(llm, findings, scan, profile, project_name, run, concurrency)`.)

### Paso 3 — Verde

`pytest tests/test_pdf_report.py -v` → todo pasa (37 existentes + 5 nuevos).

### Paso 4 — Suite completa

`pytest -q` (workdir `backend/`) → 148 pass.

### Paso 5 — Commit

```
git add backend/app/main.py backend/tests/test_pdf_report.py
git commit -m "feat(backend): full-pdf genera guias faltantes al exportar (projectId)"
```

---

## Task 6 — Front: botón bajo demanda + modal (carga/error/REINTENTAR) + export con `projectId`

Archivos:
- Modificar: `src/types.ts` (comentario de `Finding.guide`)
- Modificar: `src/state/useAnalysis.ts` (nuevo `updateFindingGuide`)
- Modificar: `src/App.tsx` (props nuevas a `SummaryScreen`)
- Modificar: `src/components/summary/SummaryScreen.tsx` (props + export)
- Modificar: `src/components/summary/FindingCard.tsx` (botón, fetch, estados)
- Modificar: `src/components/summary/ExploitGuideModal.tsx` (vistas carga/error/reintento)
- Modificar: `src/components/summary/SummaryScreen.test.tsx`

**Produce (interfaces y copy exactos):**
- `useAnalysis`: `updateFindingGuide: (id: string, guide: string) => void` (map de
  findings, pone `guide` en el matching).
- `SummaryScreen` props nuevas: `canGenerateGuide: boolean`, `projectId?: string`,
  `onGuideReady: (id: string, guide: string) => void`.
- `FindingCard` props nuevas: `canGenerateGuide: boolean`, `projectId?: string`,
  `profile?: Record<string, unknown> | null`, `onGuideReady: (id: string, guide: string) => void`.
- `ExploitGuideModal` props nuevas (opcionales): `loading?: boolean`,
  `error?: string | null`, `onRetry?: () => void`.
- Botón: se renderiza si `finding.guide || canGenerateGuide` (mock ⇒ nunca).
- Copy exactos: carga `GENERANDO GUÍA DE EXPLOTACIÓN…` + `puede tardar 15–30 s`;
  error `No se pudo generar la guía (¿backend caído?)`; botón `REINTENTAR`;
  nota de export degradado `Informe exportado sin las guías pendientes (el proyecto ya no está disponible)`.
- testids nuevos: `guide-loading`, `guide-error`, `guide-retry`
  (existentes: `exploit-guide-btn`, `guide-close`).
- `types.ts`: el comentario de `Finding.guide` pasa a
  `/** Fase 2d.1: guía de explotación bajo demanda (al pinchar o al exportar; solo runs reales — el mock no lleva guía). */`

### Paso 1 — Rojo: tests en `SummaryScreen.test.tsx`

1. **Actualizar el helper `renderScreen`** (líneas ~81–104) con el 5º parámetro:

```tsx
const renderScreen = (
  analysis: AnalysisProgress = base,
  selectedFindingIds: string[] = [],
  handlers: {
    onToggleFinding?: (id: string) => void
    onSetAllFindings?: (ids: string[]) => void
    onGenerateScope?: () => void
    onNewAudit?: () => void
    onBack?: () => void
  } = {},
  projectName?: string,
  guideProps: {
    canGenerateGuide?: boolean
    projectId?: string
    onGuideReady?: (id: string, guide: string) => void
  } = {},
) =>
  render(
    <SummaryScreen
      analysis={analysis}
      selectedFindingIds={selectedFindingIds}
      onToggleFinding={handlers.onToggleFinding ?? (() => {})}
      onSetAllFindings={handlers.onSetAllFindings ?? (() => {})}
      onGenerateScope={handlers.onGenerateScope ?? (() => {})}
      onNewAudit={handlers.onNewAudit ?? (() => {})}
      onBack={handlers.onBack ?? (() => {})}
      projectName={projectName}
      canGenerateGuide={guideProps.canGenerateGuide ?? false}
      projectId={guideProps.projectId}
      onGuideReady={guideProps.onGuideReady ?? (() => {})}
    />,
  )
```

(Los callers existentes, con 4 args, siguen funcionando.)

2. **Añadir al final del fichero** (sección nueva «Fase 2d.1»), verbatim:

```tsx
// --- Fase 2d.1: guía bajo demanda (al pinchar) + export con projectId ---

test('live: botón CÓMO EXPLOTAR también en hallazgos sin guía (se genera al pinchar)', () => {
  renderScreen(base, [], {}, 'P', { canGenerateGuide: true })
  // A01-1 (crítico, expandido por defecto) no lleva guía -> aun así hay botón
  expect(screen.getAllByTestId('exploit-guide-btn')).toHaveLength(1)
})

test('pinchar sin guía: POST /api/guides, estado de carga y luego contenido', async () => {
  const guide = '## RESUMEN\nguía generada al vuelo\n## PAYLOAD DE EJEMPLO\n```\nGET /api/users/1024\n```'
  const fetchMock = vi.fn(async (url: string) =>
    url === '/api/guides'
      ? new Response(JSON.stringify({ guide }), { status: 200 })
      : new Response(null, { status: 404 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const onGuideReady = vi.fn()
  renderScreen(base, [], {}, 'P', { canGenerateGuide: true, projectId: 'miniapp', onGuideReady })

  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  expect(screen.getByTestId('guide-loading')).toBeInTheDocument()

  await act(async () => {})
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  expect(body.projectId).toBe('miniapp')
  expect(body.finding).toEqual(base.findings[0])
  expect(onGuideReady).toHaveBeenCalledWith('A01-1', guide)
  expect(screen.getByText('RESUMEN')).toBeInTheDocument()
  expect(screen.getByTestId('guide-close')).toBeInTheDocument()
})

test('pinchar sin guía y fallo: estado error + REINTENTAR regenera', async () => {
  const guide = '## RESUMEN\nguía tras reintento'
  let calls = 0
  const fetchMock = vi.fn(async () => {
    calls += 1
    return calls === 1
      ? new Response(null, { status: 502 })
      : new Response(JSON.stringify({ guide }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  renderScreen(base, [], {}, 'P', { canGenerateGuide: true, projectId: 'miniapp' })

  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  await act(async () => {})
  expect(screen.getByTestId('guide-error')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('guide-retry'))
  await act(async () => {})
  expect(screen.getByText('RESUMEN')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('export live: el body de full-pdf lleva projectId', async () => {
  const fetchMock = vi.fn(async () => new Response('%PDF-1.4 fake', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  renderScreen(base, [], {}, 'Mi Proyecto', { projectId: 'miniapp' })
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: /exportar resultados a pdf/i }))
  await act(async () => {})
  vi.useRealTimers()
  const [, init] = fetchMock.mock.calls[0]
  expect(JSON.parse(init.body as string).projectId).toBe('miniapp')
})

test('export: 404 con projectId -> reintento sin projectId + nota (proyecto no resoluble)', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init ? JSON.parse(init.body as string) : {}
    return body.projectId
      ? new Response(null, { status: 404 })
      : new Response('%PDF-1.4 fake', { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  renderScreen(base, [], {}, 'P', { projectId: 'miniapp' })
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: /exportar resultados a pdf/i }))
  await act(async () => {})
  vi.useRealTimers()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const first = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  const second = JSON.parse(fetchMock.mock.calls[1][1].body as string)
  expect(first.projectId).toBe('miniapp')
  expect(second.projectId).toBeUndefined()
  expect(URL.createObjectURL).toHaveBeenCalled()
  expect(screen.getByText('Informe exportado sin las guías pendientes (el proyecto ya no está disponible)'))
    .toBeInTheDocument()
})
```

Nota: el test «mock: sin botón» YA existe (fixture `base` sin `canGenerateGuide` →
0 botones) y sigue valiendo (RF5); la nota del 404 se pinta en la misma zona de
`reportError` que el test de error 500 existente.

Ejecutar: `npx vitest run src/components/summary/SummaryScreen.test.tsx` → **ROJO**
(los 5 nuevos fallan: prop `canGenerateGuide` inexistente / sin fetch de guías /
sin `projectId` en el body).

### Paso 2 — Implementar (orden: types → hook → App → SummaryScreen → Card → Modal)

1. **`src/types.ts`**: actualizar el comentario de `Finding.guide` (texto exacto
   en «Produce»).
2. **`src/state/useAnalysis.ts`**: añadir a la interfaz `UseAnalysis`
   `updateFindingGuide: (id: string, guide: string) => void` y al hook:

```ts
  const updateFindingGuide = useCallback((id: string, guide: string) => {
    setAnalysis(prev => ({
      ...prev,
      findings: prev.findings.map(f => (f.id === id ? { ...f, guide } : f)),
    }))
  }, [])
```
   + añadirlo al objeto que devuelve el hook.
3. **`src/App.tsx`** (JSX de `SummaryScreen`, ~línea 154): añadir las 3 props:

```tsx
            canGenerateGuide={inLive}
            projectId={inLive ? flow.source?.value : undefined}
            onGuideReady={flow.updateFindingGuide}
```

4. **`src/components/summary/SummaryScreen.tsx`**:
   - Firma: añadir `canGenerateGuide: boolean`, `projectId?: string`,
     `onGuideReady: (id: string, guide: string) => void`.
   - Llamada a `FindingCard` (~línea 218): añadir
     `canGenerateGuide={canGenerateGuide} projectId={projectId}
     profile={analysis.profile ?? null} onGuideReady={onGuideReady}`.
   - **Sustituir** `downloadReport` (~líneas 90–119) por:

```tsx
  const buildReportPayload = (withProject: boolean) =>
    JSON.stringify({
      projectName: projectName ?? 'Proyecto',
      profile: analysis.profile ?? {},
      meta: analysis.meta ?? {},
      findings,
      ...(withProject && projectId ? { projectId } : {}),
    })

  const saveReportBlob = async (res: Response) => {
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `informe-${(projectName ?? 'proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto'}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadReport = async () => {
    setReportBusy(true)
    setReportError(null)
    try {
      let res = await fetch('/api/reports/full-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildReportPayload(true),
      })
      if (res.status === 404 && projectId) {
        // El proyecto ya no es resoluble en el backend (p. ej. reinició): se
        // exporta sin las guías faltantes y se avisa (diseño 2d.1).
        res = await fetch('/api/reports/full-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: buildReportPayload(false),
        })
        if (!res.ok) throw new Error('bad status')
        await saveReportBlob(res)
        setReportError('Informe exportado sin las guías pendientes (el proyecto ya no está disponible)')
        return
      }
      if (!res.ok) throw new Error('bad status')
      await saveReportBlob(res)
    } catch {
      setReportError('No se pudo generar el informe (¿backend caído?)')
    } finally {
      setReportBusy(false)
    }
  }
```

5. **`src/components/summary/FindingCard.tsx`**:
   - Props nuevas (ver «Produce»).
   - Estado y lógica (sustituye el `guideOpen` actual):

```tsx
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideLoading, setGuideLoading] = useState(false)
  const [guideError, setGuideError] = useState<string | null>(null)
  const [fetchedGuide, setFetchedGuide] = useState<string | null>(null)

  // La guía efectiva: la del estado compartido (tras onGuideReady) o la local
  // (para que el modal la muestre en el mismo tick, también en tests).
  const effectiveGuide = finding.guide ?? fetchedGuide

  const fetchGuide = async () => {
    setGuideLoading(true)
    setGuideError(null)
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, finding, profile: profile ?? undefined }),
      })
      if (!res.ok) throw new Error('bad status')
      const data = (await res.json()) as { guide: string }
      setFetchedGuide(data.guide)
      onGuideReady(finding.id, data.guide)
    } catch {
      setGuideError('No se pudo generar la guía (¿backend caído?)')
    } finally {
      setGuideLoading(false)
    }
  }

  const openGuide = () => {
    setGuideOpen(true)
    if (!effectiveGuide) void fetchGuide()
  }
```

   - Botón (sustituye la condición actual `finding.guide &&`):

```tsx
          {/* Fase 2d.1: con guía real (vista) o modo live (se genera al pinchar);
              en mock no hay botón (ruling «siempre modo real»). */}
          {(finding.guide || canGenerateGuide) && (
            <NeonButton
              variant="outline"
              data-testid="exploit-guide-btn"
              className="self-start"
              onClick={openGuide}
            >
              CÓMO EXPLOTAR ▸
            </NeonButton>
          )}
          {/* Merged: si el estado compartido aún no refleja la guía (mismo tick,
              o tests con props estáticas), el modal muestra la local. */}
          {guideOpen && (
            <ExploitGuideModal
              finding={finding.guide ? finding : { ...finding, guide: fetchedGuide ?? undefined }}
              vuln={vuln}
              loading={guideLoading}
              error={guideError}
              onRetry={guideLoading ? undefined : fetchGuide}
              onClose={() => setGuideOpen(false)}
            />
          )}
```

   (Mantién el estilo/variante del botón existente; solo cambia la condición, el
   `onClick` y las props del modal. Ajusta `className`/`variant` a lo que el botón
   lleva hoy.)
6. **`src/components/summary/ExploitGuideModal.tsx`**: props `loading?`, `error?`,
   `onRetry?`; el cuerpo (donde hoy van los bloques `parseGuideLines`) pasa a:

```tsx
          {loading ? (
            <div className="flex flex-col gap-1.5 py-4">
              <p data-testid="guide-loading" className="font-mono text-xs tracking-widest text-neon-cyan">
                GENERANDO GUÍA DE EXPLOTACIÓN…
              </p>
              <p className="font-mono text-xs text-ink-dim">puede tardar 15–30 s</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-start gap-2.5 py-4">
              <p data-testid="guide-error" className="font-mono text-xs text-sev-critical">{error}</p>
              {onRetry && (
                <NeonButton variant="outline" data-testid="guide-retry" onClick={onRetry}>
                  REINTENTAR
                </NeonButton>
              )}
            </div>
          ) : (
            /* los bloques parseGuideLines(finding.guide ?? '') de hoy, sin cambios */
          )}
```

   (Encabezado del modal — severidad, id, título, file:line — y footer CERRAR sin
   cambios. Los clases usan tokens existentes de `tailwind.config`.)

### Paso 3 — Verde (tests de la task)

`npx vitest run src/components/summary/SummaryScreen.test.tsx` → todo pasa
(incluidos los tests de la 2d que ya existían: botón solo con guía en mock, modal
con guía, export sin projectId, etc.).

### Paso 4 — Suite completa + build

`npx vitest run` → 148 pass (143 + 5). `npm run build` → limpio (incluye `tsc --noEmit`).

### Paso 5 — Commit

```
git add src/types.ts src/state/useAnalysis.ts src/App.tsx src/components/summary/SummaryScreen.tsx src/components/summary/FindingCard.tsx src/components/summary/ExploitGuideModal.tsx src/components/summary/SummaryScreen.test.tsx
git commit -m "feat(front): guia bajo demanda al pinchar + export con guias faltantes"
```

---

## Task 7 — E2E real de cierre (run híbrido + PDF verificado) + docs

Archivos:
- Crear (gitignored): `.tmp/e2e-guias-demanda.py`
- Modificar: `README.md`, `PROGRESS.md`

### Paso 1 — Servidores arriba

Backend :8000 (workdir `backend/`: `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
en background) y front :5173 (`npm run dev` en background). Comprueba `GET /api/health`
o `/api/projects`.

### Paso 2 — Script E2E (verbatim)

Crear `.tmp/e2e-guias-demanda.py` y ejecutar desde la raíz:
`.\backend\.venv\Scripts\python.exe .tmp\e2e-guias-demanda.py`

```python
"""E2E Fase 2d.1: analisis sin guias + guia al pinchar + PDF con guias faltantes."""
import json
import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

B = "http://localhost:8000"
c = httpx.Client(timeout=900)


def esc(s: str) -> bytes:
    """Serializacion de reportlab 5.1.0 (bytes >= 0x7F como escape octal;
    replica al helper _b() de test_pdf_report.py)."""
    out = b""
    for b_ in s.encode("cp1252"):
        out += b"\\%03o" % b_ if b_ < 32 or b_ >= 127 else bytes([b_])
    return out


LABEL = esc("GUÍA DE EXPLOTACIÓN:")
RESUMEN = esc("RESUMEN")

projs = c.get(f"{B}/api/projects").json()
proj = [p for p in projs if p["name"] == "DEMO-Injection"][0]

r = c.post(f"{B}/api/analyze", json={"projectId": proj["id"],
                                     "vulnIds": [f"A0{i:02d}" for i in range(1, 11)]})
assert r.status_code == 202, r.text
run_id = r.json()["runId"]
events = []
with c.stream("GET", f"{B}/api/runs/{run_id}/events") as resp:
    for line in resp.iter_lines():
        if line.startswith("data:"):
            ev = json.loads(line[5:])
            events.append(ev)
            if ev.get("type") in ("run:done", "run:cancelled", "run:error"):
                break

with open(".tmp/e2e-guias-demanda-run.json", "w", encoding="utf-8") as f:
    json.dump(events, f, ensure_ascii=False, indent=1)

done = [e for e in events if e["type"] == "run:done"]
assert done, f"sin run:done: {events[-1] if events else 'sin eventos'}"
findings = done[0]["findings"]
profile_ev = [e for e in events if e.get("type") == "profile:done"]
profile = profile_ev[0].get("profile", {}) if profile_ev else {}
meta = done[0]["meta"]

# G1: el analisis ya no genera guias (sin oleada 3)
assert not any("Guías de explotación" in e.get("message", "") for e in events), \
    "oleada 3 sigue emitiendo"
assert all("guide" not in f for f in findings), "findings del run no deberian llevar guía"
assert findings, "sin hallazgos"
print("run ok:", len(findings), "hallazgos | sin oleada 3 | totalTokens =", meta["totalTokens"])

# G2: guia al pinchar (1 llamada)
target = ([f for f in findings if f.get("vulnId") == "A03"] or [findings[0]])[0]
r = c.post(f"{B}/api/guides", json={"projectId": proj["id"], "finding": target,
                                    "profile": profile})
assert r.status_code == 200, r.text
guide = r.json()["guide"]
assert guide.startswith("## RESUMEN"), guide[:80]
target["guide"] = guide
print("guia al pinchar ok:", target["id"], "|", len(guide), "chars")

# G3: full-pdf con projectId -> genera las faltantes
r = c.post(f"{B}/api/reports/full-pdf", json={
    "projectName": "DEMO-Injection", "profile": profile, "meta": meta,
    "findings": findings, "projectId": proj["id"]})
assert r.status_code == 200, r.text
open(".tmp/informe-e2e-2d1.pdf", "wb").write(r.content)
assert r.content.startswith(b"%PDF-")
assert r.content.count(LABEL) == len(findings), \
    f"bloques de guia: {r.content.count(LABEL)} != {len(findings)}"
assert r.content.count(RESUMEN) >= len(findings)
print("informe ok:", len(r.content), "B | bloques de guia =", r.content.count(LABEL))

# Alcance: sin bloque de guia (ruling 2d)
r = c.post(f"{B}/api/reports/scope-pdf", json={"text": "1. Prueba de alcance 2d.1",
                                               "projectName": "DEMO-Injection"})
assert r.status_code == 200
open(".tmp/alcance-e2e-2d1.pdf", "wb").write(r.content)
assert r.content.startswith(b"%PDF-")
assert LABEL not in r.content
print("alcance ok:", len(r.content), "B | sin bloque de guia")
print("E2E 2d.1 OK")
```

Nota: `profile` es el payload del evento `profile:done` (el mismo que el front
guarda en `analysis.profile`); si el campo del evento se llama distinto, comprueba
`src/services/liveAnalysisService.ts` y ajusta el nombre.

Verde = `E2E 2d.1 OK`. Si falla: NO adivines; los eventos completos quedan en
`.tmp/e2e-guias-demanda-run.json`.

### Paso 3 — Docs (README + PROGRESS)

`README.md` (sustituciones exactas):
- Línea 3 (motor): `un motor de 12 agentes LLM (1 perfilador + 10 especialistas, uno por categoría OWASP Top 10, + 1 de guías de explotación bajo demanda)`.
- Línea 5 (Estado): `**Estado: Fase 2d.1 completa (tag v0.4.1)** — motor de análisis real + modo live en el front + proyectos propios (carpeta local y repo git) + streaming LLM + informe PDF completo + PDF claro para cliente + guía de explotación por hallazgo bajo demanda (al pinchar «CÓMO EXPLOTAR» o al exportar el informe).`
- Línea 17 (cómo funciona): `ejecuta un pipeline de 2 oleadas — **perfilador** (lenguaje, frameworks, entry points) → **10 agentes de vulnerabilidad en paralelo** — y, bajo demanda, una **guía de explotación por hallazgo** (al pinchar «CÓMO EXPLOTAR» o al exportar el informe); emite por SSE: …` (mantén el resto de la frase).
- Línea 18 (agentes): la línea de la guía de explotación pasa a `+ 1 de **guías de explotación** (bajo demanda: una por hallazgo, al pinchar o al exportar)`.
- Sección Fases: tras la línea de Fase 2d añadir
  `- **Fase 2d.1** (completa, \`v0.4.1\`): guías de explotación bajo demanda — se generan al pinchar «CÓMO EXPLOTAR ▸» o al exportar el informe PDF (el análisis vuelve a 2 oleadas) + samples corregidos (SQLi en DEMO-Injection, secretos en admin.js de DEMO-Broken-Access-Control).`

`PROGRESS.md` (lo escribe el coordinador en el commit de cierre; el implementador
DEJA NOTADO en su report: qué QA queda pendiente para el usuario):
- «Estado actual»: la 2d.1 COMPLETA (7/7 tasks) con suites finales y tag previsto.
- Sección «Progreso Fase 2d.1» (las 7 checkboxes, todas `[x]`).
- «Siguiente» → Fase 3 (Docker) + QA pendiente del usuario: modal de carga/reintento
  con run live real, PDF exportado con guías, y los 3 samples corregidos.

### Paso 4 — Commit (docs + E2E; NO incluye checkboxes de PROGRESS/plan)

```
git add README.md
git commit -m "chore: E2E fase 2d.1 (guias bajo demanda + samples corregidos) y docs"
```

El coordinador, tras la final review: push único + tag `v0.4.1` + bookkeeping
(PROGRESS + checkboxes del plan) en su commit de cierre.

---

## Progreso (Fase 2d.1)

- [ ] Task 1 — samples corregidos (SQLi en DEMO-Injection, secretos en admin.js) + runs reales de verificación
- [ ] Task 2 — `one_guide` + `run_guides(run=None)` (guides.py)
- [ ] Task 3 — revert de la oleada 3 del pipeline (R3-1 conservado)
- [ ] Task 4 — `POST /api/guides` (guía bajo demanda al pinchar)
- [ ] Task 5 — `full-pdf` con `projectId` (guías faltantes al exportar)
- [ ] Task 6 — front: botón bajo demanda + modal (carga/error/REINTENTAR) + export con `projectId`
- [ ] Task 7 — E2E real de cierre + docs + cierre (push + tag `v0.4.1` del coordinador)

