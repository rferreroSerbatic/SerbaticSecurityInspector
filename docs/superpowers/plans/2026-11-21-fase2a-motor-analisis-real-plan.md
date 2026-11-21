# Fase 2a — Motor de análisis real: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el análisis mock por un motor real: backend FastAPI que lee un proyecto de ejemplo, ejecuta 11 agentes LLM (1 perfilador + 10 OWASP) contra qwen3.8 FP8 y transmite el progreso real por SSE al frontend existente.

**Architecture:** Backend Python en `backend/` con pipeline de 2 oleadas (perfilador secuencial → 10 agentes de vulnerabilidad en pool de concurrencia configurable), buffer de eventos SSE con replay, y registro de runs en memoria con un solo slot activo (supersede al cancelar). Frontend: nuevo `liveAnalysisService` tras la interfaz `AnalysisService` existente + autodetección de backend (fetch `/api/health`) + banner de error mínimo en `ProgressScreen`. Pantallas sin cambios salvo lo anterior.

**Tech Stack:** Python 3.12 (ya instalado: 3.12.10 vía winget), FastAPI, uvicorn, httpx, pytest. Frontend: Vite 5 + React 18 + TS strict + Vitest existentes (sin nuevas deps). LLM: endpoint OpenAI-compatible `https://aitana.serbatic.es/v1`, modelo `qwen3.8-fp8` (256k ctx), `chat_template_kwargs: {"enable_thinking": false}` (verificado 2026-11-21 con llamada real).

**Spec:** `docs/superpowers/specs/2026-11-21-fase2a-motor-analisis-real-design.md` (incluye rulings R1–R3 en §6.6 — leerla antes de ejecutar).

## Global Constraints

- Windows + PowerShell. Python con `py -3.12`; invocar siempre el venv directamente: `backend\.venv\Scripts\python.exe -m ...` (sin `Activate.ps1`). Los comandos de `pytest` se ejecutan con working dir `backend/`.
- API key: solo en `backend/.env` (gitignored). Nunca en el front, nunca en git, nunca repetida en reports.
- Toda llamada LLM: `temperature: 0`, `max_tokens: 8000`, timeout 180 s, `chat_template_kwargs: {"enable_thinking": false}`. Concurrencia por `LLM_CONCURRENCY` (default 3).
- Guardas de escaneo: archivo > 200 000 bytes se omite; total de código > 600 000 chars → `run:error` con mensaje claro.
- Copy de UI en español. Sin nuevas librerías de front. Sin router ni librería de estado.
- TDD estricto: rojo→verde solo del test de la task; al final de la task UNA vez: backend → `pytest` completo; frontend → `npx vitest run` + `npm run build`.
- Commits: convencionales, **uno por task** (amendar con los fix rounds de review; push único al terminar la task).
- Backend: `backend/conftest.py` vacío para que `import app...` funcione; `pytest.ini` con marker `llm` (los tests con LLM real no corren en el `pytest` por defecto).
- Contrato SSE: `data: {json}\n\n` donde json = `{"type": ..., "t": <segundos desde inicio del run, float>, ...payload}`. Eventos terminales: `run:done`, `run:error`, `run:cancelled` (cierre del stream).
- Los `findings` del evento `run:done` van en el shape exacto del frontend: `{id, vulnId, severity, title, file, line, snippet, exploit, consequences, solution}` (el backend aplica `id = "{vulnId}-{n}"` 1-based y `vulnId`).
- Nombres de vulneraciones (idénticos al front, `src/data/owasp.ts`): A01 «Fallos de control de acceso», A02 «Fallos criptográficos», A03 «Inyección», A04 «Diseño inseguro», A05 «Configuración insegura», A06 «Componentes vulnerables u obsoletos», A07 «Identificación y autenticación», A08 «Integridad del software», A09 «Registro y monitorización», A10 «Suplantición de servidor (SSRF)».

## Review Focus

1. **LLM devuelve JSON envuelto en fences markdown o con prosa** (```` ```json … ``` ```` o «Aquí tienes: […]») → `parse_findings`/`parse_profile` limpian y extraen el primer array/objeto JSON válido; sin JSON → `[]`/fallback. Tests en Task 3 (profile) y Task 4 (findings).
2. **LLM alucina `file`/`line` inexistentes** → la validación los descarta y lo cuenta en el log («descartados N hallazgo(s) inválido(s)»); nunca llegan a la UI. Test en Task 5.
3. **LLM falla a mitad del run** (500/timeout) → `run:error` con mensaje, se libera el slot, y la UI muestra el banner de error. Test en Task 5 (backend) + Task 6 (servicio).
4. **`samples/dvwa` no existe** (no clonado) → `GET /api/projects` devuelve solo miniapp sin error. Test en Task 2.
5. **Segundo `POST /api/analyze` con run activo** → `409` → el servicio live mapea a `status: 'error'` con «Ya hay un análisis en curso». Test en Task 5 (API) + Task 6 (servicio).

---


### Task 1: Setup Python + scaffold del backend

**Files:**
- Create: `backend/requirements.txt`, `backend/.env.example`, `backend/.gitignore`, `backend/conftest.py` (vacío), `backend/pytest.ini`, `backend/README.md`, `backend/app/__init__.py` (vacío), `backend/app/main.py`, `backend/tests/test_health.py`
- Create (fuera de git): `backend/.venv/`, `backend/.env`
- Modify: `.gitignore` (root)

**Interfaces:**
- Consumes: Python 3.12 (instalado). API key en `~/.config/opencode/opencode.json` (`provider.aitana.options.apiKey` / `.baseURL`).
- Produces: objeto FastAPI `app.main.app`; endpoint `GET /api/health` → 200 `{"status": "ok"}`; `backend/.env` con `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_CONCURRENCY=3`.

- [ ] **Step 1: Crear venv e instalar dependencias (setup, sin test)**

`backend/requirements.txt`:
```
fastapi>=0.115
uvicorn[standard]>=0.30
httpx>=0.27
pytest>=8.0
anyio>=4.0
```
Run (workdir repo root):
```powershell
py -3.12 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```
Expected: venv creado y deps instaladas sin errores.

- [ ] **Step 2: Crear `backend/.env` copiando la key desde la config de OpenCode (sin ecobarla en el report)**

```powershell
$cfg = Get-Content "$env:USERPROFILE\.config\opencode\opencode.json" -Raw | ConvertFrom-Json
@"
LLM_API_KEY=$($cfg.provider.aitana.options.apiKey)
LLM_BASE_URL=$($cfg.provider.aitana.options.baseURL)
LLM_MODEL=qwen3.8-fp8
LLM_CONCURRENCY=3
"@ | Set-Content -Path "backend\.env" -Encoding utf8
```
`backend/.env.example` (versioneado, sin key real): mismas 4 líneas con `LLM_API_KEY=` vacía y un comentario `# copiar de tu config de OpenCode; ver backend/README.md`.

- [ ] **Step 3: Escribir el test que falla**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from app.main import app


