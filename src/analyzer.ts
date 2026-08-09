import type { AgentAnalysis, AnalysisResult, NetworkIndicator, NetworkSeverity, ProblemTime, SourceReference } from './types'
import { analyzePjsipNetworks, normalizeLogRecords, parseTimestamp } from './pjsipAnalyzer'
import { analyzeIvrCalls } from './ivrAnalyzer'

export const DEFAULT_GROUPING_WINDOW_MS = 2_000

interface IndicatorRule {
  label: string
  severity: NetworkSeverity
  pattern: RegExp
}

interface AgentMetadata {
  agent?: string
  agentId?: string
  extension?: string
}

export interface SocketIoMetadata {
  agent?: string
  sessionId?: string
}

interface DetectedProblem {
  timestamp: string
  epochMs: number
  indicators: NetworkIndicator[]
}

const INDICATOR_RULES: IndicatorRule[] = [
  { label: 'ECONNRESET', severity: 'critical', pattern: /\bECONNRESET\b/i },
  { label: 'EFV DESTROY', severity: 'critical', pattern: /\bEFV[ _-]?DESTROY\b/i },
  { label: 'Unreachable', severity: 'critical', pattern: /\bunreachable\b/i },
  { label: 'Connection reset', severity: 'critical', pattern: /\bconnection reset\b/i },
  { label: 'Broken pipe', severity: 'important', pattern: /\bbroken pipe\b/i },
  { label: 'WebSocket disconnect/error', severity: 'important', pattern: /\bwebsocket\b.*\b(?:disconnect(?:ed|ion)?|error)\b|\b(?:disconnect(?:ed|ion)?|error)\b.*\bwebsocket\b/i },
  { label: 'Timeout', severity: 'important', pattern: /(?<!RTP )(?<!media )\b(?:timeout|timed out)\b/i },
  { label: 'Connection refused', severity: 'important', pattern: /\bconnection refused\b/i },
  { label: 'Transport error', severity: 'important', pattern: /\btransport error\b/i },
  { label: 'RTP packet loss', severity: 'media-quality', pattern: /\bRTP packet loss\b/i },
  { label: 'Lost packets', severity: 'media-quality', pattern: /\blost packets\b/i },
  { label: 'Jitter', severity: 'media-quality', pattern: /\bjitter\b/i },
  { label: 'RTP timeout', severity: 'media-quality', pattern: /\bRTP timeout\b/i },
  { label: 'Media timeout', severity: 'media-quality', pattern: /\bmedia timeout\b/i },
]

function valueFor(text: string, label: string): string | undefined {
  return text.match(new RegExp(`\\b${label}\\s*[:=]\\s*["']?([\\w.@+-]+)`, 'i'))?.[1]
}

function metadataFor(text: string): AgentMetadata {
  return {
    agent: valueFor(text, 'Agent(?!\\s+ID)'),
    agentId: valueFor(text, 'Agent\\s+ID'),
    extension: valueFor(text, 'Extension'),
  }
}

/** Extracts the connection identity from an OpsCentral SocketIO / EFV entry. */
export function parseSocketIoMetadata(line: string): SocketIoMetadata {
  const match = line.match(/\[io:\s*([^\s\]]+).*?\]\s*\[\s*([^\]]+?)\s*\]\s*EFV/i)
  if (!match) return {}
  const candidate = match[2].trim()
  return {
    sessionId: match[1],
    agent: candidate && candidate.toLowerCase() !== 'undefined' ? candidate : undefined,
  }
}

function timestampFor(text: string): { timestamp: string; epochMs: number } | undefined {
  return parseTimestamp(text)
}

