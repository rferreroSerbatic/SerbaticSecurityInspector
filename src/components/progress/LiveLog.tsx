import { OWASP_VULNS } from '../../data/owasp'
import type { LogLine, Severity } from '../../types'

const OWASP_IDS = new Set(OWASP_VULNS.map(v => v.id))

const SEVERITY_TAG_CLASS: Record<Severity, string> = {
  critical: 'text-sev-critical',
  high: 'text-sev-high',
  medium: 'text-sev-medium',
  low: 'text-sev-low',
}

export function LiveLog({ lines }: { lines: LogLine[] }) {
  return (
    <div
      data-testid="live-log"
      className="mt-6 max-h-48 overflow-y-auto border-t border-ink-dim/20 bg-black/40 px-4 py-3 font-mono text-xs leading-relaxed"
    >
      {lines.map(line => (
        <div key={line.id}>
          <span className="text-ink-faint">[{line.time}]</span>
          {OWASP_IDS.has(line.vulnId) && (
            <span
              className={`ml-2 font-bold ${
                line.severity ? SEVERITY_TAG_CLASS[line.severity] : 'text-neon-cyan'
              }`}
            >
              {line.vulnId}
            </span>
          )}
          <span className="ml-2 text-ink-dim">{line.message}</span>
        </div>
      ))}
    </div>
  )
}
