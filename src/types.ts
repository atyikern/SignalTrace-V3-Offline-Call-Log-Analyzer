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
  extensions: ExtensionNetworkAnalysis[]
}

export type ReachabilityStatus = 'Reachable' | 'Unreachable'
export type RttClassification = 'Good' | 'Warning' | 'High' | 'Critical' | 'Unreachable'
export type ExtensionNetworkStatus = 'Healthy' | 'RTT Warning' | 'High RTT' | 'Unstable' | 'Unreachable'

export interface PjsipRttEvent {
  extension: string
  status: ReachabilityStatus
  rtt: number
  rttClassification: RttClassification
  timestamp: string
  epochMs: number
  ipAddress: string
  port: string
  transport: string
  contactId: string
  source: SourceReference
}

export interface ExtensionProblemTime {
  timestamp: string
  displayTime: string
  items: string[]
}

export interface ExtensionMetrics {
  unreachableEvents: number
  recoveries: number
  longestOutageSeconds?: number
  highestRtt?: number
  averageRtt?: number
  rttSpikes: number
}

export interface ExtensionNetworkAnalysis {
  extension: string
  networkStatus: ExtensionNetworkStatus
  currentStatus: ReachabilityStatus
  problemTimes: ExtensionProblemTime[]
  finding: string
  possibleImpact: string
  conclusion: string
  metrics: ExtensionMetrics
  events: PjsipRttEvent[]
}
