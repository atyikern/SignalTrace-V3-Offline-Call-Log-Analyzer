export type NetworkSeverity = 'critical' | 'important' | 'media-quality'
export type LogType = 'socketio-efv' | 'pjsip-rtt' | 'efrontvoice-ivr' | 'efrontvoice' | 'asterisk-ivr' | 'asterisk-voicemail' | 'opscentral-webhook' | 'ocod5-whatsapp' | 'routing-delay' | 'messaging-routing-delay' | 'messaging-license'

export interface ModuleReference {
  id: number
  name: string
  active: boolean
  note?: string
}

export const MODULE_REFERENCES: Record<number, ModuleReference> = {
  1: { id: 1, name: 'eFrontVoice', active: true },
  2: { id: 2, name: 'eFrontVoice IVR', active: false, note: 'Unused in OC5' },
  3: { id: 3, name: 'eFrontVoice Dialer', active: false, note: 'Unused in OC5' },
  4: { id: 4, name: 'eFrontVoice Mobile', active: false, note: 'Unused in OC5' },
  5: { id: 5, name: 'eFrontVoice Recorder', active: false, note: 'Unused in OC5' },
  6: { id: 6, name: 'eFrontMail', active: true },
  8: { id: 8, name: 'eFrontFax', active: false, note: 'Unused in OC5' },
  10: { id: 10, name: 'eFrontVoice Analysis', active: false, note: 'Unused in OC5' },
  11: { id: 11, name: 'Management', active: true },
  12: { id: 12, name: 'eFrontVoice Report', active: false, note: 'Unused in OC5' },
  13: { id: 13, name: 'eFrontMail Analysis', active: false, note: 'Unused in OC5' },
  14: { id: 14, name: 'eFrontMail Management', active: false, note: 'Unused in OC5' },
  15: { id: 15, name: 'eFrontMail Report', active: false, note: 'Unused in OC5' },
  16: { id: 16, name: 'eFrontFax Analysis', active: false, note: 'Unused in OC5' },
  17: { id: 17, name: 'eFrontFax Management', active: false, note: 'Unused in OC5' },
  18: { id: 18, name: 'eFrontFax Report', active: false, note: 'Unused in OC5' },
  19: { id: 19, name: 'Messaging', active: true },
  20: { id: 20, name: 'CM', active: true },
  21: { id: 21, name: 'CRM', active: true },
  22: { id: 22, name: 'Ticketing', active: true },
  23: { id: 23, name: 'OnCall CRM', active: true },
  1001: { id: 1001, name: 'Chatbot', active: true },
  1002: { id: 1002, name: 'Email', active: true },
  1003: { id: 1003, name: 'Call', active: true },
  1004: { id: 1004, name: 'Voice Management', active: true },
  1005: { id: 1005, name: 'KB', active: true },
}

export const moduleReferenceFor = (moduleId: number): ModuleReference =>
  MODULE_REFERENCES[moduleId] ?? { id: moduleId, name: `Unknown Module ${moduleId}`, active: true }


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
  whatsappMessages: WhatsappMessageAnalysis[]
  voicemailCalls: VoicemailCallAnalysis[]
  routingDelayAnalyses: RoutingDelayAnalysis[]
  licenseOccupancyAnalyses: LicenseOccupancyAnalysis[]
}

