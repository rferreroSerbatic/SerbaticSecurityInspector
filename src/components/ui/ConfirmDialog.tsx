import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { NeonButton } from './NeonButton'

/** Diálogo de confirmación estilizado (QA-iter 10): sustituye a window.confirm. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'CONFIRMAR',
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  /** 'outline' (magenta) para acciones destructivas. */
  confirmVariant?: 'primary' | 'outline'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <Modal
      open
      title={title}
      onClose={onCancel}
      footer={
        <div className="flex items-center justify-end gap-3">
          <NeonButton variant="ghost" onClick={onCancel} disabled={busy}>
            CANCELAR
          </NeonButton>
          <NeonButton variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </NeonButton>
        </div>
      }
    >
      <div className="text-sm leading-relaxed text-ink-dim">{message}</div>
    </Modal>
  )
}
