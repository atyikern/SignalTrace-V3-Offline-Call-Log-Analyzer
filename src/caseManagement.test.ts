import { describe, expect, it } from 'vitest'
import { CASE_HISTORY_KEY, caseCategory, caseCountry, caseModuleLabel, countryCode, createCaseReport, filterAndSortCases, readCaseHistory, rememberCase, searchCases } from './caseManagement'

const context = {
  moduleName: 'eFrontVoice-IVR V9',
  customerPhoneNumber: '+60139610712',
  transactionId: '8079000',
  finding: 'The call disconnected before routing.',
  rootCause: 'Routing did not complete before disconnect.',
  recommendation: 'Review the routing timeline and agent availability.',
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  }
}

describe('offline case management', () => {
  it('builds the unified report with analysis and support fields', () => {
    const report = createCaseReport(context, { ticketId: ' IS1533 ', customerName: ' Acme ', customerGroup: ' Gold ', remarks: 'Follow up' }, new Date('2026-08-11T10:20:30.000Z'))
    expect(report).toMatchObject({
      moduleName: 'eFrontVoice-IVR V9', analysisTime: '2026-08-11T10:20:30.000Z', ticketId: 'IS1533', customerName: 'Acme', customerGroup: 'Gold', remarks: 'Follow up',
      customerPhoneNumber: '+60139610712', transactionId: '8079000', finding: context.finding, rootCause: context.rootCause, recommendation: context.recommendation,
    })
    expect(report.sectionId).toMatch(/^ST-20260811102030-/)
  })

  it('stores case metadata locally and replaces duplicate section records', () => {
    const storage = memoryStorage()
    const report = createCaseReport(context, { ticketId: 'IS1533', customerName: 'Acme', customerGroup: 'Gold' })
    rememberCase(report, storage)
    rememberCase({ ...report, remarks: 'updated' }, storage)
    expect(storage.values.has(CASE_HISTORY_KEY)).toBe(true)
    expect(readCaseHistory(storage)).toHaveLength(1)
    expect(readCaseHistory(storage)[0].remarks).toBe('updated')
  })

  it.each(['is1533', 'acme', '601396', '8079000', 'disconnected before routing', 'routing did not complete'])(
    'searches saved cases using %s',
    (query) => {
      const report = createCaseReport(context, { ticketId: 'IS1533', customerName: 'Acme', customerGroup: 'Gold' })
      expect(searchCases([report], query)).toEqual([report])
    },
  )

  it('categorizes modules, detects supported countries, filters, and sorts cases', () => {
    const voice=createCaseReport(context,{ticketId:'V1',customerName:'Zulu',customerGroup:'A'},new Date('2026-08-11T11:00:00Z'))
    const messaging=createCaseReport({...context,moduleName:'OCOD5 WhatsApp Messaging',customerPhoneNumber:'+6591234567'},{ticketId:'M1',customerName:'Alpha',customerGroup:'B'},new Date('2026-08-11T12:00:00Z'))
    expect(caseCategory(voice.moduleName)).toBe('Voice');expect(caseCategory(messaging.moduleName)).toBe('Messaging')
    expect(caseModuleLabel(messaging.moduleName)).toBe('WhatsApp');expect(countryCode(voice.customerPhoneNumber)).toBe('MY');expect(countryCode(messaging.customerPhoneNumber)).toBe('SG')
    expect(caseCountry({...voice,countryCode:'th'})).toBe('TH')
    expect(filterAndSortCases([voice,messaging],{query:'',module:'Messaging',country:'SG',sort:'newest'})).toEqual([messaging])
    expect(filterAndSortCases([voice,messaging],{query:'',module:'All',country:'All',sort:'customer'}).map(item=>item.customerName)).toEqual(['Alpha','Zulu'])
  })
})
