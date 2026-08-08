import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeLog, deterministicRules } from './analyzer'

const fixture = readFileSync(new URL('./test/fixtures/multiple-calls.log', import.meta.url), 'utf8')

describe('analyzeLog', () => {
  it('publishes exactly sixteen deterministic rules', () => {
    expect(deterministicRules).toHaveLength(16)
    expect(new Set(deterministicRules.map((rule) => rule.id)).size).toBe(16)
  })

  it('separates calls using only exact Asterisk Call IDs', () => {
    const result = analyzeLog(fixture, 'multiple-calls.log')
    expect(result.calls.map((call) => call.callId)).toEqual(['C-000001a4', 'C-000001a5'])
    expect(result.ignoredLines).toBe(1)
    expect(result.calls[0].lastLine).toBe(3)
    expect(result.calls[1].firstLine).toBe(4)
  })

  it('retains exact physical line numbers and original source text', () => {
    const call = analyzeLog(fixture).calls[0]
    expect(call.events[2].evidence).toEqual({ lineNumber: 3, text: fixture.split('\n')[2] })
    expect(call.findings[0].evidence[0].lineNumber).toBe(3)
  })

  it('does not correlate lines based on timestamps or channel names', () => {
    const result = analyzeLog('[2026-01-01 10:00:00] PJSIP/100-0001 answered\n[2026-01-01 10:00:00] DIALSTATUS=BUSY')
    expect(result.calls).toEqual([])
    expect(result.ignoredLines).toBe(2)
  })

  it('suppresses an earlier contradictory failure after later success', () => {
    const result = analyzeLog('[2026-01-01 10:00:00][C-00000001] DIALSTATUS=NOANSWER\n[2026-01-01 10:00:03][C-00000001] PJSIP/200 answered PJSIP/100\n[2026-01-01 10:00:04][C-00000001] Channel PJSIP/200 joined bridge')
    expect(result.calls[0].findings.map((finding) => finding.ruleId)).not.toContain('PBX-005')
    expect(result.calls[0].findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining(['PBX-015', 'PBX-016']))
  })

  it('does not let an earlier success hide a later explicit failure', () => {
    const result = analyzeLog('[C-00000001] PJSIP/200 answered PJSIP/100\n[C-00000001] DIALSTATUS=NOANSWER')
    expect(result.calls[0].findings.map((finding) => finding.ruleId)).toContain('PBX-005')
  })

  it('reports evidence boundaries when no root cause is proven', () => {
    const successfulCall = analyzeLog(fixture).calls[1]
    expect(successfulCall.cannotConfirm).toContain('A definitive root cause; the available evidence supports observations or symptoms only')
  })
})
