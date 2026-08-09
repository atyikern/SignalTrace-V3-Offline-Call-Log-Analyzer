import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ChevronDown, FileLock2, FileText, LockKeyhole, Radio, ShieldCheck, Upload } from 'lucide-react'
import { analyzeLog } from './analyzer'
import type { AgentAnalysis, AnalysisResult, ExtensionNetworkAnalysis, NetworkSeverity } from './types'

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

function AgentSelector({ result, selected, onSelect }: { result: AnalysisResult; selected: AgentAnalysis; onSelect: (key: string) => void }) {
  return <label className="agent-selector"><span>Selected Agent</span><div><select value={selected.key} onChange={(event) => onSelect(event.target.value)}>{result.agents.map((agent) => <option value={agent.key} key={agent.key}>{agent.agent}</option>)}</select><ChevronDown size={16} /></div></label>
}

function ExtensionReport({ analysis }: { analysis: ExtensionNetworkAnalysis }) {
  const metrics = analysis.metrics
  return <article className="network-report extension-report">
    <header className="report-header"><div><span className="kicker"><span /> PJSIP RTT / Reachability</span><h2>Extension network report</h2></div><div className="privacy-pill"><LockKeyhole size={15} />Local memory only</div></header>
    <section className="agent-details"><div><span>Extension</span><h1>{analysis.extension}</h1></div></section>
    <section className="dual-status"><div><span className="section-label">Network Status</span><strong>{analysis.networkStatus}</strong></div><div><span className="section-label">Current Status</span><strong>{analysis.currentStatus}</strong></div></section>
    <section className="metric-row"><div><span>Unreachable Events</span><b>{metrics.unreachableEvents}</b></div><div><span>RTT Spikes</span><b>{metrics.rttSpikes}</b></div><div><span>Highest RTT</span><b>{metrics.highestRtt === undefined ? '—' : `${metrics.highestRtt.toFixed(3)} ms`}</b></div><div><span>Longest Outage</span><b>{metrics.longestOutageSeconds === undefined ? '—' : `${metrics.longestOutageSeconds} sec`}</b></div></section>
    <section className="problem-section"><div className="problem-heading"><div><span className="section-label">Problem Times</span><h2>Reachability and latency events</h2></div><b>{analysis.problemTimes.length} {analysis.problemTimes.length === 1 ? 'time' : 'times'}</b></div><div className="problem-list">{analysis.problemTimes.map((problem) => <div className="problem-time" key={`${problem.timestamp}:${problem.items.join()}`}><time>{problem.displayTime}</time><div>{problem.items.map((item) => <span className="indicator" key={item}><i />{item}</span>)}</div></div>)}</div></section>
    <div className="summary-sections"><section><span className="section-label">Finding</span><p>{analysis.finding}</p></section><section><span className="section-label">Possible Impact</span><p>{analysis.possibleImpact}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{analysis.conclusion}</p></section></div>
  </article>
}

function Results({ result, selected, onSelect, onReset }: { result: AnalysisResult; selected?: AgentAnalysis; onSelect: (key: string) => void; onReset: () => void }) {
  if (!result.agents.length && !result.extensions.length) return <main className="no-results"><AlertTriangle size={38} /><h2>No network problems found</h2><p>No supported Agent, reachability, or RTT indicators were detected.</p><button className="secondary-button" onClick={onReset}>Choose another log</button></main>
  return <main className="result-page">
    <div className="result-toolbar"><div className="file-summary"><FileText size={18} /><span><strong>{result.fileName}</strong><small>{result.totalLines.toLocaleString()} records · {result.agents.length} Agents · {result.extensions.length} Extensions</small></span></div>{selected && <AgentSelector result={result} selected={selected} onSelect={onSelect} />}<button className="new-log" onClick={onReset}><Upload size={15} />New log</button></div>
    <h1 className="analysis-title">Analysis Results</h1>
    {selected && (
    <article className="network-report">
      <header className="report-header"><div><span className="kicker"><span /> Analysis complete</span><h2>Agent network report</h2></div><div className="privacy-pill"><LockKeyhole size={15} />Local memory only</div></header>
      <section className="agent-details"><div><span>Agent</span><h1>{selected.agent}</h1></div></section>
      <section className="status-section"><span className="section-label">Network Status</span><div className="network-status"><Radio size={21} /><strong>{selected.networkStatus}</strong></div></section>
      <section className="problem-section"><div className="problem-heading"><div><span className="section-label">Problem Times</span><h2>When instability occurred</h2></div><b>{selected.problemTimes.length} {selected.problemTimes.length === 1 ? 'time' : 'times'}</b></div><div className="problem-list">{selected.problemTimes.map((problem) => <div className="problem-time" key={problem.timestamp}><time>{problem.displayTime}</time><div>{problem.indicators.map((indicator) => <span className={`indicator indicator-${indicator.severity}`} key={`${indicator.severity}:${indicator.label}`}><i />{indicator.label}<small>{severityLabel[indicator.severity]}</small></span>)}</div></div>)}</div></section>
      <div className="summary-sections"><section><span className="section-label">Finding</span><p>{selected.finding}</p></section><section><span className="section-label">Possible Impact</span><p>{selected.possibleImpact}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{selected.conclusion}</p></section></div>
    </article>
    )}
    <div className="extension-results">{result.extensions.map((extension) => <ExtensionReport analysis={extension} key={extension.extension} />)}</div>
  </main>
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<AnalysisResult>()
  const [selectedKey, setSelectedKey] = useState<string>()
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
      setSelectedKey(analysis.agents[0]?.key)
    }
    reader.readAsText(file)
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { readFile(event.target.files?.[0]); event.target.value = '' }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]) }
  const reset = () => { setResult(undefined); setSelectedKey(undefined); setError(undefined) }

  return <div className="app" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    <header className="app-header"><button className="brand" onClick={reset} aria-label="SignalTrace home"><span className="brand-mark"><i /><i /><i /></span><span><strong>SignalTrace <b>V4</b></strong><small>Log &amp; Network Analyzer</small></span></button><div className="offline-badge"><span /> Offline mode</div></header>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".log,.txt,text/plain" onChange={onInput} aria-label="Choose log" />
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} />{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
    {result ? <Results result={result} selected={result.agents.find((agent) => agent.key === selectedKey)} onSelect={setSelectedKey} onReset={reset} /> : <EmptyState onUpload={() => inputRef.current?.click()} />}
    {!result && <footer><p>Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.</p><p>Uploaded logs are processed locally and are not permanently stored.</p></footer>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><strong>Drop PBX log to analyze locally</strong></div>}
  </div>
}
