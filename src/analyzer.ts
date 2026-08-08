import type { AnalysisResult, AnalyzedCall, Evidence, Finding, Severity, TimelineEvent } from './types'

interface SourceLine extends Evidence {
  callId: string
  timestamp?: string
}

interface Rule {
  id: string
  title: string
  severity: Severity
  pattern: RegExp
  detail: string
  recommendation?: string
  suppressOnSuccess?: boolean
}

const RULES: Rule[] = [
  { id: 'PBX-001', title: 'Dialed extension was not found', severity: 'root-cause', pattern: /extension ['“]?[^'”]+['”]?.*(?:not found|does not exist)|invalid extension|no such extension/i, detail: 'The dialplan could not resolve the requested extension.', recommendation: 'Review the extension and dialplan with: asterisk -rx "dialplan show <extension>@<context>"' },
  { id: 'PBX-002', title: 'No matching dialplan route', severity: 'root-cause', pattern: /sent to invalid extension|no matching extension|failed to find extension/i, detail: 'Asterisk reported that no dialplan route matched this call.', recommendation: 'Inspect the relevant context with: asterisk -rx "dialplan show <context>"' },
  { id: 'PBX-003', title: 'Endpoint is unavailable', severity: 'error', pattern: /(?:endpoint|peer|contact).*?(?:unavailable|unreachable)|everyone is busy\/congested.*CHANUNAVAIL|DIALSTATUS=CHANUNAVAIL/i, detail: 'The selected call contains explicit endpoint availability failure evidence.', recommendation: 'Check current endpoint state with: asterisk -rx "pjsip show endpoints"', suppressOnSuccess: true },
  { id: 'PBX-004', title: 'Call was rejected as busy', severity: 'warning', pattern: /(?:cause|status).*busy|busy here|DIALSTATUS=BUSY|everyone is busy\/congested.*BUSY/i, detail: 'The destination returned an explicit busy condition.', recommendation: 'Confirm destination state and forwarding policy.', suppressOnSuccess: true },
  { id: 'PBX-005', title: 'Call was not answered', severity: 'warning', pattern: /DIALSTATUS=NOANSWER|no answer from|user alerting, no answer/i, detail: 'Asterisk recorded a no-answer outcome.', recommendation: 'Verify ring duration, forwarding, and endpoint availability.', suppressOnSuccess: true },
  { id: 'PBX-006', title: 'Network or channel congestion', severity: 'error', pattern: /DIALSTATUS=CONGESTION|circuit-channel congestion|network out of order/i, detail: 'The call encountered an explicit congestion condition.', recommendation: 'Review trunk capacity and carrier responses.', suppressOnSuccess: true },
  { id: 'PBX-007', title: 'SIP authentication failed', severity: 'root-cause', pattern: /failed to authenticate|authentication failed|wrong password|401 unauthorized|403 forbidden/i, detail: 'The log explicitly reports a SIP authentication or authorization failure.', recommendation: 'Review endpoint or trunk credentials; do not paste secrets into diagnostic output.' },
  { id: 'PBX-008', title: 'Registration failed', severity: 'error', pattern: /registration.*(?:failed|rejected|timeout)|failed to register/i, detail: 'The log reports a failed SIP registration associated with this Call ID.', recommendation: 'Check registration status with: asterisk -rx "pjsip show registrations"' },
  { id: 'PBX-009', title: 'Codec negotiation failed', severity: 'root-cause', pattern: /no compatible codecs|no joint capabilities|codec negotiation failed|bearer capability not available/i, detail: 'The call failed because the participants did not negotiate a compatible codec.', recommendation: 'Compare endpoint and trunk codec allow-lists.' },
  { id: 'PBX-010', title: 'RTP inactivity timeout', severity: 'error', pattern: /rtp.*(?:timeout|inactiv)|disconnecting channel.*lack of rtp/i, detail: 'Asterisk ended or warned about the call after explicit RTP inactivity.', recommendation: 'Inspect RTP settings and firewall paths; suggested command: asterisk -rx "rtp show settings"' },
  { id: 'PBX-011', title: 'Possible one-way audio indicator', severity: 'warning', pattern: /strict rtp.*(?:switch|learn)|one.way audio|received rtp.*(?:unknown|unexpected) source/i, detail: 'The log contains an RTP source or learning indicator that can accompany one-way audio, but does not prove it.', recommendation: 'Capture a controlled call and compare both RTP directions.' },
  { id: 'PBX-012', title: 'DTMF handling problem', severity: 'warning', pattern: /dtmf.*(?:failed|mismatch|unsupported|timeout)|unable to process.*dtmf/i, detail: 'The log explicitly reports a DTMF handling problem.', recommendation: 'Compare endpoint, trunk, and PBX DTMF modes.' },
  { id: 'PBX-013', title: 'Call ended unexpectedly', severity: 'error', pattern: /unexpected hangup|connection reset by peer|remote host closed connection|lost connection/i, detail: 'The channel ended with an explicit unexpected-disconnection indicator.', recommendation: 'Correlate the disconnect line with SIP signaling and transport health.' },
  { id: 'PBX-014', title: 'Normal call clearing observed', severity: 'observed', pattern: /normal clearing|cause (?:code )?16\b|hangupcause=16/i, detail: 'The call ended with an explicit normal-clearing cause.' },
  { id: 'PBX-015', title: 'Call was answered', severity: 'observed', pattern: /\banswered\b|DIALSTATUS=ANSWER|answered .* channel/i, detail: 'The log explicitly records an answered call.' },
  { id: 'PBX-016', title: 'Channels joined a bridge', severity: 'observed', pattern: /joined ['“]?.*bridge|channel .* entered.*bridge|bridg(?:e|ed) call/i, detail: 'The log explicitly records bridge participation.' },
]

const SUCCESS_PATTERN = /\banswered\b|DIALSTATUS=ANSWER|joined ['“]?.*bridge|entered.*bridge|bridg(?:e|ed) call/i

function extractCallId(text: string): string | undefined {
  const bracketed = text.match(/\[(C-[0-9a-f]+)\]/i)
  return bracketed?.[1]
}

function extractTimestamp(text: string): string | undefined {
  return text.match(/^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?/)?.[1]
}

function eventFor(line: SourceLine): TimelineEvent {
  const match = RULES.find((rule) => rule.pattern.test(line.text))
  const channel = line.text.match(/(?:PJSIP|SIP|Local|DAHDI|IAX2)\/[\w@.+:-]+(?:-[\w]+)?/i)?.[0]
  return {
    id: `${line.callId}-${line.lineNumber}`,
    timestamp: line.timestamp,
    kind: match?.title ?? (channel ? 'Channel activity' : 'PBX log event'),
    summary: match?.detail ?? 'A correlated log event was recorded for this Call ID.',
    severity: match?.severity ?? 'observed',
    evidence: { lineNumber: line.lineNumber, text: line.text },
  }
}

function findingsFor(lines: SourceLine[]): Finding[] {
  return RULES.flatMap((rule): Finding[] => {
    const matchedLines = lines.filter((line) => rule.pattern.test(line.text))
    const evidence = matchedLines.map(({ lineNumber, text }) => ({ lineNumber, text }))
    const laterSuccess = rule.suppressOnSuccess && matchedLines.length > 0 && lines.some((line) => line.lineNumber > matchedLines[0].lineNumber && SUCCESS_PATTERN.test(line.text))
    if (!evidence.length || laterSuccess) return []
    return [{ ruleId: rule.id, title: rule.title, detail: rule.detail, severity: rule.severity, evidence, recommendation: rule.recommendation }]
  })
}

function cannotConfirmFor(lines: SourceLine[], findings: Finding[]): string[] {
  const text = lines.map((line) => line.text).join('\n')
  const items = [
    'The physical network, firewall, NAT, and packet path outside this log',
    'Current PBX, endpoint, trunk, or carrier state after the log was created',
    'What either caller actually heard, including subjective audio quality',
  ]
  if (!/rtp|audio|codec/i.test(text)) items.push('Media flow or codec behavior because this call has no media-specific evidence')
  if (!/sip\/2\.0|invite|response|request/i.test(text)) items.push('The complete SIP exchange because this call has no explicit SIP-message evidence')
  if (!findings.some((finding) => finding.severity === 'root-cause')) items.push('A definitive root cause; the available evidence supports observations or symptoms only')
  return items
}

function makeCall(callId: string, lines: SourceLine[]): AnalyzedCall {
  const channels = [...new Set(lines.flatMap((line) => line.text.match(/(?:PJSIP|SIP|Local|DAHDI|IAX2)\/[\w@.+:-]+(?:-[\w]+)?/gi) ?? []))]
  const extension = lines.map((line) => line.text.match(/extension ['“]?([\w*#+-]+)/i)?.[1]).find(Boolean)
  const findings = findingsFor(lines)
  return {
    callId,
    label: extension ? `Extension ${extension}` : channels[0] ?? 'PBX call',
    firstLine: lines[0].lineNumber,
    lastLine: lines.at(-1)?.lineNumber ?? lines[0].lineNumber,
    channels,
    events: lines.map(eventFor),
    findings,
    cannotConfirm: cannotConfirmFor(lines, findings),
  }
}

export function analyzeLog(contents: string, fileName = 'PBX log'): AnalysisResult {
  const physicalLines = contents.split(/\r?\n/)
  const groups = new Map<string, SourceLine[]>()
  let ignoredLines = 0
  physicalLines.forEach((text, index) => {
    const callId = extractCallId(text)
    if (!callId) {
      if (text.trim()) ignoredLines += 1
      return
    }
    const lines = groups.get(callId) ?? []
    lines.push({ callId, lineNumber: index + 1, text, timestamp: extractTimestamp(text) })
    groups.set(callId, lines)
  })
  return {
    fileName,
    totalLines: physicalLines.length,
    ignoredLines,
    calls: [...groups.entries()].map(([callId, lines]) => makeCall(callId, lines)).sort((a, b) => a.firstLine - b.firstLine),
  }
}

export const deterministicRules = RULES.map(({ id, title, detail }) => ({ id, title, detail }))
