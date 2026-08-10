import {describe,expect,it} from 'vitest'
import fixture from './test/fixtures/ocod5-whatsapp.log?raw'
import {analyzeOcod5Whatsapp,normalizeOcod5Records} from './whatsappAnalyzer'

describe('OCOD5 WhatsApp analysis',()=>{
 const messages=analyzeOcod5Whatsapp(fixture);const outbound=messages.find(item=>item.messageId==='msg-100')!;const inbound=messages.find(item=>item.messageId==='msg-in-1')!
 it('normalizes joined production records',()=>expect(normalizeOcod5Records(fixture.replaceAll('\n',''))).toHaveLength(7))
 it('correlates message and task IDs and extracts metadata',()=>expect(outbound).toMatchObject({conversationId:'conv-1',messageId:'msg-100',taskId:'task-100',transactionId:'4125',campaignId:'20',direction:'Outbound',wabaId:'waba-1',userId:'user-1'}))
 it('tracks successful status progression and timings',()=>expect(outbound).toMatchObject({status:'Delivered and read',statusProgression:['Sent','Delivered','Read'],timings:{sendToSentMs:400,sentToDeliveredMs:1000,deliveredToReadMs:2000}}))
 it('treats repeated Delivered callbacks as warnings rather than failures',()=>{expect(outbound.duplicateCallbacks).toBe(1);expect(outbound.errors).toHaveLength(0);expect(outbound.warnings[0]).toContain('duplicate')})
 it('recognizes inbound replies and masks friendly phone summaries',()=>{expect(inbound).toMatchObject({status:'Inbound message received',direction:'Inbound',contextualReplyId:'msg-100'});expect(inbound.maskedCustomer).not.toBe(inbound.customerNumber);expect(inbound.events[0].rawLine).toContain('customer reply')})
 it('keeps delivered without read and confirmed failures distinct',()=>{const delivered=analyzeOcod5Whatsapp(fixture.replace(/\n.*"Status":"Read".*$/m,''))[0];expect(delivered.status).toBe('Delivered, awaiting read');const failed=analyzeOcod5Whatsapp('2026-08-10 10:00:00,000 ERROR WhatsAppWebhook {"MessageId":"x","Status":"Failed","error":"authentication failed"}')[0];expect(failed.status).toBe('Send/delivery failed')})
})
