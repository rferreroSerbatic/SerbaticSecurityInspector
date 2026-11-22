import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SourceScreen } from './SourceScreen'
import type { ProjectInfo } from '../../types'

afterEach(cleanup)

const renderScreen = (onContinue: (s: unknown) => void = () => {}) =>
  render(<SourceScreen onBack={() => {}} onContinue={onContinue} />)

const continueBtn = () => screen.getByRole('button', { name: /continuar/i })

const openGitTab = () =>
  fireEvent.click(screen.getByRole('tab', { name: /repositorio git/i }))

const gitInput = () => screen.getByPlaceholderText('https://github.com/org/repo')

const folderFile = (relPath: string) => {
  const f = new File(['x'], relPath.split('/').pop() ?? 'x')
  Object.defineProperty(f, 'webkitRelativePath', { value: relPath })
  return f
}

test('continuar está deshabilitado sin fuente', () => {
  const { container } = renderScreen()
  expect(container.querySelector('[style*="radial-gradient"]')).not.toBeInTheDocument()
  expect(continueBtn()).toBeDisabled()
})

test('rechaza URLs inválidas: vacía, "notaunaurl", con espacios', () => {
  renderScreen()
  openGitTab()
  expect(continueBtn()).toBeDisabled()
  fireEvent.change(gitInput(), { target: { value: 'notaunaurl' } })
  expect(continueBtn()).toBeDisabled()
  fireEvent.change(gitInput(), { target: { value: 'https://github.com/org repo' } })
  expect(continueBtn()).toBeDisabled()
})

test('acepta https://… y git@github.com:user/repo.git (con o sin .git)', () => {
  const spy = vi.fn()
  renderScreen(spy)
  openGitTab()
  const cont = continueBtn()

  fireEvent.change(gitInput(), {
    target: { value: 'https://github.com/org/repo.git' },
  })
  expect(cont).toBeEnabled()
  fireEvent.click(cont)
  expect(spy).toHaveBeenCalledWith({
    kind: 'git',
    label: 'github.com/org/repo',
    value: 'https://github.com/org/repo.git',
  })
  spy.mockClear()

  fireEvent.change(gitInput(), {
    target: { value: 'git@github.com:user/repo.git' },
  })
  expect(cont).toBeEnabled()
  fireEvent.click(cont)
  expect(spy).toHaveBeenCalledWith({
    kind: 'git',
    label: 'github.com/user/repo',
    value: 'git@github.com:user/repo.git',
  })
  spy.mockClear()

  fireEvent.change(gitInput(), { target: { value: 'https://github.com/org/repo' } })
  expect(cont).toBeEnabled()
  fireEvent.click(cont)
  expect(spy).toHaveBeenCalledWith({
    kind: 'git',
    label: 'github.com/org/repo',
    value: 'https://github.com/org/repo',
  })
})

test('seleccionar una carpeta real muestra confirmación y habilita CONTINUAR', () => {
  const spy = vi.fn()
  renderScreen(spy)
  const input = screen.getByLabelText(/seleccionar carpeta local/i)
  fireEvent.change(input, {
    target: { files: [folderFile('mi-carpeta/src/a.ts'), folderFile('mi-carpeta/src/b.ts')] },
  })
  expect(screen.getByText(/carpeta seleccionada: mi-carpeta \(2 archivos\)/i)).toBeInTheDocument()
  expect(continueBtn()).toBeEnabled()
  fireEvent.click(continueBtn())
  expect(spy).toHaveBeenCalledWith({ kind: 'folder', label: 'mi-carpeta', value: 'mi-carpeta' })
})

test('carpeta vacía (0 archivos) no selecciona nada', () => {
  renderScreen()
  const input = screen.getByLabelText(/seleccionar carpeta local/i)
  fireEvent.change(input, { target: { files: [] } })
  expect(screen.queryByText(/carpeta seleccionada/i)).not.toBeInTheDocument()
  expect(continueBtn()).toBeDisabled()
})

// --- Task 7: modo live (proyectos reales del backend) ---
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

// --- Task 7 (Fase 2b): bloque «AUDITAR UN PROYECTO PROPIO» (ruta local + git) ---
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const liveScreen = (props: { projects?: ProjectInfo[]; onRefresh?: () => Promise<void> } = {}) =>
  render(
    <SourceScreen
      projects={props.projects ?? PROJECTS}
      onBack={() => {}}
      onContinue={() => {}}
      onRefresh={props.onRefresh}
    />,
  )

