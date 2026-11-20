import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NeonButton } from './NeonButton'
import { SeverityBadge } from './SeverityBadge'
import { ProgressBar } from './ProgressBar'
import { Modal } from './Modal'

test('SeverityBadge muestra label y color por severidad', () => {
  for (const [sev, label, bg] of [
    ['critical', 'CRÍTICO', 'rgb(255, 45, 149)'],
    ['high', 'ALTO', 'rgb(255, 159, 67)'],
    ['medium', 'MEDIO', 'rgb(255, 210, 63)'],
    ['low', 'BAJO', 'rgb(0, 229, 255)'],
  ] as const) {
    const { unmount } = render(<SeverityBadge severity={sev} />)
    expect(screen.getByText(label)).toHaveStyle({ backgroundColor: bg })
    unmount()
  }
})
test('NeonButton lanza onClick y respeta disabled', () => {
  const spy = vi.fn()
  render(
    <NeonButton onClick={spy} disabled>
      OK
    </NeonButton>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  expect(spy).not.toHaveBeenCalled()
})
test('ProgressBar pinta el fill con el ancho dado', () => {
  render(<ProgressBar value={40} />)
  expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '40%' })
})
test('Modal no pinta si está cerrado; abierto muestra contenido y cierra con Escape', () => {
  const onClose = vi.fn()
  render(
    <Modal open={false} title="T" onClose={onClose}>
      cuerpo
    </Modal>,
  )
  expect(screen.queryByText('cuerpo')).not.toBeInTheDocument()
  render(
    <Modal open title="T" onClose={onClose}>
      cuerpo
    </Modal>,
  )
  expect(screen.getByText('cuerpo')).toBeInTheDocument()
  // El diálogo tiene nombre accesible vía el <h2 id="modal-title">.
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'modal-title')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
