import { moduleReferenceFor } from './types'
import type { AgentAnalysis, AsteriskIvrCall, ExtensionNetworkAnalysis, IvrCall, LicenseOccupancyAnalysis, RoutingDelayAnalysis, VoiceCall, VoiceExtensionAnalysis, VoicemailCallAnalysis, WebhookTransaction, WhatsappMessageAnalysis } from './types'

export interface ResultField { label:string; value:string|number }
export interface ResultTimelineItem { timestamp?:string; title:string; raw?:string; sortTime?:number; lineNumber?:number }
export interface ResultTable {
  title:string
  description?:string
  columns:string[]
  rows:Array<Array<string|number>>
}
export interface NormalizedAnalysisResult {
  moduleName:string
  title:string
  finalStatus:string
  statusProgression?:string[]
  statusBreakdown?:ResultField[]
  tables?:ResultTable[]
  duplicateEvents?:number
  summary:ResultField[]
  technicalDetails:ResultField[]
  timeline:ResultTimelineItem[]
  finding:string
  rootCause:string
  recommendations:string[]
}

const field=(label:string,value:unknown):ResultField|undefined=>value===undefined||value===null||value===''?undefined:{label,value:String(value)}
const fields=(...items:Array<ResultField|undefined>)=>items.filter((item):item is ResultField=>Boolean(item))
const duration=(value?:number)=>value===undefined?undefined:value<1000?`${value} ms`:`${(value/1000).toFixed(2)} sec`
const ordered=(items:ResultTimelineItem[])=>items.sort((a,b)=>(a.sortTime??Number.MAX_SAFE_INTEGER)-(b.sortTime??Number.MAX_SAFE_INTEGER)||(a.lineNumber??0)-(b.lineNumber??0))

export function normalizeWhatsapp(message:WhatsappMessageAnalysis):NormalizedAnalysisResult {
  const route=message.direction==='Inbound'?`Customer ${message.customerNumber??'Unknown'} → Business ${message.businessNumber??'Unknown'}`:`Business ${message.businessNumber??'Unknown'} → Customer ${message.customerNumber??'Unknown'}`
  return {moduleName:'OCOD5 WhatsApp Messaging',title:'Message delivery analysis',finalStatus:message.status,statusProgression:message.statusProgression,duplicateEvents:message.duplicateCallbacks,
    summary:fields(field('Transaction ID',message.transactionId),field('Campaign ID',message.campaignId),field('Message Type',message.messageType),field('Route',route),field('Send → Sent',duration(message.timings.sendToSentMs)),field('Sent → Delivered',duration(message.timings.sentToDeliveredMs)),field('Delivered → Read',duration(message.timings.deliveredToReadMs)),field('Webhook Lag',duration(message.timings.webhookLagMs))),
    technicalDetails:fields(field('Conversation ID',message.conversationId),field('Message ID',message.messageId),field('Task ID',message.taskId),field('WABA ID',message.wabaId),field('User ID',message.userId),field('Reply Context',message.contextualReplyId),field('Customer Phone Number',message.customerNumber),field('Business Phone Number',message.businessNumber)),
    timeline:ordered(message.events.map(event=>({timestamp:event.timestamp,title:event.label,raw:event.rawLine,sortTime:event.timestampMs,lineNumber:event.lineNumber}))),finding:message.finding,rootCause:message.errors[0]??'No confirmed WhatsApp processing failure was detected.',recommendations:message.warnings.length?message.warnings:['Review the technical timeline and provider status callbacks when further confirmation is required.']}
}

