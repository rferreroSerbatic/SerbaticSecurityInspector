import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'
import { StepIndicator } from './StepIndicator'

afterEach(cleanup)

test('renderiza la marca SERBATIC e INSPECTOR', () => {
  render(
    <AppShell step="source">
      <p>contenido</p>
    </AppShell>,
  )
  expect(screen.getByText('SERBATIC')).toBeInTheDocument()
  expect(screen.getByText('INSPECTOR')).toBeInTheDocument()
})

test('StepIndicator marca completados con ✓ y el actual en magenta', () => {
  render(<StepIndicator step="vulns" />)
  expect(screen.getByText(/1 FUENTE/)).toHaveTextContent('✓')
  expect(screen.getByText('2 VULNERABILIDADES')).toHaveClass('text-neon-magenta')
})

test('no muestra el StepIndicator en home', () => {
  render(
    <AppShell step="home">
      <p>contenido</p>
    </AppShell>,
  )
  expect(screen.queryByText(/FUENTE/)).not.toBeInTheDocument()
  expect(screen.queryByText(/INFORME/)).not.toBeInTheDocument()
})
