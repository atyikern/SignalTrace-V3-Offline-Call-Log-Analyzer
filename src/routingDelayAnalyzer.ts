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

function outcome(responses:RoutingDelayResponse[],disconnects:number,continued:boolean):RoutingOutcome{
  const selected=[...responses].reverse().find(r=>r.responseId>=0)
  const hadNoAgent=responses.some(r=>r.responseId===-1)
  if(disconnects&&!continued&&!selected)return'Connection Interrupted'
  if(selected&&hadNoAgent)return'Agent Found After Retry'
  if(selected)return'Agent Found'
  if(responses.at(-1)?.responseId===-1)return'No Available Agent'
  return'Incomplete Routing'
}

export function analyzeRoutingDelay(text:string):RoutingDelayAnalysis[]{
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

    for(const {line} of scoped){
      if(/startClient\(\)/i.test(line)){const p=parseIvrTimestamp(line);if(clientStartMs===undefined||(p?.timestampMs??Infinity)<clientStartMs){clientStartMs=p?.timestampMs;clientStartTime=p?.timestamp}events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'CLIENT_STARTED',label:'Messaging routing session started'})}
      if(/stopClient\(\)/i.test(line)){const p=parseIvrTimestamp(line);if(clientStopMs===undefined||(p?.timestampMs??-1)>clientStopMs){clientStopMs=p?.timestampMs;clientStopTime=p?.timestamp}events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'CLIENT_STOPPED',label:'Messaging routing session ended'})}

      const req=requestOf(line)
      if(req){if(req.routingEntryId)routingIds.add(req.routingEntryId);const duplicate=req.routingEntryId?reqById.get(req.routingEntryId):undefined;if(!duplicate){attempts.push(req);if(req.routingEntryId)reqById.set(req.routingEntryId,req);events.push({timestamp:req.timestamp,timestampMs:req.timestampMs,type:'AGENT_SEARCH',label:attempts.length===1?'Available-agent search requested':'Available-agent search retried'})}}

      const rsp=responseOf(line)
      if(rsp){if(rsp.routingEntryId)routingIds.add(rsp.routingEntryId);const duplicate=rsp.routingEntryId?rspById.get(rsp.routingEntryId):undefined;if(!duplicate){const attempt=(rsp.routingEntryId?reqById.get(rsp.routingEntryId):undefined)??[...attempts].reverse().find(a=>!a.response);if(attempt?.timestampMs!==undefined&&rsp.timestampMs!==undefined)rsp.latencyMs=Math.max(0,rsp.timestampMs-attempt.timestampMs);if(attempt)attempt.response=rsp;responses.push(rsp);if(rsp.routingEntryId)rspById.set(rsp.routingEntryId,rsp);events.push({timestamp:rsp.timestamp,timestampMs:rsp.timestampMs,type:'AGENT_RESPONSE',label:agentMeaning(rsp.responseId)})}}

      if(/disconnected\(\),\s*IVR client was disconnected from callfront server,\s*reconnecting/i.test(line)){const p=parseIvrTimestamp(line);disconnectionCount++;lastDisconnectMs=p?.timestampMs;events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'CONNECTION_INTERRUPTED',label:'CallFront connection interrupted; reconnecting'})}

      const proc=line.match(/processRoutingEntry\(\)\s*==\s*RoutingEntry process time\s*:\s*(\d+)\s+of max:\s*(\d+)/i)
      if(proc){processingValue=Number(proc[1]);maximumProcessingValue=Number(proc[2]);const p=parseIvrTimestamp(line);events.push({timestamp:p?.timestamp,timestampMs:p?.timestampMs,type:'PROCESSING_VALUE',label:`RoutingEntry processing value ${processingValue} of ${maximumProcessingValue}`})}
    }

    events.sort((a,b)=>(a.timestampMs??Infinity)-(b.timestampMs??Infinity))
    const reqTimes=attempts.map(a=>a.timestampMs).filter((x):x is number=>x!==undefined)
    const retryIntervals=reqTimes.slice(1).map((t,i)=>t-reqTimes[i]).filter(x=>x>=0)
    const latencies=responses.map(r=>r.latencyMs).filter((x):x is number=>x!==undefined)
    const first=attempts.find(a=>a.timestampMs!==undefined),final=[...responses].reverse().find(r=>r.timestampMs!==undefined),selected=[...responses].reverse().find(r=>r.responseId>=0)
    const totalRoutingWaitMs=first?.timestampMs!==undefined&&final?.timestampMs!==undefined?Math.max(0,final.timestampMs-first.timestampMs):undefined
    const searchEnd=selected??final
    const agentSearchDurationMs=first?.timestampMs!==undefined&&searchEnd?.timestampMs!==undefined?Math.max(0,searchEnd.timestampMs-first.timestampMs):undefined
    const routingSessionDurationMs=clientStartMs!==undefined&&clientStopMs!==undefined?Math.max(0,clientStopMs-clientStartMs):undefined
    const ids=responses.map(r=>r.responseId),finalResponseId=ids.at(-1),repeatedResponseId=ids.length>1?mode(ids.slice(0,-1)):ids[0]
    const noAvailableAgentResponses=responses.filter(r=>r.responseId===-1).length
    const responseStateChanged=ids.length>1&&new Set(ids).size>1
    const continued=lastDisconnectMs!==undefined&&events.some(e=>(e.timestampMs??-1)>lastDisconnectMs!&&['AGENT_SEARCH','AGENT_RESPONSE','CLIENT_STOPPED'].includes(e.type))
    const routingOutcome=outcome(responses,disconnectionCount,continued)
    const status=classify(totalRoutingWaitMs),avgRetry=mean(retryIntervals),avgLatency=mean(latencies),last=responses.at(-1)

    const finding=status==='Incomplete'?'Routing activity was detected, but the available log range was not sufficient to calculate the full routing wait.':`${status} detected. The available-agent routing flow lasted ${fmt(totalRoutingWaitMs)} across ${attempts.length} unique GETAVAILAGT attempt${attempts.length===1?'':'s'}.${selected?` Agent ${selected.responseId} was selected.`:routingOutcome==='No Available Agent'?' No available agent was found in the final response.':''}${noAvailableAgentResponses?` ${noAvailableAgentResponses} no-available-agent response${noAvailableAgentResponses===1?'':'s'} were observed.`:''}${avgRetry!==undefined?` Average retry interval was ${fmt(avgRetry)}.`:''}${avgLatency!==undefined?` Individual GETAVAILAGT responses averaged ${fmt(avgLatency)}.`:''}`
    let rootCauseAssessment='Routing delay was measured from the available-agent request/response sequence. Review the routing session, retry cadence, agent result, connection events, and RoutingEntry processing values together.'
    if(status==='Incomplete')rootCauseAssessment='The log confirms routing activity but does not contain enough request/response evidence to determine the complete routing-delay pattern.'
    else if(disconnectionCount&&routingOutcome==='Connection Interrupted')rootCauseAssessment='The routing session was interrupted by a CallFront client disconnection without confirmed successful continuation in the available evidence.'
    else if(totalRoutingWaitMs!==undefined&&totalRoutingWaitMs>=30000&&avgLatency!==undefined&&avgLatency<1000)rootCauseAssessment=responseStateChanged?'The delay accumulated while the message repeatedly remained in the GETAVAILAGT routing loop. Individual CallFront request/response exchanges were comparatively fast, and the agent-routing result changed later in the sequence.':'The delay accumulated while the message repeatedly remained in the GETAVAILAGT routing loop. Individual CallFront request/response exchanges were comparatively fast.'

    result.push({customerNumber,webSocketSession,clientStartTime,clientStopTime,routingSessionDurationMs,routingStart:first?.timestamp,routingEnd:final?.timestamp,totalRoutingWaitMs,agentSearchStart:first?.timestamp,agentSearchEnd:searchEnd?.timestamp,agentSearchDurationMs,lookupAttempts:attempts.length,noAvailableAgentResponses,selectedAgentId:selected?.responseId,routingOutcome,averageRetryIntervalMs:avgRetry,minimumRetryIntervalMs:min(retryIntervals),maximumRetryIntervalMs:max(retryIntervals),averageResponseLatencyMs:avgLatency,minimumResponseLatencyMs:min(latencies),maximumResponseLatencyMs:max(latencies),repeatedResponseId,finalResponseId,responseStateChanged,preferredLanguage:last?.preferredLanguage,defaultLanguage:last?.defaultLanguage,preferredProduct:last?.preferredProduct,defaultProduct:last?.defaultProduct,processingValue,maximumProcessingValue,usagePercentage:processingValue!==undefined&&maximumProcessingValue?(processingValue/maximumProcessingValue)*100:undefined,routingEntryIds:[...routingIds],disconnectionCount,status,finding,rootCauseAssessment,attempts,responses,events})
  }
  return result.sort((a,b)=>(b.totalRoutingWaitMs??-1)-(a.totalRoutingWaitMs??-1))
}
