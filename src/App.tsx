import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ChevronDown, FileLock2, FileText, LockKeyhole, Radio, ShieldCheck, Upload } from 'lucide-react'
import { analyzeLog } from './analyzer'
import type { AgentAnalysis, AnalysisResult, ExtensionNetworkAnalysis, IvrCall, NetworkSeverity } from './types'

const ACCEPTED_EXTENSIONS = ['.log', '.txt']
const MAX_FILE_BYTES = 50 * 1024 * 1024

const severityLabel: Record<NetworkSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  'media-quality': 'Media Quality',
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return <main className="empty-main">
    <section className="hero-simple">
      <span className="kicker"><span /> Local-first network diagnostics</span>
      <h1>Find exactly when a connection<br /><em>experienced instability.</em></h1>
      <p>Review network disconnections and media-quality problems in OpsCentral or PBX logs. Sensitive log contents never leave this browser.</p>
      <button className="primary-button" onClick={onUpload}><Upload size={19} />Upload Log</button>
      <div className="format-note"><FileText size={16} /><span><strong>Supported Logs</strong><small>OpsCentral SocketIO / EFV<br />Asterisk / FreePBX<br />PJSIP RTT / Reachability<br />.log / .txt · Up to 50 MB</small></span></div>
    </section>
    <section className="trust-strip">
      <div><LockKeyhole /><span><strong>Stays on your device</strong><small>Processed in browser memory only.</small></span></div>
      <div><ShieldCheck /><span><strong>Deterministic analysis</strong><small>Network indicators use explicit matching rules.</small></span></div>
      <div><FileLock2 /><span><strong>No account. No upload.</strong><small>Close this tab and the log is gone.</small></span></div>
    </section>
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

