import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ChevronDown, FileLock2, FileText, LockKeyhole, Radio, ShieldCheck, Upload } from 'lucide-react'
import { analyzeLog, DEFAULT_GROUPING_WINDOW_MS } from './analyzer'
import type { AgentAnalysis, AnalysisResult, AsteriskIvrCall, ExtensionNetworkAnalysis, IvrCall, LogType, NetworkSeverity, VoiceCall, VoiceExtensionAnalysis, WebhookStatus, WebhookTransaction } from './types'

const ACCEPTED_EXTENSIONS = ['.log', '.txt']
const MAX_FILE_BYTES = 50 * 1024 * 1024

const severityLabel: Record<NetworkSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  'media-quality': 'Media Quality',
}

const LOG_TYPES: Array<{ value: LogType; label: string }> = [
  { value: 'socketio-efv', label: 'SocketIO / EFV' },
  { value: 'pjsip-rtt', label: 'PJSIP RTT / Reachability' },
  { value: 'asterisk-ivr', label: 'Asterisk-IVR' },
  { value: 'opscentral-webhook', label: 'OpsCentral Webhook' },
  { value: 'efrontvoice-ivr', label: 'eFrontVoice-IVR' },
  { value: 'efrontvoice', label: 'eFrontVoice' },
]

function EmptyState({ logType, file, onLogType, onUpload, onAnalyze }: { logType: LogType | ''; file?: File; onLogType: (type: LogType | '') => void; onUpload: () => void; onAnalyze: () => void }) {
  return <main className="empty-main">
    <section className="hero-simple">
      <span className="kicker"><span /> Local-first network diagnostics</span>
      <h1>Find exactly when a connection<br /><em>experienced instability.</em></h1>
      <p>Select the source log type before analyzing. Sensitive log contents never leave this browser.</p>
      <div className="upload-workflow">
        <label className="agent-selector"><span>Log Type</span><div><select aria-label="Log Type" value={logType} onChange={(event) => onLogType(event.target.value as LogType | '')} required><option value="">Select log type</option>{LOG_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><ChevronDown size={16} /></div></label>
        <div><span className="upload-label">Upload Log</span><button className="file-button" onClick={onUpload}><FileText size={17} />{file?.name ?? 'Select log file'}</button></div>
        <button className="primary-button" disabled={!logType || !file} onClick={onAnalyze}><Upload size={19} />Analyze</button>
      </div>
      <div className="format-note"><FileText size={16} /><span><strong>Supported Logs</strong><small>OpsCentral SocketIO / EFV<br />Asterisk / FreePBX<br />Asterisk-IVR<br />OpsCentral Webhook<br />PJSIP RTT / Reachability<br />eFrontVoice Call Routing / Agent<br />.log / .txt · Up to 50 MB</small></span></div>
    </section>
    <section className="trust-strip"><div><LockKeyhole /><span><strong>Stays on your device</strong><small>Processed in browser memory only.</small></span></div><div><ShieldCheck /><span><strong>Deterministic analysis</strong><small>Only the selected analyzer runs.</small></span></div><div><FileLock2 /><span><strong>No account. No upload.</strong><small>Close this tab and the log is gone.</small></span></div></section>
  </main>
}

interface SelectorOption { value: string; label: string }

function AnalysisEntitySelector({ label, value, options, onChange }: { label: string; value: string; options: SelectorOption[]; onChange: (value: string) => void }) {
  return <label className="agent-selector"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><ChevronDown size={16} /></div></label>
}

const extensionStatusPriority: Record<ExtensionNetworkAnalysis['networkStatus'], number> = {
  Unreachable: 5,
  Unstable: 4,
  'High RTT': 3,
  'RTT Warning': 2,
  Healthy: 1,
}

function orderExtensionsForDiagnosis(extensions: ExtensionNetworkAnalysis[]): ExtensionNetworkAnalysis[] {
  const unique = new Map(extensions.map((extension) => [extension.extension, extension]))
  return [...unique.values()].sort((a, b) => {
    const unreachableDifference = Number(b.metrics.unreachableEvents > 0) - Number(a.metrics.unreachableEvents > 0)
    if (unreachableDifference) return unreachableDifference
    const spikeDifference = Number(b.metrics.rttSpikes > 0) - Number(a.metrics.rttSpikes > 0)
    if (spikeDifference) return spikeDifference
    const severityDifference = extensionStatusPriority[b.networkStatus] - extensionStatusPriority[a.networkStatus]
    return severityDifference || a.extension.localeCompare(b.extension, undefined, { numeric: true })
  })
}

function ExtensionReport({ analysis }: { analysis: ExtensionNetworkAnalysis }) {
  const metrics = analysis.metrics
  return <article className="network-report extension-report">
    <header className="report-header"><div><span className="kicker"><span /> PJSIP RTT / Reachability</span><h2>Extension network report</h2></div><div className="privacy-pill"><LockKeyhole size={15} />Local memory only</div></header>
    <section className="dual-status"><div><span className="section-label">Network Status</span><strong>{analysis.networkStatus}</strong></div><div><span className="section-label">Current Status</span><strong>{analysis.currentStatus}</strong></div></section>
    <section className="metric-row"><div><span>Unreachable Events</span><b>{metrics.unreachableEvents}</b></div><div><span>RTT Spikes</span><b>{metrics.rttSpikes}</b></div><div><span>Highest RTT</span><b>{metrics.highestRtt === undefined ? '—' : `${metrics.highestRtt.toFixed(3)} ms`}</b></div><div><span>Longest Outage</span><b>{metrics.longestOutageSeconds === undefined ? '—' : `${metrics.longestOutageSeconds} sec`}</b></div></section>
    <section className="problem-section"><div className="problem-heading"><div><span className="section-label">Problem Times</span><h2>Reachability and latency events</h2></div><b>{analysis.problemTimes.length} {analysis.problemTimes.length === 1 ? 'time' : 'times'}</b></div><div className="problem-list">{analysis.problemTimes.map((problem) => <div className="problem-time" key={`${problem.timestamp}:${problem.items.join()}`}><time>{problem.displayTime}</time><div>{problem.items.map((item) => <span className="indicator" key={item}><i />{item}</span>)}</div></div>)}</div></section>
    <div className="summary-sections"><section><span className="section-label">Finding</span><p>{analysis.finding}</p></section><section><span className="section-label">Possible Impact</span><p>{analysis.possibleImpact}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{analysis.conclusion}</p></section></div>
  </article>
}

const timeOnly = (value?: string) => value?.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? 'Unknown time'
function IvrReport({ call }: { call: IvrCall }) {
  return <article className="network-report ivr-report"><header className="report-header"><div><span className="kicker"><span /> eFrontVoice-IVR</span><h2>IVR Call Flow Analysis</h2></div></header><section className="metric-row"><div><span>IVR Status</span><b>{call.ivrStatus}</b></div><div><span>Routing Status</span><b>{call.routingStatus}</b></div><div><span>Collect Digits</span><b>{call.failedAttempts ? 'Failed' : call.successfulAttempts ? 'Successful' : 'Not Detected'}</b></div><div><span>Digit Attempts</span><b>{call.collectDigitAttempts}</b></div><div><span>Failed Attempts</span><b>{call.failedAttempts}</b></div><div><span>Digits Received</span><b>{call.successfulAttempts ? call.events.filter((event) => event.type === 'DIGIT_COLLECTED').map((event) => event.digit).join(', ') : 'None'}</b></div></section><section className="metric-row"><div><span>Call ID</span><b>{call.callId}</b></div><div><span>Campaign Phone Number</span><b>{call.campaignPhoneNumber ?? call.routePoint ?? '—'}</b></div><div><span>Campaign ID</span><b>{call.campaignId ?? '—'}</b></div><div><span>Transaction ID</span><b>{call.transactionId ?? '—'}</b></div></section><section className="problem-section"><div className="problem-heading"><div><span className="section-label">Call Flow</span><h2>Diagnostic timeline</h2></div></div><div className="problem-list">{call.events.map((event) => <div className="problem-time" key={`${event.lineNumber}:${event.type}`}><time>{timeOnly(event.timestamp)}</time><div><span className="indicator"><i />{event.label}{event.errorCode ? ` · Error ${event.errorCode}` : ''}{event.digit === 'null' ? ' · No digit collected' : ''}</span></div></div>)}</div></section><div className="summary-sections"><section><span className="section-label">Finding</span><p>{call.finding}</p></section><section><span className="section-label">Possible Cause</span><p>{call.possibleCause}</p></section><section><span className="section-label">Possible Impact</span><p>{call.possibleImpact}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{call.conclusion}</p></section></div></article>
}


function VoiceCallReport({ call }: { call: VoiceCall }) {
  const searches = call.events.filter((event) => event.type === 'AGENT_SEARCH')
  const timeline = call.events.filter((event) => event.type !== 'AGENT_SEARCH')
  if (searches[0]) timeline.push({ ...searches[0], label: `Searching for Agent · ${searches.length} attempts · ${call.agentSearchDurationSeconds ?? 0} sec` })
  timeline.sort((a,b)=>(a.timestampMs??Number.MAX_SAFE_INTEGER)-(b.timestampMs??Number.MAX_SAFE_INTEGER)||a.lineNumber-b.lineNumber)
  return <article className="network-report voice-report"><header className="report-header"><div><span className="kicker"><span /> eFrontVoice</span><h2>Caller ID Routing Analysis</h2></div></header><section className="metric-row"><div><span>Call Status</span><b>{call.callStatus}</b></div><div><span>Routing Status</span><b>{call.routingStatus}</b></div><div><span>Caller ID</span><b>{call.callerId}</b></div><div><span>Campaign ID</span><b>{call.campaignId ?? '—'}</b></div><div><span>Agent ID</span><b>{call.agentId ?? '—'}</b></div><div><span>Extension</span><b>{call.extension ?? '—'}</b></div><div><span>Agent Group</span><b>{call.agentGroupId ?? '—'}</b></div><div><span>Transaction ID</span><b>{call.transactionId ?? '—'}</b></div><div><span>Agent Search</span><b>{call.agentSearchAttempts} attempts · {call.agentSearchDurationSeconds ?? 0} sec</b></div></section><section className="problem-section"><span className="section-label">Diagnostic Timeline</span><div className="problem-list">{timeline.map(event=><div className="problem-time" key={`${event.lineNumber}:${event.type}`}><time>{timeOnly(event.timestamp)}</time><div><span className="indicator"><i />{event.label}</span></div></div>)}</div></section><div className="summary-sections"><section><span className="section-label">Finding</span><p>{call.finding}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{call.conclusion}</p></section></div></article>
}
function VoiceExtensionReport({ analysis }: { analysis: VoiceExtensionAnalysis }) {
 return <article className="network-report voice-extension-report"><header className="report-header"><div><span className="kicker"><span /> eFrontVoice</span><h2>Agent Extension Analysis</h2></div></header><section className="metric-row"><div><span>Extension Status</span><b>{analysis.extensionStatus}</b></div><div><span>PBX Status</span><b>{analysis.pbxStatus}</b></div><div><span>Extension</span><b>{analysis.extension}</b></div><div><span>Agent ID</span><b>{analysis.agentId ?? '—'}</b></div><div><span>Login Status</span><b>{analysis.loginStatus}</b></div><div><span>WebRTC</span><b>{analysis.registrationStatus}</b></div><div><span>Monitoring</span><b>{analysis.monitoringStatus}</b></div><div><span>Current State</span><b>{analysis.currentState}</b></div><div><span>Calls Handled</span><b>{analysis.callsHandled}</b></div><div><span>Warnings</span><b>{analysis.warnings}</b></div></section><div className="summary-sections"><section><span className="section-label">Finding</span><p>{analysis.finding}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{analysis.conclusion}</p></section></div></article>
}

function AsteriskIvrReport({ call, calls }: { call: AsteriskIvrCall; calls: AsteriskIvrCall[] }) {
  const count = (results: AsteriskIvrCall['routingResult'][]) => calls.filter(item => results.includes(item.routingResult)).length
  return <article className="network-report asterisk-ivr-report"><header className="report-header"><div><span className="kicker"><span /> Asterisk-IVR Call Routing</span><h2>Selected call routing analysis</h2></div></header><section className="metric-row"><div><span>Total Calls</span><b>{calls.length}</b></div><div><span>Successfully Answered</span><b>{count(['Successfully Answered','Successfully Transferred'])}</b></div><div><span>Busy</span><b>{count(['Busy'])}</b></div><div><span>Channel Unavailable</span><b>{count(['Channel Unavailable'])}</b></div><div><span>No Answer</span><b>{count(['No Answer'])}</b></div><div><span>Unknown</span><b>{count(['Incomplete / Unknown'])}</b></div></section><section className="metric-row"><div><span>Caller ID</span><b>{call.callerId ?? '—'}</b></div><div><span>DNIS</span><b>{call.dnis ?? '—'}</b></div><div><span>Agent Extension</span><b>{call.agentExtension ?? '—'}</b></div><div><span>Process ID</span><b>{call.processId ?? '—'}</b></div><div><span>Linked ID</span><b>{call.linkedId ?? '—'}</b></div><div><span>Routing Result</span><b className={`routing-result status-${call.routingResult.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`}>{call.routingResult}</b></div><div><span>Ring Duration</span><b>{call.ringDurationSeconds === undefined ? '—' : `${call.ringDurationSeconds} sec`}</b></div></section><section className="problem-section"><div className="problem-heading"><div><span className="section-label">Evidence Timeline</span><h2>Routing events</h2></div></div><div className="problem-list">{call.events.map(event=><div className="problem-time" key={`${event.lineNumber}:${event.type}`}><time>{timeOnly(event.timestamp)}</time><div><span className="indicator"><i />{event.label}</span></div></div>)}</div></section><div className="summary-sections"><section><span className="section-label">Finding</span><p>{call.finding}</p></section><section><span className="section-label">Recommended Action</span>{call.recommendedActions.length?<ul>{call.recommendedActions.map(action=><li key={action}>{action}</li>)}</ul>:<p>No corrective routing action is recommended from this call result.</p>}</section></div></article>
}

function WebhookReport({ transaction, transactions, onSelect }: { transaction: WebhookTransaction; transactions: WebhookTransaction[]; onSelect:(trxId:string)=>void }) {
  const [customer,setCustomer]=useState('all');const [status,setStatus]=useState<WebhookStatus|'all'>('all');const [search,setSearch]=useState('')
  const customers=[...new Set(transactions.map(item=>item.customerNumber).filter((item):item is string=>Boolean(item)))]
  const statuses=[...new Set(transactions.map(item=>item.status))]
  const filtered=transactions.filter(item=>(customer==='all'||item.customerNumber===customer)&&(status==='all'||item.status===status)&&(!search||`${item.customerNumber} ${item.trxId} ${item.messageIds.join(' ')}`.toLowerCase().includes(search.toLowerCase())))
  const setFilter=(kind:'customer'|'status'|'search',value:string)=>{if(kind==='customer')setCustomer(value);else if(kind==='status')setStatus(value as WebhookStatus|'all');else setSearch(value);const next=transactions.filter(item=>(kind==='customer'?value==='all'||item.customerNumber===value:customer==='all'||item.customerNumber===customer)&&(kind==='status'?value==='all'||item.status===value:status==='all'||item.status===status)&&(kind==='search'?!value||`${item.customerNumber} ${item.trxId} ${item.messageIds.join(' ')}`.toLowerCase().includes(value.toLowerCase()):!search||`${item.customerNumber} ${item.trxId} ${item.messageIds.join(' ')}`.toLowerCase().includes(search.toLowerCase())));if(next[0])onSelect(next[0].trxId)}
  const counts=(value:WebhookStatus)=>transactions.filter(item=>item.status===value).length
  return <article className="network-report webhook-report"><header className="report-header"><div><span className="kicker"><span /> OpsCentral Webhook</span><h2>Messaging Flow</h2></div></header><section className="metric-row webhook-counters"><div><span>Total Transactions</span><b>{transactions.length}</b></div>{(['Successfully Routed','Blacklisted','Outside Operation Hours','Invalid Selection','Timeout','Processing Error','Incomplete / Unknown'] as WebhookStatus[]).map(value=><div key={value}><span>{value==='Incomplete / Unknown'?'Incomplete':value}</span><b className={`webhook-${value.toLowerCase().replaceAll(/[^a-z]+/g,'-')}`}>{counts(value)}</b></div>)}</section><section className="webhook-filters"><AnalysisEntitySelector label="Customer" value={customer} options={[{value:'all',label:'All Customers'},...customers.map(value=>({value,label:transaction.customerNumber===value?transaction.maskedCustomer:value}))]} onChange={value=>setFilter('customer',value)} /><AnalysisEntitySelector label="Status" value={status} options={[{value:'all',label:'All Statuses'},...statuses.map(value=>({value,label:value}))]} onChange={value=>setFilter('status',value)} /><label className="search-filter"><span>Search</span><input aria-label="Search" placeholder="Customer number, TRX ID or Message ID" value={search} onChange={event=>setFilter('search',event.target.value)} /></label><AnalysisEntitySelector label="Selected Transaction" value={transaction.trxId} options={filtered.map(item=>({value:item.trxId,label:`TRX ${item.trxId} — ${item.maskedCustomer} — ${timeOnly(item.startTimestamp)} — ${item.status}`}))} onChange={onSelect} /></section><section className="metric-row"><div><span>Transaction ID</span><b>{transaction.trxId}</b></div><div><span>Customer</span><b>{transaction.maskedCustomer}</b></div><div><span>Start</span><b>{timeOnly(transaction.startTimestamp)}</b></div><div><span>End</span><b>{timeOnly(transaction.endTimestamp)}</b></div><div><span>Processing Duration</span><b>{transaction.processingDurationMs===undefined?'—':`${(transaction.processingDurationMs/1000).toFixed(1)} sec`}</b></div><div><span>Message IDs</span><b>{transaction.messageIds.join(', ')||'—'}</b></div><div><span>Start Node</span><b>{transaction.startNode??'—'}</b></div><div><span>Final Node</span><b>{transaction.nodeJourney.at(-1)?.id??'—'}</b></div><div><span>Selected Option</span><b>{transaction.selectedOption??'—'}</b></div><div><span>Agent Group</span><b>{transaction.agentGroupId??'—'}</b></div><div><span>Final Status</span><b className={`webhook-${transaction.status.toLowerCase().replaceAll(/[^a-z]+/g,'-')}`}>{transaction.status}</b></div></section><section className="flow-journey"><span className="section-label">Message Node Flow ID</span><div>{transaction.nodeJourney.map((node,index)=><span key={`${node.id}:${index}`}><b>{node.id}</b><small>{node.type}</small>{index<transaction.nodeJourney.length-1&&<i>↓</i>}</span>)}</div></section><section className="problem-section"><div className="problem-heading"><div><span className="section-label">Evidence Timeline</span><h2>Messaging-flow events</h2></div></div><div className="problem-list">{transaction.evidence.map(item=><div className="problem-time" key={`${item.lineNumber}:${item.label}`}><time>{timeOnly(item.timestamp)??'Unknown time'}</time><div><span className="indicator"><i />{item.label}</span></div></div>)}</div></section><div className="summary-sections"><section><span className="section-label">Finding</span><p>{transaction.finding}</p>{transaction.importantNote&&<p><strong>Important note:</strong> {transaction.importantNote}</p>}</section><section><span className="section-label">Recommendations</span><ul>{transaction.recommendations.map(item=><li key={item}>{item}</li>)}</ul></section></div></article>
}

function Results({ result, selectedAgent, selectedExtension, selectedPhoneNumber, selectedIvrCall, selectedVoiceCallerId, selectedVoiceCall, selectedVoiceExtension, selectedAsteriskIvrCall, selectedWebhookTransaction, onSelectAgent, onSelectExtension, onSelectPhoneNumber, onSelectIvrCall, onSelectVoiceCallerId, onSelectVoiceCall, onSelectVoiceExtension, onSelectAsteriskIvrCall, onSelectWebhookTransaction, onReset }: { result: AnalysisResult; selectedAgent?: AgentAnalysis; selectedExtension?: ExtensionNetworkAnalysis; selectedPhoneNumber?: string; selectedIvrCall?: IvrCall; selectedVoiceCallerId?: string; selectedVoiceCall?: VoiceCall; selectedVoiceExtension?: VoiceExtensionAnalysis; selectedAsteriskIvrCall?: AsteriskIvrCall; selectedWebhookTransaction?: WebhookTransaction; onSelectAgent: (key: string) => void; onSelectExtension: (extension: string) => void; onSelectPhoneNumber: (phone: string) => void; onSelectIvrCall: (callId: string) => void; onSelectVoiceCallerId:(id:string)=>void; onSelectVoiceCall:(id:string)=>void; onSelectVoiceExtension:(id:string)=>void; onSelectAsteriskIvrCall:(id:string)=>void; onSelectWebhookTransaction:(id:string)=>void; onReset: () => void }) {
  if (!result.agents.length && !result.extensions.length && !result.ivrCalls.length && !result.voiceCalls.length && !result.voiceExtensions.length && !result.asteriskIvrCalls.length && !result.webhookTransactions.length) return <main className="no-results"><AlertTriangle size={38} /><h2>No network problems found</h2><p>No supported Agent, reachability, or RTT indicators were detected.</p><button className="secondary-button" onClick={onReset}>Choose another log</button></main>
  return <main className="result-page">
    <div className="result-toolbar"><div className="file-summary"><FileText size={18} /><span><strong>{result.fileName}</strong><small>Log Type: {LOG_TYPES.find(type => type.value === result.logType)?.label} · {result.totalLines.toLocaleString()} records · {result.agents.length} Agents · {result.extensions.length} Extensions · {[...new Set(result.ivrCalls.map((call) => call.phoneNumber))].length} Phone Numbers · {[...new Set(result.voiceCalls.map(call=>call.callerId))].length} Caller IDs · {result.voiceExtensions.length} Voice Extensions · {result.asteriskIvrCalls.length} Asterisk-IVR Calls · {result.webhookTransactions.length} Webhook Transactions</small></span></div><div className="entity-selectors">{selectedAsteriskIvrCall && <AnalysisEntitySelector label="Selected Call" value={selectedAsteriskIvrCall.key} options={result.asteriskIvrCalls.map(call=>({value:call.key,label:`${call.callerId ?? 'Unknown'} → ${call.agentExtension ?? 'Unknown'} — ${timeOnly(call.startTimestamp)}`}))} onChange={onSelectAsteriskIvrCall} />}{selectedVoiceCallerId && <AnalysisEntitySelector label="Selected Voice Caller ID" value={selectedVoiceCallerId} options={[...new Set(result.voiceCalls.map(call=>call.callerId))].map(id=>({value:id,label:id}))} onChange={onSelectVoiceCallerId} />}{selectedVoiceCall && <AnalysisEntitySelector label="Selected Voice Call" value={selectedVoiceCall.callId} options={result.voiceCalls.filter(call=>call.callerId===selectedVoiceCallerId).sort((a,b)=>b.problemScore-a.problemScore).map(call=>({value:call.callId,label:`${timeOnly(call.events[0]?.timestamp)} · Call ID ${call.callId}`}))} onChange={onSelectVoiceCall} />}{selectedVoiceExtension && <AnalysisEntitySelector label="Selected Voice Extension" value={selectedVoiceExtension.extension} options={result.voiceExtensions.map(item=>({value:item.extension,label:item.extension}))} onChange={onSelectVoiceExtension} />}{selectedPhoneNumber && <AnalysisEntitySelector label="Selected Phone Number" value={selectedPhoneNumber} options={[...new Set(result.ivrCalls.map((call) => call.phoneNumber))].map((phone) => ({ value: phone, label: phone }))} onChange={onSelectPhoneNumber} />}{selectedIvrCall && <AnalysisEntitySelector label="Selected Call" value={selectedIvrCall.callId} options={result.ivrCalls.filter((call) => call.phoneNumber === selectedPhoneNumber).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? '').localeCompare(a.startTime ?? '')).map((call) => ({ value: call.callId, label: `${timeOnly(call.startTime)} · Call ID ${call.callId}` }))} onChange={onSelectIvrCall} />}{selectedAgent && <AnalysisEntitySelector label="Selected Agent" value={selectedAgent.key} options={result.agents.map((agent) => ({ value: agent.key, label: agent.agent }))} onChange={onSelectAgent} />}{selectedExtension && <AnalysisEntitySelector label="Selected Extension" value={selectedExtension.extension} options={orderExtensionsForDiagnosis(result.extensions).map((extension) => ({ value: extension.extension, label: extension.extension }))} onChange={onSelectExtension} />}</div><button className="new-log" onClick={onReset}><Upload size={15} />New log</button></div>
    <h1 className="analysis-title">Analysis Results</h1>
    {selectedAgent && (
    <article className="network-report">
      <header className="report-header"><div><span className="kicker"><span /> Analysis complete</span><h2>Agent network report</h2></div><div className="privacy-pill"><LockKeyhole size={15} />Local memory only</div></header>
      <section className="agent-details"><div><span>Agent</span><h1>{selectedAgent.agent}</h1></div></section>
      <section className="status-section"><span className="section-label">Network Status</span><div className="network-status"><Radio size={21} /><strong>{selectedAgent.networkStatus}</strong></div></section>
      <section className="problem-section"><div className="problem-heading"><div><span className="section-label">Problem Times</span><h2>When instability occurred</h2></div><b>{selectedAgent.problemTimes.length} {selectedAgent.problemTimes.length === 1 ? 'time' : 'times'}</b></div><div className="problem-list">{selectedAgent.problemTimes.map((problem) => <div className="problem-time" key={problem.timestamp}><time>{problem.displayTime}</time><div>{problem.indicators.map((indicator) => <span className={`indicator indicator-${indicator.severity}`} key={`${indicator.severity}:${indicator.label}`}><i />{indicator.label}<small>{severityLabel[indicator.severity]}</small></span>)}</div></div>)}</div></section>
      <div className="summary-sections"><section><span className="section-label">Finding</span><p>{selectedAgent.finding}</p></section><section><span className="section-label">Possible Impact</span><p>{selectedAgent.possibleImpact}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{selectedAgent.conclusion}</p></section></div>
    </article>
    )}
    <div className="extension-results">{selectedWebhookTransaction && <WebhookReport transaction={selectedWebhookTransaction} transactions={result.webhookTransactions} onSelect={onSelectWebhookTransaction} />}{selectedAsteriskIvrCall && <AsteriskIvrReport call={selectedAsteriskIvrCall} calls={result.asteriskIvrCalls} />}{selectedVoiceCall && <VoiceCallReport call={selectedVoiceCall} />}{selectedVoiceExtension && <VoiceExtensionReport analysis={selectedVoiceExtension} />}{selectedIvrCall && <IvrReport call={selectedIvrCall} />}{selectedExtension && <ExtensionReport analysis={selectedExtension} />}</div>
  </main>
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<AnalysisResult>()
  const [selectedLogType, setSelectedLogType] = useState<LogType | ''>('')
  const [uploadedFile, setUploadedFile] = useState<File>()
  const [selectedAgent, setSelectedAgent] = useState<string>()
  const [selectedExtension, setSelectedExtension] = useState<string>()
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string>()
  const [selectedIvrCallId, setSelectedIvrCallId] = useState<string>()
  const [selectedVoiceCallerId,setSelectedVoiceCallerId]=useState<string>()
  const [selectedVoiceCall,setSelectedVoiceCall]=useState<string>()
  const [selectedVoiceExtension,setSelectedVoiceExtension]=useState<string>()
  const [selectedAsteriskIvrCall,setSelectedAsteriskIvrCall]=useState<string>()
  const [selectedWebhookTransaction,setSelectedWebhookTransaction]=useState<string>()
  const [error, setError] = useState<string>()
  const [dragging, setDragging] = useState(false)

  const clearAnalysis = () => {
    setResult(undefined); setSelectedAgent(undefined); setSelectedExtension(undefined)
    setSelectedPhoneNumber(undefined); setSelectedIvrCallId(undefined)
    setSelectedVoiceCallerId(undefined); setSelectedVoiceCall(undefined); setSelectedVoiceExtension(undefined); setSelectedAsteriskIvrCall(undefined); setSelectedWebhookTransaction(undefined)
  }
  const selectFile = (file?: File) => {
    setError(undefined); clearAnalysis()
    if (!file) return setUploadedFile(undefined)
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(extension)) { setUploadedFile(undefined); return setError('Choose a supported OpsCentral or PBX .log or .txt file.') }
    if (file.size > MAX_FILE_BYTES) { setUploadedFile(undefined); return setError('This file is larger than the 50 MB local-analysis limit.') }
    setUploadedFile(file)
  }
  const analyze = () => {
    if (!uploadedFile || !selectedLogType) return
    clearAnalysis()
    const reader = new FileReader()
    reader.onerror = () => setError('The browser could not read this file. No data was uploaded.')
    reader.onload = () => {
      if (typeof reader.result !== 'string') return setError('The selected file could not be read as text.')
      const analysis = analyzeLog(reader.result, uploadedFile.name, DEFAULT_GROUPING_WINDOW_MS, selectedLogType)
      setResult(analysis)
      setSelectedAgent(analysis.agents[0]?.key)
      setSelectedExtension(orderExtensionsForDiagnosis(analysis.extensions)[0]?.extension)
      const phone = analysis.ivrCalls[0]?.phoneNumber
      setSelectedPhoneNumber(phone)
      setSelectedIvrCallId(analysis.ivrCalls.filter((call) => call.phoneNumber === phone).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? '').localeCompare(a.startTime ?? ''))[0]?.callId)
      const voiceCaller = [...analysis.voiceCalls].sort((a,b) => b.problemScore-a.problemScore)[0]?.callerId
      setSelectedVoiceCallerId(voiceCaller)
      setSelectedVoiceCall(analysis.voiceCalls.filter(call => call.callerId === voiceCaller).sort((a,b) => b.problemScore-a.problemScore)[0]?.callId)
      setSelectedVoiceExtension(analysis.voiceExtensions[0]?.extension)
      setSelectedAsteriskIvrCall(analysis.asteriskIvrCalls[0]?.key)
      setSelectedWebhookTransaction(analysis.webhookTransactions[0]?.trxId)
    }
    reader.readAsText(uploadedFile)
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { selectFile(event.target.files?.[0]); event.target.value = '' }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]) }
  const changeLogType = (type: LogType | '') => { clearAnalysis(); setSelectedLogType(type) }
  const reset = () => { clearAnalysis(); setUploadedFile(undefined); setSelectedLogType(''); setError(undefined) }

  return <div className="app" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    <header className="app-header"><button className="brand" onClick={reset} aria-label="SignalTrace home"><span className="brand-mark"><i /><i /><i /></span><span><strong>SignalTrace <b>V8</b></strong><small>Log, Voice &amp; Network Analyzer</small></span></button><div className="offline-badge"><span /> Offline mode</div></header>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".log,.txt,text/plain" onChange={onInput} aria-label="Choose log" />
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} />{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
    {result ? <Results result={result} selectedAgent={result.agents.find((agent) => agent.key === selectedAgent)} selectedExtension={result.extensions.find((extension) => extension.extension === selectedExtension)} selectedPhoneNumber={selectedPhoneNumber} selectedIvrCall={result.ivrCalls.find((call) => call.callId === selectedIvrCallId)} selectedVoiceCallerId={selectedVoiceCallerId} selectedVoiceCall={result.voiceCalls.find(call=>call.callId===selectedVoiceCall)} selectedVoiceExtension={result.voiceExtensions.find(item=>item.extension===selectedVoiceExtension)} selectedAsteriskIvrCall={result.asteriskIvrCalls.find(call=>call.key===selectedAsteriskIvrCall)} selectedWebhookTransaction={result.webhookTransactions.find(item=>item.trxId===selectedWebhookTransaction)} onSelectAgent={setSelectedAgent} onSelectExtension={setSelectedExtension} onSelectPhoneNumber={(phone) => { setSelectedPhoneNumber(phone); setSelectedIvrCallId(result.ivrCalls.filter((call) => call.phoneNumber === phone).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? "").localeCompare(a.startTime ?? ""))[0]?.callId) }} onSelectIvrCall={setSelectedIvrCallId} onSelectVoiceCallerId={(id)=>{setSelectedVoiceCallerId(id);setSelectedVoiceCall(result.voiceCalls.filter(call=>call.callerId===id).sort((a,b)=>b.problemScore-a.problemScore)[0]?.callId)}} onSelectVoiceCall={setSelectedVoiceCall} onSelectVoiceExtension={setSelectedVoiceExtension} onSelectAsteriskIvrCall={setSelectedAsteriskIvrCall} onSelectWebhookTransaction={setSelectedWebhookTransaction} onReset={reset} /> : <EmptyState logType={selectedLogType} file={uploadedFile} onLogType={changeLogType} onUpload={() => inputRef.current?.click()} onAnalyze={analyze} />}
    {!result && <footer><p>Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.</p><p>Uploaded logs are processed locally and are not permanently stored.</p></footer>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><strong>Drop PBX log to analyze locally</strong></div>}
  </div>
}
