import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ChevronDown, FileLock2, FileText, LockKeyhole, Radio, ShieldCheck, Upload } from 'lucide-react'
import { analyzeLog } from './analyzer'
import type { AgentAnalysis, AnalysisResult, NetworkSeverity } from './types'

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
      <h1>Find exactly when an Agent<br /><em>experienced instability.</em></h1>
      <p>Review network disconnections and media-quality problems in Asterisk or FreePBX logs. Sensitive log contents never leave this browser.</p>
      <button className="primary-button" onClick={onUpload}><Upload size={19} />Upload PBX Log</button>
      <div className="format-note"><FileText size={16} /><span><strong>Asterisk / FreePBX PBX logs</strong><small>.log / .txt · Up to 50 MB</small></span></div>
    </section>
    <section className="trust-strip">
      <div><LockKeyhole /><span><strong>Stays on your device</strong><small>Processed in browser memory only.</small></span></div>
      <div><ShieldCheck /><span><strong>Deterministic analysis</strong><small>Network indicators use explicit matching rules.</small></span></div>
      <div><FileLock2 /><span><strong>No account. No upload.</strong><small>Close this tab and the log is gone.</small></span></div>
    </section>
  </main>
}

function AgentSelector({ result, selected, onSelect }: { result: AnalysisResult; selected: AgentAnalysis; onSelect: (key: string) => void }) {
  return <label className="agent-selector"><span>Selected Agent</span><div><select value={selected.key} onChange={(event) => onSelect(event.target.value)}>{result.agents.map((agent) => <option value={agent.key} key={agent.key}>{agent.agent} · {agent.agentId}</option>)}</select><ChevronDown size={16} /></div></label>
}

function Results({ result, selected, onSelect, onReset }: { result: AnalysisResult; selected?: AgentAnalysis; onSelect: (key: string) => void; onReset: () => void }) {
  if (!selected) return <main className="no-results"><AlertTriangle size={38} /><h2>No Agent network problems found</h2><p>No supported network-disconnection or media-quality indicators with timestamps could be associated with an Agent.</p><button className="secondary-button" onClick={onReset}>Choose another log</button></main>
  return <main className="result-page">
    <div className="result-toolbar"><div className="file-summary"><FileText size={18} /><span><strong>{result.fileName}</strong><small>{result.totalLines.toLocaleString()} lines · {result.agents.length} Agents with problems</small></span></div><AgentSelector result={result} selected={selected} onSelect={onSelect} /><button className="new-log" onClick={onReset}><Upload size={15} />New log</button></div>
    <article className="network-report">
      <header className="report-header"><div><span className="kicker"><span /> Analysis complete</span><h1>{selected.agent}</h1></div><div className="privacy-pill"><LockKeyhole size={15} />Local memory only</div></header>
      <section className="agent-details"><div><span>Agent</span><strong>{selected.agent}</strong></div><div><span>Agent ID</span><strong>{selected.agentId}</strong></div><div><span>Extension</span><strong>{selected.extension}</strong></div></section>
      <section className="status-section"><span className="section-label">Network Status</span><div className="network-status"><Radio size={21} /><strong>{selected.networkStatus}</strong></div></section>
      <section className="problem-section"><div className="problem-heading"><div><span className="section-label">Problem Times</span><h2>When instability occurred</h2></div><b>{selected.problemTimes.length} {selected.problemTimes.length === 1 ? 'time' : 'times'}</b></div><div className="problem-list">{selected.problemTimes.map((problem) => <div className="problem-time" key={problem.timestamp}><time>{problem.displayTime}</time><div>{problem.indicators.map((indicator) => <span className={`indicator indicator-${indicator.severity}`} key={`${indicator.severity}:${indicator.label}`}><i />{indicator.label}<small>{severityLabel[indicator.severity]}</small></span>)}</div></div>)}</div></section>
      <div className="summary-sections"><section><span className="section-label">Finding</span><p>{selected.finding}</p></section><section><span className="section-label">Possible Impact</span><p>{selected.possibleImpact}</p></section><section className="conclusion"><span className="section-label">Conclusion</span><p>{selected.conclusion}</p></section></div>
    </article>
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
    if (!ACCEPTED_EXTENSIONS.includes(extension)) return setError('Choose an Asterisk or FreePBX .log or .txt file.')
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
    <header className="app-header"><button className="brand" onClick={reset} aria-label="SignalTrace home"><span className="brand-mark"><i /><i /><i /></span><span><strong>SignalTrace <b>V3</b></strong><small>Offline PBX Call Log Analyzer</small></span></button><div className="offline-badge"><span /> Offline mode</div></header>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".log,.txt,text/plain" onChange={onInput} aria-label="Choose PBX log" />
    {error && <div className="error-banner" role="alert"><AlertTriangle size={18} />{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
    {result ? <Results result={result} selected={result.agents.find((agent) => agent.key === selectedKey)} onSelect={setSelectedKey} onReset={reset} /> : <EmptyState onUpload={() => inputRef.current?.click()} />}
    {!result && <footer><p>Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.</p><p>Uploaded logs are processed locally and are not permanently stored.</p></footer>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><strong>Drop PBX log to analyze locally</strong></div>}
  </div>
}
