import { useMemo, useState } from 'react'
import { OWASP_VULNS } from '../../data/owasp'
import type { AnalysisProgress, Severity } from '../../types'
import { NeonButton } from '../ui/NeonButton'
import { FindingCard } from './FindingCard'

const VULN_BY_ID = new Map(OWASP_VULNS.map(v => [v.id, v]))

// Orden canónico de la barra: crítico → alto → medio → bajo.
const SEVERITY_ROWS: {
  severity: Severity
  color: string
  singular: string
  plural: string
}[] = [
  { severity: 'critical', color: 'bg-sev-critical', singular: 'CRÍTICO', plural: 'CRÍTICOS' },
  { severity: 'high', color: 'bg-sev-high', singular: 'ALTO', plural: 'ALTOS' },
  { severity: 'medium', color: 'bg-sev-medium', singular: 'MEDIO', plural: 'MEDIOS' },
  { severity: 'low', color: 'bg-sev-low', singular: 'BAJO', plural: 'BAJOS' },
]

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
type OrderMode = 'severity' | 'type'
const ORDER_OPTIONS: { value: OrderMode; label: string }[] = [
  { value: 'severity', label: 'CRITICIDAD' },
  { value: 'type', label: 'TIPO' },
]

// Separador de miles en formato español (3412 → «3.412»), determinista.
const esFormat = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function SummaryScreen({
  analysis,
  selectedFindingIds,
  onToggleFinding,
  onSetAllFindings,
  onGenerateScope,
  onNewAudit,
  onBack,
  demoBaseUrl,
  projectName,
}: {
  analysis: AnalysisProgress
  selectedFindingIds: string[]
  onToggleFinding: (id: string) => void
  onSetAllFindings: (ids: string[]) => void
  onGenerateScope: () => void
  onNewAudit: () => void
  onBack: () => void
  /** Base de la web de ejemplo ejecutable (solo proyectos de ejemplo con demo). */
  demoBaseUrl?: string
  /** Nombre del proyecto analizado (cabecera del informe PDF). */
  projectName?: string
}) {
  const { agents, findings, meta } = analysis

  const [order, setOrder] = useState<OrderMode>('severity')

  // Orden del listado (estable: igual criterio conserva el orden de llegada del motor).
  const ordered = useMemo(() => {
    const arr = [...findings]
    if (order === 'severity') {
      arr.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    } else {
      arr.sort((a, b) =>
        a.vulnId === b.vulnId
          ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
          : a.vulnId < b.vulnId
            ? -1
            : 1,
      )
    }
    return arr
  }, [findings, order])

  const total = findings.length
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) counts[f.severity] += 1

  // El primer hallazgo crítico queda expandido por defecto (o el primero,
  // si no hay críticos); el resto del estado de expansión es local.
  const defaultExpanded = findings.find(f => f.severity === 'critical') ?? findings[0]
  const [expandedIds, setExpandedIds] = useState<string[]>(
    defaultExpanded ? [defaultExpanded.id] : [],
  )
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  // Informe PDF completo: el backend (Task 6) genera el documento y el front
  // lo descarga (mismo patrón de blob que el PDF del alcance en ScopeModal).
  const downloadReport = async () => {
    setReportBusy(true)
    setReportError(null)
    try {
      const res = await fetch('/api/reports/full-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName ?? 'Proyecto',
          profile: analysis.profile ?? {},
          meta: analysis.meta ?? {},
          findings,
        }),
      })
      if (!res.ok) throw new Error('bad status')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `informe-${(projectName ?? 'proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setReportError('No se pudo generar el informe (¿backend caído?)')
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <section className="relative flex min-h-[70vh] flex-col justify-center">
      <div className="relative w-full max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
          PASO 4 · INFORME
        </p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="bg-gradient-to-r from-neon-cyan to-neon-magenta bg-clip-text text-3xl font-extrabold leading-tight text-transparent sm:text-4xl">
            Análisis completado
          </h1>
          {meta && (
            <p className="font-mono text-xs text-ink-dim">
              {agents.length} {agents.length === 1 ? 'agente' : 'agentes'} ·{' '}
              {esFormat(meta.files)} archivos · {esFormat(meta.lines)} líneas ·{' '}
              {meta.durationMin} min
              {meta.model &&
                ` · ${meta.model}${typeof meta.avgTps === 'number' && meta.avgTps > 0 ? ` · ${meta.avgTps} tk/s` : ''}`}
            </p>
          )}
        </div>

        <div className="mt-8">
          <div className="flex h-2 overflow-hidden rounded-full bg-ink-faint/15">
            {SEVERITY_ROWS.filter(r => counts[r.severity] > 0).map(r => (
              <div
                key={r.severity}
                data-testid="sev-segment"
                className={
                  r.severity === 'critical'
                    ? `${r.color} shadow-[0_0_8px_rgba(255,45,149,0.6)]`
                    : r.color
                }
                style={{ width: `${(counts[r.severity] / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {SEVERITY_ROWS.map(r => (
              <span
                key={r.severity}
                className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-ink-dim"
              >
                <span aria-hidden className={`h-2 w-2 ${r.color}`} />
                <span>
                  {counts[r.severity]}{' '}
                  {counts[r.severity] === 1 ? r.singular : r.plural}
                </span>
              </span>
            ))}
          </div>
        </div>

        {total > 0 && (
          <div className="mb-3 flex items-center gap-2" role="group" aria-label="Orden de los hallazgos">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">ORDEN</span>
            {ORDER_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                aria-pressed={order === o.value}
                onClick={() => setOrder(o.value)}
                className={`border px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest transition-all duration-200 ${
                  order === o.value
                    ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan shadow-[0_0_12px_rgba(0,229,255,0.25)]'
                    : 'border-ink-faint text-ink-faint hover:border-ink-dim hover:text-ink-dim'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {total === 0 ? (
            <p className="rounded-md border border-dashed border-ink-faint px-4 py-8 text-center text-sm text-ink-dim">
              Sin hallazgos para las vulnerabilidades seleccionadas.
            </p>
          ) : (
            ordered.map(f => {
              const vuln = VULN_BY_ID.get(f.vulnId)
              return vuln ? (
                <FindingCard
                  key={f.id}
                  finding={f}
                  vuln={vuln}
                  selected={selectedFindingIds.includes(f.id)}
                  expanded={expandedIds.includes(f.id)}
                  onToggleSelect={() => onToggleFinding(f.id)}
                  onToggleExpand={() => toggleExpand(f.id)}
                  demoHref={demoBaseUrl ? `${demoBaseUrl}#${f.vulnId}` : undefined}
                />
              ) : null
            })
          )}
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink-dim/20 pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">
              {selectedFindingIds.length} DE {total} HALLAZGOS MARCADOS PARA EL ALCANCE
            </p>
            {(() => {
              const allMarked = total > 0 && findings.every(f => selectedFindingIds.includes(f.id))
              return (
                <button
                  type="button"
                  onClick={() => onSetAllFindings(allMarked ? [] : findings.map(f => f.id))}
                  disabled={total === 0}
                  className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {allMarked ? 'DESMARCAR TODOS' : 'MARCAR TODOS'}
                </button>
              )
            })()}
            <button
              type="button"
              onClick={onBack}
              className="font-mono text-xs uppercase tracking-widest text-ink-dim transition-colors duration-200 hover:text-neon-cyan"
            >
              ← Volver
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NeonButton variant="ghost" onClick={onNewAudit}>
              NUEVA AUDITORÍA
            </NeonButton>
            <NeonButton variant="ghost" onClick={downloadReport} disabled={total === 0 || reportBusy}>
              {reportBusy ? 'GENERANDO…' : 'INFORME PDF ▸'}
            </NeonButton>
            <NeonButton onClick={onGenerateScope} disabled={selectedFindingIds.length === 0}>
              GENERAR ALCANCE DE MEJORA ▸
            </NeonButton>
          </div>
        </footer>
        {reportError && (
          <p role="alert" className="mt-3 text-right font-mono text-xs font-bold tracking-wide text-neon-magenta">
            {reportError}
          </p>
        )}
      </div>
    </section>
  )
}
