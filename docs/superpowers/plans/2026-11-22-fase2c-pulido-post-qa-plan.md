# Fase 2c — Pulido post-QA (eliminar proyectos, marcar todos, orden del resumen, PDF de alcance): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el ciclo de vida del proyecto (eliminar proyectos en modo live), y ajustar el resumen y el PDF de alcance a cómo trabaja el usuario: marcar/desmarcar todos los hallazgos, orden alternativo criticidad|tipo, y `alcance.pdf` con apartados estilizados en cajas (título centrado, chips de severidad a color, línea de estimación sin saltos raros).

**Architecture:** Backend: `DELETE /api/projects/{project_id}` (local → solo desregistrar; git → borrar el clon de `workspace/repos/<slug>-<hash6>` + desregistrar; sample → 409; run en curso → 409) con helpers `remove_local`/`remove_git` en los módulos de dominio; `build_scope_pdf` se reescribe con un parser del texto plano (cabecera + cards numeradas + planos) y layout de cajas (reportlab, mismo tema claro que el PDF de reporte, que queda intacto). Front: `SourceScreen` (rama live) convierte las filas en `div role="radio"` con botón «🗑 ELIMINAR» (confirm + DELETE + refresh); `SummaryScreen` gana control «ORDEN: CRITICIDAD | TIPO» (sort estable local) y botón «MARCAR TODOS / DESMARCAR TODOS» (nuevo `setAllFindingIds` en `useAnalysis`); `BrowseModal` muestra el `detail` del backend y guarda anti-race de navegaciones (diferidos de 2b.1). Cierre: E2E real + final review de rama desde `v0.3.1` + tag `v0.3.2`.

**Tech Stack:** Front: Vite 5 + React 18 + TS strict + Tailwind 3.4 + Vitest/jsdom (sin deps nuevas). Backend: Python 3.12 (venv `backend/.venv`), FastAPI, reportlab, pytest. Windows + PowerShell 5.1. LLM real solo en T6 (gate del miniapp, ya en la suite).

**Spec:** `docs/superpowers/specs/2026-11-22-fase2c-pulido-post-qa-design.md` (leer antes de ejecutar; scope cerrado por el usuario 2026-11-22 — ver PROGRESS.md «Siguiente» y registro de decisiones).

## Global Constraints

- Windows + PowerShell 5.1: separador `;` (nunca `&&`). Python: siempre `backend\.venv\Scripts\python.exe` (sin `Activate.ps1`). `pytest` con working dir `backend/`. Node v26.13.1.
- API key: solo en `backend/.env` (gitignored). Nunca en código, front, git ni reports.
- Copy de UI en español. **Sin nuevas librerías de front ni backend** (cero dependencias nuevas en toda la fase). Sin router ni librería de estado.
- Paleta de la app (fondo oscuro) invariante: bg `#06060b`, panel `#0a0a14`, cian `#00e5ff`, magenta `#ff2d95`; severidades UI: crítico `#ff2d95`, alto `#ff9f43`, medio `#ffd23f`, bajo `#00e5ff`; texto `#f4f4f8`/`#8b8b98`/`#5a5a68` (= clases `ink`/`ink-dim`/`ink-faint`).
- Paleta PDF (tema claro, heredada de G3 2b.1): `_TXT #1f2937`, `_TXT_SEC #6b7280`, `_ACCENT #0891b2`, severidades `critical #be185d`, `high #c2410c`, `medium #a16207`, `low #0e7490`, cajas `_BOX_BG #f3f4f6` / `_BOX_BORDER #e5e7eb`, blanco `#ffffff`.
- Contrato SSE inmutable: `data: {json}\n\n`, `{"type","t",...}`; terminales `run:done`/`run:error`/`run:cancelled`. Shape de `findings` inmutable.
- TDD estricto: rojo→verde **solo del test de la task**; al final de la task, UNA vez: backend → `pytest -q` (workdir `backend/`); front → `npx vitest run` + `npm run build`.
- Commits convencionales, **uno por task** (fix rounds de review amendados). **El implementer no pusha** (push único del coordinador tras review). Subagentes con `aitana/qwen3.8-fp8`.
- I/O de disco nunca en el event loop: los endpoints que tocan disco son `def` (→ threadpool).
- PDF: fuentes estándar reportlab = WinAnsi; `_winansi()` (cp1252 → `?`) en TODO texto dibujado. «·» (U+00B7) SÍ está en WinAnsi; «—» (U+2014) también; «»●» (U+25CF) NO. reportlab `escapePDF` escribe los bytes ≥0x7F de las cadenas del stream como escape octal (0xE1 «á» → `\341`; 0xB7 «·» → `\267`).
- `VULN_NAMES` de `pdf_report.py` sigue idéntico byte a byte a `src/data/owasp.ts` (invariante). `build_report_pdf` queda **intacto** (sus tests pasan sin cambios).
- `SEVERITY_ES = {"critical": "CRÍTICO", "high": "ALTO", "medium": "MEDIO", "low": "BAJO"}` (en `app/pipeline.py`).
- El DELETE git borra **solo** el clon de `workspace/repos/` (gitignored); nunca archivos del proyecto original del usuario. El path borrado siempre proviene del registro `GIT`, nunca del input del usuario.

## Review Focus

1. **Eliminar un proyecto local** → desaparece de la lista pero **los archivos del usuario siguen íntegros en disco** (nunca `rmtree` fuera de `workspace/repos/`). → tests T1 (afirmación `(code / "a.js").exists()`) + E2E T6.
2. **Eliminar con un run en curso** → 409 y el run continúa; tras cancelar (o terminar), el DELETE procede. → test T1 (`test_delete_while_running_409`).
3. **PDF de alcance largo (tipo DVWA, 30+ cards)** → cards que parten de página se ven **continuas** (fondo + barra de acento continúan en la página siguiente) y ninguna card empieza con el header huérfano a pie de página. → test T4 multipágina + E2E T6 (PDF real).
4. **Texto del alcance editado por el usuario** (cabecera borrada, severidad cambiada, párrafos libres) → el parser no crashea: se imprime plano lo que no encaja, y el título cae al parámetro `title`. → tests T4 (fallbacks).
5. **Navegaciones rápidas consecutivas en el BrowseModal** (clic en carpeta + breadcrumb) → la navegación más reciente gana; la respuesta obsoleta se descarta (guard por secuencia). → test T5 de race.

---

### Task 1: Backend — `DELETE /api/projects/{id}` (eliminar proyectos)

**Files:**
- Modify: `backend/app/local_projects.py` (helper `remove_local`), `backend/app/git_projects.py` (helper `remove_git`), `backend/app/main.py` (endpoint + import de `RunStatus` y los helpers)
- Test: `backend/tests/test_projects_delete.py` (nuevo)

**Interfaces:**
- Produces: `local_projects.remove_local(project_id: str) -> bool` (pop del registro `LOCAL`; sin I/O) y `git_projects.remove_git(project_id: str) -> bool` (pop del registro `GIT` + `shutil.rmtree(dest, ignore_errors=True)` del clon del workspace).
- Produces (endpoint): `DELETE /api/projects/{project_id}` → 200 `{"ok": true, "kind": "local" | "git"}` | 409 (run en curso | sample) | 404 (desconocido).
- T2 (front) consume este endpoint.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_projects_delete.py` (nuevo):

```python
"""DELETE /api/projects/{id}: local (solo desregistra), git (borra el clon), samples, run en curso."""
import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT
from app.local_projects import LOCAL
from app.main import RUNS, app


@pytest.fixture(autouse=True)
def clean_registries():
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()
    yield
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()


