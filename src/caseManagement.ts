export interface CaseContext {
  moduleName: string
  customerPhoneNumber?: string
  transactionId?: string
  finding: string
  rootCause: string
  recommendation: string
}

export interface CaseReport extends CaseContext {
  sectionId: string
  analysisTime: string
  ticketId: string
  customerName: string
  customerGroup: string
  remarks?: string
}

export const CASE_HISTORY_KEY = 'signaltrace-v11-case-history'

const safeSegment = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'Unknown'

export function createCaseReport(context: CaseContext, fields: Pick<CaseReport, 'ticketId'|'customerName'|'customerGroup'|'remarks'>, now = new Date()): CaseReport {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return {
    sectionId: `ST-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    moduleName: context.moduleName,
    analysisTime: now.toISOString(),
    ticketId: fields.ticketId.trim(),
    customerName: fields.customerName.trim(),
    customerGroup: fields.customerGroup.trim(),
    remarks: fields.remarks?.trim() || undefined,
    customerPhoneNumber: context.customerPhoneNumber,
    transactionId: context.transactionId,
    finding: context.finding,
    rootCause: context.rootCause,
    recommendation: context.recommendation,
  }
}

export function readCaseHistory(storage: Pick<Storage, 'getItem'> = localStorage): CaseReport[] {
  try {
    const value = JSON.parse(storage.getItem(CASE_HISTORY_KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

export function rememberCase(report: CaseReport, storage: Pick<Storage, 'getItem'|'setItem'> = localStorage) {
  const cases = [report, ...readCaseHistory(storage).filter(item => item.sectionId !== report.sectionId)]
  storage.setItem(CASE_HISTORY_KEY, JSON.stringify(cases))
}

export function searchCases(cases: CaseReport[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return cases
  return cases.filter(item => [item.ticketId,item.customerName,item.customerPhoneNumber,item.transactionId,item.rootCause].some(value => value?.toLowerCase().includes(normalized)))
}

type WritableFile = { createWritable():Promise<{write(data:string):Promise<void>;close():Promise<void>}> }
type Directory = { getDirectoryHandle(name:string,options:{create:boolean}):Promise<Directory>;getFileHandle(name:string,options:{create:boolean}):Promise<WritableFile> }

export async function saveCaseFile(report: CaseReport): Promise<'folder'|'download'> {
  const json = JSON.stringify(report, null, 2)
  const picker = (window as Window & { showDirectoryPicker?:()=>Promise<Directory> }).showDirectoryPicker
  if (picker) {
    const root = await picker.call(window)
    const dateFolder = await root.getDirectoryHandle(report.analysisTime.slice(0, 10), { create:true })
    const customerFolder = await dateFolder.getDirectoryHandle(safeSegment(report.customerName), { create:true })
    const file = await customerFolder.getFileHandle(`${safeSegment(report.ticketId)}-${safeSegment(report.sectionId)}.json`, { create:true })
    const writable = await file.createWritable()
    await writable.write(json); await writable.close()
    return 'folder'
  }
  const url = URL.createObjectURL(new Blob([json], { type:'application/json' }))
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=`${safeSegment(report.ticketId)}-${safeSegment(report.customerName)}.json`; anchor.click()
  URL.revokeObjectURL(url)
  return 'download'
}
