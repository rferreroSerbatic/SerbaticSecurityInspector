import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrowseModal } from './BrowseModal'
import type { BrowseData } from './BrowseModal'

const realFetch = globalThis.fetch
afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

const HOME: BrowseData = {
  path: 'C:/Users/rferrero',
  parent: 'C:/Users',
  folders: [
    { name: 'Documentos', path: 'C:/Users/rferrero/Documentos', registered: null },
    { name: 'mi app (copia)', path: 'C:/Users/rferrero/mi app (copia)', registered: 'local' },
  ],
}

const DOCS: BrowseData = {
  path: 'C:/Users/rferrero/Documentos',
  parent: 'C:/Users/rferrero',
  folders: [
    { name: 'SerbaticSecurityInspector', path: 'C:/Users/rferrero/Documentos/SerbaticSecurityInspector', registered: 'git' },
  ],
}

const mockQueue = (responses: Array<{ status: number; body?: BrowseData }>) => {
  let i = 0
  // `_url` con prefijo (y no usado): la firma con parámetro deja tipar `mock.calls[0]`
  // (con `vi.fn(async () => …)` el tuple de calls queda vacío y `tsc` lo rechaza).
  const fn = vi.fn(async (_url?: string) => {
    const r = responses[Math.min(i++, responses.length - 1)]
    return { ok: r.status === 200, status: r.status, json: async () => r.body ?? null }
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

test('al abrir, lista la carpeta home (GET /api/browse sin path) con tag LOCAL', async () => {
  const fn = mockQueue([{ status: 200, body: HOME }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(fn).toHaveBeenCalledWith('/api/browse')
  expect(screen.getByText('Documentos')).toBeInTheDocument()
  expect(screen.getByText('LOCAL')).toBeInTheDocument()
})

test('clic en subcarpeta → GET /api/browse?path=… y lista la nueva carpeta', async () => {
  const fn = mockQueue([
    { status: 200, body: HOME },
    { status: 200, body: DOCS },
  ])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  // Asienta la carga inicial: el callback de `act` corre síncrono, antes de que los
  // microtareas del fetch asincrónico se resuelvan (sin este act, el DOM sigue en CARGANDO…).
  await act(async () => {})
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /documentos/i }))
  })
  const lastUrl = String(fn.mock.calls[fn.mock.calls.length - 1]?.[0])
  expect(lastUrl.startsWith('/api/browse?path=')).toBe(true)
  expect(decodeURIComponent(lastUrl.split('path=')[1])).toBe('C:/Users/rferrero/Documentos')
  expect(screen.getByText('SerbaticSecurityInspector')).toBeInTheDocument()
  expect(screen.getByText('GIT')).toBeInTheDocument()
})

test('breadcrumbs: segmentos previos son botones, el último (actual) no', async () => {
  mockQueue([{ status: 200, body: DOCS }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'C:' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'rferrero' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Documentos' })).not.toBeInTheDocument()
})

test('clic en breadcrumb «Users» navega al prefijo', async () => {
  const fn = mockQueue([
    { status: 200, body: DOCS },
    { status: 200, body: HOME },
  ])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {}) // asienta la carga inicial (ver comentario del primer test)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Users' }))
  })
  const lastUrl = String(fn.mock.calls[fn.mock.calls.length - 1]?.[0])
  expect(decodeURIComponent(lastUrl.split('path=')[1])).toBe('C:/Users')
})

test('↑ SUBIR navega al parent', async () => {
  const fn = mockQueue([
    { status: 200, body: DOCS },
    { status: 200, body: HOME },
  ])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {}) // asienta la carga inicial (ver comentario del primer test)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /subir/i }))
  })
  const lastUrl = String(fn.mock.calls[fn.mock.calls.length - 1]?.[0])
  expect(decodeURIComponent(lastUrl.split('path=')[1])).toBe('C:/Users/rferrero')
})

test('sin parent (raíz) → SUBIR deshabilitado', async () => {
  mockQueue([{ status: 200, body: { ...DOCS, parent: null } }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByRole('button', { name: /subir/i })).toBeDisabled()
})

test('USAR ESTA CARPETA → onUse(path actual)', async () => {
  mockQueue([{ status: 200, body: DOCS }])
  const onUse = vi.fn()
  render(<BrowseModal open onClose={() => {}} onUse={onUse} />)
  await act(async () => {}) // asienta la carga inicial (ver comentario del primer test)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /usar esta carpeta/i }))
  })
  expect(onUse).toHaveBeenCalledWith('C:/Users/rferrero/Documentos')
})

test('error 400 del backend → mensaje inline', async () => {
  mockQueue([{ status: 400 }])
  render(<BrowseModal open onClose={() => {}} onUse={() => {}} />)
  await act(async () => {})
  expect(screen.getByText('No se pudo leer la carpeta')).toBeInTheDocument()
})
