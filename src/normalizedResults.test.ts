import { describe, expect, it } from 'vitest'
import { normalizeWhatsapp } from './normalizedResults'
import type { WhatsappMessageAnalysis } from './types'

describe('normalized analysis result adapters', () => {
  it('maps OCOD5 output into shared summary, details, and ordered timeline fields', () => {
    const message:WhatsappMessageAnalysis={key:'m1',transactionId:'77',customerNumber:'6598175528',maskedCustomer:'6598175528',businessNumber:'6588054227',maskedBusiness:'6588054227',direction:'Outbound',messageType:'text',status:'Delivered and read',statusProgression:['Sent','Delivered','Read'],duplicateCallbacks:1,warnings:[],errors:[],timings:{sentToDeliveredMs:1200},events:[{timestamp:'2026-08-11 10:00:02,000',timestampMs:2,lineNumber:2,type:'READ',label:'Read',rawLine:'read raw'},{timestamp:'2026-08-11 10:00:01,000',timestampMs:1,lineNumber:1,type:'SENT',label:'Sent',rawLine:'sent raw'}],finding:'Delivered normally.',problemScore:0}
    const result=normalizeWhatsapp(message)
    expect(result).toMatchObject({moduleName:'OCOD5 WhatsApp Messaging',finalStatus:'Delivered and read',statusProgression:['Sent','Delivered','Read'],duplicateEvents:1,finding:'Delivered normally.'})
    expect(result.summary).toContainEqual({label:'Sent → Delivered',value:'1.20 sec'})
    expect(result.technicalDetails).toContainEqual({label:'Customer Phone Number',value:'6598175528'})
    expect(result.technicalDetails.some(item=>item.label==='Conversation ID')).toBe(false)
    expect(result.timeline.map(item=>item.title)).toEqual(['Sent','Read'])
  })
})
