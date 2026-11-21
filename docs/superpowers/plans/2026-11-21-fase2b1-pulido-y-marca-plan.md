# Fase 2b.1 — Pulido y marca (logo, navegador de carpetas, PDF para cliente, arranque 1-comando): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer la herramienta *presentable y cómoda* para uso real en Serbatic: marca completa (logo + «SERBATIC SECURITY INSPECTOR») en el front, navegador de carpetas por clics en modo live, informe PDF claro/imprimible para cliente (logo, colores de severidad, código con pygments, barra de distribución, paginación), y arranque/parada de las 3 apps con un solo comando.

**Architecture:** Front: `AppShell` gana `<img>` del logo + palabra «SECURITY» neutra; `SourceScreen` (rama live) gana un botón «📂 NAVEGAR» que abre un `BrowseModal` (breadcrumbs + SUBIR + lista de subcarpetas con tags LOCAL/GIT) sobre el endpoint nuevo `GET /api/browse` (el backend lista subdirectorios directos del disco y marca los que son raíz de un proyecto registrado local/git). Backend: `pdf_report.py` se reescribe con tema claro para cliente (paleta sobre blanco, logo, severidades en color, resaltado de sintaxis con `pygments`, barra de distribución en la portada, cabecera/pie con nº de página vía `onLaterPages`). Scripts PowerShell 5.1 `start-all.ps1`/`stop-all.ps1` para las 3 apps (backend :8000, front :5173, miniapp :3000) con logs en `.tmp/logs/`. Cierre: E2E real por la API (misma secuencia que el navegador de la UI) + final review de rama desde `v0.3.0` + tag `v0.3.1`.

**Tech Stack:** Front: Vite 5 + React 18 + TS strict + Tailwind 3.4 + Vitest/jsdom (sin deps nuevas). Backend: Python 3.12 (venv `backend/.venv`), FastAPI, reportlab, **pygments (única dep nueva, runtime → `requirements.txt`)**, pytest. Windows + PowerShell 5.1. LLM real solo en T5 (E2E + gate).

**Spec:** `docs/superpowers/specs/2026-11-21-fase2b1-pulido-y-marca-design.md` (leer antes de ejecutar; rulings del builder check en PROGRESS.md: `registered` = enum `"local" | "git" | null` resuelto en el servidor; G5 resuelto → **sin mover el puerto 8000**).

## Global Constraints

- Windows + PowerShell 5.1: separador `;` (nunca `&&`). Python: siempre `backend\.venv\Scripts\python.exe` (sin `Activate.ps1`). `pytest` con working dir `backend/`. Node v26.13.1.
- API key: solo en `backend/.env` (gitignored). Nunca en código, front, git ni reports.
- Copy de UI en español. **Sin nuevas librerías de front.** Sin router ni librería de estado.
- Paleta de la app (fondo oscuro) invariante: bg `#06060b`, panel `#0a0a14`, cian `#00e5ff`, magenta `#ff2d95`; severidades: crítico `#ff2d95`, alto `#ff9f43`, medio `#ffd23f`, bajo `#00e5ff`; texto `#f4f4f8`/`#8b8b98`/`#5a5a68` (= clases `ink`/`ink-dim`/`ink-faint`).
- Contrato SSE inmutable: `data: {json}\n\n`, `{"type","t",...}`; terminales `run:done`/`run:error`/`run:cancelled`. Shape de `findings` inmutable (`id, vulnId, severity, title, file, line, snippet, exploit, consequences, solution` + opcional `alsoCategories`).
- TDD estricto: rojo→verde **solo del test de la task**; al final de la task, UNA vez: backend → `pytest -q` (workdir `backend/`); front → `npx vitest run` + `npm run build`.
- Commits convencionales, **uno por task** (fix rounds de review amendados). **El implementer no pusha** (push único del coordinador tras review). Subagentes con `aitana/qwen3.8-fp8`.
- I/O de disco nunca en el event loop: los endpoints que tocan disco son `def` (→ threadpool).
- PDF: fuentes estándar reportlab = WinAnsi. `_winansi()` (cp1252 → `?`) en TODO texto dibujado, incluidos los tokens de código. «●» (U+25CF) **no está** en WinAnsi → la leyenda usa «•» (U+2022, sí está).
- `VULN_NAMES` de `pdf_report.py` sigue idéntico byte a byte a `src/data/owasp.ts` (invariante de la 2b). `pageCompression=0` se conserva en `build_report_pdf` (los tests inspeccionan los bytes).
- Logo: `assets/serbatic-logo.png` (757×237 px, RGBA con alfa, fondo transparente) **ya commiteado**; front y backend leen el mismo fichero. No se piden variantes.
- `SEVERITY_ES = {"critical": "CRÍTICO", "high": "ALTO", "medium": "MEDIO", "low": "BAJO"}` (en `app/pipeline.py`, ya importado por `pdf_report.py`).
- G5 (404 `GET /v1/models`): **resuelto en el handoff** — el poller es el propio CLI de OpenCode; ruling: ruido inofensivo, **sin mover el puerto 8000**. T5 solo lo reconfirma.

## Review Focus