export function normalizeWebhook(transaction:WebhookTransaction):NormalizedAnalysisResult {
  const routing=transaction.agentRouting
  return {moduleName:'Webhook',title:'Messaging Flow',finalStatus:transaction.status,statusProgression:transaction.nodeJourney.map(node=>node.id),
    summary:fields(field('Processing Duration',transaction.processingDurationMs===undefined?undefined:`${(transaction.processingDurationMs/1000).toFixed(1)} sec`),field('Message Node Flow ID',transaction.nodeJourney.map(node=>node.id).join(' → ')),field('Selected Option',transaction.selectedOption),field('Agent Group',transaction.agentGroupId),field('Agent Routing Analysis',routing?.finalStatus),field('Lookup Attempts',routing?.lookupAttempts),field('Agent Lookup Delay',duration(routing?.agentLookupDelayMs)),field('Processing Usage',routing?.usagePercentage===undefined?undefined:`${routing.usagePercentage.toFixed(2)}%`)),
    technicalDetails:fields(field('Transaction ID',transaction.trxId),field('Customer Phone Number',transaction.customerNumber),field('Message IDs',transaction.messageIds.join(', ')),field('Thread Name',transaction.threadName),field('Start Node',transaction.startNode),field('Final Node',transaction.nodeJourney.at(-1)?.id),field('Node Types',transaction.nodeJourney.map(node=>`${node.id} ${node.type}`).join(' → ')),field('WebSocket Session',routing?.webSocketSession),field('RoutingEntry ID',routing?.routingEntryId),field('Selected Agent ID',routing?.selectedAgentId),field('Routing Processing Value',routing?.processingValue),field('Maximum Processing Value',routing?.maximumProcessingValue)),
    timeline:ordered([...transaction.evidence.map(item=>({timestamp:item.timestamp,title:item.label,raw:item.maskedRecord,sortTime:item.timestampMs,lineNumber:item.lineNumber})),...(routing?.events.map((item,index)=>({timestamp:item.timestamp,title:item.label,sortTime:item.timestampMs,lineNumber:100000+index}))??[])]),finding:routing?`${transaction.finding} ${routing.finding}`:transaction.finding,rootCause:transaction.errors[0]??routing?.connectionWarning??'No confirmed messaging-flow processing failure was detected.',recommendations:[...transaction.recommendations,...(routing?.selectedAgentId!==undefined&&routing.selectedAgentId>=0?['Agent selection does not confirm agent acceptance or reply.']:[])]}
}

export function normalizeIvr(call:IvrCall):NormalizedAnalysisResult {
  return {moduleName:'eFrontVoice-IVR · V9',title:'IVR Call Flow Analysis',finalStatus:call.outcome,statusProgression:call.events.map(event=>event.label),
    summary:fields(field('IVR Status',call.ivrStatus),field('Routes / Total',`${call.numberOfRoutes??'Not detected'} / ${call.totalRoutes??'Not detected'}`),field('Digit Attempts',call.collectDigitAttempts),field('Routing Queue',duration(call.timings.routingQueueMs)),field('Agent Lookup',duration(call.timings.agentLookupMs)),field('Add Call Record',duration(call.timings.addCallRecordMs)),field('Route Completion',duration(call.timings.routeCallMs)),field('Configured Timeout',duration(call.timings.configuredRouteTimeoutMs))),
    technicalDetails:fields(field('Customer Phone Number',call.phoneNumber),field('Call ID',call.callId),field('TID (Transaction ID)',call.transactionId),field('Campaign Phone Number',call.campaignPhoneNumber??call.routePoint),field('Campaign ID',call.campaignId),field('Task Number',call.taskNumber),field('Selected Agent ID',call.selectedAgentId),field('Selected Extension',call.selectedExtension),field('Booking Result',call.bookingResult)),
    timeline:ordered(call.events.map(event=>({timestamp:event.timestamp,title:`${event.label}${event.errorCode?` · Error ${event.errorCode}`:''}${event.digit==='null'?' · No digit collected':''}`,raw:event.rawLine,sortTime:event.timestampMs,lineNumber:event.lineNumber}))),finding:call.finding,rootCause:call.possibleCause,recommendations:[call.conclusion,...call.warnings]}
}

