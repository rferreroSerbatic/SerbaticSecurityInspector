export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Vuln {
  id: string
  name: string
  icon: string
  description: string
  /** CVE representativo de la categoría (QA-iter 6); su ficha: cve.org/CVERecord?id=... */
  cve: string
}

export interface Finding {
  id: string
  vulnId: string
  severity: Severity
  title: string
  file: string
  line: number
  snippet: string
  exploit: string
  consequences: string
  solution: string
  /** Otras categorías OWASP que reportaron este mismo hallazgo (desduplicación, Fase 2b). */
  alsoCategories?: string[]
  /** Fase 2d.1: guía de explotación bajo demanda (al pinchar o al exportar; solo runs reales — el mock no lleva guía). */
  guide?: string
}

export type AgentStatus = 'pending' | 'running' | 'done'

export interface AgentProgress {
  vulnId: string
  status: AgentStatus
  progress: number // 0..100
  currentFile?: string
  findingsCount?: number
  criticalCount?: number
}

export interface LogLine {
  id: string
  time: string
  vulnId: string
  severity?: Severity
  message: string
}

export interface AnalysisProgress {
  status: 'idle' | 'running' | 'done' | 'error'
  error?: string
  globalProgress: number // 0..100
  agents: AgentProgress[]
  logLines: LogLine[]
  findings: Finding[]
  /** Solo modo live: el modelo LLM que está ejecutando el análisis. */
  model?: string
  /** Solo modo live: velocidad de generación (tokens/s) del último agente o media final. */
  tps?: number
  meta?: {
    files: number
    lines: number
    durationMin: number
    model?: string
    totalTokens?: number
    avgTps?: number
  }
  /** Solo modo live: perfil del proyecto del agente perfilador (informe PDF). */
  profile?: Record<string, unknown>
}

export interface ProjectInfo {
  id: string
  name: string
  path: string
  files: number
  lines: number
  /** Origen del proyecto (Fase 2b): muestra el tag LOCAL/GIT en la lista. */
  kind?: 'sample' | 'local' | 'git'
}

export type SourceKind = 'folder' | 'git'

export interface Source {
  kind: SourceKind
  label: string
  value: string
}

export type Step = 'home' | 'source' | 'vulns' | 'progress' | 'summary'

export interface AnalysisService {
  run(opts: { source: Source; vulnIds: string[] }, onUpdate: (p: AnalysisProgress) => void): () => void // devuelve cancel()
}
