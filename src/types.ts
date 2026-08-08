export type Severity = 'observed' | 'warning' | 'error' | 'root-cause'

export interface Evidence {
  lineNumber: number
  text: string
}

export interface TimelineEvent {
  id: string
  timestamp?: string
  kind: string
  summary: string
  severity: Severity
  evidence: Evidence
}

export interface Finding {
  ruleId: string
  title: string
  detail: string
  severity: Severity
  evidence: Evidence[]
  recommendation?: string
}

export interface AnalyzedCall {
  callId: string
  label: string
  firstLine: number
  lastLine: number
  channels: string[]
  events: TimelineEvent[]
  findings: Finding[]
  cannotConfirm: string[]
}

export interface AnalysisResult {
  fileName: string
  totalLines: number
  ignoredLines: number
  calls: AnalyzedCall[]
}
