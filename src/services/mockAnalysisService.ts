import type { AnalysisProgress, AnalysisService, LogLine, Severity } from '../types'
import { OWASP_VULNS } from '../data/owasp'
import { MOCK_FINDINGS } from '../data/mockFindings'

export interface MockOptions {
  agentMs?: number // duración base por agente (jitter ±30% por agente)
  tickMs?: number
}

const SEVERITY_ES: Record<Severity, string> = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
}

// Archivos plausibles que el agente «escanea», rotando en cada tick.
const SCAN_FILES = [
  'src/app.ts',
  'src/controllers/auth.ts',
  'api/models/user.py',
  'src/middleware/security.ts',
  'services/pagos/checkout.java',
]

// Meta fija del análisis mock (Fase 1).
const META = { files: 128, lines: 3412, durationMin: 14 }

// Counter global de ids de línea de log (únicos entre runs del mismo servicio).
let logSeq = 0

/** mm:ss transcurridos desde `start`. */
function timeSince(start: number): string {
  const s = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * Servicio de análisis mock: ejecuta los agentes de vulnerabilidad
 * estrictamente en secuencia (A01..A10), emite progreso por ticks,
 * hallazgos de MOCK_FINDINGS y un log en vivo. `cancel()` limpia el
 * temporizador pendiente y garantiza que no hay `onUpdate` posterior.
 */
export function createMockAnalysisService(opts: MockOptions = {}): AnalysisService {
  const agentMs = opts.agentMs ?? 5500
  const tickMs = opts.tickMs ?? 250

  return {
    run({ vulnIds }, onUpdate) {
      // Solo las elegidas, en orden canónico A01..A10.
      const chosen = OWASP_VULNS.filter(v => vulnIds.includes(v.id))
      const start = Date.now()
      let cancelled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      // Fuente única de verdad: un estado mutable que se emite
      // copiado (arrays y agentes) en cada cambio.
      const state: AnalysisProgress = {
        status: 'running',
        globalProgress: 0,
        agents: chosen.map(v => ({ vulnId: v.id, status: 'pending', progress: 0 })),
        logLines: [],
        findings: [],
      }

      const log = (vulnId: string, message: string, severity?: Severity) => {
        const line: LogLine = { id: `log-${++logSeq}`, time: timeSince(start), vulnId, message }
        if (severity) line.severity = severity
        state.logLines.push(line)
      }

      const emit = () => {
        onUpdate({
          ...state,
          agents: state.agents.map(a => ({ ...a })),
          logLines: [...state.logLines],
          findings: [...state.findings],
        })
      }

      log('global', `iniciando análisis de ${chosen.length} vulnerabilidad${chosen.length === 1 ? '' : 'es'}…`)
      emit() // estado inicial «running», de inmediato

      // Duración real por agente: agentMs con jitter ±30%.
      const agentMsPer = chosen.map(() => agentMs * (0.7 + 0.6 * Math.random()))
      const loggedCounts = chosen.map(() => 0)
      let activeIdx = 0
      let fileIdx = 0

      const tick = () => {
        if (cancelled) return
        timer = null
        if (activeIdx >= state.agents.length) return

        const agent = state.agents[activeIdx]
        if (agent.status === 'pending') agent.status = 'running'

        // Avance: llega a 100 en ~agentMs (paso medio = 100 / nº de ticks).
        const ms = agentMsPer[activeIdx]
        const paso = (100 / (ms / tickMs)) * (0.5 + Math.random())
        agent.progress = Math.min(100, agent.progress + paso)
        agent.currentFile = SCAN_FILES[fileIdx++ % SCAN_FILES.length]

        // Línea de log por hallazgo, espaciada por umbrales de progreso.
        const fs = MOCK_FINDINGS[agent.vulnId] ?? []
        const n = fs.length
        while (loggedCounts[activeIdx] < n && agent.progress >= (100 * (loggedCounts[activeIdx] + 1)) / (n + 1)) {
          const f = fs[loggedCounts[activeIdx]]
          log(agent.vulnId, `[${SEVERITY_ES[f.severity]}] ${f.file}:${f.line} — ${f.title}`, f.severity)
          loggedCounts[activeIdx]++
        }

        if (agent.progress >= 100) {
          // Agente completado en este tick.
          agent.progress = 100
          agent.status = 'done'
          agent.currentFile = undefined
          agent.findingsCount = n
          agent.criticalCount = fs.filter(f => f.severity === 'critical').length
          state.findings.push(...fs)
          const vuln = chosen[activeIdx]
          const cr = agent.criticalCount ?? 0
          log(
            agent.vulnId,
            `${vuln.id} · ${vuln.name} completado: ${n} hallazgo${n === 1 ? '' : 's'}` +
              (n > 0 ? ` (${cr} crítico${cr === 1 ? '' : 's'})` : ''),
          )
          activeIdx++
          if (activeIdx >= state.agents.length) {
            // Último agente: análisis terminado.
            state.status = 'done'
            state.globalProgress = 100
            state.meta = { ...META }
            emit()
            return // no quedan temporizadores
          }
        } else {
          // globalProgress = 100 × (Σ progress / 100 / totalAgentes) = media de los agentes.
          const sum = state.agents.reduce((acc, a) => acc + a.progress, 0)
          state.globalProgress = Math.round(sum / state.agents.length)
        }

        emit()
        timer = setTimeout(tick, tickMs)
      }

      if (state.agents.length === 0) {
        // Defensa: sin vulns elegidas no hay nada que hacer.
        state.status = 'done'
        state.globalProgress = 100
        state.meta = { ...META }
        emit()
      } else {
        timer = setTimeout(tick, tickMs)
      }

      const cancel = () => {
        cancelled = true
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      }
      return cancel
    },
  }
}
