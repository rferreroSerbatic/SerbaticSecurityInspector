# Fase 1.1 — UX: fondo full-bleed, volver/migas de pan, carpeta real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fondo ambiental a ancho completo de viewport, navegación hacia atrás entre fases (migas de pan + botón Volver) y selector de carpeta real del sistema en la fuente.

**Architecture:** La capa de glows sale de las 4 pantallas y vive una única vez en `AppShell` como capa `fixed`. La navegación hacia atrás se apoya en el `StepIndicator` existente (pasos completados → botones) + 2 métodos nuevos en `useAnalysis` (`goVulns`, y `goSource` que ahora cancela). La carpeta real usa `input[webkitdirectory]` nativo; el análisis sigue siendo mock.

**Tech Stack:** Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS 3.4 + Vitest/Testing Library/jsdom. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-21-fase1-1-ux-fondo-navegacion-carpeta-design.md`

## Global Constraints

- Windows + PowerShell. Node v26.13.1 (floor Node ≥ 20).
- Stack invariable: sin router, sin librería de estado, sin librería de UI, sin persistencia, sin llamadas de red (el `input[webkitdirectory]` es acceso local iniciado por el usuario, no red).
- Todo el copy de la UI en español.
- Paleta exacta (tokens Tailwind existentes): night `#06060b`, panel `#0a0a14`, neon-cyan `#00e5ff`, neon-magenta `#ff2d95`, ink `#f4f4f8` / ink-dim `#8b8b98` / ink-faint `#5a5a68`.
- `npm run build` (incluye `tsc --noEmit`) limpio y suite completa (`npx vitest run`) verde en cada task.
- Commits convencionales, uno por task, **con push** (el remote `origin` ya existe).
- Convención de tests: `afterEach(cleanup)` en test files nuevos/modificados.

## Review Focus

1. **Carpeta vacía** (el usuario elige una carpeta sin archivos): `input.files` vacío → no se marca carpeta seleccionada, CONTINUAR sigue deshabilitado, sin crash ni confirmación fantasma. → test en Task 3.
2. **Volver desde Progreso con análisis en curso**: el análisis se cancela (no hay `onUpdate` posteriores ni setState al volver), y el usuario queda en Vulnerabilidades. → tests en Task 2 (useAnalysis) y E2E en Task 4.
3. **`goVulns`/`goSource` sin fuente elegida** (estado anómalo, p. ej. navegación directa): no-op, sin crash, el paso no cambia. → test en Task 2.
4. **La capa ambiental es una única**: al renderizar la app completa no hay duplicados de glow (no debe quedar ningún `radial-gradient` por pantalla). → tests en Task 1.
5. **Volver desde Resumen a Vulnerabilidades conserva el análisis hecho** (status `done`, hallazgos intactos); re-ejecutar lo reemplaza. → test en Task 2.

---

