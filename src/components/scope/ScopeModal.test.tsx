import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Finding } from '../../types'
import { OWASP_VULNS } from '../../data/owasp'
import { buildScopeText } from './scopeText'
import { ScopeModal } from './ScopeModal'

afterEach(cleanup)

// 2 findings de ejemplo (brief Task 14): A03 crítico + A01 alto, los del
// mockup aprobado. El orden de entrada va a propósito desordenado (A03 → A01)
// para comprobar el orden canónico A01..A10 del sub de la cabecera.
const finding = (
  f: Pick<Finding, 'id' | 'vulnId' | 'severity' | 'title' | 'file' | 'line'>,
): Finding => ({
  snippet: 'código de ejemplo',
  exploit: 'vector de ejemplo',
  consequences: 'impacto de ejemplo',
  solution: 'solución de ejemplo',
  ...f,
})

const a03Crit = finding({
  id: 'A03-1',
  vulnId: 'A03',
  severity: 'critical',
  title: 'SQL injection en get_orders()',
  file: 'api/users.py',
  line: 128,
})
const a01High = finding({
  id: 'A01-1',
  vulnId: 'A01',
  severity: 'high',
  title: 'IDOR: perfil accesible sin comprobar el propietario',
  file: 'src/controllers/users.ts',
  line: 42,
})

const findings = [a03Crit, a01High]
const PROJECT = 'webapp-acme'
const DATE_ISO = '2026-11-20'

// Reloj fijo (vi.useFakeTimers): el modal siembra la fecha de hoy con
// new Date(), y los toasts se auto-ocultan a los 3 s.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${DATE_ISO}T12:00:00Z`))
})

afterEach(() => {
  vi.useRealTimers()
})

const renderModal = (onClose: () => void = () => {}) =>
  render(
    <ScopeModal open projectName={PROJECT} findings={findings} onClose={onClose} />,
  )

test('se abre precargado con el texto del alcance de los hallazgos marcados', () => {
  renderModal()

  expect(screen.getByText('ALCANCE TÉCNICO DE MEJORA')).toBeInTheDocument()
  expect(screen.getByText('Basado en 2 hallazgos marcados:')).toBeInTheDocument()
  expect(screen.getByText('A01 FALLOS DE CONTROL DE ACCESO')).toBeInTheDocument()
  expect(screen.getByText('A03 INYECCIÓN')).toBeInTheDocument()

  const expected = buildScopeText(findings, OWASP_VULNS, PROJECT, DATE_ISO)
  expect(screen.getByRole('textbox')).toHaveValue(expected)
})

test('editar el textarea actualiza el contador de palabras', () => {
  renderModal()

  const expected = buildScopeText(findings, OWASP_VULNS, PROJECT, DATE_ISO)
  const initialWords = expected.trim().split(/\s+/).filter(Boolean).length
  expect(screen.getByText(`≈ ${initialWords} palabras`)).toBeInTheDocument()

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'un dos tres' } })
  expect(screen.getByText('≈ 3 palabras')).toBeInTheDocument()
})

test('texto vacío o espacios deshabilita GENERAR PDF', () => {
  renderModal()

  const generar = screen.getByRole('button', { name: /generar pdf/i })
  expect(generar).toBeEnabled()

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
  expect(generar).toBeDisabled()

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  expect(generar).toBeDisabled()
})

test('COPIAR llama al clipboard y muestra toast; sin clipboard muestra el fallback sin lanzar', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  renderModal()

  const texto = buildScopeText(findings, OWASP_VULNS, PROJECT, DATE_ISO)
  fireEvent.click(screen.getByRole('button', { name: /copiar texto/i }))
  expect(writeText).toHaveBeenCalledOnce()
  expect(writeText).toHaveBeenCalledWith(texto)

  // El toast llega por el microtask de la promesa de writeText: con fake
  // timers se purga con act (waitFor/findByText no avanzan los timers de Vitest).
  await act(async () => {})
  expect(screen.getByText('Texto copiado al portapapeles')).toBeInTheDocument()

  // Sin clipboard: el fallback se muestra y no se lanza excepción.
  delete (navigator as unknown as { clipboard?: unknown }).clipboard
  fireEvent.click(screen.getByRole('button', { name: /copiar texto/i }))
  const fallback = 'No se pudo copiar: selecciona el texto y cópialo a mano'
  expect(screen.getByText(fallback)).toBeInTheDocument()

  // El toast se auto-oculta a los 3 s.
  await act(async () => {
    vi.advanceTimersByTime(3000)
  })
  expect(screen.queryByText(fallback)).not.toBeInTheDocument()

  // Y si el clipboard existe pero se rechaza, también cae al fallback sin lanzar.
  const writeRejected = vi.fn().mockRejectedValue(new Error('denied'))
  Object.assign(navigator, { clipboard: { writeText: writeRejected } })
  fireEvent.click(screen.getByRole('button', { name: /copiar texto/i }))
  expect(writeRejected).toHaveBeenCalledOnce()
  await act(async () => {})
  expect(screen.getByText(fallback)).toBeInTheDocument()
})

test('GENERAR PDF pide el PDF al backend y lo descarga', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response('%PDF-1.4 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  const onClose = vi.fn()
  renderModal(onClose)

  fireEvent.click(screen.getByRole('button', { name: /generar pdf/i }))
  await act(async () => {})

  expect(fetchMock).toHaveBeenCalledOnce()
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/reports/scope-pdf')
  const body = JSON.parse(init.body)
  expect(body.text).toBe(buildScopeText(findings, OWASP_VULNS, PROJECT, DATE_ISO))
  expect(screen.getByText('PDF descargado')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('GENERAR PDF envía projectName y descarga con nombre dinámico alcance-<proyecto>.pdf', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response('%PDF-1.4 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
  renderModal()

  fireEvent.click(screen.getByRole('button', { name: /generar pdf/i }))
  await act(async () => {})

  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(body.projectName).toBe(PROJECT) // 'webapp-acme'
  const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement // a.click(): el ancla es `this`
  expect(anchor.download).toBe('alcance-webapp-acme.pdf')

  clickSpy.mockRestore()
  vi.unstubAllGlobals()
})

test('GENERAR PDF con el backend caído muestra el error sin lanzar', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
  renderModal()

  fireEvent.click(screen.getByRole('button', { name: /generar pdf/i }))
  await act(async () => {})

  expect(screen.getByText('No se pudo generar el PDF (¿backend caído?)')).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('CANCELAR cierra el modal', () => {
  const onClose = vi.fn()
  renderModal(onClose)

  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

  expect(onClose).toHaveBeenCalledOnce()
})
