export interface ProgressBarProps {
  value: number
  glow?: boolean
  className?: string
}

export function ProgressBar({ value, glow = false, className }: ProgressBarProps) {
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-ink-faint/15 ${className ?? ''}`}
    >
      <div
        data-testid="progress-fill"
        className={`h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-magenta ${
          glow ? 'shadow-[0_0_14px_rgba(255,45,149,0.35)]' : ''
        }`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
