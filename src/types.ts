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
  ivrCalls: IvrCall[]
}

export type IvrSeverity = 'Critical'|'Failed'|'Warning'|'Healthy'|'Unknown'
export type IvrEventType = 'NEW_CALL'|'CALL_INITIALIZED'|'IVR_STARTED'|'PROMPT_STARTED'|'PROMPT_COMPLETED'|'COLLECT_DIGITS_STARTED'|'DIGIT_COLLECTED'|'COLLECT_DIGITS_FAILED'|'IVR_RETRY'|'IVR_MAX_RETRIES'|'NEXT_NODE_FAILED'|'ROUTING_SUCCESS'|'ROUTING_FAILED'|'SYSTEM_HANGUP'|'CALL_DISCONNECTED'|'UNKNOWN_ERROR'
export interface IvrEvent { timestamp?:string; type:IvrEventType; label:string; severity:'info'|'warning'|'error'; digit?:string; errorCode?:string; prompt?:string; rawLine:string; lineNumber:number }
export interface IvrCall { phoneNumber:string; callId:string; routePoint?:string; taskNumber?:string; campaignId?:string; transactionId?:string; startTime?:string; endTime?:string; callStatus?:string; numberOfRoutes?:number; totalRoutes?:number; events:IvrEvent[]; ivrStatus:IvrSeverity; routingStatus:'Reached'|'Not Reached'|'Unknown'; collectDigitAttempts:number; successfulAttempts:number; failedAttempts:number; primaryFailureStage?:string; systemAction?:string; finding:string; possibleCause:string; possibleImpact:string; conclusion:string; problemScore:number }

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