@pytest.fixture
def env_dirs(tmp_path, monkeypatch):
    samples = tmp_path / "samples"
    (samples / "miniapp").mkdir(parents=True)
    (samples / "miniapp" / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    monkeypatch.setenv("SAMPLES_DIR", str(samples))
    return tmp_path


def test_delete_local_project_desregistra_y_no_toca_archivos(env_dirs):
    code = env_dirs / "mi app"
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        pid = c.post("/api/projects/local", json={"path": str(code)}).json()["project"]["id"]
        r = c.delete(f"/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "kind": "local"}
        assert (code / "a.js").exists()  # los archivos del usuario siguen íntegros
        assert (code / "a.js").read_text(encoding="utf-8") == "const a = 1;\n"
        assert pid not in [p["id"] for p in c.get("/api/projects").json()]


def test_delete_git_project_borra_el_clon(env_dirs):
    clone = env_dirs / "workspace" / "repos" / "github.com-x-y-a1b2c3"
    clone.mkdir(parents=True)
    (clone / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    GIT["git-x-y-a1b2c3"] = clone
    with TestClient(app) as c:
        r = c.delete("/api/projects/git-x-y-a1b2c3")
        assert r.status_code == 200
        assert r.json() == {"ok": True, "kind": "git"}
        assert not clone.exists()  # el clon del workspace se borra entero
        assert "git-x-y-a1b2c3" not in [p["id"] for p in c.get("/api/projects").json()]


def test_delete_sample_409(env_dirs):
    with TestClient(app) as c:
        r = c.delete("/api/projects/miniapp")
        assert r.status_code == 409
        assert "ejemplo" in r.json()["detail"]


def test_delete_unknown_404(env_dirs):
    with TestClient(app) as c:
        assert c.delete("/api/projects/nope").status_code == 404


def test_delete_while_running_409(env_dirs):
    code = env_dirs / "miproy"
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        pid = c.post("/api/projects/local", json={"path": str(code)}).json()["project"]["id"]
        run = RUNS.start(pid, ["A01"])
        assert run is not None  # run RUNNING sobre este proyecto
        assert c.delete(f"/api/projects/{pid}").status_code == 409
        assert pid in LOCAL  # sigue registrado
        RUNS.active = None  # cleanup (el fixture autouse también limpia)
```

- [ ] **Step 2: Verificar el fallo**

Run: `backend\.venv\Scripts\python.exe -m pytest tests/test_projects_delete.py -q` (workdir `backend/`)
Expected: FAIL (405 Method Not Allowed / AttributeError — no existe el endpoint ni los helpers).

- [ ] **Step 3: Implementar**

1. `backend/app/local_projects.py` — añadir al final del módulo:

```python
def remove_local(project_id: str) -> bool:
    """Desregistra un proyecto local. NUNCA toca la carpeta del usuario."""
    return LOCAL.pop(project_id, None) is not None
```

2. `backend/app/git_projects.py` — añadir al final del módulo:

```python
def remove_git(project_id: str) -> bool:
    """Desregistra un proyecto git y borra su clon del workspace."""
    dest = GIT.pop(project_id, None)
    if dest is None:
        return False
    shutil.rmtree(dest, ignore_errors=True)
    return True
```

3. `backend/app/main.py`:
- Imports: añadir `remove_local` a la línea `from app.local_projects import ...`; añadir `remove_git` a la línea `from app.git_projects import ...`; añadir `RunStatus` a la línea `from app.runs import ...`.
- Endpoint (colocado tras `add_git_project`):

```python
def _is_sample(project_id: str) -> bool:
    """¿Es un proyecto de ejemplo dentro de samples/ (no eliminable)?"""
    if not project_id or project_id in {".", ".."}:
        return False
    samples = load_settings().samples_dir
    entry = samples / project_id
    if entry.resolve().parent != samples.resolve():
        return False
    return entry.is_dir()


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    """Elimina un proyecto propio: local → solo desregistra; git → borra el clon del
    workspace. Los proyectos de ejemplo no se eliminan (409).

    `def` a propósito: el rmtree del clon git es I/O de disco (threadpool).
    """
    active = RUNS.active
    if (
        active is not None
        and active.project_id == project_id
        and active.status in (RunStatus.RUNNING, RunStatus.CANCELLING)
    ):
        raise HTTPException(
            status_code=409,
            detail="Hay un análisis en curso para este proyecto; cancela antes de eliminarlo",
        )
    if remove_local(project_id):
        return {"ok": True, "kind": "local"}
    if remove_git(project_id):
        return {"ok": True, "kind": "git"}
    if _is_sample(project_id):
        raise HTTPException(status_code=409, detail="Los proyectos de ejemplo no se pueden eliminar")
    raise HTTPException(status_code=404, detail="Proyecto no encontrado")
```

- [ ] **Step 4: Verificar que pasa**

Run: `backend\.venv\Scripts\python.exe -m pytest tests/test_projects_delete.py -q`
Expected: PASS (los 5 tests del fichero).

- [ ] **Step 5: Comprobación final de la task (una vez)**

Run: `backend\.venv\Scripts\python.exe -m pytest -q` (workdir `backend/`)
Expected: suite completa verde (los tests existentes no se ven afectados: el endpoint es aditivo).

- [ ] **Step 6: Commit**

```
git add backend/app/local_projects.py backend/app/git_projects.py backend/app/main.py backend/tests/test_projects_delete.py
git commit -m "feat(backend): DELETE /api/projects/{id} (local: solo desregistra; git: borra el clon del workspace)"
```

---

### Task 2: Front — botón «🗑 ELIMINAR» en las filas live de SourceScreen

**Files:**
- Modify: `src/components/source/SourceScreen.tsx` (rama live: filas + estados + `deleteProject`)
- Test: `src/components/source/SourceScreen.test.tsx` (5 tests nuevos, sección «Task 1 (Fase 2c)»)

**Interfaces:**
- Consumes: `DELETE /api/projects/{id}` (T1) → 200 `{"ok": true, "kind"}` | 409 `{"detail": string}` | 404. Prop `onRefresh?: () => Promise<void>` (ya existe).
- Produces: filas live como `<div role="radio">` (mismo aria que hoy) con botón «🗑 ELIMINAR» solo en `kind === 'local' | 'git'`; error de borrado inline bajo la lista.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/components/source/SourceScreen.test.tsx`, añadir al final (sección nueva):

```tsx
// --- Task 1 (Fase 2c): eliminar proyectos en modo live ---
const LIVE_DELETABLE: ProjectInfo[] = [
  { id: 'miniapp', name: 'miniapp', path: 'C:/samples/miniapp', files: 12, lines: 340 },
  { id: 'local-1', name: 'mi app', path: 'C:/proyectos/mi app', files: 30, lines: 800, kind: 'local' },
  { id: 'git-1', name: 'dvwa', path: 'C:/workspace/repos/github.com-x-y-a1b2c3', files: 40, lines: 900, kind: 'git' },
]

test('eliminar: botón solo en filas LOCAL/GIT (no en sample)', () => {
  liveScreen({ projects: LIVE_DELETABLE })
  expect(screen.getByRole('button', { name: 'Eliminar mi app' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Eliminar dvwa' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /eliminar miniapp/i })).not.toBeInTheDocument()
})

test('eliminar: confirm → DELETE /api/projects/<id> + onRefresh', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const fetchMockFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, kind: 'local' }) })
  globalThis.fetch = fetchMockFn as unknown as typeof fetch
  const onRefresh = vi.fn().mockResolvedValue(undefined)
  liveScreen({ projects: LIVE_DELETABLE, onRefresh })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi app' }))
  })
  expect(confirmSpy).toHaveBeenCalledWith(
    '¿Eliminar "mi app" de la lista? La carpeta original y sus archivos no se tocan.',
  )
  expect(fetchMockFn).toHaveBeenCalledTimes(1)
  expect(String(fetchMockFn.mock.calls[0][0])).toBe('/api/projects/local-1')
  expect(fetchMockFn.mock.calls[0][1]?.method).toBe('DELETE')
  expect(onRefresh).toHaveBeenCalledTimes(1)
  confirmSpy.mockRestore()
})

test('eliminar: confirm cancelado → no hay DELETE', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const fetchMockFn = vi.fn()
  globalThis.fetch = fetchMockFn as unknown as typeof fetch
  liveScreen({ projects: LIVE_DELETABLE })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar dvwa' }))
  })
  expect(fetchMockFn).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('eliminar la fila seleccionada limpia la selección (CONTINUAR deshabilitado)', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, kind: 'local' }) }) as unknown as typeof fetch
  liveScreen({ projects: LIVE_DELETABLE })
  fireEvent.click(screen.getByRole('radio', { name: /mi app/ }))
  expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi app' }))
  })
  expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
  confirmSpy.mockRestore()
})

test('eliminar: 409 del backend → mensaje inline con el detail', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false, status: 409,
    json: async () => ({ detail: 'Hay un análisis en curso para este proyecto; cancela antes de eliminarlo' }),
  }) as unknown as typeof fetch
  liveScreen({ projects: LIVE_DELETABLE })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi app' }))
  })
  expect(
    screen.getByText('Hay un análisis en curso para este proyecto; cancela antes de eliminarlo'),
  ).toBeInTheDocument()
  vi.restoreAllMocks()
})
```

- [ ] **Step 2: Verificar el fallo**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx`
Expected: FAIL en los 5 tests nuevos (no existe el botón «🗑 ELIMINAR»).

- [ ] **Step 3: Implementar en `src/components/source/SourceScreen.tsx`**

1. Nuevos estados (junto a `browseOpen`):

```tsx
const [deletingId, setDeletingId] = useState<string | null>(null)
const [deleteError, setDeleteError] = useState<string | null>(null)
```

2. Nueva función (junto a `submitGit`):

```tsx
const deleteProject = async (p: ProjectInfo, _index: number) => {
  const detail =
    p.kind === 'git'
      ? 'Se borrará su clon del workspace. El repositorio original no se toca.'
      : 'La carpeta original y sus archivos no se tocan.'
  if (!window.confirm(`¿Eliminar "${p.name}" de la lista? ${detail}`)) return
  setDeletingId(p.id)
  setDeleteError(null)
  try {
    const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
    if (res.status === 200) {
      // Selección SIEMPRE limpia tras borrar (ruling T2 fix round 1): si se borra
      // una fila ANTERIOR a la seleccionada, el índice queda obsoleto → TypeError
      // en handleContinue o auditoría del proyecto equivocado.
      setSelected(null)
      await onRefresh?.()
    } else if (res.status === 404) {
      setDeleteError('El proyecto ya no existe')
      await onRefresh?.()
    } else if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
      setDeleteError(typeof body?.detail === 'string' ? body.detail : 'Este proyecto no se puede eliminar')
    } else {
      setDeleteError('Error de conexión con el backend')
    }
  } catch {
    setDeleteError('Error de conexión con el backend')
  } finally {
    setDeletingId(null)
  }
}
```

3. La rama live de la lista de proyectos: el `<button role="radio">` actual se convierte en `<div>` (un `<button>` anidado sería HTML inválido); el resto de la fila es idéntico. Al final del `</div>` del radiogroup, añadir el error inline:

```tsx
<div
  key={p.id}
  role="radio"
  aria-checked={selected === i}
  tabIndex={0}
  onClick={() => setSelected(i)}
  onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelected(i)
    }
  }}
  className={`flex cursor-pointer items-center justify-between gap-4 border px-4 py-3 text-left transition-all duration-200 ${
    selected === i
      ? 'border-neon-magenta bg-neon-magenta/5 shadow-[0_0_12px_rgba(255,45,149,0.2)]'
      : 'border-ink-faint opacity-60 hover:opacity-100'
  }`}
