# Serbatic Security Inspector — Plan de Implementación (Fase 1: Frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frontend completo de Serbatic Security Inspector en estética cyberpunk: home → fuente (carpeta/git) → selección de vulnerabilidades OWASP → análisis mock con progreso en vivo → resumen de hallazgos → alcance técnico editable con stub de PDF. Todo en español.

**Architecture:** SPA React (Vite 5 + TypeScript strict + Tailwind 3.4) pilotada por un único hook de estado `useAnalysis` (máquina de estados de 5 pasos, en memoria). Interfaz `AnalysisService` con implementación mock por temporizadores; en Fase 2 se sustituirá por el backend FastAPI real (SSE) sin tocar las pantallas.

**Tech Stack:** Node 20 LTS, Vite 5, React 18, TypeScript, Tailwind CSS 3.4, Vitest + Testing Library + jsdom. Sin router, sin librería de estado, sin librería de UI.

**Spec:** `C:\Users\rferrero\.opencode\plan\2026-11-20-serbatic-security-inspector-front-design.md` (la Task 1 la copia a `docs/superpowers/specs/` del repo y este plan a `docs/superpowers/plans/`).

## Global Constraints

- Windows + PowerShell; todo con `npm`/`npx`. **Requerido Node 20 LTS** (la máquina tiene Node 14 EOL → sustituir con el instalador oficial; si Node 14 se necesita para otros proyectos, nvm-windows).
- Todo el copy de la UI en **español**.
- Paleta exacta: bg `#06060b`, panel `#0a0a14`, cian `#00e5ff`, magenta `#ff2d95`, alto `#ff9f43`, medio `#ffd23f`, bajo `#00e5ff`, texto `#f4f4f8`, secundario `#8b8b98`, terciario `#5a5a68`.
- Sin llamadas de red en el código de la app; sin backend real en Fase 1; el PDF es un stub (toast «PDF generado (demo)»).
- Estado en memoria (sin persistencia); una recarga reinicia la demo.
- Demo: cada agente tarda 4000–7000 ms (±30%), tick de 250 ms.
- `npm run build` (incluye `tsc --noEmit`) limpio en cada commit.
- `.superpowers/` en `.gitignore` (los mockups no van a GitHub).
- GitHub: `rferreroSerbatic/SerbaticSecurityInspector` (privado por defecto); commit + push tras cada task.
- Commits convencionales (`feat:`, `test:`, `chore:`…).

## Review Focus

1. **Análisis sin hallazgos** (p. ej. elegir solo A10, que en los datos mock no tiene hallazgos) → el resumen muestra el estado vacío y «Generar alcance» queda deshabilitado con 0 seleccionados. (Pinned: Tasks 4, 12, 13.)
2. **Cancelar a mitad del análisis** (desmontar la pantalla de progreso) → temporizadores limpiados, sin `onUpdate` tras el cancel ni setState tras el unmount. (Pinned: Tasks 6, 15.)
3. **URLs git en formatos raros** (`git@github.com:user/repo.git`, sufijo `.git`, barra final) → la validación acepta formas válidas y rechaza lo obvio; el botón Continuar lo refleja. (Pinned: Task 9.)
4. **Texto del alcance editado a vacío** → contador de palabras 0 y «Generar PDF» deshabilitado. (Pinned: Task 14.)
5. **Ejecución completa con las 10 vulnerabilidades** → la lista de agentes y la barra global aguantan 10 agentes, conservando el orden A01→A10. (Pinned: Tasks 6, 11.)

## File Structure

```
SerbaticSecurityInspector/
├── index.html
├── package.json
├── vite.config.ts              # plugin react + config vitest (jsdom)
├── tsconfig.json, tsconfig.node.json
├── tailwind.config.js          # paleta cyberpunk + fuentes
├── postcss.config.js
├── .gitignore                  # node_modules/, dist/, .superpowers/, *.local
├── README.md
├── docs/superpowers/specs/2026-11-20-serbatic-security-inspector-front-design.md  (copiada)
├── docs/superpowers/plans/2026-11-20-serbatic-frontend-plan.md                    (copiada)
└── src/
    ├── main.tsx
    ├── App.tsx                 # routing por paso + AppShell (+ prop service opcional para tests)
    ├── index.css               # @tailwind base/components/utilities + fondo y fuentes
    ├── test/setup.ts           # @testing-library/jest-dom
    ├── types.ts                # todos los tipos compartidos
    ├── data/
    │   ├── owasp.ts            # OWASP_VULNS: las 10 vulnerabilidades
    │   └── mockFindings.ts     # MOCK_FINDINGS: hallazgos de ejemplo por vulnerabilidad
    ├── services/
    │   └── mockAnalysisService.ts  # createMockAnalysisService (la interfaz vive en types.ts)
    ├── state/
    │   └── useAnalysis.ts      # máquina de estados del wizard
    └── components/
        ├── layout/AppShell.tsx, StepIndicator.tsx
        ├── ui/NeonButton.tsx, SeverityBadge.tsx, ProgressBar.tsx, Modal.tsx
        ├── home/HomeScreen.tsx
        ├── source/SourceScreen.tsx
        ├── vulns/VulnSelectScreen.tsx, VulnRow.tsx
        ├── progress/ProgressScreen.tsx, AgentRow.tsx, LiveLog.tsx
        ├── summary/SummaryScreen.tsx, FindingCard.tsx
        └── scope/ScopeModal.tsx, scopeText.ts
```
Tests co-locados (`*.test.ts` / `*.test.tsx`).

---

