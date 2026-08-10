import { describe,expect,it } from 'vitest'
import healthy from './test/fixtures/webhook-healthy.log?raw'
import { analyzeWebhook, isWebhookLog, maskWebhookRecord, normalizeWebhookRecords } from './webhookAnalyzer'

describe('OpsCentral Webhook messaging flow',()=>{
 it('parses the healthy acceptance flow',()=>{const [trx]=analyzeWebhook(healthy);expect(trx).toMatchObject({trxId:'4125',maskedCustomer:'6598****28',messageIds:['39847','39849'],startNode:'532',blacklistResult:'Passed',operationHours:'Open',selectedOption:'General Enquiry',agentGroupId:'1',status:'Successfully Routed',timeoutIndicators:[],errors:[]});expect(trx.nodeJourney.map(node=>node.id)).toEqual(['532','533','538','688','544']);expect(trx.processingDurationMs).toBe(19185)})
 it('detects webhook markers and ignores shell noise',()=>{const rows=normalizeWebhookRecords(healthy);expect(rows.some(row=>row.startsWith('sh-4.4$'))).toBe(false);expect(isWebhookLog(rows)).toBe(true)})
 it('splits joined records',()=>{const joined='2026-08-10 10:00:00,000 INFO [TRX: 1] IVR_NODE_START NodeId: 1null2026-08-10 10:00:01,000 INFO [TRX: 1] IVR_NODE_ROUTE NodeId: 2';expect(normalizeWebhookRecords(joined)).toHaveLength(2)})
 it('keeps multiple TRX IDs separate even for one customer',()=>{const text='2026-08-10 10:00:00,000 INFO [TRX: 1] Setting isBlackList as 0 for 6598175528 IVR_NODE_START NodeId: 1\n2026-08-10 10:01:00,000 INFO [TRX: 2] Setting isBlackList as 0 for 6598175528 IVR_NODE_START NodeId: 1';const result=analyzeWebhook(text);expect(result.map(x=>x.trxId).sort()).toEqual(['1','2']);expect(result.every(x=>x.customerNumber==='6598175528')).toBe(true)})
 it('does not treat false and zero timeout fields as timeout',()=>{expect(analyzeWebhook(healthy)[0].status).toBe('Successfully Routed')})
 it('detects a confirmed timeout',()=>{const [trx]=analyzeWebhook('2026-08-10 10:00:00,000 INFO [TRX: 3] IVR_NODE_START NodeId: 1 pendingInputOrTimeout=true');expect(trx.status).toBe('Timeout')})
 it('requires both route node and assignment for successful routing',()=>{const [trx]=analyzeWebhook('2026-08-10 10:00:00,000 INFO [TRX: 4] IVR_NODE_ROUTE NodeId: 2 End node done/ Route Node');expect(trx.status).toBe('Incomplete / Unknown')})
 it('masks credentials, customer numbers, and message content',()=>{const masked=maskWebhookRecord('apikey="MwPc1234567890Wds" Customer 6598175528 Message: secret text','6598175528');expect(masked).not.toContain('MwPc1234567890Wds');expect(masked).not.toContain('6598175528');expect(masked).not.toContain('secret text');expect(masked).toContain('6598****28');expect(masked).toContain('Message: [MASKED]')})
 it('does not detect unrelated logs',()=>expect(analyzeWebhook('2026-08-10 10:00:00,000 ordinary application line')).toEqual([]))
 it('ignores harmless error property names with false values',()=>{const [trx]=analyzeWebhook(`2026-08-10 10:00:00,000 INFO [TRX: 5] IVR_NODE_START NodeId: 1 payload={"failure":false,"error":null}`);expect(trx.status).toBe('Incomplete / Unknown');expect(trx.errors).toEqual([])})

})
