import type { Vuln } from '../../types'

export function VulnRow({
  vuln,
  selected,
  onToggle,
}: {
  vuln: Vuln
  selected: boolean
  onToggle: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border-b border-l-2 border-b-ink-dim/10 px-4 py-2.5 transition-all duration-200 ${
        selected
          ? 'border-l-neon-magenta bg-neon-magenta/5'
          : 'border-l-transparent opacity-60 hover:opacity-100'
      }`}
    >
      <input
        type="checkbox"
        aria-label={`${vuln.id} ${vuln.name}`}
        checked={selected}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold ${
          selected
            ? 'bg-gradient-to-r from-neon-cyan to-neon-magenta text-night'
            : 'border border-ink-faint'
        }`}
      >
        {selected ? '✓' : ''}
      </span>
      <span aria-hidden className="text-base leading-none">
        {vuln.icon}
      </span>
      <span
        className={`min-w-[11rem] text-sm font-bold ${selected ? 'text-ink' : 'text-ink-faint'}`}
      >
        <span className={selected ? 'text-neon-cyan' : undefined}>{vuln.id}</span>
        <span className="ml-2">{vuln.name}</span>
      </span>
      <span className={`flex-1 text-xs ${selected ? 'text-ink-dim' : 'text-ink-faint'}`}>
        {vuln.description}
      </span>
    </label>
  )
}
