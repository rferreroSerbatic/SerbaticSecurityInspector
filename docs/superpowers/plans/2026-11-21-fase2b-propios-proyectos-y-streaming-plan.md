# Fase 2b — Tus propios proyectos (ruta local + git) + streaming LLM: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer la herramienta útil con proyectos reales: auditar **cualquier carpeta local** (ruta que el backend escanea del disco) y **cualquier repo git público** (clonado a un workspace gitignored); quitar el techo de ~60 s del gateway con **streaming SSE** en el cliente LLM; añadir un **informe PDF completo** (portada + perfil + hallazgos); **cancel robusto** que aborta las llamadas LLM en vuelo; **desduplicación** de hallazgos entre categorías; y triage de los **minors diferidos** de la 2a.

**Architecture:** Backend: dos módulos nuevos — `local_projects.py` (ruta → registry en memoria) y `git_projects.py` (URL → `git clone --depth 1` a `workspace/repos/<slug>/`, registry en memoria) — que alimentan el flujo existente `scan_project` + `ProjectInfo` (nuevo campo `kind: 'sample'|'local'|'git'`). `POST /api/projects/local` y `POST /api/projects/git` registran y devuelven `ProjectInfo`; `GET /api/projects` une samples + locales + git; `POST /api/analyze` resuelve de los tres. `LLMClient.chat()` mantiene su firma pero **streama internamente** (`stream: true`, `stream_options: {"include_usage": true}`), acumulando `delta.content` y tomando `usage` del último chunk. `RunState` guarda su `asyncio.Task`; cancel/supersede hacen `task.cancel()` y el pipeline captura `CancelledError` (emite `run:cancelled` + `CANCELLED` + re-lanza). `pipeline` añade `_consolidate()` (dedup por `file:line`, campo `alsoCategories`). `pdf_report` añade `build_report_pdf()` multi-página. Frontend: la SourceScreen live gana un bloque «AUDITAR UN PROYECTO PROPIO» (ruta local + URL git); SummaryScreen un botón «INFORME PDF ▸»; FindingCard un tag `+N` de duplicados; App guarda el `profile` de `profile:done` y cae a mock con `projects: []`.

**Tech Stack:** Python 3.12 (venv `backend/.venv`), FastAPI, httpx (streaming nativo, sin deps nuevas), reportlab, pytest. Frontend: Vite 5 + React 18 + TS strict + Vitest (sin deps nuevas). `git` 2.56 en PATH (verificado). LLM: endpoint OpenAI-compatible **con streaming SSE** — el streaming contra `aitana.serbatic.es` **se verifica con el spike de la T3 paso 0** (ruling Q1 del builder check; hasta entonces es hipótesis).

**Spec:** `docs/superpowers/specs/2026-11-21-fase2b-propios-proyectos-y-streaming-design.md` (leer antes de ejecutar; incluye los rulings Q1–Q3 del builder check en §10).

## Global Constraints

- Windows + PowerShell 5.1: separador `;` (nunca `&&`). Python: siempre `backend\.venv\Scripts\python.exe` (sin `Activate.ps1`). Comandos `pytest` con working dir `backend/`. Node v26.13.1.
- API key: solo en `backend/.env` (gitignored). Nunca en código, front, git ni reports.
- Toda llamada LLM: `temperature: 0`, `max_tokens: 8000`, timeout de cliente 180 s, `chat_template_kwargs: {"enable_thinking": false}`. **Desde esta fase:** `stream: true` + `stream_options: {"include_usage": true}` (T3).
- Guardas de escaneo inmutadas: archivo > 200 000 bytes se omite; `MAX_TOTAL_CHARS = 600_000` → `run:error`.
- `workspace/` ya está gitignored (commit `7e31c41`). Los clones van a `workspace/repos/<slug>/`.
- Copy de UI en español. Sin nuevas librerías de front. Sin router ni librería de estado.
- TDD estricto: rojo→verde solo del test de la task; al final de la task UNA vez: backend → `pytest -q` (workdir `backend/`); frontend → `npx vitest run` + `npm run build`.
- Commits: convencionales, **uno por task** (amendar con los fix rounds de review; push único al terminar la task).
- Contrato SSE inmutable: `data: {json}\n\n`, json = `{"type", "t": <float>, ...payload}`. Eventos terminales: `run:done` / `run:error` / `run:cancelled`.
- Shape de `findings`: `{id: "{vulnId}-{n}" (1-based por categoría), vulnId, severity, title, file, line, snippet, exploit, consequences, solution}`; desde T5, opcional `alsoCategories: string[]`.
- `ProjectInfo` (backend `app/projects.py`): nuevo campo `kind: str = "sample"` (T1). Frontend `ProjectInfo` (`src/types.ts`): `kind?: 'sample' | 'local' | 'git'` (T7).
- Registros en memoria, sin persistencia (Fase 3). El servidor escucha solo en localhost: que el backend lea el disco del usuario es **diseño** (herramienta local single-user).
- Sin emojis en el PDF (reportlab usa WinAnsi, que no los cubre).
- Patrón de tests backend: `monkeypatch.setenv("SAMPLES_DIR", ...)` (los settings se leen por petición), fixture autouse que limpia los globales (RUNS, y desde T1/T2 también LOCAL/GIT), helper `drain_events(client, run_id)` (en `test_runs_api.py`).
- Sin imports cruzados entre test files (M7): cada test file de API tiene su propio fake LLM local (~15 líneas).

## Review Focus

1. **Rutas locales con espacios/Unicode** (p. ej. `C:\Users\rferrero\Documents\mi app (copia)`) → registrar y analizar funciona. → tests T1.
2. **Variantes de URL git**: sin scheme (`github.com/u/r`), sufijo `.git`, `/` final → se normalizan al mismo clon; `ftp://`, `git@`, sin host → 400. → tests T2.
3. **Doble registro del mismo repo git** → reutiliza el clon (exactamente un `git clone`); la raíz exacta del clon como ruta local → 400. → tests T2.
4. **Rarezas del streaming**: chunk con `choices: []` (el de `usage`), `delta: {}` + `finish_reason: "stop"`, stream truncado sin `[DONE]` → no crash; acumula bien. → tests T3.
5. **Informe PDF con snippet de 5000 chars sin espacios + texto acentuado** → sin crash, paginado, `%PDF-` válido. → tests T6.

---

### Task 1: Proyecto por ruta local (`POST /api/projects/local`)

**Files:**
- Create: `backend/app/local_projects.py`, `backend/tests/test_local_projects.py`
- Modify: `backend/app/projects.py` (`ProjectInfo.kind`), `backend/app/main.py`

**Interfaces:**
- Consumes: `scan_project(root, scope)` (`app.scanner`); `load_settings().samples_dir` (`app.config`, env `SAMPLES_DIR`); `ProjectInfo` (`app.projects`).
- Produces (`app/local_projects.py`):
  - `LOCAL: dict[str, tuple[Path, list[str]]]` — registry en módulo: id → (root, scope).
  - `resolve_local(path: str) -> Path | None` — `Path(path).expanduser().resolve()`; debe ser directorio; **no** dentro de `SAMPLES_DIR`; (T2 añade: ni la raíz exacta de un clon git listado).
  - `register_local(path: str) -> ProjectInfo | None` — None si inválida o sin archivos de código; id `local-<slug>-<md5(path)[:6]>`; name = nombre de carpeta; `kind="local"`.
  - `local_list() -> list[ProjectInfo]` — re-escanea el registry (orden de registro).
  - `local_analyze(project_id: str) -> tuple[ProjectInfo, ScanResult] | None` — scan bajo demanda (patrón `get_project`).
- API: `GET /api/projects` = samples + locales; `POST /api/projects/local` `{path}` → 201 `{project}` | 400 inválida | 404 sin código; `POST /api/analyze` resuelve locales primero.

- [ ] **Step 1: Añadir `kind` a `ProjectInfo`**

En `backend/app/projects.py`, al dataclass:
```python
@dataclass
class ProjectInfo:
    id: str
    name: str
    path: str
    files: int
    lines: int
    kind: str = "sample"
```
(`_info` no cambia → los samples quedan `kind="sample"` por default.)

- [ ] **Step 2: Escribir el test que falla**

