import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { createMockAnalysisService } from './services/mockAnalysisService'

afterEach(cleanup)

const fast = createMockAnalysisService({ agentMs: 60, tickMs: 10 })

test('flujo completo: home → fuente git → vulns (2 seleccionadas) → progreso → resumen', async () => {
  render(<App service={fast} />)
  fireEvent.click(screen.getByRole('button', { name: /analizar aplicación/i }))
  fireEvent.click(screen.getByRole('tab', { name: /repositorio git/i }))
  fireEvent.input(screen.getByPlaceholderText(/github/i), { target: { value: 'https://github.com/org/repo' } })
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
  // deseleccionar todas y marcar solo A03 y A07
  fireEvent.click(screen.getByRole('button', { name: /seleccionar todas/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /inyección/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /autenticación|identificación/i }))
  fireEvent.click(screen.getByRole('button', { name: /ejecutar análisis/i }))
  expect(await screen.findByText(/análisis en curso/i)).toBeInTheDocument()
  expect(await screen.findByText(/análisis completado/i, undefined, { timeout: 5000 })).toBeInTheDocument()
})

test('desmontar durante el análisis no deja actualizaciones pendientes', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { unmount } = render(<App service={createMockAnalysisService({ agentMs: 400, tickMs: 20 })} />)
  // avanzar hasta el paso de progreso y unmountar
  fireEvent.click(screen.getByRole('button', { name: /analizar aplicación/i }))
  fireEvent.click(screen.getByRole('tab', { name: /repositorio git/i }))
  fireEvent.input(screen.getByPlaceholderText(/github/i), { target: { value: 'https://github.com/org/repo' } })
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
  // Las 10 vulns vienen preseleccionadas: ejecutar y esperar a que se renderice el progreso.
  fireEvent.click(screen.getByRole('button', { name: /ejecutar análisis/i }))
  await screen.findByText(/análisis en curso/i)
  unmount()
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})
