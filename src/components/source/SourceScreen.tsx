import { useRef, useState } from 'react'
import { BrowseModal } from './BrowseModal'
import { NeonButton } from '../ui/NeonButton'
import type { ChangeEvent } from 'react'
import type { ProjectInfo, Source } from '../../types'

declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string
  }
}

const MOCK_PROJECTS = [
  { name: 'webapp-acme', path: 'C:\\proyectos\\webapp-acme' },
  { name: 'api-billing', path: 'C:\\proyectos\\api-billing' },
  { name: 'portal-rrhh', path: 'C:\\proyectos\\portal-rrhh' },
]

const isValidGitUrl = (s: string) => /^(https?:\/\/\S+|git@\S+)$/i.test(s.trim())

function gitShortLabel(url: string): string {
  const t = url.trim()
  if (t.startsWith('git@')) return t.slice(4).replace(':', '/').replace(/\.git$/, '')
  return t.replace(/^https?:\/\//i, '').replace(/\.git$/, '')
}

export function SourceScreen({
  onBack,
  onContinue,
  projects,
  onRefresh,
}: {
  onBack: () => void
  onContinue: (s: Source) => void
  /** Modo live (Fase 2a): proyectos reales del backend. `undefined` → modo mock. */
  projects?: ProjectInfo[]
  /** Modo live (Fase 2b): refrescar la lista tras registrar un proyecto propio. */
  onRefresh?: () => Promise<void>
}) {
  const live = projects !== undefined
  const [tab, setTab] = useState<'folder' | 'git'>('folder')
  const [selected, setSelected] = useState<number | null>(null)
  const [gitUrl, setGitUrl] = useState('')
  const [picked, setPicked] = useState<{ name: string; fileCount: number } | null>(null)
  // Bloque «AUDITAR UN PROYECTO PROPIO» (solo modo live, Fase 2b).
  const [localPath, setLocalPath] = useState('')
  const [gitRepoUrl, setGitRepoUrl] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [gitBusy, setGitBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [gitError, setGitError] = useState<string | null>(null)
  // Navegador de carpetas (G2 Fase 2b.1): modal live para elegir la carpeta por clics.
  const [browseOpen, setBrowseOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const canContinue = live
    ? selected !== null
    : tab === 'folder'
      ? selected !== null || picked !== null
      : isValidGitUrl(gitUrl)

  const handleContinue = () => {
    if (live && selected !== null) {
      const p = projects[selected]
      onContinue({ kind: 'folder', label: p.name, value: p.id })
    } else if (tab === 'folder' && picked !== null) {
      onContinue({ kind: 'folder', label: picked.name, value: picked.name })
    } else if (tab === 'folder' && selected !== null) {
      const p = MOCK_PROJECTS[selected]
      onContinue({ kind: 'folder', label: p.name, value: p.path })
    } else if (tab === 'git' && isValidGitUrl(gitUrl)) {
      onContinue({ kind: 'git', label: gitShortLabel(gitUrl), value: gitUrl.trim() })
    }
  }

  const handleFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const first = files[0]
    const name = first.webkitRelativePath
      ? first.webkitRelativePath.split('/')[0]
      : e.target.value.split(/[\\/]/).pop() ?? e.target.value
    setPicked({ name, fileCount: files.length })
    setSelected(null)
  }

  const submitLocal = async (pathOverride?: string) => {
    const path = (pathOverride ?? localPath).trim()
    if (!path || localBusy || gitBusy) return
    setLocalBusy(true)
    setLocalError(null)
    try {
      const res = await fetch('/api/projects/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (res.status === 201) {
        await onRefresh?.()
        setLocalPath('')
      } else if (res.status === 400) {
        setLocalError('Ruta no válida: debe existir, ser una carpeta y no estar dentro de samples/')
      } else if (res.status === 404) {
        setLocalError('Sin archivos de código en esa ruta')
      } else {
        setLocalError('Error de conexión con el backend')
      }
    } catch {
      setLocalError('Error de conexión con el backend')
    } finally {
      setLocalBusy(false)
    }
  }

  const submitGit = async () => {
    const url = gitRepoUrl.trim()
    if (!url || localBusy || gitBusy) return
    setGitBusy(true)
    setGitError(null)
    try {
      const res = await fetch('/api/projects/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (res.status === 201) {
        await onRefresh?.()
        setGitRepoUrl('')
      } else if (res.status === 400) {
        setGitError('URL de git no válida (usa una URL http/https)')
      } else if (res.status === 502) {
        setGitError('No se pudo clonar: revisa la URL o inténtalo de nuevo')
      } else {
        setGitError('Error de conexión con el backend')
      }
    } catch {
      setGitError('Error de conexión con el backend')
    } finally {
      setGitBusy(false)
    }
  }

  const deleteProject = async (p: ProjectInfo, _index: number) => {
    const detail =
      p.kind === 'git'
        ? 'Se borrará su clon del workspace. El repositorio original no se toca.'
        : 'La carpeta original y sus archivos no se tocan.'
    if (!window.confirm(`¿Eliminar "${p.name}" de la lista? ${detail}`)) return
    setDeletingId(p.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
      if (res.status === 200) {
        // Selección SIEMPRE limpia tras borrar (ruling T2 fix round 1): si se borra
        // una fila ANTERIOR a la seleccionada, el índice queda obsoleto → TypeError
        // en handleContinue o auditoría del proyecto equivocado.
        setSelected(null)
        await onRefresh?.()
      } else if (res.status === 404) {
        // Misma limpieza que la rama 200 (ruling R-T2): la fila 404 podía estar
        // antes de la seleccionada → índice obsoleto.
        setDeleteError('El proyecto ya no existe')
        setSelected(null)
        await onRefresh?.()
      } else if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { detail?: unknown } | null
        setDeleteError(typeof body?.detail === 'string' ? body.detail : 'Este proyecto no se puede eliminar')
      } else {
        setDeleteError('Error de conexión con el backend')
      }
    } catch {
      setDeleteError('Error de conexión con el backend')
    } finally {
      setDeletingId(null)
    }
  }

  const tabClasses = (active: boolean) =>
    `border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest transition-all duration-200 ${
      active
        ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan shadow-[0_0_12px_rgba(0,229,255,0.25)]'
        : 'border-ink-faint text-ink-dim hover:border-ink-dim hover:text-ink'
    }`

  return (
    <section className="relative flex min-h-[70vh] flex-col justify-center">
      <div className="relative max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
          PASO 1 · FUENTE
        </p>
        <h1 className="mt-4 bg-gradient-to-r from-neon-cyan to-neon-magenta bg-clip-text text-3xl font-extrabold leading-tight text-transparent sm:text-4xl">
          Elige la fuente de código
        </h1>

        {live ? (
          <>
            <div role="radiogroup" aria-label="Proyectos disponibles" className="mt-8 flex flex-col gap-2">
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  role="radio"
                  aria-checked={selected === i}
                  tabIndex={0}
                  onClick={() => setSelected(i)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected(i)
                    }
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-4 border px-4 py-3 text-left transition-all duration-200 ${
                    selected === i
                      ? 'border-neon-magenta bg-neon-magenta/5 shadow-[0_0_12px_rgba(255,45,149,0.2)]'
                      : 'border-ink-faint opacity-60 hover:opacity-100'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-ink">
                    <span className="text-neon-cyan">📁 {p.name}</span>
                    {p.kind && p.kind !== 'sample' && (
                      <span className="font-mono text-[10px] text-neon-cyan">
                        {p.kind === 'local' ? 'LOCAL' : 'GIT'}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-ink-dim">{p.path}</span>
                    <span className="font-mono text-xs text-ink-faint">{p.files} archivos</span>
                    {(p.kind === 'local' || p.kind === 'git') && (
                      <button
                        type="button"
                        aria-label={`Eliminar ${p.name}`}
                        disabled={deletingId !== null}
                        onClick={e => {
                          e.stopPropagation()
                          void deleteProject(p, i)
                        }}
                        className="rounded border border-ink-faint px-1.5 py-0.5 font-mono text-[10px] text-ink-faint transition-colors duration-200 hover:border-sev-critical hover:text-sev-critical disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deletingId === p.id ? '…' : '🗑 ELIMINAR'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {deleteError && (
              <p className="mt-2 font-mono text-xs text-sev-critical">{deleteError}</p>
            )}
            <div className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
                AUDITAR UN PROYECTO PROPIO
              </p>
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder={'C:\\proyectos\\miapp  o  /home/user/proj'}
                      aria-label="Ruta local del proyecto"
                      value={localPath}
                      onChange={e => setLocalPath(e.target.value)}
                      className="w-full border border-ink-faint bg-panel px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-neon-cyan focus:shadow-[0_0_12px_rgba(0,229,255,0.25)] focus:outline-none"
                    />
                    <NeonButton
                      variant="ghost"
                      disabled={localBusy || gitBusy}
                      onClick={() => setBrowseOpen(true)}
                    >
                      📂 NAVEGAR
                    </NeonButton>
                    <NeonButton
                      variant="outline"
                      disabled={!localPath.trim() || localBusy || gitBusy}
                      onClick={() => { void submitLocal() }}
                    >
                      AUDITAR RUTA
                    </NeonButton>
                  </div>
                  {localError && (
                    <p className="mt-2 font-mono text-xs text-sev-critical">{localError}</p>
                  )}
                </div>
                <div>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      placeholder="https://github.com/org/repo"
                      aria-label="URL del repositorio git"
                      value={gitRepoUrl}
                      onChange={e => setGitRepoUrl(e.target.value)}
                      className="w-full border border-ink-faint bg-panel px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-neon-cyan focus:shadow-[0_0_12px_rgba(0,229,255,0.25)] focus:outline-none"
                    />
                    <NeonButton
                      variant="outline"
                      disabled={!gitRepoUrl.trim() || localBusy || gitBusy}
                      onClick={() => { void submitGit() }}
                    >
                      {gitBusy ? 'CLONANDO…' : 'CLONAR Y AUDITAR'}
                    </NeonButton>
                  </div>
                  {gitError && (
                    <p className="mt-2 font-mono text-xs text-sev-critical">{gitError}</p>
                  )}
                </div>
              </div>
            </div>
            <BrowseModal
              open={browseOpen}
              onClose={() => setBrowseOpen(false)}
              onUse={p => {
                setLocalPath(p)
                setBrowseOpen(false)
                void submitLocal(p)
              }}
            />
          </>
        ) : (
          <>
            <div role="tablist" aria-label="Tipo de fuente" className="mt-8 flex gap-2">
              <button type="button" role="tab" aria-selected={tab === 'folder'} onClick={() => setTab('folder')} className={tabClasses(tab === 'folder')}>
                Carpeta local
              </button>
              <button type="button" role="tab" aria-selected={tab === 'git'} onClick={() => setTab('git')} className={tabClasses(tab === 'git')}>
                Repositorio git
              </button>
            </div>

            {tab === 'folder' ? (
              <>
                <div role="radiogroup" aria-label="Proyectos disponibles" className="mt-4 flex flex-col gap-2">
                  {MOCK_PROJECTS.map((p, i) => (
                    <button
                      key={p.name}
                      type="button"
                      role="radio"
                      aria-checked={selected === i}
                      onClick={() => setSelected(i)}
                      className={`flex items-center justify-between gap-4 border px-4 py-3 text-left transition-all duration-200 ${
                        selected === i
                          ? 'border-neon-magenta bg-neon-magenta/5 shadow-[0_0_12px_rgba(255,45,149,0.2)]'
                          : 'border-ink-faint opacity-60 hover:opacity-100'
                      }`}
                    >
                      <span className="text-sm font-bold text-ink">
                        <span className="text-neon-cyan">📁 {p.name}</span>
                      </span>
                      <span className="font-mono text-xs text-ink-dim">{p.path}</span>
                    </button>
                  ))}
                </div>
                <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                  <span className="h-px flex-1 bg-ink-faint/40" />
                  o bien
                  <span className="h-px flex-1 bg-ink-faint/40" />
                </div>
                <div>
                  <NeonButton variant="outline" onClick={() => folderInputRef.current?.click()}>
                    📂 SELECCIONAR CARPETA
                  </NeonButton>
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    webkitdirectory=""
                    className="hidden"
                    aria-label="Seleccionar carpeta local"
                    onChange={handleFolderChange}
                  />
                  {picked && (
                    <p className="mt-3 font-mono text-xs text-neon-cyan">
                      Carpeta seleccionada: {picked.name} ({picked.fileCount} archivos)
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4">
                <label htmlFor="git-url" className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-ink-dim">
                  URL del repositorio
                </label>
                <input
                  id="git-url"
                  type="url"
                  placeholder="https://github.com/org/repo"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  className="w-full border border-ink-faint bg-panel px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-neon-cyan focus:shadow-[0_0_12px_rgba(0,229,255,0.25)] focus:outline-none"
                />
                <p className="mt-2 text-xs text-ink-dim">
                  Acepta <span className="font-mono text-ink">https://…</span> o{' '}
                  <span className="font-mono text-ink">git@usuario:org/repo.git</span>.
                </p>
              </div>
            )}
          </>
        )}

        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan"
          >
            ← Volver
          </button>
          <NeonButton variant="primary" disabled={!canContinue} onClick={handleContinue}>
            CONTINUAR ▸
          </NeonButton>
        </div>
      </div>
    </section>
  )
}
