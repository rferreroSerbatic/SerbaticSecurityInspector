import { Fragment } from 'react'
import type { Step } from '../../types'

const STEPS: { key: Exclude<Step, 'home'>; label: string }[] = [
  { key: 'source', label: '1 FUENTE' },
  { key: 'vulns', label: '2 VULNERABILIDADES' },
  { key: 'progress', label: '3 ANÁLISIS' },
  { key: 'summary', label: '4 INFORME' },
]

export function StepIndicator({
  step,
  onGoSource,
  onGoVulns,
}: {
  step: Step
  onGoSource: () => void
  onGoVulns: () => void
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === step)
  return (
    <nav
      aria-label="Pasos de la auditoría"
      className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink-faint"
    >
      {STEPS.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && (
            <span aria-hidden="true">·</span>
          )}
          {i < currentIndex ? (
            <button
              type="button"
              aria-label={`Volver a ${s.label}`}
              onClick={s.key === 'source' ? onGoSource : onGoVulns}
              className="transition-colors duration-200 hover:text-neon-cyan"
            >
              {`${s.label} ✓`}
            </button>
          ) : (
            <span className={i === currentIndex ? 'text-neon-magenta' : undefined}>
              {s.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
