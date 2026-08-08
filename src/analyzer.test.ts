import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeLog, DEFAULT_GROUPING_WINDOW_MS, networkIndicatorRules } from './analyzer'

const fixture = readFileSync(new URL('./test/fixtures/agent-network.log', import.meta.url), 'utf8')

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
})