export function normalizeVoiceCall(call:VoiceCall):NormalizedAnalysisResult {
  return {moduleName:'eFrontVoice',title:'Caller ID Routing Analysis',finalStatus:call.routingStatus,statusProgression:call.events.map(event=>event.label),
    summary:fields(field('Call Status',call.callStatus),field('Agent Search Attempts',call.agentSearchAttempts),field('Agent Search Duration',call.agentSearchDurationSeconds===undefined?undefined:`${call.agentSearchDurationSeconds} sec`)),
    technicalDetails:fields(field('Customer Phone Number',call.callerId),field('Call ID',call.callId),field('TID (Transaction ID)',call.transactionId),field('Telephony Call ID',call.telephonyCallId),field('Campaign ID',call.campaignId),field('Agent Group',call.agentGroupId),field('Agent ID',call.agentId),field('Extension',call.extension),field('Hangup Cause',call.hangupCause)),
    timeline:ordered(call.events.map(event=>({timestamp:event.timestamp,title:event.label,raw:event.rawLine,sortTime:event.timestampMs,lineNumber:event.lineNumber}))),finding:call.finding??'No finding was generated.',rootCause:call.conclusion??call.routingStatus,recommendations:['Review Agent availability, routing eligibility, and the diagnostic timeline.']}
}

export function normalizeVoiceExtension(analysis:VoiceExtensionAnalysis):NormalizedAnalysisResult {
  return {moduleName:'eFrontVoice',title:'Agent Extension Analysis',finalStatus:analysis.extensionStatus,statusProgression:analysis.events.map(event=>event.label),duplicateEvents:undefined,
    summary:fields(field('PBX Status',analysis.pbxStatus),field('Login Status',analysis.loginStatus),field('WebRTC',analysis.registrationStatus),field('Monitoring',analysis.monitoringStatus),field('Current State',analysis.currentState),field('Calls Handled',analysis.callsHandled),field('Warnings',analysis.warnings),field('Unrecovered Errors',analysis.unrecoveredErrors)),
    technicalDetails:fields(field('Extension',analysis.extension),field('Agent ID',analysis.agentId)),timeline:analysis.events.map(event=>({timestamp:event.timestamp,title:event.label,raw:event.rawLine,lineNumber:event.lineNumber})),finding:analysis.finding,rootCause:analysis.conclusion,recommendations:['Review login, WebRTC registration, PBX connectivity, and monitoring events.']}
}

export function normalizeAsterisk(call:AsteriskIvrCall,calls:AsteriskIvrCall[]):NormalizedAnalysisResult {
  const successful=calls.filter(item=>item.routingResult==='Successfully Answered'||item.routingResult==='Successfully Transferred').length
  return {moduleName:'Asterisk-IVR Call Routing',title:'Selected call routing analysis',finalStatus:call.routingResult,
    summary:fields(field('Total Calls',calls.length),field('Successfully Answered',successful),field('Ring Duration',call.ringDurationSeconds===undefined?undefined:`${call.ringDurationSeconds} sec`)),technicalDetails:fields(field('Customer Phone Number',call.callerId),field('DNIS',call.dnis),field('Agent Extension',call.agentExtension),field('Process ID',call.processId),field('Linked ID',call.linkedId),field('Unique ID',call.uniqueId),field('Source Channel',call.sourceChannel),field('Destination Channel',call.destinationChannel),field('Dial Status',call.dialStatus)),timeline:ordered(call.events.map(event=>({timestamp:event.timestamp,title:event.label,raw:event.rawLine,sortTime:event.epochMs,lineNumber:event.lineNumber}))),finding:call.finding,rootCause:call.routingResult,recommendations:call.recommendedActions.length?call.recommendedActions:['No corrective routing action is recommended from this call result.']}
}