`backend/tests/test_local_projects.py`:
```python
"""Proyectos por ruta local: registro, listing y análisis (T1 Fase 2b)."""
import json
import re

import pytest
from fastapi.testclient import TestClient

from app.llm import ChatResult
from app.local_projects import LOCAL
from app.main import RUNS, app


def _finding(file="a.js", line=1):
    return {"severity": "high", "title": "ruta sin autorización", "file": file, "line": line,
            "snippet": "s", "exploit": "e", "consequences": "c", "solution": "s"}


class FakeLocalLLM:
    """Fake autocontenido (patrón M7): 1 hallazgo válido para a.js + perfil."""
    model = "qwen3.8-fp8"

    async def chat(self, system, user, max_tokens=8000):
        if "perfilador" in system:
            prof = {"name": "p", "language": "JavaScript", "frameworks": [],
                    "entry_points": [], "description": "p", "notes": ""}
            return ChatResult(content=json.dumps(prof), prompt_tokens=100,
                              completion_tokens=10, elapsed_s=0.1)
        return ChatResult(content=json.dumps([_finding()]), prompt_tokens=100,
                          completion_tokens=5, elapsed_s=0.2)

    async def close(self):
        pass


@pytest.fixture(autouse=True)
def clean_registries():
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    yield
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()


@pytest.fixture
def env_dirs(tmp_path, monkeypatch):
    samples = tmp_path / "samples"
    (samples / "miniapp").mkdir(parents=True)
    (samples / "miniapp" / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    monkeypatch.setenv("SAMPLES_DIR", str(samples))
    return tmp_path


def _drain(client, run_id):
    events = []
    with client.stream("GET", f"/api/runs/{run_id}/events") as r:
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


def test_register_local_and_list(env_dirs):
    code = env_dirs / "mi app (copia)"  # espacios + paréntesis (Review Focus 1)
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        r = c.post("/api/projects/local", json={"path": str(code)})
        assert r.status_code == 201
        p = r.json()["project"]
        assert p["kind"] == "local" and p["name"] == "mi app (copia)"
        assert p["files"] >= 1
        assert p["id"] in [x["id"] for x in c.get("/api/projects").json()]


def test_invalid_paths_400(env_dirs):
    with TestClient(app) as c:
        assert c.post("/api/projects/local", json={"path": "C:/no/existe"}).status_code == 400
        assert c.post("/api/projects/local", json={"path": str(env_dirs / "samples")}).status_code == 400
        assert c.post("/api/projects/local",
                      json={"path": str(env_dirs / "samples" / "miniapp")}).status_code == 400


def test_no_code_files_404(env_dirs):
    empty = env_dirs / "vacio"
    empty.mkdir()
    (empty / "leeme.txt").write_text("hola\n", encoding="utf-8")
    with TestClient(app) as c:
        assert c.post("/api/projects/local", json={"path": str(empty)}).status_code == 404


def test_analyze_local_project(env_dirs, monkeypatch):
    monkeypatch.setattr("app.main.build_llm", lambda: FakeLocalLLM())
    code = env_dirs / "miproy"
    code.mkdir()
    (code / "a.js").write_text("const a = 1;\n", encoding="utf-8")
    with TestClient(app) as c:
        pid = c.post("/api/projects/local", json={"path": str(code)}).json()["project"]["id"]
        r = c.post("/api/analyze", json={"projectId": pid, "vulnIds": ["A01"]})
        assert r.status_code == 202
        ev = _drain(c, r.json()["runId"])
        assert ev[0]["type"] == "run:start" and ev[-1]["type"] == "run:done"
        assert len(ev[-1]["findings"]) == 1
```

Nota: el fake imita la detección de `FakeVulnLLM` de `test_pipeline.py` («perfilador» en system → perfil; si no, la categoría del prompt) para que `run_profile` y `build_vuln_prompt` se comporten igual.

- [ ] **Step 3: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_local_projects.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.local_projects'`.

- [ ] **Step 4: Implementar `backend/app/local_projects.py`**

```python
"""Proyectos por ruta local: registro en memoria del scan de una carpeta del usuario."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from app.config import load_settings
from app.projects import ProjectInfo
from app.scanner import ScanResult, scan_project

LOCAL: dict[str, tuple[Path, list[str]]] = {}


def resolve_local(path: str) -> Path | None:
    """Valida la ruta: debe existir, ser directorio y no estar dentro de SAMPLES_DIR."""
    try:
        p = Path(path).expanduser().resolve()
    except OSError:
        return None
    if not p.is_dir():
        return None
    samples = load_settings().samples_dir.resolve()
    if p == samples or samples in p.parents:
        return None
    return p


def _id_for(p: Path) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", p.name.lower()).strip("-") or "proj"
    return f"local-{slug}-{hashlib.md5(str(p).encode()).hexdigest()[:6]}"


def _info(p: Path, pid: str, scan: ScanResult) -> ProjectInfo:
    return ProjectInfo(
        id=pid, name=p.name, path=p.as_posix(),
        files=len(scan.files), lines=sum(f.lines for f in scan.files), kind="local",
    )


def register_local(path: str) -> ProjectInfo | None:
    p = resolve_local(path)
    if p is None:
        return None
    scan = scan_project(p, ["."])
    if not scan.files:
        return None
    pid = _id_for(p)
    LOCAL[pid] = (p, ["."])
    return _info(p, pid, scan)


def local_list() -> list[ProjectInfo]:
    out: list[ProjectInfo] = []
    for pid, (root, scope) in list(LOCAL.items()):
        if not root.is_dir():
            del LOCAL[pid]
            continue
        scan = scan_project(root, scope)
        if not scan.files:
            del LOCAL[pid]
            continue
        out.append(_info(root, pid, scan))
    return out


def local_analyze(project_id: str) -> tuple[ProjectInfo, ScanResult] | None:
    entry = LOCAL.get(project_id)
    if entry is None:
        return None
    root, scope = entry
    scan = scan_project(root, scope)
    if not scan.files:
        return None
    return _info(root, project_id, scan), scan
```

- [ ] **Step 5: Cablear `main.py`**

Imports:
```python
from app.local_projects import local_analyze, local_list, register_local, resolve_local
```
`GET /api/projects`:
```python
@app.get("/api/projects")
def get_projects():
    return list_projects(load_settings().samples_dir) + local_list()
```
Endpoint nuevo:
```python
class LocalProjectBody(BaseModel):
    path: str


@app.post("/api/projects/local", status_code=201)
def add_local_project(body: LocalProjectBody):
    if resolve_local(body.path) is None:
        raise HTTPException(status_code=400,
                            detail="Ruta no válida: debe existir, ser una carpeta y no estar dentro de samples/")
    info = register_local(body.path)
    if info is None:
        raise HTTPException(status_code=404, detail="Sin archivos de código en esa ruta")
    return {"project": info}
```
`analyze`: la línea `got = get_project(...)` pasa a:
```python
    got = local_analyze(body.projectId) or get_project(settings.samples_dir, body.projectId)
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_local_projects.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Comprobación final de la task + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde.
```powershell
git add backend/
git commit -m "feat(backend): proyectos por ruta local (POST /api/projects/local)"
git push
```

---

### Task 2: Proyecto por repo git (`POST /api/projects/git`)

**Files:**
- Create: `backend/app/git_projects.py`, `backend/tests/test_git_projects.py`
- Modify: `backend/app/main.py`, `backend/app/local_projects.py` (guard de raíz de clon)

**Interfaces:**
- Consumes: `scan_project`, `ProjectInfo`, `resolve_local` (T1).
- Produces (`app/git_projects.py`):
  - `WORKSPACE: Path` = raíz del repo / "workspace" (nivel de módulo, monkeypatcheable en tests).
  - `GIT: dict[str, Path]` — registry: id → raíz del clon.
  - `class GitCloneError(Exception)`.
  - `normalize_git_url(url: str) -> str | None` — solo http(s); sin scheme → antepone `https://`; `git@`, otros schemes, sin host o sin path → `None`. Sufijo `.git` y `/` final se toleran.
  - `git_slug(url: str) -> str` — `<host>-<path>` (puerto → `_`, `.git` eliminado, lowercase, no-alnum → `-`). Ej.: `https://github.com/digininja/DVWA` → `github.com-digininja-dvwa`.
  - `_git_clone(url: str, dest: Path) -> None` — `subprocess.run(["git", "clone", "--depth", "1", url, str(dest)], timeout=120, capture_output=True, text=True)`; rc ≠ 0 o sin git → `GitCloneError` (con `stderr[-200:]`).
  - `register_git(url: str) -> ProjectInfo` — normaliza (None → `ValueError`); si `dest` existe → reutiliza (no reclona); si no, `_git_clone`; scan `["."]`; id `git-<slug>`; `kind="git"`; `GIT[pid] = dest`.
  - `git_list() -> list[ProjectInfo]`, `git_analyze(project_id) -> tuple[ProjectInfo, ScanResult] | None`.