test('modo live: bloque «Auditar un proyecto propio» con las 2 filas', () => {
  liveScreen()
  expect(screen.getByText('AUDITAR UN PROYECTO PROPIO')).toBeInTheDocument()
  // collapseWhitespace: false — el normalizador por defecto colapsaría los espacios
  // múltiples del placeholder («miapp  o  /home») y el matcher exacto fallaría.
  expect(
    screen.getByPlaceholderText('C:\\proyectos\\miapp  o  /home/user/proj', {
      collapseWhitespace: false,
    }),
  ).toBeInTheDocument()
  expect(screen.getByPlaceholderText('https://github.com/org/repo')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'AUDITAR RUTA' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'CLONAR Y AUDITAR' })).toBeDisabled()
})

test('modo live: registra una ruta local (201 → onRefresh + input limpio)', async () => {
  const fetchMockFn = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 201, json: async () => ({ project: { id: 'miapp' } }) })
  globalThis.fetch = fetchMockFn as unknown as typeof fetch
  const onRefresh = vi.fn().mockResolvedValue(undefined)
  liveScreen({ onRefresh })

  const input = screen.getByLabelText('Ruta local del proyecto')
  fireEvent.change(input, { target: { value: 'C:\\proyectos\\mi app' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'AUDITAR RUTA' }))
  })

  expect(fetchMockFn).toHaveBeenCalledWith('/api/projects/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'C:\\proyectos\\mi app' }),
  })
  expect(onRefresh).toHaveBeenCalledTimes(1)
  expect(input).toHaveValue('')
})

test('modo live: error 400 de ruta', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch
  liveScreen()
  const input = screen.getByLabelText('Ruta local del proyecto')
  fireEvent.change(input, { target: { value: 'C:\\noexiste' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'AUDITAR RUTA' }))
  })
  expect(
    screen.getByText('Ruta no válida: debe existir, ser una carpeta y no estar dentro de samples/'),
  ).toBeInTheDocument()
})

test('modo live: error 404 de ruta', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
  liveScreen()
  const input = screen.getByLabelText('Ruta local del proyecto')
  fireEvent.change(input, { target: { value: 'C:\\vacia' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'AUDITAR RUTA' }))
  })
  expect(screen.getByText('Sin archivos de código en esa ruta')).toBeInTheDocument()
})

test('modo live: clonación git pendiente y éxito', async () => {
  let resolveGit!: (res: { ok: boolean; status: number }) => void
  const fetchMockFn = vi.fn(
    () => new Promise<{ ok: boolean; status: number }>(resolve => { resolveGit = resolve }),
  )
  globalThis.fetch = fetchMockFn as unknown as typeof fetch
  const onRefresh = vi.fn().mockResolvedValue(undefined)
  liveScreen({ onRefresh })

  const input = screen.getByLabelText('URL del repositorio git')
  fireEvent.change(input, { target: { value: 'https://github.com/org/repo' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'CLONAR Y AUDITAR' }))
  })
  expect(screen.getByRole('button', { name: 'CLONANDO…' })).toBeInTheDocument()

  await act(async () => {
    resolveGit({ ok: true, status: 201 })
  })
  expect(fetchMockFn).toHaveBeenCalledWith('/api/projects/git', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://github.com/org/repo' }),
  })
  expect(onRefresh).toHaveBeenCalledTimes(1)
  expect(input).toHaveValue('')
})

test('modo live: error 502 de git', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch
  liveScreen()
  const input = screen.getByLabelText('URL del repositorio git')
  fireEvent.change(input, { target: { value: 'https://github.com/org/nope' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'CLONAR Y AUDITAR' }))
  })
  expect(
    screen.getByText('No se pudo clonar: revisa la URL o inténtalo de nuevo'),
  ).toBeInTheDocument()
})

test('modo live: tag LOCAL/GIT según kind (sample sin tag)', () => {
  const projects: ProjectInfo[] = [
    { id: 'miniapp', name: 'miniapp', path: 'C:/samples/miniapp', files: 12, lines: 340 },
    { id: 'miapp', name: 'miapp', path: 'C:/proyectos/miapp', files: 30, lines: 800, kind: 'local' },
    { id: 'repo', name: 'repo', path: 'C:/clones/repo', files: 40, lines: 900, kind: 'git' },
  ]
  liveScreen({ projects })
  expect(screen.getByText('LOCAL')).toBeInTheDocument()
  expect(screen.getByText('GIT')).toBeInTheDocument()
})

test('modo mock: sin el bloque «Auditar un proyecto propio»', () => {
  renderScreen()
  expect(screen.queryByText(/auditar un proyecto propio/i)).toBeNull()
})

test('modo live con 0 proyectos: mensaje de estado vacío (QA-iter 9)', () => {
  liveScreen({ projects: [] })
  expect(screen.getByText(/SIN PROYECTOS DE EJEMPLO/i)).toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})

// --- Task 2 (Fase 2b.1): navegador de carpetas (📂 NAVEGAR) ---
const TARGET = 'C:/Users/rferrero/Documentos/mi app (copia)'

