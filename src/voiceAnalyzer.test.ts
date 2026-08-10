import { describe, expect, it } from 'vitest'
import routingFixture from './test/fixtures/voice-routing.log?raw'
import extensionFixture from './test/fixtures/voice-extension.log?raw'
import { analyzeVoiceCalls, analyzeVoiceExtensions, extractVoiceTransactionIds, normalizeEfrontVoiceRecords } from './voiceAnalyzer'
describe('eFrontVoice caller routing',()=>{
 const calls=analyzeVoiceCalls(normalizeEfrontVoiceRecords(routingFixture))
 it('isolates calls and extracts routing metadata',()=>{expect(calls).toHaveLength(2);const call=calls.find(x=>x.callId==='178606822570870')!;expect(call).toMatchObject({callerId:'96946315',campaignId:'2',agentGroupId:'17',agentId:'21',extension:'23197001',routingStatus:'Successful',callStatus:'Completed',hangupCause:'16'});expect(call.transactionId).toBeUndefined();expect(call.agentSearchAttempts).toBe(2);expect(call.agentSearchDurationSeconds).toBe(60);expect(call.events.some(e=>e.type==='AGENT_RINGING')).toBe(true);expect(call.events.some(e=>e.type==='CALL_CONNECTED')).toBe(true)})
 it('keeps a long successful search successful and marks an unbooked call not reached',()=>{expect(calls[0].routingStatus).toBe('Successful');expect(calls[1]).toMatchObject({callId:'178606822570871',routingStatus:'Not Reached'})})
})
describe('eFrontVoice extension analysis',()=>{const analyses=analyzeVoiceExtensions(normalizeEfrontVoiceRecords(extensionFixture));it('detects login, registration, states, calls and recovered warnings',()=>{expect(analyses).toHaveLength(1);expect(analyses[0]).toMatchObject({extension:'23197001',agentId:'21',extensionStatus:'Healthy',pbxStatus:'Connected',loginStatus:'Logged In',registrationStatus:'Registered',currentState:'Ringing',callsHandled:1,warnings:1,recoveredWarning:true,unrecoveredErrors:0})})})
it('splits concatenated millisecond timestamp records',()=>{const rows=normalizeEfrontVoiceRecords('2026-08-07 10:04:17,100 DEBUG firstnull2026-08-07 10:04:17,736 DEBUG second');expect(rows).toHaveLength(2);expect(rows[1]).toContain(',736')})


describe('authoritative eFrontVoice Transaction IDs',()=>{
 const records=normalizeEfrontVoiceRecords(`2026-08-10 10:00:00,000 DEBUG [178600000000001] [2] [96946315] TID: 8169653, callID: 178600000000001 addCallTransaction()
2026-08-10 10:00:01,000 DEBUG [178600000000001] [2] [96946315] TID: 8169653, callID: 178600000000001 GETAVAILAGT
2026-08-10 11:00:00,000 DEBUG [178600000000002] [2] [96946315] TID: 8170813, callID: 178600000000002 addCallTransaction()`)
 it('extracts and deduplicates only explicit TID fields',()=>expect(extractVoiceTransactionIds(records)).toEqual(['8169653','8170813']))
 it('keeps multiple authoritative TIDs as separate transactions',()=>expect(analyzeVoiceCalls(records).map(call=>call.transactionId)).toEqual(['8169653','8170813']))
 it('does not treat transaction object id as authoritative',()=>{const [call]=analyzeVoiceCalls(normalizeEfrontVoiceRecords('2026-08-10 10:00:00,000 DEBUG [178600000000003] [2] [96946315] addCallTransaction() addTransaction(), inserted: {id=8169653, transacttype=3}'));expect(call.transactionId).toBeUndefined()})
 it('does not mistake callID, agentID, or custid for TID',()=>{const [call]=analyzeVoiceCalls(normalizeEfrontVoiceRecords('2026-08-10 10:00:00,000 DEBUG [178600000000004] [2] [96946315] callID: 178600000000004 agentID: 733 custid: 8169653 addCallTransaction()'));expect(call.transactionId).toBeUndefined()})
})
