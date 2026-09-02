import { parseIvrTimestamp } from './ivrAnalyzer'
import type { AgentRoutingEvent, RoutingDelayAnalysis, RoutingDelayAttempt, RoutingDelayResponse, RoutingDelayStatus, RoutingOutcome } from './types'

type RoutingRow = { line:string; lineNumber:number }

const SHELL_NOISE=/^(?:sh-[\d.]+\$|>|\s*(?:sudo\s+(?:grep|more)|cd\s+\/opt\/ocapp\/|log\.log(?:\.\d{4}-\d{2}-\d{2})?))/i

export function normalizeRoutingDelayRecords(text:string):string[]{
  return text.split(/\r?\n|(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})/).map(row=>row.trim()).filter(row=>row&&!SHELL_NOISE.test(row))
}

export function isRoutingDelayLog(records:string[]):boolean{
  return records.some(record=>/\bstartClient\(\)|\bstopClient\(\)|RoutingEntry_\d+|GETAVAILAGT(?:_RSP)?|processRoutingEntry\(\)\s*==\s*RoutingEntry process time/i.test(record))
}

const boolFromPipe=(value?:string):boolean|undefined=>value===undefined?undefined:/^true$/i.test(value)?true:/^false$/i.test(value)?false:undefined
const sessionOf=(line:string)=>line.match(/\[(WS_[^\]]+)\]/i)?.[1]
const routingEntryOf=(line:string)=>line.match(/(RoutingEntry_\d+)/i)?.[1]
function customerOf(line:string):string|undefined{
  return line.match(/\[WS_[^\]]*#(\d{7,15})#/i)?.[1]
    ?? line.match(/\]\s*\[(\d{7,15})\]\s+/)?.[1]
    ?? line.match(/\bGETAVAILAGT\|[^\r\n]*?\|(\d{7,15})\|(?:true|false)\|(?:true|false)\|/i)?.[1]
    ?? line.match(/\b(\d{9,15})\b/g)?.at(-1)
}

function requestOf(line:string):RoutingDelayAttempt|undefined{
  if(!/\bGETAVAILAGT\|/i.test(line)||/GETAVAILAGT_RSP/i.test(line))return
  const parsed=parseIvrTimestamp(line)
  return{routingEntryId:routingEntryOf(line),timestamp:parsed?.timestamp,timestampMs:parsed?.timestampMs}
}

function textResponse(line:string):RoutingDelayResponse|undefined{
  const match=line.match(/received\s*GETAVAILAGT_RSP\s+with\s+agent\s+ID:\s*(-?\d+)/i);if(!match)return
  const parsed=parseIvrTimestamp(line)
  const flag=(label:string)=>{const m=line.match(new RegExp(`${label}(?: Result)?\\s*[:=]\\s*(true|false)`,'i'));return m?m[1].toLowerCase()==='true':undefined}
  return{responseId:Number(match[1]),timestamp:parsed?.timestamp,timestampMs:parsed?.timestampMs,routingEntryId:routingEntryOf(line),preferredLanguage:flag('Preferred Language'),defaultLanguage:flag('Default Language'),preferredProduct:flag('Preferred Product'),defaultProduct:flag('Default Product')}
}

