import type { ReactNode } from 'react'
import jsPDF from 'jspdf'
import type { NormalizedAnalysisResult } from './normalizedResults'

const timeOnly=(value?:string)=>value?.match(/\d{2}:\d{2}:\d{2}/)?.[0]??'Unknown time'

const safePdfFileName=(value:string)=>value.replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'-')

export type AnalysisStatusTone = 'success'|'warning'|'failed'
export function analysisStatusTone(finalStatus:string):AnalysisStatusTone {
  const status=finalStatus.toLowerCase()
  if(/\b(failed?|failure|error|no available|not routed|incomplete|interrupted|unreachable|busy|timeout|blacklisted|invalid|exceeded|full|insufficient|closed)\b/.test(status))return'failed'
  if(/\b(warning|warn|retry|delay|pending|awaiting|minor|near limit|unknown)\b/.test(status))return'warning'
  return'success'
}

function addWrappedText(pdf:jsPDF,text:string,x:number,y:number,maxWidth:number,lineHeight=5){
  const lines=pdf.splitTextToSize(text,maxWidth) as string[]
  for(const line of lines){
    if(y>282){pdf.addPage();y=18}
    pdf.text(line,x,y)
    y+=lineHeight
  }
  return y
}

function ensureSpace(pdf:jsPDF,y:number,needed=14){
  if(y+needed>282){pdf.addPage();return 18}
  return y
}

export function downloadAnalysisReport(result:NormalizedAnalysisResult,fileName='signaltrace-analysis.pdf') {
  const pdf=new jsPDF({unit:'mm',format:'a4'})
  const left=16
  const width=178
  let y=18

  pdf.setProperties({
    title:`${result.moduleName} - ${result.title}`,
    subject:'SignalTrace Analysis Report',
    creator:'SignalTrace'
  })

  pdf.setFont('helvetica','bold')
  pdf.setFontSize(16)
  pdf.text('SignalTrace Analysis Report',left,y)
  y+=8

  pdf.setFontSize(11)
  pdf.text(result.moduleName,left,y)
  y+=6

  pdf.setFont('helvetica','normal')
  pdf.setFontSize(10)
  y=addWrappedText(pdf,result.title,left,y,width,5)
  y+=3

  const section=(title:string)=>{
    y=ensureSpace(pdf,y,12)
    pdf.setFont('helvetica','bold')
    pdf.setFontSize(11)
    pdf.text(title,left,y)
    y+=6
    pdf.setFont('helvetica','normal')
    pdf.setFontSize(9)
  }

  if(result.technicalDetails.length){
    section('Technical Details')
    for(const item of result.technicalDetails){
      y=ensureSpace(pdf,y,10)
      pdf.setFont('helvetica','bold')
      pdf.text(`${item.label}:`,left,y)
      pdf.setFont('helvetica','normal')
      y=addWrappedText(pdf,String(item.value),left+42,y,width-42,4.5)
      y+=1
    }
    y+=3
  }

  section('Finding')
  y=addWrappedText(pdf,result.finding,left,y,width,4.8)
  y+=4

  section('Root Cause')
  y=addWrappedText(pdf,result.rootCause,left,y,width,4.8)
  y+=4

  const finalName=safePdfFileName(fileName.replace(/\.json$/i,'.pdf').replace(/\.pdf$/i,''))+'.pdf'
  pdf.save(finalName)
}

export function SharedAnalysisReport({result,controls,downloadFileName}:{result:NormalizedAnalysisResult;controls?:ReactNode;downloadFileName?:string}) {
  const progression=result.statusProgression?.filter((value,index,array)=>value&&value!==array[index-1])??[]
  const pdfName=downloadFileName?.replace(/\.json$/i,'.pdf')??`${result.moduleName}-${result.title}.pdf`
  const isLicenseReport=/Messaging License Occupancy/i.test(result.moduleName)
  const statusTone=analysisStatusTone(result.finalStatus)
  return <article className={`network-report shared-analysis-report whatsapp-report${isLicenseReport?' license-occupancy-report':''}`}>
    <header className="report-header"><div><span className="kicker"><span/>{result.moduleName}</span><h2>{result.title}</h2></div><button className="secondary-button" onClick={()=>downloadAnalysisReport(result,pdfName)}>Download PDF</button></header>
    {controls}

    <section className={`ivr-outcome analysis-summary status-${statusTone}`}>
      <span>Final Status</span>
      <strong>{result.finalStatus}</strong>
      {result.duplicateEvents!==undefined&&<p><b>Duplicate callbacks/events:</b> {result.duplicateEvents}</p>}
    </section>

    {result.statusBreakdown?.length
      ? <section className="status-breakdown" aria-label="Status summary">
          <div className="status-breakdown-heading"><span className="section-label">Status Summary</span></div>
          <div className="status-breakdown-grid">{result.statusBreakdown.map(item=><div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</div>
        </section>
      : progression.length>0&&<section className="status-progression-section"><span className="section-label">Status Progression</span><div className="status-progression-chips">{progression.map((item,index)=><span key={`${index}:${item}`}>{item}</span>)}</div></section>}

    {result.summary.length>0&&<section className="metric-row shared-summary-metrics">{result.summary.map(item=><div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</section>}

    {result.tables?.map(table=><section className="analysis-table-section" key={table.title}>
      <div className="analysis-table-heading"><div><span className="section-label">{table.title}</span>{table.description&&<p>{table.description}</p>}</div><b>{table.rows.length} agent{table.rows.length===1?'':'s'}</b></div>
      <div className="analysis-table-wrap"><table><thead><tr>{table.columns.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{table.rows.map((row,rowIndex)=><tr key={`${table.title}:${rowIndex}`}>{row.map((value,columnIndex)=><td key={`${rowIndex}:${columnIndex}`} data-label={table.columns[columnIndex]}><span className={table.columns[columnIndex]==='Status'?`capacity-status capacity-${String(value).toLowerCase().replace(/\s+/g,'-')}`:undefined}>{value}</span></td>)}</tr>)}</tbody></table></div>
    </section>)}

    {result.technicalDetails.length>0&&<details className="whatsapp-technical-details"><summary>Technical Details</summary><dl>{result.technicalDetails.map(item=><div className="technical-detail-row" key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></details>}
    {result.timeline.length>0&&<details className="technical-timeline"><summary>Technical Timeline ({result.timeline.length} events)</summary><div className="problem-list">{result.timeline.map((event,index)=><div className="problem-time" key={`${event.lineNumber??index}:${event.title}`}><time>{timeOnly(event.timestamp)}</time><div><span className="indicator"><i/>{event.title}</span>{event.raw&&<code>{event.raw}</code>}</div></div>)}</div></details>}
    <div className="summary-sections shared-findings"><section><span className="section-label">Finding</span><p>{result.finding}</p></section><section><span className="section-label">Root Cause</span><p>{result.rootCause}</p></section>{result.recommendations.length>0&&<section className="conclusion"><span className="section-label">Recommendation</span><ul>{result.recommendations.filter(Boolean).map((item,index)=><li key={`${index}:${item}`} >{item}</li>)}</ul></section>}</div>
  </article>
}