>
  <span className="flex items-center gap-2 text-sm font-bold text-ink">
    <span className="text-neon-cyan">📁 {p.name}</span>
    {p.kind && p.kind !== 'sample' && (
      <span className="font-mono text-[10px] text-neon-cyan">
        {p.kind === 'local' ? 'LOCAL' : 'GIT'}
      </span>
    )}
  </span>
  <span className="flex items-center gap-3">
    <span className="font-mono text-xs text-ink-dim">{p.path}</span>
    <span className="font-mono text-xs text-ink-faint">{p.files} archivos</span>
    {(p.kind === 'local' || p.kind === 'git') && (
      <button
        type="button"
        aria-label={`Eliminar ${p.name}`}
        disabled={deletingId !== null}
        onClick={e => {
          e.stopPropagation()
          void deleteProject(p, i)
        }}
        className="rounded border border-ink-faint px-1.5 py-0.5 font-mono text-[10px] text-ink-faint transition-colors duration-200 hover:border-sev-critical hover:text-sev-critical disabled:cursor-not-allowed disabled:opacity-40"
      >
        {deletingId === p.id ? '…' : '🗑 ELIMINAR'}
      </button>
    )}
  </span>
</div>
```

Y bajo el `</div>` que cierra el `role="radiogroup"`:

```tsx
{deleteError && (
  <p className="mt-2 font-mono text-xs text-sev-critical">{deleteError}</p>
)}
```

4. La rama mock (picker + tabs) queda intacta.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx`
Expected: PASS (los 5 tests nuevos + todos los anteriores del fichero, incluidos los de modo live existentes que usan `getByRole('radio', ...)` — el div con `role="radio"` conserva el accessible name por su contenido).

- [ ] **Step 5: Comprobación final de la task (una vez)**

Run: `npx vitest run` y `npm run build`
Expected: suite completa verde + build limpio.

- [ ] **Step 6: Commit**

```
git add src/components/source/SourceScreen.tsx src/components/source/SourceScreen.test.tsx
git commit -m "feat(front): botón eliminar en proyectos live (confirm + DELETE + refresh)"
```

---

### Task 3: Front — orden del resumen (criticidad | tipo) + marcar/desmarcar todos

**Files:**
- Modify: `src/components/summary/SummaryScreen.tsx` (estado de orden + control + botón marcar/desmarcar), `src/state/useAnalysis.ts` (`setAllFindingIds`), `src/App.tsx` (cableado de la prop)
- Test: `src/components/summary/SummaryScreen.test.tsx` (4 tests nuevos + `onSetAllFindings` por defecto en el helper `renderScreen`)

**Interfaces:**
- Produces: `useAnalysis().setAllFindingIds(ids: string[])` (setter directo de `selectedFindingIds`, mismo patrón que `setAllVulns`).
- Produces: `SummaryScreen` gana la prop requerida `onSetAllFindings: (ids: string[]) => void`.
- Control de orden: `<div role="group" aria-label="Orden de los hallazgos">` con 2 botones nombrados «CRITICIDAD» y «TIPO».

- [ ] **Step 1: Escribir los tests que fallan**

En `src/components/summary/SummaryScreen.test.tsx`:
1. En el helper `renderScreen`, añadir la prop al `<SummaryScreen>`: `onSetAllFindings={handlers.onSetAllFindings ?? (() => {})}` y al tipo de `handlers` la entrada `onSetAllFindings?: (ids: string[]) => void`.
2. Tests nuevos al final:

