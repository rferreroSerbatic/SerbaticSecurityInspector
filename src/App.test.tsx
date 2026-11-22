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
  // QA-iter 9: en live no hay banner de modo demo.
  expect(screen.queryByText(/MODO DEMO/i)).not.toBeInTheDocument()
})

test('autodetección: backend caído → modo mock (con banner visible, QA-iter 9)', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
  const { findByText } = render(<App />)
  // QA-iter 11: la detección reintentas 4 veces (~2,3 s) antes de caer a mock.
  expect(await findByText('ANALIZAR APLICACIÓN', undefined, { timeout: 8000 })).toBeTruthy()
  expect(screen.getByText(/MODO DEMO/i)).toBeInTheDocument()
}, 15000)

test('autodetección: backend arrancando (fallo, fallo, ok) → live sin pasar por mock (QA-iter 11)', async () => {
  let healthCalls = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/health') {
      healthCalls++
      if (healthCalls < 3) throw new Error('uvicorn aún arrancando')
      return new Response('ok', { status: 200 })
    }
    return new Response(JSON.stringify([{ id: 'a', name: 'a', path: '/x', files: 1, lines: 1 }]), { status: 200 })
  }))
  const { findByText } = render(<App />)
  expect(await findByText('ANALIZAR APLICACIÓN', undefined, { timeout: 8000 })).toBeTruthy()
  expect(healthCalls).toBeGreaterThanOrEqual(3)
  expect(screen.queryByText(/MODO DEMO/i)).not.toBeInTheDocument()
}, 15000)

test('banner MODO DEMO: REINTENTAR vuelve a detectar (el backend subió después) (QA-iter 11)', async () => {
  let up = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!up) throw new Error('down')
    if (url === '/api/health') return new Response('ok', { status: 200 })
    return new Response(JSON.stringify([{ id: 'a', name: 'a', path: '/x', files: 1, lines: 1 }]), { status: 200 })
  }))
  render(<App />)
  expect(await screen.findByText(/MODO DEMO/i, undefined, { timeout: 8000 })).toBeInTheDocument()
  up = true
  fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
  expect(await screen.findByText('ANALIZAR APLICACIÓN', undefined, { timeout: 8000 })).toBeTruthy()
  expect(screen.queryByText(/MODO DEMO/i)).not.toBeInTheDocument()
}, 20000)

test('autodetección: /api/projects con 0 proyectos → modo live vacía (QA-iter 9; antes M2 caía a mock)', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url === '/api/health'
      ? new Response('ok', { status: 200 })
      : new Response(JSON.stringify([]), { status: 200 })))
  render(<App />)
  const analizar = await screen.findByRole('button', { name: /analizar aplicación/i })
  fireEvent.click(analizar)

  // Backend arriba pero sin proyectos: NO es mock (hallazgos simulados): live con
  // lista vacía + mensaje de estado vacío + bloque «AUDITAR UN PROYECTO PROPIO».
  expect(screen.queryByRole('tab', { name: /carpeta local/i })).not.toBeInTheDocument()
  expect(await screen.findByText(/AUDITAR UN PROYECTO PROPIO/i)).toBeTruthy()
  expect(await screen.findByText(/SIN PROYECTOS DE EJEMPLO/i)).toBeTruthy()
  expect(screen.queryByText(/MODO DEMO/i)).not.toBeInTheDocument()
})

test('loading mientras la detección no resuelve', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const { getByText } = render(<App />)
  expect(getByText('CONECTANDO…')).toBeTruthy()
})
