import {garmentImage} from '../style/images'
import {packingList} from '../style/looks'
import { GmailConnection } from '../components/GmailConnection'
import { consumePrintIntent } from '../print/intent'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type {PrintSticker} from '../print/pdf'
import { useStore } from '../state/store'
import { go, hashQuery } from '../state/ui'
import { browserOnly } from '../config'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, TODAY, TopBar } from '../components/ui'
import { EPSON_EMAIL, parsePrintRequest, parsePrintMail, planPrint, type Answer, type PrintChoices, type PrintRequest, type PrinterProfile } from '../print/plan'
import { approveJob, checkJob, getPrinter, getSender, getJob, jobPdf, listJobs, prepareJob, savePrinter, type PrintJob, type Sender } from '../print/client'

const PrintPlayground=lazy(()=>import('../components/PrintPlayground').then(m=>({default:m.PrintPlayground})))
const UNKNOWN_PRINTER: Omit<PrinterProfile, 'email' | 'updatedAt'> = { plainPaper: 'unknown', colorInk: 'unknown', autoDuplex: 'unknown', bodyPrintingOff: 'unknown', senderApproved: 'unknown' }

/**
 * One print workflow for the print icon and for "print …" requests in Magic.
 * A fresh Print gesture authorizes generating and sending the current document.
 * One-use route tokens never resend on reload; browsing and decorating alone never send.
 */
