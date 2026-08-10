export type NetworkSeverity = 'critical' | 'important' | 'media-quality'
export type LogType = 'socketio-efv' | 'pjsip-rtt' | 'efrontvoice-ivr' | 'efrontvoice' | 'asterisk-ivr' | 'opscentral-webhook'

/** Retained internally for diagnostics and tests; never rendered in the normal UI. */
export interface SourceReference {
  lineNumber: number
  text: string
}

export interface NetworkIndicator {
  label: string
  severity: NetworkSeverity
  sessionId?: string
  source: SourceReference
}

export interface ProblemTime {
  timestamp: string
  displayTime: string
  indicators: NetworkIndicator[]
}

export interface AgentAnalysis {
  key: string
  agent: string
  agentId: string
  extension: string
  networkStatus: string
  problemTimes: ProblemTime[]
  finding: string
  possibleImpact: string
  conclusion: string
}

export interface AnalysisResult {
  fileName: string
  logType?: LogType
  totalLines: number
  ignoredLines: number
  agents: AgentAnalysis[]
  extensions: ExtensionNetworkAnalysis[]
  ivrCalls: IvrCall[]
  voiceCalls: VoiceCall[]
  voiceExtensions: VoiceExtensionAnalysis[]
  asteriskIvrCalls: AsteriskIvrCall[]
  webhookTransactions: WebhookTransaction[]
}


export type VoiceEventType = 'CALL_CREATED'|'AGENT_SEARCH'|'AGENT_BOOKED'|'ROUTE_TO_AGENT'|'AGENT_RINGING'|'CALL_CONNECTED'|'CALL_DISCONNECTED'|'CALL_HOLD'|'ERROR'
export interface VoiceEvent { timestamp?:string; timestampMs?:number; type:VoiceEventType; label:string; rawLine:string; lineNumber:number }
export interface VoiceCall { callerId:string; callId:string; telephonyCallId?:string; transactionId?:string; campaignId?:string; agentGroupId?:string; agentId?:string; extension?:string; routeStart?:string; routeEnd?:string; talkStart?:string; talkEnd?:string; hangupCause?:string; events:VoiceEvent[]; agentSearchAttempts:number; agentSearchDurationSeconds?:number; agentSearchStart?:string; agentSearchEnd?:string; routingStatus:'Successful'|'Agent Booked'|'Not Reached'|'Unknown'; callStatus:string; finding?:string; conclusion?:string; problemScore:number }
export interface VoiceExtensionAnalysis { extension:string; agentId?:string; extensionStatus:'Healthy'|'Warning'|'Failed'|'Unknown'; pbxStatus:string; loginStatus:string; registrationStatus:string; monitoringStatus:string; currentState:string; callsHandled:number; warnings:number; unrecoveredErrors:number; recoveredWarning:boolean; finding:string; conclusion:string; events:Array<{timestamp?:string;label:string;rawLine:string;lineNumber:number}>; problemScore:number }

export type IvrSeverity = 'Critical'|'Failed'|'Warning'|'Healthy'|'Unknown'
export type IvrOutcome = 'Routed Successfully'|'Routed Successfully with Warnings'|'Disconnected Before Routing'|'Routing Failed'
export type IvrEventType = 'NEW_CALL'|'CALL_INITIALIZED'|'IVR_STARTED'|'PROMPT_STARTED'|'PROMPT_COMPLETED'|'COLLECT_DIGITS_STARTED'|'DIGIT_COLLECTED'|'COLLECT_DIGITS_FAILED'|'IVR_RETRY'|'IVR_MAX_RETRIES'|'NEXT_NODE_FAILED'|'ROUTE_NODE_STARTED'|'ROUTING_ENTRY'|'AGENT_LOOKUP'|'AGENT_RESPONSE'|'AGENT_BOOKING'|'CALL_RECORD_REQUEST'|'CALL_RECORD_RESPONSE'|'ROUTE_CALL_STARTED'|'CALL_ROUTED'|'ROUTING_SUCCESS'|'ROUTING_FAILED'|'SYSTEM_HANGUP'|'CALL_DISCONNECTED'|'UNKNOWN_ERROR'
export interface IvrEvent { timestamp?:string; timestampMs?:number; timestampParseFailed?:boolean; type:IvrEventType; label:string; severity:'info'|'warning'|'error'; digit?:string; errorCode?:string; prompt?:string; rawLine:string; lineNumber:number }
export interface IvrTimingMetrics { routingQueueMs?:number; agentLookupMs?:number; addCallRecordMs?:number; routeCallMs?:number; configuredRouteTimeoutMs?:number }
export interface IvrCall { phoneNumber:string; callId:string; routePoint?:string; campaignPhoneNumber?:string; taskNumber?:string; campaignId?:string; transactionId?:string; selectedAgentId?:string; selectedExtension?:string; bookingResult?:string; startTime?:string; endTime?:string; callStatus?:string; numberOfRoutes?:number; totalRoutes?:number; events:IvrEvent[]; ivrStatus:IvrSeverity; outcome:IvrOutcome; routingStatus:'Reached'|'Not Reached'|'Unknown'; collectDigitAttempts:number; successfulAttempts:number; failedAttempts:number; timings:IvrTimingMetrics; warnings:string[]; primaryFailureStage?:string; systemAction?:string; finding:string; possibleCause:string; possibleImpact:string; conclusion:string; problemScore:number }

