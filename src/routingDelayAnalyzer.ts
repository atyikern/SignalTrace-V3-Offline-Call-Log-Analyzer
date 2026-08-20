import { parseIvrTimestamp } from './ivrAnalyzer'
import type { AgentRoutingEvent, RoutingDelayAnalysis, RoutingDelayAttempt, RoutingDelayResponse, RoutingDelayStatus } from './types'

type RoutingRow = {
  line: string
  lineNumber: number
}

const SHELL_NOISE =
  /^(?:sh-[\d.]+\$|>|\s*(?:sudo\s+(?:grep|more)|cd\s+\/opt\/ocapp\/|log\.log(?:\.\d{4}-\d{2}-\d{2})?))/i

export function normalizeRoutingDelayRecords(text: string): string[] {
  return text
    .split(/\r?\n|(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})/)
    .map((row) => row.trim())
    .filter((row) => row && !SHELL_NOISE.test(row))
}

export function isRoutingDelayLog(records: string[]): boolean {
  return records.some(
    (record) =>
      /RoutingEntry_\d+/i.test(record) &&
      /\bGETAVAILAGT(?:_RSP)?\b/i.test(record),
  )
}

function boolFromPipe(value?: string): boolean | undefined {
  if (value === undefined) return undefined
  if (/^true$/i.test(value)) return true
  if (/^false$/i.test(value)) return false
  return undefined
}

function parseCustomerNumber(line: string): string | undefined {
  const sessionCustomer = line.match(/\[WS_[^\]]*#(\d{7,15})#/i)?.[1]
  if (sessionCustomer) return sessionCustomer

  const requestCustomer = line.match(
    /\bGETAVAILAGT\|[^\r\n]*?\|(\d{7,15})\|(?:true|false)\|(?:true|false)\|/i,
  )?.[1]
  if (requestCustomer) return requestCustomer

  return line.match(/\b(\d{9,15})\b/g)?.at(-1)
}

function parseWebSocketSession(line: string): string | undefined {
  return line.match(/\[(WS_[^\]]+)\]/i)?.[1]
}

function parseRoutingEntryId(line: string): string | undefined {
  return line.match(/(RoutingEntry_\d+)/i)?.[1]
}

function parseRequest(line: string):
  | {
      routingEntryId?: string
      timestamp?: string
      timestampMs?: number
    }
  | undefined {
  if (!/\bGETAVAILAGT\|/i.test(line) || /GETAVAILAGT_RSP/i.test(line)) {
    return undefined
  }

  const parsed = parseIvrTimestamp(line)
  return {
    routingEntryId: parseRoutingEntryId(line),
    timestamp: parsed?.timestamp,
    timestampMs: parsed?.timestampMs,
  }
}

function parseTextResponse(line: string): RoutingDelayResponse | undefined {
  const response = line.match(
    /received\s*GETAVAILAGT_RSP\s+with\s+agent\s+ID:\s*(-?\d+)/i,
  )
  if (!response) return undefined

  const parsed = parseIvrTimestamp(line)

  const readBoolean = (label: string): boolean | undefined => {
    const match = line.match(
      new RegExp(`${label}(?: Result)?\\s*[:=]\\s*(true|false)`, 'i'),
    )
    return match ? match[1].toLowerCase() === 'true' : undefined
  }

  return {
    responseId: Number(response[1]),
    timestamp: parsed?.timestamp,
    timestampMs: parsed?.timestampMs,
    preferredLanguage: readBoolean('Preferred Language'),
    defaultLanguage: readBoolean('Default Language'),
    preferredProduct: readBoolean('Preferred Product'),
    defaultProduct: readBoolean('Default Product'),
    routingEntryId: parseRoutingEntryId(line),
  }
}

function parsePipeResponse(line: string): RoutingDelayResponse | undefined {
  const response = line.match(
    /GETAVAILAGT_RSP\|(-?\d+)\|(true|false)\|(true|false)\|(true|false)\|(true|false)/i,
  )
  if (!response) return undefined

  const parsed = parseIvrTimestamp(line)

  return {
    responseId: Number(response[1]),
    timestamp: parsed?.timestamp,
    timestampMs: parsed?.timestampMs,
    preferredLanguage: boolFromPipe(response[2]),
    defaultLanguage: boolFromPipe(response[3]),
    preferredProduct: boolFromPipe(response[4]),
    defaultProduct: boolFromPipe(response[5]),
    routingEntryId: parseRoutingEntryId(line),
  }
}

function parseResponse(line: string): RoutingDelayResponse | undefined {
  return parseTextResponse(line) ?? parsePipeResponse(line)
}

function mean(values: number[]): number | undefined {
  if (!values.length) return undefined
  return values.reduce((total, value) => total + value, 0) / values.length
}

function min(values: number[]): number | undefined {
  return values.length ? Math.min(...values) : undefined
}

function max(values: number[]): number | undefined {
  return values.length ? Math.max(...values) : undefined
}

function mostFrequent(values: number[]): number | undefined {
  if (!values.length) return undefined

  const counts = new Map<number, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0]
}

