import { useCallback, useEffect, useMemo, useState } from 'react'
import { createMockAnalysisService } from './services/mockAnalysisService'
import { createLiveAnalysisService } from './services/liveAnalysisService'
import type { AnalysisService, ProjectInfo } from './types'
import { useAnalysis } from './state/useAnalysis'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/home/HomeScreen'
import { SourceScreen } from './components/source/SourceScreen'
import { VulnSelectScreen } from './components/vulns/VulnSelectScreen'
import { ProgressScreen } from './components/progress/ProgressScreen'
import { SummaryScreen } from './components/summary/SummaryScreen'
import { ScopeModal } from './components/scope/ScopeModal'

/** Estado de la autodetección del backend (solo sin props). */
type Detection = 'loading' | 'live' | 'mock'

// QA-iter 11: el backend (uvicorn) tarda unos segundos en arrancar tras
// start-all.ps1; con UN solo intento la app a veces caía a modo mock «a ciegas»
// y el usuario veía el menú de mock hasta hacer F5. Reintentos + REINTENTAR
// en el banner lo resuelven.
const DETECT_ATTEMPTS = 4
const DETECT_RETRY_MS = 750

/**
 * Cableado completo del flujo de auditoría: useAnalysis es la única fuente de
 * estado y AppShell(step) rodea cada pantalla según flow.step.
 *
 * Modos:
 * - `service` → comportamiento exacto de Fase 1 (mock por defecto).
 * - `projects` (array) → modo live directo (lo usan los tests E2E).
 * - Sin props (uso real) → autodetección: `GET /api/health` (timeout 1500 ms)
 *   y, si ok, `GET /api/projects` → modo live (incluso con lista vacía — QA-iter 9);
 *   solo backend inalcanzable o respuesta malformada → modo mock (con banner visible).
 *   Mientras no resuelve: «CONECTANDO…».
 */
export default function App({
  service,
  projects,
}: {
  service?: AnalysisService
  projects?: ProjectInfo[] | null
}) {
  const [detection, setDetection] = useState<Detection>('loading')
  const [detectedProjects, setDetectedProjects] = useState<ProjectInfo[] | null>(null)

  // Modo live: array de proyectos explícito (prop directa o detectado).
  const liveProjects: ProjectInfo[] | null =
    service !== undefined
      ? null
      : projects !== undefined && projects !== null
        ? projects
        : detection === 'live'
          ? detectedProjects
          : null
  const inLive = liveProjects !== null
  const autoDetect = service === undefined && (projects === undefined || projects === null)

  // Fetch de proyectos reutilizable (autodetección + refresh tras registrar uno propio).
  const fetchProjects = useCallback(async (): Promise<ProjectInfo[]> => {
    const res = await fetch('/api/projects', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) throw new Error(`projects: ${res.status}`)
    return (await res.json()) as ProjectInfo[]
  }, [])

  const refreshProjects = useCallback(async () => {
    setDetectedProjects(await fetchProjects())
  }, [fetchProjects])

  // Autodetección al montar (solo sin props): health → proyectos, o mock.
  const [detectTick, setDetectTick] = useState(0)
  const retryDetection = useCallback(() => {
    setDetection('loading')
    setDetectTick(t => t + 1)
  }, [])

  useEffect(() => {
    if (!autoDetect) return
    let disposed = false
    const attempt = (n: number) => {
      fetch('/api/health', { signal: AbortSignal.timeout(1500) })
        .then(res => {
          if (!res.ok) throw new Error(`health: ${res.status}`)
          return fetchProjects()
        })
        .then(list => {
          if (disposed) return
          // QA-iter 9 (antes M2): lista vacía → live con 0 proyectos, NO mock:
          // desde la QA-iter 7 `samples/` puede estar vacío por diseño y el usuario
          // registra sus proyectos propios; caer a mock mostraba hallazgos simulados
          // sin avisar. Solo JSON malformado (no-array) sigue cayendo a mock.
          if (!Array.isArray(list)) throw new Error('proyectos: no-array')
          setDetectedProjects(list)
          setDetection('live')
        })
        .catch(() => {
          if (disposed) return
          // QA-iter 11: el backend puede estar arrancando → reintento antes de mock.
          if (n < DETECT_ATTEMPTS) {
            window.setTimeout(() => {
              if (!disposed) attempt(n + 1)
            }, DETECT_RETRY_MS)
          } else {
            setDetection('mock')
          }
        })
    }
    attempt(1)
    return () => {
      disposed = true
    }
  }, [autoDetect, fetchProjects, detectTick])

  // Una instancia del servicio live por fase live (directa o detectada).
  const liveService = useMemo(
    () => (inLive ? createLiveAnalysisService() : null),
    [inLive],
  )

  const flow = useAnalysis(service ?? liveService ?? createMockAnalysisService())

  if (autoDetect && detection === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-xs tracking-widest text-ink-dim">
        CONECTANDO…
      </div>
    )
  }

  const screen = (() => {
    switch (flow.step) {
      case 'source':
        return (
          <SourceScreen
            projects={liveProjects ?? undefined}
            onBack={flow.backToHome}
            onContinue={flow.setSource}
            onRefresh={autoDetect ? refreshProjects : undefined}
          />
        )
      case 'vulns':
        return (
          <VulnSelectScreen
            selected={flow.selectedVulns}
            onToggle={flow.toggleVuln}
            onSetAll={flow.setAllVulns}
            onRun={flow.startAnalysis}
            onBack={flow.backToHome}
          />
        )
      case 'progress':
        return <ProgressScreen analysis={flow.analysis} onBack={flow.goVulns} />
      case 'summary':
        return (
          <SummaryScreen
            analysis={flow.analysis}
            selectedFindingIds={flow.selectedFindingIds}
            onToggleFinding={flow.toggleFinding}
            onSetAllFindings={flow.setAllFindingIds}
            onGenerateScope={flow.openScope}
            onNewAudit={flow.newAudit}
            onBack={flow.goVulns}
            projectName={flow.source?.label ?? 'Proyecto'}
            canGenerateGuide={inLive}
            projectId={inLive ? flow.source?.value : undefined}
            onGuideReady={flow.updateFindingGuide}
          />
        )
      default:
        return <HomeScreen onAnalyze={flow.goSource} />
    }
  })()

  return (
    <AppShell
      step={flow.step}
      onGoSource={flow.goSource}
      onGoVulns={flow.goVulns}
      mockMode={autoDetect && detection === 'mock'}
      onRetryDetection={autoDetect ? retryDetection : undefined}
    >
      {screen}
      {flow.scopeOpen && (
        <ScopeModal
          open
          projectName={flow.source?.label ?? 'Proyecto'}
          findings={flow.analysis.findings.filter(f => flow.selectedFindingIds.includes(f.id))}
          onClose={flow.closeScope}
        />
      )}
    </AppShell>
  )
}