def test_health():
    r = TestClient(app).get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 4: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_health.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 5: Implementar `backend/app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="Serbatic Security Inspector API")


@app.get("/api/health")
def health():
    return {"status": "ok"}
```
Además, en este step se crean: `backend/conftest.py` (vacío); `backend/pytest.ini` con sección `[pytest]` y el marker `llm: tests que requieren LLM real (API key + red)`; `backend/.gitignore` (`.venv/`, `.env`, `__pycache__/`, `.pytest_cache/`); `.gitignore` del root (añadir `backend/.venv/`, `backend/.env`, `samples/dvwa/`, `samples/miniapp/node_modules/`); y `backend/README.md` con el orden de arranque: 1) `py -3.12 -m venv .venv`, 2) `.venv\Scripts\python.exe -m pip install -r requirements.txt`, 3) crear `.env` desde `.env.example`, 4) desde `backend/`: `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`.

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_health.py -v`
Expected: PASS (1 test).

- [ ] **Step 7: Comprobación final de la task + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → 1 passed.
```powershell
git add backend/ .gitignore
git commit -m "feat(backend): scaffold FastAPI con health, entorno y pytest"
git push
```

---

### Task 2: Scanner + miniapp + `GET /api/projects`

**Files:**
- Create: `backend/app/config.py`, `backend/app/scanner.py`, `backend/app/projects.py`, `backend/tests/test_scanner.py`, `backend/tests/test_projects.py`, `samples/miniapp/**` (lista en Step 8), `samples/README.md`
- Modify: `backend/app/main.py` (endpoint `GET /api/projects`)

**Interfaces:**
- Consumes: Task 1 (`app.main.app`).
- Produces:
  - `config.load_settings() -> Settings`. `Settings` dataclass: `llm_api_key: str`, `llm_base_url: str`, `llm_model: str`, `llm_concurrency: int`, `samples_dir: Path`. Lee `backend/.env` con parser propio (líneas `KEY=VALUE`, saltar comentarios `#` y vacías); el entorno del sistema tiene prioridad. Defaults: `llm_base_url="https://aitana.serbatic.es/v1"`, `llm_model="qwen3.8-fp8"`, `llm_concurrency=3`, `samples_dir = <repo_root>/samples` (desde `backend/app/config.py`: `Path(__file__).resolve().parents[2] / "samples"`).
  - `scanner.scan_project(root: Path, scope: list[str]) -> ScanResult`. `scope`: lista de subdirectorios relativos; la raíz completa del proyecto se expresa con una sola entrada, el punto (placeholder `["."]` de este plan).
    - `CodeFile` dataclass: `path: str` (relativo, separador `/`), `lines: int`, `content: str`.
    - `ScanResult` dataclass: `files: list[CodeFile]`, `manifests: list[CodeFile]`, `all_paths: set[str]` (código ∪ manifiestos), `total_chars: int` (suma de `len(content)` de `files`).
    - Constantes: `CODE_EXTS = {".py",".js",".ts",".jsx",".tsx",".php",".java",".rb",".go",".cs"}`; `EXCLUDED_DIRS = {"node_modules",".git","dist","build","__pycache__",".venv","venv","assets","static","img","images"}`; `MANIFEST_NAMES = {"package.json","composer.json","requirements.txt","pyproject.toml","go.mod","pom.xml","Cargo.toml"}`; `MAX_FILE_BYTES = 200_000`; `MAX_TOTAL_CHARS = 600_000`.
    - Un archivo se clasifica como manifiesto si su nombre está en `MANIFEST_NAMES` (y está dentro del scope); los manifiestos NO cuentan para `total_chars` pero SÍ están en `all_paths`.
  - `projects.PROJECT_SCOPES: dict[str, list[str]]` con dos entradas: `miniapp` → `["."]`; `dvwa` → `["vulnerabilities", "include"]`.
  - `projects.list_projects(samples_dir: Path) -> list[ProjectInfo]`; `ProjectInfo` dataclass: `id: str`, `name: str`, `path: str` (absoluto, separador `/`), `files: int`, `lines: int`. `id == name == nombre de la subcarpeta`. Solo subcarpetas con ≥1 archivo de código según su scope; orden alfabético.
  - `projects.get_project(samples_dir: Path, project_id: str) -> tuple[ProjectInfo, ScanResult] | None`.
  - `GET /api/projects` → `list[ProjectInfo]` como dicts (usa `load_settings().samples_dir`).

- [ ] **Step 1: Escribir los tests que fallan (scanner)**

`backend/tests/test_scanner.py` — fixture temporal con: `src/a.js` (2 líneas), `b.py` (1 línea), `node_modules/x.js` (excluido), `package.json` (manifiesto), `big.js` de `MAX_FILE_BYTES + 1` chars (omitido), `sub/c.ts` (1 línea). Tests:
```python
def test_scans_code_and_manifests(proj):
    r = scan_project(proj, ["."])
    assert {f.path for f in r.files} == {"src/a.js", "b.py", "sub/c.ts"}
    assert [m.path for m in r.manifests] == ["package.json"]
    assert r.all_paths == {"src/a.js", "b.py", "sub/c.ts", "package.json"}
    assert r.total_chars == len("line1\nline2\n") + len("x = 1\n") + len("let x = 0\n")


def test_scope_limits_files(proj):
    r = scan_project(proj, ["sub"])
    assert [f.path for f in r.files] == ["sub/c.ts"]
```
(`proj` = fixture `tmp_path` que crea los archivos descritos; `big.js` no aparece en ningún resultado.)

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_scanner.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.scanner'`.

- [ ] **Step 3: Implementar `backend/app/config.py` y `backend/app/scanner.py`**

`scanner.py`: recorrido con `Path.rglob` dentro de cada entrada de scope (si la entrada no existe, se ignora); saltar dirs de `EXCLUDED_DIRS`; un archivo es código si su sufijo está en `CODE_EXTS` y tamaño ≤ `MAX_FILE_BYTES`; es manifiesto si su nombre está en `MANIFEST_NAMES`; `lines = content.count("\n") + (0 if content.endswith("\n") or not content else 1)`; rutas relativas con `/`. Lectura con `encoding="utf-8", errors="ignore"`.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_scanner.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Escribir los tests que fallan (projects)**

`backend/tests/test_projects.py` — fixture `samples_dir` temporal con dos subcarpetas: `miniapp/` (2 archivos `.js` + `package.json`) y `dvwa/` (con `vulnerabilities/x.php` y `include/y.php`, más un `setup/zz.php` fuera de scope). Tests:
```python
def test_lists_both_projects(samples_dir):
    ps = list_projects(samples_dir)
    assert [(p.id, p.files) for p in ps] == [("dvwa", 2), ("miniapp", 2)]


def test_missing_dvwa_is_fine(tmp_path):
    (tmp_path / "miniapp").mkdir()
    (tmp_path / "miniapp" / "a.js").write_text("x\n", encoding="utf-8")
    ps = list_projects(tmp_path)
    assert [p.id for p in ps] == ["miniapp"]


def test_get_project_returns_scan(samples_dir):
    info, scan = get_project(samples_dir, "dvwa")
    assert info.id == "dvwa"
    assert {f.path for f in scan.files} == {"vulnerabilities/x.php", "include/y.php"}
```
Y en `test_projects.py` un test del endpoint (usa `TestClient(app)` con `monkeypatch` del env `SAMPLES_DIR` apuntando a `samples_dir`):
```python
def test_api_projects(monkeypatch, samples_dir):
    monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))
    r = TestClient(app).get("/api/projects")
    assert r.status_code == 200
    assert {p["id"] for p in r.json()} == {"dvwa", "miniapp"}
```

- [ ] **Step 6: Ejecutar y verificar que falla, e implementar `projects.py` + endpoint**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_projects.py -v` → FAIL (import).
Implementar `backend/app/projects.py` (interfaces de arriba; `list_projects` ignora subcarpetas sin código y subcarpetas cuyo nombre empieza por `.`) y añadir en `backend/app/main.py`:
```python
from app.projects import list_projects
from app.config import load_settings


@app.get("/api/projects")
def get_projects():
    return list_projects(load_settings().samples_dir)
```
Expected: PASS (4 tests).

- [ ] **Step 7: Crear `samples/miniapp` (app Express vulnerable de ejemplo) y `samples/README.md`**

Archivos de `samples/miniapp/` (Node, única dep nativa: ninguna; `package.json` con `express` y las deps vulnerables conocidas):
- `package.json`: `name "miniapp"`, `version "1.0.0"`, `scripts: {"start": "node server.js"}`, dependencies: `"express": "^4.19.2"`, `"debug": "2.6.9"` (CVE-2017-16137), `"lodash": "4.17.15"` (CVE-2020-8203).
- `server.js`: `const app = require('./app'); const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log('miniapp en http://localhost:' + PORT));`
- `app.js`: `express()`; monta `cors(app)` y `audit(app)`; `app.use(require('./routes/admin'))` y el resto de routers (`orders`, `login`, `transfer`, `plugins`, `report`); `module.exports = app;`
- `routes/admin.js` — **A01**:
```js
const router = require('express').Router();
const db = require('../utils/db');
// A01: no se comprueba autorización ni rol
router.get('/api/admin/users', (req, res) => { res.json(db.users) });
module.exports = router;
```
- `utils/db.js`: `users` (array de 2 objetos con `username` y `passwordHash` = MD5 vía `./crypto`), `orders = []`, `function query(sql) { console.log('SQL:', sql); return { ok: true } }`, `function transfer(from, to, amount) { /* mueve saldo en memoria */ }`; exportar todo.
- `utils/crypto.js` — **A02**:
```js
const crypto = require('crypto');
const API_SECRET = 'serbatic-2024'; // A02: secreto hardcodeado
function hashPassword(pw) {
  return crypto.createHash('md5').update(pw).digest('hex'); // A02: MD5
}
module.exports = { hashPassword, API_SECRET };
```
- `routes/orders.js` — **A03**:
```js
const router = require('express').Router();
const db = require('../utils/db');
router.post('/api/orders', (req, res) => {
  const sql = `INSERT INTO orders (item, qty) VALUES ('${req.body.item}', ${req.body.qty})`; // A03: SQL concatenada
  db.query(sql);
  res.json({ ok: true });
});
module.exports = router;
```
- `routes/transfer.js` — **A04**:
```js
const router = require('express').Router();
const db = require('../utils/db');
router.post('/api/transfer', (req, res) => {
  // A04: el límite de 10000 por transferencia se valida solo en el cliente
  db.transfer(req.body.from, req.body.to, req.body.amount);
  res.json({ ok: true });
});
module.exports = router;
```
- `middleware/cors.js` — **A05** (sin lib `cors`):
```js
module.exports = function cors(app) {
  // A05: CORS abierto con credenciales
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });
};
```
- `routes/login.js` — **A07**:
```js
const router = require('express').Router();
const db = require('../utils/db');
const { hashPassword } = require('../utils/crypto');
router.post('/api/login', (req, res) => {
  // A07: sin rate-limit y token predecible
  const user = db.users.find((u) => u.username === req.body.username);
  if (user && user.passwordHash === hashPassword(req.body.password)) {
    const token = Math.random().toString(36).slice(2);
    res.json({ ok: true, user: user.username, token });
  } else {
    res.status(401).json({ ok: false, error: 'credenciales inválidas' });
  }
});
module.exports = router;
```
- `routes/plugins.js` — **A08**:
```js
const router = require('express').Router();
router.post('/api/plugins', (req, res) => {
  // A08: ejecución de código no verificado del cliente
  try { eval(req.body.code); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ ok: false, error: String(e) }); }
});
module.exports = router;
```
- `routes/report.js` — **A10**:
```js
const https = require('https');
const router = require('express').Router();
router.get('/api/report', (req, res) => {
  // A10: la URL la controla el cliente, sin allowlist
  https.get(req.query.url, (up) => {
    let d = '';
    up.on('data', (c) => { d += c; });
    up.on('end', () => res.send(d));
  });
});
module.exports = router;
```
- `middleware/audit.js` — **A09**:
```js
module.exports = function audit(app) {
  app.use('/api/login', (req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (body && body.ok) console.log('LOGIN OK user=' + body.user); // A09: solo se loguea el éxito
      return orig(body);
    };
    next();
  });
};
```
- `expected-findings.json` (1 entrada por categoría, `file` relativo):
```json
[
  { "vulnId": "A01", "file": "routes/admin.js" },
  { "vulnId": "A02", "file": "utils/crypto.js" },
  { "vulnId": "A03", "file": "routes/orders.js" },
  { "vulnId": "A04", "file": "routes/transfer.js" },
  { "vulnId": "A05", "file": "middleware/cors.js" },
  { "vulnId": "A06", "file": "package.json" },
  { "vulnId": "A07", "file": "routes/login.js" },
  { "vulnId": "A08", "file": "routes/plugins.js" },
  { "vulnId": "A09", "file": "middleware/audit.js" },
  { "vulnId": "A10", "file": "routes/report.js" }
]
```
- `samples/README.md`: cómo arrancar miniapp (`cd samples/miniapp && npm install && npm start`) y cómo clonar DVWA: `git clone --depth 1 https://github.com/digininja/DVWA samples/dvwa` (desde el root del repo; `samples/dvwa` queda gitignored). Nota: DVWA no necesita arrancar para el análisis (scope: `vulnerabilities/` + `include/`).