function classifyDelay(totalRoutingWaitMs?: number): RoutingDelayStatus {
  if (totalRoutingWaitMs === undefined) return 'Incomplete'
  if (totalRoutingWaitMs < 10_000) return 'Normal'
  if (totalRoutingWaitMs < 30_000) return 'Minor Routing Wait'
  if (totalRoutingWaitMs < 60_000) return 'Routing Delay'
  return 'Extended Routing Delay'
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return 'unknown duration'
  if (ms < 1000) return `${Math.round(ms)} ms`

  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes
    ? `${minutes}m ${seconds}s`
    : `${totalSeconds}s`
}

function buildFinding(
  status: RoutingDelayStatus,
  lookupAttempts: number,
  totalRoutingWaitMs?: number,
  averageRetryIntervalMs?: number,
  averageResponseLatencyMs?: number,
  repeatedResponseId?: number,
  finalResponseId?: number,
): string {
  if (status === 'Incomplete') {
    return 'Routing activity was detected, but the available log range was not sufficient to calculate the full routing wait.'
  }

  const retryText =
    averageRetryIntervalMs !== undefined
      ? ` at an average retry interval of ${formatDuration(averageRetryIntervalMs)}`
      : ''

  const latencyText =
    averageResponseLatencyMs !== undefined
      ? ` Individual GETAVAILAGT responses averaged ${formatDuration(averageResponseLatencyMs)}.`
      : ''

  const responseText =
    repeatedResponseId !== undefined && finalResponseId !== undefined
      ? ` The repeated response ID was ${repeatedResponseId} and the final response ID was ${finalResponseId}.`
      : ''

  return `${status} detected. The routing flow remained in available-agent checking for ${formatDuration(totalRoutingWaitMs)} across ${lookupAttempts} GETAVAILAGT attempt${lookupAttempts === 1 ? '' : 's'}${retryText}.${latencyText}${responseText}`
}

function buildRootCauseAssessment(
  status: RoutingDelayStatus,
  totalRoutingWaitMs?: number,
  averageResponseLatencyMs?: number,
  responseStateChanged = false,
): string {
  if (status === 'Incomplete') {
    return 'The log confirms routing activity but does not contain enough request/response evidence to determine the complete routing-delay pattern.'
  }

  if (
    totalRoutingWaitMs !== undefined &&
    totalRoutingWaitMs >= 30_000 &&
    averageResponseLatencyMs !== undefined &&
    averageResponseLatencyMs < 1_000
  ) {
    return responseStateChanged
      ? 'The observed delay accumulated while the transaction repeatedly remained in the GETAVAILAGT routing loop. Individual CallFront request/response exchanges were comparatively fast, and the routing response state changed later in the sequence. The analyzer does not assign semantic meaning to the numeric response IDs.'
      : 'The observed delay accumulated while the transaction repeatedly remained in the GETAVAILAGT routing loop. Individual CallFront request/response exchanges were comparatively fast. The analyzer does not assign semantic meaning to the numeric response IDs.'
  }

  return 'Routing delay was measured from the GETAVAILAGT request/response sequence. Review the evidence timeline to determine whether the wait came from repeated routing attempts, slow responses, connection interruptions, or incomplete logs.'
}