- API: `POST /api/projects/git` `{url}` → 201 `{project}` | 400 URL inválida | 502 fallo de clon. `GET /api/projects` añade git. `analyze` resuelve también git.
- `resolve_local` se extiende para rechazar la raíz exacta de un clon listado (doble registro → 400); **subcarpetas** del clon sí se permiten (ruling Q3: vía de escape para repos grandes).

- [ ] **Step 1: Escribir el test que falla**

`backend/tests/test_git_projects.py`:
```python
"""Proyectos por repo git: normalización, slug, clonado (mock) y registro (T2 Fase 2b)."""
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.git_projects import GIT, git_slug, normalize_git_url
from app.local_projects import LOCAL
from app.main import RUNS, app


@pytest.fixture(autouse=True)
def clean_registries(monkeypatch, tmp_path):
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()
    monkeypatch.setattr("app.git_projects.WORKSPACE", tmp_path / "workspace")
    samples = tmp_path / "samples"
    samples.mkdir()
    monkeypatch.setenv("SAMPLES_DIR", str(samples))
    yield
    RUNS.active = None
    RUNS.runs.clear()
    LOCAL.clear()
    GIT.clear()


@pytest.fixture
def seed_repo(tmp_path):
    seed = tmp_path / "seed"
    seed.mkdir()
    (seed / "a.js").write_text("console.log(1);\n", encoding="utf-8")
    (seed / "src").mkdir()
    (seed / "src" / "app.js").write_text("const x = 1;\n", encoding="utf-8")
    return seed


def test_normalize_git_url():
    assert normalize_git_url("github.com/u/r") == "https://github.com/u/r"
    assert normalize_git_url("https://github.com/u/r.git/") == "https://github.com/u/r.git/"
    assert normalize_git_url("http://x:8080/u/r") == "http://x:8080/u/r"
    assert normalize_git_url("ftp://x/y") is None
    assert normalize_git_url("git@github.com:u/r.git") is None
    assert normalize_git_url("https://") is None
    assert normalize_git_url("") is None


def test_git_slug():
    assert git_slug("https://github.com/digininja/DVWA") == "github.com-digininja-dvwa"
    assert git_slug("https://github.com/digininja/DVWA.git/") == "github.com-digininja-dvwa"


def test_register_git_flow(seed_repo, monkeypatch):
    calls = {"n": 0}

    def fake_clone(url, dest):
        calls["n"] += 1
        shutil.copytree(seed_repo, dest)

    monkeypatch.setattr("app.git_projects._git_clone", fake_clone)
    with TestClient(app) as c:
        r = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"})
        assert r.status_code == 201
        p = r.json()["project"]
        assert p["kind"] == "git" and p["name"] == "test.local-org-repo"
        assert c.post("/api/projects/git", json={"url": "https://test.local/org/repo"}).status_code == 201
        assert calls["n"] == 1  # reuse del clon (Review Focus 3)


def test_register_git_bad_url_400():
    with TestClient(app) as c:
        assert c.post("/api/projects/git", json={"url": "ftp://x/y"}).status_code == 400
        assert c.post("/api/projects/git", json={"url": "git@github.com:u/r.git"}).status_code == 400


def test_register_git_clone_fails_502(seed_repo, monkeypatch):
    from app.git_projects import GitCloneError

    def boom(url, dest):
        raise GitCloneError("boom")

    monkeypatch.setattr("app.git_projects._git_clone", boom)
    with TestClient(app) as c:
        assert c.post("/api/projects/git", json={"url": "https://test.local/x"}).status_code == 502


def test_local_register_of_clone_root_400_but_subpath_ok(seed_repo, monkeypatch):
    monkeypatch.setattr("app.git_projects._git_clone", lambda u, d: shutil.copytree(seed_repo, d))
    with TestClient(app) as c:
        p = c.post("/api/projects/git", json={"url": "https://test.local/org/repo"}).json()["project"]
        # raíz del clon ya listada → 400 (Review Focus 3)
        assert c.post("/api/projects/local", json={"path": p["path"]}).status_code == 400
        # pero una SUBcarpeta del clon sí (ruling Q3)
        assert c.post("/api/projects/local", json={"path": str(Path(p["path"]) / "src")}).status_code == 201
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_git_projects.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.git_projects'`.

- [ ] **Step 3: Implementar `backend/app/git_projects.py`**

```python
"""Proyectos por repo git público: clone --depth 1 en workspace/repos/<slug>/."""

from __future__ import annotations

import re
import subprocess
import urllib.parse
from pathlib import Path

from app.projects import ProjectInfo
from app.scanner import ScanResult, scan_project

WORKSPACE: Path = Path(__file__).resolve().parents[2] / "workspace"

GIT: dict[str, Path] = {}


class GitCloneError(Exception):
    """Fallo al clonar (timeout, git inexistente, URL inalcanzable)."""


def normalize_git_url(url: str) -> str | None:
    u = (url or "").strip()
    if not u or " " in u or u.startswith("git@"):
        return None
    if "://" not in u:
        u = "https://" + u
    parts = urllib.parse.urlparse(u)
    if parts.scheme not in ("http", "https") or not parts.netloc or not parts.path:
        return None
    return u


def git_slug(url: str) -> str:
    parts = urllib.parse.urlparse(normalize_git_url(url) or "")
    host = parts.netloc.lower().replace(":", "_")
    path = re.sub(r"\.git$", "", parts.path.strip("/").lower())
    path = re.sub(r"[^a-z0-9]+", "-", path).strip("-")
    return f"{host}-{path}".strip("-")


def _git_clone(url: str, dest: Path) -> None:
    try:
        proc = subprocess.run(
            ["git", "clone", "--depth", "1", url, str(dest)],
            timeout=120, capture_output=True, text=True,
        )
    except (subprocess.SubprocessError, FileNotFoundError) as exc:
        raise GitCloneError(f"git clone falló: {exc}") from exc
    if proc.returncode != 0:
        raise GitCloneError(f"git clone falló: {proc.stderr.strip()[-200:]}")


def _info(dest: Path, pid: str, scan: ScanResult) -> ProjectInfo:
    return ProjectInfo(
        id=pid, name=dest.name, path=dest.as_posix(),
        files=len(scan.files), lines=sum(f.lines for f in scan.files), kind="git",
    )


def register_git(url: str) -> ProjectInfo:
    normalized = normalize_git_url(url)
    if normalized is None:
        raise ValueError("URL no válida")
    slug = git_slug(normalized)
    dest = WORKSPACE / "repos" / slug
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        _git_clone(normalized, dest)
    scan = scan_project(dest, ["."])
    if not scan.files:
        raise GitCloneError("El repo clonado no tiene archivos de código")
    pid = f"git-{slug}"
    GIT[pid] = dest
    return _info(dest, pid, scan)


def git_list() -> list[ProjectInfo]:
    out: list[ProjectInfo] = []
    for pid, dest in list(GIT.items()):
        if not dest.is_dir():
            del GIT[pid]
            continue
        scan = scan_project(dest, ["."])
        if not scan.files:
            del GIT[pid]
            continue
        out.append(_info(dest, pid, scan))
    return out


def git_analyze(project_id: str) -> tuple[ProjectInfo, ScanResult] | None:
    dest = GIT.get(project_id)
    if dest is None or not dest.is_dir():
        return None
    scan = scan_project(dest, ["."])
    if not scan.files:
        return None
    return _info(dest, project_id, scan), scan
```

