import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { OWASP_VULNS } from '../../data/owasp'
import type { AnalysisProgress, LogLine } from '../../types'
import { ProgressScreen } from './ProgressScreen'

afterEach(cleanup)

// AnalysisProgress fabricado (pinned por el brief de la Task 11):
// 2 done (A01: 3 hallazgos / 1 crítico, A02: 1 hallazgo), 1 running (A03 al 62%
// con currentFile 'api/users.py'), 1 pending (A06); globalProgress 45; 3 logLines
// (una de ellas de sistema con vulnId 'global').
const base: AnalysisProgress = {
  status: 'running',
  globalProgress: 45,
  agents: [
    { vulnId: 'A01', status: 'done', progress: 100, findingsCount: 3, criticalCount: 1 },
    { vulnId: 'A02', status: 'done', progress: 100, findingsCount: 1, criticalCount: 0 },
    { vulnId: 'A03', status: 'running', progress: 62, currentFile: 'api/users.py' },
    { vulnId: 'A06', status: 'pending', progress: 0 },
  ],
  logLines: [
    {
      id: 'log-1',
      time: '00:12',
      vulnId: 'A01',
      severity: 'critical',
      message: 'app/controllers/admin.py:42 — endpoint sin verificación de rol',
    },
    {
      id: 'log-2',
      time: '01:04',
      vulnId: 'A02',
      severity: 'medium',
      message: '.env — secretos en texto plano',
    },
    { id: 'log-3', time: '01:31', vulnId: 'global', message: 'iniciando análisis de 4 vulnerabilidades…' },
  ],
  findings: [],
}

test('renderiza cada agente con su estado y sus contadores', () => {
  render(<ProgressScreen analysis={base} />)

  const [rowA01, rowA02, rowA03, rowA06] = screen.getAllByTestId('agent-row')

  // done: ✓, «COMPLETADO» y contadores de hallazgos/críticos
  expect(within(rowA01).getByText('COMPLETADO')).toBeInTheDocument()
  expect(within(rowA01).getByText(/3 hallazgos/)).toBeInTheDocument()
  expect(within(rowA01).getByText(/1 crítico/)).toBeInTheDocument()
  expect(within(rowA02).getByText('COMPLETADO')).toBeInTheDocument()
  expect(within(rowA02).getByText(/1 hallazgo/)).toBeInTheDocument()
  expect(within(rowA02).queryByText(/crítico/i)).not.toBeInTheDocument()

  // running: «EN CURSO», mini-progress en 62% y currentFile en mono
  expect(within(rowA03).getByText('EN CURSO')).toBeInTheDocument()
  expect(within(rowA03).getByText('api/users.py')).toBeInTheDocument()
  expect(within(rowA03).getByTestId('progress-fill')).toHaveStyle({ width: '62%' })

  // pending: «EN ESPERA», sin contadores ni barra
  expect(within(rowA06).getByText('EN ESPERA')).toBeInTheDocument()
  expect(within(rowA06).queryByTestId('progress-fill')).not.toBeInTheDocument()
})

test('renderiza el progreso global 45%', () => {
  render(<ProgressScreen analysis={base} />)

  expect(screen.getByText('Análisis en curso')).toBeInTheDocument()
  expect(screen.getByText('⚠ El análisis puede tardar varios minutos')).toBeInTheDocument()
  expect(screen.getByText('PROGRESO GLOBAL')).toBeInTheDocument()
  expect(screen.getByText('45%')).toBeInTheDocument()

  const fills = screen.getAllByTestId('progress-fill')
  expect(fills.some(f => f.style.width === '45%')).toBe(true)
})

test('renderiza las líneas del log en orden', () => {
  render(<ProgressScreen analysis={base} />)

  const log = screen.getByTestId('live-log')
  expect(log).toBeInTheDocument()

  const stamps = screen.getAllByText(/\[\d{2}:\d{2}\]/)
  expect(stamps.map(t => t.textContent)).toEqual(['[00:12]', '[01:04]', '[01:31]'])

  // tag de vuln presente en líneas de agente, no en la línea de sistema
  expect(within(log).getByText('A01')).toBeInTheDocument()
  expect(within(log).getByText('A02')).toBeInTheDocument()
  expect(screen.getByText('iniciando análisis de 4 vulnerabilidades…')).toBeInTheDocument()
  // la línea de sistema no debe renderizar su vulnId 'global' como tag
  expect(screen.queryByText('global')).not.toBeInTheDocument()
})

test('mantiene el log auto-scrollado en la última línea al añadir líneas', () => {
  const { rerender } = render(<ProgressScreen analysis={base} />)
  const log = screen.getByTestId('live-log')

  // jsdom no hace layout (scrollHeight = 0): se simula una consola desbordada.
  Object.defineProperty(log, 'scrollHeight', { value: 500, configurable: true })

  const extra: LogLine = {
    id: 'log-4',
    time: '02:00',
    vulnId: 'A03',
    message: 'siguiente línea del log',
  }
  rerender(<ProgressScreen analysis={{ ...base, logLines: [...base.logLines, extra] }} />)

  // el contenedor no cambia y el viewport queda al final
  expect(screen.getByTestId('live-log')).toBe(log)
  expect(log.scrollTop).toBe(500)
})

test('con 10 agentes la lista renderiza los 10 en orden A01..A10 (ejecución completa)', () => {
  const full: AnalysisProgress = {
    status: 'done',
    globalProgress: 100,
    agents: OWASP_VULNS.map(v => ({
      vulnId: v.id,
      status: 'done' as const,
      progress: 100,
      findingsCount: 0,
      criticalCount: 0,
    })),
    logLines: [],
    findings: [],
    meta: { files: 128, lines: 3412, durationMin: 14 },
  }
  render(<ProgressScreen analysis={full} />)

  const rows = screen.getAllByTestId('agent-row')
  expect(rows).toHaveLength(10)
  const ids = rows.map(r => within(r).getByText(/A\d{2}/).textContent)
  expect(ids).toEqual(OWASP_VULNS.map(v => v.id))
})