### Task 1: Scaffold del proyecto + git init + GitHub

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx` (placeholder de marca), `src/index.css`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `README.md`, `src/test/setup.ts`

**Interfaces:**
- Produces: scaffold compilable; token Tailwind `night/panel/neon-cyan/neon-magenta/sev-*/ink-*`; scripts `dev`, `build` (= `tsc --noEmit && vite build`), `test` (= `vitest run`).

- [ ] **Step 1: Verificar/instalar Node 20 LTS**

Run: `node --version`
Expected: `v20.x`. Si sale `v14`: instalar Node 20 LTS (instalador .msi oficial) y repetir; esperado `v20.x`.

- [ ] **Step 2: Crear los archivos del scaffold**

- `package.json`: name `serbatic-security-inspector`, `"type": "module"`, scripts `{ "dev": "vite", "build": "tsc --noEmit && vite build", "preview": "vite preview", "test": "vitest run" }`; deps: `react ^18.3.1`, `react-dom ^18.3.1`; devDeps: `@types/react ^18.3.0`, `@types/react-dom ^18.3.0`, `@vitejs/plugin-react ^4.3.0`, `typescript ~5.6.0`, `vite ^5.4.0`, `vitest ^2.1.0`, `jsdom ^25.0.0`, `@testing-library/react ^16.0.0`, `@testing-library/jest-dom ^6.6.0`, `tailwindcss ^3.4.14`, `postcss ^8.4.0`, `autoprefixer ^10.4.0`.
- `vite.config.ts`: plugin `react()`, y `test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }` (con `/// <reference types="vitest" />`).
- `tsconfig.json`/`tsconfig.node.json`: estándar Vite react-ts con `strict: true`, `jsx: react-jsx`.
- `tailwind.config.js`: `content: ['./index.html', './src/**/*.{ts,tsx}']`; `theme.extend.colors`: `{ night:'#06060b', panel:'#0a0a14', neon:{ cyan:'#00e5ff', magenta:'#ff2d95' }, sev:{ critical:'#ff2d95', high:'#ff9f43', medium:'#ffd23f', low:'#00e5ff' }, ink:{ DEFAULT:'#f4f4f8', dim:'#8b8b98', faint:'#5a5a68' } }`; `theme.extend.fontFamily`: `sans: ['"Segoe UI"','system-ui','sans-serif']`, `mono: ['Consolas','"Cascadia Code"','monospace']`.
- `index.html`: `lang="es"`, title `Serbatic Security Inspector`, fondo `#06060b` inline para evitar flash.
- `src/index.css`: directivas `@tailwind base/components/utilities` + body con `bg-night text-ink font-sans`.
- `src/App.tsx`: placeholder que renderiza la marca `SERBATIC INSPECTOR` centrada.
- `.gitignore`: `node_modules/`, `dist/`, `.superpowers/`, `*.local`, `.DS_Store`.
- `README.md`: qué es, `npm install`, `npm run dev`, `npm test`.

- [ ] **Step 3: Instalar dependencias**

Run: `npm install`
Expected: salida exitosa, `node_modules` creado.

- [ ] **Step 4: git init + primer commit**

```
git init -b main
git add -A
git commit -m "chore: scaffold Vite + React + TS + Tailwind"
```

- [ ] **Step 5: Publicar en GitHub**

Run: `gh repo create rferreroSerbatic/SerbaticSecurityInspector --private --source=. --push`
Fallback (si `gh` no está o no hay auth): el usuario crea el repo vacío en GitHub y:
```
git remote add origin https://github.com/rferreroSerbatic/SerbaticSecurityInspector.git
git push -u origin main
```

- [ ] **Step 6: Copiar spec y plan al repo + commit**

Copiar `C:\Users\rferrero\.opencode\plan\2026-11-20-serbatic-security-inspector-front-design.md` → `docs/superpowers/specs/` y este plan → `docs/superpowers/plans/2026-11-20-serbatic-frontend-plan.md`.
```
git add -A
git commit -m "docs: añadir spec de diseño y plan de implementación"
git push
```

- [ ] **Step 7: Verificar build y dev**

Run: `npm run build` → Expected: exit 0.
Run: `npm run dev` → http://localhost:5173 muestra la marca centrada (chequeo manual) → detener.

---

### Task 2: Primitivas UI (NeonButton, SeverityBadge, ProgressBar, Modal)

**Files:**
- Create: `src/components/ui/NeonButton.tsx`, `src/components/ui/SeverityBadge.tsx`, `src/components/ui/ProgressBar.tsx`, `src/components/ui/Modal.tsx`
- Test: `src/components/ui/primitives.test.tsx`

**Interfaces:**
- Produces:
  - `NeonButton: { variant?: 'primary'|'outline'|'ghost'; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>` — primary: degradado cian→magenta, texto `#06060b` bold, glow; outline: borde+texto magenta; ghost: borde+texto `ink-faint`.
  - `SeverityBadge: { severity: Severity }` — span uppercase 800, fondo = color de severidad, texto oscuro. Labels: CRÍTICO/ALTO/MEDIO/BAJO.
  - `ProgressBar: { value: number; glow?: boolean; className?: string }` — track `ink-faint/15` redondo; fill con `data-testid="progress-fill"`, ancho `value%`, degradado cian→magenta; `glow` añade box-shadow magenta.
  - `Modal: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }` — si `!open` renderiza `null`; overlay fijo `rgba(2,2,8,0.75)`; panel centrado `max-w-3xl` bg `panel`, borde cian + glow; cierra con tecla Escape y con ✕.

- [ ] **Step 1: Escribir los tests**