- [ ] **Step 4: Extender `resolve_local` (guard de clon) + cablear `main.py`**

En `backend/app/local_projects.py` (import de nivel de módulo; no hay ciclo: `git_projects` no importa `local_projects`):
```python
from app.git_projects import GIT
```
y en `resolve_local`, antes del `return p`:
```python
    if any(p == g for g in GIT.values()):
        return None
```
En `main.py`:
```python
from app.git_projects import GitCloneError, git_analyze, git_list, register_git


class GitProjectBody(BaseModel):
    url: str


@app.post("/api/projects/git", status_code=201)
def add_git_project(body: GitProjectBody):
    try:
        info = register_git(body.url)
    except ValueError:
        raise HTTPException(status_code=400, detail="URL de git no válida (usa una URL http/https)")
    except GitCloneError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo clonar: {exc}")
    return {"project": info}
```
`GET /api/projects` → `list_projects(load_settings().samples_dir) + local_list() + git_list()`.
`analyze` → `got = local_analyze(body.projectId) or git_analyze(body.projectId) or get_project(settings.samples_dir, body.projectId)`.

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_git_projects.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Comprobación final de la task + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde (incl. los tests de T1, que ya ven la extensión de `resolve_local`).
```powershell
git add backend/
git commit -m "feat(backend): proyectos por repo git (workspace, POST /api/projects/git)"
git push
```

---

### Task 3: Streaming del cliente LLM (httpx SSE)

**Files:**
- Modify: `backend/app/llm.py`, `backend/tests/test_llm.py`
- Create: `backend/tests/test_llm_stream.py`

**Interfaces:**
- `chat(system, user, max_tokens=8000) -> ChatResult` — misma firma. El payload añade `"stream": True, "stream_options": {"include_usage": True}`; por dentro usa `self._client.stream("POST", "/chat/completions", json=payload)`.
- Parseo SSE: líneas `data: ...`; `data: [DONE]` → fin. Por chunk: `chunk["usage"]` (gana el último no vacío) y `choices` que **puede estar vacío** (el chunk de usage); `delta.content` se acumula solo si es `str` no vacío (chunks con `delta: {}` + `finish_reason` se ignoran).
- Errores: no-2xx → `LLMError` (estado + body[:200]); `httpx.HTTPError` → `LLMError`; chunk JSON inválido → `LLMError("chunk SSE malformado")`; fin de stream sin `[DONE]` → `LLMError("stream SSE truncado (no llegó [DONE])")`; sin contenido → `LLMError("el LLM no devolvió contenido")`.
- `elapsed_s` mide todo el stream; sin `usage` → tokens 0 (tps 0, cosmético — riesgo documentado en spec §7).

- [ ] **Step 0: Spike REAL contra el endpoint (antes de implementar; script desechable, no se commitea)**

Crear `backend/spike_stream_tmp.py` (workdir `backend/`):
```python
"""SPIKE desechable: ¿streaming contra aitana.serbatic.es? (T3 Fase 2b)"""
import asyncio, json, time
import httpx

env = {}
for line in open(".env", encoding="utf-8"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v

async def probe(c, name, content):
    payload = {"model": env.get("LLM_MODEL", "qwen3.8-fp8"),
               "messages": [{"role": "user", "content": content}],
               "temperature": 0, "max_tokens": 100,
               "chat_template_kwargs": {"enable_thinking": False},
               "stream": True, "stream_options": {"include_usage": True}}
    t0 = time.monotonic(); ttft = None; usage = None
    async with c.stream("POST", "/chat/completions", json=payload) as r:
        print(name, "status", r.status_code)
        async for line in r.aiter_lines():
            if not line.startswith("data: "):
                continue
            d = line[6:]
            if d == "[DONE]":
                break
            if ttft is None:
                ttft = time.monotonic() - t0
            chunk = json.loads(d)
            if chunk.get("usage"):
                usage = chunk["usage"]
    print(name, f"ttft={ttft and round(ttft, 1)}s total={time.monotonic() - t0:.1f}s usage={usage}")

async def main():
    code = open("../samples/miniapp/app.js", encoding="utf-8").read() * 8  # ~40k chars reales
    async with httpx.AsyncClient(base_url=env["LLM_BASE_URL"],
                                 headers={"Authorization": f"Bearer {env['LLM_API_KEY']}"},
                                 timeout=httpx.Timeout(180, read=600)) as c:
        await probe(c, "small", "Responde solo: OK")
        await probe(c, "big40k", "Audita este código y responde solo JSON: " + code)

asyncio.run(main())
```
Run (workdir `backend/`): `.venv\Scripts\python.exe spike_stream_tmp.py`
**Criterios del spike (se anotan en el report de la task; sin suposiciones):**
- Si el endpoint **rechaza** `stream: true` (4xx/5xx antes del primer byte) → **BLOCKED**: reportar y parar la task (el diseño depende de esto).
- Anotar: (1) ¿streaming funciona? (2) ¿llega `usage`? (3) `ttft` small y big40k → indica si el corpus DVWA (343k) cruzará el TTFT de ~60 s del gateway. Si ya el big40k ronda o supera 60 s, la T10 usará un scope menor y se reactiva la pregunta al usuario sobre `proxy_read_timeout` (spec §10).
- **Borrar** `spike_stream_tmp.py` antes del commit.

- [ ] **Step 1: Escribir el test que falla**

`backend/tests/test_llm_stream.py`:
```python
"""Streaming SSE del LLMClient: chunks, usage, rarezas (T3 Fase 2b)."""
import json

import httpx
import pytest

from app.llm import LLMClient, LLMError


def sse_body(chunks):
    out = b"".join(b"data: " + json.dumps(c).encode() + b"\n\n" for c in chunks)
    return out + b"data: [DONE]\n\n"


def client_with(chunks, status=200):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, content=sse_body(chunks),
                              headers={"content-type": "text/event-stream"})
    return LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8",
                     transport=httpx.MockTransport(handler))


@pytest.mark.anyio
async def test_stream_multi_chunk_with_usage():
    c = client_with([
        {"choices": [{"delta": {"content": "ho"}}]},
        {"choices": [{"delta": {"content": "la"}}]},
        {"choices": [], "usage": {"prompt_tokens": 12, "completion_tokens": 5}},
    ])
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "hola"
    assert (out.prompt_tokens, out.completion_tokens) == (12, 5)
    assert out.elapsed_s > 0 and out.tps > 0


@pytest.mark.anyio
async def test_stream_without_usage_defaults_zero():
    c = client_with([{"choices": [{"delta": {"content": "x"}}]}])
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "x"
    assert (out.prompt_tokens, out.completion_tokens, out.tps) == (0, 0, 0.0)


@pytest.mark.anyio
async def test_stream_ignores_finish_reason_and_empty_delta():
    c = client_with([
        {"choices": [{"delta": {"content": "a"}, "finish_reason": None}]},
        {"choices": [{"delta": {}, "finish_reason": "stop"}]},  # Review Focus 4
    ])
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "a"


@pytest.mark.anyio
async def test_stream_malformed_chunk_raises():
    def handler(request):
        return httpx.Response(200, content=b"data: {no json}\n\n",
                              headers={"content-type": "text/event-stream"})
    c = LLMClient("http://test/v1", "TESTKEY", "m", transport=httpx.MockTransport(handler))
    with pytest.raises(LLMError, match="malformado"):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_stream_truncated_without_done_raises():
    body = b"data: " + json.dumps({"choices": [{"delta": {"content": "a"}}]}).encode() + b"\n\n"
    c = LLMClient("http://test/v1", "TESTKEY", "m",
                  transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body)))
    with pytest.raises(LLMError, match="truncado"):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_stream_empty_content_raises():
    c = client_with([{"choices": [], "usage": {"prompt_tokens": 1, "completion_tokens": 0}}])
    with pytest.raises(LLMError, match="contenido"):
        await c.chat("s", "u")
    await c.close()
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_llm_stream.py -v`
Expected: FAIL (el `chat` actual no streama; el handler SSE hace que `response.json()` falle → `LLMError` donde se espera éxito).

- [ ] **Step 3: Implementar el `chat()` streamer en `backend/app/llm.py`**