export function PrintView({ id, doc, inline = false }: { id: string; doc?: string; inline?: boolean }) {
  const { state } = useStore()
  const trip = state.trips.find((t) => t.id === id)
  const packing = useMemo(()=>Object.values(packingList(state.wardrobe??[],state.looks??[],id).groups).flat().map(g=>({name:g.name,category:g.category,image:garmentImage(g.image)})),[state.wardrobe,state.looks,id])
  const packingOutfits = useMemo(()=>(state.looks??[]).filter(l=>l.tripId===id&&l.verdict==='keep').map((l,i)=>({name:l.day ? `Outfit ${i+1} / ${l.day}` : `Outfit ${i+1}`,pieces:l.garmentIds.flatMap(gid=>{const g=(state.wardrobe??[]).find(g=>g.id===gid);return g?[{name:g.name,image:garmentImage(g.image)}]:[]})})),[state.looks,state.wardrobe,id])
  const ask = inline ? '' : hashQuery().get('ask') ?? ''
  const [text, setText] = useState(ask)
  const mailRequest=useMemo(()=>parsePrintMail(text),[text])
  const parsed = useMemo(() => parsePrintRequest(text), [text])
  const [kind, setKind] = useState<'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all'>(doc === 'journal' || doc === 'flights' || doc === 'hotels' || doc === 'packing' || doc === 'all' ? doc : parsed.document ?? 'card')
  const [stickers,setStickers]=useState<PrintSticker[]>([])
  const [designOpen,setDesignOpen]=useState(true),[designUrl,setDesignUrl]=useState('')
  const [caption,setCaption]=useState('')
  const [request, setRequest] = useState<PrintRequest>(parsed)
  const [choices, setChoices] = useState<PrintChoices>({})
  const [printer, setPrinter] = useState<PrinterProfile | null | undefined>(browserOnly ? null : undefined)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [editingPrinter, setEditingPrinter] = useState(false)
  const [sender, setSender] = useState<Sender | null>(null)
  const [job, setJob] = useState<PrintJob | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewJobId, setPreviewJobId] = useState('')
  const [localPages, setLocalPages] = useState(0)
  const [lossy, setLossy] = useState(false)
  const [busy, setBusy] = useState(''), [problem, setProblem] = useState(''), [confirmDup, setConfirmDup] = useState(false)
  const running = useRef(false)
  const restored = useRef(false)
  const documentVersion = JSON.stringify([trip, state.items.filter(item=>item.tripId===id), state.profile, packing, packingOutfits, kind, stickers, caption, request, choices, printer])
  const latestVersion = useRef(documentVersion)
  latestVersion.current = documentVersion
  const url = useRef('')
  const autoStarted = useRef(false)
  const autoPreparing = useRef(false)
  const setPreview = (blob: Blob | null, jobId = '') => { setPreviewJobId(blob ? jobId : ''); if (url.current) URL.revokeObjectURL(url.current); url.current = blob ? URL.createObjectURL(blob) : ''; setPreviewUrl(url.current) }
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  useEffect(() => { setRequest(parsed); setChoices({}); if (parsed.document) setKind(parsed.document) }, [parsed])
  useEffect(() => {
    if (browserOnly) return
    let live = true
    getPrinter().then((p) => { if(live){setPrinter(p); setEditingPrinter(!p)} }, (e: Error) => { if(live){setPrinter(null); setProblem(e.message)} })
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

  const mailPending=!!printer&&!!((mailRequest.from&&mailRequest.from.toLowerCase()!==printer.senderEmail?.toLowerCase())||(mailRequest.to&&mailRequest.to!==printer.email))
  useEffect(()=>{
    if(!mailPending||!printer)return
    setSettingsOpen(true)
    if(mailRequest.to&&!EPSON_EMAIL.test(mailRequest.to)){setProblem('Use an Epson Connect printer address.');return}
    let live=true;const timer=window.setTimeout(()=>{void savePrinter({...printer,senderEmail:mailRequest.from??printer.senderEmail,email:mailRequest.to??printer.email}).then(saved=>{if(live){setPrinter(saved);invalidate();setProblem('')}},e=>{if(live)setProblem(e.message)})},500)
    return()=>{live=false;clearTimeout(timer)}
  },[mailPending,printer,mailRequest])

  useEffect(() => {
    if (inline || autoStarted.current || printer === undefined || editingPrinter || mailPending) return
    const token = hashQuery().get('run')
    if (!token) return
    // Consume synchronously before any async work: StrictMode and reloads cannot replay it.
    autoStarted.current = true
    if (consumePrintIntent(token, id, kind, ask)) {
      autoPreparing.current = true
      invalidate()
      void prepare(true)
    }
  }, [printer, editingPrinter, mailPending, ask, id, kind])

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

  async function prepare(sendNow = false) {
    if(running.current)return
    setProblem(''); setConfirmDup(false)
    if (plan.questions.length){setSettingsOpen(true);return setProblem('Check print settings.')}
    if(!browserOnly&&!printer){setSettingsOpen(true);return setProblem('Save a printer in print settings, then tap Print.')}
    running.current=true
    const version = documentVersion
    setBusy('making the PDF…')
    try {
      const { buildPdf } = await import('../print/pdf') // pdf-lib loads only when a PDF is made
      const built = await buildPdf({ kind, trip: trip!, items: state.items, profile: state.profile, packing, packingOutfits, stickers, caption, printedOn: TODAY }, plan)
      if(version!==latestVersion.current)throw Error('The document changed while preparing. Prepare the latest version again.')
      setLossy(built.lossyText); setLocalPages(built.pageCount)
      if (browserOnly || !printer) { setPreview(new Blob([built.bytes as BlobPart], { type: 'application/pdf' })); return }
      setPreview(null)
      setBusy('saving the PDF…')
      const prepared = await prepareJob({ pdf: built.bytes, document: { kind, title: built.title, tripId: trip!.id }, request, choices })
      const attachment = sendNow ? new Blob([built.bytes as BlobPart], {type:'application/pdf'}) : await jobPdf(prepared.id)
      if(version!==latestVersion.current)throw Error('The document changed while preparing. Prepare the latest version again.')
      restored.current=false
      setJob(prepared)
      setPreview(attachment, prepared.id)
      if(prepared.blocker){setProblem(prepared.blocker);setSettingsOpen(true)}
      else if(sendNow){setBusy('sending to your printer…');setJob(await approveJob(prepared))}
    } catch (e) { const message=(e as Error).message;if(/exact document was/.test(message))setConfirmDup(true);setProblem(message) } finally { running.current=false; setBusy('') }
  }


  async function approve(o: { allowDuplicate?: boolean; resendAfterUncertain?: boolean } = {}) {
    if (!job || running.current) return
    running.current=true
    setProblem(''); setBusy('sending…')
    try { setJob(await approveJob(job, o)); setConfirmDup(false) }
    catch (e) {
      const err = e as Error & { status?: number }
      if (/exact document was/.test(err.message)) setConfirmDup(true)
      setProblem(err.message)
    } finally { running.current=false; setBusy('') }
  }

  return <div className={inline?'print-screen print-inline':'screen print-screen'}>
    {!inline&&<TopBar back={`/trip/${trip.id}`} title="print"/>}
    <div className="print-flow">
      <div className="chips" role="group" aria-label="Document">{([['card','trip notebook','book'],['flights','flights','plane'],['hotels','stay','bed'],['packing','packing','suitcase'],['journal','journal','book'],['all','all','layers']] as const).map(([value,label,icon])=><Chip key={value} on={kind===value} onClick={()=>setKind(value)} icon={icon}>{label}</Chip>)}</div>
      <div className="print-design-header"><h2>Print &amp; decorate</h2>      <div className="print-final-actions">
        <a className="iconbtn" href={previewUrl||undefined} aria-disabled={!previewUrl} onClick={e=>{if(!previewUrl)e.preventDefault()}} download={`${trip.destination.toLowerCase().replace(/\W+/g,'-')}-${kind}.pdf`} aria-label="Download PDF"><Doodle name="download" size={26}/></a>
        <Btn kind="solid" disabled={!!busy||mailPending||printer===undefined||job?.status==='sending'||job?.status==='send_uncertain'} onClick={()=>{autoPreparing.current=true;if(confirmDup&&job?.status==='awaiting_approval')void approve({allowDuplicate:true});else void prepare(!browserOnly)}}>{browserOnly?'refresh PDF':confirmDup?'Print another copy':'Print'}</Btn>
      </div></div>
      {busy&&<p role="status" aria-live="polite">{busy}</p>}
      {job?.status==='submitted'&&<p role="status">{job.sender.kind==='mock'?'Demo delivery recorded. No real email was sent.':job.sender.kind==='fo'?'Wajo reports the email sent and returned a matching Gmail receipt. Paper completion is unconfirmed.':'Submitted to printer email. Paper completion is unconfirmed.'}</p>}
      {job?.status==='send_uncertain'&&<div><p role="alert">{job.sender.kind==='fo'?'Wajo is handling this print email. Checking its receipt; nothing will be resent automatically.':'Send status unknown. Not resent. Check your sent mail and printer before retrying.'}</p><Btn kind="ghost" disabled={!!busy} onClick={()=>void checkJob(job.id).then(setJob,e=>setProblem(e.message))}>check send status without resending</Btn>{job.sender.kind!=='fo'&&<details><summary>Send again after checking</summary><p>This can produce a duplicate if the first email arrived.</p><Btn disabled={!!busy} onClick={()=>void approve({resendAfterUncertain:true})}>I checked · approve sending again</Btn></details>}</div>}
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
        {job.status==='awaiting_approval' && <Btn kind="solid" disabled={!!busy||!!job.blocker||mailPending} onClick={()=>void approve(confirmDup?{allowDuplicate:true}:{})}>{confirmDup?'Print another copy':'Print prepared PDF'}</Btn>}
        {job.blocker && <p role="alert">{job.blocker}</p>}
      </section></details>}
      <details className="print-decoration" open={designOpen} onToggle={e=>setDesignOpen(e.currentTarget.open)}><summary>{job ? 'Decorate your next print' : 'Decorate'}</summary>{designOpen&&(designUrl?<Suspense fallback={<p>Loading page…</p>}><PrintPlayground source={designUrl} stickers={stickers} onChange={setStickers}/></Suspense>:<p>Loading page…</p>)}<input placeholder="Write a caption here…" className="chalk-input caption-line" aria-label="Keepsake caption" maxLength={80} value={caption} onChange={e=>setCaption(e.target.value)}/></details>
      <details className="print-settings" open={settingsOpen} onToggle={e=>setSettingsOpen(e.currentTarget.open)}><summary><Doodle name="mail" size={18}/>Change print settings</summary>
        {!browserOnly&&<><MailSettings printer={printer??null} sender={sender} onSaved={p=>{setPrinter(p);setEditingPrinter(false);invalidate();setProblem('')}}/>{sender?.kind!=='fo'&&<GmailConnection preferredEmail={printer?.senderEmail} returnTo={`/trip/${trip.id}/print${kind==='card'?'':`/${kind}`}`}/>}<details><summary>Printer options</summary><PrinterSetup current={printer??null} senderLabel={sender?.label} onSaved={p=>{setPrinter(p);setEditingPrinter(false);invalidate()}}/></details></>}
        <label className="print-ask">Print request<input className="chalk-input" value={text} onChange={e=>setText(e.target.value)} placeholder="Two copies, black and white…" aria-label="Print request"/></label>
        <div className="chips wrap" role="group" aria-label="Print settings"><Chip on={request.color==='grayscale'} onClick={()=>setRequest({...request,color:request.color==='grayscale'?undefined:'grayscale'})}>black &amp; white</Chip><Chip on={request.color==='color'} onClick={()=>setRequest({...request,color:request.color==='color'?undefined:'color'})}>color</Chip>{(['letter','a4'] as const).map(size=><Chip key={size} on={request.size===size} onClick={()=>setRequest({...request,size})}>{size==='a4'?'A4':'Letter'}</Chip>)}<Chip on={request.size==='4x6'} onClick={()=>setRequest({...request,size:request.size==='4x6'?undefined:'4x6'})}>4×6</Chip><Chip on={!!request.duplex} onClick={()=>setRequest({...request,duplex:request.duplex?undefined:true})}>two-sided</Chip><Chip on={(request.copies??1)>1} onClick={()=>setRequest({...request,copies:(request.copies??1)>=10?1:(request.copies??1)+1})}>{request.copies??1} copies</Chip></div>
        {plan.questions.map(q=><div className="print-question" key={q.key} role="group" aria-label={q.text}><p>{q.text}</p><div className="ac-buttons">{q.options.map(o=><Btn key={o.value} kind="ghost" onClick={()=>setChoices({...choices,[q.key]:o.value})}>{o.label}</Btn>)}</div></div>)}
        {lossy&&<p className="small">Some text characters cannot be printed.</p>}
        {job?.status==='send_uncertain'&&<Btn kind="ghost" onClick={()=>void checkJob(job.id).then(setJob,e=>setProblem(e.message))}>check send status</Btn>}
      </details>


    </div>
  </div>
}