export function normalizeVoicemail(call:VoicemailCallAnalysis):NormalizedAnalysisResult {
  return {moduleName:'Asterisk/PBX Voicemail Analysis',title:'Voicemail outcome analysis',finalStatus:call.outcome,statusProgression:call.events.map(event=>event.label),summary:fields(field('Analysis Status',call.outcome),field('Voicemail Outcome',call.outcome),field('Classification',call.classification),field('Confidence Level',call.confidence),field('Recording Duration',call.recordingDurationSeconds===undefined?undefined:`${call.recordingDurationSeconds} seconds`)),technicalDetails:fields(field('Call ID',call.callId),field('Caller Number',call.callerNumber),field('Called Number',call.calledNumber),field('Mailbox',call.mailbox?`${call.mailbox}@${call.context??'default'}`:undefined),field('Channels',call.channels.join(', '))),timeline:ordered(call.events.map(event=>({timestamp:event.timestamp,title:event.label,raw:event.rawLine,sortTime:event.epochMs,lineNumber:event.lineNumber}))),finding:call.finding,rootCause:call.rootCause,recommendations:call.recommendedActions}
}

export function normalizeExtension(analysis:ExtensionNetworkAnalysis):NormalizedAnalysisResult {
  return {moduleName:'RTT / UNREACHABLE',title:'Extension network report',finalStatus:analysis.networkStatus,statusProgression:analysis.events.map(event=>event.status),
    summary:fields(field('Current Status',analysis.currentStatus),field('Unreachable Events',analysis.metrics.unreachableEvents),field('RTT Spikes',analysis.metrics.rttSpikes),field('Highest RTT',analysis.metrics.highestRtt===undefined?undefined:`${analysis.metrics.highestRtt.toFixed(3)} ms`),field('Longest Outage',analysis.metrics.longestOutageSeconds===undefined?undefined:`${analysis.metrics.longestOutageSeconds} sec`)),technicalDetails:fields(field('Extension',analysis.extension),...analysis.events.slice(0,1).flatMap(event=>fields(field('IP Address',event.ipAddress),field('Port',event.port),field('Transport',event.transport),field('Contact ID',event.contactId)))),timeline:analysis.problemTimes.map((problem,index)=>({timestamp:problem.timestamp,title:problem.items.join(' · '),raw:analysis.events.find(event=>event.timestamp===problem.timestamp)?.source.text,lineNumber:index})),finding:analysis.finding,rootCause:analysis.conclusion,recommendations:[analysis.possibleImpact]}
}

export function normalizeAgent(analysis:AgentAnalysis):NormalizedAnalysisResult {
  const events=analysis.problemTimes.map(problem=>({timestamp:problem.timestamp,title:problem.indicators.map(indicator=>`${indicator.label} · ${indicator.severity}`).join(' · '),raw:[...new Set(problem.indicators.map(indicator=>indicator.source.text))].join('\n'),lineNumber:problem.indicators[0]?.source.lineNumber}))
  return {moduleName:'SocketIO / ECONNRESET',title:'Agent network report',finalStatus:analysis.networkStatus,statusProgression:events.map(event=>event.title),summary:[],technicalDetails:fields(field('Agent',analysis.agent),field('Agent ID',analysis.agentId),field('Extension',analysis.extension),field('Session ID',analysis.problemTimes.flatMap(item=>item.indicators).find(item=>item.sessionId)?.sessionId)),timeline:events,finding:analysis.finding,rootCause:analysis.conclusion,recommendations:[analysis.possibleImpact]}
}


