import { expect, test } from 'vitest'
import type { AnalysisProgress, Source } from '../types'
import { OWASP_VULNS } from '../data/owasp'
import { MOCK_FINDINGS } from '../data/mockFindings'
import { createMockAnalysisService } from './mockAnalysisService'

const IDS = OWASP_VULNS.map(v => v.id)
const folder: Source = { kind: 'folder', label: 'Carpeta', value: 'proyecto/src' }

// Temporizadores reales y cortos: ~80 ms por agente, ticks de 10 ms.
const SERVICE_OPTS = { agentMs: 80, tickMs: 10 } as const

// Arranca un análisis con la lista de vulns dada y registra TODAS las
// emisiones de onUpdate (snapshots inmutables del estado).
function startRun(vulnIds: string[]) {
  const updates: AnalysisProgress[] = []
  const cancel = createMockAnalysisService(SERVICE_OPTS).run(
    { source: folder, vulnIds },
    (p) => updates.push(p),
  )

  // Espera (polling con temporizadores reales) a que el último estado
  // capturado cumpla pred.
  function until(pred: (p: AnalysisProgress) => boolean, timeoutMs = 3000): Promise<AnalysisProgress> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const iv = setInterval(() => {
        const last = updates[updates.length - 1]
        if (last && pred(last)) {
          clearInterval(iv)
          resolve(last)
        } else if (Date.now() - startedAt > timeoutMs) {
          clearInterval(iv)
          const res = last
            ? {
                status: last.status,
                globalProgress: last.globalProgress,
                agents: last.agents.map(a => `${a.vulnId}:${a.status}:${Math.round(a.progress)}`),
              }
            : 'sin emisiones'
          reject(new Error(`until: sin estado que cumpla la condición a los ${timeoutMs} ms — último: ${JSON.stringify(res)}`))
        }
      }, 5)
    })
  }

  return { updates, cancel, until }
}

test('emite estado inicial running con los agentes en orden A01..A10', () => {
  const { updates } = startRun(IDS)
  expect(updates.length).toBeGreaterThanOrEqual(1)
  const first = updates[0]
  expect(first.status).toBe('running')
  expect(first.globalProgress).toBe(0)
  expect(first.agents.map(a => a.vulnId)).toEqual(IDS)
  for (const a of first.agents) {
    expect(a.status).toBe('pending')
    expect(a.progress).toBe(0)
  }
  expect(first.findings).toEqual([])
  expect(first.logLines).toHaveLength(1)
  expect(first.logLines[0].message).toMatch(/^iniciando análisis de 10 vulnerabilidades/)
})

test('con 1 vuln, la línea de arranque usa el singular «vulnerabilidad»', () => {
  const { updates } = startRun(['A01'])
  expect(updates.length).toBeGreaterThanOrEqual(1)
  expect(updates[0].logLines[0].message).toMatch(/^iniciando análisis de 1 vulnerabilidad…$/)
})

test('ejecuta los agentes estrictamente uno a uno (sin solaparse)', async () => {
  const { updates, until } = startRun(IDS)
  await until(p => p.status === 'done')

  // En ningún snapshot hay más de un agente «running» a la vez.
  for (const p of updates) {
    expect(p.agents.filter(a => a.status === 'running').length).toBeLessThanOrEqual(1)
  }

  // Cada agente pasa a «done» solo después de que el anterior lo haga:
  // el orden de finalización es exactamente A01..A10.
  const doneOrder: string[] = []
  for (const p of updates) {
    for (const a of p.agents) {
      if (a.status === 'done' && !doneOrder.includes(a.vulnId)) doneOrder.push(a.vulnId)
    }
  }
  expect(doneOrder).toEqual(IDS)
}, 10000)

test('termina en done con globalProgress 100 y findings = concatenación de MOCK_FINDINGS de las elegidas', async () => {
  const chosen = ['A01', 'A03', 'A10'] // A10 lleva 0 hallazgos a propósito
  const { until } = startRun(chosen)
  const final = await until(p => p.status === 'done')

  expect(final.status).toBe('done')
  expect(final.globalProgress).toBe(100)
  const expected = [...MOCK_FINDINGS.A01, ...MOCK_FINDINGS.A03, ...MOCK_FINDINGS.A10]
  expect(final.findings).toEqual(expected)
  expect(final.meta).toEqual({ files: 128, lines: 3412, durationMin: 14 })
}, 10000)

test('cancel() detiene las actualizaciones', async () => {
  const { updates, cancel, until } = startRun(IDS)
  // Cancela en el primer estado con un agente running.
  await until(p => p.agents.some(a => a.status === 'running'))
  const countAtCancel = updates.length
  cancel()
  await new Promise(r => setTimeout(r, 200))
  // No llegan más onUpdate tras el cancel.
  expect(updates.length).toBe(countAtCancel)
})

test('con las 10 vulns elegidas, los 10 agentes completan en orden (ejecución completa)', async () => {
  const { updates, until } = startRun(IDS)
  const final = await until(p => p.status === 'done')

  expect(final.status).toBe('done')
  expect(final.globalProgress).toBe(100)
  expect(final.agents).toHaveLength(10)
  expect(final.agents.map(a => a.vulnId)).toEqual(IDS)
  for (const a of final.agents) {
    expect(a.status).toBe('done')
    expect(a.progress).toBe(100)
    const fs = MOCK_FINDINGS[a.vulnId] ?? []
    expect(a.findingsCount).toBe(fs.length)
    expect(a.criticalCount).toBe(fs.filter(f => f.severity === 'critical').length)
  }

  // findings = concatenación (en orden canónico) de todas las vulns.
  const all = OWASP_VULNS.flatMap(v => MOCK_FINDINGS[v.id] ?? [])
  expect(final.findings).toEqual(all)
  expect(final.meta).toEqual({ files: 128, lines: 3412, durationMin: 14 })

  // Cada agente deja su línea de log «completado» con su vulnId.
  for (const v of OWASP_VULNS) {
    expect(final.logLines.some(l => l.vulnId === v.id && /completado/.test(l.message))).toBe(true)
  }

  // El progreso global crece de forma no decreciente a lo largo del run.
  const global = updates.map(p => p.globalProgress)
  for (let i = 1; i < global.length; i++) expect(global[i]).toBeGreaterThanOrEqual(global[i - 1])
}, 10000)