export type ReachabilityStatus = 'Reachable' | 'Unreachable'
export type RttClassification = 'Good' | 'Warning' | 'High' | 'Critical' | 'Unreachable'
export type ExtensionNetworkStatus = 'Healthy' | 'RTT Warning' | 'High RTT' | 'Unstable' | 'Unreachable'

export interface PjsipRttEvent {
  extension: string
  status: ReachabilityStatus
  rtt: number
  rttClassification: RttClassification
  timestamp: string
  epochMs: number
  ipAddress: string
  port: string
  transport: string
  contactId: string
  source: SourceReference
}

export interface ExtensionProblemTime {
  timestamp: string
  displayTime: string
  items: string[]
}

export interface ExtensionMetrics {
  unreachableEvents: number
  recoveries: number
  longestOutageSeconds?: number
  highestRtt?: number
  averageRtt?: number
  rttSpikes: number
}

export interface ExtensionNetworkAnalysis {
  extension: string
  networkStatus: ExtensionNetworkStatus
  currentStatus: ReachabilityStatus
  problemTimes: ExtensionProblemTime[]
  finding: string
  possibleImpact: string
  conclusion: string
  metrics: ExtensionMetrics
  events: PjsipRttEvent[]
}

export type AsteriskIvrRoutingResult = 'Successfully Answered' | 'Successfully Transferred' | 'Busy' | 'Channel Unavailable' | 'No Answer' | 'Incomplete / Unknown'
export interface AsteriskIvrEvent { timestamp?: string; epochMs?: number; lineNumber: number; type: 'INBOUND'|'DIAL'|'RINGING'|'ANSWERED'|'TRANSFER'|'STATUS'; label: string; rawLine: string }
export interface AsteriskIvrCall { key:string; processId?:string; callerId?:string; dnis?:string; agentExtension?:string; dialStatus?:string; linkedId?:string; uniqueId?:string; sourceChannel?:string; destinationChannel?:string; startTimestamp?:string; ringingTimestamp?:string; answeredTimestamp?:string; transferResult?:string; routingResult:AsteriskIvrRoutingResult; ringDurationSeconds?:number; events:AsteriskIvrEvent[]; finding:string; recommendedActions:string[]; problemScore:number }


export type AgentRoutingStatus = 'Client Started'|'Searching for Available Agent'|'Agent Found'|'Agent Found After Retry'|'No Available Agent'|'CallFront Connection Interrupted'|'Client Stopped'|'Incomplete Agent Routing'
export interface AgentRoutingEvent { timestamp?:string; timestampMs?:number; type:'CLIENT_STARTED'|'AGENT_SEARCH'|'AGENT_RESPONSE'|'CONNECTION_INTERRUPTED'|'CLIENT_STOPPED'|'PROCESSING_VALUE'; label:string }
export interface AgentRoutingAnalysis { customerNumber?:string; webSocketSession?:string; routingEntryId?:string; clientStartTime?:string; agentSearchTime?:string; agentResponseTime?:string; agentLookupDelayMs?:number; selectedAgentId?:number; lookupAttempts:number; responseAgentIds:number[]; preferredLanguage?:boolean; defaultLanguage?:boolean; preferredProduct?:boolean; defaultProduct?:boolean; finalStatus:AgentRoutingStatus; connectionWarning?:string; disconnectionCount:number; processingValue?:number; maximumProcessingValue?:number; usagePercentage?:number; rawGetAvailableAgentParameters?:string; events:AgentRoutingEvent[]; finding:string }

export type WebhookStatus = 'Successfully Routed'|'Blacklisted'|'Outside Operation Hours'|'Invalid Selection'|'Timeout'|'Processing Error'|'Incomplete / Unknown'
export interface WebhookEvidence { timestamp?:string; timestampMs?:number; lineNumber:number; label:string; maskedRecord:string }
export interface WebhookNode { id:string; type:string }
export interface WebhookTransaction { trxId:string; customerNumber?:string; maskedCustomer:string; startTimestamp?:string; endTimestamp?:string; processingDurationMs?:number; threadName?:string; startNode?:string; currentNode?:string; nextNode?:string; nodeJourney:WebhookNode[]; messageIds:string[]; selectedOption?:string; blacklistResult?:'Passed'|'Blocked'; holidayResult?:boolean; operationHours?:'Open'|'Closed'; routeNode?:string; transactionStatus?:string; agentGroupId?:string; timeoutIndicators:string[]; errors:string[]; status:WebhookStatus; evidence:WebhookEvidence[]; finding:string; importantNote?:string; recommendations:string[]; problemScore:number; agentRouting?:AgentRoutingAnalysis }