Sustituir el cuerpo de `chat` (añadir `import json` arriba):
```python
    async def chat(self, system: str, user: str, max_tokens: int = 8000) -> ChatResult:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        t0 = time.monotonic()
        content_parts: list[str] = []
        usage: dict = {}
        done = False
        try:
            async with self._client.stream("POST", "/chat/completions", json=payload) as response:
                if not response.is_success:
                    body = (await response.aread()).decode(errors="replace")[:200]
                    raise LLMError(f"el LLM respondió con estado {response.status_code}: {body}")
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        done = True
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError as exc:
                        raise LLMError(f"chunk SSE malformado: {exc}") from exc
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    for choice in chunk.get("choices") or []:
                        piece = (choice.get("delta") or {}).get("content")
                        if isinstance(piece, str) and piece:
                            content_parts.append(piece)
        except httpx.HTTPError as exc:
            raise LLMError(f"error de red hablando con el LLM: {exc}") from exc
        except LLMError:
            raise
        if not done:
            raise LLMError("stream SSE truncado (no llegó [DONE])")
        if not content_parts:
            raise LLMError("el LLM no devolvió contenido")
        return ChatResult(
            content="".join(content_parts),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            elapsed_s=time.monotonic() - t0,
        )
```

- [ ] **Step 4: Adaptar `backend/tests/test_llm.py` al formato SSE**

Los 3 handlers existentes pasan a devolver `httpx.Response(200, content=sse_body(...), headers={"content-type": "text/event-stream"})` (helper `sse_body` propio, 4 líneas, sin imports cruzados entre test files):
- `test_chat_sends_correct_body`: chunk único `{"choices": [{"delta": {"content": "ho"}}], "usage": {"prompt_tokens": 12, "completion_tokens": 5}}`; mantener todas las aserciones del body y añadir:
  ```python
  assert seen["body"]["stream"] is True
  assert seen["body"]["stream_options"] == {"include_usage": True}
  ```
- `test_chat_error_raises`: sin cambios (el 500 funciona por `response.aread()`).
- `test_chat_without_usage_defaults_zero`: `sse_body([{"choices": [{"delta": {"content": "x"}}]}])`.

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_llm.py tests\test_llm_stream.py -v`
Expected: PASS (9 tests).

- [ ] **Step 6: Regresión ground truth con LLM REAL (ya por streaming)**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -m llm -v`
Expected: PASS 10/10 (miniapp). Anotar tps/TTFT en el report. Si falla → depurar el streaming antes de continuar (esta es la validación real del spike).

- [ ] **Step 7: Comprobación final + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde.
```powershell
git add backend/
git commit -m "feat(backend): streaming SSE en LLMClient (usage, tk/s, spike del endpoint)"
git push
```

---

### Task 4: Cancel robusto (abortar LLM en vuelo) + M4 + M5

**Files:**
- Modify: `backend/app/runs.py`, `backend/app/pipeline.py`, `backend/app/main.py`, `backend/tests/test_runs_api.py`

**Interfaces:**
- `runs.py`:
  - `RunState`: nuevo campo `task: "asyncio.Task | None" = None` (+ `import asyncio`).
  - `RunRegistry.start` — (M5) al principio, podar terminales: `for rid in [r for r, st in self.runs.items() if st.status in TERMINAL]: del self.runs[rid]`. En la rama supersede, antes de marcar CANCELLED: `if active.task is not None: active.task.cancel()` y (M4) `emit(active, "run:cancelled", findings=active.findings)`.
  - `RunRegistry.cancel` — tras `run.status = CANCELLING`: `if run.task is not None: run.task.cancel()`.
- `main.py` `analyze`:
  ```python
  task = asyncio.create_task(_wrapped(run, scan, project.name, vuln_ids))
  run.task = task
  ```
- `pipeline.py` `run_pipeline`: envolver TODO lo que hay tras `emit(run, "run:start", ...)` en:
  ```python
  try:
      ... (guard de tamaño + oleadas + cierre, igual que hoy) ...
  except asyncio.CancelledError:
      # Cancel robusto (T4): el endpoint (o el supersede) canceló la task en vuelo.
      if run.status == RunStatus.CANCELLING:
          emit(run, "run:cancelled", findings=run.findings)
          run.status = RunStatus.CANCELLED
      raise
  ```
  El check `status == CANCELLING` evita el doble `run:cancelled` si el supersede ya lo emitió (M4); check+emit son atómicos en el loop (sin `await` entre ellos). La rama `CANCELLING` de cierre existente se conserva (doble guarda inofensiva).

**Tests** (`test_runs_api.py`, reutilizando `make_llm(delay=...)`, `samples_dir`, `drain_events`):
- Nuevo `test_cancel_in_flight_is_fast`:
  ```python
  def test_cancel_in_flight_is_fast(monkeypatch, samples_dir):
      import time as _time
      monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
      monkeypatch.setattr("app.main.build_llm", lambda: make_llm(delay=0.5))
      with TestClient(app) as c:
          run_id = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01", "A03"]}).json()["runId"]
          _time.sleep(0.1)  # el run está en vuelo (LLM fake de 0.5 s)
          assert c.post(f"/api/runs/{run_id}/cancel").json()["ok"] is True
          t0 = _time.monotonic()
          ev = drain_events(c, run_id)  # debe cerrar < 0.3 s después del cancel
          elapsed = _time.monotonic() - t0
      assert elapsed < 0.3  # sin task.cancel sería >= 0.4 s (la llamada en vuelo)
      assert ev[-1]["type"] == "run:cancelled" and "findings" in ev[-1]
      assert not any(e["type"] == "agent:done" and e.get("findingsCount", 0) > 0 for e in ev)
      with TestClient(app) as c2:  # slot libre: un run nuevo arranca al instante
          assert c2.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01"]}).status_code == 202
  ```
- Nuevo `test_start_purges_terminal_runs` (M5):
  ```python
  def test_start_purges_terminal_runs():
      from app.runs import RunRegistry, RunState, RunStatus
      reg = RunRegistry()
      reg.runs["old"] = RunState(id="old", project_id="p", vuln_ids=["A01"], status=RunStatus.DONE)
      new = reg.start("p", ["A01"])
      assert new is not None and "old" not in reg.runs and new.id in reg.runs
  ```
- M4: extender el `test_supersede_after_cancel` existente añadiendo al final:
  ```python
          ev_first = drain_events(c, first)
          assert ev_first[-1]["type"] == "run:cancelled" and "findings" in ev_first[-1]
  ```

- [ ] **Step 1: Escribir los tests que fallan** (los 2 nuevos + la extensión M4).
- [ ] **Step 2: Ejecutar y verificar que fallan**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_runs_api.py -v`
Expected: `test_cancel_in_flight_is_fast` FAIL (elapsed ≥ 0.4 s); `test_start_purges_terminal_runs` FAIL (queda `"old"`); la extensión M4 FAIL (sin `findings` en el `run:cancelled` del supersede).

- [ ] **Step 3: Implementar `runs.py`** (campo `task`, poda al inicio de `start`, `task.cancel()` en `cancel` y en el supersede, M4 emit con `findings`).
- [ ] **Step 4: Implementar `main.py`** (guardar la task en `run.task`).
- [ ] **Step 5: Implementar `pipeline.py`** (try/except `CancelledError` con re-raise).
- [ ] **Step 6: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_runs_api.py -v`
Expected: PASS.

- [ ] **Step 7: Comprobación final + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde (los tests de pipeline/cancel existentes —`test_pipeline_cancelled_skips_agents`, `test_supersede_no_wasted_llm_calls`— deben seguir pasando).
```powershell
git add backend/
git commit -m "feat(backend): cancel robusto (task.cancel en vuelo) + poda de runs + run:cancelled con findings"
git push
```

---

### Task 5: Desduplicación de hallazgos entre categorías

**Files:**
- Modify: `backend/app/pipeline.py`, `backend/tests/test_pipeline.py`