const browseFetch = (
  bodies: Array<{ path: string; parent: string | null; folders: unknown[] }>,
  postStatus = 201,
) => {
  let n = 0
  // `_init` con prefijo (y no usado): deja tipar `mock.calls[i][1]` (el body del POST)
  // sin error de `noUnusedParameters`.
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
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

test('eliminar: modal de confirmación → DELETE /api/projects/<id> + onRefresh', async () => {
  const fetchMockFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, kind: 'local' }) })
  globalThis.fetch = fetchMockFn as unknown as typeof fetch
  const onRefresh = vi.fn().mockResolvedValue(undefined)
  liveScreen({ projects: LIVE_DELETABLE, onRefresh })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi app' }))
  })
  // QA-iter 10: modal estilizado en vez de window.confirm nativo.
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('¿Eliminar "mi app" de la lista?')).toBeInTheDocument()
  expect(screen.getByText(/la carpeta original y sus archivos no se tocan/i)).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^ELIMINAR$/i }))
  })
  expect(fetchMockFn).toHaveBeenCalledTimes(1)
  expect(String(fetchMockFn.mock.calls[0][0])).toBe('/api/projects/local-1')
  expect(fetchMockFn.mock.calls[0][1]?.method).toBe('DELETE')
  expect(onRefresh).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('eliminar: cancelar el modal no lanza DELETE', async () => {
  const fetchMockFn = vi.fn()
  globalThis.fetch = fetchMockFn as unknown as typeof fetch
  liveScreen({ projects: LIVE_DELETABLE })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar dvwa' }))
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /CANCELAR/i }))
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetchMockFn).not.toHaveBeenCalled()
})

test('eliminar la fila seleccionada limpia la selección (CONTINUAR deshabilitado)', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, kind: 'local' }) }) as unknown as typeof fetch
  liveScreen({ projects: LIVE_DELETABLE })
  fireEvent.click(screen.getByRole('radio', { name: /mi app/ }))
  expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi app' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^ELIMINAR$/i }))
  })
  expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
})

test('eliminar una fila ANTERIOR a la seleccionada limpia también la selección (CONTINUAR deshabilitado)', async () => {
  // La fila 0 debe ser borrable (local/git): en LIVE_DELETABLE la fila 0 es sample
  // y no tiene botón de eliminar por diseño.
  const projects: ProjectInfo[] = [
    { id: 'local-0', name: 'proyecto uno', path: 'C:/proyectos/proyecto uno', files: 10, lines: 200, kind: 'local' },
    { id: 'git-1', name: 'proyecto dos', path: 'C:/workspace/repos/github.com-x-y-d4e5f6', files: 20, lines: 400, kind: 'git' },
    { id: 'local-2', name: 'proyecto tres', path: 'C:/proyectos/proyecto tres', files: 30, lines: 600, kind: 'local' },
  ]
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, kind: 'local' }) }) as unknown as typeof fetch
  liveScreen({ projects })
  // Selección en índice 1; se borra la fila índice 0: con la limpieza condicional,
  // `selected` (=1) queda obsoleto tras el borrado y CONTINUAR seguiría habilitado.
  fireEvent.click(screen.getByRole('radio', { name: /proyecto dos/ }))
  expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar proyecto uno' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^ELIMINAR$/i }))
  })
  expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
})

test('eliminar: 404 del backend limpia la selección (CONTINUAR deshabilitado)', async () => {
  // Misma clase de bug que la ruling R-T2 en la rama 200: si la fila 404 estaba
  // ANTES de la seleccionada, el índice queda obsoleto → auditoría equivocada.
  const projects: ProjectInfo[] = [
    { id: 'local-0', name: 'proyecto uno', path: 'C:/proyectos/proyecto uno', files: 10, lines: 200, kind: 'local' },
    { id: 'git-1', name: 'proyecto dos', path: 'C:/workspace/repos/github.com-x-y-d4e5f6', files: 20, lines: 400, kind: 'git' },
  ]
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
  const onRefresh = vi.fn().mockResolvedValue(undefined)
  liveScreen({ projects, onRefresh })
  // Selección en índice 1; se borra la fila índice 0 y el backend responde 404.
  fireEvent.click(screen.getByRole('radio', { name: /proyecto dos/ }))
  expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar proyecto uno' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^ELIMINAR$/i }))
  })
  expect(screen.getByText('El proyecto ya no existe')).toBeInTheDocument()
  expect(onRefresh).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('eliminar: 409 del backend → mensaje inline con el detail', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false, status: 409,
    json: async () => ({ detail: 'Hay un análisis en curso para este proyecto; cancela antes de eliminarlo' }),
  }) as unknown as typeof fetch
  liveScreen({ projects: LIVE_DELETABLE })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi app' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^ELIMINAR$/i }))
  })
  expect(
    screen.getByText('Hay un análisis en curso para este proyecto; cancela antes de eliminarlo'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  vi.restoreAllMocks()
})
