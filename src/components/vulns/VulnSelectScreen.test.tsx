import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OWASP_VULNS } from '../../data/owasp'
import { VulnSelectScreen } from './VulnSelectScreen'

afterEach(cleanup)

const all = OWASP_VULNS.map(v => v.id)

const renderScreen = (
  selected: string[] = [],
  handlers: {
    onToggle?: (id: string) => void
    onSetAll?: (ids: string[]) => void
    onRun?: () => void
  } = {},
) =>
  render(
    <VulnSelectScreen
      selected={selected}
      onToggle={handlers.onToggle ?? (() => {})}
      onSetAll={handlers.onSetAll ?? (() => {})}
      onRun={handlers.onRun ?? (() => {})}
      onBack={() => {}}
    />,
  )

test('renderiza las 10 vulns con código, nombre y descripción', () => {
  const { container } = renderScreen(['A01'])
  expect(container.querySelector('[style*="radial-gradient"]')).not.toBeInTheDocument()
  for (const v of OWASP_VULNS) {
    expect(screen.getByText(v.id)).toBeInTheDocument()
    expect(screen.getByText(v.name)).toBeInTheDocument()
    expect(screen.getByText(v.description)).toBeInTheDocument()
  }
  expect(screen.getByRole('checkbox', { name: 'A01 Fallos de control de acceso' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'A02 Fallos criptográficos' })).not.toBeChecked()
  expect(screen.getByText('1 DE 10 SELECCIONADAS')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /volver/i })).toBeInTheDocument()
})

test('el label de la fila lleva anillo de foco visible para navegación por teclado', () => {
  renderScreen(['A01'])
  const label = screen
    .getByRole('checkbox', { name: 'A01 Fallos de control de acceso' })
    .closest('label')
  expect(label).not.toBeNull()
  // jsdom no implementa :focus-visible; se afirma la clase estática en el wrapper.
  expect(label).toHaveClass('has-[:focus-visible]:ring-2', 'has-[:focus-visible]:ring-neon-cyan')
})

test('toggle de una fila llama a onToggle con su id', () => {
  const onToggle = vi.fn()
  renderScreen(['A03'], { onToggle })
  fireEvent.click(screen.getByRole('checkbox', { name: /inyección/i }))
  expect(onToggle).toHaveBeenCalledOnce()
  expect(onToggle).toHaveBeenCalledWith('A03')
})

test('seleccionar todas marca las 10; con todas marcadas el botón pasa a deseleccionar todas', () => {
  const onSetAll = vi.fn()
  renderScreen([], { onSetAll })
  fireEvent.click(screen.getByRole('button', { name: /seleccionar todas/i }))
  expect(onSetAll).toHaveBeenCalledOnce()
  expect(onSetAll).toHaveBeenCalledWith(all)
  cleanup()

  renderScreen(all, { onSetAll })
  fireEvent.click(screen.getByRole('button', { name: /deseleccionar todas/i }))
  expect(onSetAll).toHaveBeenCalledTimes(2)
  expect(onSetAll).toHaveBeenLastCalledWith([])
})

test('ejecutar está deshabilitado con 0 seleccionadas', () => {
  renderScreen([])
  expect(screen.getByRole('button', { name: /ejecutar análisis/i })).toBeDisabled()
  expect(screen.getByText('0 DE 10 SELECCIONADAS')).toBeInTheDocument()
})

test('contabiliza solo ids canónicos: 9 canónicas + 1 foránea → «9 DE 10» y SELECCIONAR TODAS', () => {
  const stray = [...OWASP_VULNS.slice(0, 9).map(v => v.id), 'X99']
  renderScreen(stray)
  expect(screen.getByText('9 DE 10 SELECCIONADAS')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'SELECCIONAR TODAS' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'DESELECCIONAR TODAS' })).not.toBeInTheDocument()
})

test('ejecutar llama a onRun con ≥1 seleccionada', () => {
  const onRun = vi.fn()
  renderScreen(['A02'], { onRun })
  const run = screen.getByRole('button', { name: /ejecutar análisis/i })
  expect(run).toBeEnabled()
  fireEvent.click(run)
  expect(onRun).toHaveBeenCalledOnce()
})