**Interfaces:**
- Nueva función en `app/pipeline.py`:
  ```python
  def _consolidate(findings: list[dict]) -> tuple[list[dict], int]:
      """Consolida hallazgos de la misma (file, line) reportados por varias categorías.

      Gana la categoría canónica menor (A01 < A02 < ...); las demás quedan en
      ``alsoCategories``. Devuelve (consolidados ordenados, n_descartados).
      Los ``id`` se renumeran por categoría ganadora: ``{vulnId}-{n}`` 1-based.
      Los duplicados intra-categoría (mismo agente, misma línea) se conservan.
      """
      groups: dict[tuple[str, int], list[dict]] = {}
      order: list[tuple[str, int]] = []
      for f in findings:
          key = (f["file"], f["line"])
          if key not in groups:
              groups[key] = []
              order.append(key)
          groups[key].append(f)
      out: list[dict] = []
      discarded = 0
      for key in order:
          members = sorted(groups[key], key=lambda f: f["vulnId"])
          winner = dict(members[0])
          also = sorted({m["vulnId"] for m in members[1:]})
          if also:
              winner["alsoCategories"] = also
              discarded += len(also)
          out.append(winner)
      out.sort(key=lambda f: (f["vulnId"], f["file"], f["line"]))
      counters: dict[str, int] = {}
      for f in out:
          counters[f["vulnId"]] = counters.get(f["vulnId"], 0) + 1
          f["id"] = f"{f['vulnId']}-{counters[f['vulnId']]}"
      return out, discarded
  ```
- Aplicación en `run_pipeline`, tras `await asyncio.gather(...)` y ANTES del cierre (un solo punto: cubre también `run:cancelled` de T4):
  ```python
  run.findings, dupes = _consolidate(run.findings)
  if dupes:
      emit(run, "log", vulnId="global",
           message=f"consolidados {dupes} hallazgo(s) duplicado(s) entre categorías")
  ```

**Tests** (`test_pipeline.py`, reutilizando el `scan` y `FakeVulnLLM` del módulo):
```python
def test_consolidate_two_categories_same_line():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(file="routes/orders.js", line=4, vulnId="A03", id="A03-1")},
        {**_finding(file="routes/orders.js", line=4, vulnId="A05", id="A05-1")},
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 1 and len(out) == 1
    assert out[0]["vulnId"] == "A03"
    assert out[0]["alsoCategories"] == ["A05"]


def test_consolidate_three_categories_and_renumbers():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(line=10, vulnId="A05", id="A05-1")},
        {**_finding(line=10, vulnId="A01", id="A01-1")},
        {**_finding(line=10, vulnId="A03", id="A03-1")},
        {**_finding(line=20, vulnId="A03", id="A03-2")},
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 2
    assert [f["id"] for f in out] == ["A01-1", "A03-1"]
    assert out[0]["alsoCategories"] == ["A03", "A05"]
    assert out[1]["line"] == 20


def test_consolidate_no_duplicates_keeps_all():
    from app.pipeline import _consolidate
    fs = [
        {**_finding(line=1, vulnId="A01", id="A01-1")},
        {**_finding(line=2, vulnId="A01", id="A01-2")},  # intra-categoría: se conserva
    ]
    out, discarded = _consolidate(fs)
    assert discarded == 0 and len(out) == 2
    assert "alsoCategories" not in out[0]


def test_pipeline_consolidates_cross_category_duplicates():
    run = RunRegistry().start("miniapp", ["A01", "A03"])
    llm = FakeVulnLLM(
        {"A01": json.dumps([_finding(file="routes/orders.js", line=4)]),
         "A03": json.dumps([_finding(file="routes/orders.js", line=4),
                            _finding(file="routes/orders.js", line=9)])},
        PROFILE_JSON,
    )
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=2))
    done = run.events[-1]
    assert done["type"] == "run:done"
    assert [f["id"] for f in done["findings"]] == ["A01-1", "A03-1"]
    assert done["findings"][0]["alsoCategories"] == ["A03"]
    assert any("consolidados 1 hallazgo(s) duplicado(s) entre categorías" in e.get("message", "")
               for e in run.events)
```
(En la integración: A01 gana la línea 4 con `alsoCategories ["A03"]`; la línea 9 de A03 se renumera `A03-1`.)

- [ ] **Step 1: Escribir los 4 tests** (arriba).
- [ ] **Step 2: Ejecutar y verificar que fallan**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_pipeline.py -v`
Expected: los 4 nuevos FAIL (`_consolidate` no existe / no se consolida).

- [ ] **Step 3: Implementar `_consolidate` + el punto de aplicación en `pipeline.py`**.
- [ ] **Step 4: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_pipeline.py -v`
Expected: PASS (los tests existentes no cambian: el fixture A01/A03 no tiene duplicados entre categorías).

- [ ] **Step 5: Comprobación final + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde.
```powershell
git add backend/
git commit -m "feat(backend): desduplicación de hallazgos entre categorías (alsoCategories)"
git push
```

---

### Task 6: Informe PDF completo (portada + perfil + hallazgos)

**Files:**
- Modify: `backend/app/pdf_report.py`, `backend/app/main.py`, `backend/tests/test_pdf_report.py`

**Interfaces:**
- `pdf_report.py`:
  - `VULN_NAMES: dict[str, str]` — los 10 nombres **idénticos byte a byte** a `src/data/owasp.ts` (A01 «Fallos de control de acceso» … A10 «Suplantición de servidor (SSRF)»; el implementador copia de ese archivo).
  - `SEVERITY_ES` se importa de `app.pipeline` (fuente única; sin ciclo: pipeline no importa pdf_report).
  - `build_report_pdf(project_name: str, profile: dict, meta: dict, findings: list[dict], pageCompression: int = 0) -> bytes` — A4, mismos márgenes/`_wrap_lines` que el scope PDF; `pageCompression=0` por defecto (streams sin comprimir → contenido greppable en tests; archivos aún pequeños).
  - Layout: portada (título `INFORME DE AUDITORÍA DE SEGURIDAD` + proyecto + fecha `datetime.date.today().isoformat()` + líneas de meta solo si existen: Archivos/Líneas/Duración (min)/Modelo/Tokens totales/Velocidad media (tk/s)); sección `PERFIL DEL PROYECTO` (lenguaje, frameworks `name vX` unidos por coma, entry points, descripción); sección `HALLAZGOS (n total)`: por categoría en orden canónico A01→A10 (ids desconocidos al final), solo no vacías, cabecera `A03 · INYECCIÓN (2)`; por hallazgo: `[CRÍTICO] título` (negrita), `Ubicación: file:line` (sin emoji), snippet en `Courier` 8, líneas `EXPLOIT: / CONSECUENCIAS: / SOLUCIÓN:` (solo si existen), y `También reportado como: A05` si hay `alsoCategories`. **Sin emojis** (WinAnsi).
- `main.py`:
  ```python
  class ReportPdfBody(BaseModel):
      projectName: str
      profile: dict
      meta: dict
      findings: list[dict]


  @app.post("/api/reports/full-pdf")
  def full_pdf(body: ReportPdfBody):
      slug = re.sub(r"[^a-z0-9]+", "-", body.projectName.lower()).strip("-") or "proyecto"
      return Response(
          content=build_report_pdf(body.projectName, body.profile, body.meta, body.findings),
          media_type="application/pdf",
          headers={"Content-Disposition": f'attachment; filename="informe-{slug}.pdf"'},
      )
  ```
  (+ `import re` en main.py si no está).

**Tests** (`test_pdf_report.py`, extendiendo el archivo existente):
```python
def _finding(fv, line, **kw):
    base = {"id": f"{fv}-1", "vulnId": fv, "severity": "critical", "title": "t",
            "file": "a.js", "line": line, "snippet": "s", "exploit": "e",
            "consequences": "c", "solution": "s"}
    base.update(kw)
    return base


def test_report_pdf_cover_and_category_order():
    data = build_report_pdf("miniapp", {"language": "JavaScript", "frameworks": [],
                                        "entry_points": [], "description": "d"},
                            {"files": 3, "lines": 10, "durationMin": 1},
                            [_finding("A03", 4), _finding("A01", 7)])
    assert data[:5] == b"%PDF-"
    assert b"miniapp" in data
    assert data.index(b"A01") < data.index(b"A03")  # orden canónico


def test_report_pdf_empty_findings_ok():
    data = build_report_pdf("p", {}, {}, [])
    assert data[:5] == b"%PDF-"


def test_report_pdf_long_unbreakable_snippet():
    f = _finding("A02", 1, snippet="x" * 5000, title="ñ" * 100)  # Review Focus 5
    data = build_report_pdf("p", {}, {}, [f])
    assert data[:5] == b"%PDF-"


def test_report_pdf_also_categories_line():
    f = _finding("A03", 1, alsoCategories=["A05"])
    data = build_report_pdf("p", {}, {}, [f])
    assert b"Tambi" in data and b"A05" in data  # «También…» sin acentos en la aserción


def test_full_pdf_endpoint():
    r = TestClient(app).post("/api/reports/full-pdf", json={
        "projectName": "Mi Proyecto", "profile": {"language": "JS"},
        "meta": {"files": 1}, "findings": [_finding("A01", 1)]})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == 'attachment; filename="informe-mi-proyecto.pdf"'
    assert r.content[:5] == b"%PDF-"
```