1. **Rutas locales con espacios/paréntesis** (p. ej. `C:\...\mi app (copia)`) → el navegador las lista y navega a ellas; «USAR ESTA CARPETA» registra 201 y el run funciona. → tests T2 (backend + front).
2. **Raíz de unidad / sin padre** (`C:\`, `/`) → `parent: null` → «↑ SUBIR» deshabilitado y los breadcrumbs no crashean. → tests T2 (backend + front).
3. **PDF: snippet CJK/emoji + snippet de 5000 chars sin espacios** → «?» (sin la «n» silenciosa de reportlab, sin crash), paginación, `%PDF-` válido. → tests T3 (se conservan y adaptan los de la fix wave de la 2b).
4. **`start-all` con un puerto ya ocupado** (8000/5173/3000) → avisa y arranca los demás sin matar nada; `stop-all` solo mata los PIDs que escuchan en esos 3 puertos. → T4 (lógica revisada + verificación manual).
5. **`findings` vacío en el PDF nuevo** → portada **sin** barra ni leyenda, PDF válido con «HALLAZGOS (0 total)». → tests T3.

---

### Task 1: Marca en el front (G1)

**Files:**
- Create: `src/vite-env.d.ts`
- Modify: `src/components/layout/AppShell.tsx:27-45` (cabecera)
- Test: `src/components/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes: `assets/serbatic-logo.png` (ya commiteado, 757×237 RGBA con alfa).
- Produces: cabecera con `<img alt="Serbatic" className="h-7">` + «SERBATIC SECURITY INSPECTOR». Sin cambios de API ni de props de `AppShell`.

- [ ] **Step 1: Actualizar el test para que falle**

En `src/components/layout/AppShell.test.tsx`:
- Añadir import: `import { readFileSync } from 'node:fs'`
- Reemplazar el test `renderiza la marca SERBATIC e INSPECTOR` por:

```tsx
test('renderiza el logo y el título completo SERBATIC SECURITY INSPECTOR', () => {
  render(
    <AppShell step="source" onGoSource={() => {}} onGoVulns={() => {}}>
      <p>contenido</p>
    </AppShell>,
  )
  const logo = screen.getByAltText('Serbatic')
  expect(logo.tagName).toBe('IMG')
  expect(logo).toHaveAttribute('src')
  expect(screen.getByText('SERBATIC')).toBeInTheDocument()
  expect(screen.getByText('SECURITY')).toBeInTheDocument()
  expect(screen.getByText('INSPECTOR')).toBeInTheDocument()
})

test('la pestaña del navegador lleva el título completo (index.html)', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')
  expect(html).toContain('<title>Serbatic Security Inspector</title>')
})
```

(El test del título pasa ya hoy: el builder check verificó que `index.html` ya lo tiene — lo fija igual.)

- [ ] **Step 2: Verificar el fallo**

Run: `npx vitest run src/components/layout/AppShell.test.tsx`
Expected: FAIL (no hay `img` con `alt="Serbatic"`, no hay «SECURITY»).

- [ ] **Step 3: Implementar**

1. `src/vite-env.d.ts` (nuevo; hoy no existe ningún `.d.ts` en `src/` y `tsconfig.json` no incluye `vite/client`):
```ts
/// <reference types="vite/client" />
```
2. En `AppShell.tsx`: `import logoUrl from '../../../assets/serbatic-logo.png'` (el diseño dice `../../assets/…`, pero desde `src/components/layout/` eso resolvería a `src/assets/`; la profundidad correcta al logo en la raíz del repo es `../../../`). La cabecera queda:

```tsx
<header className="relative z-10 flex items-center justify-between gap-4 px-6 py-4">
  <span className="flex items-center gap-3">
    <img src={logoUrl} alt="Serbatic" className="h-7" />
    <span className="text-sm font-extrabold tracking-[0.25em]">
      <span
        className="text-neon-cyan"
        style={{ textShadow: '0 0 10px rgba(0,229,255,0.8)' }}
      >
        SERBATIC
      </span>{' '}
      <span className="text-ink">SECURITY</span>{' '}
      <span
        className="text-neon-magenta"
        style={{ textShadow: '0 0 10px rgba(255,45,149,0.7)' }}
      >
        INSPECTOR
      </span>
    </span>
  </span>
  {step !== 'home' && (
    <StepIndicator step={step} onGoSource={onGoSource} onGoVulns={onGoVulns} />
  )}
</header>
```

Estilo por palabra (diseño §6): «SERBATIC» cian con glow (como hoy), «SECURITY» `text-ink` (`#f4f4f8`) sin glow, «INSPECTOR» magenta con glow (como hoy).

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/layout/AppShell.test.tsx`
Expected: PASS (los 6 tests del fichero).

- [ ] **Step 5: Comprobación final de la task (una vez)**

Run: `npx vitest run` y `npm run build`
Expected: suite completa verde + build limpio (tsc sin errores: el `vite-env.d.ts` declara los imports de assets).

- [ ] **Step 6: Commit**

```
git add src/
git commit -m "feat(front): marca completa en cabecera (logo + SERBATIC SECURITY INSPECTOR)"
```

---

### Task 2: Navegador de carpetas en modo live (G2)

**Files:**
- Modify: `backend/app/main.py` (imports + endpoint `GET /api/browse`), `src/components/source/SourceScreen.tsx`
- Create: `backend/tests/test_browse.py`, `src/components/source/BrowseModal.tsx`, `src/components/source/BrowseModal.test.tsx`
- Test: `src/components/source/SourceScreen.test.tsx` (3 tests nuevos)

**Interfaces:**
- Produces (backend): `GET /api/browse?path=<opcional>` → 200 `{"path": str, "parent": str | null, "folders": [{"name": str, "path": str, "registered": "local" | "git" | null}]}` | 400. Paths con `as_posix()`. `path` omitido → `Path.home()`.
- Produces (front): `BrowseModal({ open, onClose, onUse }: { open: boolean; onClose: () => void; onUse: (path: string) => void })` y los tipos exportados `BrowseFolder` / `BrowseData` desde `BrowseModal.tsx`.
- Modifica en `SourceScreen`: `submitLocal(pathOverride?: string)`; botón ghost «📂 NAVEGAR»; `<BrowseModal>` en la rama live.

- [ ] **Step 1: Escribir el test backend que falla**

`backend/tests/test_browse.py`:

```python
"""Navegador de carpetas: GET /api/browse (T2 Fase 2b.1)."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT
from app.local_projects import LOCAL
from app.main import app


@pytest.fixture(autouse=True)
def clean_registries():
    LOCAL.clear()
    GIT.clear()
    yield
    LOCAL.clear()
    GIT.clear()


def test_browse_default_home():
    with TestClient(app) as c:
        j = c.get("/api/browse").json()
        assert j["path"] == Path.home().resolve().as_posix()
        assert j["parent"] is not None  # home no es raíz
        assert isinstance(j["folders"], list)


def test_browse_lists_subdirs_sorted_sin_dots_ni_files(tmp_path):
    (tmp_path / "Zeta").mkdir()
    (tmp_path / "alfa").mkdir()
    (tmp_path / ".git").mkdir()
    (tmp_path / "fichero.txt").write_text("x", encoding="utf-8")
    with TestClient(app) as c:
        j = c.get("/api/browse", params={"path": str(tmp_path)}).json()
        assert [f["name"] for f in j["folders"]] == ["alfa", "Zeta"]
        assert all(f["registered"] is None for f in j["folders"])
        assert j["path"] == tmp_path.resolve().as_posix()


def test_browse_400_inexistente_y_no_dir(tmp_path):
    f = tmp_path / "f.txt"
    f.write_text("x", encoding="utf-8")
    with TestClient(app) as c:
        assert c.get("/api/browse", params={"path": str(tmp_path / "noexiste")}).status_code == 400
        assert c.get("/api/browse", params={"path": str(f)}).status_code == 400


def test_browse_parent_nulo_en_raiz():
    with TestClient(app) as c:
        j = c.get("/api/browse", params={"path": "/"}).json()
        assert j["parent"] is None


def test_browse_registered_local_y_git(tmp_path):
    local = tmp_path / "mi app (copia)"  # Review Focus 1: espacios + paréntesis
    local.mkdir()
    (local / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    clone = tmp_path / "clon-repo"
    clone.mkdir()
    (clone / "x.py").write_text("x = 1\n", encoding="utf-8")
    GIT["git-test-abc123"] = clone
    with TestClient(app) as c:
        assert c.post("/api/projects/local", json={"path": str(local)}).status_code == 201
        j = c.get("/api/browse", params={"path": str(tmp_path)}).json()
        reg = {f["name"]: f["registered"] for f in j["folders"]}
        assert reg["mi app (copia)"] == "local"
        assert reg["clon-repo"] == "git"
```

- [ ] **Step 2: Verificar el fallo**

Run (workdir `backend/`): `.\.venv\Scripts\python.exe -m pytest tests/test_browse.py -q`
Expected: FAIL — 404 Not Found (no existe la ruta).

- [ ] **Step 3: Implementar el endpoint**

En `backend/app/main.py`:
- Añadir `import os` (arriba, junto a `import re`).
- Ampliar los imports existentes: `from app.git_projects import GIT, GitCloneError, git_analyze, git_list, register_git` y `from app.local_projects import LOCAL, local_analyze, local_list, register_local, resolve_local`.
- Endpoint (colocarlo tras `add_git_project`, junto al resto de endpoints de proyectos):

```python
def _route_key(p: Path) -> str:
    """Clave de comparación de rutas: normalizada (case-insensitive en Windows)."""
    return os.path.normcase(str(p.resolve()))


@app.get("/api/browse")
def browse(path: str | None = None):
    """Subcarpetas directas de ``path`` (o de home si no se da) para el navegador de carpetas (G2).

    ``def`` a propósito: I/O de disco en threadpool, fuera del event loop.
    Mismo nivel de confianza que ``POST /api/projects/local`` (cualquier ruta local;
    servidor solo localhost, herramienta single-user por diseño).
    """
    try:
        p = (Path(path) if path else Path.home()).expanduser().resolve()
    except OSError:
        raise HTTPException(status_code=400, detail="Ruta no válida")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="La ruta no es una carpeta")
    local_roots = {_route_key(root) for root, _ in LOCAL.values()}
    git_roots = {_route_key(dest) for dest in GIT.values()}
    try:
        entries = sorted(
            (e for e in p.iterdir() if e.is_dir() and not e.name.startswith(".")),
            key=lambda e: e.name.lower(),
        )
    except OSError:
        raise HTTPException(status_code=400, detail="No se pudo leer la carpeta")
    folders = []
    for e in entries:
        k = _route_key(e)
        registered = "local" if k in local_roots else "git" if k in git_roots else None
        folders.append({"name": e.name, "path": e.as_posix(), "registered": registered})
    parent = p.parent
    return {
        "path": p.as_posix(),
        "parent": parent.as_posix() if parent != p else None,
        "folders": folders,
    }
```

- [ ] **Step 4: Verificar que pasa (backend)**

Run (workdir `backend/`): `.\.venv\Scripts\python.exe -m pytest tests/test_browse.py -q`
Expected: PASS (5/5).

- [ ] **Step 5: Escribir los tests front que fallan**

Nuevo `src/components/source/BrowseModal.test.tsx`:

```tsx
import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrowseModal } from './BrowseModal'
import type { BrowseData } from './BrowseModal'

const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

const HOME: BrowseData = {
  path: 'C:/Users/rferrero',
  parent: 'C:/Users',
  folders: [
    { name: 'Documentos', path: 'C:/Users/rferrero/Documentos', registered: null },
    { name: 'mi app (copia)', path: 'C:/Users/rferrero/mi app (copia)', registered: 'local' },
  ],
}

const DOCS: BrowseData = {
  path: 'C:/Users/rferrero/Documentos',
  parent: 'C:/Users/rferrero',
  folders: [
    { name: 'SerbaticSecurityInspector', path: 'C:/Users/rferrero/Documentos/SerbaticSecurityInspector', registered: 'git' },
  ],
}

const mockQueue = (responses: Array<{ status: number; body?: BrowseData }>) => {
  let i = 0
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)]
    return { ok: r.status === 200, status: r.status, json: async () => r.body ?? null }
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

test('al abrir, lista la carpeta home (GET /api/browse sin path) con tag LOCAL', async () => {
  const fn = mockQueue([{ status: 200, body: HOME }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(fn).toHaveBeenCalledWith('/api/browse')
  expect(screen.getByText('Documentos')).toBeInTheDocument()
  expect(screen.getByText('LOCAL')).toBeInTheDocument()
})

test('clic en subcarpeta → GET /api/browse?path=… y lista la nueva carpeta', async () => {
  const fn = mockQueue([
    { status: 200, body: HOME },
    { status: 200, body: DOCS },
  ])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /documentos/i }))
  })
  const lastUrl = String(fn.mock.calls.at(-1)?.[0])
  expect(lastUrl.startsWith('/api/browse?path=')).toBe(true)
  expect(decodeURIComponent(lastUrl.split('path=')[1])).toBe('C:/Users/rferrero/Documentos')
  expect(screen.getByText('SerbaticSecurityInspector')).toBeInTheDocument()
  expect(screen.getByText('GIT')).toBeInTheDocument()
})

test('breadcrumbs: segmentos previos son botones, el último (actual) no', async () => {
  mockQueue([{ status: 200, body: DOCS }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'C:' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'rferrero' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Documentos' })).not.toBeInTheDocument()
})

test('clic en breadcrumb «Users» navega al prefijo', async () => {
  const fn = mockQueue([
    { status: 200, body: DOCS },
    { status: 200, body: HOME },
  ])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Users' }))
  })
  const lastUrl = String(fn.mock.calls.at(-1)?.[0])
  expect(decodeURIComponent(lastUrl.split('path=')[1])).toBe('C:/Users')
})

test('↑ SUBIR navega al parent', async () => {
  const fn = mockQueue([
    { status: 200, body: DOCS },
    { status: 200, body: HOME },
  ])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /subir/i }))
  })
  const lastUrl = String(fn.mock.calls.at(-1)?.[0])
  expect(decodeURIComponent(lastUrl.split('path=')[1])).toBe('C:/Users/rferrero')
})

test('sin parent (raíz) → SUBIR deshabilitado', async () => {
  mockQueue([{ status: 200, body: { ...DOCS, parent: null } }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByRole('button', { name: /subir/i })).toBeDisabled()
})

test('USAR ESTA CARPETA → onUse(path actual)', async () => {
  mockQueue([{ status: 200, body: DOCS }])
  const onUse = vi.fn()
  render(<BrowseModal open onClose={() => {}} onUse={onUse} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /usar esta carpeta/i }))
  })
  expect(onUse).toHaveBeenCalledWith('C:/Users/rferrero/Documentos')
})

test('error 400 del backend → mensaje inline', async () => {
  mockQueue([{ status: 400 }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByText('No se pudo leer la carpeta')).toBeInTheDocument()
})
```

Y 3 tests nuevos al final de `src/components/source/SourceScreen.test.tsx` (usar los helpers ya existentes `liveScreen` y el restore de `fetch`):

```tsx
// --- Task 2 (Fase 2b.1): navegador de carpetas (📂 NAVEGAR) ---
const TARGET = 'C:/Users/rferrero/Documentos/mi app (copia)'

const browseFetch = (
  bodies: Array<{ path: string; parent: string | null; folders: unknown[] }>,
  postStatus = 201,
) => {
  let n = 0
  const fn = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.startsWith('/api/browse')) {
      const body = bodies[Math.min(n++, bodies.length - 1)]
      return { ok: true, status: 200, json: async () => body }
    }
    return { ok: postStatus === 201, status: postStatus, json: async () => ({ project: { id: 'x' } }) }
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

test('modo live: 📂 NAVEGAR abre el navegador (GET /api/browse)', async () => {
  const fn = browseFetch([{ path: 'C:/Users/rferrero', parent: 'C:/Users', folders: [] }])
  liveScreen()
  expect(screen.queryByText('ELEGIR CARPETA')).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /navegar/i }))
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(fn).toHaveBeenCalledWith('/api/browse')
})

test('modo live: USAR ESTA CARPETA rellena el input y registra (201 → onRefresh, input limpio)', async () => {
  const fn = browseFetch([
    { path: 'C:/Users/rferrero/Documentos', parent: 'C:/Users/rferrero',
      folders: [{ name: 'mi app (copia)', path: TARGET, registered: 'local' }] },
    { path: TARGET, parent: 'C:/Users/rferrero/Documentos', folders: [] },
  ])
  const onRefresh = vi.fn().mockResolvedValue(undefined)
  liveScreen({ onRefresh })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /navegar/i })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /mi app \(copia\)/ })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /usar esta carpeta/i })) })
  const localCall = fn.mock.calls.find(c => c[0] === '/api/projects/local')
  expect(localCall?.[1]?.body).toBe(JSON.stringify({ path: TARGET }))
  expect(onRefresh).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Ruta local del proyecto')).toHaveValue('')
})

test('modo live: 400 de registro al usar carpeta del navegador → error inline + input conserva la ruta', async () => {
  browseFetch(
    [
      { path: 'C:/Users/rferrero/Documentos', parent: 'C:/Users/rferrero',
        folders: [{ name: 'mi app (copia)', path: TARGET, registered: null }] },
      { path: TARGET, parent: 'C:/Users/rferrero/Documentos', folders: [] },
    ],
    400,
  )
  liveScreen()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /navegar/i })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /mi app \(copia\)/ })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /usar esta carpeta/i })) })
  expect(screen.getByText('Ruta no válida: debe existir, ser una carpeta y no estar dentro de samples/')).toBeInTheDocument()
  expect(screen.getByLabelText('Ruta local del proyecto')).toHaveValue(TARGET)
})
```

- [ ] **Step 6: Verificar el fallo (front)**

Run: `npx vitest run src/components/source/`
Expected: FAIL (no existe `BrowseModal`; no hay botón NAVEGAR).

- [ ] **Step 7: Implementar `BrowseModal`**

Nuevo `src/components/source/BrowseModal.tsx`. Contrato fijo (todo lo demás es implementación):
- Props: `{ open: boolean; onClose: () => void; onUse: (path: string) => void }`.
- Exporta `interface BrowseFolder { name: string; path: string; registered: 'local' | 'git' | null }` e `interface BrowseData { path: string; parent: string | null; folders: BrowseFolder[] }`.
- Al abrirse (`open` pasa a true) → `navigate(null)`; `navigate(target: string | null)` hace `fetch(target ? \`/api/browse?path=${encodeURIComponent(target)}\` : '/api/browse')` → 200 → guarda el JSON como `BrowseData`; no-200 → error inline «No se pudo leer la carpeta». Estados: `data | null`, `loading` (muestra «CARGANDO…»), `error`.
- Reutiliza `Modal` de `../ui/Modal` con `title="ELEGIR CARPETA"`.
- Fila superior: `NeonButton` ghost «↑ SUBIR» (deshabilitado si `!data?.parent` o `loading`; clic → `navigate(data.parent)`) + **breadcrumbs**: segmentos = `data.path.split('/').filter(Boolean)`; cada segmento salvo el último es un `<button>` con su texto que navega al prefijo `segs.slice(0, i + 1).join('/')` — con la corrección de unidad: si el prefijo es una sola unidad (`/^[A-Za-z]:$/`, p. ej. `C:`) se añade `/` (`C:/`); el último segmento se renderiza como `<span>` (carpeta actual, no clicable). Separador visual `›`.
- Lista de subcarpetas: cada `f` es un `<button>` con su nombre; si `f.registered` no es null, tag a la derecha `font-mono text-[10px] text-neon-cyan` con «LOCAL» o «GIT» (mismo estilo que la lista de proyectos de `SourceScreen`). Clic → `navigate(f.path)`. Si `data.folders` es vacío (y no está cargando): «Sin subcarpetas».
- `footer` del Modal: `NeonButton` ghost «CANCELAR» → `onClose()`; `NeonButton` primary «USAR ESTA CARPETA» (deshabilitado si `!data` o `loading`) → `onUse(data.path)` (el modal no se cierra solo: lo cierra `SourceScreen`).
- Estética: coherente con la app (tipos `font-mono` para rutas, bordes `ink-faint`, hover `neon-cyan`); sin salirse de la paleta.

- [ ] **Step 8: Cablear `SourceScreen` (rama live)**

En `src/components/source/SourceScreen.tsx`:
- Import: `import { BrowseModal } from './BrowseModal'`.
- Nuevo estado: `const [browseOpen, setBrowseOpen] = useState(false)`.
- Refactorizar `submitLocal` para aceptar una ruta explícita (el resto del cuerpo idéntico: misma `POST /api/projects/local`, mismos errores 400/404/red inline, mismo `onRefresh`, mismo borrado del input en 201):
```tsx
const submitLocal = async (pathOverride?: string) => {
  const path = (pathOverride ?? localPath).trim()
  if (!path || localBusy || gitBusy) return
  // … resto idéntico
```
  El botón «AUDITAR RUTA» sigue llamando a `void submitLocal()` (sin argumento).
- En la fila del input de ruta local, entre el `<input>` y «AUDITAR RUTA», añadir:
```tsx
<NeonButton
  variant="ghost"
  disabled={localBusy || gitBusy}
  onClick={() => setBrowseOpen(true)}
>
  📂 NAVEGAR
</NeonButton>
```
- Al final de la rama live (dentro del `<>`), render:
```tsx
<BrowseModal
  open={browseOpen}
  onClose={() => setBrowseOpen(false)}
  onUse={p => {
    setLocalPath(p)
    setBrowseOpen(false)
    void submitLocal(p)
  }}
/>
```

- [ ] **Step 9: Verificar que pasa (front)**

Run: `npx vitest run src/components/source/`
Expected: PASS (todos los tests de `SourceScreen.test.tsx` + `BrowseModal.test.tsx`, incluidos los existentes).

- [ ] **Step 10: Comprobación final de la task (una vez)**

Run: (workdir `backend/`) `.\.venv\Scripts\python.exe -m pytest -q` · (raíz) `npx vitest run` · `npm run build`
Expected: suites completas verde + build limpio.

- [ ] **Step 11: Commit**

```
git add backend/ src/
git commit -m "feat: navegador de carpetas en modo live (GET /api/browse + BrowseModal)"
```

---

### Task 3: PDF para cliente (G3)

**Files:**
- Modify: `backend/app/pdf_report.py` (reescritura del layout), `backend/requirements.txt`
- Test: `backend/tests/test_pdf_report.py`

**Interfaces:**
- Consumes: `assets/serbatic-logo.png`; `SEVERITY_ES` (`app.pipeline`, ya importado); `VULN_NAMES` y `_META_LABELS` (se conservan; `VULN_NAMES` idéntico byte a byte).
- Produces: **firmas públicas invariantes** — `build_scope_pdf(text: str, title: str = "Alcance técnico de mejora") -> bytes` y `build_report_pdf(project_name: str, profile: dict, meta: dict, findings: list[dict], pageCompression: int = 0) -> bytes`. `main.py` no se toca.

- [ ] **Step 1: Añadir la dependencia `pygments`**

- `backend/requirements.txt`: añadir línea `pygments>=2.17` (runtime; `requirements-dev.txt` hace `-r requirements.txt` y la hereda).
- Run (workdir `backend/`): `.\.venv\Scripts\python.exe -m pip install pygments`
- Verificar: `.\.venv\Scripts\python.exe -c "import pygments; print(pygments.__version__)"` → `2.17` o superior.

- [ ] **Step 2: Escribir los tests que fallan**

En `backend/tests/test_pdf_report.py`:

(a) **Actualizar el helper `_scope_content`** (con el logo habrá también el stream de la imagen; hay que localizar el stream de contenido):

```python
def _scope_content(data: bytes) -> bytes:
    """Stream de contenido del scope PDF descomprimido (ahora hay también el stream del logo)."""
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        try:
            raw = zlib.decompress(base64.a85decode(m.group(1), adobe=True))
        except Exception:
            continue
        if b"Tj" in raw:
            return raw
    raise AssertionError("stream de contenido no encontrado")
```

(b) **Añadir tests nuevos** (al final del fichero):

```python
def _drawn_strings(data: bytes) -> bytes:
    """Todas las cadenas dibujadas (operador Tj); en build_report_pdf el contenido va sin comprimir."""
    return b"".join(re.findall(rb"\(((?:[^()\\]|\\.)*)\)\s*Tj", data))


def test_report_pdf_logo_embebido():
    assert b"/Subtype /Image" in build_report_pdf("p", {}, {}, [_finding("A01", 1)])
    assert b"/Subtype /Image" in build_scope_pdf("breve")


def test_report_pdf_51_hallazgos_multipagina():
    findings = [
        _finding(f"A{str(i % 10 + 1).zfill(2)}", i + 1,
                 title=f"Hallazgo de prueba número {i} con texto bastante largo para forzar la paginación")
        for i in range(51)
    ]
    meta = {"files": 162, "lines": 9970, "durationMin": 3.2, "model": "qwen3.8-fp8",
            "totalTokens": 12345, "avgTps": 16.3}
    data = build_report_pdf("dvwa", {"language": "PHP", "frameworks": [], "entry_points": [],
                                      "description": "d"}, meta, findings)
    assert data[:5] == b"%PDF-"
    assert len(re.findall(rb"/Type /Page\b", data)) >= 3


def _rg_colors(data: bytes) -> list[tuple[float, float, float]]:
    return [tuple(map(float, m)) for m in re.findall(rb"([\d.]+) ([\d.]+) ([\d.]+) rg", data)]


def test_report_pdf_barra_leyenda_y_colores_severidad():
    findings = [_finding("A01", i + 1, severity=s)
                for i, s in enumerate(["critical"] * 7 + ["high"] * 25 + ["medium"] * 14 + ["low"] * 5)]
    data = build_report_pdf("dvwa", {}, {}, findings)
    drawn = _drawn_strings(data)
    assert b"7 cr" in drawn      # «7 críticos» (WinAnsi: í = 0xED)
    assert b"25 altos" in drawn
    assert b"14 medios" in drawn
    assert b"5 bajos" in drawn
    got = _rg_colors(data)
    for hx in ("#be185d", "#c2410c", "#a16207", "#0e7490"):
        r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
        assert any(abs(a - r) < 0.01 and abs(bg - g) < 0.01 and abs(c - b) < 0.01
                   for a, bg, c in got), hx


def test_report_pdf_empty_findings_sin_barra():
    data = build_report_pdf("p", {}, {}, [])
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"cr" not in drawn and b"altos" not in drawn   # sin barra ni leyenda


def test_report_pdf_pie_con_numero_y_marca():
    findings = [_finding("A01", 1)] + [
        _finding(f"A{str(i % 10 + 1).zfill(2)}", i + 1, title="título largo " * 5) for i in range(20)
    ]
    data = build_report_pdf("Mi Proyecto", {}, {}, findings)
    drawn = _drawn_strings(data)
    assert b"Serbatic Security Inspector" in drawn   # pie de las páginas 2+
    assert b"P\xe1gina" in drawn                     # «Página N» (WinAnsi: á = 0xE1)


def test_report_pdf_snippet_cjk_por_token():
    """Snippet no-WinAnsi con el dibujado por tokens (T3): «?» por pieza, ASCII intacto."""
    f = _finding("A03", 1, snippet="日本語テスト 日本語 emoji 🚨")
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"
    drawn = _drawn_strings(data)
    assert b"??????" in drawn      # «日本語テスト» (6) → 6 «?»
    assert b"emoji" in drawn       # el ASCII se conserva
    assert b"nnnnnn" not in data   # sin la sustitución silenciosa «n» de reportlab
```

Los tests existentes del fichero se **conservan tal cual** (el CJK antiguo sigue pasando: el título «日本語テスト 🚨» se dibuja como línea de texto normal y produce «?????? ?» contiguo).

- [ ] **Step 3: Verificar el fallo**

Run (workdir `backend/`): `.\.venv\Scripts\python.exe -m pytest tests/test_pdf_report.py -q`
Expected: FAIL (sin `/Subtype /Image`, sin colores `rg`, sin leyenda, sin pie).

- [ ] **Step 4: Implementar el tema claro**

`backend/app/pdf_report.py` — reescribir el layout conservando: el docstring de cabecera (adaptarlo), `VULN_NAMES`, `_META_LABELS`, `_winansi`, `_wrap_lines`, `_MARGIN = 20 * mm`, `_LEADING = 5.2 * mm`, `_TEXT_SIZE = 10`, `_SECTION_SIZE = 12`, `_SNIPPET_FONT = "Courier"`, `_SNIPPET_SIZE = 8`, y las firmas públicas. Cambios:

**Imports nuevos:** `from pathlib import Path`, `from reportlab.lib.colors import HexColor`, `from pygments.lexers import get_lexer_for_filename, TextLexer`, `from pygments.util import ClassNotFound`, `from pygments.token import Token`.

**Constantes del tema (fijas):**

```python
# Tema claro para cliente (G3): legible sobre blanco, imprimible, coherente con la marca.
_TXT = HexColor("#1f2937")
_TXT_SEC = HexColor("#6b7280")
_ACCENT = HexColor("#0891b2")
_SEV: dict[str, HexColor] = {
    "critical": HexColor("#be185d"),
    "high": HexColor("#c2410c"),
    "medium": HexColor("#a16207"),
    "low": HexColor("#0e7490"),
}
_SEV_ORDER = ("critical", "high", "medium", "low")
_SEV_LEGEND: dict[str, str] = {"critical": "críticos", "high": "altos", "medium": "medios", "low": "bajos"}
_BOX_BG = HexColor("#f3f4f6")
_BOX_BORDER = HexColor("#e5e7eb")
_WHITE = HexColor("#ffffff")
_LOGO = Path(__file__).resolve().parents[2] / "assets" / "serbatic-logo.png"
_LOGO_W = 45 * mm
_LOGO_H = 45 * mm * 237 / 757   # ratio 757×237
_CODE_PAD = 3 * mm
_CODE_LINE_H = 4.0 * mm
```

**Resaltado de código (pygments) — algoritmo fijo:**

```python
_TOKEN_COLORS: dict = {
    Token: "#1f2937",                  # texto base
    Token.Comment: "#6b7280",          # comentarios: gris secundario
    Token.Comment.Preproc: "#a16207",  # directivas (#include, etc.)
    Token.Keyword: "#0e7490",          # palabras clave: cian oscuro de marca
    Token.Name.Builtin: "#0e7490",
    Token.Name.Function: "#be185d",    # funciones: magenta oscuro de marca
    Token.Name.Class: "#c2410c",       # clases: naranja quemado
    Token.Literal.String: "#a16207",   # cadenas: ámbar oscuro
    Token.Literal.String.Doc: "#6b7280",
    Token.Literal.Number: "#166534",   # números: verde oscuro
    Token.Operator: "#6b7280",
    Token.Punctuation: "#1f2937",
    Token.Error: "#be185d",
    Token.Generic.Deleted: "#be185d",
    Token.Generic.Inserted: "#166534",
    Token.Generic.Error: "#be185d",
}


def _token_color(ttype) -> str:
    """Color del token: sube por la jerarquía de pygments hasta un color conocido."""
    t = ttype
    while t is not None:
        if t in _TOKEN_COLORS:
            return _TOKEN_COLORS[t]
        t = t.parent
    return _TOKEN_COLORS[Token]


_CODE_WORD_RE = re.compile(r"[^\s]+|\n|[ \t]+")


def _code_lines(c, code: str, file_name: str, max_width: float) -> list[list[tuple[str, str]]]:
    """Tokeniza ``code`` (lexer por extensión del archivo, fallback ``TextLexer``) y agrupa
    las piezas ``(texto, color_hex)`` en líneas que caben en ``max_width``.

    - Cada pieza se sanea a WinAnsi (``_winansi``) antes de medir/dibujar.
    - El ``\\n`` de la pieza rompe la línea forzosamente.
    - Piezas más anchas que la línea: corte duro con la misma búsqueda binaria que ``_wrap_lines``.
    """
    base = _TOKEN_COLORS[Token]
    words: list[tuple[str, str]] = []
    try:
        lexer = get_lexer_for_filename(os.path.basename(file_name), stripnl=False)
    except ClassNotFound:
        lexer = TextLexer(stripnl=False)
    for ttype, value in lexer.get_tokens(code):
        color = _token_color(ttype)
        for m in _CODE_WORD_RE.finditer(value):
            piece = _winansi(m.group(0))
            words.append((piece, base if piece.isspace() else color))
    lines: list[list[tuple[str, str]]] = []
    cur: list[tuple[str, str]] = []
    cur_w = 0.0
    for text, color in words:
        if text == "\n":
            lines.append(cur)
            cur, cur_w = [], 0.0
            continue
        w = c.stringWidth(text, _SNIPPET_FONT, _SNIPPET_SIZE)
        if cur and cur_w + w > max_width:
            lines.append(cur)
            cur, cur_w = [], 0.0
        while w > max_width:  # corte duro de pieza insoslayable
            if cur:  # sin esta guarda, un corte al inicio crearía una línea vacía
                lines.append(cur)
                cur, cur_w = [], 0.0
            lo, hi = 1, len(text)
            while lo < hi:
                mid = (lo + hi + 1) // 2
                if c.stringWidth(text[:mid], _SNIPPET_FONT, _SNIPPET_SIZE) <= max_width:
                    lo = mid
                else:
                    hi = mid - 1
            lines.append([(text[:lo], color)])
            cur, cur_w = [], 0.0
            text = text[lo:]
            w = c.stringWidth(text, _SNIPPET_FONT, _SNIPPET_SIZE)
        cur.append((text, color))
        cur_w += w
    if cur:
        lines.append(cur)
    return lines
```

(Requiere `import os` para `os.path.basename`.)

**Decorado de páginas 2+ (fijo):** antes de crear el canvas, definir el closure:

```python
def _page_deco(cnv, doc) -> None:
    """Páginas 2+: cabecera (título a la izquierda) + pie («Página N» + marca)."""
    w, h = A4
    cnv.saveState()
    cnv.setFont("Helvetica", 8)
    cnv.setFillColor(_TXT_SEC)
    cnv.drawString(_MARGIN, h - 12 * mm, _winansi(f"Informe de auditoría de seguridad — {project_name}"))
    cnv.drawString(_MARGIN, 10 * mm, _winansi(f"Página {cnv.getPageNumber()}"))
    cnv.drawRightString(w - _MARGIN, 10 * mm, "Serbatic Security Inspector")
    cnv.restoreState()
```

Y el canvas: `_canvas.Canvas(buf, pagesize=A4, pageCompression=pageCompression, onLaterPages=_page_deco)` (portada = página 1, sin decorado). La cabecera queda a 12 mm del borde superior y el contenido sigue empezando a 20 mm (`_MARGIN`): no se solapan.

**`build_report_pdf` — secuencia de dibujo (fija):**

- Helper `line(text, font="Helvetica", size=_TEXT_SIZE, color=_TXT)`: como el actual, pero fija `c.setFillColor(color)` (todo el texto pasa por `_winansi`).
- **Portada**, cursor `y` desde `height - _MARGIN`:
  1. Logo: `c.drawImage(str(_LOGO), _MARGIN, y - _LOGO_H, width=_LOGO_W, height=_LOGO_H)`; `y -= _LOGO_H + 10 * mm`.
  2. `line("INFORME DE AUDITORÍA DE SEGURIDAD", font="Helvetica-Bold", size=20)`; `gap(4 * mm)`.
  3. Nombre del proyecto: `line(project_name, size=14, color=_ACCENT)`.
  4. Fecha: `line(date.today().isoformat(), size=10, color=_TXT_SEC)`.
  5. Meta: si hay valores (`_META_LABELS`, solo claves presentes, como hoy) → `n` líneas `"label: value"` en `Helvetica` 10 `_TXT` a `_MARGIN + 3*mm` (baselines desde `y - 2*mm` hacia abajo, separadas `_LEADING`), contenidas en un `rect` con `fill=_BOX_BG` y borde `_BOX_BORDER` (stroke 0.5) con ~2 mm de holgura alrededor; el cursor `y` queda bajo la caja (≈ `y_inicio - n*_LEADING - 4*mm`).
  6. **Barra de distribución** (solo si `findings` no está vacío): `gap(6 * mm)`; barra de 6 mm de altura, `x` desde `_MARGIN`, un segmento por severidad en `_SEV_ORDER` (ancho = `max_width * n / total`, saltando `n == 0`), `c.setFillColor(_SEV[sev])` + `c.rect(x, y - 4 * mm, w, 6 * mm, fill=1, stroke=0)`; luego `y -= 10 * mm` y la **leyenda** en `Helvetica` 10: para cada severidad con `n > 0`, en orden, el bullet «•» (U+2022) en `_SEV[sev]` + `" n plural"` en `_TXT`, separadas por « · » en `_TXT_SEC` (advancing `x` con `stringWidth`; «•» y no «●»: U+25CF no está en WinAnsi).
- **Perfil**: `section_title("PERFIL DEL PROYECTO")` y los campos como hoy (`Lenguaje:`, `Frameworks:`, `Entry points:`, `Descripción:`) vía `line()`.
- `section_title(f"HALLAZGOS ({len(findings)} total)")`; agrupación por categoría en orden canónico A01→A10 (desconocidos al final, como hoy); cabecera de categoría: barra de acento + `f"{vid} · {VULN_NAMES.get(vid, vid).upper()} ({len(cat_findings)})"` en `Helvetica-Bold` 11 `_TXT`.
- **Por hallazgo**:
  - `finding_header(severity, title)`: `gap(2 * mm)`; **badge en línea propia**: `label = SEVERITY_ES.get(severity, (severity or "hallazgo").upper())`, rect de alto 5 mm y ancho `stringWidth(label, "Helvetica-Bold", 8) + 4*mm` relleno `_SEV.get(severity, _TXT_SEC)`, `label` en `Helvetica-Bold` 8 `_WHITE` (x + 2 mm); `y -= 5 * mm`; título en `Helvetica-Bold` 10 `_TXT` envuelto a `max_width` (una `line()` en negrita).
  - `line(f"Ubicación: {file[:line]}", font="Courier", size=8, color=_TXT_SEC)` (composición de `file`/`line` como hoy).
  - Si hay `snippet`: `code_box(snippet, file)`.
  - `labeled_field("EXPLOIT:", ...)` / `("CONSECUENCIAS:", ...)` / `("SOLUCIÓN:", ...)` (solo si existen): label en `Helvetica-Bold` 9 `_ACCENT` en línea propia, texto debajo envuelto en `Helvetica` 10 `_TXT`.
  - Si hay `alsoCategories`: `line(f"También reportado como: …", size=9, color=_TXT_SEC)`.
- **`section_title(t)`**: `gap(8 * mm)` (+page-break si falta sitio); barra de acento `rect(_MARGIN, y - 4.5*mm, 2*mm, 5.5*mm)` relleno `_ACCENT`; texto a `_MARGIN + 5*mm` en `Helvetica-Bold` 12 `_TXT`; `y -= 8*mm`. **`category_title`**: mismo patrón con `gap(4*mm)`, barra 2×4.5 mm, texto `Helvetica-Bold` 11, `y -= 7*mm`.
- **`code_box(code, file_name)`** (solo si `code.strip()`): `clines = _code_lines(c, code, file_name, max_width - 2*_CODE_PAD)`. Si el bloque entero cabe en la página actual (`len(clines)*_CODE_LINE_H + 2*_CODE_PAD <= y - _MARGIN`), dibujar antes la caja completa (`rect` con `fill=_BOX_BG` + borde `_BOX_BORDER` stroke 0.5); después, **por línea**: page-break si `y < _MARGIN + _CODE_PAD + _CODE_LINE_H`; rect de fondo por línea (`fill=_BOX_BG`, sin borde) para que un bloque que pagina se vea como caja continua; texto de la línea: `x` desde `_MARGIN + _CODE_PAD`, cada pieza `drawString(x, y, texto)` con `setFillColor(HexColor(color))` y `Courier` 8, advancing `x += stringWidth`; `y -= _CODE_LINE_H`.

**`build_scope_pdf` (mismo tema claro, fijo):** canvas A4 (compresión por defecto, como hoy); `y = height - _MARGIN`; logo a la izquierda (mismo `_LOGO_W/_LOGO_H`); `y -= _LOGO_H + 12*mm`; barra de acento `_ACCENT` 2×5.5 mm + título `Helvetica-Bold` 14 `_TXT` a `_MARGIN + 5*mm`; `y -= 10*mm`; texto envuelto en `Helvetica` 10 `_TXT` con paginación (mismo bucle que hoy). Sin barra de severidades ni código.

- [ ] **Step 5: Verificar que pasa**

Run (workdir `backend/`): `.\.venv\Scripts\python.exe -m pytest tests/test_pdf_report.py -q`
Expected: PASS (todos: los existentes + los nuevos).

- [ ] **Step 6: Comprobación final de la task (una vez)**

Run (workdir `backend/`): `.\.venv\Scripts\python.exe -m pytest -q`
Expected: suite completa backend verde (incluye el gate de ground truth con LLM real — puede tardar ~1 min).

- [ ] **Step 7: Commit**

```
git add backend/
git commit -m "feat(backend): PDF para cliente (tema claro, logo, severidades en color, pygments, barra, paginación)"
```

---

### Task 4: Arranque/parada 1-comando (G4)

**Files:**
- Create: `scripts/start-all.ps1`, `scripts/stop-all.ps1`
- Modify: `.gitignore` (añadir `.tmp/`), `README.md` (sección «Quickstart»)

**Interfaces:**
- Produces: `.\scripts\start-all.ps1` → backend :8000 + front :5173 + miniapp :3000 (los que no estén ya), con logs en `.tmp/logs/`; `.\scripts\stop-all.ps1` → mata los PIDs que escuchan en esos 3 puertos. Sin dependencias nuevas (PowerShell 5.1 estándar).

> Sin tests unitarios (no hay harness para `.ps1`): la verificación es la ejecución manual de los pasos 5–6, con resultados comprobables (puertos).

- [ ] **Step 1: `.gitignore`**

Añadir al final:
```
# logs de los scripts de arranque
.tmp/
```

- [ ] **Step 2: `scripts/start-all.ps1`**

```powershell
# Arranca las 3 apps de Serbatic Security Inspector:
#   backend :8000 · front :5173 · miniapp demo :3000
# Uso: .\scripts\start-all.ps1   (parar con .\scripts\stop-all.ps1)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\.tmp\logs" | Out-Null

function Test-Port([int]$Port) {
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-App([string]$Name, [int]$Port, [string]$File, [string[]]$Args, [string]$Workdir) {
    if (Test-Port $Port) {
        Write-Host "$Name  ⚠ :$Port ya está escuchando (se omite)"
        return
    }
    Start-Process -FilePath $File -ArgumentList $Args -WorkingDirectory $Workdir -WindowStyle Hidden `
        -RedirectStandardOutput "$root\.tmp\logs\$Name.log" `
        -RedirectStandardError "$root\.tmp\logs\$Name.err.log"
    Write-Host "$Name  ✓ :$Port  (log: .tmp\logs\$Name.log)"
}

Start-App 'backend' 8000 "$root\backend\.venv\Scripts\python.exe" @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') "$root\backend"
Start-App 'front'   5173 'npm.cmd' @('run','dev') $root
Start-App 'miniapp' 3000 'npm.cmd' @('start') "$root\samples\miniapp"

Write-Host 'Listo: backend :8000 · front http://localhost:5173 · demo http://localhost:3000'
Write-Host 'Para las 3 apps: .\scripts\stop-all.ps1'
```

- [ ] **Step 3: `scripts/stop-all.ps1`**

```powershell
# Para las 3 apps matando los procesos que escuchan en sus puertos (8000, 5173, 3000).
foreach ($port in 8000, 5173, 3000) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($null -eq $conns) {
        Write-Host ":$port  libre (nada que matar)"
        continue
    }
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Write-Host ":$port  matado (PID $p)"
    }
}
Write-Host 'Todo parado.'
```

- [ ] **Step 4: `README.md` — quickstart a 1 terminal**

Reescribir la sección «Quickstart (3 terminales)» como «Quickstart (1 terminal)»:
- Mantener antes de todo el **setup de primera vez** (crear venv + `pip install -r requirements-dev.txt`, crear `backend/.env`, `npm install` raíz y en `samples/miniapp`) — ese bloque actual se conserva.
- Sustituir los tres bloques «1. Backend / 2. Frontend / 3. Opcional» por:

```bash
.\scripts\start-all.ps1     # arranca backend :8000 + front :5173 + miniapp :3000 (los que no estén)
.\scripts\stop-all.ps1      # para las 3 (mata por puerto)
```

- Bajar el modo manual antiguo a un subapartado «Opción avanzada: 3 terminales» con los comandos de hoy (uvicorn / `npm run dev` / `npm --prefix samples/miniapp start`).
- El resto del README no se toca.

- [ ] **Step 5: Verificación manual (start)**

1. Run: `.\scripts\start-all.ps1`
   Expected: 3 líneas `✓` (o `⚠ … ya está escuchando` si algo estaba arriba) + línea «Listo: …».
2. Esperar ~15 s. Run: `netstat -ano | findstr LISTENING | findstr ":8000 :5173 :3000"`
   Expected: los 3 puertos en LISTENING.
3. Run: `Get-ChildItem .tmp\logs | Select-Object Name, Length`
   Expected: `backend.log`, `front.log`, `miniapp.log` con tamaño > 0 (y `.err.log`).
4. Run: `curl.exe -s http://localhost:8000/api/health`
   Expected: `{"status":"ok"}`.

- [ ] **Step 6: Verificación manual (rearranque con puerto ocupado + stop)**

1. Run otra vez: `.\scripts\start-all.ps1`
   Expected: las 3 líneas `⚠ … ya está escuchando (se omite)`; **no** se mata ningún proceso previo (los PIDs de los listeners del paso 5 siguen siendo los mismos: comprobar con `netstat -ano`).
2. Run: `.\scripts\stop-all.ps1`
   Expected: 3 líneas `matado (PID …)`.
3. Run: `netstat -ano | findstr LISTENING | findstr ":8000 :5173 :3000"`
   Expected: sin resultados (los 3 puertos libres).

- [ ] **Step 7: Commit**

```
git add scripts/ .gitignore README.md
git commit -m "chore: arranque/parada 1-comando (scripts/start-all.ps1 + stop-all.ps1) + README"
```

---

### Task 5: Cierre — E2E real + final review + tag `v0.3.1`

> Task de integración (sin TDD unitario): ejecuta el flujo completo con LLM real y cierra la fase.
> **G5** ya está resuelto en el handoff (poller = CLI de OpenCode; ruling: **sin mover el puerto**); aquí solo se reconfirma durante el E2E.

**Files:**
- Modify: `PROGRESS.md` (cierre de fase + QA pendiente), `README.md` (solo si la final review lo exige)
- (El informe del E2E se genera en `.tmp/`, gitignored)

- [ ] **Step 1: Arrancar todo con los scripts (G4 en producción)**

Run: `.\scripts\start-all.ps1` → Expected: 3 `✓` y puertos arriba (revisar con `netstat`).
Con uvicorn corriendo: `netstat -ano | findstr :8000` → documentar en el report de la task que las conexiones ESTABLISHED con polling `GET /health` + `GET /v1/models 404` son el CLI de OpenCode (ruling G5 confirmado, sin mover el puerto).

- [ ] **Step 2: E2E real del navegador de carpetas por la API (misma secuencia que la UI)**

1. Crear una carpeta real **con espacios** y código:
   ```
   $d = Join-Path $env:TEMP "serbatic-e2e\mi app (e2e)"; New-Item -ItemType Directory -Force $d | Out-Null
   Set-Content "$d\app.js" "const x = eval(req.body.q); console.log('hi');"
   Set-Content "$d\server.js" "app.get('/u', (req,res)=>res.send(`<img src=` + req.query.s));"
   ```
2. Navegar como haría el modal (paso a paso, p. ej. con `curl.exe -s`):
   - `GET http://localhost:8000/api/browse` → 200, `path` = home.
   - `GET http://localhost:8000/api/browse?path=<parent de $d>` (URL-encoded) → la respuesta incluye `{"name": "mi app (e2e)", "registered": null}`.
3. Registrar: `POST /api/projects/local` con `{"path": "<as_posix de $d>"}` → **201** (Review Focus 1).
4. Analizar: `POST /api/analyze` con el `projectId` y las 10 `vulnIds` → 202 → drenar el SSE (`GET /api/runs/{id}/events`) hasta un evento terminal.
   Expected: `run:done` con **≥ 1 hallazgo** (el LLM real debe anclar al menos uno de los patrones sembrados; si da 0, repetir una vez — con 2 archivos tan pequeños el run dura ~30–60 s).
5. Volver a `GET /api/browse?path=<parent de $d>` → ahora `registered` de `mi app (e2e)` = `"local"` (el registro se refleja en el navegador).

- [ ] **Step 3: Informe PDF nuevo desde el run real (G3 en producción)**

1. Con el `profile`, la `meta` y los `findings` del `run:done`, `POST /api/reports/full-pdf` → guardar en `.tmp/informe-e2e.pdf`.
2. Comprobaciones por bytes (p. ej. con el python del venv):
   - empieza por `%PDF-`; contiene `/Subtype /Image` (logo);
   - contiene los 4 colores de severidad (`rg` con tolerancia, como el test de T3);
   - contiene `P\xe1gina` y `Serbatic Security Inspector` (pie de páginas 2+, si hay más de una página).
3. Abrir `.tmp/informe-e2e.pdf` en el visor y **comprobar visualmente**: portada clara con logo + barra + leyenda; hallazgos con badge en color, ubicación monospace, snippet con colores; anotar cualquier desajuste (se corrige en la fix wave si la final review lo pide).
4. Dejar el PDF en `.tmp/` para la QA visual del usuario (no se commitea).

- [ ] **Step 4: Parar todo**

Run: `.\scripts\stop-all.ps1` → Expected: 3 `matado (PID …)` y puertos libres (revisar con `netstat`).

- [ ] **Step 5: Suites completas finales (una vez)**

- (workdir `backend/`) `.\.venv\Scripts\python.exe -m pytest -q` → todo verde (incluye gate LLM real miniapp 10/10).
- (raíz) `npx vitest run` → todo verde.
- (raíz) `npm run build` → limpio.

- [ ] **Step 6: Final review de rama desde `v0.3.0`**

Subagente **fresco** (`aitana/qwen3.8-fp8`): revisar `git diff v0.3.0..HEAD` contra el diseño + este plan + la lista **Review Focus** de arriba; comprobar en especial: sin keys en el diff, `.env`/`.tmp`/`workspace` fuera de git, contrato SSE y shape de findings intactos, modo mock intacto (sin backend → demo), `VULN_NAMES` byte-idéntico a `src/data/owasp.ts`.
- Si el veredicto es «with fixes»: **fix wave** en 1 commit (`fix: …` con los cambios), re-ejecutar las suites afectadas y re-revisar solo los fixes.

- [ ] **Step 7: Cierre y tag**

1. `PROGRESS.md`: marcar la Fase 2b.1 completa (10/… → 5/5 tasks), «Tarea en curso: ninguna», «Siguiente: Fase 2c», actualizar «Estado actual» y el «Registro de decisiones» (rulings nuevos, p. ej. la leyenda «•» por WinAnsi, el import `../../../assets/…` corregido del diseño); añadir a «QA visual pendiente» los puntos nuevos para el usuario:
   - **R11** (G1): cabecera con logo + «SERBATIC SECURITY INSPECTOR» en todas las pantallas (mock y live) + pestaña con el título completo.
   - **R12** (G2): en modo live, «📂 NAVEGAR» → navegar con clics (breadcrumbs, SUBIR, tags LOCAL/GIT) hasta una carpeta real con espacios y auditarla sin teclear la ruta; la entrada manual sigue funcionando.
   - **R13** (G3): «INFORME PDF ▸» en modo live → PDF claro: portada con logo + barra + leyenda, badges de severidad en color, código coloreado, cabecera/pie con nº de página; imprimible.
2. Run: `git tag v0.3.1` (sobre el commit final de la fase).
3. **Push único del coordinador**: `git push origin main; git push origin v0.3.1`.

- [ ] **Step 8: Commit de cierre (bookkeeping)**

```
git add PROGRESS.md
git commit -m "docs: cierre Fase 2b.1 (PROGRESS + QA pendiente; E2E real + tag v0.3.1)"
```

(El push de este commit + el tag se hace junto con el del paso 3 si aún no se ha hecho.)

---

## Notas de ejecución (para el coordinador)

- **Orden estricto T1→T5**, una task a la vez; cada task: implementer (subagente `aitana/qwen3.8-fp8`) + reviewer fresco; 1 commit por task (fix rounds amendados); **push solo del coordinador** tras cada review (pauta 2026-11-21).
- **Comprobaciones reducidas**: rojo→verde solo del test de la task; suite completa + build UNA vez al final de cada task (los steps de comprobación final de cada task ya lo fijan).
- T4 no tiene tests unitarios: su «rojo→verde» es la verificación manual de los pasos 5–6 (puertos).
- T5 consume LLM real (E2E + gate): presuponer ~5–10 min de llamadas al endpoint; si el gateway responde 504, reintentar (misma limitación documentada de la 2a/2b).