- [ ] **Step 8: Sanity del miniapp + comprobación final + commit**

Run (workdir repo root):
```powershell
Get-ChildItem samples\miniapp -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "node --check falló en $($_.FullName)" } }
node -e "JSON.parse(require('fs').readFileSync('samples/miniapp/expected-findings.json','utf8'))"
```
Expected: sin errores; `expected-findings.json` válido con 10 entradas.
Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todos los tests de la task (scanner + projects + health) en verde.
```powershell
git add samples/ backend/app backend/tests .gitignore
git commit -m "feat(backend): escáner de proyectos, miniapp de ejemplo y GET /api/projects"
git push
```

---


### Task 3: Cliente LLM + agente perfilador

**Files:**
- Create: `backend/app/llm.py`, `backend/app/agents/__init__.py` (vacío), `backend/app/agents/profile.py`, `backend/tests/test_llm.py`, `backend/tests/test_profile.py`

**Interfaces:**
- Consumes: Task 1 (`load_settings` de Task 2 para el arranque; aquí el cliente recibe parámetros explícitos).
- Produces:
  - `llm.LLMError(Exception)`.
  - `llm.LLMClient`:
    ```python
    class LLMClient:
        def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 180.0) -> None: ...
        async def chat(self, system: str, user: str, max_tokens: int = 8000) -> str: ...
        async def close(self) -> None: ...
    ```
    `chat` hace `POST {base_url}/chat/completions` con `Authorization: Bearer {api_key}` y body `{"model", "messages": [{"role":"system",...},{"role":"user",...}], "temperature": 0, "max_tokens", "chat_template_kwargs": {"enable_thinking": false}}` (httpx.AsyncClient); devuelve `choices[0].message.content`; no-2xx o red → `LLMError` con el detalle del status.
  - `agents/profile.Profile` dataclass: `name: str`, `language: str`, `frameworks: list[dict]` (cada uno `{"name","version"}`), `entry_points: list[str]`, `description: str`, `notes: str`; método `to_dict()`.
  - `agents/profile.build_profile_prompt(scan: ScanResult, project_name: str) -> tuple[str, str]` (system, user). El system debe contener la frase literal `agente perfilador` (la usan los tests y el `FakeLLM`) y exigir JSON sin markdown con las claves `name, language, frameworks, entry_points, description, notes`. El user lleva `## Proyecto: {project_name}`, el árbol de archivos (relativos) y los manifiestos como bloques.
  - `agents/profile.parse_profile(raw: str) -> Profile | None`: extrae el primer objeto JSON válido (tolerante a fences ```json y a prosa); sin JSON → `None`.
  - `agents/profile.fallback_profile(scan: ScanResult, project_name: str) -> Profile`: `language` por extensión dominante de `scan.files` (`.js`/`.jsx`→«JavaScript», `.ts`/`.tsx`→«TypeScript», `.py`→«Python», `.php`→«PHP», `.java`→«Java», `.rb`→«Ruby», `.go`→«Go», `.cs`→«C#»; si no hay archivos, «Desconocido»), `frameworks=[]`, `entry_points=[]`, `notes="perfil generado por reglas"`.
  - `agents/profile.run_profile(llm: LLMClient, scan: ScanResult, project_name: str) -> tuple[Profile, bool]`: `bool` = `used_fallback`; si `llm.chat` lanza `LLMError` o `parse_profile` da `None` → fallback.

- [ ] **Step 1: Escribir los tests que fallan (`test_llm.py`)**

Usa `httpx.MockTransport` (el constructor de `LLMClient` acepta un parámetro opcional `transport` para pruebas, documentado como «solo para tests»):
```python
@pytest.mark.anyio
async def test_chat_sends_correct_body():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.read())
        return httpx.Response(200, json={"choices": [{"message": {"content": "hola"}}]})

    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8", transport=httpx.MockTransport(handler))
    out = await c.chat("sistema", "usuario")
    await c.close()
    assert out == "hola"
    assert seen["path"] == "/v1/chat/completions"
    assert seen["auth"] == "Bearer TESTKEY"
    assert seen["body"]["model"] == "qwen3.8-fp8"
    assert seen["body"]["temperature"] == 0
    assert seen["body"]["max_tokens"] == 8000
    assert seen["body"]["chat_template_kwargs"] == {"enable_thinking": False}


@pytest.mark.anyio
async def test_chat_error_raises():
    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8",
                  transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(LLMError):
        await c.chat("s", "u")
    await c.close()
```
(Importar `json` al inicio del test; el parámetro `transport` de `LLMClient` se documenta en su docstring como «solo para tests».)

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_llm.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.llm'`.

- [ ] **Step 3: Implementar `backend/app/llm.py`**

`LLMClient.__init__(self, base_url, api_key, model, timeout=180.0, transport=None)` crea un `httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport, headers={"Authorization": f"Bearer {api_key}"})`. `chat` como en Interfaces. `close` → `await self._client.aclose()`.

- [ ] **Step 4: Escribir los tests que fallan (`test_profile.py`)**