```tsx
// --- Task 3 (Fase 2c): orden (criticidad | tipo) + marcar/desmarcar todos ---
const mixed: Finding[] = [findings[3], findings[0], findings[1], findings[2]] // low, critical, high, medium

const cardTitles = () =>
  screen.getAllByTestId('finding-card').map(c => c.textContent ?? '')

test('por defecto, orden por criticidad (el más crítico arriba)', () => {
  renderScreen({ ...base, findings: mixed })
  const t = cardTitles()
  expect(t[0]).toContain('IDOR')
  expect(t[1]).toContain('SQL injection')
  expect(t[2]).toContain('API key')
  expect(t[3]).toContain('Sin logs')
})

test('orden «TIPO»: grupos A01→A10; dentro del grupo, por criticidad', () => {
  const extraA03: Finding = { ...findings[1], id: 'A03-2', severity: 'low', title: 'Otro hallazgo A03' }
  const list: Finding[] = [extraA03, findings[3], findings[0], findings[2], findings[1]]
  renderScreen({ ...base, findings: list })
  fireEvent.click(screen.getByRole('button', { name: 'TIPO' }))
  const t = cardTitles()
  expect(t[0]).toContain('IDOR') // A01
  expect(t[1]).toContain('API key') // A02
  expect(t[2]).toContain('SQL injection') // A03 high (antes que el low)
  expect(t[3]).toContain('Otro hallazgo A03') // A03 low
  expect(t[4]).toContain('Sin logs') // A09
})

test('conmutar el orden re-renderiza la lista en ambos sentidos', () => {
  renderScreen({ ...base, findings: mixed }) // [low A09, critical A01, high A03, medium A02]
  // criticidad (default): critical → high → medium → low
  expect(cardTitles()[0]).toContain('IDOR')
  expect(cardTitles()[1]).toContain('SQL injection')
  expect(cardTitles()[2]).toContain('API key')
  expect(cardTitles()[3]).toContain('Sin logs')
  // tipo: A01 → A02 → A03 → A09
  fireEvent.click(screen.getByRole('button', { name: 'TIPO' }))
  expect(cardTitles()[0]).toContain('IDOR')
  expect(cardTitles()[1]).toContain('API key')
  expect(cardTitles()[2]).toContain('SQL injection')
  expect(cardTitles()[3]).toContain('Sin logs')
  // de vuelta a criticidad
  fireEvent.click(screen.getByRole('button', { name: 'CRITICIDAD' }))
  expect(cardTitles()[0]).toContain('IDOR')
  expect(cardTitles()[1]).toContain('SQL injection')
  expect(cardTitles()[2]).toContain('API key')
})

test('MARCAR TODOS / DESMARCAR TODOS (alcance)', () => {
  const onSetAllFindings = vi.fn()
  const { rerender } = render(
    <SummaryScreen
      analysis={base}
      selectedFindingIds={[]}
      onToggleFinding={() => {}}
      onSetAllFindings={onSetAllFindings}
      onGenerateScope={() => {}}
      onNewAudit={() => {}}
      onBack={() => {}}
    />,
  )
  expect(screen.getByText('0 DE 4 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /marcar todos/i }))
  expect(onSetAllFindings).toHaveBeenCalledWith(['A01-1', 'A03-1', 'A02-1', 'A09-1'])

  rerender(
    <SummaryScreen
      analysis={base}
      selectedFindingIds={['A01-1', 'A03-1', 'A02-1', 'A09-1']}
      onToggleFinding={() => {}}
      onSetAllFindings={onSetAllFindings}
      onGenerateScope={() => {}}
      onNewAudit={() => {}}
      onBack={() => {}}
    />,
  )
  expect(screen.getByText('4 DE 4 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /desmarcar todos/i }))
  expect(onSetAllFindings).toHaveBeenLastCalledWith([])
})

test('con 0 hallazgos, MARCAR TODOS está deshabilitado', () => {
  renderScreen({ ...base, findings: [] })
  expect(screen.getByRole('button', { name: /marcar todos/i })).toBeDisabled()
})
```

- [ ] **Step 2: Verificar el fallo**

Run: `npx vitest run src/components/summary/SummaryScreen.test.tsx`
Expected: FAIL (no hay botón «TIPO» ni «MARCAR TODOS»; el helper falla por la prop que falta en `App`-level: `onSetAllFindings`).

- [ ] **Step 3: Implementar**

1. `src/state/useAnalysis.ts` — añadir a la interfaz `UseAnalysis` (`setAllFindingIds(ids: string[]): void`, tras `toggleFinding`), al body del hook y al return:

```ts
const setAllFindingIds = useCallback((ids: string[]) => {
  setSelectedFindingIds(ids)
}, [])
```

2. `src/App.tsx` — en el caso `summary` del switch, añadir la prop: `onSetAllFindings={flow.setAllFindingIds}`.

3. `src/components/summary/SummaryScreen.tsx`:
- Import: `import { useMemo, useState } from 'react'`.
- Prop nueva en la firma: `onSetAllFindings: (ids: string[]) => void`.
- Constantes (tras `SEVERITY_ROWS`):

```ts
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
type OrderMode = 'severity' | 'type'
const ORDER_OPTIONS: { value: OrderMode; label: string }[] = [
  { value: 'severity', label: 'CRITICIDAD' },
  { value: 'type', label: 'TIPO' },
]
```

- Estado + lista ordenada (tras `const { agents, findings, meta } = analysis`):

```ts
const [order, setOrder] = useState<OrderMode>('severity')

// Orden del listado (estable: igual criterio conserva el orden de llegada del motor).
const ordered = useMemo(() => {
  const arr = [...findings]
  if (order === 'severity') {
    arr.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  } else {
    arr.sort((a, b) =>
      a.vulnId === b.vulnId
        ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        : a.vulnId < b.vulnId
          ? -1
          : 1,
    )
  }
  return arr
}, [findings, order])
```

- En el bloque de la lista de hallazgos, **sustituir `findings.map(f => {` por `ordered.map(f => {`** (el resto del map es idéntico).
- Control de orden (justo antes del `<div className="mt-6 flex flex-col gap-2">` que contiene la lista):

```tsx
{total > 0 && (
  <div className="mb-3 flex items-center gap-2" role="group" aria-label="Orden de los hallazgos">
    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">ORDEN</span>
    {ORDER_OPTIONS.map(o => (
      <button
        key={o.value}
        type="button"
        aria-pressed={order === o.value}
        onClick={() => setOrder(o.value)}
        className={`border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest transition-all duration-200 ${
          order === o.value
            ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan shadow-[0_0_12px_rgba(0,229,255,0.25)]'
            : 'border-ink-faint text-ink-faint hover:border-ink-dim hover:text-ink-dim'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
)}
```

- Botón marcar/desmarcar (en el pie, dentro del `div.flex.flex-wrap.items-center.gap-4` izquierdo, justo tras el `<p>` del contador):

```tsx
{(() => {
  const allMarked = total > 0 && findings.every(f => selectedFindingIds.includes(f.id))
  return (
    <button
      type="button"
      onClick={() => onSetAllFindings(allMarked ? [] : findings.map(f => f.id))}
      disabled={total === 0}
      className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan disabled:cursor-not-allowed disabled:opacity-40"
    >
      {allMarked ? 'DESMARCAR TODOS' : 'MARCAR TODOS'}
    </button>
  )
})()}
```

- La lógica de expansión por defecto y el resto (barra de severidad, PDF, scope) quedan intactos.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/summary/SummaryScreen.test.tsx`
Expected: PASS (tests nuevos + todos los existentes del fichero).

- [ ] **Step 5: Comprobación final de la task (una vez)**

Run: `npx vitest run` y `npm run build`
Expected: suite completa verde + build limpio (tsc: la prop nueva de `SummaryScreen` cableada en `App.tsx`).

- [ ] **Step 6: Commit**

```
git add src/components/summary/SummaryScreen.tsx src/components/summary/SummaryScreen.test.tsx src/state/useAnalysis.ts src/App.tsx
git commit -m "feat(front): orden del resumen (criticidad | tipo) + marcar/desmarcar todos los hallazgos"
```

---

### Task 4: Backend — reestilo del PDF de alcance (cajas, chips, cabecera centrada)

**Files:**
- Modify: `backend/app/pdf_report.py` (parser `_parse_scope_text` + reescritura de `build_scope_pdf`; **`build_report_pdf` queda intacto**)
- Test: `backend/tests/test_pdf_report.py` (tests nuevos + actualización del helper `_scope_content` para streams sin comprimir)

**Interfaces:**
- Produces: `build_scope_pdf(text: str, title: str = "Alcance técnico de mejora") -> bytes` (misma firma; `pageCompression=0`).
- Produces: `_parse_scope_text(text: str) -> tuple[list[str], list[dict]]` — cabecera (≤ 2 líneas) + bloques `{"kind": "card", "num": str, "title": str, "severity": "critical"|"high"|"medium"|"low"|None, "body": list[str]}` o `{"kind": "plain", "body": list[str]}`.
- El contrato `POST /api/reports/scope-pdf` y el `ScopeModal` del front **no cambian** (el texto editado por el usuario sigue siendo la fuente; lo que no encaja en el patrón se imprime plano).

