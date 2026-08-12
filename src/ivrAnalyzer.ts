import type { IvrCall, IvrEvent, IvrEventType, IvrSeverity } from './types'
export interface IvrThresholds { routingQueueWarningMs:number; routingQueueSlowMs:number; routingQueueCriticalMs:number; agentLookupWarningMs:number }
export const DEFAULT_IVR_THRESHOLDS:IvrThresholds={routingQueueWarningMs:2000,routingQueueSlowMs:5000,routingQueueCriticalMs:15000,agentLookupWarningMs:2000}
export function parseIvrTimestamp(line: string) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:,(\d{3}))?/) ?? line.match(/^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:[.,](\d{3}))?\]/)
  if (!match) return undefined
  const timestamp = `${match[1]} ${match[2]}${match[3] ? `,${match[3]}` : ''}`
  return { timestamp, date: match[1], time: match[2], milliseconds: match[3], timestampMs: Date.parse(`${match[1]}T${match[2]}.${match[3] ?? '000'}`) }
}

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
  const parsedTimestamp = parseIvrTimestamp(line)
  const base = { timestamp: parsedTimestamp?.timestamp, timestampMs: parsedTimestamp?.timestampMs, timestampParseFailed: !parsedTimestamp, rawLine: line, lineNumber, severity: 'info' as const }
  const make = (type: IvrEventType, label: string, extra = {}): IvrEvent => ({ ...base, type, label, ...extra })
  if (/\bNEWCAL\b/i.test(line)) return make('NEW_CALL', 'Incoming Call')
  if (/Routed Call\[/i.test(line)) return make('CALL_INITIALIZED', 'Call Initialized')
  if (/StartNode\.execute/i.test(line)) return make('IVR_STARTED', 'IVR Started')
  if (/PromptNode\.execute/i.test(line)) return make('PROMPT_STARTED', 'Prompt Node')
  const prompt = line.match(/doPlayPrompt\(\).*?prompt\s*:\s*([^,\s]+)/i)?.[1]
  if (prompt) return make('PROMPT_STARTED', `Prompt ${prompt}`, { prompt })
  if (/OnPlayPrompt\(/i.test(line)) return make('PROMPT_COMPLETED', 'Prompt Completed')
  if (/doCollectDigits\(\).*?minNumOfDigits/i.test(line)) return make('COLLECT_DIGITS_STARTED', 'Collect Digits Started')
  const failed = line.match(/OnCollectDigits\(\).*?unable to collect digits.*?error\s*:\s*([^,\s]+).*?collected digits\s*:\s*([^,\s]+)/i)
  if (failed) return make('COLLECT_DIGITS_FAILED', 'Collect Digits Failed', { severity: 'error', errorCode: failed[1], digit: failed[2] })
  const digit = line.match(/digits collected\s*:\s*([^,\s]+)/i)?.[1]
  if (digit && digit.toLowerCase() !== 'null') return make('DIGIT_COLLECTED', `Digit Collected: ${digit}`, { digit })
  if (/sysIvrMaxTriesHit.*?value\s*:\s*1/i.test(line)) return make('IVR_MAX_RETRIES', 'Maximum IVR Retries Reached', { severity: 'error' })
  const retry = line.match(/sysNoOfRetry.*?value\s*:\s*(\d+)/i)?.[1]
  if (retry) return make('IVR_RETRY', `Retry Count: ${retry}`)
  if (/unable to retrieve next node/i.test(line)) return make('NEXT_NODE_FAILED', 'Unable to Retrieve Next Node', { severity: 'error' })
  if (/OnCallRouted\(/i.test(line)) return make('CALL_ROUTED','Call Routed')
  if (/Routed success|routing successful|RouteNode.*success/i.test(line)) return make('ROUTING_SUCCESS', 'Routing Successful')
  if (/RouteNode\.execute/i.test(line)) return make('ROUTE_NODE_STARTED','Route Node Started')
  if (/\bGETAVAILAGT\b(?!_RSP)/i.test(line)) return make('AGENT_LOOKUP','Available Agent Lookup')
  if (/RoutingEntry\.process/i.test(line)) return make('ROUTING_ENTRY','Routing Entry Processing')
  const agent=line.match(/GETAVAILAGT_RSP.*?agent\s*ID\s*:\s*(-?\d+)/i)?.[1]
  if(agent!==undefined)return make('AGENT_RESPONSE',agent==='-1'?'No Available Agent':`Agent ${agent} Selected`,{severity:agent==='-1'?'warning':'info'})
  const booking=line.match(/CONFIRMAGTBOOKING_RSP\s*[|:,]\s*([^|,\s]+)(?:[|,]\s*(\d+))?/i)
  if(booking)return make('AGENT_BOOKING',`Agent Booking ${booking[1]}${booking[2]?` · Extension ${booking[2]}`:''}`,{severity:/^(?:OK|SUCCESS)$/i.test(booking[1])?'info':'error'})
  if (/\bADDCALLRECORD\b(?!_RSP)/i.test(line)) return make('CALL_RECORD_REQUEST','Call Record Requested')
  if (/ADDCALLRECORD_RSP/i.test(line)) return make('CALL_RECORD_RESPONSE','Call Record Confirmed')
  if (/doRouteCall\(/i.test(line)) return make('ROUTE_CALL_STARTED','Route Call Started')
  if (/proceed to hangup|doHangUpCall\(\).*hanging up/i.test(line)) return make('SYSTEM_HANGUP', 'System Hangup', { severity: 'warning' })
  if (/OnCallDisconnected\(/i.test(line)) return make('CALL_DISCONNECTED', 'Call Disconnected')
  if (/routing failed|RouteNode.*error/i.test(line)) return make('ROUTING_FAILED', 'Routing Failed', { severity: 'error' })
  if (/\bERROR\b|exception/i.test(line)) return make('UNKNOWN_ERROR', 'Application Error', { severity: 'error' })
}

const elapsed=(events:IvrEvent[],from:IvrEventType,to:IvrEventType)=>{const start=events.find(e=>e.type===from)?.timestampMs;const end=events.find(e=>e.type===to&&e.timestampMs!==undefined)?.timestampMs;return start!==undefined&&end!==undefined&&end>=start?end-start:undefined}
function finish(call: IvrCall, thresholds:IvrThresholds): IvrCall {
  const events = call.events.sort((a,b)=>(a.timestampMs ?? Number.MAX_SAFE_INTEGER) - (b.timestampMs ?? Number.MAX_SAFE_INTEGER) || a.lineNumber - b.lineNumber)
  const attempts = events.filter(e=>e.type==='COLLECT_DIGITS_STARTED').length
  const failed = events.filter(e=>e.type==='COLLECT_DIGITS_FAILED').length
  const successful = events.filter(e=>e.type==='DIGIT_COLLECTED').length
  const nextFailed = events.some(e=>e.type==='NEXT_NODE_FAILED')
  const maxRetries = events.some(e=>e.type==='IVR_MAX_RETRIES')
  const systemHangup = events.some(e=>e.type==='SYSTEM_HANGUP')
  const explicitError = events.some(e=>e.severity==='error')
  const severity: IvrSeverity = events.some(e=>e.type==='UNKNOWN_ERROR') ? 'Critical' : nextFailed || (failed>1&&systemHangup) || (maxRetries&&systemHangup) ? 'Failed' : failed ? 'Warning' : events.length ? 'Healthy' : 'Unknown'
  const routed = events.some(e=>e.type==='ROUTING_SUCCESS'||e.type==='CALL_ROUTED') || (call.numberOfRoutes??0)>0
  call.timings={routingQueueMs:elapsed(events,'ROUTE_NODE_STARTED','AGENT_LOOKUP'),agentLookupMs:elapsed(events,'AGENT_LOOKUP','AGENT_RESPONSE'),addCallRecordMs:elapsed(events,'CALL_RECORD_REQUEST','CALL_RECORD_RESPONSE'),routeCallMs:elapsed(events,'ROUTE_CALL_STARTED','CALL_ROUTED'),configuredRouteTimeoutMs:call.timings.configuredRouteTimeoutMs}
  const warnings:string[]=[]
  if(failed)warnings.push(`${failed} digit collection attempt${failed===1?'':'s'} failed`)
  if(call.timings.routingQueueMs!==undefined&&call.timings.routingQueueMs>thresholds.routingQueueWarningMs)warnings.push(`Routing queue latency was ${(call.timings.routingQueueMs/1000).toFixed(2)} seconds`)
  if(call.timings.agentLookupMs!==undefined&&call.timings.agentLookupMs>thresholds.agentLookupWarningMs)warnings.push(`Agent lookup latency was ${(call.timings.agentLookupMs/1000).toFixed(2)} seconds`)
  const disconnected=events.some(e=>e.type==='CALL_DISCONNECTED')
  call.outcome=routed?(warnings.length?'Routed Successfully with Warnings':'Routed Successfully'):disconnected?'Disconnected Before Routing':'Routing Failed';call.warnings=warnings
  call.startTime=events[0]?.timestamp; call.endTime=events.at(-1)?.timestamp
  call.collectDigitAttempts=attempts; call.failedAttempts=failed; call.successfulAttempts=successful
  call.ivrStatus=routed?(warnings.length?'Warning':'Healthy'):severity; call.routingStatus=routed?'Reached':nextFailed||disconnected||call.numberOfRoutes===0?'Not Reached':'Unknown'
  call.primaryFailureStage=failed?'Collect Digits':nextFailed?'IVR Flow':undefined
  call.systemAction=nextFailed&&systemHangup?'Hangup after IVR could not continue':systemHangup?'System Hangup':undefined
  call.finding=routed ? `The call was routed successfully${call.selectedExtension?` to extension ${call.selectedExtension}`:''}${warnings.length?' after recoverable warnings were detected.':'.'}` : failed ? `The IVR attempted to collect caller input ${attempts} ${attempts===1?'time':'times'}. ${failed} attempt${failed===1?'':'s'} failed${successful?' before a successful input.':' and returned no collected digit.'}${nextFailed?' The IVR then reported that it was unable to retrieve the next node and proceeded to hang up.':''}` : explicitError?'The log contains an explicit IVR processing error.':'No successful route completion was detected in the available events.'
  call.possibleCause=failed?'The log shows that eFrontVoice-IVR was unable to collect a digit. Additional telephony/SIP/CTI logs may be required to determine why the input was not collected.':'The available IVR events do not establish an underlying cause.'
  call.possibleImpact=failed||nextFailed?'The caller could not continue through the IVR menu and may not have reached the intended downstream route.':'No confirmed caller impact was identified.'
  call.conclusion=routed?`Final classification: ${call.outcome}.`:failed&&systemHangup?'The call ended at the Collect Digits stage. No successful digit input or routing event was detected before the system initiated the hangup.':nextFailed?'The IVR flow could not continue to its next node.':disconnected?'The call disconnected before a completed route was detected.':'The available log evidence is insufficient for a definitive conclusion.'
  call.problemScore=(severity==='Critical'?100:severity==='Failed'?80:severity==='Warning'?40:0)+(explicitError?10:0)+(nextFailed?8:0)+(maxRetries?5:0)
  return call
}

export function analyzeIvrCalls(records: string[], thresholds:IvrThresholds=DEFAULT_IVR_THRESHOLDS): IvrCall[] {
  const calls=new Map<string,IvrCall>(); let activeCallId:string|undefined; let activePhone:string|undefined
  records.forEach((line,index)=>{ const ctx=parseIvrContext(line); activeCallId=ctx.callId??activeCallId; activePhone=ctx.phoneNumber??activePhone; if(!activeCallId||!activePhone)return
    const call=calls.get(activeCallId)??{phoneNumber:activePhone,callId:activeCallId,events:[],ivrStatus:'Unknown',outcome:'Routing Failed',routingStatus:'Unknown',collectDigitAttempts:0,successfulAttempts:0,failedAttempts:0,timings:{},warnings:[],finding:'',possibleCause:'',possibleImpact:'',conclusion:'',problemScore:0}
    call.phoneNumber=ctx.phoneNumber??call.phoneNumber; call.routePoint=ctx.routePoint??call.routePoint; call.campaignPhoneNumber=ctx.routePoint??call.campaignPhoneNumber; call.taskNumber=ctx.taskNumber??call.taskNumber
    call.campaignId=line.match(/(?:campaignID|sysCampaignID)\s*[:,]\s*(?:value\s*:\s*)?(\d+)/i)?.[1]??call.campaignId
    call.transactionId=line.match(/call transaction ID\s*:\s*(\d+)/i)?.[1]??line.match(/sysTransactionID.*?value\s*:\s*(\d+)/i)?.[1]??call.transactionId
    call.selectedAgentId=line.match(/GETAVAILAGT_RSP.*?agent\s*ID\s*:\s*(\d+)/i)?.[1]??line.match(/UPDATECALLTRANSACTION\|(\d+)\|/i)?.[1]??call.selectedAgentId
    const booking=line.match(/CONFIRMAGTBOOKING_RSP\s*[|:,]\s*([^|,\s]+)(?:[|,]\s*(\d+))?/i);if(booking){call.bookingResult=booking[1];call.selectedExtension=booking[2]??call.selectedExtension}
    call.selectedExtension=line.match(/agentExtension\s*:\s*(\d+)/i)?.[1]??call.selectedExtension
    const timeout=line.match(/doRouteCall\(\).*?(?:timeout|routeTimeout)\s*[:=]\s*(\d+)/i)?.[1];if(timeout)call.timings.configuredRouteTimeoutMs=Number(timeout)
    call.callStatus=line.match(/callStatus\s*:\s*(\d+)/i)?.[1]??call.callStatus
    const nr=line.match(/numberOfRoutes(?:\s+is|\s*:)\s*(\d+)/i)?.[1]; const tr=line.match(/totalRoutes(?:\s+is|\s*:)\s*(\d+)/i)?.[1]; if(nr)call.numberOfRoutes=Number(nr);if(tr)call.totalRoutes=Number(tr)
    const event=eventFor(line,index+1);if(event)call.events.push(event);calls.set(activeCallId,call)
  }); return [...calls.values()].map(call=>finish(call,thresholds))
}