export type VoicemailOutcome='No voicemail saved'|'Voicemail saved successfully'|'Mailbox configuration problem'|'Storage or permission problem'|'Voicemail application error'|'Inconclusive'
export type VoicemailClassification='Caller hung up before recording'|'Caller or upstream channel disconnected during voicemail recording'|'Recording too short and abandoned'|'Valid voicemail saved successfully'|'Mailbox unavailable or not configured'|'File permission or storage problem'|'Voicemail application error'|'Unknown cause due to incomplete logs'
export interface VoicemailEvent { timestamp?:string;epochMs?:number;lineNumber:number;type:'ROUTED'|'GREETING'|'BEEP'|'RECORDING_STARTED'|'DISCONNECTED'|'DURATION'|'ABANDONED'|'SAVED'|'MAILBOX_ERROR'|'STORAGE_ERROR'|'APPLICATION_ERROR';label:string;rawLine:string }
export interface VoicemailCallAnalysis { key:string;callId?:string;callerNumber?:string;calledNumber?:string;mailbox?:string;context?:string;channels:string[];outcome:VoicemailOutcome;classification:VoicemailClassification;confidence:'High'|'Medium'|'Low';recordingDurationSeconds?:number;minimumDurationSeconds?:number;events:VoicemailEvent[];finding:string;rootCause:string;recommendedActions:string[];problemScore:number }


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
export interface AgentRoutingEvent { timestamp?:string; timestampMs?:number; type:'CLIENT_STARTED'|'AGENT_SEARCH'|'AGENT_RESPONSE'|'CONNECTION_INTERRUPTED'|'CLIENT_STOPPED'|'PROCESSING_VALUE'; label:string; rawLine?:string }
export interface AgentRoutingAnalysis { customerNumber?:string; webSocketSession?:string; routingEntryId?:string; clientStartTime?:string; agentSearchTime?:string; agentResponseTime?:string; agentLookupDelayMs?:number; selectedAgentId?:number; lookupAttempts:number; responseAgentIds:number[]; preferredLanguage?:boolean; defaultLanguage?:boolean; preferredProduct?:boolean; defaultProduct?:boolean; finalStatus:AgentRoutingStatus; connectionWarning?:string; disconnectionCount:number; processingValue?:number; maximumProcessingValue?:number; usagePercentage?:number; rawGetAvailableAgentParameters?:string; events:AgentRoutingEvent[]; finding:string }


export type RoutingDelayStatus = 'Normal'|'Minor Routing Wait'|'Routing Delay'|'Extended Routing Delay'|'Incomplete'
export interface RoutingDelayResponse { responseId:number; timestamp?:string; timestampMs?:number; latencyMs?:number; preferredLanguage?:boolean; defaultLanguage?:boolean; preferredProduct?:boolean; defaultProduct?:boolean; routingEntryId?:string }
export interface RoutingDelayAttempt { routingEntryId?:string; timestamp?:string; timestampMs?:number; response?:RoutingDelayResponse }
export type RoutingOutcome = 'Agent Found'|'Agent Found After Retry'|'No Available Agent'|'Connection Interrupted'|'Incomplete Routing'
export type AgentSelectionDurationStatus = 'GOOD'|'WARNING'|'CRITICAL'|'CRITICAL - SEVERE'
export type RoutingHealth = 'GOOD'|'WARNING'|'CRITICAL'
export type FinalRoutingOutcome = 'Confirmed Successful'|'Not Confirmed'|'Failed'
export type EvidenceCompleteness = 'Complete'|'Partial'
export interface RoutingDelayAnalysis {
  customerNumber?:string
  webSocketSession?:string
  clientStartTime?:string
  clientStopTime?:string
  routingSessionDurationMs?:number
  routingStart?:string
  routingEnd?:string
  totalRoutingWaitMs?:number
  agentSearchStart?:string
  agentSearchEnd?:string
  agentSearchDurationMs?:number
  lookupAttempts:number
  noAvailableAgentResponses:number
  selectedAgentId?:number
  callId?:string
  agentGroupId?:string
  routingOutcome:RoutingOutcome
  averageRetryIntervalMs?:number
  minimumRetryIntervalMs?:number
  maximumRetryIntervalMs?:number
  averageResponseLatencyMs?:number
  minimumResponseLatencyMs?:number
  maximumResponseLatencyMs?:number
  slowResponseCount:number
  overlappingRequestCount:number
  selectCurrentMsgAgentDurationsMs:number[]
  longestSelectCurrentMsgAgentDurationMs?:number
  selectCurrentMsgAgentStatus?:AgentSelectionDurationStatus
  bookingCancellations:number
  automaticUnbookEvents:number
  agentOccupiedSlots?:number
  agentMaximumCapacity?:number
  agentHasAvailableCapacity?:boolean
  concurrentSlowRoutingSessions:number
  module:'Voice'|'Messaging'
  routingHealth:RoutingHealth
  totalRoutingTimeMs?:number
  retryCount:number
  slowestRoutingStep?:string
  slowestStepDurationMs?:number
  cumulativeSelectCurrentMsgAgentDurationMs:number
  bookingAttempts:number
  affectedAgentId?:number
  agentBookingRetryDetected:boolean
  primaryDelaySource?:string
  finalRoutingOutcome:FinalRoutingOutcome
  evidenceCompleteness:EvidenceCompleteness
  repeatedResponseId?:number
  finalResponseId?:number
  responseStateChanged:boolean
  preferredLanguage?:boolean
  defaultLanguage?:boolean
  preferredProduct?:boolean
  defaultProduct?:boolean
  processingValue?:number
  maximumProcessingValue?:number
  usagePercentage?:number
  routingEntryIds:string[]
  disconnectionCount:number
  status:RoutingDelayStatus
  finding:string
  rootCauseAssessment:string
  attempts:RoutingDelayAttempt[]
  responses:RoutingDelayResponse[]
  events:AgentRoutingEvent[]
}

