import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AnalysisProgress, Finding } from '../types'
import { createLiveAnalysisService } from './liveAnalysisService'

// Stub de EventSource (jsdom no lo implementa de forma fiable).
class FakeEventSource {
  static instances: FakeEventSource[] = []
  closed = false
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  emit(obj: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
  close() {
    this.closed = true
  }
}

const A01 = {
  vulnId: 'A01',
  severity: 'high',
  title: 'Admin sin auth',
  file: 'routes/admin.js',
  line: 5,
  snippet: 'x',
  exploit: 'e',
  consequences: 'c',
  solution: 's',
  id: 'A01-1',
} as Finding

const RUN_OPTS = {
  source: { kind: 'folder' as const, label: 'miniapp', value: 'miniapp' },
  vulnIds: ['A01'] as string[],
}

/** fetch que responde 202 `{runId: 'r1'}` a `POST /api/analyze`. */
function okFetch() {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ runId: 'r1' }), { status: 202, headers: { 'Content-Type': 'application/json' } }),
  )
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('happy path: run:start → run:done', async () => {
  okFetch()
  const seen: AnalysisProgress[] = []
  createLiveAnalysisService({ tickMs: 10 }).run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
  const es = FakeEventSource.instances[0]
  expect(es.url).toBe('/api/runs/r1/events')
  es.emit({ type: 'run:start', t: 0, vulnIds: ['A01'], model: 'qwen3.8-fp8' })
  es.emit({ type: 'profile:done', t: 1, profile: { stack: 'node', framework: 'express' } })
  es.emit({ type: 'agent:start', t: 1, vulnId: 'A01' })
  es.emit({ type: 'log', t: 2, vulnId: 'A01', severity: 'high', message: '[ALTO] routes/admin.js:5 — Admin sin auth' })
  es.emit({ type: 'agent:done', t: 3, vulnId: 'A01', findingsCount: 1, criticalCount: 0, tokens: 42, tps: 38.5 })
  es.emit({
    type: 'run:done',
    t: 4,
    findings: [A01],
    meta: { files: 12, lines: 340, durationMin: 1, model: 'qwen3.8-fp8', totalTokens: 42, avgTps: 41.2 },
  })
  const last = seen[seen.length - 1]
  expect(last.status).toBe('done')
  expect(last.globalProgress).toBe(100)
  expect(last.findings).toEqual([A01])
  expect(last.meta).toEqual({
    files: 12,
    lines: 340,
    durationMin: 1,
    model: 'qwen3.8-fp8',
    totalTokens: 42,
    avgTps: 41.2,
  })
  expect(last.agents[0]).toMatchObject({ vulnId: 'A01', status: 'done', progress: 100, findingsCount: 1 })
  expect(last.logLines[0].message).toContain('ALTO')
  expect(es.closed).toBe(true)
  // Modelo y velocidad: el modelo se fija en run:start; la tps del último
  // agent:done (38.5) se sustituye por la media de run:done (41.2).
  expect(last.model).toBe('qwen3.8-fp8')
  expect(last.tps).toBe(41.2)
  // profile: el evento profile:done lleva el perfil del proyecto (informe PDF, Task 8).
  expect(last.profile).toEqual({ stack: 'node', framework: 'express' })
})

test('409 → estado error con mensaje', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }))
  const seen: AnalysisProgress[] = []
  const cancel = createLiveAnalysisService().run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(seen.length).toBe(1))
  expect(seen[0].status).toBe('error')
  expect(seen[0].error).toBe('Ya hay un análisis en curso')
  expect(FakeEventSource.instances.length).toBe(0)
  cancel() // no-op: sin runId no hay fetch de cancelación
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
})

test('run:error → estado error con mensaje', async () => {
  okFetch()
  const seen: AnalysisProgress[] = []
  createLiveAnalysisService({ tickMs: 10 }).run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
  const es = FakeEventSource.instances[0]
  es.emit({ type: 'run:start', t: 0, vulnIds: ['A01'] })
  es.emit({ type: 'run:error', t: 2, message: 'boom' })
  const last = seen[seen.length - 1]
  expect(last.status).toBe('error')
  expect(last.error).toBe('boom')
  expect(es.closed).toBe(true)
})

