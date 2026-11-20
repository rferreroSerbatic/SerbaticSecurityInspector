import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAnalysis } from './useAnalysis'
import type { AnalysisProgress, AnalysisService, Finding, Source } from '../types'
import { OWASP_VULNS } from '../data/owasp'

afterEach(cleanup)

const IDS = OWASP_VULNS.map(v => v.id)

class FakeService implements AnalysisService {
  runCount = 0
  cancel = vi.fn()
  constructor(private readonly findings: Finding[] = []) {}
  run(_opts: { source: Source; vulnIds: string[] }, onUpdate: (p: AnalysisProgress) => void) {
    this.runCount++
    onUpdate({ status: 'done', globalProgress: 100, agents: [], logLines: [], findings: this.findings })
    return this.cancel
  }
}

// Servicio que se queda «en marcha» para probar el cancel al desmontar.
class HangingService implements AnalysisService {
  cancel = vi.fn()
  run(_opts: { source: Source; vulnIds: string[] }, _onUpdate: (p: AnalysisProgress) => void) {
    return this.cancel
  }
}

const folder: Source = { kind: 'folder', label: 'Carpeta', value: 'proyecto/src' }

function setup<S extends AnalysisService>(service: S) {
  const { result, unmount } = renderHook(() => useAnalysis(service))
  return { service, result, unmount }
}

test('empieza en home con las 10 vulns preseleccionadas', () => {
  const { result } = setup(new FakeService())
  expect(result.current.step).toBe('home')
  expect(result.current.source).toBeNull()
  expect(result.current.selectedVulns).toEqual(IDS)
  expect(result.current.analysis.status).toBe('idle')
})

test('goSource -> source; setSource -> vulns con source guardado', () => {
  const { result } = setup(new FakeService())
  act(() => result.current.goSource())
  expect(result.current.step).toBe('source')
  act(() => result.current.setSource(folder))
  expect(result.current.step).toBe('vulns')
  expect(result.current.source).toEqual(folder)
})

test('toggleVuln y setAllVulns actualizan la selección', () => {
  const { result } = setup(new FakeService())
  act(() => result.current.toggleVuln('A05'))
  expect(result.current.selectedVulns).toHaveLength(9)
  expect(result.current.selectedVulns).not.toContain('A05')
  act(() => result.current.toggleVuln('A05'))
  expect(result.current.selectedVulns).toEqual(IDS)
  act(() => result.current.setAllVulns(['A01', 'A10']))
  expect(result.current.selectedVulns).toEqual(['A01', 'A10'])
})

test('startAnalysis ejecuta el servicio una vez, limpia el estado anterior y pasa a summary al terminar', () => {
  const { service, result } = setup(new FakeService())
  act(() => result.current.setSource(folder))
  act(() => result.current.toggleFinding('f1'))
  act(() => result.current.startAnalysis())
  expect(service.runCount).toBe(1)
  expect(result.current.selectedFindingIds).toEqual([])
  expect(result.current.analysis.status).toBe('done')
  expect(result.current.step).toBe('summary')
})

test('newAudit reinicia a home con las 10 preseleccionadas y cancela lo que corra', () => {
  const { service, result } = setup(new FakeService())
  act(() => result.current.setSource(folder))
  act(() => result.current.toggleVuln('A03'))
  act(() => result.current.toggleFinding('f9'))
  act(() => result.current.openScope())
  act(() => result.current.startAnalysis())
  expect(result.current.step).toBe('summary')
  act(() => result.current.newAudit())
  expect(result.current.step).toBe('home')
  expect(result.current.source).toBeNull()
  expect(result.current.selectedVulns).toEqual(IDS)
  expect(result.current.selectedFindingIds).toEqual([])
  expect(result.current.scopeOpen).toBe(false)
  expect(result.current.analysis.status).toBe('idle')
  expect(service.cancel).toHaveBeenCalled()
})

test('cancela el análisis en curso al desmontar', () => {
  const service = new HangingService()
  const { result, unmount } = setup(service)
  act(() => result.current.setSource(folder))
  act(() => result.current.startAnalysis())
  unmount()
  expect(service.cancel).toHaveBeenCalled()
})

test('goVulns cancela el análisis en curso y vuelve a vulns', () => {
  const service = new HangingService()
  const { result } = setup(service)
  act(() => result.current.goSource())
  act(() => result.current.setSource({ kind: 'git', label: 'org/repo', value: 'https://github.com/org/repo' }))
  act(() => result.current.startAnalysis())
  expect(result.current.step).toBe('progress')
  act(() => result.current.goVulns())
  expect(result.current.step).toBe('vulns')
  expect(service.cancel).toHaveBeenCalled()
})

test('goVulns sin fuente es no-op', () => {
  const { result } = setup(new FakeService())
  act(() => result.current.goVulns())
  expect(result.current.step).toBe('home')
})

test('goSource cancela un análisis en curso', () => {
  const service = new HangingService()
  const { result } = setup(service)
  act(() => result.current.setSource(folder))
  act(() => result.current.startAnalysis())
  act(() => result.current.goSource())
  expect(result.current.step).toBe('source')
  expect(service.cancel).toHaveBeenCalled()
})

test('volver de summary a vulns conserva el análisis hecho', () => {
  const finding: Finding = {
    id: 'A01-1',
    vulnId: 'A01',
    severity: 'high',
    title: 'Control de acceso insuficiente',
    file: 'src/users.ts',
    line: 12,
    snippet: 'return user',
    exploit: 'Acceso no autorizado.',
    consequences: 'Exposición de datos.',
    solution: 'Validar el propietario.',
  }
  const { result } = setup(new FakeService([finding]))
  act(() => result.current.setSource(folder))
  act(() => result.current.startAnalysis())
  expect(result.current.step).toBe('summary')
  expect(result.current.analysis.status).toBe('done')
  const findingsLength = result.current.analysis.findings.length
  act(() => result.current.goVulns())
  expect(result.current.step).toBe('vulns')
  expect(result.current.analysis.status).toBe('done')
  expect(result.current.analysis.findings).toHaveLength(findingsLength)
})