`FakeLLM` (mismo patrrollo que usará Task 5):
```python
class FakeProfileLLM:
    def __init__(self, raw): self.raw = raw; self.calls = 0
    async def chat(self, system, user, max_tokens=8000):
        self.calls += 1
        return self.raw
```
Tests (con un fixture `scan` pequeño de 2 archivos `.js` + `package.json`):
```python
def test_parse_profile_clean():
    p = parse_profile('{"name":"m","language":"JavaScript","frameworks":[{"name":"Express","version":"4.19"}],"entry_points":["server.js"],"description":"d","notes":""}')
    assert p.language == "JavaScript" and p.frameworks[0]["name"] == "Express"


def test_parse_profile_fenced_and_prose():
    raw = 'Aquí tienes:\n```json\n{"name":"m","language":"Python","frameworks":[],"entry_points":[],"description":"","notes":""}\n```\nListo.'
    assert parse_profile(raw).language == "Python"


def test_parse_profile_junk():
    assert parse_profile("esto no es json") is None


def test_fallback_profile_by_extension():
    p = fallback_profile(scan_js, "miniapp")
    assert p.language == "JavaScript" and p.notes == "perfil generado por reglas"


def test_run_profile_uses_fallback_on_junk():
    import asyncio
    prof, used = asyncio.run(run_profile(FakeProfileLLM("no json"), scan_js, "miniapp"))
    assert used is True and prof.language == "JavaScript"
```

