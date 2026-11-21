import type { ReactNode } from 'react'
import type { Step } from '../../types'
import { StepIndicator } from './StepIndicator'
import logoUrl from '../../../assets/serbatic-logo.png'

export function AppShell({
  step,
  onGoSource,
  onGoVulns,
  children,
}: {
  step: Step
  onGoSource: () => void
  onGoVulns: () => void
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-night text-ink">
      <div
        aria-hidden
        data-testid="ambient-glow"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 75% 15%, rgba(255,45,149,0.22), transparent 55%), radial-gradient(ellipse at 15% 85%, rgba(0,229,255,0.18), transparent 55%)',
        }}
      />
      <header className="relative z-10 flex items-center justify-between gap-4 px-6 py-4">
        <span className="flex items-center gap-3">
          <img src={logoUrl} alt="Serbatic" className="h-7" />
          <span className="text-sm font-extrabold tracking-[0.25em]">
            <span
              className="text-neon-cyan"
              style={{ textShadow: '0 0 10px rgba(0,229,255,0.8)' }}
            >
              SERBATIC
            </span>{' '}
            <span className="text-ink">SECURITY</span>{' '}
            <span
              className="text-neon-magenta"
              style={{ textShadow: '0 0 10px rgba(255,45,149,0.7)' }}
            >
              INSPECTOR
            </span>
          </span>
        </span>
        {step !== 'home' && (
          <StepIndicator step={step} onGoSource={onGoSource} onGoVulns={onGoVulns} />
        )}
      </header>
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
