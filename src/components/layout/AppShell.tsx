import type { ReactNode } from 'react'
import type { Step } from '../../types'
import { StepIndicator } from './StepIndicator'

export function AppShell({ step, children }: { step: Step; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-night text-ink">
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <span className="text-sm font-extrabold tracking-[0.25em]">
          <span
            className="text-neon-cyan"
            style={{ textShadow: '0 0 10px rgba(0,229,255,0.8)' }}
          >
            SERBATIC
          </span>{' '}
          <span
            className="text-neon-magenta"
            style={{ textShadow: '0 0 10px rgba(255,45,149,0.7)' }}
          >
            INSPECTOR
          </span>
        </span>
        {step !== 'home' && <StepIndicator step={step} />}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