- [ ] **Step 5: Ejecutar y verificar que falla, e implementar `agents/profile.py`**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_profile.py -v` → FAIL (import).
Implementar `profile.py` (interfaces de arriba). Para extraer JSON: recorrer el string buscando el primer `{` y usar `json.JSONDecoder().raw_decode` desde ahí (reintentando en el siguiente `{` si falla); igual con `[` no hace falta aquí (es objeto).
Expected: PASS (5 tests).

- [ ] **Step 6: Comprobación final de la task + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde (health + scanner + projects + llm + profile).
```powershell
git add backend/app backend/tests
git commit -m "feat(backend): cliente LLM OpenAI-compatible y agente perfilador"
git push
```

---

### Task 4: Agentes de vulnerabilidad A01–A10 (prompts, parse, validación)

**Files:**
- Create: `backend/app/agents/vulns.py`, `backend/tests/test_vulns.py`

**Interfaces:**
- Consumes: `ScanResult` (Task 2), `Profile` (Task 3).
- Produces (todo en `agents/vulns.py`):
  - `VULN_NAMES: dict[str, str]` — los 10 nombres oficiales (Global Constraints).
  - `VULN_PROMPTS: dict[str, str]` — 10 entradas (A01..A10), cada una 3–8 líneas en español con qué buscar y patrones típicos de esa categoría. La de A06 debe mencionar explícitamente «revisar los manifiestos de dependencias (package.json, etc.) en busca de versiones conocidas como vulnerables (CVE públicos)». A03 debe mencionar inyección SQL, de comandos y de expresiones.
  - `COMMON_RULES: str` — reglas comunes: eres un auditor de seguridad de Serbatic; **solo reportas lo que ves en el código proporcionado** (prohibido el «podría», «probablemente»); rutas relativas y números de línea reales del código proporcionado; severidad por impacto real (critical: explotación directa con impacto grave; high; medium; low); si no hay hallazgos, array vacío; la respuesta es SOLO el array JSON.
  - `build_vuln_prompt(vuln_id: str, profile: Profile, scan: ScanResult) -> tuple[str, str]`:
    - system = `Eres el agente {vuln_id} ({VULN_NAMES[vuln_id]}) de Serbatic Security Inspector. ` + `VULN_PROMPTS[vuln_id]` + COMMON_RULES + ` Devuelve solo JSON válido: un array de objetos con las claves severity, title, file, line, snippet, exploit, consequences, solution. severity debe ser critical, high, medium o low.`
    - user: empieza con la línea exacta `Categoría: {vuln_id} · {VULN_NAMES[vuln_id]}`; luego 1 línea de resumen del perfil (`Perfil: {language} — {n} frameworks`); luego `## Código:` con un bloque por archivo de `scan.files` y de `scan.manifests`: `\n// ── {path} ──\n{content}` (los manifiestos con cabecera `// ── {path} (manifiesto) ──`).
  - `SEVERITIES = ("critical", "high", "medium", "low")`.
  - `parse_findings(raw: str, vuln_id: str) -> list[dict]`: tolerante a fences/prosa (mismo enfoque que `parse_profile` pero con el primer `[`); devuelve la lista de dicts o `[]` si no hay array JSON válido.
  - `validate_finding(f: dict, scan: ScanResult) -> bool`: `f["file"]` está en `scan.all_paths`; `f["line"]` es int con `1 <= line <= lines` del archivo (buscado en `files` o `manifests`); `f["severity"]` está en `SEVERITIES`; `f["title"]` es str no vacío.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_vulns.py` (fixture `scan` con `routes/orders.js` de 10 líneas, `routes/admin.js` de 6 líneas y `package.json` manifiesto; fixture `profile` = `Profile("miniapp","JavaScript",[{"name":"Express","version":"4.19"}],["server.js"],"d","")`):
```python
def test_prompts_cover_the_ten():
    assert set(VULN_PROMPTS) == {f"A{i:02d}" for i in range(1, 11)}


def test_build_prompt_contains_category_code_and_manifests():
    system, user = build_vuln_prompt("A03", profile, scan)
    assert user.startswith("Categoría: A03 · Inyección")
    assert "// ── routes/orders.js ──" in user
    assert "// ── package.json (manifiesto) ──" in user
    assert "Inyección" in system


def test_parse_findings_clean():
    raw = '[{"severity":"high","title":"SQLi","file":"routes/orders.js","line":4,"snippet":"x","exploit":"e","consequences":"c","solution":"s"}]'
    assert len(parse_findings(raw, "A03")) == 1


def test_parse_findings_fenced_prose_and_junk():
    fenced = 'Claro:\n```json\n[{"severity":"low","title":"t","file":"a.js","line":1,"snippet":"","exploit":"","consequences":"","solution":""}]\n```'
    assert len(parse_findings(fenced, "A05")) == 1
    assert parse_findings("nada", "A05") == []


def test_validate_finding_rules():
    good = {"severity": "high", "title": "t", "file": "routes/orders.js", "line": 4,
            "snippet": "s", "exploit": "e", "consequences": "c", "solution": "sol"}
    assert validate_finding(good, scan) is True
    assert validate_finding({**good, "file": "nope.js"}, scan) is False
    assert validate_finding({**good, "line": 99999}, scan) is False
    assert validate_finding({**good, "severity": "urgent"}, scan) is False
    assert validate_finding({**good, "title": ""}, scan) is False
    # manifiestos son válidos como file (ruling R2)
    assert validate_finding({**good, "file": "package.json", "line": 2}, scan) is True
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_vulns.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.agents.vulns'`.

- [ ] **Step 3: Implementar `backend/app/agents/vulns.py`**

Interfaces de arriba. Redacción de `VULN_PROMPTS` (ejemplo A03 para fijar el tono; el implementador escribe el resto con el mismo criterio): «Busca inyección: SQL (concatenación de entrada del usuario en consultas), comandos de sistema y evaluación de expresiones. Revisa rutas, handlers y utilidades que construyan queries, shell commands o eval a partir de `req.body`, `req.query`, `req.params` o variables de entrada.»
Expected: PASS (5 tests).

- [ ] **Step 4: Comprobación final de la task + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo verde.
```powershell
git add backend/app/agents/vulns.py backend/tests/test_vulns.py
git commit -m "feat(backend): agentes de vulnerabilidad A01-A10 (prompts, parse, validación)"
git push
```

---


### Task 5: Pipeline de 2 oleadas + registro de runs + SSE + cancel/supersede

**Files:**
- Create: `backend/app/runs.py`, `backend/app/pipeline.py`, `backend/tests/test_runs_api.py`, `backend/tests/test_pipeline.py`
- Modify: `backend/app/main.py` (endpoints `POST /api/analyze`, `GET /api/runs/{run_id}/events`, `POST /api/runs/{run_id}/cancel`)

**Interfaces:**
- Consumes: Task 2 (`load_settings`, `get_project`), Task 3 (`LLMClient`, `run_profile`), Task 4 (`build_vuln_prompt`, `parse_findings`, `validate_finding`).
- Produces:
  - `runs.RunStatus` (clase con constantes): `RUNNING="running"`, `CANCELLING="cancelling"`, `DONE="done"`, `ERROR="error"`, `CANCELLED="cancelled"`.
  - `runs.RunState` dataclass: `id: str`, `project_id: str`, `vuln_ids: list[str]`, `status: str = RunStatus.RUNNING`, `events: list[dict]`, `findings: list[dict]`, `subscribers: list` (de `asyncio.Queue`), `start_time: float`.
  - `runs.emit(run: RunState, etype: str, **payload) -> None`: evento = `{"type": etype, "t": round(time.time() - run.start_time, 1), **payload}`; lo añade a `run.events` y lo encola en cada subscriber.
  - `runs.RunRegistry`:
    - `active: RunState | None`; `runs: dict[str, RunState]`.
    - `start(self, project_id: str, vuln_ids: list[str]) -> RunState | None` — `None` = conflicto. Regla de slot (ruling R3): si `active` y `active.status == RUNNING` → `None`; si `active` y `active.status == CANCELLING` → `emit(active, "run:cancelled")`, `active.status = CANCELLED`, y arranca el nuevo (supersede); si no hay `active` o está en estado terminal → arranca el nuevo. `id` = `uuid4().hex[:8]`.
    - `get(self, run_id: str) -> RunState | None`.
    - `cancel(self, run_id: str) -> bool`: solo si status `RUNNING` → pasa a `CANCELLING` (True); si no, False.
    - `finish(self, run: RunState) -> None`: si `self.active is run` y `run.status` está en {DONE, ERROR, CANCELLED} → `self.active = None`.
  - `pipeline.run_pipeline(llm, scan: ScanResult, project_name: str, vuln_ids: list[str], run: RunState, concurrency: int) -> None` (async). Flujo fijo:
    1. `emit(run, "run:start", projectId=project_name, vulnIds=vuln_ids, files=len(scan.files), lines=total_líneas)`.
    2. Guarda de tamaño: si `scan.total_chars > MAX_TOTAL_CHARS` → `emit(run, "run:error", message=f"Proyecto demasiado grande para la Fase 2a ({scan.total_chars // 1000} KB de código)")`, `run.status = ERROR`, return.
    3. `profile, used_fallback = await run_profile(llm, scan, project_name)`; `emit(run, "profile:done", profile=profile.to_dict())`; `emit(run, "log", vulnId="global", message=f"Perfil: {profile.language} — {len(profile.frameworks)} frameworks · {len(scan.files)} archivos, {total_líneas} líneas")`; si `used_fallback` → `emit(run, "log", vulnId="global", message="Perfil generado por reglas (el LLM no devolvió JSON válido)")`.
    4. Para cada vuln en orden canónico (A01..A10 filtradas por `vuln_ids`): `emit(run, "agent:start", vulnId=v)` (todos antes de lanzar el pool).
    5. Pool: `sem = asyncio.Semaphore(concurrency)`; una task por agente. Cada task:
       - si `run.status == CANCELLING` → `emit(run, "agent:done", vulnId=v, findingsCount=0, criticalCount=0)` + `emit(run, "log", vulnId=v, message="agente cancelado")` y return.
       - `system, user = build_vuln_prompt(v, profile, scan)`; `raw = await llm.chat(system, user)` dentro de `try/except LLMError as e`: si `run.status != ERROR` → `run.status = ERROR`, `emit(run, "run:error", message=str(e))`; return.
       - si tras el chat `run.status == ERROR` → return (descartar sin emitir).
       - `raw_findings = parse_findings(raw, v)`; `valid = [f for f in raw_findings if validate_finding(f, scan)]`; `discarded = len(raw_findings) - len(valid)`.
       - Para cada `f` en `valid` (índice `i` 1-based): `emit(run, "log", vulnId=v, severity=f["severity"], message=f"[{SEVERITY_ES[f['severity']]}] {f['file']}:{f['line']} — {f['title']}")` donde `SEVERITY_ES = {"critical":"CRÍTICO","high":"ALTO","medium":"MEDIO","low":"BAJO"}` (definido en `pipeline.py`); `run.findings.append({**f, "id": f"{v}-{i}", "vulnId": v})`.
       - si `discarded > 0` → `emit(run, "log", vulnId=v, message=f"descartados {discarded} hallazgo(s) inválido(s)")`.
       - `emit(run, "agent:done", vulnId=v, findingsCount=len(valid), criticalCount=count criticals)`.
    6. Tras `asyncio.gather` de todas las tasks: si `run.status == CANCELLING` → `emit(run, "run:cancelled", findings=run.findings)`, `run.status = CANCELLED`; si `run.status == ERROR` → nada (ya emitido); si no → `emit(run, "run:done", findings=run.findings, meta={"files": len(scan.files), "lines": total_líneas, "durationMin": max(1, round((time.time() - run.start_time) / 60))})`, `run.status = DONE`.
  - `main.py`: a nivel de módulo `RUNS = RunRegistry()` y `def build_llm() -> LLMClient` (construido desde `load_settings()`; los tests lo monkeypatchean). Endpoints:
    - `POST /api/analyze` — body `{"projectId": str, "vulnIds": list[str]}`: `settings = load_settings()`; `got = get_project(settings.samples_dir, projectId)`; si `None` → `404 {"detail": "Proyecto no encontrado"}`; `run = RUNS.start(projectId, vuln_ids_canónicas)`; si `None` → `409 {"detail": "Ya hay un análisis en curso"}`; `asyncio.create_task(_wrapped(run, scan, project.name, vuln_ids_canónicas))` donde `_wrapped` llama a `run_pipeline` y en `finally` hace `llm.close()` + `RUNS.finish(run)`; devuelve `202 {"runId": run.id}`.
    - `GET /api/runs/{run_id}/events` — 404 si no existe. `StreamingResponse` con `media_type="text/event-stream"`: crea un `asyncio.Queue`, lo añade a `run.subscribers`; re-emite primero todos los `run.events` (`data: {json}\n\n`); si `run.status` ya es terminal → fin del stream; si no, `while True: ev = await q.get(); yield ...` hasta un evento terminal. Al terminar, quita el subscriber.
    - `POST /api/runs/{run_id}/cancel` — 404 si no existe; `200 {"ok": RUNS.cancel(run_id)}`.
  - `vuln_ids_canónicas`: `[v for v in ("A01".."A10") if v in vulnIds]` (constante `ALL_VULN_IDS` en `pipeline.py`).

- [ ] **Step 1: Escribir los tests que fallan (`test_pipeline.py`)**

Fixture compartido `FakeVulnLLM` (patrón que también usan los tests de API):
```python
class FakeVulnLLM:
    """Responde por categorías: perfil si el system contiene 'perfilador';
    si no, extrae la categoría de la línea 'Categoría: A0X' del user.
    Implementa `close()` porque la API lo llama en `finally`."""
    def __init__(self, canned_by_vuln, profile_raw, fail_vulns=(), delay=0.0):
        ...
    async def chat(self, system, user, max_tokens=8000):
        if "perfilador" in system: return self.profile_raw
        import re
        m = re.search(r"Categoría: (A\d+)", user)
        v = m.group(1)
        if v in self.fail_vulns: raise LLMError("boom de prueba")
        if self.delay: await asyncio.sleep(self.delay)
        return self.canned_by_vuln[v]
    async def close(self): pass
```
`canned_by_vuln["A01"]` = array JSON con 1 hallazgo válido (`file "routes/admin.js"`, `line 5`, severidad `high`); `canned_by_vuln["A03"]` = array con 1 válido (`routes/orders.js`, `line 4`) + 2 inválidos (`file "nope.js"` y `line 99999`). Fixture `scan` idéntico al de Task 4 (con esos archivos). Tests:
```python
def types(events): return [e["type"] for e in events]

def test_pipeline_full_sequence():
    run = RunRegistry().start("miniapp", ["A01", "A03"])
    llm = FakeVulnLLM({...}, PROFILE_JSON)
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=2))
    assert types(run.events)[:3] == ["run:start", "profile:done", "agent:start"]
    assert run.events[3]["type"] == "agent:start"  # A03, todos los starts antes del pool
    assert types(run.events)[-1] == "run:done"
    assert [f["id"] for f in run.findings] == ["A01-1", "A03-1"]
    assert run.findings[0]["vulnId"] == "A01"
    assert any("descartados 2 hallazgo(s) inválido(s)" in e.get("message", "") for e in run.events)
    assert run.status == RunStatus.DONE


def test_pipeline_llm_error_emits_error_and_finishes():
    reg = RunRegistry(); run = reg.start("miniapp", ["A01"])
    llm = FakeVulnLLM({}, PROFILE_JSON, fail_vulns={"A01"})
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01"], run, concurrency=1))
    assert types(run.events)[-1] == "run:error"
    assert run.status == RunStatus.ERROR
    reg.finish(run); assert reg.active is None


def test_pipeline_size_guard():
    big = ScanResult(files=[CodeFile("a.js", 1, "x" * (MAX_TOTAL_CHARS + 1))], manifests=[], all_paths={"a.js"}, total_chars=MAX_TOTAL_CHARS + 1)
    run = RunRegistry().start("miniapp", ["A01"])
    asyncio.run(run_pipeline(FakeVulnLLM({}, PROFILE_JSON), big, "miniapp", ["A01"], run, concurrency=1))
    assert types(run.events) == ["run:start", "run:error"]
    assert "demasiado grande" in run.events[1]["message"]


def test_pipeline_cancelled_skips_agents():
    reg = RunRegistry(); run = reg.start("miniapp", ["A01", "A03"])
    assert reg.cancel(run.id)
    llm = FakeVulnLLM({...}, PROFILE_JSON)
    asyncio.run(run_pipeline(llm, scan, "miniapp", ["A01", "A03"], run, concurrency=2))
    assert types(run.events)[-1] == "run:cancelled"
    assert run.findings == [] and run.status == RunStatus.CANCELLED
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_pipeline.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.pipeline'`.

- [ ] **Step 3: Implementar `runs.py` y `pipeline.py`**

Interfaces de arriba. Notas: `emit` no bloquea (los queues no tienen límite en 2a); en `_wrapped` de `main.py`, el `llm.close()` y `RUNS.finish(run)` van en `finally`.

- [ ] **Step 4: Escribir los tests que fallan (`test_runs_api.py`)**

`FakeVulnLLM` con `delay=0.5` para que el run siga activo durante las pruebas. En cada test: `monkeypatch.setenv("SAMPLES_DIR", str(samples_dir))` (fixture como en Task 2) y `monkeypatch.setattr("app.main.build_llm", lambda: FakeVulnLLM(...))`. Helper para leer el stream hasta el final:
```python
def drain_events(client, run_id):
    events = []
    with client.stream("GET", f"/api/runs/{run_id}/events") as r:
        assert r.status_code == 200
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events
```
Tests:
```python
def test_analyze_202_and_sse_full_replay():
    r = TestClient(app).post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01", "A03"]})
    assert r.status_code == 202
    run_id = r.json()["runId"]
    ev = drain_events(client=TestClient(app), run_id=run_id)  # llega tarde: replay completo
    assert ev[0]["type"] == "run:start" and ev[-1]["type"] == "run:done"
    assert "findings" in ev[-1] and "meta" in ev[-1]


def test_409_when_run_active():
    c = TestClient(app)
    assert c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01"]}).status_code == 202
    r = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A03"]})
    assert r.status_code == 409 and r.json()["detail"] == "Ya hay un análisis en curso"


def test_supersede_after_cancel():
    c = TestClient(app)
    first = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A01"]}).json()["runId"]
    assert c.post(f"/api/runs/{first}/cancel").json()["ok"] is True
    second = c.post("/api/analyze", json={"projectId": "miniapp", "vulnIds": ["A03"]})
    assert second.status_code == 202  # supersede (ruling R3)


def test_unknown_project_404():
    r = TestClient(app).post("/api/analyze", json={"projectId": "nope", "vulnIds": ["A01"]})
    assert r.status_code == 404 and r.json()["detail"] == "Proyecto no encontrado"
```
Nota: los tests usan el `RUNS` global de `app.main`; cada test debe empezar con `app.main.RUNS.active = None` (fixture `autouse`) para no contaminar.

- [ ] **Step 5: Ejecutar y verificar que falla, e implementar los endpoints en `main.py`**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest tests\test_runs_api.py -v` → FAIL.
Implementar (Interfaces de arriba). `StreamingResponse` de `fastapi.responses`; json con `ensure_ascii=False`.
Expected: PASS (4 tests).

- [ ] **Step 6: Comprobación final de la task + commit**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -q` → todo el backend verde (health, scanner, projects, llm, profile, vulns, pipeline, runs_api).
```powershell
git add backend/app backend/tests
git commit -m "feat(backend): pipeline de 2 oleadas, SSE con replay, cancel y supersede"
git push
```

---


### Task 6: `liveAnalysisService` (SSE) + estado de error

**Files:**
- Create: `src/services/liveAnalysisService.ts`, `src/services/liveAnalysisService.test.ts`
- Modify: `src/types.ts` (solo `AnalysisProgress`)

**Interfaces:**
- Consumes: `AnalysisService`, `AnalysisProgress`, `AgentProgress`, `LogLine`, `Finding` (types existentes), `OWASP_VULNS` (data/owasp).
- Produces:
  - `src/types.ts`: `AnalysisProgress.status: 'idle' | 'running' | 'done' | 'error'` y nueva propiedad `error?: string` en `AnalysisProgress`. El mock no cambia (nunca emite `'error'`).
  - `createLiveAnalysisService(opts?: { tickMs?: number }): AnalysisService` (base URL relativa `/api`). Comportamiento fijado:
    - `run({ source, vulnIds }, onUpdate)`:
      1. `fetch('/api/analyze', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ projectId: source.value, vulnIds })})`. Si `!res.ok`: `onUpdate` una única vez con `{ status: 'error', error: res.status === 409 ? 'Ya hay un análisis en curso' : 'Error ' + res.status, globalProgress: 0, agents: [], logLines: [], findings: [] }` y devuelve un `cancel` no-op.
      2. Con `202` → `runId`. Estado inicial: `status: 'running'`, `globalProgress: 0`, `agents` = los vulns elegidas en orden canónico (`pending`, `progress: 0`), `logLines: []`, `findings: []`. Emitir copia.
      3. `es = new EventSource('/api/runs/' + runId + '/events')`. En `onmessage`, parsear `JSON.parse(e.data)` (`{type, t, ...}`) y mapear:
         - `'run:start'` → sin cambio extra (el estado ya está «running»).
         - `'profile:done'` → se ignora en el front (el log del perfil llega como evento `'log'`).
         - `'agent:start'` → ese agente a `status: 'running'`; arrancar la interpolación.
         - `'log'` → `logLines.push({ id: 'log-' + seq++, time: fmt(t), vulnId, severity?, message })`.
         - `'agent:done'` → detener interpolación de ese agente; agente a `{ status: 'done', progress: 100, findingsCount, criticalCount, currentFile: undefined }`.
         - `'run:done'` → `findings`, `meta`, `status: 'done'`, `globalProgress: 100`; `es.close()`.
         - `'run:error'` → `status: 'error'`, `error: message`; `es.close()`.
         - `'run:cancelled'` → `es.close()` (sin cambio de estado; la UI ya ha navegado).
      4. `es.onerror`: si el estado no es terminal → `status: 'error'`, `error: 'Error de conexión con el backend'`; `es.close()`.
      5. `fmt(t)` = `mm:ss` a partir de `t` segundos (mismo formato que el mock).
      6. Interpolación: cada `tickMs` (default 250), para cada agente `running`: `progress = min(90, progress + (90 - progress) * 0.03)`; `globalProgress = round(media de progresses)`; emitir copia. (Progreso cosmético: los eventos reales mandan para log/hallazgos/estado.)
    - `cancel()`: `fetch('/api/runs/' + runId + '/cancel', { method: 'POST' })` (ignorar su resultado y errores), `es.close()`, limpiar el intervalo de interpolación, y marca `cancelled` (nada de `onUpdate` posterior).
    - Todas las emisiones con copias (mismo patrón que `mockAnalysisService.ts`).

- [ ] **Step 1: Cambiar `src/types.ts` y escribir los tests que fallan**

En `src/types.ts`: `status: 'idle' | 'running' | 'done' | 'error'` + `error?: string`.

`src/services/liveAnalysisService.test.ts` — helpers:
```ts
class FakeEventSource {
  static instances: FakeEventSource[] = []
  closed = false
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) { FakeEventSource.instances.push(this) }
  emit(obj: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(obj) }) }
  close() { this.closed = true }
}
```
En `beforeEach`: `FakeEventSource.instances = []`; `vi.stubGlobal('EventSource', FakeEventSource)`; `vi.stubGlobal('fetch', vi.fn())`. Helper `okFetch()` = fetch que responde `Response` 202 `{runId: 'r1'}`.
Tests:
```ts
const A01 = { vulnId: 'A01', severity: 'high', title: 'Admin sin auth', file: 'routes/admin.js', line: 5, snippet: 'x', exploit: 'e', consequences: 'c', solution: 's', id: 'A01-1' } as Finding

test('happy path: run:start → run:done', () => {
  const seen: AnalysisProgress[] = []
  createLiveAnalysisService({ tickMs: 10 }).run({ source: { kind: 'folder', label: 'miniapp', value: 'miniapp' }, vulnIds: ['A01'] }, p => seen.push(p))
  const es = FakeEventSource.instances[0]
  expect(es.url).toBe('/api/runs/r1/events')
  es.emit({ type: 'run:start', t: 0, vulnIds: ['A01'] })
  es.emit({ type: 'profile:done', t: 1, profile: {} })
  es.emit({ type: 'agent:start', t: 1, vulnId: 'A01' })
  es.emit({ type: 'log', t: 2, vulnId: 'A01', severity: 'high', message: '[ALTO] routes/admin.js:5 — Admin sin auth' })
  es.emit({ type: 'agent:done', t: 3, vulnId: 'A01', findingsCount: 1, criticalCount: 0 })
  es.emit({ type: 'run:done', t: 4, findings: [A01], meta: { files: 12, lines: 340, durationMin: 1 } })
  const last = seen[seen.length - 1]
  expect(last.status).toBe('done')
  expect(last.globalProgress).toBe(100)
  expect(last.findings).toEqual([A01])
  expect(last.meta).toEqual({ files: 12, lines: 340, durationMin: 1 })
  expect(last.agents[0]).toMatchObject({ vulnId: 'A01', status: 'done', progress: 100, findingsCount: 1 })
  expect(last.logLines[0].message).toContain('ALTO')
  expect(es.closed).toBe(true)
})

test('409 → estado error con mensaje', () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }))
  const seen: AnalysisProgress[] = []
  const cancel = createLiveAnalysisService().run({ source: { kind: 'folder', label: 'm', value: 'm' }, vulnIds: ['A01'] }, p => seen.push(p))
  expect(seen.length).toBe(1)
  expect(seen[0].status).toBe('error')
  expect(seen[0].error).toBe('Ya hay un análisis en curso')
  cancel()
})

test('run:error → estado error con mensaje', () => {
  // fetch 202 + es.emit({type:'run:error', t: 2, message: 'boom'})
  // último estado: status 'error', error 'boom', es.closed true
})

test('error de conexión SSE → estado error', () => {
  // fetch 202 + es.emit run:start + es.onerror!()
  // último estado: status 'error', error 'Error de conexión con el backend'
})

test('cancel() cierra el stream y no emite después', () => {
  // fetch 202, run:start, agent:start; llamar cancel()
  // fetch recibido en '/api/runs/r1/cancel' (POST); es.closed true
  // es.emit(...) posterior → seen no crece
})

test('interpolación: progreso fino entre agent:start y agent:done', () => {
  // tickMs: 10; tras agent:start esperar ~60 ms → progress > 0 y < 90
  // tras agent:done → progress 100
})
```
(Completar los dos tests acortados con las mismas piezas que el happy path; el de cancelación usa `vi.waitFor` o un `setTimeout` corto para afirmar la estabilidad de `seen.length`.)

- [ ] **Step 2: Ejecutar y verificar que falla**

Run (workdir repo root): `npx vitest run src/services/liveAnalysisService.test.ts`
Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Implementar `src/services/liveAnalysisService.ts`**

Según Interfaces (mismo patrón de estado mutable + emit con copias que `mockAnalysisService.ts`).

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run (workdir repo root): `npx vitest run src/services/liveAnalysisService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Comprobación final de la task (frontend) + commit**

Run (workdir repo root): `npx vitest run` → suite completa verde (los tests existentes deben seguir pasando con el `status` ampliado) y `npm run build` → sin errores.
```powershell
git add src/types.ts src/services/liveAnalysisService.ts src/services/liveAnalysisService.test.ts
git commit -m "feat(front): liveAnalysisService (SSE) y estado de error"
git push
```

---

### Task 7: Modo live en el front (autodetección, proyectos reales, banner de error, proxy Vite)

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/components/source/SourceScreen.tsx`, `src/components/source/SourceScreen.test.tsx`, `src/components/progress/ProgressScreen.tsx`, `src/components/progress/ProgressScreen.test.tsx`, `src/types.ts` (nueva interfaz `ProjectInfo`), `vite.config.ts`

**Interfaces:**
- Consumes: `createLiveAnalysisService` (Task 6), `AnalysisService`/`ProjectInfo` (types).
- Produces:
  - `src/types.ts`: `export interface ProjectInfo { id: string; name: string; path: string; files: number; lines: number }`.
  - `App.tsx`: firma `App({ service, projects }: { service?: AnalysisService; projects?: ProjectInfo[] | null })`. Lógica:
    - Si `service` prop → comportamiento actual exacto (modo mock; los tests existentes no se tocan).
    - Si no hay `service` pero `projects !== null` → modo live directo (lo usan tests E2E): `const live = useMemo(() => createLiveAnalysisService(), [])`; renderizar el wizard con `service={live}` y pasar `projects` a `SourceScreen`.
    - Si no hay ninguna prop (uso real) → autodetección: estado `'loading' | 'live' | 'mock'`; en un `useEffect` al montar: `await fetch('/api/health', { signal: AbortSignal.timeout(1500) })` → si ok, `fetch('/api/projects')` → array → `'live'` (guardar proyectos); cualquier fallo (red, timeout, no-ok) → `'mock'`. Mientras `'loading'`: renderizar `<div className="flex min-h-screen items-center justify-center font-mono text-xs tracking-widest text-ink-dim">CONECTANDO…</div>`.
    - En modo live, el `service` del wizard es `createLiveAnalysisService()` (una instancia por mount).
  - `SourceScreen.tsx`: nueva prop opcional `projects?: ProjectInfo[]`.
    - `projects` **definida** (modo live): sin tablist, sin picker de carpeta, sin tab git. Mismo kicker/titular; radiogroup con una fila por proyecto: `📁 {name}` (cian) + `{path}` (mono, ink-dim) + `{files} archivos` (mono, ink-faint); selección = índice; `canContinue = selected !== null`; `onContinue({ kind: 'folder', label: p.name, value: p.id })`. Debajo de la lista, nota: `Fase 2b: carpeta local y repositorio git` (estilo de las notas existentes: `text-[10px] uppercase tracking-[0.2em] text-ink-faint`).
    - `projects` **undefined** → comportamiento actual exacto (modo mock: demos + picker + git).
  - `ProgressScreen.tsx`: tras el bloque del `h1`, si `analysis.status === 'error'` → banner: `<div className="mt-6 border border-neon-magenta/60 bg-neon-magenta/10 px-4 py-3 shadow-[0_0_12px_rgba(255,45,149,0.25)]"><p className="text-sm text-ink">⚠ {analysis.error}</p></div>`. El botón `← Volver` existente ya sirve para salir (navega con `onBack`).
  - `vite.config.ts`: en `server` añadir `proxy: { '/api': 'http://localhost:8000' }`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/App.test.tsx` (añadir; los tests existentes — que pasan `service` — deben seguir pasando sin cambios):
```tsx
test('autodetección: backend ok → modo live', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url === '/api/health'
      ? new Response('ok', { status: 200 })
      : new Response(JSON.stringify([{ id: 'miniapp', name: 'miniapp', path: '/x', files: 12, lines: 340 }]), { status: 200 })))
  const { findByText } = render(<App />)
  expect(await findByText(/FUENTE|ANALIZAR/i)).toBeTruthy()
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/health')
})

