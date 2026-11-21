import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SourceScreen } from './SourceScreen'

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

test('elegir un proyecto mock habilita continuar y pasa un Source folder', () => {
  const spy = vi.fn()
  renderScreen(spy)
  fireEvent.click(screen.getByRole('radio', { name: /webapp-acme/ }))
  expect(continueBtn()).toBeEnabled()
  fireEvent.click(continueBtn())
  expect(spy).toHaveBeenCalledOnce()
  expect(spy).toHaveBeenCalledWith({
    kind: 'folder',
    label: 'webapp-acme',
    value: 'C:\\proyectos\\webapp-acme',
  })
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

test('elegir carpeta real deselecciona el proyecto demo (prioridad de la carpeta)', () => {
  const spy = vi.fn()
  renderScreen(spy)
  fireEvent.click(screen.getByRole('radio', { name: /webapp-acme/i }))
  const input = screen.getByLabelText(/seleccionar carpeta local/i)
  fireEvent.change(input, { target: { files: [folderFile('otra-carpeta/x.py')] } })
  expect(screen.getByRole('radio', { name: /webapp-acme/i })).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(continueBtn())
  expect(spy).toHaveBeenCalledWith({ kind: 'folder', label: 'otra-carpeta', value: 'otra-carpeta' })
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

test('modo live: nota de Fase 2b', () => {
  const { getByText } = render(<SourceScreen projects={PROJECTS} onBack={() => {}} onContinue={() => {}} />)
  expect(getByText(/Fase 2b/)).toBeTruthy()
})
