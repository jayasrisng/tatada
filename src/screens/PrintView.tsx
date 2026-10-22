import {garmentImage} from '../style/images'
import {packingList} from '../style/looks'
import {savePrintDraft} from '../print/draft'
import {printRoute} from '../print/intent'
import {PrintPanel} from '../components/printing/PrintPanel'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type {PrintSticker} from '../print/pdf'
import { useStore } from '../state/store'
import { go, hashQuery } from '../state/ui'
import { browserOnly } from '../config'
import { Doodle } from '../components/layout/Doodle'
import { Btn, Chip, TODAY, TopBar } from '../components/layout/ui'
import { parsePrintRequest, planPrint, type PrintChoices, type PrintRequest, type PrinterProfile } from '../print/plan'
import { checkJob, getPrinter, getSender, getJob, jobPdf, listJobs, type PrintJob, type Sender } from '../print/client'

const PrintPlayground=lazy(()=>import('../components/printing/PrintPlayground').then(m=>({default:m.PrintPlayground})))
const UNKNOWN_PRINTER: Omit<PrinterProfile, 'email' | 'updatedAt'> = { plainPaper: 'unknown', colorInk: 'unknown', autoDuplex: 'unknown', bodyPrintingOff: 'unknown', senderApproved: 'unknown' }

/**
 * One print workflow for the print icon and for "print …" requests in Magic.
 * Print opens focused settings; previewing and decorating never authorize delivery.
 */