- [ ] **Step 1: Escribir los tests** (arriba; `from app.pdf_report import build_report_pdf`, `from app.main import app` como ya use el file).
- [ ] **Step 2: Ejecutar y verificar que fallan**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_pdf_report.py -v`
Expected: FAIL (`build_report_pdf` no existe / endpoint 404).

- [ ] **Step 3: Implementar `VULN_NAMES` + `build_report_pdf`** en `pdf_report.py` (reutilizar `_wrap_lines`; helper interno de paginación tipo `if y < _MARGIN: c.showPage(); y = height - _MARGIN`).
- [ ] **Step 4: Implementar el endpoint** en `main.py`.
- [ ] **Step 5: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_pdf_report.py -v`
Expected: PASS.

- [ ] **Step 6: Comprobación final + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde.
```powershell
git add backend/
git commit -m "feat(backend): informe PDF completo (portada + perfil + hallazgos por categoría)"
git push
```

---

### Task 7: Front — SourceScreen live: ruta local + URL git

**Files:**
- Modify: `src/types.ts`, `src/components/source/SourceScreen.tsx`, `src/App.tsx`, `src/components/source/SourceScreen.test.tsx`

**Interfaces:**
- `types.ts`: `ProjectInfo.kind?: 'sample' | 'local' | 'git'`.
- `SourceScreen`: nueva prop opcional `onRefresh?: () => Promise<void>`. En la rama live, la nota «Fase 2b: carpeta local y repositorio git» se sustituye por el bloque **«AUDITAR UN PROYECTO PROPIO»** con 2 filas (input + botón):
  - Fila local: input (placeholder `C:\proyectos\miapp  o  /home/user/proj`, aria-label «Ruta local del proyecto») + `NeonButton variant="outline"` **«AUDITAR RUTA»** (disabled si vacío o busy).
  - Fila git: input (placeholder `https://github.com/org/repo`, aria-label «URL del repositorio git»; state propio `gitRepoUrl`, no reutilizar el `gitUrl` de la rama mock) + botón **«CLONAR Y AUDITAR»** que muestra **«CLONANDO…»** mientras `gitBusy`.
  - Error inline bajo cada fila (`localError`/`gitError`, `text-sev-critical`).
  - En las filas de la lista live: tag `LOCAL`/`GIT` (mono, 10px, cian) cuando `p.kind` no es `sample`.
- Comportamiento de los submits (fetch con `Content-Type: application/json`):
  - Local → `POST /api/projects/local {path: trimmed}`: 201 → `await onRefresh?.()` + limpiar input; 400 → «Ruta no válida: debe existir, ser una carpeta y no estar dentro de samples/»; 404 → «Sin archivos de código en esa ruta»; otro/red → «Error de conexión con el backend».
  - Git → `POST /api/projects/git {url: trimmed}`: 201 → `await onRefresh?.()` + limpiar; 400 → «URL de git no válida (usa una URL http/https)»; 502 → «No se pudo clonar: revisa la URL o inténtalo de nuevo»; otro/red → «Error de conexión con el backend».
- `App.tsx`: extraer el fetch de proyectos en un helper reutilizable y pasarlo como `onRefresh`:
  ```tsx
  const fetchProjects = useCallback(async (): Promise<ProjectInfo[]> => {
    const res = await fetch('/api/projects', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) throw new Error(`projects: ${res.status}`)
    return (await res.json()) as ProjectInfo[]
  }, [])
  ```
  el efecto de autodetección lo usa (mismos `disposed`/catch de hoy); y:
  ```tsx
  const refreshProjects = useCallback(async () => {
    setDetectedProjects(await fetchProjects())
  }, [fetchProjects])
  ```
  `onRefresh={autoDetect ? refreshProjects : undefined}` en el `SourceScreen`.

**Tests** (`SourceScreen.test.tsx`, extendiendo los tests live existentes; stub de `fetch`):
- «registra una ruta local»: con `onRefresh` espía; escribir `C:\proyectos\mi app` (con espacio) + clic AUDITAR RUTA → `fetch` llamada con `/api/projects/local` y body `{path: "C:\\proyectos\\mi app"}`; `onRefresh` 1 vez; input limpio (fetch mock → 201 `{project: {...}}`).
- «muestra el error 400 de ruta»: fetch → 400 → texto «Ruta no válida…».
- «muestra el error 404 de ruta»: → 404 → «Sin archivos de código en esa ruta».
- «clonación git pendiente y éxito»: fetch git pende (promise no resuelta) → botón «CLONANDO…»; resolver 201 → `onRefresh` llamada.
- «muestra el error 502 de git»: → 502 → «No se pudo clonar…».
- «muestra el tag de kind»: `projects` con una entrada `kind: 'local'` → texto «LOCAL» visible.
- «modo mock sin el bloque»: sin prop `projects` → «Auditar un proyecto propio» NO renderizado.

- [ ] **Step 1: Escribir los tests** (rojo).
- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx`
Expected: FAIL (el bloque no existe / `onRefresh` no usada).

- [ ] **Step 3: Implementar** `types.ts` + `SourceScreen.tsx` + `App.tsx`.
- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Comprobación final + commit**

Run: `npx vitest run` + `npm run build` → todo verde.
```powershell
git add src/
git commit -m "feat(front): auditar ruta local y repo git desde la SourceScreen (modo live)"
git push
```

---

### Task 8: Front — botón informe PDF + tag de duplicados + M2

**Files:**
- Modify: `src/types.ts`, `src/services/liveAnalysisService.ts` (+ su test), `src/components/summary/SummaryScreen.tsx` (+ test), `src/components/summary/FindingCard.tsx`, `src/App.tsx` (+ `src/App.test.tsx`)

**Interfaces:**
- `types.ts`: `Finding.alsoCategories?: string[]`; `AnalysisProgress.profile?: Record<string, unknown>`.
- `liveAnalysisService.ts`: `SseEvent.profile?: Record<string, unknown>`; el caso `profile:done` (hoy «se ignora») pasa a:
  ```ts
  case 'profile:done':
    state.profile = ev.profile ?? {}
    emit()
    break
  ```
- `SummaryScreen`: nueva prop opcional `projectName?: string`; en el footer, junto a GENERAR ALCANCE, nuevo botón:
  ```tsx
  <NeonButton variant="ghost" onClick={downloadReport} disabled={total === 0 || reportBusy}>
    {reportBusy ? 'GENERANDO…' : 'INFORME PDF ▸'}
  </NeonButton>
  ```
  con estado local `reportBusy`/`reportError` y:
  ```ts
  const downloadReport = async () => {
    setReportBusy(true); setReportError(null)
    try {
      const res = await fetch('/api/reports/full-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName ?? 'Proyecto',
          profile: analysis.profile ?? {},
          meta: analysis.meta ?? {},
          findings,
        }),
      })
      if (!res.ok) throw new Error('bad status')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `informe-${(projectName ?? 'proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setReportError('No se pudo generar el informe (¿backend caído?)')
    } finally {
      setReportBusy(false)
    }
  }
  ```
  (mismo patrón de descarga que `ScopeModal.tsx`; `{reportError && <p …>{reportError}</p>}` bajo el footer). `App.tsx` pasa `projectName={flow.source?.label ?? 'Proyecto'}`.
