import { describe, expect, it } from 'vitest'
import { analyzeLog, DEFAULT_GROUPING_WINDOW_MS, networkIndicatorRules, parseSocketIoMetadata } from './analyzer'
import fixture from './test/fixtures/agent-network.log?raw'
import socketIoFixture from './test/fixtures/socketio-efv.log?raw'

describe('analyzeLog', () => {
  it('recognizes every approved severity indicator', () => {
    expect(networkIndicatorRules.filter((rule) => rule.severity === 'critical').map((rule) => rule.label)).toEqual([
      'ECONNRESET', 'EFV DESTROY', 'Unreachable', 'Connection reset',
    ])
    expect(networkIndicatorRules.filter((rule) => rule.severity === 'important').map((rule) => rule.label)).toEqual([
      'Broken pipe', 'WebSocket disconnect/error', 'Timeout', 'Connection refused', 'Transport error',
    ])
    expect(networkIndicatorRules.filter((rule) => rule.severity === 'media-quality').map((rule) => rule.label)).toEqual([
      'RTP packet loss', 'Lost packets', 'Jitter', 'RTP timeout', 'Media timeout',
    ])
  })

  it('extracts Agent metadata and separates multiple Agents', () => {
    const result = analyzeLog(fixture, 'agent-network.log')
    expect(result.agents).toHaveLength(2)
    expect(result.agents[1]).toMatchObject({ agent: 'kumaresan', agentId: '604', extension: '8041' })
    expect(result.agents[0]).toMatchObject({ agent: 'amina', agentId: '605', extension: '8042' })
  })

  it('sorts all problem times and groups indicators within the configured window', () => {
    const agent = analyzeLog(fixture).agents.find((item) => item.agent === 'kumaresan')!
    expect(DEFAULT_GROUPING_WINDOW_MS).toBe(2_000)
    expect(agent.problemTimes.map((problem) => problem.displayTime)).toEqual(['09:49:23', '10:43:35', '14:51:49'])
    expect(agent.problemTimes[0].indicators.map((indicator) => indicator.label)).toEqual(['ECONNRESET', 'EFV DESTROY'])
  })

  it('deduplicates identical indicators within one grouped problem time', () => {
    const agent = analyzeLog(fixture).agents.find((item) => item.agent === 'kumaresan')!
    expect(agent.problemTimes[0].indicators.filter((indicator) => indicator.label === 'EFV DESTROY')).toHaveLength(1)
  })

  it('retains source references internally for diagnostics', () => {
    const agent = analyzeLog(fixture).agents.find((item) => item.agent === 'kumaresan')!
    expect(agent.problemTimes[0].indicators[0].source).toMatchObject({ lineNumber: 5, text: expect.stringContaining('ECONNRESET') })
  })

  it('uses singular and multiple-event summaries appropriately', () => {
    const result = analyzeLog(fixture)
    const single = result.agents.find((item) => item.agent === 'amina')!
    const multiple = result.agents.find((item) => item.agent === 'kumaresan')!
    expect(single.finding).toBe('A network disconnection event was detected for this agent.')
    expect(multiple.finding).toBe('Multiple network disconnection events were detected for this agent during the reviewed period.')
    expect(multiple.networkStatus).toBe('High network instability detected')
  })

  it('allows a narrower grouping window', () => {
    const agent = analyzeLog(fixture, 'agent-network.log', 500).agents.find((item) => item.agent === 'kumaresan')!
    expect(agent.problemTimes.map((problem) => problem.displayTime)).toEqual(['09:49:23', '09:49:24', '10:43:35', '14:51:49'])
  })

  it('extracts named and multi-word Agents plus SocketIO session IDs', () => {
    expect(parseSocketIoMetadata('2026-04-03 09:49:23 - info: [io: 8OgkXo6Sd6HP3VqSAFaH <<== efv: undefined ] [ kumaresan ] EFV ERROR : Error: read ECONNRESET')).toEqual({
      agent: 'kumaresan', sessionId: '8OgkXo6Sd6HP3VqSAFaH',
    })
    expect(parseSocketIoMetadata('[io: sessionCCC <<== efv: undefined ] [ Paul Arshan ] EFV DESTROY')).toEqual({
      agent: 'Paul Arshan', sessionId: 'sessionCCC',
    })
    expect(parseSocketIoMetadata('[io: orphan <<== efv: undefined ] [ undefined ] EFV ERROR')).toEqual({
      agent: undefined, sessionId: 'orphan',
    })
  })

  it('analyzes real-shaped SocketIO / EFV entries by Agent and timestamp', () => {
    const result = analyzeLog(socketIoFixture, 'socketio-efv.log')
    expect(result.agents.map((agent) => agent.agent)).toEqual(['kumaresan', 'Paul Arshan', 'Zuhair'])
    const kumaresan = result.agents[0]
    expect(kumaresan.problemTimes.map((problem) => problem.displayTime)).toEqual(['09:49:23', '10:43:35', '14:51:49'])
    expect(kumaresan.problemTimes.map((problem) => problem.indicators.map((indicator) => indicator.label))).toEqual([
      ['ECONNRESET', 'EFV DESTROY'],
      ['ECONNRESET', 'EFV DESTROY'],
      ['ECONNRESET', 'EFV DESTROY'],
    ])
    expect(result.agents[1].problemTimes[0].displayTime).toBe('13:35:42')
    expect(result.agents[2].problemTimes[0].displayTime).toBe('07:07:48')
  })

  it('associates an undefined Agent only through an exact matching session ID', () => {
    const result = analyzeLog(socketIoFixture)
    expect(result.agents.some((agent) => agent.agent.toLowerCase() === 'undefined')).toBe(false)
    const kumaresan = result.agents.find((agent) => agent.agent === 'kumaresan')!
    const grouped = kumaresan.problemTimes.find((problem) => problem.displayTime === '14:51:49')!
    expect(grouped.indicators.map((indicator) => indicator.label)).toEqual(['ECONNRESET', 'EFV DESTROY'])
    expect(grouped.indicators.every((indicator) => indicator.sessionId === 'sessionEEE')).toBe(true)
    expect(kumaresan.problemTimes.some((problem) => problem.displayTime === '16:00:00')).toBe(false)
  })

  it.each([
    ['econnreset', 'ECONNRESET'], ['efv destroy', 'EFV DESTROY'], ['unreachable', 'Unreachable'],
    ['broken pipe', 'Broken pipe'], ['websocket error', 'WebSocket disconnect/error'], ['timed out', 'Timeout'],
    ['connection refused', 'Connection refused'], ['connection reset', 'Connection reset'], ['transport error', 'Transport error'],
    ['rtp packet loss', 'RTP packet loss'], ['lost packets', 'Lost packets'], ['jitter', 'Jitter'],
    ['rtp timeout', 'RTP timeout'], ['media timeout', 'Media timeout'],
  ])('matches %s case-insensitively', (input, expected) => {
    const log = `2026-04-03 01:02:03 - info: [io: session <<== efv: ok ] [ Example Agent ] EFV ERROR : ${input.toUpperCase()}`
    expect(analyzeLog(log).agents[0].problemTimes[0].indicators.map((indicator) => indicator.label)).toContain(expected)
  })
})
