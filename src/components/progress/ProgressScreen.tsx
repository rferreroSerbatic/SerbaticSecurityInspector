import { OWASP_VULNS } from '../../data/owasp'
import type { AnalysisProgress } from '../../types'
import { ProgressBar } from '../ui/ProgressBar'
import { AgentRow } from './AgentRow'
import { LiveLog } from './LiveLog'

const VULN_BY_ID = new Map(OWASP_VULNS.map(v => [v.id, v]))

export function ProgressScreen({
  analysis,
  onBack,
}: {
  analysis: AnalysisProgress
  onBack: () => void
}) {
  return (
    <section className="relative flex min-h-[70vh] flex-col justify-center">
      <div className="relative max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
          PASO 3 · ANÁLISIS
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="bg-gradient-to-r from-neon-cyan to-neon-magenta bg-clip-text text-3xl font-extrabold leading-tight text-transparent sm:text-4xl">
            Análisis en curso
          </h1>
          <span className="shrink-0 rounded-full border border-sev-medium/45 bg-sev-medium/10 px-3 py-1 font-mono text-[11px] tracking-wide text-sev-medium">
            ⚠ El análisis puede tardar varios minutos
          </span>
        </div>

        {analysis.status === 'error' && (
          <div className="mt-6 border border-neon-magenta/60 bg-neon-magenta/10 px-4 py-3 shadow-[0_0_12px_rgba(255,45,149,0.25)]">
            <p className="text-sm text-ink">⚠ {analysis.error}</p>
          </div>
        )}

        <div className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">
              PROGRESO GLOBAL
            </span>
            <span className="bg-gradient-to-r from-neon-cyan to-neon-magenta bg-clip-text text-3xl font-extrabold text-transparent">
              {analysis.globalProgress}%
            </span>
          </div>
          <ProgressBar value={analysis.globalProgress} glow />
        </div>

        <div className="mt-8 flex flex-col gap-1.5">
          {analysis.agents.map(agent => {
            const vuln = VULN_BY_ID.get(agent.vulnId)
            return vuln ? <AgentRow key={agent.vulnId} agent={agent} vuln={vuln} /> : null
          })}
        </div>

        <LiveLog lines={analysis.logLines} />

        <div className="mt-8">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan"
          >
            ← Volver
          </button>
        </div>
      </div>
    </section>
  )
}