- [ ] **Step 1: Actualizar el helper de tests + escribir los tests que fallan**

En `backend/tests/test_pdf_report.py`:

1. Sustituir `_scope_content` por (el nuevo scope PDF va sin comprimir; el helper debe aceptar ambos):

```python
def _scope_content(data: bytes) -> bytes:
    """Stream de contenido del scope PDF (ahora sin comprimir; hay también el stream del logo)."""
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        raw = m.group(1)
        if b"Tj" in raw:
            return raw
        try:
            dec = zlib.decompress(base64.a85decode(raw, adobe=True))
            if b"Tj" in dec:
                return dec
        except Exception:
            continue
    raise AssertionError("stream de contenido no encontrado")
```

2. Tests nuevos (sección «Reestilo del PDF de alcance (Fase 2c)»):

```python
# --- Reestilo del PDF de alcance (Fase 2c, G4) ---
def _scope_payload() -> str:
    header = (
        "ALCANCE TÉCNICO DE MEJORA — SEGURIDAD\n"
        "Proyecto: miniapp · 22/11/2026 · Serbatic Security Inspector"
    )
    blocks = [
        "1. EVALUACIÓN INSEGURA (A05 CONFIGURACIÓN INSEGURA) — CRÍTICO\n"
        "Objetivo: eliminar evaluación insegura detectado en app.js.\n"
        "· Revisar la ocurrencia en app.js:1 y aplicar la solución recomendada.\n"
        "· Validar el cambio con una prueba que cubra el caso.\n"
        "Estimación: 4 h · Prioridad: inmediata",
        "2. XSS REFLEJADO (A03 INYECCIÓN) — ALTO\n"
        "Objetivo: eliminar xss reflejado detectado en server.js.\n"
        "· Revisar la ocurrencia en server.js:7 y aplicar la solución recomendada.\n"
        "· Validar el cambio con una prueba que cubra el caso.\n"
        "Estimación: 3 h · Prioridad: alta",
        "3. CABECERAS AUSENTES (A05 CONFIGURACIÓN INSEGURA) — MEDIO\n"
        "Objetivo: eliminar cabeceras ausentes detectado en server.js.\n"
        "· Revisar la ocurrencia en server.js:2 y aplicar la solución recomendada.\n"
        "· Validar el cambio con una prueba que cubra el caso.\n"
        "Estimación: 2 h · Prioridad: media",
    ]
    return header + "\n\n" + "\n\n".join(blocks)


def test_scope_pdf_cards_con_titulos_chips_y_colores_severidad():
    data = build_scope_pdf(_scope_payload())
    assert data[:5] == b"%PDF-"
    assert b"Helvetica-Bold" in data  # títulos de card en negrita (stream sin comprimir)
    drawn = _drawn_strings(data)
    # título de la card 1 (Ó = 0xD3 → escape octal \323)
    assert b"1. EVALUACI\\323N INSEGURA" in drawn
    # chips de severidad (Í = 0xCD → \315; ALTO/MEDIO son ASCII)
    assert b"CR\\315TICO" in drawn
    assert b"ALTO" in drawn
    assert b"MEDIO" in drawn
    # la línea de estimación, entera en una sola cadena dibujada (· = 0xB7 → \267)
    assert b"4 h \\267 Prioridad: inmediata" in drawn
    # colores de los chips (los hex de _SEV)
    got = _rg_colors(data)
    for hx in ("#be185d", "#c2410c", "#a16207"):
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
        assert any(abs(a - r) < 0.01 and abs(bg - g) < 0.01 and abs(cc - b) < 0.01
                   for a, bg, cc in got), hx


def test_scope_pdf_cabecera_centrada_y_subtitulo():
    drawn = _drawn_strings(build_scope_pdf(_scope_payload()))
    # título del documento (É = 0xC9 → \311; — = 0x97 → \227)
    assert b"ALCANCE T\\311CNICO DE MEJORA \\227 SEGURIDAD" in drawn
    assert b"Proyecto: miniapp" in drawn  # subtítulo de la cabecera


def test_scope_pdf_sincabecera_usa_title_del_parametro():
    data = build_scope_pdf(
        "1. COSA (A01) — ALTO\nObjetivo: corregir cosa.\nEstimación: 1 h · Prioridad: baja",
        "Mi Título",
    )
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"Mi T\\355tulo" in drawn  # í = 0xED → \355


def test_scope_pdf_bloque_plano_por_fallback():
    data = build_scope_pdf("ALCANCE\n\nTexto libre editado por el usuario\nque no encaja en el patrón")
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"Texto libre editado por el usuario" in drawn
    assert b"que no encaja en el patr\\363n" in drawn  # ó = 0xF3 → \363


def test_scope_pdf_card_sin_severidad_sin_chip():
    data = build_scope_pdf(
        "ALCANCE\n\n1. TITULO LIBRE (A01)\nObjetivo: cosa.\nEstimación: 1 h · Prioridad: baja"
    )
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"1. TITULO LIBRE (A01)" in drawn
    got = _rg_colors(data)
    for hx in ("#be185d", "#c2410c", "#a16207", "#0e7490"):  # sin colores de chip
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
        assert not any(abs(a - r) < 0.01 and abs(bg - g) < 0.01 and abs(cc - b) < 0.01
                       for a, bg, cc in got), hx


def test_scope_pdf_multipagina_y_pie():
    blocks = []
    for i in range(30):
        sev = ("CRÍTICO", "ALTO", "MEDIO", "BAJO")[i % 4]
        blocks.append(
            f"{i + 1}. TÍTULO LARGO DE PRUEBA NÚMERO {i + 1} (A01 INYECCIÓN) — {sev}\n"
            f"Objetivo: eliminar el problema {i + 1} detectado en archivo_{i + 1}.js.\n"
            f"· Revisar la ocurrencia en archivo_{i + 1}.js:{i + 1} y aplicar la solución.\n"
            f"· Validar el cambio con una prueba que cubra el caso del hallazgo.\n"
            f"Estimación: {4 - i % 4} h · Prioridad: alta"
        )
    data = build_scope_pdf("ALCANCE\n\n" + "\n\n".join(blocks))
    assert data[:5] == b"%PDF-"
    assert len(re.findall(rb"/Type /Page\b", data)) >= 2
    drawn = _drawn_strings(data)
    assert b"P\\341gina" in drawn  # «Página N» del pie (páginas 2+)
    assert b"Serbatic Security Inspector" in drawn  # marca en el pie
    assert b"Alcance t\\355cnico de mejora" in drawn  # cabecera de páginas 2+ (title param)
```

- [ ] **Step 2: Verificar el fallo**

Run: `backend\.venv\Scripts\python.exe -m pytest tests/test_pdf_report.py -q` (workdir `backend/`)
Expected: FAIL en los 6 tests nuevos (el scope PDF actual es texto plano a ciegas: sin chips, sin `Helvetica-Bold` en el stream, sin pie «Página N», sin el título por parámetro).

- [ ] **Step 3: Implementar en `backend/app/pdf_report.py`**

Sustituir la función actual `build_scope_pdf` por la siguiente (y añadir encima las constantes + el parser). **No tocar `build_report_pdf` ni ningún otro código del fichero** (los colores `_SEV`, `_BOX_BG`, `_BOX_BORDER`, `_ACCENT`, `_TXT`, `_TXT_SEC`, `_MARGIN`, `_LEADING`, `_TEXT_SIZE`, `_LOGO*`, `_winansi`, `_wrap_lines`, `SEVERITY_ES` ya existen):

