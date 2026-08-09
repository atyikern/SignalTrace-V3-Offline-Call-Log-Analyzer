import type { IvrCall, IvrEvent, IvrEventType, IvrSeverity } from './types'
import { parseTimestamp } from './pjsipAnalyzer'

export function parseIvrContext(line: string) {
  const routed = line.match(/Routed Call\[([\s\S]*?)\]/i)?.[1] ?? line
  const handler = line.match(/\[(\d+)\]\s*\[(\d{8,})\]\s*\[(\+\d{7,})\]/)
  return {
    phoneNumber: routed.match(/callerID\s*:\s*(\+?\d{7,})/i)?.[1] ?? line.match(/Caller ID is\s+(\+?\d{7,})/i)?.[1] ?? line.match(/variable:\s*sysCallerID\s*,\s*value:\s*(\+?\d{7,})/i)?.[1] ?? handler?.[3],
    callId: routed.match(/callID\s*:\s*(\d{8,})/i)?.[1] ?? handler?.[2],
    routePoint: routed.match(/routePt\s*:\s*([^,\]\s]+)/i)?.[1] ?? handler?.[1],
    taskNumber: routed.match(/taskNo\s*:\s*([^,\]\s]+)/i)?.[1],
  }
}

function eventFor(line: string, lineNumber: number): IvrEvent | undefined {
  const timestamp = parseTimestamp(line)?.timestamp
  const base = { timestamp, rawLine: line, lineNumber, severity: 'info' as const }
  const make = (type: IvrEventType, label: string, extra = {}): IvrEvent => ({ ...base, type, label, ...extra })
  if (/\bNEWCAL\b/i.test(line)) return make('NEW_CALL', 'Incoming Call')
  if (/Routed Call\[/i.test(line)) return make('CALL_INITIALIZED', 'Call Initialized')
  if (/StartNode\.execute/i.test(line)) return make('IVR_STARTED', 'IVR Started')
  if (/PromptNode\.execute/i.test(line)) return make('PROMPT_STARTED', 'Prompt Node')
  const prompt = line.match(/doPlayPrompt\(\).*?prompt\s*:\s*([^,\s]+)/i)?.[1]
  if (prompt) return make('PROMPT_STARTED', `Prompt ${prompt}`, { prompt })
  if (/OnPlayPrompt\(/i.test(line)) return make('PROMPT_COMPLETED', 'Prompt Completed')
  if (/doCollectDigits\(/i.test(line) && !/digits collected\s*:/i.test(line)) return make('COLLECT_DIGITS_STARTED', 'Collect Digits Started')
  const failed = line.match(/OnCollectDigits\(\).*?unable to collect digits.*?error\s*:\s*([^,\s]+).*?collected digits\s*:\s*([^,\s]+)/i)
  if (failed) return make('COLLECT_DIGITS_FAILED', 'Collect Digits Failed', { severity: 'error', errorCode: failed[1], digit: failed[2] })
  const digit = line.match(/digits collected\s*:\s*([^,\s]+)/i)?.[1]
  if (digit && digit.toLowerCase() !== 'null') return make('DIGIT_COLLECTED', `Digit Collected: ${digit}`, { digit })
  if (/sysIvrMaxTriesHit.*?value\s*:\s*1/i.test(line)) return make('IVR_MAX_RETRIES', 'Maximum IVR Retries Reached', { severity: 'error' })
  const retry = line.match(/sysNoOfRetry.*?value\s*:\s*(\d+)/i)?.[1]
  if (retry) return make('IVR_RETRY', `Retry Count: ${retry}`)
  if (/unable to retrieve next node/i.test(line)) return make('NEXT_NODE_FAILED', 'Unable to Retrieve Next Node', { severity: 'error' })
  if (/proceed to hangup|doHangUpCall\(\).*hanging up/i.test(line)) return make('SYSTEM_HANGUP', 'System Hangup', { severity: 'warning' })
  if (/OnCallDisconnected\(/i.test(line)) return make('CALL_DISCONNECTED', 'Call Disconnected')
  if (/routing failed|RouteNode.*error/i.test(line)) return make('ROUTING_FAILED', 'Routing Failed', { severity: 'error' })
  if (/routing successful|RouteNode.*success/i.test(line)) return make('ROUTING_SUCCESS', 'Routing Successful')
  if (/\bERROR\b|exception/i.test(line)) return make('UNKNOWN_ERROR', 'Application Error', { severity: 'error' })
}

function finish(call: IvrCall): IvrCall {
  const events = call.events.sort((a,b)=>(a.timestamp??'').localeCompare(b.timestamp??''))
  const attempts = events.filter(e=>e.type==='COLLECT_DIGITS_STARTED').length
  const failed = events.filter(e=>e.type==='COLLECT_DIGITS_FAILED').length
  const successful = events.filter(e=>e.type==='DIGIT_COLLECTED').length
  const nextFailed = events.some(e=>e.type==='NEXT_NODE_FAILED')
  const maxRetries = events.some(e=>e.type==='IVR_MAX_RETRIES')
  const systemHangup = events.some(e=>e.type==='SYSTEM_HANGUP')
  const explicitError = events.some(e=>e.severity==='error')
  const severity: IvrSeverity = events.some(e=>e.type==='UNKNOWN_ERROR') ? 'Critical' : nextFailed || (failed>1&&systemHangup) || (maxRetries&&systemHangup) ? 'Failed' : failed ? 'Warning' : events.length ? 'Healthy' : 'Unknown'
  const routed = events.some(e=>e.type==='ROUTING_SUCCESS')
  call.startTime=events[0]?.timestamp; call.endTime=events.at(-1)?.timestamp
  call.collectDigitAttempts=attempts; call.failedAttempts=failed; call.successfulAttempts=successful
  call.ivrStatus=severity; call.routingStatus=routed?'Reached':nextFailed||call.numberOfRoutes===0?'Not Reached':'Unknown'
  call.primaryFailureStage=failed?'Collect Digits':nextFailed?'IVR Flow':undefined
  call.systemAction=nextFailed&&systemHangup?'Hangup after IVR could not continue':systemHangup?'System Hangup':undefined
  call.finding=failed ? `The IVR attempted to collect caller input ${attempts} ${attempts===1?'time':'times'}. ${failed} attempt${failed===1?'':'s'} failed${successful?' before a successful input.':' and returned no collected digit.'}${nextFailed?' The IVR then reported that it was unable to retrieve the next node and proceeded to hang up.':''}` : explicitError?'The log contains an explicit IVR processing error.':'No explicit IVR failure was detected in the available events.'
  call.possibleCause=failed?'The log shows that eFrontVoice-IVR was unable to collect a digit. Additional telephony/SIP/CTI logs may be required to determine why the input was not collected.':'The available IVR events do not establish an underlying cause.'
  call.possibleImpact=failed||nextFailed?'The caller could not continue through the IVR menu and may not have reached the intended downstream route.':'No confirmed caller impact was identified.'
  call.conclusion=failed&&systemHangup?'The call ended at the Collect Digits stage. No successful digit input or routing event was detected before the system initiated the hangup.':nextFailed?'The IVR flow could not continue to its next node.':severity==='Healthy'?'The available events show no explicit IVR failure.':'The available log evidence is insufficient for a definitive conclusion.'
  call.problemScore=(severity==='Critical'?100:severity==='Failed'?80:severity==='Warning'?40:0)+(explicitError?10:0)+(nextFailed?8:0)+(maxRetries?5:0)
  return call
}

export function analyzeIvrCalls(records: string[]): IvrCall[] {
  const calls=new Map<string,IvrCall>(); let activeCallId:string|undefined; let activePhone:string|undefined
  records.forEach((line,index)=>{ const ctx=parseIvrContext(line); activeCallId=ctx.callId??activeCallId; activePhone=ctx.phoneNumber??activePhone; if(!activeCallId||!activePhone)return
    const call=calls.get(activeCallId)??{phoneNumber:activePhone,callId:activeCallId,events:[],ivrStatus:'Unknown',routingStatus:'Unknown',collectDigitAttempts:0,successfulAttempts:0,failedAttempts:0,finding:'',possibleCause:'',possibleImpact:'',conclusion:'',problemScore:0}
    call.phoneNumber=ctx.phoneNumber??call.phoneNumber; call.routePoint=ctx.routePoint??call.routePoint; call.taskNumber=ctx.taskNumber??call.taskNumber
    call.campaignId=line.match(/(?:campaignID|sysCampaignID)\s*[:,]\s*(?:value\s*:\s*)?(\d+)/i)?.[1]??call.campaignId
    call.transactionId=line.match(/call transaction ID\s*:\s*(\d+)/i)?.[1]??line.match(/sysTransactionID.*?value\s*:\s*(\d+)/i)?.[1]??call.transactionId
    call.callStatus=line.match(/callStatus\s*:\s*(\d+)/i)?.[1]??call.callStatus
    const nr=line.match(/numberOfRoutes\s*:\s*(\d+)/i)?.[1]; const tr=line.match(/totalRoutes\s*:\s*(\d+)/i)?.[1]; if(nr)call.numberOfRoutes=Number(nr);if(tr)call.totalRoutes=Number(tr)
    const event=eventFor(line,index+1);if(event)call.events.push(event);calls.set(activeCallId,call)
  }); return [...calls.values()].map(finish)
}