### Task 1: Fondo ambiental full-bleed en AppShell

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/AppShell.test.tsx`
- Modify: `src/components/home/HomeScreen.tsx` (eliminar su capa de glow)
- Modify: `src/components/source/SourceScreen.tsx` (eliminar su capa de glow)
- Modify: `src/components/progress/ProgressScreen.tsx` (eliminar su capa de glow)
- Modify: `src/components/summary/SummaryScreen.tsx` (eliminar su capa de glow)
- Test: `src/components/home/HomeScreen.test.tsx`, `src/components/source/SourceScreen.test.tsx`, `src/components/progress/ProgressScreen.test.tsx`, `src/components/summary/SummaryScreen.test.tsx` (una aserción de «sin glow propio» en un test de render de cada una)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `AppShell` sigue con `{ step, children }` (esta task) y añade una capa `<div aria-hidden data-testid="ambient-glow" className="pointer-events-none fixed inset-0 z-0" style={{ backgroundImage: 'radial-gradient(ellipse at 75% 15%, rgba(255,45,149,0.22), transparent 55%), radial-gradient(ellipse at 15% 85%, rgba(0,229,255,0.18), transparent 55%)' }} />` como primer hijo; `<header>` y `<main>` ganan `relative z-10` para pintarse encima. Ninguna otra pantalla renderiza `radial-gradient`.

- [ ] **Step 1: Escribir el test que falla (AppShell + pantallas)**

En `AppShell.test.tsx`, nuevo test:

```tsx
test('renderiza una única capa ambiental fija a toda la viewport', () => {
  const { container } = render(
    <AppShell step="home">
      <p>contenido</p>
    </AppShell>,
  )
  const glow = screen.getByTestId('ambient-glow')
  expect(glow).toHaveClass('fixed', 'inset-0', 'pointer-events-none')
  expect(container.querySelectorAll('[data-testid="ambient-glow"]')).toHaveLength(1)
  expect(container.querySelector('header')).toHaveClass('relative', 'z-10')
  expect(container.querySelector('main')).toHaveClass('relative', 'z-10')
})
```

En cada test file de pantalla (home/source/progress/summary), en un test de render existente, añadir:

```tsx
expect(container.querySelector('[style*="radial-gradient"]')).not.toBeInTheDocument()
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/layout/AppShell.test.tsx`
Expected: FAIL (no existe `data-testid="ambient-glow"`, header/main sin `z-10`).

- [ ] **Step 3: Implementar**

En `AppShell.tsx`: añadir la capa `ambient-glow` (primer hijo del div raíz) y `relative z-10` a `<header>` y `<main>`. En `HomeScreen.tsx`, `SourceScreen.tsx`, `ProgressScreen.tsx` y `SummaryScreen.tsx`: eliminar el `<div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(...)' }} />` de cada sección (el resto de la sección se mantiene).

- [ ] **Step 4: Verificar que pasa + build**

Run: `npx vitest run` → toda la suite PASS.
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit + push**

```bash
git add src/
git commit -m "feat: fondo ambiental full-bleed en AppShell (glows fuera de las pantallas)"
git push
```

---

### Task 2: Navegación hacia atrás (goVulns, migas clicables, botón Volver)

**Files:**
- Modify: `src/state/useAnalysis.ts` + `src/state/useAnalysis.test.ts`
- Modify: `src/components/layout/StepIndicator.tsx`
- Modify: `src/components/layout/AppShell.tsx` + `src/components/layout/AppShell.test.tsx`
- Modify: `src/components/progress/ProgressScreen.tsx` + `src/components/progress/ProgressScreen.test.tsx`
- Modify: `src/components/summary/SummaryScreen.tsx` + `src/components/summary/SummaryScreen.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AnalysisService` (el `cancel` devuelto por `run` ya está en `cancelRef`), `Step` de `src/types.ts`.
- Produces:
  - `useAnalysis`: `goSource()` pasa a **cancelar** cualquier análisis en curso antes de `setStep('source')`. Nuevo método `goVulns(): void` — si `source` es `null` es no-op; si no, cancela el análisis en curso y hace `setStep('vulns')`. Ambos se añaden a la interfaz `UseAnalysis` y al objeto devuelto.
  - `StepIndicator({ step, onGoSource, onGoVulns }: { step: Step; onGoSource: () => void; onGoVulns: () => void })`: los pasos con índice **menor** que el actual se renderizan como `<button type="button" aria-label={`Volver a ${s.label}`} onClick={s.key === 'source' ? onGoSource : onGoVulns} className="transition-colors duration-200 hover:text-neon-cyan">` con el mismo texto que hoy (`${s.label} ✓`); el paso actual sigue siendo `<span>` con `text-neon-magenta`; los futuros, `<span>` plano. El separador `·` y el `nav aria-label="Pasos de la auditoría"` se mantienen.
  - `AppShell({ step, onGoSource, onGoVulns, children })` pasa los dos callbacks al `StepIndicator`.
  - `ProgressScreen({ analysis, onBack }: { analysis: AnalysisProgress; onBack: () => void })`: al final de la sección, bloque `<div className="mt-8">` con `<button type="button" onClick={onBack} className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan">← Volver</button>` (mismo estilo que los `← Volver` existentes).
  - `SummaryScreen`: prop nueva `onBack: () => void`; en el `<footer>`, el cluster izquierdo (contador) se envuelve con el botón `← Volver` en un `<div className="flex flex-wrap items-center gap-4">`.

