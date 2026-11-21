import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { NeonButton } from '../ui/NeonButton'

export interface BrowseFolder {
  name: string
  path: string
  registered: 'local' | 'git' | null
}

export interface BrowseData {
  path: string
  parent: string | null
  folders: BrowseFolder[]
}

/** Prefijo de breadcrumb que es solo una unidad de Windows (p. ej. `C:`) → necesita `/` final. */
const DRIVE_ONLY = /^[A-Za-z]:$/

export function BrowseModal({
  open,
  onClose,
  onUse,
}: {
  open: boolean
  onClose: () => void
  onUse: (path: string) => void
}) {
  const [data, setData] = useState<BrowseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const navigate = async (target: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(target ? `/api/browse?path=${encodeURIComponent(target)}` : '/api/browse')
      if (res.status !== 200) {
        setData(null)
        setError('No se pudo leer la carpeta')
        return
      }
      setData((await res.json()) as BrowseData)
    } catch {
      setData(null)
      setError('No se pudo leer la carpeta')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void navigate(null)
    // Solo reacciona al abrir: al volver a abrir se repite la carga de la carpeta home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const segs = data ? data.path.split('/').filter(Boolean) : []

  return (
    <Modal
      open={open}
      title="ELEGIR CARPETA"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          <NeonButton variant="ghost" onClick={onClose}>
            CANCELAR
          </NeonButton>
          <NeonButton
            variant="primary"
            disabled={!data || loading}
            onClick={() => {
              if (data) onUse(data.path)
            }}
          >
            USAR ESTA CARPETA
          </NeonButton>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border border-ink-faint bg-night/60 px-3 py-2">
        <NeonButton
          variant="ghost"
          disabled={!data?.parent || loading}
          onClick={() => {
            if (data?.parent) void navigate(data.parent)
          }}
        >
          ↑ SUBIR
        </NeonButton>
        <nav aria-label="Ruta actual" className="flex flex-wrap items-center gap-1 font-mono text-xs">
          {segs.map((seg, i) => {
            const isLast = i === segs.length - 1
            const prefix = segs.slice(0, i + 1).join('/')
            const target = DRIVE_ONLY.test(prefix) ? `${prefix}/` : prefix
            return (
              <span key={`${i}:${seg}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-ink-faint">›</span>}
                {isLast ? (
                  <span className="font-bold text-neon-cyan">{seg}</span>
                ) : (
                  <button
                    type="button"
                    className="text-ink-dim transition-colors hover:text-neon-cyan"
                    onClick={() => {
                      void navigate(target)
                    }}
                  >
                    {seg}
                  </button>
                )}
              </span>
            )
          })}
        </nav>
      </div>

      <div className="mt-3 max-h-72 overflow-y-auto border border-ink-faint">
        {loading ? (
          <p className="px-4 py-3 font-mono text-xs uppercase tracking-widest text-ink-dim">CARGANDO…</p>
        ) : error ? (
          <p className="px-4 py-3 font-mono text-xs text-sev-critical">{error}</p>
        ) : data && data.folders.length === 0 ? (
          <p className="px-4 py-3 font-mono text-xs text-ink-faint">Sin subcarpetas</p>
        ) : (
          <ul>
            {data?.folders.map(f => (
              <li key={f.path} className="border-b border-ink-faint/50 last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    void navigate(f.path)
                  }}
                  className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-neon-cyan/5"
                >
                  <span className="font-mono text-sm text-ink">{f.name}</span>
                  {f.registered && (
                    <span className="font-mono text-[10px] text-neon-cyan">
                      {f.registered === 'local' ? 'LOCAL' : 'GIT'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
