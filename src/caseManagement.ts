export interface CaseContext {
  moduleName: string
  customerPhoneNumber?: string
  transactionId?: string
  finding: string
  rootCause: string
  recommendation: string
  technicalDetails?: Array<{ label:string; value:string|number }>
  technicalTimeline?: Array<{ timestamp?:string; title:string; raw?:string }>
  finalStatus?: string
  countryCode?: string
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

export type CaseCategory = 'Voice'|'Messaging'|'Connectivity'|'Other'
export type CaseSort = 'newest'|'oldest'|'customer'|'module'

export function caseCategory(moduleName:string):CaseCategory {
  if (/messaging license occupancy/i.test(moduleName)) return 'Connectivity'
  if (/whatsapp|webhook|messaging/i.test(moduleName)) return 'Messaging'
  if (/rtt|unreachable|econnreset|socketio|connectivity/i.test(moduleName)) return 'Connectivity'
  if (/efrontvoice|asterisk|ivr|voice/i.test(moduleName)) return 'Voice'
  return 'Other'
}

export function caseModuleLabel(moduleName:string) {
  if (/messaging license occupancy/i.test(moduleName)) return 'Messaging License Occupancy'
  if (/whatsapp/i.test(moduleName)) return 'WhatsApp'
  if (/rtt|unreachable/i.test(moduleName)) return 'RTT / Unreachable'
  if (/econnreset|socketio/i.test(moduleName)) return 'ECONNRESET'
  if (/efrontvoice-ivr/i.test(moduleName)) return 'eFrontVoice-IVR'
  if (/efrontvoice/i.test(moduleName)) return 'eFrontVoice'
  if (/voicemail/i.test(moduleName)) return 'Asterisk/PBX Voicemail'
  if (/asterisk/i.test(moduleName)) return 'Asterisk-IVR'
  if (/webhook/i.test(moduleName)) return 'Webhook'
  return moduleName
}

export function countryCode(phone?:string) {
  const digits=phone?.replace(/\D/g,'')
  if (!digits) return undefined
  if (digits.startsWith('65')) return 'SG'
  if (digits.startsWith('60')) return 'MY'
  if (digits.startsWith('63')) return 'PH'
  if (digits.startsWith('62')) return 'ID'
  return undefined
}

export function caseCountry(item:Pick<CaseReport,'customerPhoneNumber'|'countryCode'>) {
  return item.countryCode?.trim().toUpperCase()||countryCode(item.customerPhoneNumber)
}

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
    technicalDetails: context.technicalDetails,
    technicalTimeline: context.technicalTimeline,
    finalStatus: context.finalStatus,
    countryCode: context.countryCode??countryCode(context.customerPhoneNumber),
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
  return cases.filter(item => [item.ticketId,item.customerName,item.customerPhoneNumber,item.transactionId,item.finding,item.rootCause].some(value => value?.toLowerCase().includes(normalized)))
}

export function filterAndSortCases(cases:CaseReport[],options:{query:string;module:string;country:string;sort:CaseSort}) {
  const filtered=searchCases(cases,options.query).filter(item=>{
    const category=caseCategory(item.moduleName);const module=caseModuleLabel(item.moduleName)
    return (options.module==='All'||options.module===category||options.module===module)&&(options.country==='All'||caseCountry(item)===options.country)
  })
  return [...filtered].sort((a,b)=>options.sort==='oldest'?a.analysisTime.localeCompare(b.analysisTime):options.sort==='customer'?a.customerName.localeCompare(b.customerName):options.sort==='module'?caseModuleLabel(a.moduleName).localeCompare(caseModuleLabel(b.moduleName)):b.analysisTime.localeCompare(a.analysisTime))
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