test('autodetección: backend caído → modo mock', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
  const { findByText } = render(<App />)
  expect(await findByText('ANALIZAR APLICACIÓN')).toBeTruthy()
})

test('loading mientras la detección no resuelve', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const { getByText } = render(<App />)
  expect(getByText('CONECTANDO…')).toBeTruthy()
})
```
`src/components/source/SourceScreen.test.tsx` (añadir; tests existentes intactos):
```tsx
const PROJECTS = [
  { id: 'miniapp', name: 'miniapp', path: 'C:/samples/miniapp', files: 12, lines: 340 },
  { id: 'dvwa', name: 'dvwa', path: 'C:/samples/dvwa', files: 88, lines: 4200 },
]

test('modo live: lista real, sin picker ni git', () => {
  const onContinue = vi.fn()
  const { queryByText } = render(<SourceScreen projects={PROJECTS} onBack={() => {}} onContinue={onContinue} />)
  expect(queryByText('SELECCIONAR CARPETA')).toBeNull()
  expect(queryByText('Repositorio git')).toBeNull()
  expect(queryByText('12 archivos')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: /miniapp/ }))
  fireEvent.click(screen.getByText('CONTINUAR ▸'))
  expect(onContinue).toHaveBeenCalledWith({ kind: 'folder', label: 'miniapp', value: 'miniapp' })
})

