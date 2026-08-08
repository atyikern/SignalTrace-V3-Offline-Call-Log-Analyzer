import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, CircleAlert, FileLock2, FileText, Info, LockKeyhole, PhoneCall, ShieldCheck, Upload, XCircle } from 'lucide-react'
import { analyzeLog } from './analyzer'
import type { AnalysisResult, AnalyzedCall, Evidence, Finding, Severity } from './types'

const ACCEPTED_EXTENSIONS = ['.log', '.txt']
const MAX_FILE_BYTES = 50 * 1024 * 1024

const severityMeta: Record<Severity, { label: string; icon: typeof Info }> = {
  observed: { label: 'Observed Event', icon: CheckCircle2 },
  warning: { label: 'Warning', icon: AlertTriangle },
  error: { label: 'Error', icon: XCircle },
  'root-cause': { label: 'Probable Root Cause', icon: CircleAlert },
}

function EvidenceBlock({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="evidence-list">
      {evidence.map((item) => (
        <div className="evidence" key={`${item.lineNumber}-${item.text}`}>
          <span className="line-number">Line {item.lineNumber}</span>
          <code>{item.text}</code>
        </div>
      ))}
    </div>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  const meta = severityMeta[finding.severity]
  const Icon = meta.icon
  return (
    <article className={`finding finding-${finding.severity}`}>
      <header>
        <span className="finding-icon"><Icon size={18} /></span>
        <div><span className="eyebrow">{meta.label} · {finding.ruleId}</span><h3>{finding.title}</h3></div>
      </header>
      <p>{finding.detail}</p>
      <EvidenceBlock evidence={finding.evidence} />
      {finding.recommendation && (
        <div className="recommendation"><ArrowRight size={16} /><span><strong>Recommended next check</strong>{finding.recommendation}</span></div>
      )}
    </article>
  )
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <main className="empty-main">
      <section className="hero">
        <div className="hero-copy">
          <span className="kicker"><span /> Local-first PBX diagnostics</span>
          <h1>Turn dense PBX logs into<br /><em>clear call stories.</em></h1>
          <p>Trace calls, surface evidence, and understand what happened — without your sensitive log data ever leaving this browser.</p>
          <button className="primary-button" onClick={onUpload}><Upload size={19} />Upload PBX Log</button>
          <div className="format-note"><FileText size={16} /><span><strong>Asterisk / FreePBX PBX logs</strong><small>.log / .txt · Up to 50 MB</small></span></div>
        </div>
        <div className="preview-card" aria-hidden="true">
          <div className="preview-top"><span><i /><i /><i /></span><small>CALL FLOW · C-000001a4</small></div>
          <div className="preview-body">
            <div className="preview-row active"><b>09:42:11</b><span><i className="green" /><strong>Call initiated</strong><small>PJSIP/201 → 1800555019</small></span></div>
            <div className="preview-row"><b>09:42:12</b><span><i className="blue" /><strong>Trunk selected</strong><small>PJSIP/provider-00002c</small></span></div>
            <div className="preview-row alert"><b>09:42:14</b><span><i className="amber" /><strong>Endpoint unavailable</strong><small>Explicit CHANUNAVAIL evidence</small></span></div>
            <div className="preview-evidence"><small>PROBABLE ROOT CAUSE</small><strong>Destination endpoint unreachable</strong><code>Line 1842 · DIALSTATUS=CHANUNAVAIL</code></div>
          </div>
        </div>
      </section>
      <section className="trust-strip">
        <div><LockKeyhole /><span><strong>Stays on your device</strong><small>Logs are processed in browser memory only.</small></span></div>
        <div><ShieldCheck /><span><strong>Deterministic analysis</strong><small>Every conclusion links to exact source lines.</small></span></div>
        <div><FileLock2 /><span><strong>No account. No upload.</strong><small>Close this tab and the log is gone.</small></span></div>
      </section>
    </main>
  )
}

