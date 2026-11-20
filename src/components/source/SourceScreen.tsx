import { useRef, useState } from 'react'
import { NeonButton } from '../ui/NeonButton'
import type { ChangeEvent } from 'react'
import type { Source } from '../../types'

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
}: {
  onBack: () => void
  onContinue: (s: Source) => void
}) {
  const [tab, setTab] = useState<'folder' | 'git'>('folder')
  const [selected, setSelected] = useState<number | null>(null)
  const [gitUrl, setGitUrl] = useState('')
  const [picked, setPicked] = useState<{ name: string; fileCount: number } | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const canContinue = tab === 'folder' ? selected !== null || picked !== null : isValidGitUrl(gitUrl)

  const handleContinue = () => {
    if (tab === 'folder' && picked !== null) {
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