function MailSettings({printer,sender,onSaved}:{printer:PrinterProfile|null;sender:Sender|null;onSaved:(p:PrinterProfile)=>void}){
 const [from,setFrom]=useState(printer?.senderEmail??(sender?.verified&&sender.kind==='gmail'?sender.label:'')),[to,setTo]=useState(printer?.email??''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{setFrom(printer?.senderEmail??(sender?.verified&&sender.kind==='gmail'?sender.label:''));setTo(printer?.email??'')},[printer,sender])
 return <form className="print-mail-settings" aria-label="Print email settings" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{if(from&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))throw Error('Check the From address.');const saved=await savePrinter({...UNKNOWN_PRINTER,...printer,senderEmail:from,email:to,directPrint:printer?.directPrint??true});onSaved(saved)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><label><span className="sr-only">From</span><input placeholder="Sending email" type="email" className="chalk-input" aria-label="Sending email" value={from} onChange={e=>setFrom(e.target.value)}/></label><label><span className="sr-only">To</span><input placeholder="Printer email" type="email" required className="chalk-input" aria-label="Printer email" value={to} onChange={e=>setTo(e.target.value)}/></label>{sender?.verified&&<p className="small">Connected sender: {sender.label}</p>}<Btn type="submit" kind="ghost" disabled={busy}>{busy?'saving…':'save'}</Btn>{error&&<p role="alert">{error}</p>}</form>
}

