import { useEffect, useRef, useState } from 'react'
import { OWASP_VULNS } from '../../data/owasp'
import type { Finding, Severity } from '../../types'
import { Modal } from '../ui/Modal'
import { NeonButton } from '../ui/NeonButton'
import { buildScopeText } from './scopeText'

// Toast: se auto-oculta a los 3 s (estado de feedback, no de datos).
const TOAST_MS = 3000

const VULN_BY_ID = new Map(OWASP_VULNS.map(v => [v.id, v]))

// Mismo orden de severidad que scopeText (critical > high > medium > low):
// cada tag de la cabecera usa el color de su hallazgo más severo.
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-sev-critical',
  high: 'text-sev-high',
  medium: 'text-sev-medium',
  low: 'text-sev-low',
}

// 'YYYY-MM-DD' de hoy, para la fecha del texto del alcance.
const todayISO = () => new Date().toISOString().slice(0, 10)

// Palabras según el brief: separar por espacios y descartar los vacíos.
const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

export function ScopeModal({
  open,
  projectName,
  findings,
  onClose,
}: {
  open: boolean
  projectName: string
  findings: Finding[]
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // El texto se siembra una vez por apertura: cuando `open` pasa a true se
  // pre-rellena con el alcance de los hallazgos marcados. Después es un
  // textarea normal, editable a voluntad.
  useEffect(() => {
    if (!open) return
    setText(buildScopeText(findings, OWASP_VULNS, projectName, todayISO()))
    // `findings`/`projectName` no van en el deps a propósito: la resiembra
    // solo ocurre al abrir (decisión fijada en el brief).
  }, [open])

  // Si el modal se desmonta con un toast pendiente, no se filtra el timer.
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    },
    [],
  )

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  const copyText = () => {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      showToast('No se pudo copiar: selecciona el texto y cópialo a mano')
      return
    }
    // writeText rechaza (permiso denegado) → mismo fallback, sin excepción.
    Promise.resolve(clipboard.writeText(text))
      .then(() => showToast('Texto copiado al portapapeles'))
      .catch(() => showToast('No se pudo copiar: selecciona el texto y cópialo a mano'))
  }

  // Vulnerabilidades de los hallazgos marcados: sin duplicados, orden
  // canónico A01..A10 (como en el texto del alcance).
  const vulnTags = [...new Set(findings.map(f => f.vulnId))]
    .sort()
    .map(vulnId => {
      const group = findings.filter(f => f.vulnId === vulnId)
      const severity = group.reduce<Severity>(
        (worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
        group[0].severity,
      )
      const vuln = VULN_BY_ID.get(vulnId)
      return { vulnId, name: vuln ? vuln.name.toUpperCase() : vulnId, severity }
    })

  const words = countWords(text)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          <span className="block">ALCANCE TÉCNICO DE MEJORA</span>
          <span className="mt-1 block font-mono text-[11px] font-normal tracking-wide text-ink-dim">
            Basado en {findings.length} hallazgos marcados:
            {vulnTags.map((tag, i) => (
              <span key={tag.vulnId}>
                {i > 0 ? ' · ' : ' '}
                <span className={`font-bold ${SEVERITY_TEXT[tag.severity]}`}>
                  {tag.vulnId} {tag.name}
                </span>
              </span>
            ))}
          </span>
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[11px] tracking-wide text-ink-faint">
            ≈ {words} palabras
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <NeonButton variant="ghost" onClick={onClose}>
              CANCELAR
            </NeonButton>
            <NeonButton variant="outline" onClick={copyText}>
              COPIAR TEXTO
            </NeonButton>
            {/* Fase 1: stub. Solo el toast de confirmación, sin descargar nada. */}
            <NeonButton onClick={() => showToast('PDF generado (demo)')} disabled={words === 0}>
              GENERAR PDF ▸
            </NeonButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[11px] tracking-wide text-neon-cyan">
          ✎ TEXTO EDITABLE — ajústalo antes de generar el PDF
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          aria-label="Texto del alcance"
          className="h-64 w-full resize-none overflow-y-auto rounded-md border border-neon-cyan/40 bg-neon-cyan/5 p-4 font-mono text-sm leading-relaxed text-ink focus:border-neon-cyan focus:outline-none"
        />
        {toast !== null && (
          <p
            role="status"
            className="rounded-md border border-neon-magenta/60 bg-neon-magenta/10 px-3 py-2 font-mono text-xs font-bold tracking-wide text-neon-magenta shadow-[0_0_14px_rgba(255,45,149,0.35)]"
          >
            {toast}
          </p>
        )}
      </div>
    </Modal>
  )
}