function Results({ result, selectedAgent, selectedExtension, selectedPhoneNumber, selectedIvrCall, onSelectAgent, onSelectExtension, onSelectPhoneNumber, onSelectIvrCall, onReset }: { result: AnalysisResult; selectedAgent?: AgentAnalysis; selectedExtension?: ExtensionNetworkAnalysis; selectedPhoneNumber?: string; selectedIvrCall?: IvrCall; onSelectAgent: (key: string) => void; onSelectExtension: (extension: string) => void; onSelectPhoneNumber: (phone: string) => void; onSelectIvrCall: (callId: string) => void; onReset: () => void }) {
  if (!result.agents.length && !result.extensions.length && !result.ivrCalls.length) return <main className="no-results"><AlertTriangle size={38} /><h2>No network problems found</h2><p>No supported Agent, reachability, or RTT indicators were detected.</p><button className="secondary-button" onClick={onReset}>Choose another log</button></main>
  return <main className="result-page">
    <div className="result-toolbar"><div className="file-summary"><FileText size={18} /><span><strong>{result.fileName}</strong><small>{result.totalLines.toLocaleString()} records · {result.agents.length} Agents · {result.extensions.length} Extensions · {[...new Set(result.ivrCalls.map((call) => call.phoneNumber))].length} Phone Numbers</small></span></div><div className="entity-selectors">{selectedPhoneNumber && <AnalysisEntitySelector label="Selected Phone Number" value={selectedPhoneNumber} options={[...new Set(result.ivrCalls.map((call) => call.phoneNumber))].map((phone) => ({ value: phone, label: phone }))} onChange={onSelectPhoneNumber} />}{selectedIvrCall && <AnalysisEntitySelector label="Selected Call" value={selectedIvrCall.callId} options={result.ivrCalls.filter((call) => call.phoneNumber === selectedPhoneNumber).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? '').localeCompare(a.startTime ?? '')).map((call) => ({ value: call.callId, label: `${timeOnly(call.startTime)} · Call ID ${call.callId}` }))} onChange={onSelectIvrCall} />}{selectedAgent && <AnalysisEntitySelector label="Selected Agent" value={selectedAgent.key} options={result.agents.map((agent) => ({ value: agent.key, label: agent.agent }))} onChange={onSelectAgent} />}{selectedExtension && <AnalysisEntitySelector label="Selected Extension" value={selectedExtension.extension} options={orderExtensionsForDiagnosis(result.extensions).map((extension) => ({ value: extension.extension, label: extension.extension }))} onChange={onSelectExtension} />}</div><button className="new-log" onClick={onReset}><Upload size={15} />New log</button></div>
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
    <div className="extension-results">{selectedIvrCall && <IvrReport call={selectedIvrCall} />}{selectedExtension && <ExtensionReport analysis={selectedExtension} />}</div>
  </main>
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<AnalysisResult>()
  const [selectedAgent, setSelectedAgent] = useState<string>()
  const [selectedExtension, setSelectedExtension] = useState<string>()
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string>()
  const [selectedIvrCallId, setSelectedIvrCallId] = useState<string>()
  const [error, setError] = useState<string>()
  const [dragging, setDragging] = useState(false)

  const readFile = (file?: File) => {
    setError(undefined)
    if (!file) return
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(extension)) return setError('Choose a supported OpsCentral or PBX .log or .txt file.')
    if (file.size > MAX_FILE_BYTES) return setError('This file is larger than the 50 MB local-analysis limit.')
    const reader = new FileReader()
    reader.onerror = () => setError('The browser could not read this file. No data was uploaded.')
    reader.onload = () => {
      if (typeof reader.result !== 'string') return setError('The selected file could not be read as text.')
      const analysis = analyzeLog(reader.result, file.name)
      setResult(analysis)
      setSelectedAgent(analysis.agents[0]?.key)
      setSelectedExtension(orderExtensionsForDiagnosis(analysis.extensions)[0]?.extension)
      const phone = analysis.ivrCalls[0]?.phoneNumber
      setSelectedPhoneNumber(phone)
      setSelectedIvrCallId(analysis.ivrCalls.filter((call) => call.phoneNumber === phone).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? '').localeCompare(a.startTime ?? ''))[0]?.callId)
    }
    reader.readAsText(file)
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { readFile(event.target.files?.[0]); event.target.value = '' }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]) }
  const reset = () => { setResult(undefined); setSelectedAgent(undefined); setSelectedExtension(undefined); setSelectedPhoneNumber(undefined); setSelectedIvrCallId(undefined); setError(undefined) }

  return <div className="app" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    <header className="app-header"><button className="brand" onClick={reset} aria-label="SignalTrace home"><span className="brand-mark"><i /><i /><i /></span><span><strong>SignalTrace <b>V5</b></strong><small>Log, Voice &amp; Network Analyzer</small></span></button><div className="offline-badge"><span /> Offline mode</div></header>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".log,.txt,text/plain" onChange={onInput} aria-label="Choose log" />
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} />{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
    {result ? <Results result={result} selectedAgent={result.agents.find((agent) => agent.key === selectedAgent)} selectedExtension={result.extensions.find((extension) => extension.extension === selectedExtension)} selectedPhoneNumber={selectedPhoneNumber} selectedIvrCall={result.ivrCalls.find((call) => call.callId === selectedIvrCallId)} onSelectAgent={setSelectedAgent} onSelectExtension={setSelectedExtension} onSelectPhoneNumber={(phone) => { setSelectedPhoneNumber(phone); setSelectedIvrCallId(result.ivrCalls.filter((call) => call.phoneNumber === phone).sort((a, b) => b.problemScore - a.problemScore || (b.startTime ?? "").localeCompare(a.startTime ?? ""))[0]?.callId) }} onSelectIvrCall={setSelectedIvrCallId} onReset={reset} /> : <EmptyState onUpload={() => inputRef.current?.click()} />}
    {!result && <footer><p>Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.</p><p>Uploaded logs are processed locally and are not permanently stored.</p></footer>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><strong>Drop PBX log to analyze locally</strong></div>}
  </div>
}
