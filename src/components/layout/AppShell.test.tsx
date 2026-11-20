import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'
import { StepIndicator } from './StepIndicator'

afterEach(cleanup)

test('renderiza la marca SERBATIC e INSPECTOR', () => {
  render(
    <AppShell step="source" onGoSource={() => {}} onGoVulns={() => {}}>
      <p>contenido</p>
    </AppShell>,
  )
  expect(screen.getByText('SERBATIC')).toBeInTheDocument()
  expect(screen.getByText('INSPECTOR')).toBeInTheDocument()
})

test('renderiza una única capa ambiental fija a toda la viewport', () => {
  const { container } = render(
    <AppShell step="home" onGoSource={() => {}} onGoVulns={() => {}}>
      <p>contenido</p>
    </AppShell>,
  )
  const glow = screen.getByTestId('ambient-glow')
  expect(glow).toHaveClass('fixed', 'inset-0', 'pointer-events-none')
  expect(container.querySelectorAll('[data-testid="ambient-glow"]')).toHaveLength(1)
  expect(container.querySelector('header')).toHaveClass('relative', 'z-10')
  expect(container.querySelector('main')).toHaveClass('relative', 'z-10')
})

test('StepIndicator marca completados con ✓ y el actual en magenta', () => {
  render(<StepIndicator step="vulns" onGoSource={() => {}} onGoVulns={() => {}} />)
  expect(screen.getByText(/1 FUENTE/)).toHaveTextContent('✓')
  expect(screen.getByText('2 VULNERABILIDADES')).toHaveClass('text-neon-magenta')
})

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

test('no muestra el StepIndicator en home', () => {
  render(
    <AppShell step="home" onGoSource={() => {}} onGoVulns={() => {}}>
      <p>contenido</p>
    </AppShell>,
  )
  expect(screen.queryByText(/FUENTE/)).not.toBeInTheDocument()
  expect(screen.queryByText(/INFORME/)).not.toBeInTheDocument()
})
