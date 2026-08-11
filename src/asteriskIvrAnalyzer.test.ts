import { describe, expect, it } from 'vitest'
import fixture from './test/fixtures/asterisk-ivr.log?raw'
import { analyzeAsteriskIvr } from './asteriskIvrAnalyzer'

describe('Asterisk-IVR call routing',()=>{
 const calls=analyzeAsteriskIvr(fixture)
 it('isolates calls by literal Process ID and extracts call information',()=>{expect(calls).toHaveLength(4);expect(calls.find(call=>call.processId==='92')).toMatchObject({callerId:'91755988',dnis:'64364552',agentExtension:'23187001',linkedId:'1785985617.11033517',routingResult:'Successfully Transferred',ringDurationSeconds:11})})
 it('classifies dial failures case-insensitively',()=>{expect(calls.find(call=>call.processId==='93')?.routingResult).toBe('Busy');expect(calls.find(call=>call.processId==='94')?.routingResult).toBe('Channel Unavailable');expect(calls.find(call=>call.processId==='95')?.routingResult).toBe('No Answer')})
 it('splits joined timestamped records without merging calls',()=>{expect(calls.find(call=>call.processId==='94')?.callerId).toBe('92220000');expect(calls.find(call=>call.processId==='95')?.callerId).toBe('93330000')})
 it('does not treat NORMACAUSE alone as an answer',()=>{const [call]=analyzeAsteriskIvr("[2026-08-09 13:00:00] [96] Process ID=> 96 Caller ID =>94440000 DNIS => 1 Sg Cause => NORMACAUSE");expect(call.routingResult).toBe('Incomplete / Unknown')})
})