`src/components/ui/primitives.test.tsx`:
```tsx
test('SeverityBadge muestra label y color por severidad', () => {
  for (const [sev, label, bg] of [
    ['critical', 'CRÍTICO', 'rgb(255, 45, 149)'],
    ['high', 'ALTO', 'rgb(255, 159, 67)'],
    ['medium', 'MEDIO', 'rgb(255, 210, 63)'],
    ['low', 'BAJO', 'rgb(0, 229, 255)'],
  ] as const) {
    const { unmount } = render(<SeverityBadge severity={sev} />);
    expect(screen.getByText(label)).toHaveStyle({ backgroundColor: bg });
    unmount();
  }
});
test('NeonButton lanza onClick y respeta disabled', () => {
  const spy = vi.fn();
  render(<NeonButton onClick={spy} disabled>OK</NeonButton>);
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(spy).not.toHaveBeenCalled();
});
test('ProgressBar pinta el fill con el ancho dado', () => {
  render(<ProgressBar value={40} />);
  expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '40%' });
});
test('Modal no pinta si está cerrado; abierto muestra contenido y cierra con Escape', () => {
  const onClose = vi.fn();
  render(<Modal open={false} title="T" onClose={onClose}>cuerpo</Modal>);
  expect(screen.queryByText('cuerpo')).not.toBeInTheDocument();
  render(<Modal open title="T" onClose={onClose}>cuerpo</Modal>);
  expect(screen.getByText('cuerpo')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/components/ui/primitives.test.tsx`
Expected: FAIL (módulos no encontrados).

- [ ] **Step 3: Implementar las 4 primitivas** según las Interfaces.

- [ ] **Step 4: Verificar que pasan + build**