export function analyzeRoutingDelay(text: string): RoutingDelayAnalysis[] {
  const records = normalizeRoutingDelayRecords(text)
  if (!isRoutingDelayLog(records)) return []

  const rows: RoutingRow[] = records.map((line, index) => ({
    line,
    lineNumber: index + 1,
  }))

  const sessionCounts = new Map<string, number>()
  for (const { line } of rows) {
    const session = parseWebSocketSession(line)
    if (session) {
      sessionCounts.set(session, (sessionCounts.get(session) ?? 0) + 1)
    }
  }

  const sessions = [...sessionCounts.keys()]
  const grouped = new Map<string, RoutingRow[]>()

  if (sessions.length) {
    for (const session of sessions) grouped.set(session, [])

    for (const row of rows) {
      const session = parseWebSocketSession(row.line)
      if (session && grouped.has(session)) {
        grouped.get(session)!.push(row)
      }
    }
  } else {
    grouped.set('routing-delay', rows)
  }

  const analyses: RoutingDelayAnalysis[] = []

  for (const [sessionKey, scopedRows] of grouped.entries()) {
    if (!scopedRows.length) continue

    const customerNumber =
      scopedRows.map((row) => parseCustomerNumber(row.line)).find(Boolean) ??
      (sessionKey !== 'routing-delay'
        ? sessionKey.match(/#(\d{7,15})#/)?.[1]
        : undefined)

    const webSocketSession =
      sessionKey !== 'routing-delay' ? sessionKey : undefined

    const attempts: RoutingDelayAttempt[] = []
    const responses: RoutingDelayResponse[] = []
    const events: AgentRoutingEvent[] = []
    const routingEntryIds = new Set<string>()
    let disconnectionCount = 0

    for (const { line } of scopedRows) {
      const request = parseRequest(line)
      if (request) {
        if (request.routingEntryId) routingEntryIds.add(request.routingEntryId)

        attempts.push({
          routingEntryId: request.routingEntryId,
          timestamp: request.timestamp,
          timestampMs: request.timestampMs,
        })

        events.push({
          timestamp: request.timestamp,
          timestampMs: request.timestampMs,
          type: 'AGENT_SEARCH',
          label:
            attempts.length === 1
              ? 'Available-agent search requested'
              : 'Available-agent search retried',
        })
      }

      const response = parseResponse(line)
      if (response) {
        if (response.routingEntryId) routingEntryIds.add(response.routingEntryId)

        const exactAttempt =
          response.routingEntryId !== undefined
            ? [...attempts]
                .reverse()
                .find(
                  (attempt) =>
                    attempt.routingEntryId === response.routingEntryId &&
                    !attempt.response,
                )
            : undefined

        const fallbackAttempt = [...attempts]
          .reverse()
          .find((attempt) => !attempt.response)

        const attempt = exactAttempt ?? fallbackAttempt

        if (
          attempt?.timestampMs !== undefined &&
          response.timestampMs !== undefined
        ) {
          response.latencyMs = Math.max(
            0,
            response.timestampMs - attempt.timestampMs,
          )
        }

        if (attempt) attempt.response = response

        responses.push(response)

        events.push({
          timestamp: response.timestamp,
          timestampMs: response.timestampMs,
          type: 'AGENT_RESPONSE',
          label: `GETAVAILAGT response ID ${response.responseId}`,
        })
      }

      if (
        /disconnected\(\),\s*IVR client was disconnected from callfront server,\s*reconnecting/i.test(
          line,
        )
      ) {
        const parsed = parseIvrTimestamp(line)
        disconnectionCount += 1

        events.push({
          timestamp: parsed?.timestamp,
          timestampMs: parsed?.timestampMs,
          type: 'CONNECTION_INTERRUPTED',
          label: 'CallFront connection interrupted; reconnecting',
        })
      }
    }

    events.sort(
      (a, b) =>
        (a.timestampMs ?? Number.MAX_SAFE_INTEGER) -
        (b.timestampMs ?? Number.MAX_SAFE_INTEGER),
    )

    const requestTimes = attempts
      .map((attempt) => attempt.timestampMs)
      .filter((value): value is number => value !== undefined)

    const retryIntervals = requestTimes
      .slice(1)
      .map((timestamp, index) => timestamp - requestTimes[index])
      .filter((value) => value >= 0)

    const responseLatencies = responses
      .map((response) => response.latencyMs)
      .filter((value): value is number => value !== undefined)

    const firstRequest = attempts.find(
      (attempt) => attempt.timestampMs !== undefined,
    )
    const finalResponse = [...responses]
      .reverse()
      .find((response) => response.timestampMs !== undefined)

    const totalRoutingWaitMs =
      firstRequest?.timestampMs !== undefined &&
      finalResponse?.timestampMs !== undefined
        ? Math.max(0, finalResponse.timestampMs - firstRequest.timestampMs)
        : undefined

    const responseIds = responses.map((response) => response.responseId)
    const finalResponseId = responseIds.at(-1)
    const repeatedResponseId =
      responseIds.length > 1
        ? mostFrequent(responseIds.slice(0, -1))
        : responseIds[0]

    const responseStateChanged =
      responseIds.length > 1 &&
      new Set(responseIds).size > 1

    const averageRetryIntervalMs = mean(retryIntervals)
    const averageResponseLatencyMs = mean(responseLatencies)
    const status = classifyDelay(totalRoutingWaitMs)

    const finding = buildFinding(
      status,
      attempts.length,
      totalRoutingWaitMs,
      averageRetryIntervalMs,
      averageResponseLatencyMs,
      repeatedResponseId,
      finalResponseId,
    )

    const rootCauseAssessment = buildRootCauseAssessment(
      status,
      totalRoutingWaitMs,
      averageResponseLatencyMs,
      responseStateChanged,
    )

    analyses.push({
      customerNumber,
      webSocketSession,

      routingStart: firstRequest?.timestamp,
      routingEnd: finalResponse?.timestamp,
      totalRoutingWaitMs,

      lookupAttempts: attempts.length,

      averageRetryIntervalMs,
      minimumRetryIntervalMs: min(retryIntervals),
      maximumRetryIntervalMs: max(retryIntervals),

      averageResponseLatencyMs,
      minimumResponseLatencyMs: min(responseLatencies),
      maximumResponseLatencyMs: max(responseLatencies),

      repeatedResponseId,
      finalResponseId,
      responseStateChanged,

      routingEntryIds: [...routingEntryIds],
      disconnectionCount,

      status,
      finding,
      rootCauseAssessment,

      attempts,
      responses,
      events,
    })
  }

  return analyses.sort(
    (a, b) =>
      (b.totalRoutingWaitMs ?? -1) - (a.totalRoutingWaitMs ?? -1),
  )
}
