import { parseIvrTimestamp } from './ivrAnalyzer'
import { normalizeEfrontVoiceRecords } from './voiceAnalyzer'
import type { CallQueueAnalysis, CallQueueEvent, CallQueueClassification } from './types'

export const SAME_LP_BLOCK_THRESHOLD_MS=120_000
export const SAME_LP_BLOCK_MINIMUM_REPEATS=3

const queueData=/Queue\s*Data\s*List\s*=>\s*([^:\s]+)\s*:\s*(\d+)\s*:\s*(\d+)/i
const sameLp=/Skip\s+looking\s+for\s+agent\s*\(\s*Due\s+to\s+there\s+is\s+another\s+call\s+with\s+same\s+LP\s+(?:already|alraedy)\s+queueing\s*\)/i
const event=(line:string,lineNumber:number,type:CallQueueEvent['type'],label:string):CallQueueEvent=>{const time=parseIvrTimestamp(line);return{timestamp:time?.timestamp,timestampMs:time?.timestampMs,lineNumber,type,label,rawLine:line}}

/** Parses eFrontVoice-IVR queue evidence in one chronological pass. */
export function analyzeCallQueue(contents:string):CallQueueAnalysis[]{
 const calls=new Map<string,CallQueueAnalysis>();let active:string|undefined
 const ensure=(id:string,caller?:string)=>{const existing=calls.get(id);if(existing){if(caller)existing.callerId??=caller;return existing}const created:CallQueueAnalysis={key:`queue:${id}`,transactionId:id,callerId:caller,queueCounters:[],routingRules:[],holdOccurred:false,resetOccurred:false,agentSelectionSkipped:false,agentSelectionStarted:false,finalOutcome:'Outcome not established from available evidence.',queueStatus:'WAITING',classification:'INCOMPLETE EVIDENCE',finding:'Queue activity was detected.',rootCause:'The available evidence has not established a final queue outcome.',furtherCheck:[],events:[]};calls.set(id,created);return created}
 const add=(call:CallQueueAnalysis|undefined,item:CallQueueEvent)=>{if(call)call.events.push(item)}
 for(const [index,line] of normalizeEfrontVoiceRecords(contents).entries()){
  const number=index+1,match=line.match(queueData)
  if(match){active=match[2];const call=ensure(match[2],match[1]);call.queueCounters.push(Number(match[3]));add(call,event(line,number,'QUEUE_DATA',`Queue Priority / Counter: ${match[3]}`));continue}
  const inlineId=line.match(/(?:transaction|call)\s*(?:id)?\s*[:=]\s*(\d{8,})/i)?.[1];if(inlineId)active=inlineId
  const call=active?ensure(active):undefined;if(!call)continue
  if(sameLp.test(line)){call.agentSelectionSkipped=true;call.skipReason='Another call with the same LP is already queueing.';add(call,event(line,number,'SAME_LP_SKIP','Agent selection skipped: same LP already queueing'));continue}
  if(/doHoldCall\s*\(\s*\)/i.test(line)){call.holdOccurred=true;add(call,event(line,number,'HOLD','doHoldCall()'));continue}
  if(/RoutingEntry\.resetState\s*\(\s*\)/i.test(line)){call.resetOccurred=true;add(call,event(line,number,'RESET','RoutingEntry.resetState()'));continue}
  const state=line.match(/Routing\s*Entry\s+CallerID\s*:[^\r\n]*?isProcessing\s*:\s*(true|false)[^\r\n]*?isRoutingCall\s*:\s*(true|false)/i)
  if(state){call.isProcessing=state[1].toLowerCase()==='true';call.isRoutingCall=state[2].toLowerCase()==='true';add(call,event(line,number,'ROUTING_STATE',`Routing state: isProcessing:${state[1]}, isRoutingCall:${state[2]}`));continue}
  const rule=line.match(/Current\s+routing\s+rule\s+is\s*(\S+)/i);if(rule){call.routingRules.push(rule[1]);add(call,event(line,number,'ROUTING_RULE',`Current routing rule: ${rule[1]}`));continue}
  const destination=line.match(/Route\s*Algo\s*=>\s*(\S+)\s+Route\s*Dest\s*Type\s*=>\s*(\S+)\s*Route\s*Dest\s*Number\s*=>\s*(\S+)/i);if(destination){call.routeAlgo=destination[1];call.routeDestType=destination[2];call.routeDestNumber=destination[3];add(call,event(line,number,'ROUTE_DESTINATION','Routing rule destination retrieved'));continue}
  const overflow=line.match(/overflow\s*Index\s*(?:=)?\s*(\d+)/i);if(overflow){call.overflowIndex=overflow[1];const rri=line.match(/routingRuleIndex\s*=\s*(\d+)/i);if(rri)call.routingRuleIndex=rri[1];add(call,event(line,number,'OVERFLOW',`Overflow index: ${overflow[1]}`));continue}
  if(/(?:looking\s+for\s+agent|GETAVAILAGT|agent\s+selection\s+start)/i.test(line)){call.agentSelectionStarted=true;add(call,event(line,number,'AGENT_SELECTION','Agent selection started'));continue}
  if(/(?:successfully\s+routed|routing\s+success|agent\s+found|CONFIRMAGTBOOKING_RSP\|OK|route\s+to\s+agent)/i.test(line)){call.queueStatus='ROUTED';call.finalOutcome='Routing later resumed and reached a successful routing indication.';add(call,event(line,number,'ROUTED','Successful routing indication'));continue}
  if(/(?:caller\s+abandon|abandoned|hung\s+up)/i.test(line)){call.queueStatus='ABANDONED';call.finalOutcome='Caller abandonment was observed.';add(call,event(line,number,'ABANDONED','Caller abandoned'));continue}
  if(/(?:call\s+(?:ended|disconnected|completed)|stopClient\(\))/i.test(line)){call.queueStatus='ENDED';call.finalOutcome='Call ended without a confirmed routing outcome.';add(call,event(line,number,'ENDED','Call ended'));}
 }
 const sorted=[...calls.values()].filter(call=>call.events.some(item=>item.type==='QUEUE_DATA'||item.type==='SAME_LP_SKIP')).sort((a,b)=>(a.events[0]?.timestampMs??0)-(b.events[0]?.timestampMs??0))
 for(const call of sorted){const queueEvents=call.events.filter(item=>item.type==='QUEUE_DATA'||item.type==='SAME_LP_SKIP');call.firstQueueTimestamp=queueEvents[0]?.timestamp;call.lastQueueTimestamp=queueEvents.at(-1)?.timestamp;const first=queueEvents[0]?.timestampMs,last=queueEvents.at(-1)?.timestampMs;if(first!==undefined&&last!==undefined&&last>=first)call.observedQueueDurationMs=last-first
  const earlier=sorted.find(candidate=>candidate!==call&&candidate.callerId===call.callerId&&candidate.events[0]?.timestampMs!==undefined&&candidate.events[0].timestampMs<(call.events[0]?.timestampMs??Infinity)&&['ROUTED','ABANDONED','ENDED'].includes(candidate.queueStatus));if(earlier)call.blockingCandidateTransactionId=earlier.transactionId
  const repeats=call.events.filter(item=>item.type==='SAME_LP_SKIP').length,persistent=repeats>=SAME_LP_BLOCK_MINIMUM_REPEATS&&(call.observedQueueDurationMs??0)>=SAME_LP_BLOCK_THRESHOLD_MS
  if(call.agentSelectionSkipped&&call.queueStatus==='ROUTED'){call.classification='QUEUE DELAY ONLY – EVENTUALLY ROUTED';call.finding='The call waited behind another call associated with the same LP, then routing resumed successfully.';call.rootCause='Temporary same-LP queue serialization; this is not a routing fault.'}
  else if(call.agentSelectionSkipped&&earlier&&persistent){call.classification='POSSIBLE STALE QUEUE ENTRY';call.finding='A later call remained blocked by the same-LP queue condition after an earlier candidate call had ended.';call.rootCause='Possible stale queue entry; correlate the earlier call before confirming.'}
  else if(call.agentSelectionSkipped&&persistent){call.classification='POSSIBLE SAME-LP QUEUE BLOCK';call.finding='Repeated same-LP waiting persisted without evidence that agent selection or routing progressed.';call.rootCause='Another same-LP call may still occupy the queue path.'}
  else if(call.agentSelectionSkipped){call.classification=call.queueStatus==='ENDED'?'INCOMPLETE EVIDENCE':'NORMAL QUEUE WAITING';call.finding='The call is waiting behind another call associated with the same LP; agent selection is temporarily skipped.';call.rootCause='Same-LP queue serialization is normal queue behavior and alone is not a routing failure.'}
  call.furtherCheck=['Identify the earlier call using the same LP.','Check when it entered the queue and whether agent selection started.','Verify whether it routed, abandoned, ended, or had its queue state removed.','Confirm when the current call resumed routing.'];if(call.blockingCandidateTransactionId)call.furtherCheck.unshift(`Candidate earlier call transaction ID: ${call.blockingCandidateTransactionId}.`)
 }
 return sorted
}