test('modo live: nota de Fase 2b', () => {
  const { getByText } = render(<SourceScreen projects={PROJECTS} onBack={() => {}} onContinue={() => {}} />)
  expect(getByText(/Fase 2b/)).toBeTruthy()
})
```
`src/components/progress/ProgressScreen.test.tsx` (añadir):
```tsx
test('banner de error cuando el análisis falla', () => {
  const analysis: AnalysisProgress = { status: 'error', error: 'Error 500 del LLM', globalProgress: 10, agents: [], logLines: [], findings: [] }
  const { getByText } = render(<ProgressScreen analysis={analysis} onBack={() => {}} />)
  expect(getByText(/Error 500 del LLM/)).toBeTruthy()
})
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run (workdir repo root): `npx vitest run src/App.test.tsx src/components/source/SourceScreen.test.tsx src/components/progress/ProgressScreen.test.tsx`
Expected: FAIL (los nuevos tests; los antiguos pasan).

- [ ] **Step 3: Implementar (App, SourceScreen, ProgressScreen, vite proxy)**

Según Interfaces de la task.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run (workdir repo root): `npx vitest run src/App.test.tsx src/components/source/SourceScreen.test.tsx src/components/progress/ProgressScreen.test.tsx`
Expected: PASS (nuevos + antiguos).

