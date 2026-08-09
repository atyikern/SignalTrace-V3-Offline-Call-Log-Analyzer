import { describe, expect, it } from 'vitest'
import fixture from './test/fixtures/ivr-call-flow.log?raw'
import { analyzeIvrCalls, parseIvrContext } from './ivrAnalyzer'
import { normalizeLogRecords } from './pjsipAnalyzer'

describe('eFrontVoice-IVR analysis',()=>{
 const calls=analyzeIvrCalls(normalizeLogRecords(fixture)); const failed=calls.find(c=>c.callId==='178244679334766')!
 it('extracts contextual caller, call, route and multiple isolated calls',()=>{expect(parseIvrContext('[0386897800] [178244679334766] [+60139610712]')).toEqual({phoneNumber:'+60139610712',callId:'178244679334766',routePoint:'0386897800',taskNumber:undefined});expect(calls).toHaveLength(2);expect(calls.every(c=>c.phoneNumber==='+60139610712')).toBe(true)})
 it('extracts metadata and abnormal chain',()=>{expect(failed).toMatchObject({routePoint:'0386897800',taskNumber:'66',campaignId:'6',transactionId:'8079000',callStatus:'11',numberOfRoutes:0,totalRoutes:0,ivrStatus:'Failed',routingStatus:'Not Reached',primaryFailureStage:'Collect Digits',systemAction:'Hangup after IVR could not continue'})})
 it('detects prompts, attempts, failures, retry, flow failure, hangup and disconnect',()=>{expect(failed.events.map(e=>e.type)).toEqual(expect.arrayContaining(['IVR_STARTED','PROMPT_STARTED','COLLECT_DIGITS_STARTED','COLLECT_DIGITS_FAILED','IVR_MAX_RETRIES','IVR_RETRY','NEXT_NODE_FAILED','SYSTEM_HANGUP','CALL_DISCONNECTED']));expect(failed).toMatchObject({collectDigitAttempts:2,failedAttempts:2,successfulAttempts:0}) ;expect(failed.events.filter(e=>e.type==='COLLECT_DIGITS_FAILED').every(e=>e.errorCode==='6'&&e.digit==='null')).toBe(true)})
 it('keeps calls isolated and does not mark normal EndNode/hangup as failure',()=>{const healthy=calls.find(c=>c.callId==='178246906457037')!;expect(healthy.events.some(e=>e.type==='DIGIT_COLLECTED'&&e.digit==='1')).toBe(true);expect(healthy.ivrStatus).toBe('Healthy');expect(healthy.events).not.toEqual(expect.arrayContaining([expect.objectContaining({type:'NEXT_NODE_FAILED'})]))})
})
