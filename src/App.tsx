import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { AlertTriangle, ChevronDown, FileLock2, FileText, History, LockKeyhole, Save, ShieldCheck, Upload, X } from 'lucide-react'
import { analyzeLog, DEFAULT_GROUPING_WINDOW_MS } from './analyzer'
import { DEFAULT_IVR_THRESHOLDS, type IvrThresholds } from './ivrAnalyzer'
import { DEFAULT_WHATSAPP_THRESHOLDS, type WhatsappThresholds } from './whatsappAnalyzer'
import { createCaseReport, readCaseHistory, rememberCase, saveCaseFile, searchCases, type CaseContext } from './caseManagement'
import type { AgentAnalysis, AnalysisResult, AsteriskIvrCall, ExtensionNetworkAnalysis, IvrCall, LogType, VoiceCall, VoiceExtensionAnalysis, WebhookTransaction, WhatsappMessageAnalysis } from './types'
import { SharedAnalysisReport } from './SharedAnalysisReport'
import { normalizeAgent, normalizeAsterisk, normalizeExtension, normalizeIvr, normalizeVoiceCall, normalizeVoiceExtension, normalizeWebhook, normalizeWhatsapp } from './normalizedResults'

const ACCEPTED_EXTENSIONS = ['.log', '.txt']
const MAX_FILE_BYTES = 50 * 1024 * 1024

const LOG_TYPE_GROUPS: Array<{ label:string; options:Array<{value:LogType;label:string}> }> = [
  { label:'Voice', options:[{value:'efrontvoice',label:'eFrontVoice'},{value:'efrontvoice-ivr',label:'eFrontVoice-IVR'},{value:'asterisk-ivr',label:'Asterisk-IVR'}] },
  { label:'Messaging', options:[{value:'opscentral-webhook',label:'Webhook'},{value:'ocod5-whatsapp',label:'OCOD5 WhatsApp'}] },
  { label:'Connectivity', options:[{value:'socketio-efv',label:'SocketIO / ECONNRESET'},{value:'pjsip-rtt',label:'RTT / UNREACHABLE'}] },
]
const LOG_TYPES=LOG_TYPE_GROUPS.flatMap(group=>group.options)
const isSelectableLogType=(value:string):value is LogType=>LOG_TYPES.some(type=>type.value===value)

