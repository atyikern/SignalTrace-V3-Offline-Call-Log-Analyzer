import type { ExtensionNetworkAnalysis, ExtensionNetworkStatus, ExtensionProblemTime, PjsipRttEvent, ReachabilityStatus, RttClassification } from './types'

export const RTT_WARNING_MS = 100
export const RTT_HIGH_MS = 200
export const RTT_CRITICAL_MS = 500
export const RTT_BASELINE_WINDOW = 3
export const RTT_SPIKE_MULTIPLIER = 2
export const RTT_SPIKE_MIN_DELTA_MS = 50

const ASTERISK_TIMESTAMP_START = /(?=\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\])/g

export function normalizeLogRecords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(ASTERISK_TIMESTAMP_START))
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseTimestamp(line: string): { timestamp: string; epochMs: number } | undefined {
  const timestamp = line.match(/(?:^|\[|\s)(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?|\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)(?:\]|\s|$)/)?.[1]
  if (!timestamp) return undefined
  const normalized = timestamp.includes('-') ? timestamp.replace(' ', 'T') : `1970-01-01T${timestamp}`
  const epochMs = Date.parse(normalized)
  return Number.isNaN(epochMs) ? undefined : { timestamp, epochMs }
}

export function classifyRtt(rtt: number, status: ReachabilityStatus = 'Reachable'): RttClassification {
  if (status === 'Unreachable') return 'Unreachable'
  if (rtt >= RTT_CRITICAL_MS) return 'Critical'
  if (rtt >= RTT_HIGH_MS) return 'High'
  if (rtt >= RTT_WARNING_MS) return 'Warning'
  return 'Good'
}

export function parsePjsipRttEvent(line: string, lineNumber = 1): PjsipRttEvent | undefined {
  if (!/res_pjsip\/pjsip_options\.c/i.test(line)) return undefined
  const timestamp = parseTimestamp(line)
  const contact = line.match(/Contact\s+([^\s/]+)\/sip:([^@\s]+)@([^:;\s]+):(\d+)(.*?)(?:\s+is now\s+)/i)
  const statusMatch = line.match(/is now\s+(Reachable|Unreachable)\b/i)
  const rttMatch = line.match(/RTT:\s*(\d+(?:\.\d+)?)\s*msec/i)
  const transport = line.match(/(?:^|;)transport=([^;\s]+)/i)?.[1]
  if (!timestamp || !contact || !statusMatch || !rttMatch || !transport) return undefined
  const status = `${statusMatch[1][0].toUpperCase()}${statusMatch[1].slice(1).toLowerCase()}` as ReachabilityStatus
  const rtt = Number(rttMatch[1])
  const extension = contact[1]
  const ipAddress = contact[3]
  const port = contact[4]
  return {
    extension,
    status,
    rtt,
    rttClassification: classifyRtt(rtt, status),
    timestamp: timestamp.timestamp,
    epochMs: timestamp.epochMs,
    ipAddress,
    port,
    transport: transport.toLowerCase(),
    contactId: `${extension}|${contact[2]}|${ipAddress}|${port}|${transport.toLowerCase()}`,
    source: { lineNumber, text: line },
  }
}

function formatRtt(rtt: number): string {
  return rtt.toFixed(3)
}

export function detectRttSpike(rtt: number, recentReachableRtts: number[]): boolean {
  if (rtt >= RTT_WARNING_MS) return true
  if (!recentReachableRtts.length) return false
  const window = recentReachableRtts.slice(-RTT_BASELINE_WINDOW)
  const baseline = window.reduce((sum, value) => sum + value, 0) / window.length
  return rtt - baseline >= RTT_SPIKE_MIN_DELTA_MS && rtt >= baseline * RTT_SPIKE_MULTIPLIER
}