export function normalizeRoutingDelay(analysis:RoutingDelayAnalysis):NormalizedAnalysisResult {
  const retryRange=analysis.minimumRetryIntervalMs===undefined&&analysis.maximumRetryIntervalMs===undefined
    ? undefined
    : `${duration(analysis.minimumRetryIntervalMs)??'Unknown'} → ${duration(analysis.maximumRetryIntervalMs)??'Unknown'}`
  const latencyRange=analysis.minimumResponseLatencyMs===undefined&&analysis.maximumResponseLatencyMs===undefined
    ? undefined
    : `${duration(analysis.minimumResponseLatencyMs)??'Unknown'} → ${duration(analysis.maximumResponseLatencyMs)??'Unknown'}`
  const agentMeaning=(agentId?:number)=>agentId===undefined?undefined:agentId===-1?'No Available Agent':`Agent ${agentId}`
  const match=(value?:boolean)=>value===undefined?undefined:value?'Matched':'Not matched'

  return {
    moduleName:'Messaging Routing Delay · V13',
    title:'Available-agent routing delay analysis',
    finalStatus:`${analysis.status} · ${analysis.routingOutcome}`,
    statusProgression:analysis.responses.map(item=>item.responseId===-1?'No Available Agent':`Agent ${item.responseId} Found`),
    summary:fields(
      field('Routing Session Duration',duration(analysis.routingSessionDurationMs)),
      field('Agent Search Duration',duration(analysis.agentSearchDurationMs)),
      field('Total Routing Wait',duration(analysis.totalRoutingWaitMs)),
      field('GETAVAILAGT Attempts',analysis.lookupAttempts),
      field('No-Agent Responses',analysis.noAvailableAgentResponses),
      field('Selected Agent',agentMeaning(analysis.selectedAgentId)),
      field('Average Retry Interval',duration(analysis.averageRetryIntervalMs)),
      field('Retry Interval Range',retryRange),
      field('Average Response Latency',duration(analysis.averageResponseLatencyMs)),
      field('Response Latency Range',latencyRange),
      field('Repeated Agent Result',agentMeaning(analysis.repeatedResponseId)),
      field('Final Agent Result',agentMeaning(analysis.finalResponseId))
    ),
    technicalDetails:fields(
      field('Customer Phone Number',analysis.customerNumber),
      field('WebSocket Session',analysis.webSocketSession),
      field('Routing Session Start',analysis.clientStartTime),
      field('Routing Session End',analysis.clientStopTime),
      field('Agent Search Start',analysis.agentSearchStart),
      field('Agent Search End',analysis.agentSearchEnd),
      field('Agent Result Changed',analysis.responseStateChanged?'Yes':'No'),
      field('Preferred Language',match(analysis.preferredLanguage)),
      field('Default Language',match(analysis.defaultLanguage)),
      field('Preferred Product',match(analysis.preferredProduct)),
      field('Default Product',match(analysis.defaultProduct)),
      field('Routing Processing Value',analysis.processingValue),
      field('Maximum Routing Processing Value',analysis.maximumProcessingValue),
      field('Routing Processing Usage',analysis.usagePercentage===undefined?undefined:`${analysis.usagePercentage.toFixed(2)}%`),
      field('RoutingEntry Count',analysis.routingEntryIds.length),
      field('RoutingEntry IDs',analysis.routingEntryIds.join(', ')),
      field('Disconnection Count',analysis.disconnectionCount)
    ),
    timeline:ordered(analysis.events.map((event,index)=>({
      timestamp:event.timestamp,
      title:event.label,
      sortTime:event.timestampMs,
      lineNumber:index+1
    }))),
    finding:analysis.finding,
    rootCause:analysis.rootCauseAssessment,
    recommendations:[
      analysis.routingOutcome==='No Available Agent'
        ? 'Review agent login state, skillset, campaign eligibility, and availability during the routing period.'
        : 'Review agent availability and routing eligibility during the detected wait period.',
      analysis.disconnectionCount>0
        ? 'Review the CallFront client disconnection/reconnection events and confirm whether routing continued successfully afterward.'
        : 'No CallFront client disconnection was detected in this routing session.',
      analysis.processingValue!==undefined
        ? 'Use the RoutingEntry processing value together with its configured maximum as a routing-load indicator; do not assume the value is milliseconds unless the application unit is confirmed.'
        : 'Upload the processRoutingEntry() log line when RoutingEntry processing values are required.'
    ]
  }
}