test('error de conexión SSE → estado error', async () => {
  okFetch()
  const seen: AnalysisProgress[] = []
  createLiveAnalysisService({ tickMs: 10 }).run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
  const es = FakeEventSource.instances[0]
  es.emit({ type: 'run:start', t: 0, vulnIds: ['A01'] })
  es.onerror!()
  const last = seen[seen.length - 1]
  expect(last.status).toBe('error')
  expect(last.error).toBe('Error de conexión con el backend')
  expect(es.closed).toBe(true)
})

test('cancel() cierra el stream y no emite después', async () => {
  okFetch()
  const seen: AnalysisProgress[] = []
  const cancel = createLiveAnalysisService({ tickMs: 10 }).run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
  const es = FakeEventSource.instances[0]
  es.emit({ type: 'run:start', t: 0, vulnIds: ['A01'] })
  es.emit({ type: 'agent:start', t: 1, vulnId: 'A01' })
  const countAtCancel = seen.length
  cancel()
  cancel() // idempotente: no repite el fetch de cancelación
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2) // POST /api/analyze + POST /api/runs/r1/cancel
  expect(vi.mocked(fetch)).toHaveBeenLastCalledWith('/api/runs/r1/cancel', { method: 'POST' })
  expect(es.closed).toBe(true)
  // Eventos posteriores al cancel no producen emisiones.
  es.emit({ type: 'log', t: 2, vulnId: 'A01', message: 'luego del cancel' })
  es.emit({ type: 'run:done', t: 3, findings: [A01], meta: { files: 1, lines: 1, durationMin: 1 } })
  await new Promise(r => setTimeout(r, 50))
  expect(seen.length).toBe(countAtCancel)
})

test('agent:progress: tk/s en vivo antes de agent:done (QA-iter 5)', async () => {
  okFetch()
  const seen: AnalysisProgress[] = []
  const cancel = createLiveAnalysisService({ tickMs: 10 }).run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
  const es = FakeEventSource.instances[0]
  es.emit({ type: 'run:start', t: 0, vulnIds: ['A01'] })
  es.emit({ type: 'agent:start', t: 0.5, vulnId: 'A01' })
  // Progreso en vivo (el backend lo manda con throttle de ~1 s por agente).
  es.emit({ type: 'agent:progress', t: 1.5, vulnId: 'A01', tokens: 120, tps: 33.3 })
  await vi.waitFor(() => expect(seen[seen.length - 1].tps).toBe(33.3))
  // El agent:done final sustituye el valor en vivo (y cierra el agente).
  es.emit({ type: 'agent:done', t: 3, vulnId: 'A01', findingsCount: 0, criticalCount: 0, tokens: 160, tps: 38.5 })
  const last = seen[seen.length - 1]
  expect(last.tps).toBe(38.5)
  expect(last.agents[0].status).toBe('done')
  cancel()
})

test('interpolación: progreso fino entre agent:start y agent:done', async () => {
  okFetch()
  const seen: AnalysisProgress[] = []
  const cancel = createLiveAnalysisService({ tickMs: 10 }).run(RUN_OPTS, (p) => seen.push(p))
  await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
  const es = FakeEventSource.instances[0]
  es.emit({ type: 'agent:start', t: 0, vulnId: 'A01' })
  await new Promise(r => setTimeout(r, 60))
  const mid = seen[seen.length - 1]
  expect(mid.status).toBe('running')
  expect(mid.agents[0].status).toBe('running')
  expect(mid.agents[0].progress).toBeGreaterThan(0)
  expect(mid.agents[0].progress).toBeLessThan(90)
  expect(mid.globalProgress).toBeGreaterThan(0)
  es.emit({ type: 'agent:done', t: 1, vulnId: 'A01', findingsCount: 0, criticalCount: 0 })
  const last = seen[seen.length - 1]
  expect(last.agents[0]).toMatchObject({ status: 'done', progress: 100 })
  cancel()
})