function Results({ result, selected, onSelect, onReset }: { result: AnalysisResult; selected?: AnalyzedCall; onSelect: (id: string) => void; onReset: () => void }) {
  if (!selected) return <main className="no-calls"><CircleAlert size={40} /><h2>No exact Asterisk Call IDs found</h2><p>SignalTrace only correlates lines containing an exact Asterisk <code>[C-…]</code> identifier. It will not guess from timestamp proximity.</p><button className="secondary-button" onClick={onReset}>Choose another log</button></main>
  return (
    <main className="results-layout">
      <aside className="call-sidebar">
        <div className="file-summary"><FileText size={18} /><span><strong>{result.fileName}</strong><small>{result.totalLines.toLocaleString()} physical lines · {result.calls.length} calls</small></span></div>
        <div className="sidebar-heading"><span>Detected calls</span><b>{result.calls.length}</b></div>
        <div className="call-list">
          {result.calls.map((call, index) => <button className={call.callId === selected.callId ? 'selected' : ''} key={call.callId} onClick={() => onSelect(call.callId)}><PhoneCall size={16} /><span><strong>Call {index + 1}</strong><small>{call.callId} · Lines {call.firstLine}–{call.lastLine}</small></span><ChevronRight size={16} /></button>)}
        </div>
        <button className="new-log" onClick={onReset}><Upload size={15} />Analyze another log</button>
      </aside>
      <section className="result-content">
        <div className="result-heading"><div><span className="kicker"><span /> Analysis complete</span><h1>{selected.label}</h1><p>Exact Call ID <code>{selected.callId}</code> · {selected.events.length} correlated lines · {selected.channels.length} channels</p></div><div className="privacy-pill"><LockKeyhole size={15} />Local memory only</div></div>
        <div className="section-heading"><div><span>01</span><h2>Findings</h2></div><p>Conclusions are deterministic and backed by source evidence.</p></div>
        <div className="findings-grid">
          {selected.findings.length ? selected.findings.map((finding) => <FindingCard finding={finding} key={finding.ruleId} />) : <div className="clear-state"><CheckCircle2 /><div><h3>No deterministic problems identified</h3><p>The correlated lines did not match a known failure rule. This is not proof that the call was problem-free.</p></div></div>}
        </div>
        <div className="section-heading timeline-title"><div><span>02</span><h2>Call-flow timeline</h2></div><p>Source order is preserved; each event retains its physical line number.</p></div>
        <div className="timeline">
          {selected.events.map((event) => { const meta = severityMeta[event.severity]; const Icon = meta.icon; return <article className={`timeline-event event-${event.severity}`} key={event.id}><div className="timeline-marker"><Icon size={16} /></div><div className="timeline-time">{event.timestamp?.split(/[ T]/).at(-1) ?? `Line ${event.evidence.lineNumber}`}</div><div className="timeline-card"><span className="eyebrow">{meta.label}</span><h3>{event.kind}</h3><p>{event.summary}</p><EvidenceBlock evidence={[event.evidence]} /></div></article> })}
        </div>
        <section className="cannot-confirm"><div className="cannot-title"><Info size={20} /><div><span className="eyebrow">Evidence boundary</span><h2>What SignalTrace cannot confirm from this log</h2></div></div><p>Absence of a log message is not proof that a condition did or did not occur.</p><ul>{selected.cannotConfirm.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </section>
    </main>
  )
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<AnalysisResult>()
  const [selectedId, setSelectedId] = useState<string>()
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
      setSelectedId(analysis.calls[0]?.callId)
    }
    reader.readAsText(file)
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { readFile(event.target.files?.[0]); event.target.value = '' }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]) }
  const reset = () => { setResult(undefined); setSelectedId(undefined); setError(undefined) }

  return <div className={dragging ? 'app dragging' : 'app'} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
    <header className="app-header"><button className="brand" onClick={reset} aria-label="SignalTrace home"><span className="brand-mark"><i /><i /><i /></span><span><strong>SignalTrace <b>V3</b></strong><small>Offline PBX Call Log Analyzer</small></span></button><div className="offline-badge"><span /> Offline mode</div></header>
    <input ref={inputRef} className="visually-hidden" type="file" accept=".log,.txt,text/plain" onChange={onInput} aria-label="Choose PBX log" />
    {error && <div className="error-banner" role="alert"><CircleAlert size={18} />{error}<button onClick={() => setError(undefined)}>Dismiss</button></div>}
    {result ? <Results result={result} selected={result.calls.find((call) => call.callId === selectedId)} onSelect={setSelectedId} onReset={reset} /> : <EmptyState onUpload={() => inputRef.current?.click()} />}
    {!result && <footer><p>Offline analysis only. SignalTrace analyzes the uploaded log and does not connect to your PBX server.</p><p>Uploaded logs are processed locally and are not permanently stored.</p></footer>}
    {dragging && <div className="drop-overlay"><Upload size={36} /><strong>Drop PBX log to analyze locally</strong></div>}
  </div>
}
