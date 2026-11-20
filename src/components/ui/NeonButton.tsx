import type { ButtonHTMLAttributes } from 'react'

export interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost'
}

const variantClasses: Record<NonNullable<NeonButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-r from-neon-cyan to-neon-magenta font-bold text-night shadow-[0_0_18px_rgba(255,45,149,0.4)] hover:shadow-[0_0_26px_rgba(255,45,149,0.55)]',
  outline: 'border border-neon-magenta font-bold text-neon-magenta hover:bg-neon-magenta/10',
  ghost:
    'border border-ink-faint font-semibold text-ink-faint hover:border-ink-dim hover:text-ink-dim',
}

export function NeonButton({
  variant = 'primary',
  className,
  ...rest
}: NeonButtonProps) {
  return (
    <button
      className={`rounded-md px-5 py-2.5 font-mono text-sm uppercase tracking-widest transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className ?? ''}`}
      {...rest}
    />
  )
}