- [ ] **Step 1: Escribir los tests que fallan**

`useAnalysis.test.ts` (reutiliza el `FakeService` del archivo, que ya registra el `cancel` devuelto por `run()` en un spy — ver el test «cancela el análisis en curso al desmontar»):

```tsx
test('goVulns cancela el análisis en curso y vuelve a vulns', () => {
  const service = new FakeService() // run() devuelve el cancel que el FakeService registra
  const { result } = renderHook(() => useAnalysis(service))
  act(() => result.current.goSource())
  act(() => result.current.setSource({ kind: 'git', label: 'org/repo', value: 'https://github.com/org/repo' }))
  act(() => result.current.startAnalysis())
  expect(result.current.step).toBe('progress')
  act(() => result.current.goVulns())
  expect(result.current.step).toBe('vulns')
  expect(cancel).toHaveBeenCalled()
})

test('goVulns sin fuente es no-op', () => {
  const { result } = renderHook(() => useAnalysis(new FakeService()))
  act(() => result.current.goVulns())
  expect(result.current.step).toBe('home')
})

test('goSource cancela un análisis en curso', () => {
  // igual que el primero: tras startAnalysis, act(() => result.current.goSource())
  // → step 'source' y el cancel del FakeService llamado
})

test('volver de summary a vulns conserva el análisis hecho', () => {
  // FakeService que emite done al instante; startAnalysis → esperar done (step summary)
  // act(() => result.current.goVulns()) → step 'vulns', analysis.status sigue 'done'
  // y analysis.findings conserva su longitud
})
```

`StepIndicator` (en `AppShell.test.tsx` o su propio bloque):

```tsx
test('los pasos completados son botones clicables hacia atrás', () => {
  const onGoSource = vi.fn()
  const onGoVulns = vi.fn()
  render(<StepIndicator step="progress" onGoSource={onGoSource} onGoVulns={onGoVulns} />)
  fireEvent.click(screen.getByRole('button', { name: /volver a 1 fuente/i }))
  expect(onGoSource).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /volver a 2 vulnerabilidades/i }))
  expect(onGoVulns).toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /3 análisis/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /4 informe/i })).not.toBeInTheDocument()
})
```

(Actualizar los tests existentes de `AppShell`/`StepIndicator` que renderizan sin los props nuevos — pasan a incluir `onGoSource={() => {}}` y `onGoVulns={() => {}}`; la aserción `getByText(/1 FUENTE/)` + `toHaveTextContent('✓')` sigue válida porque el texto vive dentro del botón.)

`ProgressScreen.test.tsx` y `SummaryScreen.test.tsx`:

```tsx
test('«← Volver» llama a onBack', () => {
  const onBack = vi.fn()
  render(<ProgressScreen analysis={fixtureAnalysis} onBack={onBack} />)
  fireEvent.click(screen.getByRole('button', { name: /← volver/i }))
  expect(onBack).toHaveBeenCalled()
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/state/useAnalysis.test.ts src/components/layout/AppShell.test.tsx`
Expected: FAIL (props inexistentes / `goVulns` no está en el hook).

- [ ] **Step 3: Implementar**

