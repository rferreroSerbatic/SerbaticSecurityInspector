import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisProgress, AnalysisService, Source, Step } from '../types'
import { OWASP_VULNS } from '../data/owasp'

/** Las 10 vulnerabilidades OWASP, en orden A01..A10. */
const ALL_VULN_IDS = OWASP_VULNS.map(v => v.id)

/** Estado inicial del análisis (sin haber corrido nada). */
const IDLE_ANALYSIS: AnalysisProgress = {
  status: 'idle',
  globalProgress: 0,
  agents: [],
  logLines: [],
  findings: [],
}

export interface UseAnalysis {
  step: Step
  source: Source | null
  selectedVulns: string[]
  analysis: AnalysisProgress
  selectedFindingIds: string[]
  scopeOpen: boolean
  goSource(): void
  goVulns(): void
  setSource(s: Source): void
  toggleVuln(id: string): void
  setAllVulns(ids: string[]): void
  startAnalysis(): void
  backToHome(): void
  toggleFinding(id: string): void
  setAllFindingIds(ids: string[]): void
  openScope(): void
  closeScope(): void
  newAudit(): void
}

export function useAnalysis(service: AnalysisService): UseAnalysis {
  const [step, setStep] = useState<Step>('home')
  const [source, setSourceState] = useState<Source | null>(null)
  const [selectedVulns, setSelectedVulns] = useState<string[]>(ALL_VULN_IDS)
  const [analysis, setAnalysis] = useState<AnalysisProgress>(IDLE_ANALYSIS)
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([])
  const [scopeOpen, setScopeOpen] = useState(false)

  // cancel() del service en curso (si lo hay).
  const cancelRef = useRef<(() => void) | null>(null)

  // Auto-avance: al terminar el análisis (status 'done') desde la pantalla de
  // progreso, pasamos al resumen. Lee step y analysis.status directamente,
  // sin cierres obsoletos.
  useEffect(() => {
    if (step === 'progress' && analysis.status === 'done') {
      setStep('summary')
    }
  }, [step, analysis.status])

  // Al desmontar, cancela cualquier análisis en curso.
  useEffect(() => {
    return () => {
      cancelRef.current?.()
      cancelRef.current = null
    }
  }, [])

  const goSource = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    setStep('source')
  }, [])

  const goVulns = useCallback(() => {
    if (!source) return
    cancelRef.current?.()
    cancelRef.current = null
    setStep('vulns')
  }, [source])

  const setSource = useCallback((s: Source) => {
    setSourceState(s)
    setStep('vulns')
  }, [])

  const toggleVuln = useCallback((id: string) => {
    setSelectedVulns(prev =>
      prev.includes(id)
        ? prev.filter(v => v !== id)
        : // al (re)seleccionar, mantiene el orden canónico A01..A10
          ALL_VULN_IDS.filter(v => prev.includes(v) || v === id),
    )
  }, [])

  const setAllVulns = useCallback((ids: string[]) => {
    setSelectedVulns(ids)
  }, [])

  const startAnalysis = useCallback(() => {
    if (!source) return
    // Reinicia cualquier análisis anterior antes de arrancar uno nuevo.
    cancelRef.current?.()
    cancelRef.current = null
    setSelectedFindingIds([])
    setAnalysis(IDLE_ANALYSIS)
    setStep('progress')
    cancelRef.current = service.run(
      { source, vulnIds: selectedVulns },
      (p) => setAnalysis(p),
    )
  }, [service, source, selectedVulns])

  const backToHome = useCallback(() => {
    setStep('home')
  }, [])

  const toggleFinding = useCallback((id: string) => {
    setSelectedFindingIds(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id],
    )
  }, [])

  const setAllFindingIds = useCallback((ids: string[]) => {
    setSelectedFindingIds(ids)
  }, [])

  const openScope = useCallback(() => {
    setScopeOpen(true)
  }, [])

  const closeScope = useCallback(() => {
    setScopeOpen(false)
  }, [])

  const newAudit = useCallback(() => {
    // Estado limpio: cancela lo que corra y vuelve a home con todo por defecto.
    cancelRef.current?.()
    cancelRef.current = null
    setStep('home')
    setSourceState(null)
    setSelectedVulns(ALL_VULN_IDS)
    setAnalysis(IDLE_ANALYSIS)
    setSelectedFindingIds([])
    setScopeOpen(false)
  }, [])

  return {
    step,
    source,
    selectedVulns,
    analysis,
    selectedFindingIds,
    scopeOpen,
    goSource,
    goVulns,
    setSource,
    toggleVuln,
    setAllVulns,
    startAnalysis,
    backToHome,
    toggleFinding,
    setAllFindingIds,
    openScope,
    closeScope,
    newAudit,
  }
}