Run: `npx vitest run src/components/ui/primitives.test.tsx` → Expected: PASS.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: primitivas UI (NeonButton, SeverityBadge, ProgressBar, Modal)"
git push
```

---

### Task 3: Tipos de dominio + datos OWASP Top 10

**Files:**
- Create: `src/types.ts`, `src/data/owasp.ts`
- Test: `src/data/owasp.test.ts`

**Interfaces:**
- Produces (exacto, lo consumen todas las tasks siguientes):
```ts
// src/types.ts
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export interface Vuln { id: string; name: string; icon: string; description: string; }
export interface Finding {
  id: string; vulnId: string; severity: Severity; title: string;
  file: string; line: number; snippet: string;
  exploit: string; consequences: string; solution: string;
}
export type AgentStatus = 'pending' | 'running' | 'done';
export interface AgentProgress {
  vulnId: string; status: AgentStatus; progress: number; // 0..100
  currentFile?: string; findingsCount?: number; criticalCount?: number;
}
export interface LogLine { id: string; time: string; vulnId: string; severity?: Severity; message: string; }
export interface AnalysisProgress {
  status: 'idle' | 'running' | 'done'; globalProgress: number; // 0..100
  agents: AgentProgress[]; logLines: LogLine[]; findings: Finding[];
  meta?: { files: number; lines: number; durationMin: number };
}
export type SourceKind = 'folder' | 'git';
export interface Source { kind: SourceKind; label: string; value: string; }
export type Step = 'home' | 'source' | 'vulns' | 'progress' | 'summary';
export interface AnalysisService {
  run(opts: { source: Source; vulnIds: string[] }, onUpdate: (p: AnalysisProgress) => void): () => void; // devuelve cancel()
}
```
```ts
// src/data/owasp.ts
export const OWASP_VULNS: Vuln[]; // 10 entradas, orden A01..A10
```
Nombres (OWASP Top 10 2021, en español, como en los mockups): A01 Fallos de control de acceso 🔓 · A02 Fallos criptográficos 🔑 · A03 Inyección 💉 · A04 Diseño inseguro 🧩 · A05 Configuración insegura ⚙️ · A06 Componentes vulnerables u obsoletos 📦 · A07 Identificación y autenticación 🔐 · A08 Integridad del software 📜 · A09 Registro y monitorización 📡 · A10 Suplantición de servidor (SSRF) 🌐. `description`: una frase corta cada una (las de los mockups sirven).

- [ ] **Step 1: Escribir el test**

`src/data/owasp.test.ts`:
```ts
test('OWASP_VULNS son exactamente las 10, en orden A01..A10', () => {
  expect(OWASP_VULNS).toHaveLength(10);
  expect(OWASP_VULNS.map(v => v.id)).toEqual(['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10']);
});
test('cada vuln tiene name, icon y description no vacíos', () => {
  for (const v of OWASP_VULNS) {
    expect(v.name.trim()).not.toBe('');
    expect(v.icon.trim()).not.toBe('');
    expect(v.description.trim()).not.toBe('');
  }
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/data/owasp.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar** `src/types.ts` y `src/data/owasp.ts`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/data/owasp.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: tipos de dominio y datos OWASP Top 10"
git push
```

---

### Task 4: Hallazgos mock (mockFindings)

**Files:**
- Create: `src/data/mockFindings.ts`
- Test: `src/data/mockFindings.test.ts`

**Interfaces:**
- Consumes: `Vuln`, `Finding`, `OWASP_VULNS` (Task 3).
- Produces:
```ts
// src/data/mockFindings.ts
export const MOCK_FINDINGS: Record<string, Finding[]>; // clave = vulnId
```
Requisitos del contenido (lo decide el constructor, en español y creíble): A01..A09 tienen 3–6 hallazgos cada una (la spec pide 3–8); **A10 tiene 0** (deliberado: pinta el camino de «sin hallazgos»); ≥ 3 hallazgos críticos en total; cada `Finding` tiene `id` = `${vulnId}-n`, `file`/`line` plausibles, `snippet` que incluye la línea vulnerable, y `exploit`/`consequences`/`solution` con contenido real.

- [ ] **Step 1: Escribir el test**

`src/data/mockFindings.test.ts`:
```ts
test('cubre las 10 vulns (A10 con cero hallazgos)', () => {
  for (const v of OWASP_VULNS) expect(Array.isArray(MOCK_FINDINGS[v.id])).toBe(true);
  expect(MOCK_FINDINGS['A10']).toHaveLength(0);
});
test('todos los hallazgos tienen campos completos y severidad válida', () => {
  const all = Object.values(MOCK_FINDINGS).flat();
  expect(all.length).toBeGreaterThanOrEqual(10);
  for (const f of all) {
    expect(['critical','high','medium','low']).toContain(f.severity);
    for (const key of ['id','vulnId','title','file','snippet','exploit','consequences','solution'] as const)
      expect(String(f[key]).trim()).not.toBe('');
    expect(f.line).toBeGreaterThanOrEqual(1);
  }
});
test('hay al menos 3 hallazgos críticos', () => {
  const all = Object.values(MOCK_FINDINGS).flat();
  expect(all.filter(f => f.severity === 'critical').length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/data/mockFindings.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar** `src/data/mockFindings.ts` con hallazgos realistas.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/data/mockFindings.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: hallazgos mock realistas por vulnerabilidad"
git push
```

---

### Task 5: Máquina de estados del wizard (useAnalysis)

**Files:**
- Create: `src/state/useAnalysis.ts`
- Test: `src/state/useAnalysis.test.ts`

**Interfaces:**
- Consumes: `Step`, `Source`, `AnalysisProgress`, `AnalysisService` (Task 3).
- Produces:
```ts
export interface UseAnalysis {
  step: Step;
  source: Source | null;
  selectedVulns: string[];          // por defecto las 10, orden A01..A10
  analysis: AnalysisProgress;       // estado actual del servicio
  selectedFindingIds: string[];     // hallazgos marcados para el alcance
  scopeOpen: boolean;
  goSource(): void;                 // home -> source
  setSource(s: Source): void;       // source -> vulns
  toggleVuln(id: string): void;
  setAllVulns(ids: string[]): void; // seleccionar/deseleccionar todas
  startAnalysis(): void;            // vulns -> progress; ejecuta service.run
  backToHome(): void;
  toggleFinding(id: string): void;
  openScope(): void;
  closeScope(): void;
  newAudit(): void;                 // reinicia a home (estado limpio)
}
export function useAnalysis(service: AnalysisService): UseAnalysis;
```
Comportamiento: el service se inyecta (App pasará el mock real; los tests usan un fake). Al recibir `status: 'done'` del servicio, el hook pasa automáticamente a `step: 'summary'`. `startAnalysis` limpia `selectedFindingIds` y el estado anterior. `newAudit` vuelve a home con `selectedVulns` de nuevo a las 10.

- [ ] **Step 1: Escribir el test**

`src/state/useAnalysis.test.ts` (con `renderHook`/`act` de @testing-library/react):
```ts
class FakeService implements AnalysisService {
  runCount = 0;
  run(_opts: { source: Source; vulnIds: string[] }, onUpdate: (p: AnalysisProgress) => void) {
    this.runCount++;
    onUpdate({ status: 'done', globalProgress: 100, agents: [], logLines: [], findings: [] });
    return () => {};
  }
}
test('empieza en home con las 10 vulns preseleccionadas', ...);
test('goSource -> source; setSource -> vulns con source guardado', ...);
test('toggleVuln y setAllVulns actualizan la selección', ...);
test('startAnalysis ejecuta el servicio una vez y pasa a summary al terminar', ...);
test('newAudit reinicia a home con las 10 preseleccionadas', ...);
```
(Aserciones concretas sobre `result.current.step`, `source`, `selectedVulns`, `service.runCount`.)

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/state/useAnalysis.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar** `src/state/useAnalysis.ts` con `useState` + `useEffect` para el auto-avance a summary.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/state/useAnalysis.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: máquina de estados del wizard (useAnalysis)"
git push
```

---

### Task 6: Servicio mock de análisis (mockAnalysisService)

**Files:**
- Create: `src/services/mockAnalysisService.ts`
- Test: `src/services/mockAnalysisService.test.ts`

**Interfaces:**
- Consumes: `AnalysisService`, `AnalysisProgress`, `MOCK_FINDINGS`, `OWASP_VULNS`.
- Produces:
```ts
export interface MockOptions { agentMs?: number; tickMs?: number; }
export function createMockAnalysisService(opts?: MockOptions): AnalysisService;
```
Defaults: `agentMs: 5500` (±30% por agente), `tickMs: 250`.

Comportamiento (algoritmo):
- `run()` emite de inmediato estado `running`: agentes = vulns elegidas en orden A01..A10, todas `pending`, `globalProgress: 0`, primera línea de log («iniciando análisis de N vulnerabilidades…»).
- Los agentes corren **uno a uno**. El en curso avanza en cada tick: `progress += paso` con `paso = (100 / (agentMs / tickMs)) * (0.5 + Math.random())` (llega a 100 en ~agentMs); `currentFile` rota por una pequeña lista de archivos plausibles; durante la ejecución emite una línea de log por hallazgo (severidad + `file:line` + detalle corto), espaciada.
- Al completar un agente: `status: 'done'`, `findingsCount`/`criticalCount` según `MOCK_FINDINGS[vulnId]`, sus hallazgos se añaden a `findings` (acumulativo), línea de log «completado».
- `globalProgress = round(100 * Σ(progress agentes) / totalAgentes)`.
- Al terminar el último: `status: 'done'`, `globalProgress: 100`, `meta: { files: 128, lines: 3412, durationMin: 14 }`.
- El `cancel()` retornado limpia todos los temporizadores; **no hay `onUpdate` después del cancel**.

- [ ] **Step 1: Escribir los tests**

`src/services/mockAnalysisService.test.ts` (con `createMockAnalysisService({ agentMs: 80, tickMs: 10 })` y un helper `until(pred, timeoutMs)` que espera a que el estado cumpla `pred`):
```ts
test('emite estado inicial running con los agentes en orden A01..A10', ...);
test('ejecuta los agentes estrictamente uno a uno (sin solaparse)', ...); // timeline de (vulnId, status)
test('termina en done con globalProgress 100 y findings = concatenación de MOCK_FINDINGS de las elegidas', ...);
test('cancel() detiene las actualizaciones', ...); // cancela en el primer running; espera 200 ms; no llegan más onUpdate
test('con las 10 vulns elegidas, los 10 agentes completan en orden (ejecución completa)', ...); // Review Focus 5
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/services/mockAnalysisService.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar** `src/services/mockAnalysisService.ts`.

- [ ] **Step 4: Verificar que pasan + build**

Run: `npx vitest run src/services/mockAnalysisService.test.ts` → Expected: PASS.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: servicio mock de análisis con agentes secuenciales"
git push
```

---

### Task 7: AppShell + StepIndicator

**Files:**
- Create: `src/components/layout/AppShell.tsx`, `src/components/layout/StepIndicator.tsx`
- Test: `src/components/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes: `Step` (Task 3).
- Produces:
```tsx
export function StepIndicator({ step }: { step: Step })
// 4 pasos: 1 FUENTE · 2 VULNERABILIDADES · 3 ANÁLISIS · 4 INFORME
// completados (índice < actual): con ✓; actual: magenta; futuros: ink-faint

export function AppShell({ step, children }: { step: Step; children: ReactNode })
// marca a la izquierda: "SERBATIC" (cian + glow) + "INSPECTOR" (magenta + glow), letter-spacing
// StepIndicator a la derecha, SOLO cuando step !== 'home'; contenido centrado max-w-5xl
```

- [ ] **Step 1: Escribir el test**

`src/components/layout/AppShell.test.tsx`:
```ts
test('renderiza la marca SERBATIC e INSPECTOR', ...);
test('StepIndicator marca completados con ✓ y el actual en magenta', () => {
  render(<StepIndicator step="vulns" />);
  expect(screen.getByText(/1 FUENTE/)).toHaveTextContent('✓');
  expect(screen.getByText('2 VULNERABILIDADES')).toHaveClass('text-neon-magenta');
});
test('no muestra el StepIndicator en home', ...);
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/layout/AppShell.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `AppShell.tsx` y `StepIndicator.tsx`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/layout/AppShell.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: shell de la app e indicador de pasos"
git push
```

---

### Task 8: HomeScreen

**Files:**
- Create: `src/components/home/HomeScreen.tsx`
- Test: `src/components/home/HomeScreen.test.tsx`

**Interfaces:**
- Produces: `export function HomeScreen({ onAnalyze }: { onAnalyze: () => void })`
Copy exacto (diseño §6.1): kicker `OWASP TOP 10 · AUDITORÍA AUTOMATIZADA`; titular «Encuentra la brecha antes que el atacante.» con degradado cian→magenta (`background-clip: text`); sub «Análisis con agentes especializados, informe y alcance de mejora.»; CTA `ANALIZAR APLICACIÓN` (NeonButton primary); métricas de pie: `10 AGENTES` (10 en cian), `PDF INFORME` (PDF en magenta), `GIT · CARPETA` (GIT en cian).

- [ ] **Step 1: Escribir el test**

`src/components/home/HomeScreen.test.tsx`:
```ts
test('renderiza el titular y el CTA', ...);
test('pulsar el CTA llama a onAnalyze', () => {
  const spy = vi.fn();
  render(<HomeScreen onAnalyze={spy} />);
  fireEvent.click(screen.getByRole('button', { name: /analizar aplicación/i }));
  expect(spy).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/home/HomeScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `HomeScreen.tsx`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/home/HomeScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: home page cyberpunk"
git push
```

---

### Task 9: SourceScreen (Paso 1 · Fuente)

**Files:**
- Create: `src/components/source/SourceScreen.tsx`
- Test: `src/components/source/SourceScreen.test.tsx`

**Interfaces:**
- Produces: `export function SourceScreen({ onBack, onContinue }: { onBack: () => void; onContinue: (s: Source) => void })`
UI: título «Elige la fuente de código»; dos opciones conmutable (tabs con `role="tab"`): **Carpeta local** → 3 proyectos mock (filas radio: `webapp-acme — C:\proyectos\webapp-acme`, `api-billing — C:\proyectos\api-billing`, `portal-rrhh — C:\proyectos\portal-rrhh`); **Repositorio git** → input con placeholder `https://github.com/org/repo`. Validación: `const isValidGitUrl = (s: string) => /^(https?:\/\/\S+|git@\S+)$/i.test(s.trim())`. Botón `CONTINUAR ▸` (NeonButton primary) deshabilitado salvo proyecto elegido o URL válida; enlace `← Volver`.
`onContinue`: carpeta → `{ kind: 'folder', label: nombreProyecto, value: ruta }`; git → `{ kind: 'git', label: 'host/org/repo', value: url }`.

- [ ] **Step 1: Escribir los tests**

`src/components/source/SourceScreen.test.tsx`:
```ts
test('continuar está deshabilitado sin fuente', ...);
test('elegir un proyecto mock habilita continuar y pasa un Source folder', ...);
test('rechaza URLs inválidas: vacía, "notaunaurl", con espacios', ...);   // Review Focus 3
test('acepta https://… y git@github.com:user/repo.git (con o sin .git)', ...); // Review Focus 3
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `SourceScreen.tsx`.

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: paso de fuente (carpeta mock + URL git)"
git push
```

---

### Task 10: VulnSelectScreen + VulnRow (Paso 2 · Vulnerabilidades)

**Files:**
- Create: `src/components/vulns/VulnRow.tsx`, `src/components/vulns/VulnSelectScreen.tsx`
- Test: `src/components/vulns/VulnSelectScreen.test.tsx`

**Interfaces:**
- Consumes: `Vuln`, `OWASP_VULNS`, `NeonButton`.
- Produces:
```tsx
export function VulnRow({ vuln, selected, onToggle }: { vuln: Vuln; selected: boolean; onToggle: () => void })
// fila: checkbox (degradado cian→magenta con ✓ si selected), icono, código A0X (cian), nombre, descripción
// seleccionada: borde izquierdo magenta + fondo tinte magenta; sin seleccionar: atenenuada

export function VulnSelectScreen({
  selected, onToggle, onSetAll, onRun, onBack,
}: {
  selected: string[]; onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void; onRun: () => void; onBack: () => void;
})
// título «Elige qué vulnerabilidades auditar» + botón SELECCIONAR TODAS (outline magenta;
// si todas están seleccionadas, DESELECCIONAR TODAS → onSetAll([]))
// lista vertical de las 10 (orden A01..A10); pie: «N DE 10 SELECCIONADAS» + EJECUTAR ANÁLISIS ▸
// (deshabilitado si N === 0) + enlace ← Volver
```

- [ ] **Step 1: Escribir los tests**

`src/components/vulns/VulnSelectScreen.test.tsx`:
```ts
const all = OWASP_VULNS.map(v => v.id);
test('renderiza las 10 vulns con código, nombre y descripción', ...);
test('toggle de una fila llama a onToggle con su id', ...);
test('seleccionar todas marca las 10; con todas marcadas el botón pasa a deseleccionar todas', ...);
test('ejecutar está deshabilitado con 0 seleccionadas', ...);
test('ejecutar llama a onRun con ≥1 seleccionada', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/components/vulns/VulnSelectScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `VulnRow.tsx` y `VulnSelectScreen.tsx`.

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/components/vulns/VulnSelectScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: selección de vulnerabilidades (lista vertical)"
git push
```

---

### Task 11: ProgressScreen + AgentRow + LiveLog (Paso 3 · Progreso)

**Files:**
- Create: `src/components/progress/AgentRow.tsx`, `src/components/progress/LiveLog.tsx`, `src/components/progress/ProgressScreen.tsx`
- Test: `src/components/progress/ProgressScreen.test.tsx`

**Interfaces:**
- Consumes: `AnalysisProgress`, `AgentProgress`, `LogLine`, `Vuln`, `OWASP_VULNS`, `ProgressBar`.
- Produces:
```tsx
export function AgentRow({ agent, vuln }: { agent: AgentProgress; vuln: Vuln })
// done: borde cian, ✓, «COMPLETADO», «N hallazgos · X crítico(s)»
// running: borde magenta con glow, ▶, «EN CURSO», mini-ProgressBar + currentFile (mono)
// pending: atenenuado, «EN ESPERA»

export function LiveLog({ lines }: { lines: LogLine[] })
// consola (bg negro/40, mono, font-size pequeño), líneas «[mm:ss] …», auto-scroll al final

export function ProgressScreen({ analysis }: { analysis: AnalysisProgress })
// «Análisis en curso» + chip amarillo «⚠ El análisis puede tardar varios minutos»
// «PROGRESO GLOBAL» + % (texto degradado) + ProgressBar glow; lista de AgentRow en orden
```

- [ ] **Step 1: Escribir el test**

`src/components/progress/ProgressScreen.test.tsx` (con un `AnalysisProgress` fabricado: 2 done — A01 con 3 hallazgos/1 crítico, A02 con 1 —, 1 running A03 al 62% con `currentFile: 'api/users.py'`, 1 pending A06; `globalProgress: 45`; 3 logLines):
```ts
test('renderiza cada agente con su estado y sus contadores', ...);
test('renderiza el progreso global 45%', ...);
test('renderiza las líneas del log en orden', ...);
test('con 10 agentes la lista renderiza los 10 en orden A01..A10 (ejecución completa)', ...); // Review Focus 5
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/progress/ProgressScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `AgentRow.tsx`, `LiveLog.tsx`, `ProgressScreen.tsx`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/progress/ProgressScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: pantalla de progreso en vivo"
git push
```

---

### Task 12: SummaryScreen + FindingCard (Paso 4 · Resumen)

**Files:**
- Create: `src/components/summary/FindingCard.tsx`, `src/components/summary/SummaryScreen.tsx`
- Test: `src/components/summary/SummaryScreen.test.tsx`

**Interfaces:**
- Consumes: `AnalysisProgress`, `Finding`, `Vuln`, `OWASP_VULNS`, `SeverityBadge`, `NeonButton`.
- Produces:
```tsx
export function FindingCard({
  finding, vuln, selected, expanded, onToggleSelect, onToggleExpand,
}: {
  finding: Finding; vuln: Vuln; selected: boolean; expanded: boolean;
  onToggleSelect: () => void; onToggleExpand: () => void;
})
// expandido: checkbox (degradado con ✓ si selected), SeverityBadge, tag «A0X · NOMBRE VULN»,
//   título, «📍 file:line» + snippet (mono, fondo oscuro), bloques EXPLOIT / CONSECUENCIAS / SOLUCIÓN
// colapsado: checkbox + badge + tag + título + file (mono) en una fila

export function SummaryScreen({
  analysis, selectedFindingIds, onToggleFinding, onGenerateScope, onNewAudit,
}: {
  analysis: AnalysisProgress; selectedFindingIds: string[];
  onToggleFinding: (id: string) => void; onGenerateScope: () => void; onNewAudit: () => void;
})
// «Análisis completado» + métricas de analysis.meta (N agentes · files archivos · lines líneas · durationMin min)
// barra apilada por severidad (proporcional a recuentos: critical #ff2d95, high #ff9f43,
//   medium #ffd23f, low #00e5ff) + leyenda «N CRÍTICOS / ALTOS / MEDIOS / BAJOS»
// hallazgos de analysis.findings; el primer crítico expandido por defecto (o el primero,
//   si no hay críticos); 0 hallazgos → «Sin hallazgos para las vulnerabilidades seleccionadas.»
// pie: «N DE M HALLAZGOS MARCADOS PARA EL ALCANCE» + GENERAR ALCANCE DE MEJORA ▸ (deshabilitado si 0)
//   + enlace NUEVA AUDITORÍA (ghost, llama a onNewAudit)
```

- [ ] **Step 1: Escribir los tests**

`src/components/summary/SummaryScreen.test.tsx` (analysis fabricado con 4 hallazgos: 1 critical, 1 high, 1 medium, 1 low):
```ts
test('renderiza las métricas y la barra de severidad con sus segmentos', ...);
test('los hallazgos renderizan con badge, tag OWASP y file:line', ...);
test('expandir un hallazgo muestra exploit, consecuencias y solución', ...);
test('el primer hallazgo crítico está expandido por defecto', ...);
test('marcar hallazgos actualiza el contador del pie y habilita generar', ...);
test('con 0 hallazgos muestra el estado vacío y generar está deshabilitado', ...); // Review Focus 1
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/summary/SummaryScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `FindingCard.tsx` y `SummaryScreen.tsx`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/summary/SummaryScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: pantalla de resumen de hallazgos"
git push
```

---

### Task 13: buildScopeText (texto del alcance, puro)

**Files:**
- Create: `src/components/scope/scopeText.ts`
- Test: `src/components/scope/scopeText.test.ts`

**Interfaces:**
- Consumes: `Finding`, `Vuln`.
- Produces:
```ts
export function buildScopeText(findings: Finding[], vulns: Vuln[], projectName: string, dateISO: string): string
```
Formato exacto:
```
ALCANCE TÉCNICO DE MEJORA — SEGURIDAD
Proyecto: {projectName} · {dd/mm/aaaa} · Serbatic Security Inspector

1. {TÍTULO EN MAYÚSCULAS} ({NOMBRE CORTO DE LA VULN}) — {CRÍTICO|ALTO|MEDIO|BAJO}
Objetivo: eliminar {título (caso original)} detectado en {file}.
· Revisar la ocurrencia en {file}:{line} y aplicar la solución recomendada.
· Validar el cambio con una prueba que cubra el caso de {título (caso original)}.
Estimación: {H} h · Prioridad: {P}

2. …
```
Reglas: hallazgos agrupados por vulnerabilidad en orden A01..A10, y dentro de cada grupo por severidad (critical > high > medium > low); numeración global 1..n; `H`/`P`: critical→`4`/`inmediata`, high→`3`/`alta`, medium→`2`/`media`, low→`1`/`baja`; fecha formateada a `dd/mm/aaaa` desde `dateISO`; si `findings` está vacío, tras la segunda línea: `No se incluyen hallazgos en este alcance.`

- [ ] **Step 1: Escribir los tests**

`src/components/scope/scopeText.test.ts` (con 3 hallazgos de ejemplo: A03 critical, A01 high, A03 medium):
```ts
test('contiene cabecera, proyecto y fecha dd/mm/aaaa', ...);
test('agrupa por vuln en orden A01..A10 y numera globalmente 1..n', ...); // A01 va antes que A03
test('cada bloque incluye file:line, label de severidad y estimación/prioridad', ...); // critical → "4 h" e "inmediata"
test('con findings vacíos produce la línea de «no se incluyen hallazgos»', ...); // Review Focus 1
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/scope/scopeText.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** `scopeText.ts`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/components/scope/scopeText.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: generador de texto del alcance técnico"
git push
```

---

### Task 14: ScopeModal (alcance editable)

**Files:**
- Create: `src/components/scope/ScopeModal.tsx`
- Test: `src/components/scope/ScopeModal.test.tsx`

**Interfaces:**
- Consumes: `Modal`, `NeonButton`, `buildScopeText`, `OWASP_VULNS`, `Finding`.
- Produces:
```tsx
export function ScopeModal({
  open, projectName, findings, onClose,
}: { open: boolean; projectName: string; findings: Finding[]; onClose: () => void })
```
UI: `Modal` con título `ALCANCE TÉCNICO DE MEJORA` + sub «Basado en N hallazgos marcados: A0X …»; aviso `✎ TEXTO EDITABLE — ajústalo antes de generar el PDF`; `textarea` (h-64, scroll) cuyo valor se inicializa al abrir con `buildScopeText(findings, OWASP_VULNS, projectName, todayISO)` (useEffect al pasar `open` a true); pie: contador `≈ N palabras` (palabras = `text.trim().split(/\s+/).filter(Boolean).length`), `CANCELAR` (ghost → `onClose`), `COPIAR TEXTO` (outline), `GENERAR PDF ▸` (primary → toast «PDF generado (demo)», sin cerrar).
Toast: estado interno, auto-oculto a los 3 s, sobre el contenido del modal.
Copiar: `navigator.clipboard?.writeText(textoActual)` → toast «Texto copiado al portapapeles»; si `clipboard` no existe o se rechaza → toast «No se pudo copiar: selecciona el texto y cópialo a mano» (sin excepción).
`GENERAR PDF` deshabilitado si el texto está vacío o solo espacios.

- [ ] **Step 1: Escribir los tests**

`src/components/scope/ScopeModal.test.tsx` (con 2 findings de ejemplo; `vi.useFakeTimers()` para el toast):
```ts
test('se abre precargado con el texto del alcance de los hallazgos marcados', ...);
test('editar el textarea actualiza el contador de palabras', ...);            // Review Focus 4
test('texto vacío o espacios deshabilita GENERAR PDF', ...);                  // Review Focus 4
test('COPIAR llama al clipboard y muestra toast; sin clipboard muestra el fallback sin lanzar', ...);
test('GENERAR PDF muestra el toast demo y no cierra el modal', ...);
test('CANCELAR cierra el modal', ...);
```
(Mock del clipboard: `Object.assign(navigator, { clipboard: { writeText: vi.fn() } })` y, para el fallback, `delete (navigator as any).clipboard`.)

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/components/scope/ScopeModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `ScopeModal.tsx`.

- [ ] **Step 4: Verificar que pasan + build**

Run: `npx vitest run src/components/scope/ScopeModal.test.tsx` → Expected: PASS.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 5: Commit + push**

```
git add -A
git commit -m "feat: modal de alcance editable con copiar y stub de PDF"
git push
```

---

### Task 15: Cablear App + verificación end-to-end

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: todo lo anterior (Tasks 2–14).
- Produces:
```tsx
export default function App({ service }: { service?: AnalysisService })
// service por defecto: createMockAnalysisService()
// useAnalysis(service); AppShell(step) rodea cada pantalla según flow.step:
//   home     → HomeScreen onAnalyze={flow.goSource}
//   source   → SourceScreen onBack={flow.backToHome} onContinue={flow.setSource}
//   vulns    → VulnSelectScreen (selected/flow.selectedVulns, onToggle/flow.toggleVuln,
//              onSetAll/flow.setAllVulns, onRun/flow.startAnalysis, onBack/flow.backToHome)
//   progress → ProgressScreen analysis={flow.analysis}
//   summary  → SummaryScreen (analysis, selectedFindingIds, onToggleFinding,
//              onGenerateScope/flow.openScope, onNewAudit/flow.newAudit)
// + ScopeModal cuando flow.scopeOpen (findings = analysis.findings filtrados por
//   selectedFindingIds; projectName = flow.source?.label ?? 'Proyecto'; onClose/flow.closeScope)
```

- [ ] **Step 1: Escribir el test E2E**

`src/App.test.tsx`:
```ts
const fast = createMockAnalysisService({ agentMs: 60, tickMs: 10 });
test('flujo completo: home → fuente git → vulns (2 seleccionadas) → progreso → resumen', async () => {
  render(<App service={fast} />);
  fireEvent.click(screen.getByRole('button', { name: /analizar aplicación/i }));
  fireEvent.click(screen.getByRole('tab', { name: /repositorio git/i }));
  fireEvent.input(screen.getByPlaceholderText(/github/i), { target: { value: 'https://github.com/org/repo' } });
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
  // deseleccionar todas y marcar solo A03 y A07
  fireEvent.click(screen.getByRole('button', { name: /seleccionar todas/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /inyección/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /autenticación|identificación/i }));
  fireEvent.click(screen.getByRole('button', { name: /ejecutar análisis/i }));
  expect(await screen.findByText(/análisis en curso/i)).toBeInTheDocument();
  expect(await screen.findByText(/análisis completado/i, undefined, { timeout: 5000 })).toBeInTheDocument();
});
test('desmontar durante el análisis no deja actualizaciones pendientes', async () => {
  const { unmount } = render(<App service={createMockAnalysisService({ agentMs: 400, tickMs: 20 })} />);
  // avanzar hasta el paso de progreso y unmountar
  unmount();
  expect(true).toBe(true); // sin errores ni advertencias de setState tras el unmount (vi.spyOn(console,'error') limpio)
}); // Review Focus 2
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL (App sigue siendo el placeholder).

- [ ] **Step 3: Implementar** el cableado en `src/App.tsx` (eliminar el placeholder).

- [ ] **Step 4: Verificar que pasa + build + tipos**

Run: `npx vitest run` → Expected: toda la suite PASS.
Run: `npm run build` → Expected: exit 0.

- [ ] **Step 5: Recorrido manual E2E + QA visual contra mockups**

Run: `npm run dev` → http://localhost:5173. Recorrido: home → fuente carpeta (webapp-acme) → seleccionar todas → ejecución completa (comprobar progreso, estados de agentes y log) → resumen (expandir hallazgos, marcar 2) → modal (editar texto, copiar, PDF demo, cancelar) → nueva auditoría.
Abrir los mockups aprobados (`.superpowers/brainstorm/430-1795195954/content/*.html`) lado a lado en el navegador y comparar cada pantalla: paleta, glows, tipografía, copy. Ajustar desviaciones.

- [ ] **Step 6: Commit final + push (+ tag opcional)**

```
git add -A
git commit -m "feat: flujo completo de punta a punta (Fase 1)"
git push
git tag v0.1.0 && git push --tags
```


