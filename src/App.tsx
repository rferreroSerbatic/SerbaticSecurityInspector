import { createMockAnalysisService } from './services/mockAnalysisService'
import type { AnalysisService } from './types'
import { useAnalysis } from './state/useAnalysis'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/home/HomeScreen'
import { SourceScreen } from './components/source/SourceScreen'
import { VulnSelectScreen } from './components/vulns/VulnSelectScreen'
import { ProgressScreen } from './components/progress/ProgressScreen'
import { SummaryScreen } from './components/summary/SummaryScreen'
import { ScopeModal } from './components/scope/ScopeModal'

/**
 * Cableado completo del flujo de auditoría (Fase 1): useAnalysis es la única
 * fuente de estado y AppShell(step) rodea cada pantalla según flow.step.
 * `service` por defecto es el mock (5500 ms/agente, tick 250 ms).
 */
export default function App({ service = createMockAnalysisService() }: { service?: AnalysisService }) {
  const flow = useAnalysis(service)

  const screen = (() => {
    switch (flow.step) {
      case 'source':
        return <SourceScreen onBack={flow.backToHome} onContinue={flow.setSource} />
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
            onGenerateScope={flow.openScope}
            onNewAudit={flow.newAudit}
            onBack={flow.goVulns}
          />
        )
      default:
        return <HomeScreen onAnalyze={flow.goSource} />
    }
  })()

  return (
    <AppShell step={flow.step} onGoSource={flow.goSource} onGoVulns={flow.goVulns}>
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
