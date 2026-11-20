import { useEffect, type ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(2,2,8,0.75)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-3xl rounded-lg border border-neon-cyan/60 bg-panel shadow-[0_0_30px_rgba(0,229,255,0.25)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-neon-cyan/20 px-6 py-4">
          <h2 id="modal-title" className="font-mono text-lg font-bold tracking-wider text-neon-cyan">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-2xl leading-none text-ink-dim transition-colors hover:text-neon-magenta"
          >
            ✕
          </button>
        </header>
        <div className="px-6 py-4 text-ink">{children}</div>
        {footer != null && (
          <footer className="border-t border-neon-cyan/20 px-6 py-4">{footer}</footer>
        )}
      </div>
    </div>
  )
}