function PrinterSetup({ current, onSaved, onCancel, senderLabel }: { current: PrinterProfile | null; onSaved: (p: PrinterProfile) => void; onCancel?: () => void; senderLabel?: string }) {
  const [v, setV] = useState({ directPrint: false, ...UNKNOWN_PRINTER, ...(current ?? {}), email: current?.email ?? '' })
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const pick = (key: 'colorInk' | 'autoDuplex' | 'bodyPrintingOff' | 'senderApproved', label: string) => (
    <fieldset className="setup-q"><legend>{label}</legend>
      {(['yes', 'no', 'unknown'] as Answer[]).map((a) => <label key={a}><input type="radio" name={key} checked={v[key] === a} onChange={() => setV({ ...v, [key]: a })} /> {a === 'unknown' ? 'not sure' : a}</label>)}
    </fieldset>
  )
  return (
    <form className="printer-setup" aria-label="Printer setup" onSubmit={(e) => {
      e.preventDefault(); setError('')
      if (!EPSON_EMAIL.test(v.email.trim())) return setError('Use the printer\'s Epson Connect address, like name@print.epsonconnect.com.')
      setSaving(true)
      savePrinter({ ...v, email: v.email.trim() }).then(onSaved, (err: Error) => setError(err.message)).finally(() => setSaving(false))
    }}>
      <h3 className="section-h">your Epson printer</h3>
      <p className="small">Saying or tapping Print sends directly using these saved settings.</p>
      <label><span className="small dim">printer email address</span><input className="chalk-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="name@print.epsonconnect.com" aria-label="Epson printer email" autoComplete="off" /></label>
      <p className="small dim">Find it in the Epson Connect User Page → Printer List, or on the printer's setup sheet. It's saved privately to your Tatada account.</p>
      <fieldset className="setup-q"><legend>plain paper size set in Epson Connect</legend>
        {(['letter', 'a4', 'unknown'] as const).map((a) => <label key={a}><input type="radio" name="plainPaper" checked={v.plainPaper === a} onChange={() => setV({ ...v, plainPaper: a })} /> {a === 'unknown' ? 'not sure' : a === 'a4' ? 'A4' : 'Letter'}</label>)}
      </fieldset>
      {pick('colorInk', 'it has color ink')}
      {pick('autoDuplex', 'it prints two-sided automatically')}
      <details className="small"><summary>one-time Epson Connect settings</summary>
        <ol>
          <li>In Epson Connect → Print Settings, turn off "Print Email Body" and "Print Sender's Information", or Epson may print an extra page.</li>
          <li>If "Use Approved Senders List" is on, add the address that will send: {senderLabel ?? 'your connected sending account'}.</li>
          <li>Optional: turn on notification emails for that sender to get Epson's completion notice.</li>
        </ol>
        <p>Tatada never asks for your Epson or email password.</p>
      </details>
      {pick('bodyPrintingOff', 'email body and sender info printing are off')}
      {pick('senderApproved', 'the sender is approved (or the list is off)')}
      {error && <p className="ac-problem" role="alert">{error}</p>}
      <div className="ac-buttons"><Btn kind="solid" type="submit" disabled={saving}>{saving ? 'saving…' : 'save printer'}</Btn>{onCancel && <Btn kind="ghost" type="button" onClick={onCancel}>cancel</Btn>}</div>
    </form>
  )
}
