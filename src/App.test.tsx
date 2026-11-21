import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { createMockAnalysisService } from './services/mockAnalysisService'
import type { AnalysisService } from './types'

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

// --- Task 7: autodetección de backend (modo live) ---
afterEach(() => vi.unstubAllGlobals())

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

test('autodetección: /api/projects con 0 proyectos → modo mock (M2)', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url === '/api/health'
      ? new Response('ok', { status: 200 })
      : new Response(JSON.stringify([]), { status: 200 })))
  render(<App />)
  const analizar = await screen.findByRole('button', { name: /analizar aplicación/i })
  fireEvent.click(analizar)

  // Modo mock: tab de carpeta local + proyectos demo, no la lista live (que quedaría vacía).
  expect(await screen.findByRole('tab', { name: /carpeta local/i })).toBeTruthy()
  expect((await screen.findAllByText(/webapp-acme/)).length).toBeGreaterThanOrEqual(1)
  expect(screen.queryByText(/AUDITAR UN PROYECTO PROPIO/i)).not.toBeInTheDocument()
})

test('loading mientras la detección no resuelve', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const { getByText } = render(<App />)
  expect(getByText('CONECTANDO…')).toBeTruthy()
})