`useAnalysis.ts`: `goSource` cancela (`cancelRef.current?.(); cancelRef.current = null`) antes del `setStep`; añadir `goVulns` con guard `if (!source) return`; exportar ambos en la interfaz y en el return. `StepIndicator.tsx`: nueva firma con callbacks; pasos completados → `<button>` según la interfaz. `AppShell.tsx`: props nuevos, pasados al `StepIndicator`. `ProgressScreen.tsx` / `SummaryScreen.tsx`: prop `onBack` + botón según la interfaz. `App.tsx`: `<AppShell step={flow.step} onGoSource={flow.goSource} onGoVulns={flow.goVulns}>`, `ProgressScreen` con `onBack={flow.goVulns}`, `SummaryScreen` con `onBack={flow.goVulns}`.

- [ ] **Step 4: Verificar que pasa + build**

Run: `npx vitest run` → suite completa PASS (el E2E de `App.test.tsx` debe seguir pasando: solo usa queries por role/texto, y «1 FUENTE» ahora puede ser botón — ninguna query actual choca).
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit + push**

```bash
git add src/
git commit -m "feat: navegación hacia atrás (migas de pan clicables + Volver en progreso y resumen)"
git push
```

---

### Task 3: Selector de carpeta real en SourceScreen

**Files:**
- Modify: `src/components/source/SourceScreen.tsx`
- Test: `src/components/source/SourceScreen.test.tsx`

**Interfaces:**
- Consumes: `Source` de `src/types.ts`; `NeonButton` (variant `outline` para el botón de selección).
- Produces: en la pestaña «Carpeta local», tras el radiogroup de proyectos demo, un separador (`<div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink-faint"><span className="h-px flex-1 bg-ink-faint/40" />o bien<span className="h-px flex-1 bg-ink-faint/40" /></div>`) + botón `📂 SELECCIONAR CARPETA` (`NeonButton variant="outline"`) que abre un `<input ref={folderInputRef} type="file" multiple webkitdirectory className="hidden" aria-label="Seleccionar carpeta local" />` oculto. Al cambiar (`onChange`): si `e.target.files.length === 0`, no pasa nada (Review Focus 1); si no, `name` = primer segmento de `webkitRelativePath` del primer archivo (fallback: último segmento de `e.target.value`), `fileCount = e.target.files.length`; se guarda en estado `picked: { name: string; fileCount: number } | null` y se **deselecciona** cualquier proyecto demo (`setSelected(null)`). Se muestra la confirmación `Carpeta seleccionada: {name} ({fileCount} archivos)` en `font-mono text-xs text-neon-cyan`. `canContinue` (pestaña folder) pasa a `selected !== null || picked !== null`. En `handleContinue`, si hay `picked` manda `{ kind: 'folder', label: picked.name, value: picked.name }` (la carpeta real tiene prioridad). TS: `declare global { interface HTMLInputElement { webkitdirectory?: string } }` al inicio del archivo (sin `any`).

- [ ] **Step 1: Escribir los tests que fallan**

En `SourceScreen.test.tsx` (helper local para crear archivos con `webkitRelativePath`):