function PrintPreview({ id, doc, inline = false }: { id: string; doc?: string; inline?: boolean }) {
  const { state,workspace } = useStore()
  const trip = state.trips.find((t) => t.id === id)
  const packing = useMemo(()=>Object.values(packingList(state.wardrobe??[],state.looks??[],id).groups).flat().map(g=>({name:g.name,category:g.category,image:garmentImage(g.image)})),[state.wardrobe,state.looks,id])
  const packingOutfits = useMemo(()=>(state.looks??[]).filter(l=>l.tripId===id&&l.verdict==='keep').map((l,i)=>({name:l.day ? `Outfit ${i+1} / ${l.day}` : `Outfit ${i+1}`,pieces:l.garmentIds.flatMap(gid=>{const g=(state.wardrobe??[]).find(g=>g.id===gid);return g?[{name:g.name,image:garmentImage(g.image)}]:[]})})),[state.looks,state.wardrobe,id])
  const ask = inline ? '' : hashQuery().get('ask') ?? ''
  const [text, setText] = useState(ask)
  const parsed = useMemo(() => parsePrintRequest(text), [text])
  const [kind, setKind] = useState<'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all'>(doc === 'journal' || doc === 'flights' || doc === 'hotels' || doc === 'packing' || doc === 'all' ? doc : parsed.document ?? 'card')
  const [stickers,setStickers]=useState<PrintSticker[]>([])
  const [designOpen,setDesignOpen]=useState(true),[designUrl,setDesignUrl]=useState('')
  const [caption,setCaption]=useState('')
  const [request, setRequest] = useState<PrintRequest>(parsed)
  const [choices, setChoices] = useState<PrintChoices>({})
  const [printer, setPrinter] = useState<PrinterProfile | null | undefined>(browserOnly ? null : undefined)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [, setSender] = useState<Sender | null>(null)
  const [job, setJob] = useState<PrintJob | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewJobId, setPreviewJobId] = useState('')
  const [localPages, setLocalPages] = useState(0)
  const [lossy, setLossy] = useState(false)
  const [busy] = useState(''), [problem, setProblem] = useState(''), [confirmDup, setConfirmDup] = useState(false)
  const restored = useRef(false)
  const url = useRef('')
  const autoPreparing = useRef(false)
  const setPreview = (blob: Blob | null, jobId = '') => { setPreviewJobId(blob ? jobId : ''); if (url.current) URL.revokeObjectURL(url.current); url.current = blob ? URL.createObjectURL(blob) : ''; setPreviewUrl(url.current) }
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  useEffect(() => { setRequest(parsed); setChoices({}); if (parsed.document) setKind(parsed.document) }, [parsed])
  useEffect(() => {
    if (browserOnly) return
    let live = true
    getPrinter().then((p) => { if(live){setPrinter(p)} }, (e: Error) => { if(live){setPrinter(null); setProblem(e.message)} })
    getSender().then((r) => {if(live)setSender(r.sender)}, () => {if(live)setSender(null)})
    // Show where the last job for this document ended up (after a refresh or restart).
    if(!inline)listJobs().then((jobs) => { if (!live || autoPreparing.current) return; const last = jobs.find((j) => j.document.tripId === id && j.document.kind === kind && j.status !== 'cancelled'); if(last){restored.current=true;setJob(last)} }, () => {})
    return () => { live = false }
  }, [id, kind])

  // Any change to the document or settings invalidates the prepared job and its approval.
  const invalidate = () => { restored.current=false; setJob(null); setPreview(null); setConfirmDup(false) }
  useEffect(invalidate, [kind, stickers, caption, JSON.stringify(request), JSON.stringify(choices), JSON.stringify(trip), JSON.stringify(state.items.filter(item=>item.tripId===id)), JSON.stringify(state.profile), JSON.stringify(packing), JSON.stringify(packingOutfits)])
  useEffect(()=>setStickers([]),[kind])

  // Notebook preview is local-only: opening it never creates a job or sends an email.
  useEffect(() => {
    if (!trip || (job && !restored.current)) return
    let live = true
    const settings = planPrint(request, printer ?? UNKNOWN_PRINTER, choices)
    import('../print/pdf').then(({buildPdf}) => buildPdf({kind, trip, items:state.items, profile:state.profile, packing, packingOutfits, stickers, caption, printedOn:TODAY}, settings)).then(built => {
      if (live) {setLossy(built.lossyText);setLocalPages(built.pageCount);setPreview(new Blob([built.bytes as BlobPart],{type:'application/pdf'}))}
    }, e => {if (live) setProblem((e as Error).message)})
    return () => {live = false}
  }, [inline, trip, kind, request, choices, printer, job, state.items, state.profile, packing, packingOutfits, stickers, caption])

  useEffect(()=>{
    if(!designOpen||!trip)return
    let active=true,objectUrl='';setDesignUrl('')
    const settings=planPrint(request,printer??UNKNOWN_PRINTER,choices)
    import('../print/pdf').then(({buildPdf})=>buildPdf({kind,trip,items:state.items,profile:state.profile,packing,packingOutfits,caption,printedOn:TODAY},settings)).then(built=>{if(active){objectUrl=URL.createObjectURL(new Blob([built.bytes as BlobPart],{type:'application/pdf'}));setDesignUrl(objectUrl)}},()=>{if(active)setProblem('Preview unavailable.')})
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[designOpen,trip,kind,request,choices,printer,state.items,state.profile,packing,packingOutfits,caption])

  useEffect(()=>{
    if(!job||!(job.status==='sending'||(job.status==='send_uncertain'&&job.sender.kind==='fo')||(busy&&job.status==='awaiting_approval')))return
    let live=true;const timer=window.setInterval(()=>{void getJob(job.id).then(current=>{if(live)setJob(previous=>previous?.id===current.id?current:previous)},()=>{})},1200)
    return()=>{live=false;clearInterval(timer)}
  },[job?.id,job?.status,busy])

  const mailPending=false



  if (!trip) return (
    <div className="screen center">
      <Doodle name="printer" size={48} />
      <h2 className="chalk-title">nothing to print here</h2>
      <p className="dim">That trip doesn't exist on this device.</p>
      <Btn kind="solid" onClick={() => go('/trips')}>pick a trip</Btn>
    </div>
  )

  const profile = printer ?? { ...UNKNOWN_PRINTER, email: '', updatedAt: 0 }
  const plan = planPrint(request, profile, choices, job?.pageCount ? job.pageCount / Math.max(1, job.plan.repeat) : localPages || undefined)

  return <div className={inline?'print-screen print-inline':'screen print-screen'}>
    {!inline&&<TopBar back={`/trip/${trip.id}`} title="print"/>}
    <div className="print-flow">
      <div className="chips" role="group" aria-label="Document">{([['card','trip notebook','book'],['flights','flights','plane'],['hotels','stay','bed'],['packing','packing','suitcase'],['journal','journal','book'],['all','all','layers']] as const).map(([value,label,icon])=><Chip key={value} on={kind===value} onClick={()=>setKind(value)} icon={icon}>{label}</Chip>)}</div>
      <div className="print-design-header"><h2>Print &amp; decorate</h2>      <div className="print-final-actions">
        <a className="iconbtn" href={previewUrl||undefined} aria-disabled={!previewUrl} onClick={e=>{if(!previewUrl)e.preventDefault()}} download={`${trip.destination.toLowerCase().replace(/\W+/g,'-')}-${kind}.pdf`} aria-label="Download PDF"><Doodle name="download" size={26}/></a>
        <Btn kind="solid" disabled={!!busy||mailPending||printer===undefined||job?.status==='sending'||job?.status==='send_uncertain'} onClick={()=>{savePrintDraft({account:workspace.storageKey,id,kind,stickers,caption});go(printRoute(id,kind,text))}}>Print</Btn>
      </div></div>
      {busy&&<p role="status" aria-live="polite">{busy}</p>}
      {job?.status==='submitted'&&<p role="status">{job.sender.kind==='mock'?'Demo delivery recorded. No real email was sent.':job.sender.kind==='fo'?'Wajo reports the email sent and returned a matching Gmail receipt. Paper completion is unconfirmed.':'Submitted to printer email. Paper completion is unconfirmed.'}</p>}
      {job?.status==='send_uncertain'&&<div><p role="alert">{job.sender.kind==='fo'?'Wajo is handling this print email. Checking its receipt; nothing will be resent automatically.':'Send status unknown. Not resent. Check your sent mail and printer before retrying.'}</p><Btn kind="ghost" disabled={!!busy} onClick={()=>void checkJob(job.id).then(setJob,e=>setProblem(e.message))}>check send status without resending</Btn>{job.sender.kind!=='fo'&&<details><summary>Send again after checking</summary><p>This can produce a duplicate if the first email arrived.</p><Btn disabled={!!busy} onClick={()=>go(printRoute(id,kind,text))}>I checked · approve sending again</Btn></details>}</div>}
      {(job?.status==='failed'||job?.status==='blocked')&&<p role="alert">Not sent: {job.error||job.blocker}</p>}
      {problem&&<p role="alert">{problem}</p>}
      {browserOnly && <p className="small">PDF download only. No email is sent in browser-only mode.</p>}
      {job && <details className="now-card" open={job.status==='awaiting_approval' && (!!job.blocker || confirmDup)}><summary>Print details &amp; PDF</summary><section aria-label="Print details">
        <h3>{job.status === 'awaiting_approval' ? 'Ready to print' : 'Print details'}</h3>
        {restored.current && <p className="small">Restored after reload. This is the stored document; tap Print to send your current trip and decorations.</p>}
        <p>{job.document.title} · {job.pageCount} pages · {new Date(job.createdAt).toLocaleString()}</p>
        <p className="small">From: {job.sender.label} → {job.address}</p>
        <ul className="small">{job.plan.lines.map((line,index)=><li key={index}>{line.setting}: {line.result}</li>)}</ul>
        <details><summary>Printer limitations &amp; checks</summary><ul className="small">{job.plan.limitations.map(line=><li key={line}>{line}</li>)}</ul></details>
        <p className="small">Document {job.contentHash.slice(0,12)} · Gmail submission does not confirm a printed page.</p>
        {previewUrl && previewJobId === job.id && <a className="linkbtn" href={previewUrl} target="_blank" rel="noreferrer">Open sent / prepared PDF</a>}
        {previewJobId!==job.id && <button className="linkbtn" onClick={()=>void jobPdf(job.id).then(blob=>{const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=`tatada-${job.document.kind}.pdf`;link.click();window.setTimeout(()=>URL.revokeObjectURL(href),60000)},e=>setProblem(e.message))}>Download stored print</button>}
        {job.status==='awaiting_approval' && <Btn kind="solid" disabled={!!busy||!!job.blocker||mailPending} onClick={()=>go(printRoute(id,kind,text))}>{confirmDup?'Print another copy':'Print prepared PDF'}</Btn>}
        {job.blocker && <p role="alert">{job.blocker}</p>}
      </section></details>}
      <details className="print-decoration" open={designOpen} onToggle={e=>setDesignOpen(e.currentTarget.open)}><summary>{job ? 'Decorate your next print' : 'Decorate'}</summary>{designOpen&&(designUrl?<Suspense fallback={<p>Loading page…</p>}><PrintPlayground source={designUrl} stickers={stickers} onChange={setStickers}/></Suspense>:<p>Loading page…</p>)}<input placeholder="Write a caption here…" className="chalk-input caption-line" aria-label="Keepsake caption" maxLength={80} value={caption} onChange={e=>setCaption(e.target.value)}/></details>
      <details className="print-settings" open={settingsOpen} onToggle={e=>setSettingsOpen(e.currentTarget.open)}><summary>Preview settings</summary>
        <label className="print-ask">Print request<input className="chalk-input" value={text} onChange={e=>setText(e.target.value)} placeholder="Two copies, black and white…" aria-label="Print request"/></label>
        <div className="chips wrap" role="group" aria-label="Print settings"><Chip on={request.color==='grayscale'} onClick={()=>setRequest({...request,color:request.color==='grayscale'?undefined:'grayscale'})}>black &amp; white</Chip><Chip on={request.color==='color'} onClick={()=>setRequest({...request,color:request.color==='color'?undefined:'color'})}>color</Chip>{(['letter','a4'] as const).map(size=><Chip key={size} on={request.size===size} onClick={()=>setRequest({...request,size})}>{size==='a4'?'A4':'Letter'}</Chip>)}<Chip on={request.size==='4x6'} onClick={()=>setRequest({...request,size:request.size==='4x6'?undefined:'4x6'})}>4×6</Chip><Chip on={!!request.duplex} onClick={()=>setRequest({...request,duplex:request.duplex?undefined:true})}>two-sided</Chip><Chip on={(request.copies??1)>1} onClick={()=>setRequest({...request,copies:(request.copies??1)>=10?1:(request.copies??1)+1})}>{request.copies??1} copies</Chip></div>
        {plan.questions.map(q=><div className="print-question" key={q.key} role="group" aria-label={q.text}><p>{q.text}</p><div className="ac-buttons">{q.options.map(o=><Btn key={o.value} kind="ghost" onClick={()=>setChoices({...choices,[q.key]:o.value})}>{o.label}</Btn>)}</div></div>)}
        {lossy&&<p className="small">Some text characters cannot be printed.</p>}
        {job?.status==='send_uncertain'&&<Btn kind="ghost" onClick={()=>void checkJob(job.id).then(setJob,e=>setProblem(e.message))}>check send status</Btn>}
      </details>


    </div>
  </div>
}

export function PrintView(props:{id:string;doc?:string;inline?:boolean}){return props.inline||hashQuery().get('preview')==='1'?<PrintPreview {...props}/>:<PrintPanel id={props.id} doc={props.doc}/>}
