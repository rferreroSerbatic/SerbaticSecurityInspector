import type { Severity } from '../../types'

const SEVERITY_STYLES: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'CRÍTICO', color: '#ff2d95' },
  high: { label: 'ALTO', color: '#ff9f43' },
  medium: { label: 'MEDIO', color: '#ffd23f' },
  low: { label: 'BAJO', color: '#00e5ff' },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, color } = SEVERITY_STYLES[severity]
  return (
    <span
      className="inline-block rounded px-2.5 py-1 font-mono text-xs font-extrabold uppercase tracking-wider text-night"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}