```python
# --- Reestilo del PDF de alcance (Fase 2c, G4) ---
# Primera línea de card: «N. TÍTULO (VULN) — SEVERIDAD» (severidad opcional).
_CARD_RE = re.compile(r"^(\d+)\.\s+(.+?)(?:\s+—\s+(CRÍTICO|ALTO|MEDIO|BAJO))?$")
_SEV_WORD = {"CRÍTICO": "critical", "ALTO": "high", "MEDIO": "medium", "BAJO": "low"}

_CARD_PAD = 4 * mm
_CARD_BAR = 1.6 * mm
_CARD_TITLE_H = 6.2 * mm
_CARD_CHIP_H = 7 * mm
_CARD_EST_H = 5.5 * mm
_CARD_GAP = 4 * mm


def _parse_scope_text(text: str) -> tuple[list[str], list[dict]]:
    """Parsea el texto del alcance en (cabecera, bloques).

    - Cabecera: el primer bloque, si tiene ≤ 2 líneas y su primera línea no es
      una card numerada (línea 1 = título, línea 2 = subtítulo).
    - Card: primera línea ``N. TÍTULO (VULN) — SEVERIDAD`` + líneas de cuerpo.
    - Plano: cualquier otro bloque (texto editado por el usuario) → párrafo.
    """
    raw = [b for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    blocks: list[dict] = []
    start = 0
    header: list[str] = []
    if raw:
        first = [ln for ln in raw[0].split("\n") if ln.strip()]
        if len(first) <= 2 and not _CARD_RE.match(first[0].strip()):
            header = first
            start = 1
    for blk in raw[start:]:
        lines = [ln.strip() for ln in blk.split("\n") if ln.strip()]
        m = _CARD_RE.match(lines[0])
        if m:
            blocks.append({
                "kind": "card",
                "num": m.group(1),
                "title": m.group(2).strip(),
                "severity": _SEV_WORD.get(m.group(3) or ""),
                "body": lines[1:],
            })
        else:
            blocks.append({"kind": "plain", "body": lines})
    return header, blocks


def build_scope_pdf(text: str, title: str = "Alcance técnico de mejora") -> bytes:
    """Devuelve los bytes de un PDF A4 del alcance con layout estructurado (G4 2c).

    El texto plano del usuario es la fuente: lo reconocible se estila
    (cabecera centrada, cajas con chip de severidad a color y barra de
    acento, línea de estimación con filete) y lo que no encaja se imprime
    como párrafo plano (fallback gracioso). ``pageCompression=0``: los
    tests inspeccionan los bytes.
    """
    buf = io.BytesIO()
    width, height = A4
    max_width = width - 2 * _MARGIN
    c = _canvas.Canvas(buf, pagesize=A4, pageCompression=0)
    y = height - _MARGIN

    def page_deco(cnv) -> None:
        """Páginas 2+: cabecera (title, izquierda) + pie («Página N» + marca)."""
        cnv.saveState()
        cnv.setFont("Helvetica", 8)
        cnv.setFillColor(_TXT_SEC)
        cnv.drawString(_MARGIN, height - 12 * mm, _winansi(title))
        cnv.drawString(_MARGIN, 10 * mm, _winansi(f"Página {cnv.getPageNumber()}"))
        cnv.drawRightString(width - _MARGIN, 10 * mm, "Serbatic Security Inspector")
        cnv.restoreState()

    def new_page() -> None:
        nonlocal y
        c.showPage()
        y = height - _MARGIN
        page_deco(c)

    def ensure(space: float) -> None:
        nonlocal y
        if y - space < _MARGIN:
            new_page()

    # --- Página 1: cabecera centrada (logo + título + subtítulo + filete) ---
    c.drawImage(str(_LOGO), (width - _LOGO_W) / 2, y - _LOGO_H,
                width=_LOGO_W, height=_LOGO_H, mask="auto")
    y -= _LOGO_H + 10 * mm
    header, blocks = _parse_scope_text(text)
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(_TXT)
    c.drawCentredString(width / 2, y, _winansi(header[0] if header else title))
    y -= 8 * mm
    if len(header) > 1:
        c.setFont("Helvetica", 10)
        c.setFillColor(_TXT_SEC)
        c.drawCentredString(width / 2, y, _winansi(header[1]))
        y -= 5 * mm
    c.setFillColor(_ACCENT)
    c.rect(width / 2 - 15 * mm, y - 4.5 * mm, 30 * mm, 0.8 * mm, fill=1, stroke=0)
    y -= 12 * mm

    bar = _CARD_BAR
    inner_w = max_width - bar - 2 * _CARD_PAD
    text_x = _MARGIN + bar + _CARD_PAD

    def draw_card(num: str, card_title: str, severity: str | None, body: list[str]) -> None:
        """Card de alcance: caja (#f3f4f6) con barra de acento de severidad, chip,
        título en negrita, cuerpo y línea de estimación con filete. Puede partir
        de página: la caja continua (fondo + acento por segmento)."""
        nonlocal y
        sev_color = _SEV.get(severity, _ACCENT) if severity else _ACCENT

        def seg(bottom: float, h: float) -> None:
            c.setFillColor(_BOX_BG)
            c.rect(_MARGIN, bottom, max_width - bar, h, fill=1, stroke=0)
            c.setFillColor(sev_color)
            c.rect(_MARGIN, bottom, bar, h, fill=1, stroke=0)

        # Filas (h, draw): el slot de una fila con baseline y es [y + 2mm, y + 2mm - h].
        rows: list[tuple[float, Callable[[], None]]] = []
        if severity:
            label = severity.upper()
            chip_w = c.stringWidth(label, "Helvetica-Bold", 8) + 4 * mm

            def chip_row() -> None:
                c.setFillColor(sev_color)
                c.rect(text_x, y - 3.5 * mm, chip_w, 4.5 * mm, fill=1, stroke=0)
                c.setFillColor(_WHITE)
                c.setFont("Helvetica-Bold", 8)
                c.drawString(text_x + 2 * mm, y - 2 * mm, _winansi(label))

            rows.append((_CARD_CHIP_H, chip_row))

        for wl in _wrap_lines(c, f"{num}. {card_title}", "Helvetica-Bold", 11, inner_w):
            def title_row(wl=wl) -> None:
                c.setFont("Helvetica-Bold", 11)
                c.setFillColor(_TXT)
                c.drawString(text_x, y, _winansi(wl))
            rows.append((_CARD_TITLE_H, title_row))

        for raw_line in body:
            stripped = raw_line.strip()
            if stripped.startswith("Estimación:"):
                rest = _winansi(stripped[len("Estimación:"):].strip())

                def est_row(rest=rest) -> None:
                    c.setFont("Helvetica-Bold", 9.5)
                    c.setFillColor(_TXT)
                    c.drawString(text_x, y, "Estimación:")
                    x2 = text_x + c.stringWidth("Estimación:", "Helvetica-Bold", 9.5) + 1.5 * mm
                    c.setFont("Helvetica", 9.5)
                    c.setFillColor(_TXT_SEC)
                    c.drawString(x2, y, rest)
                    c.setStrokeColor(_BOX_BORDER)
                    c.setLineWidth(0.3)
                    c.line(text_x, y - 1.5 * mm, text_x + inner_w, y - 1.5 * mm)

                rows.append((_CARD_EST_H, est_row))
                continue
            if stripped.startswith("Objetivo:"):
                rest = stripped[len("Objetivo:"):].strip()
                label_w = c.stringWidth("Objetivo:", "Helvetica-Bold", 9)
                parts = _wrap_lines(c, rest, "Helvetica", _TEXT_SIZE,
                                    max(inner_w - label_w - 2 * mm, 10 * mm)) or [""]

                def obj_first(first=parts[0]) -> None:
                    c.setFont("Helvetica-Bold", 9)
                    c.setFillColor(_ACCENT)
                    c.drawString(text_x, y, "Objetivo:")
                    x2 = text_x + label_w + 2 * mm
                    c.setFont("Helvetica", _TEXT_SIZE)
                    c.setFillColor(_TXT)
                    c.drawString(x2, y, _winansi(first))

                rows.append((_LEADING, obj_first))
                for rp in parts[1:]:
                    def obj_cont(rp=rp) -> None:
                        c.setFont("Helvetica", _TEXT_SIZE)
                        c.setFillColor(_TXT)
                        c.drawString(text_x, y, _winansi(rp))
                    rows.append((_LEADING, obj_cont))
                continue
            for wl in _wrap_lines(c, stripped, "Helvetica", _TEXT_SIZE, inner_w):
                def body_row(wl=wl) -> None:
                    c.setFont("Helvetica", _TEXT_SIZE)
                    c.setFillColor(_TXT)
                    c.drawString(text_x, y, _winansi(wl))
                rows.append((_LEADING, body_row))

        total_h = _CARD_PAD * 2 + sum(h for h, _ in rows)
        box_top = y
        if total_h <= box_top - _MARGIN:
            c.setStrokeColor(_BOX_BORDER)
            c.setLineWidth(0.5)
            c.rect(_MARGIN, box_top - total_h, max_width, total_h, fill=0, stroke=1)
        y = box_top - _CARD_PAD  # padding superior de la caja
        first_row = True
        for h, draw in rows:
            if y - h + 2 * mm < _MARGIN:
                if not first_row:
                    seg(_MARGIN, y - _MARGIN)  # la caja llega al borde inferior
                new_page()
                y -= 2 * mm  # el slot empieza en el borde superior de la página
            seg(y + 2 * mm - h, h)  # fondo + acento del slot
            draw()
            y -= h
            first_row = False
        bottom_pad = min(_CARD_PAD, y - _MARGIN)
        if bottom_pad > 0:
            seg(y - bottom_pad, bottom_pad)
            y -= bottom_pad
        y -= _CARD_GAP

    def draw_plain(lines: list[str]) -> None:
        nonlocal y
        for ln in lines:
            for wl in _wrap_lines(c, ln, "Helvetica", _TEXT_SIZE, max_width):
                if y < _MARGIN:
                    new_page()
                c.setFont("Helvetica", _TEXT_SIZE)
                c.setFillColor(_TXT)
                c.drawString(_MARGIN, y, _winansi(wl))
                y -= _LEADING
        y -= 2 * mm

    for blk in blocks:
        if blk["kind"] == "card":
            # Sin cabecera de card huérfana: chip + título + 1 línea deben caber.
            ensure(_CARD_PAD * 2 + _CARD_CHIP_H + _CARD_TITLE_H + _LEADING)
            draw_card(blk["num"], blk["title"], blk["severity"], blk["body"])
        else:
            draw_plain(blk["body"])
    c.save()
    return buf.getvalue()
```