function pipeResponse(line:string):RoutingDelayResponse|undefined{
  const match=line.match(/GETAVAILAGT_RSP\|(-?\d+)\|(true|false)\|(true|false)\|(true|false)\|(true|false)/i);if(!match)return
  const parsed=parseIvrTimestamp(line)
  return{responseId:Number(match[1]),timestamp:parsed?.timestamp,timestampMs:parsed?.timestampMs,routingEntryId:routingEntryOf(line),preferredLanguage:boolFromPipe(match[2]),defaultLanguage:boolFromPipe(match[3]),preferredProduct:boolFromPipe(match[4]),defaultProduct:boolFromPipe(match[5])}
}
const responseOf=(line:string)=>textResponse(line)??pipeResponse(line)
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:undefined
const min=(v:number[])=>v.length?Math.min(...v):undefined
const max=(v:number[])=>v.length?Math.max(...v):undefined
function mode(v:number[]):number|undefined{if(!v.length)return;const c=new Map<number,number>();v.forEach(x=>c.set(x,(c.get(x)??0)+1));return[...c].sort((a,b)=>b[1]-a[1])[0]?.[0]}
function classify(ms?:number):RoutingDelayStatus{return ms===undefined?'Incomplete':ms<10000?'Normal':ms<30000?'Minor Routing Wait':ms<60000?'Routing Delay':'Extended Routing Delay'}
function fmt(ms?:number){if(ms===undefined)return'unknown duration';if(ms<1000)return`${Math.round(ms)} ms`;const sec=Math.round(ms/1000),m=Math.floor(sec/60),s=sec%60;return m?`${m}m ${s}s`:`${sec}s`}
const agentMeaning=(id:number)=>id===-1?'No available agent':`Agent ${id} found`
const selectionStatus=(ms?:number):RoutingDelayAnalysis['selectCurrentMsgAgentStatus']=>ms===undefined?undefined:ms>=5000?'CRITICAL - SEVERE':ms>=1000?'CRITICAL':ms>=100?'WARNING':'GOOD'
const callIdOf=(line:string)=>line.match(/\b(?:callID|call id)\s*[:=]\s*([\w-]+)/i)?.[1]??line.match(/^\S+\s+\S+\s+\[[^\]]+\]\s+\[([^\]]+)\]/)?.[1]
const agentGroupOf=(line:string)=>line.match(/agent\s*group\s*(?:ID)?\s*[:=]\s*(\d+)/i)?.[1]??line.match(/GETAVAILAGT\|\d+\|(\d+)\|/i)?.[1]
function capacityOf(lines:string[],agentId?:number){
  if(agentId===undefined)return{}
  const near=lines.filter(line=>new RegExp(`(?:agent(?:\\s*ID)?\\s*[:=]\\s*)?${agentId}\\b`,'i').test(line))
  let occupied:number|undefined,maximum:number|undefined
  for(const line of near){
    const occupiedMatch=line.match(/(?:occupied|current(?:\s+occupied)?|hasCall(?:s)?)\s*[:=]\s*(\d+)/i)?.[1]
    const maximumMatch=line.match(/(?:max(?:imum)?(?:\s+(?:call|capacity|slot)s?)?|capacity|slots?)\s*[:=]\s*(\d+)/i)?.[1]
    if(occupiedMatch!==undefined)occupied=Number(occupiedMatch)
    if(maximumMatch!==undefined)maximum=Number(maximumMatch)
  }
  return {agentOccupiedSlots:occupied,agentMaximumCapacity:maximum,agentHasAvailableCapacity:occupied!==undefined&&maximum!==undefined?occupied<maximum:undefined}
}

function outcome(responses:RoutingDelayResponse[],disconnects:number,continued:boolean):RoutingOutcome{
  const selected=[...responses].reverse().find(r=>r.responseId>=0)
  const hadNoAgent=responses.some(r=>r.responseId===-1)
  if(disconnects&&!continued&&!selected)return'Connection Interrupted'
  if(selected&&hadNoAgent)return'Agent Found After Retry'
  if(selected)return'Agent Found'
  if(responses.at(-1)?.responseId===-1)return'No Available Agent'
  return'Incomplete Routing'
}