export type WebhookStatus = 'Successfully Routed'|'Blacklisted'|'Outside Operation Hours'|'Invalid Selection'|'Timeout'|'Processing Error'|'Incomplete / Unknown'
export interface WebhookEvidence { timestamp?:string; timestampMs?:number; lineNumber:number; label:string; maskedRecord:string }
export interface WebhookNode { id:string; type:string }
export interface WebhookTransaction { trxId:string; customerNumber?:string; maskedCustomer:string; startTimestamp?:string; endTimestamp?:string; processingDurationMs?:number; threadName?:string; startNode?:string; currentNode?:string; nextNode?:string; nodeJourney:WebhookNode[]; messageIds:string[]; selectedOption?:string; blacklistResult?:'Passed'|'Blocked'; holidayResult?:boolean; operationHours?:'Open'|'Closed'; routeNode?:string; transactionStatus?:string; agentGroupId?:string; timeoutIndicators:string[]; errors:string[]; status:WebhookStatus; evidence:WebhookEvidence[]; finding:string; importantNote?:string; recommendations:string[]; problemScore:number; agentRouting?:AgentRoutingAnalysis }

export type WhatsappStatus='Delivered and read'|'Delivered, awaiting read'|'Sent, awaiting delivery'|'Inbound message received'|'Send/delivery failed'|'Pending / incomplete evidence'
export interface WhatsappEvidence { timestamp?:string; timestampMs?:number; providerTimestampMs?:number; lineNumber:number; type:'SEND_ATTEMPT'|'PROVIDER_SUBMISSION'|'SENT'|'DELIVERED'|'READ'|'INBOUND'|'FAILURE'; label:string; rawLine:string; duplicate?:boolean }
export interface WhatsappTimings { sendToSentMs?:number; sentToDeliveredMs?:number; deliveredToReadMs?:number; inboundToResponseMs?:number; webhookLagMs?:number }
export interface WhatsappMessageAnalysis { key:string; conversationId?:string; messageId?:string; taskId?:string; transactionId?:string; campaignId?:string; customerNumber?:string; maskedCustomer:string; businessNumber?:string; maskedBusiness:string; wabaId?:string; userId?:string; direction:'Inbound'|'Outbound'|'Unknown'; messageType?:string; conversationType?:string; contextualReplyId?:string; status:WhatsappStatus; statusProgression:string[]; duplicateCallbacks:number; warnings:string[]; errors:string[]; timings:WhatsappTimings; events:WhatsappEvidence[]; finding:string; problemScore:number }


export type LicensePoolStatus = 'NORMAL'|'NEAR LIMIT'|'FULL'|'EXCEEDED'|'INSUFFICIENT'|'UNKNOWN'
export type AgentMessagingCapacityStatus = 'AVAILABLE'|'NEAR LIMIT'|'FULL'|'EXCEEDED'|'UNKNOWN'

export interface LicenseOccupancyEvent {
  timestamp?: string
  timestampMs?: number
  lineNumber: number
  type: 'LICENSE'|'LOGIN'|'AGENT_CAPACITY'|'ROUTING'|'BOOKING'
  label: string
  rawLine: string
}

export interface AgentMessagingCapacity {
  agentId: string
  currentSessionCampaign?: number
  currentSessionAll?: number
  maxSessionCampaign?: number
  peakSessionCampaign?: number
  availableSlots?: number
  utilizationPercentage?: number
  peakUtilizationPercentage?: number
  status: AgentMessagingCapacityStatus
  firstSeen?: string
  lastSeen?: string
  observations: number
  events: LicenseOccupancyEvent[]
}

export interface LicenseOccupancyAnalysis {
  key: string
  moduleId: number
  usedLicense?: number
  totalLicense?: number
  licenseUtilizationPercentage?: number
  licenseStatus: LicensePoolStatus
  licenseInsufficientDetected: boolean
  selectedAgentId?: string
  agents: AgentMessagingCapacity[]
  fullAgents: number
  exceededAgents: number
  availableAgents: number
  noAvailableAgentResponses: number
  successfulBookings: number
  finding: string
  rootCause: string
  recommendations: string[]
  events: LicenseOccupancyEvent[]
}