Nota de tipos: `Callable` se importa de `collections.abc` (`from collections.abc import Callable`) al inicio del fichero, junto a los demás imports.

- [ ] **Step 4: Verificar que pasa**

Run: `backend\.venv\Scripts\python.exe -m pytest tests/test_pdf_report.py -q`
Expected: PASS (los 6 tests nuevos + todos los existentes del fichero, incluidos los de `build_report_pdf` — intacto).

- [ ] **Step 5: Comprobación final de la task (una vez)**

Run: `backend\.venv\Scripts\python.exe -m pytest -q` (workdir `backend/`)
Expected: suite completa verde.

- [ ] **Step 6: Commit**

```
git add backend/app/pdf_report.py backend/tests/test_pdf_report.py
git commit -m "feat(backend): reestilo del PDF de alcance (cajas + chips de severidad + cabecera centrada)"
```

---

### Task 5: BrowseModal + browse — diferidos de 2b.1 (detail de error, race, null-byte)

**Files:**
- Modify: `src/components/source/BrowseModal.tsx` (detail del backend + guard anti-race), `backend/app/main.py` (browse: `ValueError` → 400)
- Test: `src/components/source/BrowseModal.test.tsx` (2 tests nuevos), `backend/tests/test_browse.py` (1 test nuevo)

**Interfaces:**
- Consumes: `GET /api/browse` (200 `BrowseData` | 400 `{"detail": str}`).
- Produces: el modal muestra el `detail` del backend en errores de navegación; una respuesta obsoleta (navegación superada) se descarta; `GET /api/browse?path=<con null-byte>` → 400 (no 500).

- [ ] **Step 1: Escribir los tests que fallan**

1. `backend/tests/test_browse.py` — añadir al final (reutilizar los fixtures del fichero; si el fichero usa `env_dirs`-style con `SAMPLES_DIR`, igual; el path con null-byte no tiene que existir):

```python
def test_browse_null_byte_400(env_dirs):
    with TestClient(app) as c:
        r = c.get("/api/browse", params={"path": "C:/x\x00y"})
        assert r.status_code == 400
```

2. `src/components/source/BrowseModal.test.tsx` — añadir al final:

```tsx
const ROOT_USERS: BrowseData = {
  path: 'C:/Users',
  parent: 'C:/',
  folders: [{ name: 'rferrero', path: 'C:/Users/rferrero', registered: null }],
}

test('error 400 con detail del backend → muestra el detail', async () => {
  mockQueue([{ status: 400, body: { detail: 'La ruta no es una carpeta' } as unknown as BrowseData }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByText('La ruta no es una carpeta')).toBeInTheDocument()
})

test('una navegación lenta y obsoleta no pisa a una más reciente', async () => {
  let resolveSlow!: (v: unknown) => void
  const slow = new Promise(v => { resolveSlow = v })
  const fn = vi.fn(async (url?: string) => {
    const u = String(url)
    if (u === '/api/browse') {
      return { ok: true, status: 200, json: async () => HOME }  // open: rápido
    }
    if (u.includes('Documentos')) {
      return slow.then(() => ({ ok: true, status: 200, json: async () => DOCS }))  // lenta
    }
    return { ok: true, status: 200, json: async () => ROOT_USERS }  // breadcrumb: rápido
  })
  globalThis.fetch = fn as unknown as typeof fetch
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})  // open resuelto (HOME)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /documentos/i }))  // navegación lenta
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Users' }))  // navegación rápida (obsoleta la otra)
  })
  await act(async () => {
    resolveSlow({ ok: true, status: 200, json: null })  // la lenta llega tarde
  })
  // El DOM muestra la carpeta de la navegación rápida, no la respuesta obsoleta.
  expect(screen.getByRole('button', { name: /rferrero/i })).toBeInTheDocument()
  expect(screen.queryByText('SerbaticSecurityInspector')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Verificar el fallo**

Run: `npx vitest run src/components/source/BrowseModal.test.tsx` y `backend\.venv\Scripts\python.exe -m pytest tests/test_browse.py -q` (workdir `backend/`)
Expected: FAIL — el test de detail (hoy el modal muestra siempre «No se pudo leer la carpeta»), el test de race (hoy la respuesta lenta pisa al DOM) y el test de null-byte (hoy `ValueError` → 500).

- [ ] **Step 3: Implementar**

1. `src/components/source/BrowseModal.tsx`:
- Import: `import { useEffect, useRef, useState } from 'react'`.
- Dentro del componente, añadir `const navSeq = useRef(0)` y sustituir `navigate` por:

```tsx
const navigate = async (target: string | null) => {
  const seq = ++navSeq.current
  setLoading(true)
  setError(null)
  try {
    const res = await fetch(target ? `/api/browse?path=${encodeURIComponent(target)}` : '/api/browse')
    if (seq !== navSeq.current) return // navegación superada: se descarta
    if (res.status !== 200) {
      let detail: string | null = null
      try {
        const j = (await res.json()) as { detail?: unknown } | null
        if (typeof j?.detail === 'string') detail = j.detail
      } catch {
        // cuerpo no-JSON: mensaje genérico
      }
      setData(null)
      setError(detail ?? 'No se pudo leer la carpeta')
      return
    }
    setData((await res.json()) as BrowseData)
  } catch {
    if (seq !== navSeq.current) return
    setData(null)
    setError('No se pudo leer la carpeta')
  } finally {
    if (seq === navSeq.current) setLoading(false)
  }
}
```

2. `backend/app/main.py`, endpoint `browse`: el `try` que construye `p` pasa a capturar también `ValueError` (un null-byte en la query lo levanta y hoy → 500):

```python
    try:
        p = (Path(path) if path else Path.home()).expanduser().resolve()
    except (OSError, ValueError):
        raise HTTPException(status_code=400, detail="Ruta no válida")
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/source/BrowseModal.test.tsx` y `backend\.venv\Scripts\python.exe -m pytest tests/test_browse.py -q`
Expected: PASS (tests nuevos + los existentes de ambos ficheros: el test «error 400 del backend → mensaje inline» actual sigue pasando porque sin `detail` en el body queda el mensaje genérico).

- [ ] **Step 5: Comprobación final de la task (una vez)**

Run: `backend\.venv\Scripts\python.exe -m pytest -q` (workdir `backend/`), `npx vitest run` y `npm run build`
Expected: todo verde + build limpio.

- [ ] **Step 6: Commit**

```
git add src/components/source/BrowseModal.tsx src/components/source/BrowseModal.test.tsx backend/app/main.py backend/tests/test_browse.py
git commit -m "fix: BrowseModal (detail de errores + race de navegación) y 400 en browse con null-byte"
```

---

### Task 6: Cierre — E2E real + final review + tag `v0.3.2`

**Files:**
- Create: `.tmp/e2e-2c.py` (script de E2E por la API; `.tmp/` es gitignored)
- Modify: `PROGRESS.md` (cierre + QA R14+), y si la final review lo exige, los ficheros que toque la fix wave (amend/commit propio documentado en el ledger)

**Interfaces:**
- Consumes: todo lo de T1–T5 por la API pública (misma secuencia que la UI).
- Produces: evidencias E2E en `.tmp/e2e-2c-result.md`, tag `v0.3.2`, PROGRESS cerrado con lista de QA para el usuario (R14+).

- [ ] **Step 1: Arranque de las 3 apps**

Run (desde la raíz del repo): `powershell -ExecutionPolicy Bypass -File scripts/start-all.ps1`
Expected: backend :8000, front :5173, miniapp :3000 escuchando (resumen en consola; logs en `.tmp/logs/`). Si un puerto está ocupado, el script avisa y arranca los demás.

- [ ] **Step 2: E2E real por la API**

Escribir `.tmp/e2e-2c.py` (python, stdlib + `urllib`/`http.client`; el quoting de PS 5.1 destruye el JSON de curl — ruling heredado de 2b.1) y ejecutarlo con `backend\.venv\Scripts\python.exe .tmp/e2e-2c.py`. Secuencia (base `http://127.0.0.1:8000`):