export function analyzeRoutingDelay(text:string,module:RoutingDelayAnalysis['module']='Voice'):RoutingDelayAnalysis[]{
  const records=normalizeRoutingDelayRecords(text);if(!isRoutingDelayLog(records))return[]
  const rows:RoutingRow[]=records.map((line,index)=>({line,lineNumber:index+1}))
  const sessions=[...new Set(rows.map(r=>sessionOf(r.line)).filter((x):x is string=>Boolean(x)))]
  const groups=new Map<string,RoutingRow[]>()
  if(sessions.length){sessions.forEach(s=>groups.set(s,[]));rows.forEach(r=>{const s=sessionOf(r.line);if(s&&groups.has(s))groups.get(s)!.push(r)})}else groups.set('routing-delay',rows)

  const result:RoutingDelayAnalysis[]=[]
  for(const [sessionKey,scoped] of groups){
    if(!scoped.length)continue
    const customerNumber=scoped.map(r=>customerOf(r.line)).find(Boolean)??(sessionKey==='routing-delay'?undefined:sessionKey.match(/#(\d{7,15})#/)?.[1])
    const webSocketSession=sessionKey==='routing-delay'?undefined:sessionKey
    const attempts:RoutingDelayAttempt[]=[];const responses:RoutingDelayResponse[]=[];const events:AgentRoutingEvent[]=[]
    const routingIds=new Set<string>();const reqById=new Map<string,RoutingDelayAttempt>();const rspById=new Map<string,RoutingDelayResponse>()
    let clientStartTime:string|undefined,clientStartMs:number|undefined,clientStopTime:string|undefined,clientStopMs:number|undefined
    let disconnectionCount=0,lastDisconnectMs:number|undefined,processingValue:number|undefined,maximumProcessingValue:number|undefined
    const selections:number[]=[];let bookingCancellations=0,automaticUnbookEvents=0,bookingAttempts=0,lastBookingMs:number|undefined,successConfirmed=false,explicitFailure=false
    const bookingAgents:number[]=[]

    for(const {line} of scoped){
      if(/startClient\(\)/i.test(line)){const p=parseIvrTimestamp(line);if(clientStartMs===undefined||(p?.timestampMs??Infinity)<clientStartMs){clientStartMs=p?.timestampMs;clientStartTime=p?.timestamp}events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'CLIENT_STARTED',label:'Messaging routing session started'})}
      if(/stopClient\(\)/i.test(line)){const p=parseIvrTimestamp(line);if(clientStopMs===undefined||(p?.timestampMs??-1)>clientStopMs){clientStopMs=p?.timestampMs;clientStopTime=p?.timestamp}events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'CLIENT_STOPPED',label:'Messaging routing session ended'})}

      const req=requestOf(line)
      if(req){if(req.routingEntryId)routingIds.add(req.routingEntryId);const duplicate=req.routingEntryId?reqById.get(req.routingEntryId):undefined;if(!duplicate){attempts.push(req);if(req.routingEntryId)reqById.set(req.routingEntryId,req);events.push({timestamp:req.timestamp,timestampMs:req.timestampMs,type:'AGENT_SEARCH',label:attempts.length===1?'Available-agent search requested':'Available-agent search retried',rawLine:line})}}

      const rsp=responseOf(line)
      if(rsp){if(rsp.routingEntryId)routingIds.add(rsp.routingEntryId);const duplicate=rsp.routingEntryId?rspById.get(rsp.routingEntryId):undefined;if(!duplicate){const attempt=(rsp.routingEntryId?reqById.get(rsp.routingEntryId):undefined)??[...attempts].reverse().find(a=>!a.response);if(attempt?.timestampMs!==undefined&&rsp.timestampMs!==undefined)rsp.latencyMs=Math.max(0,rsp.timestampMs-attempt.timestampMs);if(attempt)attempt.response=rsp;responses.push(rsp);if(rsp.routingEntryId)rspById.set(rsp.routingEntryId,rsp);events.push({timestamp:rsp.timestamp,timestampMs:rsp.timestampMs,type:'AGENT_RESPONSE',label:agentMeaning(rsp.responseId),rawLine:line})}}

      if(/disconnected\(\),\s*IVR client was disconnected from callfront server,\s*reconnecting/i.test(line)){const p=parseIvrTimestamp(line);disconnectionCount++;lastDisconnectMs=p?.timestampMs;events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'CONNECTION_INTERRUPTED',label:'CallFront connection interrupted; reconnecting'})}

      const selection=line.match(/selectCurrentMsgAgent\([^)]*\)\s*took\s*:\s*(\d+)\s*ms/i)
      if(selection){const ms=Number(selection[1]),p=parseIvrTimestamp(line);selections.push(ms);events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'PROCESSING_VALUE',label:`selectCurrentMsgAgent() took ${ms} ms (${selectionStatus(ms)})`,rawLine:line})}
      if(/cancelAgentBooking|automatically\s+unbooking\s+agent|\bUnbookTask\b/i.test(line)){bookingCancellations++;if(/automatically\s+unbooking\s+agent|\bUnbookTask\b/i.test(line))automaticUnbookEvents++;const p=parseIvrTimestamp(line);events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'PROCESSING_VALUE',label:'Agent booking cancelled or unbooked',rawLine:line})}
      const bookingAgent=line.match(/(?:agent\s*ID|unbooking\s+agent)\s*[:=]\s*(\d+)/i)?.[1]
      if(bookingAgent!==undefined&&/cancelAgentBooking|unbooking\s+agent|\bUnbookTask\b|confirmAgentBooking|CONFIRMAGTBOOKING|booked\s+by\s+IVR/i.test(line))bookingAgents.push(Number(bookingAgent))
      if(/confirmAgentBooking|CONFIRMAGTBOOKING(?:_RSP)?|booked\s+by\s+IVR/i.test(line)){bookingAttempts++;const p=parseIvrTimestamp(line);if(p?.timestampMs!==undefined)lastBookingMs=p.timestampMs;events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'PROCESSING_VALUE',label:'Agent booking confirmed',rawLine:line})}
      if(/confirmAgentBooking|CONFIRMAGTBOOKING_RSP\s*[|:,]\s*(?:OK|SUCCESS)|\b(?:call routed|OnCallRouted|agent answered|call connected)\b/i.test(line))successConfirmed=true
      if(/\b(?:timeout|exception|routing failed|fatal error)\b/i.test(line))explicitFailure=true

      const proc=line.match(/processRoutingEntry\(\)\s*==\s*RoutingEntry process time\s*:\s*(\d+)\s+of max:\s*(\d+)/i)
      if(proc){processingValue=Number(proc[1]);maximumProcessingValue=Number(proc[2]);const p=parseIvrTimestamp(line);events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'PROCESSING_VALUE',label:`RoutingEntry processing value ${processingValue} of ${maximumProcessingValue}`})}
    }

    events.sort((a,b)=>(a.timestampMs??Infinity)-(b.timestampMs??Infinity))
    attempts.sort((a,b)=>(a.timestampMs??Infinity)-(b.timestampMs??Infinity))
    responses.sort((a,b)=>(a.timestampMs??Infinity)-(b.timestampMs??Infinity))
    const reqTimes=attempts.map(a=>a.timestampMs).filter((x):x is number=>x!==undefined)
    const retryIntervals=reqTimes.slice(1).map((t,i)=>t-reqTimes[i]).filter(x=>x>=0)
    const latencies=responses.map(r=>r.latencyMs).filter((x):x is number=>x!==undefined)
    const first=attempts.find(a=>a.timestampMs!==undefined)
    const responsesInSearchWindow=first?.timestampMs===undefined?responses:responses.filter(response=>response.timestampMs===undefined||response.timestampMs>=first.timestampMs!)
    const final=[...responsesInSearchWindow].reverse().find(r=>r.timestampMs!==undefined),selected=[...responsesInSearchWindow].reverse().find(r=>r.responseId>=0)
    const totalRoutingWaitMs=first?.timestampMs!==undefined&&final?.timestampMs!==undefined?Math.max(0,final.timestampMs-first.timestampMs):undefined
    const searchEnd=selected??final
    const agentSearchDurationMs=first?.timestampMs!==undefined&&searchEnd?.timestampMs!==undefined?Math.max(0,searchEnd.timestampMs-first.timestampMs):undefined
    const routingSessionDurationMs=clientStartMs!==undefined&&clientStopMs!==undefined?Math.max(0,clientStopMs-clientStartMs):undefined
    const ids=responsesInSearchWindow.map(r=>r.responseId),finalResponseId=ids.at(-1),repeatedResponseId=ids.length>1?mode(ids.slice(0,-1)):ids[0]
    const noAvailableAgentResponses=responsesInSearchWindow.filter(r=>r.responseId===-1).length
    const responseStateChanged=ids.length>1&&new Set(ids).size>1
    const continued=lastDisconnectMs!==undefined&&events.some(e=>(e.timestampMs??-1)>lastDisconnectMs!&&['AGENT_SEARCH','AGENT_RESPONSE','CLIENT_STOPPED'].includes(e.type))
    const routingOutcome=outcome(responsesInSearchWindow,disconnectionCount,continued)
    const status=classify(totalRoutingWaitMs),avgRetry=mean(retryIntervals),avgLatency=mean(latencies),last=responses.at(-1)
    const slowResponseCount=latencies.filter(ms=>ms>2000).length
    const overlappingRequestCount=attempts.filter((attempt,index)=>{const attemptMs=attempt.timestampMs;return index>0&&attemptMs!==undefined&&attempts.slice(0,index).some(previous=>previous.timestampMs!==undefined&&(!previous.response?.timestampMs||previous.response.timestampMs>attemptMs))}).length
    const longestSelectCurrentMsgAgentDurationMs=max(selections),selectedAgentId=selected?.responseId
    const capacity=capacityOf(records,selectedAgentId)
    const totalRoutingTimeMs=first?.timestampMs!==undefined&&(lastBookingMs??searchEnd?.timestampMs)!==undefined?Math.max(0,(lastBookingMs??searchEnd!.timestampMs!)-first.timestampMs):undefined
    const cumulativeSelectCurrentMsgAgentDurationMs=selections.reduce((sum,value)=>sum+value,0)
    const affectedAgentId=bookingAgents.length?mode(bookingAgents):undefined
    const agentBookingRetryDetected=bookingCancellations>0&&bookingAttempts>1
    const slowestResponse=max(latencies)
    const selectIsSlowest=(longestSelectCurrentMsgAgentDurationMs??-1)>=(slowestResponse??-1)
    const slowestRoutingStep=longestSelectCurrentMsgAgentDurationMs!==undefined&&selectIsSlowest?'selectCurrentMsgAgent()':slowestResponse!==undefined?'GETAVAILAGT response':undefined
    const slowestStepDurationMs=selectIsSlowest?longestSelectCurrentMsgAgentDurationMs:slowestResponse
    const primaryDelaySource=selectIsSlowest&&longestSelectCurrentMsgAgentDurationMs!==undefined?'selectCurrentMsgAgent()':slowestRoutingStep
    const finalRoutingOutcome=successConfirmed?'Confirmed Successful':(explicitFailure||routingOutcome==='Connection Interrupted'||noAvailableAgentResponses>=2)?'Failed':'Not Confirmed'
    const evidenceCompleteness=finalRoutingOutcome==='Not Confirmed'?'Partial':'Complete'
    const routingHealth=(explicitFailure||routingOutcome==='Connection Interrupted'||attempts.length>3||(longestSelectCurrentMsgAgentDurationMs??0)>=1000||(agentBookingRetryDetected&&bookingCancellations>1)||noAvailableAgentResponses>=2||(totalRoutingTimeMs??0)>=10000)?'CRITICAL':(attempts.length>=2||(longestSelectCurrentMsgAgentDurationMs??0)>=100||bookingCancellations>0||noAvailableAgentResponses===1||(slowestResponse??0)>=1000)?'WARNING':'GOOD'

    const finding=routingHealth==='GOOD'?`No abnormal routing delay detected.${finalRoutingOutcome==='Not Confirmed'?' The final routing outcome could not be confirmed from the available log segment.':''}`:routingHealth==='WARNING'?`Routing completed or continued with warning-level delay indicators.${finalRoutingOutcome==='Not Confirmed'?' The final routing outcome could not be confirmed from the available log segment.':''}`:`Critical routing-delay evidence was detected.${finalRoutingOutcome==='Not Confirmed'?' The final routing outcome could not be confirmed from the available log segment.':''}`
    let rootCauseAssessment='Routing delay was measured from the available-agent request/response sequence. Review the routing session, retry cadence, agent result, connection events, booking lifecycle, capacity, and RoutingEntry processing values together.'
    if(status==='Incomplete')rootCauseAssessment='The log confirms routing activity but does not contain enough request/response evidence to determine the complete routing-delay pattern.'
    else if(disconnectionCount&&routingOutcome==='Connection Interrupted')rootCauseAssessment='The routing session was interrupted by a CallFront client disconnection without confirmed successful continuation in the available evidence.'
    else if(longestSelectCurrentMsgAgentDurationMs!==undefined&&longestSelectCurrentMsgAgentDurationMs>=1000)rootCauseAssessment=`Abnormal selectCurrentMsgAgent() latency (${fmt(longestSelectCurrentMsgAgentDurationMs)}) is the likely root cause. ${cumulativeSelectCurrentMsgAgentDurationMs>longestSelectCurrentMsgAgentDurationMs?`${fmt(cumulativeSelectCurrentMsgAgentDurationMs)} accumulated across lookups. `:''}${overlappingRequestCount?'Subsequent GETAVAILAGT requests accumulated while it was pending. ':''}${capacity.agentHasAvailableCapacity?'The selected agent still had available capacity, so an existing call is not evidence of unavailability. ':''}Investigate database performance, locking/contention, indexing, load, and SQL execution plans.`
    else if(totalRoutingWaitMs!==undefined&&totalRoutingWaitMs>=30000&&avgLatency!==undefined&&avgLatency<1000)rootCauseAssessment=responseStateChanged?'The delay accumulated while the message repeatedly remained in the GETAVAILAGT routing loop. Individual CallFront request/response exchanges were comparatively fast, and the agent-routing result changed later in the sequence.':'The delay accumulated while the message repeatedly remained in the GETAVAILAGT routing loop. Individual CallFront request/response exchanges were comparatively fast.'

    result.push({customerNumber,webSocketSession,callId:scoped.map(r=>callIdOf(r.line)).find(Boolean),agentGroupId:scoped.map(r=>agentGroupOf(r.line)).find(Boolean),clientStartTime,clientStopTime,routingSessionDurationMs,routingStart:first?.timestamp,routingEnd:final?.timestamp,totalRoutingWaitMs,agentSearchStart:first?.timestamp,agentSearchEnd:searchEnd?.timestamp,agentSearchDurationMs,lookupAttempts:attempts.length,noAvailableAgentResponses,selectedAgentId,routingOutcome,averageRetryIntervalMs:avgRetry,minimumRetryIntervalMs:min(retryIntervals),maximumRetryIntervalMs:max(retryIntervals),averageResponseLatencyMs:avgLatency,minimumResponseLatencyMs:min(latencies),maximumResponseLatencyMs:max(latencies),slowResponseCount,overlappingRequestCount,selectCurrentMsgAgentDurationsMs:selections,longestSelectCurrentMsgAgentDurationMs,selectCurrentMsgAgentStatus:selectionStatus(longestSelectCurrentMsgAgentDurationMs),bookingCancellations,automaticUnbookEvents,...capacity,concurrentSlowRoutingSessions:0,module,routingHealth,totalRoutingTimeMs,retryCount:Math.max(0,attempts.length-1),slowestRoutingStep,slowestStepDurationMs,cumulativeSelectCurrentMsgAgentDurationMs,bookingAttempts,affectedAgentId,agentBookingRetryDetected,primaryDelaySource,finalRoutingOutcome,evidenceCompleteness,repeatedResponseId,finalResponseId,responseStateChanged,preferredLanguage:last?.preferredLanguage,defaultLanguage:last?.defaultLanguage,preferredProduct:last?.preferredProduct,defaultProduct:last?.defaultProduct,processingValue,maximumProcessingValue,usagePercentage:processingValue!==undefined&&maximumProcessingValue?(processingValue/maximumProcessingValue)*100:undefined,routingEntryIds:[...routingIds],disconnectionCount,status,finding,rootCauseAssessment,attempts,responses,events})
  }
  result.forEach(item=>{item.concurrentSlowRoutingSessions=result.filter(other=>other!==item&&other.totalRoutingWaitMs!==undefined&&other.totalRoutingWaitMs>=10000&&item.routingStart&&other.routingStart&&Math.abs((other.attempts[0]?.timestampMs??0)-(item.attempts[0]?.timestampMs??0))<=60000).length})
  return result.sort((a,b)=>(b.totalRoutingWaitMs??-1)-(a.totalRoutingWaitMs??-1))
}