function displayTime(timestamp: string): string {
  return timestamp.match(/(\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?$/)?.[1] ?? timestamp
}

export function analyzeExtensionNetwork(inputEvents: PjsipRttEvent[]): ExtensionNetworkAnalysis {
  const events = [...inputEvents].sort((a, b) => a.epochMs - b.epochMs)
  if (!events.length) throw new Error('Cannot analyze an extension without PJSIP events')
  const pendingOutages = new Map<string, PjsipRttEvent>()
  const reachableRtts: number[] = []
  const outageDurations: number[] = []
  const problemTimes: ExtensionProblemTime[] = []
  let recoveries = 0
  let rttSpikes = 0

  for (const event of events) {
    const items: string[] = []
    if (event.status === 'Unreachable') {
      pendingOutages.set(event.contactId, event)
      items.push('Unreachable')
    } else {
      const outage = pendingOutages.get(event.contactId)
      const spike = detectRttSpike(event.rtt, reachableRtts)
      let recoveryDuration: number | undefined
      if (outage) {
        const duration = Math.max(0, Math.round((event.epochMs - outage.epochMs) / 1000))
        outageDurations.push(duration)
        recoveries += 1
        pendingOutages.delete(event.contactId)
        recoveryDuration = duration
        items.push('Reachable')
      }
      if (outage && event.rttClassification === 'Good') items.push(`RTT ${formatRtt(event.rtt)} ms`)
      if (event.rttClassification === 'Warning') items.push(`RTT Warning: ${formatRtt(event.rtt)} ms`)
      if (event.rttClassification === 'High') items.push(`High RTT: ${formatRtt(event.rtt)} ms`)
      if (event.rttClassification === 'Critical') items.push(`Critical RTT: ${formatRtt(event.rtt)} ms`)
      if (spike) { items.push('RTT Spike'); rttSpikes += 1 }
      if (recoveryDuration !== undefined) items.push(`Recovered after ${recoveryDuration} sec`)
      reachableRtts.push(event.rtt)
    }
    if (items.length) problemTimes.push({ timestamp: event.timestamp, displayTime: displayTime(event.timestamp), items: [...new Set(items)] })
  }

  const unreachableEvents = events.filter((event) => event.status === 'Unreachable').length
  const currentStatus: ReachabilityStatus = pendingOutages.size ? 'Unreachable' : events.at(-1)!.status
  const highestRtt = reachableRtts.length ? Math.max(...reachableRtts) : undefined
  const averageRtt = reachableRtts.length ? reachableRtts.reduce((sum, value) => sum + value, 0) / reachableRtts.length : undefined
  const unstable = unreachableEvents >= 2 || (unreachableEvents > 0 && recoveries > 0 && events.length >= 3)
  let networkStatus: ExtensionNetworkStatus = 'Healthy'
  if (currentStatus === 'Unreachable') networkStatus = 'Unreachable'
  else if (unstable) networkStatus = 'Unstable'
  else if (highestRtt !== undefined && highestRtt >= RTT_HIGH_MS) networkStatus = 'High RTT'
  else if (highestRtt !== undefined && highestRtt >= RTT_WARNING_MS) networkStatus = 'RTT Warning'

  const extension = events[0].extension
  const finding = unstable
    ? 'Repeated Reachable / Unreachable transitions were detected for this extension.'
    : unreachableEvents
      ? 'An Unreachable event was detected for this extension.'
      : rttSpikes
        ? 'Sudden increase in network latency detected.'
        : 'PJSIP reachability remained healthy during the reviewed period.'
  return {
    extension,
    networkStatus,
    currentStatus,
    problemTimes,
    finding,
    possibleImpact: unreachableEvents
      ? 'The endpoint may experience intermittent connectivity, call signalling delay, registration instability, or call disruption.'
      : 'Delayed signalling, poor softphone responsiveness, call setup delay, audio instability, or temporary connectivity issues may occur.',
    conclusion: unstable
      ? 'Intermittent network connectivity detected.'
      : networkStatus === 'High RTT' || networkStatus === 'RTT Warning'
        ? `Network latency problems detected for Extension ${extension}.`
        : networkStatus === 'Unreachable'
          ? `Extension ${extension} is currently Unreachable in the latest log event.`
          : `No PJSIP network instability detected for Extension ${extension}.`,
    metrics: {
      unreachableEvents,
      recoveries,
      longestOutageSeconds: outageDurations.length ? Math.max(...outageDurations) : undefined,
      highestRtt,
      averageRtt,
      rttSpikes,
    },
    events,
  }
}

export function analyzePjsipNetworks(records: string[]): ExtensionNetworkAnalysis[] {
  const groups = new Map<string, PjsipRttEvent[]>()
  records.forEach((record, index) => {
    const event = parsePjsipRttEvent(record, index + 1)
    if (!event) return
    const events = groups.get(event.extension) ?? []
    events.push(event)
    groups.set(event.extension, events)
  })
  return [...groups.entries()]
    .map(([, events]) => analyzeExtensionNetwork(events))
    .sort((a, b) => a.extension.localeCompare(b.extension, undefined, { numeric: true }))
}
