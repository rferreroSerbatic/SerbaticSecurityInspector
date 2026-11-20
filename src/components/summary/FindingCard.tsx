import type { Finding, Severity, Vuln } from '../../types'
import { SeverityBadge } from '../ui/SeverityBadge'

const CARD_STYLES: Record<Severity, string> = {
  critical: 'border-sev-critical/60 bg-sev-critical/5 shadow-[0_0_14px_rgba(255,45,149,0.18)]',
  high: 'border-sev-high/45 bg-sev-high/5',
  medium: 'border-sev-medium/40 bg-sev-medium/5',
  low: 'border-sev-low/35 bg-sev-low/5',
}

export function FindingCard({
  finding,
  vuln,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
}: {
  finding: Finding
  vuln: Vuln
  selected: boolean
  expanded: boolean
  onToggleSelect: () => void
  onToggleExpand: () => void
}) {
  return (
    <article data-testid="finding-card" className={`rounded-md border ${CARD_STYLES[finding.severity]}`}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <label className="flex shrink-0 cursor-pointer items-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neon-cyan">
          <input
            type="checkbox"
            aria-label={`${finding.id} ${finding.title}`}
            checked={selected}
            onChange={onToggleSelect}
            className="sr-only"
          />
          <span
            aria-hidden
            className={`flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold ${
              selected
                ? 'bg-gradient-to-r from-neon-cyan to-neon-magenta text-night'
                : 'border border-ink-faint'
            }`}
          >
            {selected ? '✓' : ''}
          </span>
        </label>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`Ver detalle de ${finding.id}`}
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <SeverityBadge severity={finding.severity} />
          <span className="shrink-0 font-mono text-[11px] font-bold tracking-wider text-neon-cyan">
            {vuln.id} · {vuln.name.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
            {finding.title}
          </span>
          {!expanded && (
            <span className="shrink-0 font-mono text-xs text-ink-dim">
              {finding.file}:{finding.line}
            </span>
          )}
          <span aria-hidden className="shrink-0 text-xs text-ink-faint">
            {expanded ? '▾' : '▸'}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-ink-faint/20 px-3.5 pb-3.5 pt-3">
          <pre className="overflow-x-auto rounded border border-ink-dim/20 bg-black/50 p-2.5 font-mono text-xs leading-relaxed text-ink-dim">
            <code>
              <span className="block text-ink-faint">
                📍 {finding.file}:{finding.line}
              </span>
              {finding.snippet}
            </code>
          </pre>
          <div className="flex flex-col gap-1.5 text-xs leading-relaxed text-ink-dim">
            <p>
              <span className="font-bold text-neon-cyan">EXPLOIT ·</span> {finding.exploit}
            </p>
            <p>
              <span className="font-bold text-sev-high">CONSECUENCIAS ·</span>{' '}
              {finding.consequences}
            </p>
            <p>
              <span className="font-bold text-neon-cyan">SOLUCIÓN ·</span> {finding.solution}
            </p>
          </div>
        </div>
      )}
    </article>
  )
}
