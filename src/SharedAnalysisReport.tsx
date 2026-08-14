import type { ReactNode } from 'react'
import type { NormalizedAnalysisResult } from './normalizedResults'

const timeOnly=(value?:string)=>value?.match(/\d{2}:\d{2}:\d{2}/)?.[0]??'Unknown time'

export function downloadAnalysisReport(result:NormalizedAnalysisResult,fileName='signaltrace-analysis.json') {
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();URL.revokeObjectURL(url)
}

export function SharedAnalysisReport({result,controls,downloadFileName}:{result:NormalizedAnalysisResult;controls?:ReactNode;downloadFileName?:string}) {
  const progression=result.statusProgression?.filter((value,index,array)=>value&&value!==array[index-1])??[]
  return <article className="network-report shared-analysis-report whatsapp-report">
    <header className="report-header"><div><span className="kicker"><span/>{result.moduleName}</span><h2>{result.title}</h2></div>{downloadFileName&&<button className="secondary-button" onClick={()=>downloadAnalysisReport(result,downloadFileName)}>Download Report</button>}</header>
    {controls}
    <section className="ivr-outcome analysis-summary"><span>Final Status</span><strong>{result.finalStatus}</strong>{progression.length>0&&<p><b>Status Progression:</b> {progression.join(' → ')}</p>}{result.duplicateEvents!==undefined&&<p><b>Duplicate callbacks/events:</b> {result.duplicateEvents}</p>}</section>
    {result.summary.length>0&&<section className="metric-row shared-summary-metrics">{result.summary.map(item=><div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</section>}
    {result.technicalDetails.length>0&&<details className="whatsapp-technical-details"><summary>Technical Details</summary><dl>{result.technicalDetails.map(item=><div className="technical-detail-row" key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></details>}
    {result.timeline.length>0&&<details className="technical-timeline"><summary>Technical Timeline ({result.timeline.length} events)</summary><div className="problem-list">{result.timeline.map((event,index)=><div className="problem-time" key={`${event.lineNumber??index}:${event.title}`}><time>{timeOnly(event.timestamp)}</time><div><span className="indicator"><i/>{event.title}</span>{event.raw&&<code>{event.raw}</code>}</div></div>)}</div></details>}
    <div className="summary-sections shared-findings"><section><span className="section-label">Finding</span><p>{result.finding}</p></section><section><span className="section-label">Root Cause</span><p>{result.rootCause}</p></section>{result.recommendations.length>0&&<section className="conclusion"><span className="section-label">Recommendation</span><ul>{result.recommendations.filter(Boolean).map((item,index)=><li key={`${index}:${item}`}>{item}</li>)}</ul></section>}</div>
  </article>
}