function displayTime(timestamp: string): string {
  return timestamp.match(/(\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?$/)?.[1] ?? timestamp
}

function keyFor(metadata: AgentMetadata): string | undefined {
  if (metadata.agentId) return `id:${metadata.agentId.toLowerCase()}`
  if (metadata.agent) return `agent:${metadata.agent.toLowerCase()}`
  if (metadata.extension) return `extension:${metadata.extension.toLowerCase()}`
  return undefined
}

function mergeMetadata(current: AgentMetadata, incoming: AgentMetadata): AgentMetadata {
  return {
    agent: incoming.agent ?? current.agent,
    agentId: incoming.agentId ?? current.agentId,
    extension: incoming.extension ?? current.extension,
  }
}

function groupProblems(problems: DetectedProblem[], windowMs: number): ProblemTime[] {
  const sorted = [...problems].sort((a, b) => a.epochMs - b.epochMs)
  const groups: DetectedProblem[] = []
  for (const problem of sorted) {
    const group = groups.at(-1)
    if (group && problem.epochMs - group.epochMs <= windowMs) {
      group.indicators.push(...problem.indicators)
      continue
    }
    groups.push({ ...problem, indicators: [...problem.indicators] })
  }
  return groups.map((group) => {
    const unique = new Map<string, NetworkIndicator>()
    group.indicators.forEach((indicator) => unique.set(`${indicator.severity}:${indicator.label}`, indicator))
    return { timestamp: group.timestamp, displayTime: displayTime(group.timestamp), indicators: [...unique.values()] }
  })
}

function summarize(metadata: AgentMetadata, problems: ProblemTime[]): AgentAnalysis {
  const severities = problems.flatMap((problem) => problem.indicators.map((indicator) => indicator.severity))
  const repeated = problems.length > 1
  const hasCritical = severities.includes('critical')
  const hasImportant = severities.includes('important')
  const networkStatus = hasCritical && repeated
    ? 'High network instability detected'
    : hasCritical
      ? 'Network instability detected'
      : hasImportant
        ? 'Connection instability detected'
        : 'Media quality instability detected'
  return {
    key: keyFor(metadata)!,
    agent: metadata.agent ?? 'Not identified',
    agentId: metadata.agentId ?? 'Not identified',
    extension: metadata.extension ?? 'Not identified',
    networkStatus,
    problemTimes: problems,
    finding: repeated
      ? 'Multiple network disconnection events were detected for this agent during the reviewed period.'
      : 'A network disconnection event was detected for this agent.',
    possibleImpact: 'These connection interruptions may have affected the agent’s active call session and could contribute to intermittent or unclear audio.',
    conclusion: hasCritical && repeated
      ? 'There is strong evidence of repeated network/connection instability during the reviewed period.'
      : 'The log contains network or media instability indicators for this agent during the reviewed period.',
  }
}

export function analyzeLog(contents: string, fileName = 'PBX log', groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS): AnalysisResult {
  const physicalLines = normalizeLogRecords(contents)
  const agents = new Map<string, { metadata: AgentMetadata; problems: DetectedProblem[] }>()
  const sessionAgents = new Map<string, string | undefined>()
  let activeKey: string | undefined
  let ignoredLines = 0

  // Resolve only explicit, unambiguous session-to-Agent relationships. This
  // permits an undefined entry to follow or precede its named counterpart
  // without ever guessing from timestamp proximity.
  physicalLines.forEach((text) => {
    const socket = parseSocketIoMetadata(text)
    if (!socket.sessionId || !socket.agent) return
    const known = sessionAgents.get(socket.sessionId)
    if (known === undefined && !sessionAgents.has(socket.sessionId)) sessionAgents.set(socket.sessionId, socket.agent)
    else if (known?.toLowerCase() !== socket.agent.toLowerCase()) sessionAgents.set(socket.sessionId, undefined)
  })

  physicalLines.forEach((text, index) => {
    if (!text.trim()) return
    // PJSIP RTT records are analyzed independently by Extension below and
    // must not inherit the active SocketIO/EFV Agent in a mixed log.
    if (/res_pjsip\/pjsip_options\.c/i.test(text)) return
    const socket = parseSocketIoMetadata(text)
    const resolvedSocketAgent = socket.agent ?? (socket.sessionId ? sessionAgents.get(socket.sessionId) : undefined)
    const conventionalMetadata = metadataFor(text)
    const metadata = resolvedSocketAgent ? { ...conventionalMetadata, agent: resolvedSocketAgent } : conventionalMetadata
    const explicitKey = keyFor(metadata)
    const key = socket.sessionId
      ? (resolvedSocketAgent ? `agent:${resolvedSocketAgent.toLowerCase()}` : undefined)
      : metadata.agent || metadata.agentId ? explicitKey : activeKey ?? explicitKey
    if (metadata.agentId && activeKey && activeKey !== key) {
      const pending = agents.get(activeKey)
      if (pending && !pending.metadata.agentId && pending.problems.length === 0) {
        agents.delete(activeKey)
        agents.set(key!, pending)
      }
    }
    if (key) activeKey = key
    if (!key) { ignoredLines += 1; return }

    const existing = agents.get(key) ?? { metadata: {}, problems: [] }
    existing.metadata = mergeMetadata(existing.metadata, metadata)
    agents.set(key, existing)

    const timestamp = timestampFor(text)
    if (!timestamp) return
    const source: SourceReference = { lineNumber: index + 1, text }
    const indicators = INDICATOR_RULES
      .filter((rule) => rule.pattern.test(text))
      .map((rule) => ({ label: rule.label, severity: rule.severity, sessionId: socket.sessionId, source }))
    if (indicators.length) existing.problems.push({ ...timestamp, indicators })
  })

  const analyses = [...agents.values()]
    .map(({ metadata, problems }) => ({ metadata, problems: groupProblems(problems, Math.max(0, groupingWindowMs)) }))
    .filter(({ problems }) => problems.length > 0)
    .map(({ metadata, problems }) => summarize(metadata, problems))
    .sort((a, b) => a.agent.localeCompare(b.agent))

  return { fileName, totalLines: physicalLines.length, ignoredLines, agents: analyses, extensions: analyzePjsipNetworks(physicalLines), ivrCalls: analyzeIvrCalls(physicalLines) }
}

export const networkIndicatorRules = INDICATOR_RULES.map(({ label, severity }) => ({ label, severity }))