```tsx
const folderFile = (relPath: string) => {
  const f = new File(['x'], relPath.split('/').pop() ?? 'x')
  Object.defineProperty(f, 'webkitRelativePath', { value: relPath })
  return f
}

test('seleccionar una carpeta real muestra confirmación y habilita CONTINUAR', () => {
  const onContinue = vi.fn()
  render(<SourceScreen onBack={() => {}} onContinue={onContinue} />)
  const input = screen.getByLabelText(/seleccionar carpeta local/i)
  fireEvent.change(input, { target: { files: [folderFile('mi-carpeta/src/a.ts'), folderFile('mi-carpeta/src/b.ts')] } })
  expect(screen.getByText(/carpeta seleccionada: mi-carpeta \(2 archivos\)/i)).toBeInTheDocument()
  const continuar = screen.getByRole('button', { name: /continuar/i })
  expect(continuar).toBeEnabled()
  fireEvent.click(continuar)
  expect(onContinue).toHaveBeenCalledWith({ kind: 'folder', label: 'mi-carpeta', value: 'mi-carpeta' })
})

test('elegir carpeta real deselecciona el proyecto demo (prioridad de la carpeta)', () => {
  const onContinue = vi.fn()
  render(<SourceScreen onBack={() => {}} onContinue={onContinue} />)
  fireEvent.click(screen.getByRole('radio', { name: /webapp-acme/i }))
  const input = screen.getByLabelText(/seleccionar carpeta local/i)
  fireEvent.change(input, { target: { files: [folderFile('otra-carpeta/x.py')] } })
  expect(screen.getByRole('radio', { name: /webapp-acme/i })).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
  expect(onContinue).toHaveBeenCalledWith({ kind: 'folder', label: 'otra-carpeta', value: 'otra-carpeta' })
})

test('carpeta vacía (0 archivos) no selecciona nada', () => {
  const onContinue = vi.fn()
  render(<SourceScreen onBack={() => {}} onContinue={onContinue} />)
  const input = screen.getByLabelText(/seleccionar carpeta local/i)
  fireEvent.change(input, { target: { files: [] } })
  expect(screen.queryByText(/carpeta seleccionada/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/components/source/SourceScreen.test.tsx`
Expected: FAIL (no existe el input ni la confirmación).

- [ ] **Step 3: Implementar**

Según la interfaz: estado `picked`, ref del input oculto, `onChange`, confirmación, `canContinue`, `handleContinue`, separador y botón `NeonButton variant="outline"` con `📂 SELECCIONAR CARPETA`.

- [ ] **Step 4: Verificar que pasa + build**

Run: `npx vitest run` → suite completa PASS.
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit + push**

```bash
git add src/
git commit -m "feat: selector de carpeta real (webkitdirectory) en la fuente"
git push
```

---

### Task 4: E2E de «volver» + verificación final

**Files:**
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: todo lo anterior (`App({ service })`, `createMockAnalysisService({ agentMs, tickMs })`, `AnalysisService`).
- Produces: cobertura E2E de la navegación hacia atrás y verificación de cierre de Fase 1.1.

- [ ] **Step 1: Escribir el test E2E (falla si la navegación no está cableada)**

En `App.test.tsx`:

```tsx
test('volver desde progreso lleva a vulnerabilidades y cancela el análisis', async () => {
  const inner = createMockAnalysisService({ agentMs: 400, tickMs: 20 })
  const onCancel = vi.fn()
  const service: AnalysisService = {
    run: (opts, onUpdate) => {
      const cancel = inner.run(opts, onUpdate)
      return () => { onCancel(); cancel() }
    },
  }
  render(<App service={service} />)
  fireEvent.click(screen.getByRole('button', { name: /analizar aplicación/i }))
  fireEvent.click(screen.getByRole('tab', { name: /repositorio git/i }))
  fireEvent.input(screen.getByPlaceholderText(/github/i), { target: { value: 'https://github.com/org/repo' } })
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
  fireEvent.click(screen.getByRole('button', { name: /ejecutar análisis/i }))
  expect(await screen.findByText(/análisis en curso/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /← volver/i }))
  expect(await screen.findByText(/elige qué vulnerabilidades auditar/i)).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /inyección/i })).toBeInTheDocument()
  expect(onCancel).toHaveBeenCalled()
})
```

- [ ] **Step 2: Verificar que pasa**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (la navegación ya está cableada en Task 2; este test la pincha de punta a punta). Si FALLA, hay un bug de cableado: arreglar en `App.tsx` antes de continuar.

- [ ] **Step 3: Suite completa + build**

Run: `npx vitest run` → toda la suite PASS, output sin warnings.
Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit + push**

```bash
git add src/App.test.tsx
git commit -m "test: E2E de navegación hacia atrás con cancel del análisis"
git push
```

- [ ] **Step 5: Cierre**

Actualizar `PROGRESS.md` (marcar tasks 1.1 completadas, estado) y commit `docs: Fase 1.1 completada` + push.