function EmptyState({ logType, file, pasted, onPaste, onLogType, onUpload, thresholds, onThresholds, whatsappThresholds, onWhatsappThresholds, onAnalyze }: { thresholds:IvrThresholds; onThresholds:(value:IvrThresholds)=>void; whatsappThresholds:WhatsappThresholds;onWhatsappThresholds:(value:WhatsappThresholds)=>void; logType: LogType | ''; file?: File; pasted:string; onPaste:(value:string)=>void; onLogType: (type: LogType | '') => void; onUpload: () => void; onAnalyze: () => void }) {
  return <main className="empty-main">
    <section className="hero-simple">
      <span className="kicker"><span /> Local-first operations diagnostics</span>
      <h1>Diagnose voice, messaging, and<br /> <em>connectivity issues faster.</em></h1>
      <p>Upload a supported log to trace call routing, message delivery, or connection failures. Your logs are analyzed locally in this browser.</p>
      <div className="upload-workflow">
        <label className="agent-selector"><span>Log Type</span><div><select aria-label="Log Type" value={logType} onChange={(event) => onLogType(isSelectableLogType(event.target.value)?event.target.value:'')} required><option value="">Select log type</option>{LOG_TYPE_GROUPS.map(group=><optgroup key={group.label} label={group.label}>{group.options.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</optgroup>)}<optgroup label="Others"><option value="ui" disabled>UI</option></optgroup></select><ChevronDown size={16} /></div></label>
        <div><span className="upload-label">Upload Log</span><button className="file-button" onClick={onUpload}><FileText size={17} />{file?.name ?? 'Select log file'}</button></div>
        {logType==='efrontvoice-ivr'&&<details className="threshold-settings"><summary>V9 routing thresholds</summary>{Object.entries(thresholds).map(([key,value])=><label key={key}>{key.replaceAll(/([A-Z])/g,' $1')} (ms)<input type="number" min="0" value={value} onChange={event=>onThresholds({...thresholds,[key]:Number(event.target.value)})}/></label>)}</details>}{logType==='ocod5-whatsapp'&&<details className="threshold-settings"><summary>WhatsApp timing thresholds</summary>{Object.entries(whatsappThresholds).map(([key,value])=><label key={key}>{key.replaceAll(/([A-Z])/g,' $1')} (ms)<input type="number" min="0" value={value} onChange={event=>onWhatsappThresholds({...whatsappThresholds,[key]:Number(event.target.value)})}/></label>)}</details>}{(logType==='efrontvoice-ivr'||logType==='ocod5-whatsapp')&&<label className="paste-log"><span className="upload-label">Or Paste Log</span><textarea aria-label="Paste Log" value={pasted} onChange={event=>onPaste(event.target.value)} placeholder="Paste log records here" /></label>}<button className="primary-button" disabled={!isSelectableLogType(logType) || (!file&&!pasted.trim())} onClick={onAnalyze}><Upload size={19} />Analyze</button>
      </div>
    </section>
    <section className="trust-strip"><div><LockKeyhole /><span><strong>Voice diagnostics</strong><small>Analyze IVR flow, agent routing, and call failures.</small></span></div><div><ShieldCheck /><span><strong>Messaging diagnostics</strong><small>Trace WhatsApp delivery, status callbacks, and webhook events.</small></span></div><div><FileLock2 /><span><strong>Connectivity diagnostics</strong><small>Identify ECONNRESET, RTT, and reachability issues.</small></span></div></section>
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
  return <SharedAnalysisReport result={normalizeExtension(analysis)} />
}

const timeOnly = (value?: string) => value?.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? 'Unknown time'
const voiceCallKey = (call: VoiceCall) => call.transactionId ? `tid:${call.transactionId}` : call.callId

function IvrReport({ call }: { call: IvrCall }) {
  return <SharedAnalysisReport result={normalizeIvr(call)} />
}

function VoiceCallReport({ call }: { call: VoiceCall }) {
  return <SharedAnalysisReport result={normalizeVoiceCall(call)} />
}

function VoiceExtensionReport({ analysis }: { analysis: VoiceExtensionAnalysis }) {
  return <SharedAnalysisReport result={normalizeVoiceExtension(analysis)} />
}

function AsteriskIvrReport({ call, calls }: { call: AsteriskIvrCall; calls: AsteriskIvrCall[] }) {
  return <SharedAnalysisReport result={normalizeAsterisk(call,calls)} />
}

function WebhookReport({ transaction, transactions, onSelect }: { transaction: WebhookTransaction; transactions: WebhookTransaction[]; onSelect:(trxId:string)=>void }) {
 const [customer,setCustomer]=useState('all');const [status,setStatus]=useState('all');const [search,setSearch]=useState('');const customers=[...new Set(transactions.map(item=>item.customerNumber).filter((item):item is string=>Boolean(item)))];const statuses=[...new Set(transactions.map(item=>item.status))];const filtered=transactions.filter(item=>(customer==='all'||item.customerNumber===customer)&&(status==='all'||item.status===status)&&(!search.trim()||[item.customerNumber,item.trxId,...item.messageIds].some(value=>value?.toLowerCase().includes(search.toLowerCase()))))
 const controls=<section className="webhook-filters"><AnalysisEntitySelector label="Customer" value={customer} options={[{value:'all',label:'All Customers'},...customers.map(value=>({value,label:value}))]} onChange={setCustomer}/><AnalysisEntitySelector label="Status" value={status} options={[{value:'all',label:'All Statuses'},...statuses.map(value=>({value,label:value}))]} onChange={setStatus}/><label className="search-filter"><span>Search</span><input aria-label="Search" placeholder="Customer number, TRX ID or Message ID" value={search} onChange={event=>setSearch(event.target.value)}/></label><AnalysisEntitySelector label="Selected Transaction" value={transaction.trxId} options={filtered.map(item=>({value:item.trxId,label:`TRX ${item.trxId} — ${item.customerNumber??'Unknown'} — ${timeOnly(item.startTimestamp)} — ${item.status}`}))} onChange={onSelect}/></section>
 return <SharedAnalysisReport result={normalizeWebhook(transaction)} controls={controls}/>
}

function WhatsappReport({message}:{message:WhatsappMessageAnalysis}) {
 return <SharedAnalysisReport result={normalizeWhatsapp(message)}/>
}

interface CaseSelection { agent?:AgentAnalysis;extension?:ExtensionNetworkAnalysis;ivr?:IvrCall;voiceCall?:VoiceCall;voiceExtension?:VoiceExtensionAnalysis;asterisk?:AsteriskIvrCall;webhook?:WebhookTransaction;whatsapp?:WhatsappMessageAnalysis }
function caseContextFor(selection:CaseSelection):CaseContext|undefined {
  if(selection.whatsapp)return{moduleName:'OCOD5 WhatsApp',customerPhoneNumber:selection.whatsapp.customerNumber,transactionId:selection.whatsapp.transactionId,finding:selection.whatsapp.finding,rootCause:selection.whatsapp.errors[0]??selection.whatsapp.status,recommendation:selection.whatsapp.warnings.join(' ')||'Review the technical timeline and provider status callbacks.'}
  if(selection.webhook)return{moduleName:'Webhook',customerPhoneNumber:selection.webhook.customerNumber,transactionId:selection.webhook.trxId,finding:selection.webhook.finding,rootCause:selection.webhook.errors[0]??selection.webhook.status,recommendation:selection.webhook.recommendations.join(' ')}
  if(selection.asterisk)return{moduleName:'Asterisk-IVR',customerPhoneNumber:selection.asterisk.callerId,transactionId:selection.asterisk.linkedId,finding:selection.asterisk.finding,rootCause:selection.asterisk.routingResult,recommendation:selection.asterisk.recommendedActions.join(' ')||'No corrective routing action was identified.'}
  if(selection.ivr)return{moduleName:'eFrontVoice-IVR',customerPhoneNumber:selection.ivr.phoneNumber,transactionId:selection.ivr.transactionId,finding:selection.ivr.finding,rootCause:selection.ivr.possibleCause,recommendation:selection.ivr.conclusion}
  if(selection.voiceCall)return{moduleName:'eFrontVoice',customerPhoneNumber:selection.voiceCall.callerId,transactionId:selection.voiceCall.transactionId,finding:selection.voiceCall.finding??'No finding was generated.',rootCause:selection.voiceCall.conclusion??selection.voiceCall.routingStatus,recommendation:'Review Agent availability, routing eligibility, and the diagnostic timeline.'}
  if(selection.voiceExtension)return{moduleName:'eFrontVoice Agent Extension',finding:selection.voiceExtension.finding,rootCause:selection.voiceExtension.conclusion,recommendation:'Review login, WebRTC registration, PBX connectivity, and monitoring events.'}
  if(selection.extension)return{moduleName:'RTT / UNREACHABLE',finding:selection.extension.finding,rootCause:selection.extension.conclusion,recommendation:selection.extension.possibleImpact}
  if(selection.agent)return{moduleName:'SocketIO / ECONNRESET',finding:selection.agent.finding,rootCause:selection.agent.conclusion,recommendation:selection.agent.possibleImpact}
}

function SaveCaseDialog({context,onClose,onSaved}:{context:CaseContext;onClose:()=>void;onSaved:(message:string)=>void}){
 const [ticketId,setTicketId]=useState('');const [customerName,setCustomerName]=useState('');const [customerGroup,setCustomerGroup]=useState('');const [remarks,setRemarks]=useState('');const [saving,setSaving]=useState(false);const [error,setError]=useState('')
 const submit=async(event:FormEvent)=>{event.preventDefault();setSaving(true);setError('');const report=createCaseReport(context,{ticketId,customerName,customerGroup,remarks});try{const destination=await saveCaseFile(report);rememberCase(report);onSaved(destination==='folder'?'Case saved to the selected folder.':'Case downloaded and added to local Case History.');onClose()}catch(reason){setError(reason instanceof Error?reason.message:'The case could not be saved.')}finally{setSaving(false)}}
 return <div className="case-modal-backdrop" role="presentation"><section className="case-modal" role="dialog" aria-modal="true" aria-labelledby="save-case-title"><button className="case-close" aria-label="Close Save Case" onClick={onClose}><X size={18}/></button><span className="kicker"><span/> Offline case report</span><h2 id="save-case-title">Save Case</h2><p>The report will be saved as JSON in a date/customer folder when folder access is supported, or downloaded by your browser.</p><form onSubmit={submit}><label>Ticket ID<input required placeholder="IS1533" value={ticketId} onChange={event=>setTicketId(event.target.value)}/></label><label>Customer Name<input required value={customerName} onChange={event=>setCustomerName(event.target.value)}/></label><label>Customer Group<input required value={customerGroup} onChange={event=>setCustomerGroup(event.target.value)}/></label><label>Remarks (optional)<textarea value={remarks} onChange={event=>setRemarks(event.target.value)}/></label>{error&&<p className="case-error" role="alert">{error}</p>}<div className="case-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving…':'Choose Folder & Save'}</button></div></form></section></div>
}

function CaseHistoryPage({onBack}:{onBack:()=>void}){
 const [query,setQuery]=useState('');const cases=searchCases(readCaseHistory(),query)
 return <main className="case-history-page"><div className="case-history-heading"><div><span className="kicker"><span/> Offline case records</span><h1>Case History</h1><p>Search locally saved case metadata. The exported JSON files remain in the folders or downloads you selected.</p></div><button className="secondary-button" onClick={onBack}>Back to Analyzer</button></div><label className="case-search">Search cases<input aria-label="Search Case History" placeholder="Ticket ID, customer, phone, TID, or root cause" value={query} onChange={event=>setQuery(event.target.value)}/></label>{cases.length?<div className="case-history-list">{cases.map(item=><article key={item.sectionId}><header><strong>{item.ticketId}</strong><span>{new Date(item.analysisTime).toLocaleString()}</span></header><h2>{item.customerName}</h2><p>{item.customerGroup} · {item.moduleName}</p><dl><dt>Section ID</dt><dd>{item.sectionId}</dd>{item.customerPhoneNumber&&<><dt>Phone Number</dt><dd>{item.customerPhoneNumber}</dd></>}{item.transactionId&&<><dt>Transaction ID</dt><dd>{item.transactionId}</dd></>}<dt>Finding</dt><dd>{item.finding}</dd><dt>Root Cause</dt><dd>{item.rootCause}</dd><dt>Recommendation</dt><dd>{item.recommendation}</dd></dl></article>)}</div>:<div className="case-empty"><History size={32}/><h2>No matching cases</h2><p>Save an analysis case or change the search terms.</p></div>}</main>
}

function Results({ result, selectedAgent, selectedExtension, selectedPhoneNumber, selectedIvrCall, selectedVoiceCallerId, selectedVoiceCall, selectedVoiceExtension, selectedAsteriskIvrCall, selectedWebhookTransaction, selectedWhatsappMessage, onSelectAgent, onSelectExtension, onSelectPhoneNumber, onSelectIvrCall, onSelectVoiceCallerId, onSelectVoiceCall, onSelectVoiceExtension, onSelectAsteriskIvrCall, onSelectWebhookTransaction, onSelectWhatsappMessage, onSaveCase, onReset }: { result: AnalysisResult; selectedAgent?: AgentAnalysis; selectedExtension?: ExtensionNetworkAnalysis; selectedPhoneNumber?: string; selectedIvrCall?: IvrCall; selectedVoiceCallerId?: string; selectedVoiceCall?: VoiceCall; selectedVoiceExtension?: VoiceExtensionAnalysis; selectedAsteriskIvrCall?: AsteriskIvrCall; selectedWebhookTransaction?: WebhookTransaction; selectedWhatsappMessage?:WhatsappMessageAnalysis; onSelectAgent: (key: string) => void; onSelectExtension: (extension: string) => void; onSelectPhoneNumber: (phone: string) => void; onSelectIvrCall: (callId: string) => void; onSelectVoiceCallerId:(id:string)=>void; onSelectVoiceCall:(id:string)=>void; onSelectVoiceExtension:(id:string)=>void; onSelectAsteriskIvrCall:(id:string)=>void; onSelectWebhookTransaction:(id:string)=>void; onSelectWhatsappMessage:(id:string)=>void; onSaveCase:()=>void; onReset: () => void }) {
  if (!result.agents.length && !result.extensions.length && !result.ivrCalls.length && !result.voiceCalls.length && !result.voiceExtensions.length && !result.asteriskIvrCalls.length && !result.webhookTransactions.length && !result.whatsappMessages.length) return <main className="no-results"><AlertTriangle size={38} /><h2>No supported analysis found</h2><p>No supported voice, messaging, or connectivity events were detected for the selected log type.</p><button className="secondary-button" onClick={onReset}>Choose another log</button></main>
  return <main className="result-page">
    <div className="result-toolbar"><div className="file-summary"><FileText size={18} /><span><strong>{result.fileName}</strong><small>Log Type: {LOG_TYPES.find(type => type.value === result.logType)?.label} · {result.totalLines.toLocaleString()} records · {result.agents.length} Agents · {result.extensions.length} Extensions · {[...new Set(result.ivrCalls.map((call) => call.phoneNumber))].length} Phone Numbers · {[...new Set(result.voiceCalls.map(call=>call.callerId))].length} Caller IDs · {result.voiceExtensions.length} Voice Extensions · {result.asteriskIvrCalls.length} Asterisk-IVR Calls · {result.webhookTransactions.length} Webhook Transactions · {result.whatsappMessages.length} WhatsApp Messages</small></span></div><div className="entity-selectors">{selectedWhatsappMessage && <AnalysisEntitySelector label="Selected WhatsApp Message" value={selectedWhatsappMessage.key} options={result.whatsappMessages.map(item=>({value:item.key,label:`${item.direction==='Inbound'?`Customer ${item.customerNumber??'Unknown'} → Business ${item.businessNumber??'Unknown'}`:`Business ${item.businessNumber??'Unknown'} → Customer ${item.customerNumber??'Unknown'}`} · ${item.status}`}))} onChange={onSelectWhatsappMessage} />}{selectedAsteriskIvrCall && <AnalysisEntitySelector label="Selected Call" value={selectedAsteriskIvrCall.key} options={result.asteriskIvrCalls.map(call=>({value:call.key,label:`${call.callerId ?? 'Unknown'} → ${call.agentExtension ?? 'Unknown'} — ${timeOnly(call.startTimestamp)}`}))} onChange={onSelectAsteriskIvrCall} />}{selectedVoiceCallerId && <AnalysisEntitySelector label="Selected Voice Caller ID" value={selectedVoiceCallerId} options={[...new Set(result.voiceCalls.map(call=>call.callerId))].map(id=>({value:id,label:id}))} onChange={onSelectVoiceCallerId} />}{selectedVoiceCall && <AnalysisEntitySelector label={result.voiceCalls.some(call=>call.transactionId)?'Selected Transaction':'Selected Voice Call'} value={voiceCallKey(selectedVoiceCall)} options={result.voiceCalls.filter(call=>call.callerId===selectedVoiceCallerId).sort((a,b)=>b.problemScore-a.problemScore).map(call=>({value:voiceCallKey(call),label:call.transactionId?`TID ${call.transactionId}`:`${timeOnly(call.events[0]?.timestamp)} · Call ID ${call.callId}`}))} onChange={onSelectVoiceCall} />}{selectedVoiceExtension && <AnalysisEntitySelector label="Selected Voice Extension" value={selectedVoiceExtension.extension} options={result.voiceExtensions.map(item=>({value:item.extension,label:item.extension}))} onChange={onSelectVoiceExtension} />}{selectedPhoneNumber && <AnalysisEntitySelector label="Selected Phone Number" value={selectedPhoneNumber} options={[...new Set(result.ivrCalls.map((call) => call.phoneNumber))].map((phone) => ({ value: phone, label: phone }))} onChange={onSelectPhoneNumber} />}{selectedIvrCall && <AnalysisEntitySelector label="Selected Call" value={selectedIvrCall.callId} options={result.ivrCalls.filter((call) => call.phoneNumber === selectedPhoneNumber).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? '').localeCompare(a.startTime ?? '')).map((call) => ({ value: call.callId, label: `${timeOnly(call.startTime)} · Call ID ${call.callId}` }))} onChange={onSelectIvrCall} />}{selectedAgent && <AnalysisEntitySelector label="Selected Agent" value={selectedAgent.key} options={result.agents.map((agent) => ({ value: agent.key, label: agent.agent }))} onChange={onSelectAgent} />}{selectedExtension && <AnalysisEntitySelector label="Selected Extension" value={selectedExtension.extension} options={orderExtensionsForDiagnosis(result.extensions).map((extension) => ({ value: extension.extension, label: extension.extension }))} onChange={onSelectExtension} />}</div><button className="new-log save-case-button" onClick={onSaveCase}><Save size={15}/>Save Case</button><button className="new-log" onClick={onReset}><Upload size={15} />New log</button></div>
    <h1 className="analysis-title">Analysis Results</h1>
    {selectedAgent && <SharedAnalysisReport result={normalizeAgent(selectedAgent)} />}
    <div className="extension-results">{selectedWhatsappMessage&&<WhatsappReport message={selectedWhatsappMessage}/>} {selectedWebhookTransaction && <WebhookReport transaction={selectedWebhookTransaction} transactions={result.webhookTransactions} onSelect={onSelectWebhookTransaction} />}{selectedAsteriskIvrCall && <AsteriskIvrReport call={selectedAsteriskIvrCall} calls={result.asteriskIvrCalls} />}{selectedVoiceCall && <VoiceCallReport call={selectedVoiceCall} />}{selectedVoiceExtension && <VoiceExtensionReport analysis={selectedVoiceExtension} />}{selectedIvrCall && <IvrReport call={selectedIvrCall} />}{selectedExtension && <ExtensionReport analysis={selectedExtension} />}</div>
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
  const [selectedWhatsappMessage,setSelectedWhatsappMessage]=useState<string>()
  const [error, setError] = useState<string>()
  const [dragging, setDragging] = useState(false)
  const [pastedLog,setPastedLog]=useState('')
  const [view,setView]=useState<'analyzer'|'history'>('analyzer')
  const [caseDialog,setCaseDialog]=useState<CaseContext>()
  const [caseNotice,setCaseNotice]=useState('')
  const [whatsappThresholds,setWhatsappThresholds]=useState<WhatsappThresholds>(()=>{try{return {...DEFAULT_WHATSAPP_THRESHOLDS,...JSON.parse(localStorage.getItem('signaltrace-whatsapp-thresholds')??'{}')}}catch{return DEFAULT_WHATSAPP_THRESHOLDS}})
  const [ivrThresholds,setIvrThresholds]=useState<IvrThresholds>(()=>{try{return {...DEFAULT_IVR_THRESHOLDS,...JSON.parse(localStorage.getItem('signaltrace-v9-thresholds')??'{}')}}catch{return DEFAULT_IVR_THRESHOLDS}})

  const clearAnalysis = () => {
    setResult(undefined); setSelectedAgent(undefined); setSelectedExtension(undefined)
    setSelectedPhoneNumber(undefined); setSelectedIvrCallId(undefined)
    setSelectedVoiceCallerId(undefined); setSelectedVoiceCall(undefined); setSelectedVoiceExtension(undefined); setSelectedAsteriskIvrCall(undefined); setSelectedWebhookTransaction(undefined); setSelectedWhatsappMessage(undefined)
  }
  const selectFile = (file?: File) => {
    setError(undefined); clearAnalysis()
    if (!file) return setUploadedFile(undefined)
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(extension)) { setUploadedFile(undefined); return setError('Choose a supported .log or .txt file for a Voice, Messaging, or Connectivity analyzer.') }
    if (file.size > MAX_FILE_BYTES) { setUploadedFile(undefined); return setError('This file is larger than the 50 MB local-analysis limit.') }
    setUploadedFile(file)
  }
  const analyze = () => {
    if ((!uploadedFile && !pastedLog.trim()) || !isSelectableLogType(selectedLogType)) return
    clearAnalysis()
    const applyAnalysis = (contents:string,name:string) => {
      const analysis = analyzeLog(contents, name, DEFAULT_GROUPING_WINDOW_MS, selectedLogType, ivrThresholds, whatsappThresholds)
      setResult(analysis)
      setSelectedAgent(analysis.agents[0]?.key)
      setSelectedExtension(orderExtensionsForDiagnosis(analysis.extensions)[0]?.extension)
      const phone = analysis.ivrCalls[0]?.phoneNumber
      setSelectedPhoneNumber(phone)
      setSelectedIvrCallId(analysis.ivrCalls.filter((call) => call.phoneNumber === phone).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? '').localeCompare(a.startTime ?? ''))[0]?.callId)
      const voiceCaller = [...analysis.voiceCalls].sort((a,b) => b.problemScore-a.problemScore)[0]?.callerId
      setSelectedVoiceCallerId(voiceCaller)
      setSelectedVoiceCall(analysis.voiceCalls.filter(call => call.callerId === voiceCaller).sort((a,b) => b.problemScore-a.problemScore).map(voiceCallKey)[0])
      setSelectedVoiceExtension(analysis.voiceExtensions[0]?.extension)
      setSelectedAsteriskIvrCall(analysis.asteriskIvrCalls[0]?.key)
      setSelectedWebhookTransaction(analysis.webhookTransactions[0]?.trxId)
      setSelectedWhatsappMessage(analysis.whatsappMessages[0]?.key)
    }
    if (!uploadedFile) { applyAnalysis(pastedLog, 'Pasted eFrontVoice-IVR log'); return }
    const reader = new FileReader()
    reader.onerror = () => setError('The browser could not read this file. No data was uploaded.')
    reader.onload = () => typeof reader.result === 'string' ? applyAnalysis(reader.result, uploadedFile.name) : setError('The selected file could not be read as text.')
    reader.readAsText(uploadedFile)
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { selectFile(event.target.files?.[0]); event.target.value = '' }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]) }
  const changeLogType = (type: LogType | '') => { clearAnalysis(); setSelectedLogType(type) }
  const reset = () => { clearAnalysis(); setUploadedFile(undefined); setPastedLog(''); setSelectedLogType(''); setError(undefined); setView('analyzer') }

  const caseContext=result?caseContextFor({agent:result.agents.find(item=>item.key===selectedAgent),extension:result.extensions.find(item=>item.extension===selectedExtension),ivr:result.ivrCalls.find(item=>item.callId===selectedIvrCallId),voiceCall:result.voiceCalls.find(item=>voiceCallKey(item)===selectedVoiceCall),voiceExtension:result.voiceExtensions.find(item=>item.extension===selectedVoiceExtension),asterisk:result.asteriskIvrCalls.find(item=>item.key===selectedAsteriskIvrCall),webhook:result.webhookTransactions.find(item=>item.trxId===selectedWebhookTransaction),whatsapp:result.whatsappMessages.find(item=>item.key===selectedWhatsappMessage)}):undefined

  return <div className="app" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    <header className="app-header"><button className="brand" onClick={reset} aria-label="SignalTrace home"><span className="brand-mark"><i /><i /><i /></span><span><strong>SignalTrace <b>V11.5</b></strong><small>Voice, Messaging &amp; Connectivity Analyzer</small></span></button><div className="header-actions"><button className="history-button" onClick={()=>setView('history')}><History size={16}/>Case History</button><div className="offline-badge"><span /> Offline mode</div></div></header>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".log,.txt,text/plain" onChange={onInput} aria-label="Choose log" />
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} />{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
    {caseNotice&&<div className="case-notice" role="status">{caseNotice}<button onClick={()=>setCaseNotice('')}>Dismiss</button></div>}
    {view==='history'?<CaseHistoryPage onBack={()=>setView('analyzer')}/>:result ? <Results result={result} selectedAgent={result.agents.find((agent) => agent.key === selectedAgent)} selectedExtension={result.extensions.find((extension) => extension.extension === selectedExtension)} selectedPhoneNumber={selectedPhoneNumber} selectedIvrCall={result.ivrCalls.find((call) => call.callId === selectedIvrCallId)} selectedVoiceCallerId={selectedVoiceCallerId} selectedVoiceCall={result.voiceCalls.find(call=>voiceCallKey(call)===selectedVoiceCall)} selectedVoiceExtension={result.voiceExtensions.find(item=>item.extension===selectedVoiceExtension)} selectedAsteriskIvrCall={result.asteriskIvrCalls.find(call=>call.key===selectedAsteriskIvrCall)} selectedWebhookTransaction={result.webhookTransactions.find(item=>item.trxId===selectedWebhookTransaction)} selectedWhatsappMessage={result.whatsappMessages.find(item=>item.key===selectedWhatsappMessage)} onSelectAgent={setSelectedAgent} onSelectExtension={setSelectedExtension} onSelectPhoneNumber={(phone) => { setSelectedPhoneNumber(phone); setSelectedIvrCallId(result.ivrCalls.filter((call) => call.phoneNumber === phone).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? "").localeCompare(a.startTime ?? ""))[0]?.callId) }} onSelectIvrCall={setSelectedIvrCallId} onSelectVoiceCallerId={(id)=>{setSelectedVoiceCallerId(id);setSelectedVoiceCall(result.voiceCalls.filter(call=>call.callerId===id).sort((a,b)=>b.problemScore-a.problemScore).map(voiceCallKey)[0])}} onSelectVoiceCall={setSelectedVoiceCall} onSelectVoiceExtension={setSelectedVoiceExtension} onSelectAsteriskIvrCall={setSelectedAsteriskIvrCall} onSelectWebhookTransaction={setSelectedWebhookTransaction} onSelectWhatsappMessage={setSelectedWhatsappMessage} onSaveCase={()=>caseContext&&setCaseDialog(caseContext)} onReset={reset} /> : <EmptyState whatsappThresholds={whatsappThresholds} onWhatsappThresholds={(value)=>{setWhatsappThresholds(value);localStorage.setItem('signaltrace-whatsapp-thresholds',JSON.stringify(value))}} thresholds={ivrThresholds} onThresholds={(value)=>{setIvrThresholds(value);localStorage.setItem('signaltrace-v9-thresholds',JSON.stringify(value))}} logType={selectedLogType} file={uploadedFile} pasted={pastedLog} onPaste={(value)=>{setPastedLog(value);if(value)setUploadedFile(undefined)}} onLogType={changeLogType} onUpload={() => inputRef.current?.click()} onAnalyze={analyze} />}
    {view==='analyzer'&&!result && <footer><p>Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.</p><p>Uploaded logs are processed locally and are not permanently stored.</p></footer>}
    {caseDialog&&<SaveCaseDialog context={caseDialog} onClose={()=>setCaseDialog(undefined)} onSaved={setCaseNotice}/>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><strong>Drop PBX log to analyze locally</strong></div>}
  </div>
}
