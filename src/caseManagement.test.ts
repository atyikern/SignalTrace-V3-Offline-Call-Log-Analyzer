import { describe, expect, it } from 'vitest'
import { CASE_HISTORY_KEY, createCaseReport, readCaseHistory, rememberCase, searchCases } from './caseManagement'

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

  it.each(['is1533', 'acme', '601396', '8079000', 'routing did not complete'])(
    'searches saved cases using %s',
    (query) => {
      const report = createCaseReport(context, { ticketId: 'IS1533', customerName: 'Acme', customerGroup: 'Gold' })
      expect(searchCases([report], query)).toEqual([report])
    },
  )
})
