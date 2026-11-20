import type { AgentProgress, Vuln } from '../../types'
import { ProgressBar } from '../ui/ProgressBar'

const badge =
  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold'

export function AgentRow({ agent, vuln }: { agent: AgentProgress; vuln: Vuln }) {
  if (agent.status === 'done') {
    const n = agent.findingsCount ?? 0
    const c = agent.criticalCount ?? 0
    return (
      <div
        data-testid="agent-row"
        className="flex items-center gap-3 rounded border border-neon-cyan/35 bg-neon-cyan/5 px-4 py-2.5"
      >
        <span aria-hidden className={`${badge} border-neon-cyan/60 bg-neon-cyan/15 text-neon-cyan`}>
          ✓
        </span>
        <span className="min-w-[11rem] text-sm font-bold">
          <span className="text-neon-cyan">{vuln.id}</span>
          <span className="ml-2">{vuln.name}</span>
        </span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-neon-cyan">
          COMPLETADO
        </span>
        <span className="ml-auto font-mono text-xs text-ink-dim">
          {n} hallazgo{n === 1 ? '' : 's'}
          {c > 0 && (
            <span className="font-bold text-neon-magenta">
              {' · '}
              {c} crítico{c === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </div>
    )
  }

  if (agent.status === 'running') {
    return (
      <div
        data-testid="agent-row"
        className="rounded border border-neon-magenta bg-neon-magenta/5 px-4 py-2.5 shadow-[0_0_14px_rgba(255,45,149,0.25)]"
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className={`${badge} border-neon-magenta text-neon-magenta`}>
            ▶
          </span>
          <span className="min-w-[11rem] text-sm font-bold">
            <span className="text-neon-magenta [text-shadow:0_0_8px_rgba(255,45,149,0.7)]">
              {vuln.id}
            </span>
            <span className="ml-2">{vuln.name}</span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-neon-magenta">
            EN CURSO
          </span>
          {agent.currentFile && (
            <span className="ml-auto font-mono text-xs text-ink-dim">{agent.currentFile}</span>
          )}
        </div>
        <div className="mt-2">
          <ProgressBar value={agent.progress} glow />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="agent-row"
      className="flex items-center gap-3 rounded border border-ink-dim/20 px-4 py-2.5 opacity-50"
    >
      <span aria-hidden className={`${badge} border-ink-faint`} />
      <span className="min-w-[11rem] text-sm font-bold text-ink-dim">
        <span className="text-ink-faint">{vuln.id}</span>
        <span className="ml-2">{vuln.name}</span>
      </span>
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        EN ESPERA
      </span>
    </div>
  )
}
