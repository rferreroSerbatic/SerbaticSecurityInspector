import type { AnalysisProgress, AnalysisService, Finding, LogLine, Severity } from '../types'
import { OWASP_VULNS } from '../data/owasp'

export interface LiveOptions {
  tickMs?: number
}

/** mm:ss a partir de `t` segundos (mismo formato que el mock). */
function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** Evento SSE del backend: `{ type, t, ... }` (contrato de la Task 5). */
interface SseEvent {
  type: string
  t: number
  vulnId?: string
  severity?: Severity
  message?: string
  findingsCount?: number
  criticalCount?: number
  findings?: Finding[]
  meta?: { files: number; lines: number; durationMin: number }
}

// Counter global de ids de línea de log (únicos entre runs del mismo servicio).
let logSeq = 0

/**
 * Servicio de análisis «live»: `POST /api/analyze` para lanzar el run y
 * `EventSource` sobre `/api/runs/{id}/events` para seguirlo en vivo. Los
 * eventos reales mandan para log/hallazgos/estado; entre eventos se
 * interpola el progreso de cada agente «running» (cosmético, techo 90)
 * hasta su `agent:done`. `cancel()` limpia el stream y el intervalo y
 * garantiza que no hay `onUpdate` posterior.
 */
export function createLiveAnalysisService(opts: LiveOptions = {}): AnalysisService {
  const tickMs = opts.tickMs ?? 250

  return {
    run({ source, vulnIds }, onUpdate) {
      // Solo las elegidas, en orden canónico A01..A10.
      const chosen = OWASP_VULNS.filter(v => vulnIds.includes(v.id))

      let cancelled = false
      let terminal = false
      let runId: string | null = null
      let es: EventSource | null = null
      let interval: ReturnType<typeof setInterval> | null = null

      // Fuente única de verdad: un estado mutable que se emite
      // copiado (arrays y agentes) en cada cambio.
      const state: AnalysisProgress = {
        status: 'running',
        globalProgress: 0,
        agents: chosen.map(v => ({ vulnId: v.id, status: 'pending' as const, progress: 0 })),
        logLines: [],
        findings: [],
      }

      const emit = () => {
        if (cancelled) return
        onUpdate({
          ...state,
          agents: state.agents.map(a => ({ ...a })),
          logLines: [...state.logLines],
          findings: [...state.findings],
        })
      }

      const stopTick = () => {
        if (interval !== null) {
          clearInterval(interval)
          interval = null
        }
      }

      // Interpolación: cada tick, cada agente «running» avanza asintóticamente
      // hacia 90; globalProgress = media de los agentes.
      const startTick = () => {
        if (interval !== null) return
        interval = setInterval(() => {
          if (cancelled || terminal) return
          const running = state.agents.filter(a => a.status === 'running')
          if (running.length === 0) return
          for (const a of running) {
            a.progress = Math.min(90, a.progress + (90 - a.progress) * 0.03)
          }
          state.globalProgress = Math.round(state.agents.reduce((acc, a) => acc + a.progress, 0) / state.agents.length)
          emit()
        }, tickMs)
      }

      // Fallo no terminal → estado «error» (única emisión) y limpieza.
      const fail = (error: string) => {
        if (cancelled || terminal) return
        terminal = true
        state.status = 'error'
        state.error = error
        stopTick()
        es?.close()
        emit()
      }

      const onMessage = (e: { data: string }) => {
        if (cancelled || terminal) return
        const ev = JSON.parse(e.data) as SseEvent
        switch (ev.type) {
          case 'run:start':
            // Sin cambio extra: el estado ya está «running».
            break
          case 'profile:done':
            // Se ignora en el front (el log del perfil llega como evento 'log').
            break
          case 'agent:start': {
            const a = state.agents.find(x => x.vulnId === ev.vulnId)
            if (a && a.status === 'pending') {
              a.status = 'running'
              startTick()
              emit()
            }
            break
          }
          case 'log': {
            logSeq++
            const line: LogLine = {
              id: `log-${logSeq}`,
              time: fmt(ev.t),
              vulnId: ev.vulnId ?? 'global',
              message: ev.message ?? '',
            }
            if (ev.severity) line.severity = ev.severity
            state.logLines.push(line)
            emit()
            break
          }
          case 'agent:done': {
            const a = state.agents.find(x => x.vulnId === ev.vulnId)
            if (a) {
              a.status = 'done'
              a.progress = 100
              a.currentFile = undefined
              a.findingsCount = ev.findingsCount ?? 0
              a.criticalCount = ev.criticalCount ?? 0
            }
            emit()
            break
          }
          case 'run:done': {
            terminal = true
            state.status = 'done'
            state.globalProgress = 100
            state.findings = ev.findings ?? []
            state.meta = ev.meta
            stopTick()
            es?.close()
            emit()
            break
          }
          case 'run:error':
            fail(ev.message ?? 'Error de conexión con el backend')
            break
          case 'run:cancelled':
            // Sin cambio de estado (la UI ya ha navegado).
            terminal = true
            stopTick()
            es?.close()
            break
        }
      }

      fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: source.value, vulnIds }),
      })
        .then(async res => {
          if (cancelled) return
          if (!res.ok) {
            // Error de arranque: única emisión, ya en «error».
            terminal = true
            state.status = 'error'
            state.error = res.status === 409 ? 'Ya hay un análisis en curso' : 'Error ' + res.status
            state.globalProgress = 0
            state.agents = []
            state.logLines = []
            state.findings = []
            emit()
            return
          }
          const data = (await res.json()) as { runId: string }
          if (cancelled) return
          runId = data.runId
          emit() // estado inicial «running», de inmediato
          es = new EventSource('/api/runs/' + runId + '/events')
          es.onmessage = (e: MessageEvent) => onMessage(e)
          es.onerror = () => fail('Error de conexión con el backend')
        })
        .catch(() => {
          fail('Error de conexión con el backend')
        })

      const cancel = () => {
        if (cancelled) return
        cancelled = true
        if (runId !== null) {
          // Ignorar su resultado y errores (el run puede ya haber terminado).
          void fetch('/api/runs/' + runId + '/cancel', { method: 'POST' }).catch(() => undefined)
        }
        stopTick()
        es?.close()
      }
      return cancel
    },
  }
}