- `FindingCard.tsx`: tras el tag `vuln.id · vuln.name`, si `finding.alsoCategories?.length`:
  ```tsx
  <span className="shrink-0 font-mono text-[10px] tracking-wide text-neon-cyan"
        title={`También reportado por: ${finding.alsoCategories.join(', ')}`}>
    +{finding.alsoCategories.length}
  </span>
  ```
- M2 (`App.tsx`): en el `.then(list => …)` de la autodetección, antes de `setDetectedProjects`:
  ```ts
  if (!Array.isArray(list) || list.length === 0) throw new Error('sin proyectos')
  ```
  → `projects: []` o JSON no-array caen al modo mock (cerrado el callejón sin salida de la 2a).

**Tests:**
- `liveAnalysisService.test.ts`: happy path + evento `profile:done` con un objeto → el último estado emitido tiene `profile` igual (deep).
- `SummaryScreen.test.tsx`:
  - «descarga el informe PDF»: stub `fetch` (200 blob) + stub `URL.createObjectURL` → clic INFORME PDF → `fetch` con `/api/reports/full-pdf` y body `{projectName, profile, meta, findings}`; `createObjectURL` llamada.
  - «deshabilitado sin hallazgos»: `findings: []` → botón disabled.
  - «muestra error en 500»: fetch → 500 → «No se pudo generar el informe…».
- Tag duplicados: `SummaryScreen` con un finding `alsoCategories: ['A05','A06']` → span con texto `+2` y title `También reportado por: A05, A06`.
- M2 en `App.test.tsx`: stub `fetch` — `/api/health` 200 y `/api/projects` → 200 `[]` → la app cae al modo mock (renderiza `HomeScreen`, no la lista live).

- [ ] **Step 1: Escribir los tests** (rojo).
- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/services/liveAnalysisService.test.ts src/components/summary/SummaryScreen.test.tsx src/App.test.tsx`
Expected: FAIL (sin `profile`, sin botón, sin tag, `[]` → live).

- [ ] **Step 3: Implementar** los 5 archivos.
- [ ] **Step 4: Ejecutar y verificar que pasa** (mismo comando).
- [ ] **Step 5: Comprobación final + commit**

Run: `npx vitest run` + `npm run build` → todo verde.
```powershell
git add src/
git commit -m "feat(front): informe PDF desde el resumen, tag de duplicados y fallback con 0 proyectos (M2)"
git push
```

---

### Task 9: Minors diferidos de la 2a — M1 + M7 + M8 + README

**Files:**
- Modify: `backend/app/pipeline.py` (M1), `backend/tests/test_pipeline.py` (test M1), `backend/tests/test_runs_api.py` (M7), `backend/requirements.txt` (M8), `README.md`
- Create: `backend/requirements-dev.txt` (M8)

**Cambios:**
- **M1** — `pipeline.py`, donde se añade cada finding a `run.findings` (la línea `run.findings.append({**f, "id": …, "vulnId": v})`):
  ```python
  run.findings.append({
      **f,
      "id": f"{v}-{i}",
      "vulnId": v,
      "snippet": str(f.get("snippet") or ""),
      "exploit": str(f.get("exploit") or ""),
      "consequences": str(f.get("consequences") or ""),
      "solution": str(f.get("solution") or ""),
  })
  ```
  Test (en `test_pipeline.py`): canned de A01 con un finding **sin** las keys `snippet`/`exploit` → `run.findings[0]["snippet"] == ""` y `["exploit"] == ""`.
- **M7** — `test_runs_api.py`: mover la clase `FakeVulnLLM` dentro del file (copia de la de `test_pipeline.py`, ~25 líneas, con `delay` y `fail_vulns`) y **eliminar** `from test_pipeline import FakeVulnLLM`. Ambos files deben pasar por separado (verificar con dos ejecuciones del file). `test_local_projects.py`/`test_git_projects.py` (T1/T2) no importan de otros test files: no se tocan.
- **M8** — `backend/requirements.txt` → solo runtime:
  ```
  fastapi>=0.115
  uvicorn[standard]>=0.30
  httpx>=0.27
  reportlab>=4.0
  ```
  `backend/requirements-dev.txt`:
  ```
  -r requirements.txt
  pytest>=8.0
  anyio>=4.0
  ```
  `README.md` (root): en el quickstart del backend, la línea de instalación pasa a `pip install -r requirements-dev.txt` (runtime + test) y se añade una nota: «`requirements.txt` = solo runtime; `requirements-dev.txt` = runtime + pytest/anyio».

- [ ] **Step 1: Test M1** (rojo) → ejecutar → FAIL.
- [ ] **Step 2: Implementar M1** → verde.
- [ ] **Step 3: M7** — copiar `FakeVulnLLM` a `test_runs_api.py`, quitar el import.
  Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_runs_api.py -v` y `tests\test_pipeline.py -v` → ambos verdes por separado.
- [ ] **Step 4: M8** — dividir requirements + nota en README.
- [ ] **Step 5: Comprobación final + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde.
```powershell
git add backend/ README.md
git commit -m "chore(backend): minors de la 2a — M1 campos opcionales, M7 fakes locales, M8 requirements runtime/dev + README"
git push
```

---

### Task 10: E2E real (DVWA vía git + streaming) + final review + `v0.3.0`

**Files:** sin código nuevo (salvo `PROGRESS.md` + commits/tag).

- [ ] **Step 1: Arrancar uvicorn** (workdir `backend/`, background): `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
- [ ] **Step 2: Clonar DVWA vía la propia API** (red real; puede tardar):
  ```powershell
  Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/projects/git -ContentType 'application/json' -Body '{"url": "https://github.com/digininja/DVWA"}'
  ```
  Expected: 201, `kind: "git"`, name `github.com-digininja-dvwa`. Anotar slug + tiempo de clon.
- [ ] **Step 3: Registrar la subcarpeta `vulnerabilities/` como proyecto local** (ruling Q2/Q3 — 343k chars, el corpus de vulneraciones sin arrastrar `dvwa/js`, `tests/`, …):
  ```powershell
  Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/projects/local -ContentType 'application/json' -Body '{"path": "C:/Users/rferrero/Documents/SerbaticSecurityInspector/workspace/repos/github.com-digininja-dvwa/vulnerabilities"}'
  ```
  Expected: 201. Anotar files/lines reales.
- [ ] **Step 4: Run completo con streaming** (las 10 vulnIds) contra ese proyecto → seguir el SSE hasta `run:done`. Anotar: nº de hallazgos (y la línea «consolidados N…» si aparece), por categoría, que **no** hubo 504, duración. Si el run da 504 por TTFT > 60 s → **contingencia**: preguntar al usuario si puede subir `proxy_read_timeout` en el gateway (pendiente de spec §10); si no, acotar el scope (subcarpetas de `vulnerabilities/`) y documentar el tope real. No bajar la aceptación en silencio.
- [ ] **Step 5: Descargar el informe PDF completo** con los datos del run (`POST /api/reports/full-pdf`) → abrirlo y verificar: portada, perfil, categorías en orden, hallazgos con snippet/exploit/consecuencias/solución.
- [ ] **Step 6: Ground truth miniapp** — Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -m llm -v` → **10/10** (regresión; ya por streaming).
- [ ] **Step 7: Suites completas** — backend `pytest -q`; root `npx vitest run` y `npm run build` → todo verde.
- [ ] **Step 8: Final review de rama** — el coordinador despacha un subagente fresco (modelo `aitana/qwen3.8-fp8`) sobre el diff desde `v0.2.0`; si hay findings → commit de fix convencional (no amendar: las tasks ya están pushadas) + push.
- [ ] **Step 9: Cierre** — `PROGRESS.md`: 2b COMPLETA 10/10, «Estado actual» → siguiente = Fase 2c (semgrep-híbrido + relocalización); registro de decisiones con: resultados del spike (TTFT, usage), scope final DVWA, timeout de gateway si se tocó. Commit + tag + push:
  ```powershell
  git add PROGRESS.md
  git commit -m "docs: PROGRESS — Fase 2b completa (10/10) + decisiones"
  git tag v0.3.0
  git push --follow-tags
  ```

**Ritmo previsto:** 2–4 tasks por sesión (AGENTS.md) → ~3 sesiones de ejecución.