1. `GET /api/projects` → registrar los ids previos (miniapp, y clones git existentes en `workspace/repos/`).
2. **Git**: `POST /api/projects/git` con `https://github.com/digininja/DVWA` → 201 (si el clon ya existe en `workspace/repos/`, `register_git` lo reutiliza: sin re-clonado). Guardar `git_id` y la carpeta del clon (`path` devuelto).
3. `DELETE /api/projects/{git_id}` → 200 `{"kind": "git"}`; **comprobar en disco que la carpeta del clon desapareció** (`os.path.isdir` → False).
4. `POST /api/projects/git` de nuevo → 201 (re-clonado real, ~10–15 s; comprueba que borrar el clon no rompe el re-registro).
5. **Local**: crear `C:\Users\rferrero\AppData\Local\Temp\serbatic-e2e-2c\` con 2 ficheros `.js`; `POST /api/projects/local` → 201; `DELETE` → 200 `{"kind": "local"}`; **comprobar en disco que los 2 ficheros siguen íntegros**.
6. **Samples y desconocidos**: `DELETE /api/projects/miniapp` → 409; `DELETE /api/projects/nope` → 404.
7. **PDF de alcance real**: `POST /api/analyze` con `projectId=miniapp` y las 10 vulns → 202 → drenar el SSE `/api/runs/{id}/events` hasta `run:done` (gate LLM real; ~20–40 s). Con los findings del `run:done`, generar el texto del alcance **con la misma plantilla que `buildScopeText`** (cabecera de 2 líneas + bloques «N. TÍTULO (VULN) — SEVERIDAD» / «Objetivo: …» / 2 líneas «· …» / «Estimación: X h · Prioridad: Y», bloques separados por línea en blanco) y `POST /api/reports/scope-pdf` → 200. Comprobaciones por bytes: `%PDF-`; los colores de chip `#be185d`/`#c2410c`/`#a16207`/`#0e7490` (según severidades presentes) como operadores `rg`; `Helvetica-Bold` presente; la línea «Estimación: …» entera en una cadena; sin `nnnnnn`; nº de páginas ≥ 1. Guardar el PDF en `.tmp/alcance-e2e.pdf` (para la QA visual del usuario) y el número de hallazgos.
8. Si hay algún 504/error de LLM en el paso 7: relanzar UNA vez el análisis (el run anterior queda terminado) y anotar el resultado en el result file.

Run: `backend\.venv\Scripts\python.exe .tmp/e2e-2c.py`
Expected: el script imprime cada paso con OK/FAIL y termina 0; result file `.tmp/e2e-2c-result.md` con la evidencia (ids, tiempos, byte-checks, nº de páginas del PDF, nº de hallazgos).

- [ ] **Step 3: Suites completas (una vez)**

Run: `backend\.venv\Scripts\python.exe -m pytest -q` (workdir `backend/`) · `npx vitest run` · `npm run build`
Expected: backend verde (incluye el gate LLM real del miniapp ≥ 8/10), front verde, build limpio.

- [ ] **Step 4: Final review de rama (subagente fresco, `aitana/qwen3.8-fp8`)**

- Generar el paquete con `scripts/review-package PLAN_FILE v0.3.1 HEAD` (el del skill SDD, por ruta absoluta) y dispatchear el reviewer con la plantilla `task-reviewer-prompt`/`code-reviewer` del skill: paquete + plan + spec + Review Focus literal + puntero a las `Ruling:` del ledger.
- Re-grading de findings (spec = autoridad): Critical/Important → UNA fix wave (cada fix TDD: test que reproduce → rojo → fix → verde + suite completa); Minor → ledger como `Final: minor (deferred)`.
- Evidencia en el ledger: veredicto + fix wave (commits) + re-check.

- [ ] **Step 5: Parada de las 3 apps**

Run: `powershell -ExecutionPolicy Bypass -File scripts/stop-all.ps1`
Expected: puertos 8000/5173/3000 libres.

- [ ] **Step 6: Tag + cierre de PROGRESS + push**

1. Tag: `git tag v0.3.2` (sobre el commit final, tras la fix wave).
2. `PROGRESS.md`:
   - «Estado actual»: Fase 2c **COMPLETA** (X/X tasks, push + tag `v0.3.2`, suites finales, resumen E2E).
   - Sección «Progreso Fase 2c» con las 6 tasks y sus commits.
   - Registro de decisiones: entrada 2026-11-22 (3) con el cierre de la fase, rulings de ejecución y el PDF del E2E en `.tmp/alcance-e2e.pdf`.
   - QA pendiente del usuario: **R14** eliminar proyectos (git: clon borrado + fila fuera; local: carpeta intacta; sample: sin botón; cancel: sin cambios; run en curso: 409 visible) · **R15** orden del resumen (CRITICIDAD: más crítico arriba; TIPO: A01→A10, dentro por criticidad) · **R16** MARCAR TODOS / DESMARCAR TODOS (contador + GENERAR ALCANCE) · **R17** `alcance.pdf` nuevo (título centrado, cajas con chips a color, estimación con filete, pie en 2+; `.tmp/alcance-e2e.pdf` para verlo sin relanzar; el PDF de reporte queda intacto) · **R18** BrowseModal: error con el `detail` del backend + navegación rápida sin pisar.
   - «Siguiente»: Fase 3 (Docker) — pendiente de scope del usuario.
3. Commit de cierre:

```
git add PROGRESS.md
git commit -m "docs: cierre Fase 2c (PROGRESS + QA pendiente; E2E real + tag v0.3.2)"
```

4. Push único del coordinador: `git push origin main; git push origin v0.3.2`.
