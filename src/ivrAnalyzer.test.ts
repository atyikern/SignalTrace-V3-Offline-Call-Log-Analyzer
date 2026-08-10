import { describe, expect, it } from 'vitest'
import fixture from './test/fixtures/ivr-call-flow.log?raw'
import { analyzeIvrCalls, parseIvrContext, parseIvrTimestamp } from './ivrAnalyzer'
import { normalizeLogRecords } from './pjsipAnalyzer'

describe('eFrontVoice-IVR analysis',()=>{
 const calls=analyzeIvrCalls(normalizeLogRecords(fixture)); const failed=calls.find(c=>c.callId==='178244679334766')!
 it('parses production timestamps with milliseconds',()=>{expect(parseIvrTimestamp('2026-06-26 12:06:33,348 DEBUG test')).toMatchObject({timestamp:'2026-06-26 12:06:33,348',time:'12:06:33',milliseconds:'348'});expect(parseIvrTimestamp('2026-06-26 12:07:32,855 ERROR test')?.milliseconds).toBe('855');expect(parseIvrTimestamp('2026-06-26 12:06:33 DEBUG test')?.time).toBe('12:06:33')})
 it('extracts contextual caller, call, route and multiple isolated calls',()=>{expect(parseIvrContext('[0386897800] [178244679334766] [+60139610712]')).toEqual({phoneNumber:'+60139610712',callId:'178244679334766',routePoint:'0386897800',taskNumber:undefined});expect(calls).toHaveLength(2);expect(calls.every(c=>c.phoneNumber==='+60139610712')).toBe(true)})
 it('extracts metadata and abnormal chain',()=>{expect(failed).toMatchObject({routePoint:'0386897800',campaignPhoneNumber:'0386897800',phoneNumber:'+60139610712',taskNumber:'66',campaignId:'6',transactionId:'8079000',callStatus:'11',numberOfRoutes:0,totalRoutes:0,ivrStatus:'Failed',routingStatus:'Not Reached',primaryFailureStage:'Collect Digits',systemAction:'Hangup after IVR could not continue'})})
 it('detects prompts, attempts, failures, retry, flow failure, hangup and disconnect',()=>{expect(failed.events.map(e=>e.type)).toEqual(expect.arrayContaining(['IVR_STARTED','PROMPT_STARTED','COLLECT_DIGITS_STARTED','COLLECT_DIGITS_FAILED','IVR_MAX_RETRIES','IVR_RETRY','NEXT_NODE_FAILED','SYSTEM_HANGUP','CALL_DISCONNECTED']));expect(failed.events.every(e=>e.timestamp&&!e.timestampParseFailed)).toBe(true);expect(failed.events.map(e=>e.timestampMs)).toEqual([...failed.events.map(e=>e.timestampMs)].sort((a,b)=>a!-b!));expect(failed).toMatchObject({collectDigitAttempts:2,failedAttempts:2,successfulAttempts:0}) ;expect(failed.events.filter(e=>e.type==='COLLECT_DIGITS_FAILED').every(e=>e.errorCode==='6'&&e.digit==='null')).toBe(true)})
 it('keeps calls isolated and does not mark normal EndNode/hangup as failure',()=>{const healthy=calls.find(c=>c.callId==='178246906457037')!;expect(healthy.events.some(e=>e.type==='DIGIT_COLLECTED'&&e.digit==='1')).toBe(true);expect(healthy.ivrStatus).toBe('Healthy');expect(healthy.events).not.toEqual(expect.arrayContaining([expect.objectContaining({type:'NEXT_NODE_FAILED'})]))})
 it('correlates V9 routing stages and preserves a successful result with warnings',()=>{const log=`2026-06-26 12:00:00,000 DEBUG Routed Call[routePt:0386897800,taskNo:66,callID:178244679334766,callerID:+60139610712]
2026-06-26 12:00:00,100 DEBUG [0386897800] [178244679334766] [+60139610712] received ADDCALLTRANSACTION_RSP with call transaction ID: 8079000 campaignID:6
2026-06-26 12:00:01,000 ERROR [0386897800] [178244679334766] [+60139610712] OnCollectDigits(), unable to collect digits, error: 6, collected digits: null
2026-06-26 12:00:02,000 DEBUG [0386897800] [178244679334766] [+60139610712] RouteNode.execute()
2026-06-26 12:00:05,000 DEBUG [0386897800] [178244679334766] [+60139610712] RoutingEntry.process() GETAVAILAGT
2026-06-26 12:00:05,400 DEBUG [0386897800] [178244679334766] [+60139610712] received GETAVAILAGT_RSP with agent ID: 21
2026-06-26 12:00:05,500 DEBUG [0386897800] [178244679334766] [+60139610712] CONFIRMAGTBOOKING_RSP|OK|23197001
2026-06-26 12:00:06,000 DEBUG [0386897800] [178244679334766] [+60139610712] ADDCALLRECORD
2026-06-26 12:00:06,250 DEBUG [0386897800] [178244679334766] [+60139610712] ADDCALLRECORD_RSP
2026-06-26 12:00:07,000 DEBUG [0386897800] [178244679334766] [+60139610712] doRouteCall(), timeout: 10000
2026-06-26 12:00:08,500 DEBUG [0386897800] [178244679334766] [+60139610712] OnCallRouted() numberOfRoutes is 1 totalRoutes is 1 Routed success`;const call=analyzeIvrCalls(normalizeLogRecords(log))[0];expect(call).toMatchObject({transactionId:'8079000',campaignId:'6',selectedAgentId:'21',selectedExtension:'23197001',bookingResult:'OK',numberOfRoutes:1,totalRoutes:1,outcome:'Routed Successfully with Warnings',routingStatus:'Reached',timings:{routingQueueMs:3000,agentLookupMs:400,addCallRecordMs:250,routeCallMs:1500,configuredRouteTimeoutMs:10000}});expect(call.warnings).toEqual(expect.arrayContaining([expect.stringContaining('digit collection'),expect.stringContaining('Routing queue')]))})
 it('classifies disconnect before route completion separately',()=>{const log=`2026-06-26 12:00:00,000 DEBUG Routed Call[routePt:1,taskNo:1,callID:178244679334766,callerID:+60139610712]
2026-06-26 12:00:01,000 DEBUG [1] [178244679334766] [+60139610712] RouteNode.execute()
2026-06-26 12:00:02,000 DEBUG [1] [178244679334766] [+60139610712] OnCallDisconnected(), numberOfRoutes is 0 totalRoutes is 0`;expect(analyzeIvrCalls(normalizeLogRecords(log))[0].outcome).toBe('Disconnected Before Routing')})

})
