import { normalizeLogRecords, parseTimestamp } from './pjsipAnalyzer'
import type { AsteriskIvrCall, AsteriskIvrEvent, AsteriskIvrRoutingResult } from './types'

const statusResult: Record<string, AsteriskIvrRoutingResult> = { BUSY: 'Busy', CHANUNAVAIL: 'Channel Unavailable', NOANSWER: 'No Answer' }
const timeOnly = (value?: string) => value?.match(/\d{2}:\d{2}:\d{2}/)?.[0]

function details(line:string) {
  return {
    processId: line.match(/\[(\d{1,6})\]/)?.[1] ?? line.match(/Process ID\s*=>\s*(\d+)/i)?.[1],
    callerId: line.match(/Caller ID\s*=>\s*([^\s,]+)/i)?.[1],
    dnis: line.match(/DNIS\s*=>\s*([^\s,]+)/i)?.[1],
    linkedId: line.match(/linkedid\s*=\s*['"]?([^'"\s,}]+)/i)?.[1],
    uniqueId: line.match(/(?:destUniqueId|uniqueid)\s*=\s*['"]?([^'"\s,}]+)/i)?.[1],
    destinationChannel: line.match(/(?:destination|destchannel)\s*=\s*['"]?([^'"\s,}]+)/i)?.[1],
    sourceChannel: line.match(/\b(?:sourcechannel|channel)\s*=\s*['"]?([^'"\s,}]+)/i)?.[1],
  }
}

function eventsFor(line:string,lineNumber:number):AsteriskIvrEvent[] {
  const parsed=parseTimestamp(line); const base={timestamp:parsed?.timestamp,epochMs:parsed?.epochMs,lineNumber,rawLine:line};const events:AsteriskIvrEvent[]=[]
  const add=(type:AsteriskIvrEvent['type'],label:string)=>events.push({...base,type,label})
  if(/Process ID\s*=>|Caller ID\s*=>/i.test(line))add('INBOUND','Inbound call received')
  const destination=line.match(/destination=PJSIP\/([^\s,;'"-]+)/i)?.[1];if(destination)add('DIAL',`Routed to extension ${destination}`)
  if(/channelstatedesc\s*=\s*['"]Ringing['"]|state\s*=\s*['"]Ringing['"]/i.test(line))add('RINGING','Extension started ringing')
  if(/channelstatedesc\s*=\s*['"]Up['"]|state\s*=\s*['"]Up['"]/i.test(line))add('ANSWERED','Extension answered')
  if(/Sg State\s*=>\s*TRANSF/i.test(line))add('TRANSFER',/Sg Cause\s*=>\s*NORMACAUSE/i.test(line)?'Transfer completed normally':'Transfer recorded')
  const status=line.match(/\b(BUSY|CHANUNAVAIL|NOANSWER)\b/i)?.[1]?.toUpperCase();if(status)add('STATUS',statusResult[status])
  return events
}

export function analyzeAsteriskIvr(text:string):AsteriskIvrCall[] {
  const records=normalizeLogRecords(text); const calls=new Map<string,AsteriskIvrCall>();const linkedKeys=new Map<string,string>();const uniqueKeys=new Map<string,string>(); let activeKey:string|undefined
  records.forEach((line,index)=>{const d=details(line);const parsedTime=parseTimestamp(line);const callerFallback=d.callerId&&parsedTime?`caller:${d.callerId}:${parsedTime.epochMs}`:undefined;const key=d.processId?`process:${d.processId}`:d.linkedId?(linkedKeys.get(d.linkedId)??activeKey??`linked:${d.linkedId}`):d.uniqueId?(uniqueKeys.get(d.uniqueId)??activeKey??`unique:${d.uniqueId}`):callerFallback??activeKey
    if(!key)return; activeKey=key;if(d.linkedId)linkedKeys.set(d.linkedId,key);if(d.uniqueId)uniqueKeys.set(d.uniqueId,key);const call=calls.get(key)??{key,events:[],routingResult:'Incomplete / Unknown',finding:'',recommendedActions:[],problemScore:10}
    Object.assign(call,{processId:d.processId??call.processId,callerId:d.callerId??call.callerId,dnis:d.dnis??call.dnis,linkedId:d.linkedId??call.linkedId,uniqueId:d.uniqueId??call.uniqueId,sourceChannel:d.sourceChannel??call.sourceChannel,destinationChannel:d.destinationChannel??call.destinationChannel})
    call.agentExtension=line.match(/destination=PJSIP\/([^\s,;'"-]+)/i)?.[1]??call.agentExtension
    const parsed=parseTimestamp(line);call.startTimestamp=call.startTimestamp??parsed?.timestamp
    const events=eventsFor(line,index+1);for(const event of events){call.events.push(event);if(event.type==='RINGING')call.ringingTimestamp=event.timestamp;if(event.type==='ANSWERED')call.answeredTimestamp=event.timestamp}
    const status=line.match(/\b(BUSY|CHANUNAVAIL|NOANSWER)\b/i)?.[1]?.toUpperCase();if(status)call.dialStatus=status
    if(/Sg State\s*=>\s*TRANSF/i.test(line))call.transferResult=/Sg Cause\s*=>\s*NORMACAUSE/i.test(line)?'TRANSF / NORMACAUSE':'TRANSF'
    calls.set(key,call)})
  return [...calls.values()].filter(call=>call.events.length>0).map(call=>{call.events.sort((a,b)=>(a.epochMs??Number.MAX_SAFE_INTEGER)-(b.epochMs??Number.MAX_SAFE_INTEGER)||a.lineNumber-b.lineNumber)
    const answered=call.events.some(e=>e.type==='ANSWERED');const transferred=call.transferResult==='TRANSF / NORMACAUSE'
    call.routingResult=transferred?'Successfully Transferred':answered?'Successfully Answered':call.dialStatus?statusResult[call.dialStatus]:'Incomplete / Unknown'
    if(call.ringingTimestamp&&call.answeredTimestamp){const a=parseTimestamp(call.ringingTimestamp)?.epochMs,b=parseTimestamp(call.answeredTimestamp)?.epochMs;if(a!==undefined&&b!==undefined)call.ringDurationSeconds=Math.max(0,Math.round((b-a)/1000))}
    const destination=call.agentExtension??'the selected destination';call.problemScore=call.routingResult==='Channel Unavailable'?90:call.routingResult==='Busy'?80:call.routingResult==='No Answer'?70:call.routingResult==='Incomplete / Unknown'?40:0
    call.finding=call.routingResult==='Successfully Answered'?`Caller ${call.callerId??'Unknown'} was successfully routed to extension ${destination} and answered.`:call.routingResult==='Successfully Transferred'?`The call was transferred normally${answered?' after the destination answered':''}.`:call.routingResult==='Busy'?`The call could not be connected because extension ${destination} was busy.`:call.routingResult==='Channel Unavailable'?'The destination channel was unavailable.':call.routingResult==='No Answer'?'The extension rang but was not answered before the configured timeout.':'Routing activity was detected, but no final answer or failure status could be identified.'
    call.recommendedActions=call.routingResult==='Busy'?['Check whether the agent was already handling another call.','Review queue retry and overflow routing.','Confirm the agent’s busy-state configuration.']:call.routingResult==='Channel Unavailable'?['Check whether the extension is registered.','Verify WebRTC/SIP connectivity.','Check endpoint and trunk availability.','Review Asterisk peer/endpoint status.']:call.routingResult==='No Answer'?['Confirm the agent was logged in and available.','Check the ringing timeout.','Review missed-call, queue retry, and overflow configuration.']:[]
    return call}).sort((a,b)=>b.problemScore-a.problemScore||(timeOnly(b.startTimestamp)??'').localeCompare(timeOnly(a.startTimestamp)??''))
}