- [ ] **Step 5: Comprobación final de la task (frontend) + commit**

Run (workdir repo root): `npx vitest run` (suite completa) + `npm run build` → verde.
```powershell
git add src/ vite.config.ts
git commit -m "feat(front): modo live — autodetección, proyectos reales y banner de error"
git push
```

---


### Task 8: E2E real (LLM real + DVWA) + ground truth + cierre de Fase 2a

**Files:**
- Create: `backend/tests/test_miniapp_ground_truth.py`, `samples/dvwa/` (clon gitignored)
- Modify: `PROGRESS.md` (estado + checklist + registro de decisiones)

**Interfaces:**
- Consumes: Tasks 1–7 completas (backend con pipeline; front en modo live).
- Produces: prueba de ground truth (compuerta ≥ 8/10 de `samples/miniapp/expected-findings.json`), evidencia E2E del run de DVWA, `PROGRESS.md` actualizado, tag `v0.2.0`.

- [ ] **Step 1: Clonar DVWA**

Run (workdir repo root):
```powershell
git clone --depth 1 https://github.com/digininja/DVWA samples/dvwa
```
Expected: clonado en `samples/dvwa` (gitignored por la Task 1; no aparece en `git status`).

- [ ] **Step 2: Escribir el test de ground truth (LLM real)**

`backend/tests/test_miniapp_ground_truth.py`:
```python
import asyncio
import json
from pathlib import Path

import pytest

from app.config import load_settings
from app.llm import LLMClient
from app.pipeline import run_pipeline, ALL_VULN_IDS
from app.projects import get_project
from app.runs import RunRegistry

SAMPLES = Path(__file__).resolve().parents[2] / "samples"


@pytest.mark.llm
def test_miniapp_ground_truth():
    settings = load_settings()
    info, scan = get_project(SAMPLES, "miniapp")
    assert info is not None
    expected = json.loads((SAMPLES / "miniapp" / "expected-findings.json").read_text(encoding="utf-8"))

    llm = LLMClient(settings.llm_base_url, settings.llm_api_key, settings.llm_model)
    reg = RunRegistry()
    run = reg.start("miniapp", list(ALL_VULN_IDS))

    async def go():
        try:
            await run_pipeline(llm, scan, info.name, list(ALL_VULN_IDS), run, settings.llm_concurrency)
        finally:
            await llm.close()

    asyncio.run(go())
    assert run.status in ("done", "error"), f"run terminó en {run.status}: {run.events[-1]}"

    found = (f["vulnId"], f["file"]) for f in run.findings
    matched = [e for e in expected if (e["vulnId"], e["file"]) in found]
    missing = [e for e in expected if e not in matched]
    assert len(matched) >= 8, f"ground truth {len(matched)}/10; sin detectar: {missing}"
    print(f"\nGROUND TRUTH: {len(matched)}/10 · fallos: {[e['vulnId'] for e in missing]}")
```
Si `run.status == 'error'` (p. ej. el LLM falló), el test debe fallar con el último evento visible (el `assert` de arriba lo cubre).

- [ ] **Step 3: Ejecutar el ground truth con LLM real**

Run (workdir `backend/`): `.venv\Scripts\python.exe -m pytest -m llm -v`
Expected: PASS con `GROUND TRUTH: N/10` (N ≥ 8) impreso. **Si N < 8**: es un fix round de prompts — ajustar `VULN_PROMPTS` de las categorías falladas (más pistas de patrones) y re-ejecutar hasta ≥ 8/10; el ajuste se incluye en el commit de esta task.

- [ ] **Step 4: Evidencia E2E de la API (backend real + ambos proyectos)**

Arrancar la API en background (workdir `backend/`):
```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
Después (PowerShell):
```powershell
Invoke-RestMethod http://localhost:8000/api/projects   # → 2 proyectos (dvwa, miniapp)
$r = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/analyze -ContentType 'application/json' -Body '{"projectId":"dvwa","vulnIds":["A01","A02","A03","A04","A05","A06","A07","A08","A09","A10"]}'
# leer /api/runs/$($r.runId)/events hasta run:done (p. ej. con curl -N) y anotar:
# nº total de hallazgos, desglose por categoría y severidad, duración
```
Expected: `run:done` con hallazgos reales en varias categorías (DVWA está lleno de vulnerabilidades conocidas, sobre todo A01/A03/A05/A07). Anotar los números en el report como evidencia. **Si `run:error` por tamaño** (> 600 KB): acotar el scope de `dvwa` en `PROJECT_SCOPES` (p. ej. solo `vulnerabilities/`) y re-ejecutar; anotar la decisión en `PROGRESS.md`.

- [ ] **Step 5: E2E del front (manual, para el report del usuario)**

Con la API corriendo y `npm run dev` (workdir repo root, background): recorrer el flujo en el navegador — home → fuente (lista real con miniapp y dvwa) → 10 vulns → análisis (progreso real, log con hallazgos reales) → resumen (hallazgos con snippet/exploit/solución) → alcance (texto con los nombres reales). Capturar 2–3 notas de QA visual para la lista R del usuario (estado «QA visual pendiente» de `PROGRESS.md`).

- [ ] **Step 6: Comprobación final global + `PROGRESS.md`**

Run: workdir `backend/` → `.venv\Scripts\python.exe -m pytest -q` (verde, sin `-m llm`); workdir repo root → `npx vitest run` + `npm run build` (verde).
Actualizar `PROGRESS.md`:
- «Estado actual»: Fase 2a COMPLETA (8/8), QA visual pendiente (lista R nueva para el usuario), siguiente = Fase 2b.
- «Progreso del plan (Fase 2a)»: marcar las 8 tasks `- [x]` con sus commits.
- «Registro de decisiones»: endpoint LLM verificado (enable_thinking false), scope final de DVWA si hubo cambio, resultado del ground truth (N/10), tag `v0.2.0`.

- [ ] **Step 7: Final review de la rama + commit + tag + push**

Final review (subagente fresco contra `main..HEAD`): revisar que el .env no está versionado, que no hay key en código, que los tests del Review Focus están presentes, y que el front no rompe en modo mock (backend apagado). Aplicar fixes (amendar en el commit de esta task si son menores).
```powershell
git add backend/tests/test_miniapp_ground_truth.py PROGRESS.md samples/README.md
git commit -m "test: ground truth miniapp y cierre E2E de Fase 2a"
git tag v0.2.0
git push && git push origin v0.2.0
```

---

## Notas de ejecución

- **Orden estricto**: cada task consume interfaces de las anteriores; no saltar tasks.
- **Comprobaciones reducidas** (AGENTS.md): rojo→verde solo del test de la task; suite completa + build una vez al final de la task (backend: `pytest`; frontend: `npx vitest run` + `npm run build`).
- **Commits agrupados**: uno por task con sus fix rounds (amendar antes de pushear); push único al terminar la task.
- **Sesiones**: 2–4 tasks por sesión (sugerido: sesión A = Tasks 1–4, sesión B = Tasks 5–8).