export function normalizeLicenseOccupancy(analysis:LicenseOccupancyAnalysis):NormalizedAnalysisResult {
  const percent=(value?:number)=>value===undefined?undefined:`${value.toFixed(1)}%`
  const moduleRef=moduleReferenceFor(analysis.moduleId)
  const licenseDetected=analysis.usedLicense!==undefined||analysis.totalLicense!==undefined||analysis.licenseInsufficientDetected
  const licenseUsage=analysis.usedLicense!==undefined&&analysis.totalLicense!==undefined
    ? `${analysis.usedLicense} / ${analysis.totalLicense}${analysis.licenseUtilizationPercentage!==undefined?` (${percent(analysis.licenseUtilizationPercentage)})`:''}`
    : 'Not detected in uploaded log'

  const agentCapacityStatus=analysis.exceededAgents>0
    ? 'EXCEEDED'
    : analysis.fullAgents>0
      ? 'FULL'
      : analysis.availableAgents>0
        ? 'AVAILABLE'
        : 'UNKNOWN'

  const finalStatus=analysis.exceededAgents>0
    ? 'Agent Capacity EXCEEDED'
    : analysis.fullAgents>0
      ? 'Agent Capacity FULL'
      : analysis.licenseStatus==='INSUFFICIENT'
        ? 'Messaging License INSUFFICIENT'
        : analysis.licenseStatus==='FULL'||analysis.licenseStatus==='EXCEEDED'
          ? `Messaging License ${analysis.licenseStatus}`
          : 'No Capacity Exhaustion Confirmed'

  return {
    moduleName:'Messaging License Occupancy · V14',
    title:'Messaging license and agent-capacity analysis',
    finalStatus,
    statusBreakdown:fields(
      field('Module',`${moduleRef.name} (${analysis.moduleId})`),
      field('Tenant License',licenseDetected?`${analysis.licenseStatus} · ${licenseUsage}`:'Not detected'),
      field('Agent Capacity',`${agentCapacityStatus} · ${analysis.exceededAgents} exceeded · ${analysis.fullAgents} full · ${analysis.availableAgents} with capacity`),
      field('Routing Evidence',`${analysis.noAvailableAgentResponses} no-agent response(s) · ${analysis.successfulBookings} successful booking(s)`)
    ),
    summary:fields(
      field('Module',moduleRef.name),
      field('Module ID',analysis.moduleId),
      field('License Usage',licenseUsage),
      field('License Status',licenseDetected?analysis.licenseStatus:'NOT DETECTED'),
      field('Full Agents',analysis.fullAgents),
      field('Exceeded Agents',analysis.exceededAgents),
      field('Agents With Capacity',analysis.availableAgents),
      field('No-Agent Routing Responses',analysis.noAvailableAgentResponses),
      field('Successful Bookings',analysis.successfulBookings)
    ),
    technicalDetails:fields(
      field('License Insufficient Detected',analysis.licenseInsufficientDetected?'Yes':'No'),
      field('Module Reference Status',moduleRef.active?'Active':'Unused in OC5'),
      field('Module Reference Note',moduleRef.note)
    ),
    tables:[{
      title:'Agent Messaging Capacity',
      description:'One row per agent. Status preserves the highest-severity capacity observed during the uploaded log period; Latest shows the most recent observed session count.',
      columns:['Agent','Latest','Peak','Maximum','Available','Peak Usage','Status','Observations'],
      rows:analysis.agents.map(agent=>[
        agent.agentId,
        agent.currentSessionCampaign??'—',
        agent.peakSessionCampaign??agent.currentSessionCampaign??'—',
        agent.maxSessionCampaign??'—',
        agent.availableSlots??'—',
        percent(agent.peakUtilizationPercentage??agent.utilizationPercentage)??'—',
        agent.status,
        agent.observations
      ])
    }],
    timeline:ordered(analysis.events.map(event=>({
      timestamp:event.timestamp,
      title:event.label,
      raw:event.rawLine,
      sortTime:event.timestampMs,
      lineNumber:event.lineNumber
    }))),
    finding:analysis.finding,
    rootCause:analysis.rootCause,
    recommendations:analysis.recommendations
  }
}
