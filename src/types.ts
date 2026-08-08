export type NetworkSeverity = 'critical' | 'important' | 'media-quality'

/** Retained internally for diagnostics and tests; never rendered in the normal UI. */
export interface SourceReference {
  lineNumber: number
  text: string
}

export interface NetworkIndicator {
  label: string
  severity: NetworkSeverity
  sessionId?: string
  source: SourceReference
}

export interface ProblemTime {
  timestamp: string
  displayTime: string
  indicators: NetworkIndicator[]
}

export interface AgentAnalysis {
  key: string
  agent: string
  agentId: string
  extension: string
  networkStatus: string
  problemTimes: ProblemTime[]
  finding: string
  possibleImpact: string
  conclusion: string
}

export interface AnalysisResult {
  fileName: string
  totalLines: number
  ignoredLines: number
  agents: AgentAnalysis[]
}
