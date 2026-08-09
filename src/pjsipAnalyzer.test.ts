import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeLog } from './analyzer'
import {
  analyzePjsipNetworks,
  classifyRtt,
  detectRttSpike,
  normalizeLogRecords,
  parsePjsipRttEvent,
  RTT_CRITICAL_MS,
  RTT_HIGH_MS,
  RTT_WARNING_MS,
} from './pjsipAnalyzer'

const rttFixture = readFileSync(new URL('./test/fixtures/pjsip-rtt.log', import.meta.url), 'utf8')
const highRttFixture = readFileSync(new URL('./test/fixtures/pjsip-high-rtt.log', import.meta.url), 'utf8')
const unreachable = '[2026-08-09 04:31:49] VERBOSE[1] res_pjsip/pjsip_options.c: Contact 23177011/sip:test1@175.144.16.141:62750;transport=ws is now Unreachable. RTT: 0.000 msec'
const reachable = '[2026-08-09 04:32:46] VERBOSE[2] res_pjsip/pjsip_options.c: Contact 23177011/sip:test1@175.144.16.141:62750;transport=ws is now Reachable. RTT: 116.253 msec'

describe('parsePjsipRttEvent', () => {
  it('extracts extension, status, RTT, timestamp, address, port, and transport', () => {
    expect(parsePjsipRttEvent(reachable)).toMatchObject({
      extension: '23177011', status: 'Reachable', rtt: 116.253,
      timestamp: '2026-08-09 04:32:46', ipAddress: '175.144.16.141', port: '62750', transport: 'ws',
    })
  })

  it('supports variable extension lengths and case-insensitive markers', () => {
    const event = parsePjsipRttEvent(reachable.replace('23177011', '8041').replace('Reachable', 'rEaChAbLe').replace('RTT:', 'rtt:'))
    expect(event).toMatchObject({ extension: '8041', status: 'Reachable' })
  })

  it('classifies Unreachable RTT 0 as Unreachable rather than Good', () => {
    expect(parsePjsipRttEvent(unreachable)).toMatchObject({ status: 'Unreachable', rtt: 0, rttClassification: 'Unreachable' })
  })
})

describe('RTT health and spike detection', () => {
  it('exports adjustable thresholds and classifies boundaries', () => {
    expect([RTT_WARNING_MS, RTT_HIGH_MS, RTT_CRITICAL_MS]).toEqual([100, 200, 500])
    expect(classifyRtt(99.999)).toBe('Good')
    expect(classifyRtt(100)).toBe('Warning')
    expect(classifyRtt(200)).toBe('High')
    expect(classifyRtt(500)).toBe('Critical')
  })

  it('detects threshold and rolling-baseline spikes without Unreachable zeros', () => {
    expect(detectRttSpike(116, [25, 39, 46])).toBe(true)
    expect(detectRttSpike(75, [20, 22, 24])).toBe(true)
    expect(detectRttSpike(30, [20, 22, 24])).toBe(false)
  })
})

describe('PJSIP network analysis', () => {
  it('calculates recoveries, outage durations, flapping, and metrics', () => {
    const extension = analyzeLog(rttFixture).extensions.find((item) => item.extension === '23177011')!
    expect(extension.networkStatus).toBe('Unstable')
    expect(extension.currentStatus).toBe('Reachable')
    expect(extension.problemTimes.map((problem) => problem.displayTime)).toEqual(['04:31:49', '04:32:46', '04:33:49', '04:34:49'])
    expect(extension.problemTimes[1].items).toEqual(['Reachable', 'RTT Warning: 116.253 ms', 'RTT Spike', 'Recovered after 57 sec'])
    expect(extension.problemTimes[3].items).toEqual(['Reachable', 'RTT 25.531 ms', 'Recovered after 60 sec'])
    expect(extension.metrics).toMatchObject({ unreachableEvents: 2, recoveries: 2, longestOutageSeconds: 60, highestRtt: 116.253, rttSpikes: 1 })
    expect(extension.finding).toContain('Repeated Reachable / Unreachable transitions')
    expect(extension.conclusion).toBe('Intermittent network connectivity detected.')
  })

  it('analyzes unrelated extensions independently', () => {
    const extensions = analyzeLog(rttFixture).extensions
    expect(extensions.map((item) => item.extension)).toEqual(['23177011', '23317006'])
    expect(extensions[1].networkStatus).toBe('Healthy')
    expect(extensions[1].metrics.unreachableEvents).toBe(0)
  })

  it('reports a high-RTT-only extension and excludes healthy times', () => {
    const extension = analyzeLog(highRttFixture).extensions[0]
    expect(extension).toMatchObject({ extension: '8041', networkStatus: 'High RTT', currentStatus: 'Reachable' })
    expect(extension.problemTimes).toEqual([{ timestamp: '2026-08-09 10:02:00', displayTime: '10:02:00', items: ['High RTT: 350.000 ms', 'RTT Spike'] }])
    expect(extension.finding).toBe('Sudden increase in network latency detected.')
  })

  it('does not match a recovery to a different contact', () => {
    const otherContact = reachable.replace('sip:test1', 'sip:test2')
    const extension = analyzePjsipNetworks([unreachable, otherContact])[0]
    expect(extension.metrics.recoveries).toBe(0)
    expect(extension.problemTimes[1].items).not.toContain('Recovered after 57 sec')
  })

  it('splits concatenated Asterisk records before parsing', () => {
    const records = normalizeLogRecords(`${reachable}${unreachable}`)
    expect(records).toHaveLength(2)
    expect(analyzePjsipNetworks(records)[0].events).toHaveLength(2)
  })
})
