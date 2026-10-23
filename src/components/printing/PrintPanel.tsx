import {useServer} from '../../state/server'
import {SecurityGate} from '../account/SecurityGate'
import {printDraft} from '../../print/draft'
import {useEffect,useMemo,useRef,useState} from 'react'
import {browserOnly,deviceWorkspace} from '../../config'
import {approveJob,getJob,getPrinter,jobPdf,listJobs,prepareJob,type PrintJob} from '../../print/client'
import {parsePrintRequest,planPrint,type PrinterProfile,type PrintRequest} from '../../print/plan'
import {useStore} from '../../state/store'
import {go,hashQuery} from '../../state/ui'
import {packingList} from '../../style/looks'
import {garmentImage} from '../../style/images'
import {ConfirmationDialog} from '../layout/ConfirmationDialog'
import {TODAY} from '../layout/ui'
function PrintPanelContent({id,doc}:{id:string;doc?:string}){
 const {info}=useServer()
 const {state,workspace}=useStore(),trip=state.trips.find(t=>t.id===id)
 const [printer,setPrinter]=useState<PrinterProfile|null>(),[request,setRequest]=useState<PrintRequest>(),[job,setJob]=useState<PrintJob>(),[previous,setPrevious]=useState<PrintJob[]>([]),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState('')
 const preparedVersion=useRef(''),sending=useRef(false),previewRef=useRef(''),mounted=useRef(true)
 const kind:PrintJob['document']['kind']=['journal','flights','hotels','packing','all'].includes(doc??'')?doc as PrintJob['document']['kind']:'card'
 const draft=printDraft(workspace.storageKey,id,kind)
 const ask=hashQuery().get('ask')??''
 const close=()=>go(`/trip/${id}`)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(previewRef.current)URL.revokeObjectURL(previewRef.current)}},[])
 useEffect(()=>{let active=true;if(browserOnly){setPrinter(null);return}Promise.all([getPrinter(),deviceWorkspace&&!info.authenticated?Promise.resolve([]):listJobs()]).then(([p,jobs])=>{if(active){setPrinter(p);setPrevious(jobs);setRequest({color:'grayscale',duplex:false,copies:1,size:p?.plainPaper==='a4'?'a4':'letter',...p?.defaults,...parsePrintRequest(ask)})}},e=>{if(active)setProblem(e.message)});return()=>{active=false}},[id,ask,info.authenticated])
 const packing=useMemo(()=>Object.values(packingList(state.wardrobe??[],state.looks??[],id).groups).flat().map(g=>({name:g.name,category:g.category,image:garmentImage(g.image)})),[state.wardrobe,state.looks,id])
 const packingOutfits=useMemo(()=>(state.looks??[]).filter(l=>l.tripId===id&&l.verdict==='keep').map((l,i)=>({name:`Outfit ${i+1}`,pieces:l.garmentIds.flatMap(gid=>{const g=state.wardrobe?.find(g=>g.id===gid);return g?[{name:g.name,image:garmentImage(g.image)}]:[]})})),[state.looks,state.wardrobe,id])
 const choices=useMemo(()=>({copies:'repeat-pages' as const,fourBySix:'layout-on-plain' as const}),[])
 const plan=useMemo(()=>printer&&request?planPrint(request,printer,choices):undefined,[printer,request,choices])
 const version=JSON.stringify([trip,state.items,state.profile,packing,packingOutfits,kind,request,printer,draft]),latest=useRef(version);latest.current=version
 // Preparation stores bytes and settings only. Delivery is exclusively in approve().
 useEffect(()=>{if(deviceWorkspace&&!info.authenticated)return;if(!trip||!printer||!request||!plan||plan.questions.length)return;let active=true;setJob(undefined);setProblem('');setBusy(true);const timer=setTimeout(()=>{void import('../../print/pdf').then(m=>m.buildPdf({kind,trip,items:state.items,profile:state.profile,packing,packingOutfits,stickers:draft?.stickers,caption:draft?.caption,printedOn:TODAY},plan)).then(built=>{if(!active)return;return prepareJob({pdf:built.bytes,document:{kind,title:built.title,tripId:id},request,choices})}).then(prepared=>{if(active&&prepared){preparedVersion.current=version;setJob(prepared)}},e=>{if(active)setProblem(e.message)}).finally(()=>{if(active)setBusy(false)})},200);return()=>{active=false;clearTimeout(timer)}},[version,plan,choices,info.authenticated])
 useEffect(()=>{if(job?.status!=='sending'&&!(job?.sender.kind==='fo'&&job.status==='send_uncertain'&&!job.foRequestFinished))return;let active=true;const timer=setInterval(()=>{void getJob(job.id).then(j=>{if(active)setJob(j)},()=>{})},1500);return()=>{active=false;clearInterval(timer)}},[job?.id,job?.status,job?.foRequestFinished])
 const twin=job&&previous.find(j=>j.id!==job.id&&j.pdfHash===job.pdfHash&&j.address===job.address&&(['sending','send_uncertain'].includes(j.status)||(j.status==='submitted'&&Date.now()-j.updatedAt<900000)))
 const uncertain=!!twin&&twin.status!=='submitted'
 async function approve(){if(!job||job.status!=='awaiting_approval'||sending.current||uncertain)return;sending.current=true;setBusy(true);const before=version;try{if(before!==latest.current||preparedVersion.current!==latest.current)throw Error('Document changed. Review the latest settings.');const result=await approveJob(job,{allowDuplicate:twin?.status==='submitted'});if(mounted.current)setJob(result)}catch(e){if(mounted.current)setProblem((e as Error).message)}finally{sending.current=false;if(mounted.current)setBusy(false)}}
 async function showPreview(){if(!job)return;try{const pdf=await jobPdf(job.id);if(!mounted.current)return;if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=URL.createObjectURL(pdf);setPreview(previewRef.current)}catch(e){setProblem((e as Error).message)}}
 return <div className="screen"><ConfirmationDialog title="Print settings" onClose={close}>
  {deviceWorkspace&&!info.authenticated?<><p>Connect Wajo in Profile to send to your printer.</p><button className="btn" onClick={()=>go('/welcome?printing=1')}>Open Profile</button><button className="linkbtn" onClick={()=>go(`/trip/${id}/print${kind==='card'?'':`/${kind}`}?preview=1`)}>Preview PDF</button></>:!trip?<p>Trip not found.</p>:printer===undefined&&!problem?<p>Loading print settings…</p>:!printer?<><p>Set up printing in Profile → Printing first.</p><button className="btn" onClick={()=>go('/welcome?printing=1')}>Open Profile → Printing</button><button className="linkbtn" onClick={()=>go(`/trip/${id}/print${kind==='card'?'':`/${kind}`}?preview=1`)}>Preview PDF</button></>:<>
   <div className="print-destination"><span className="section-eyebrow">PRINT DESTINATION</span><strong>{printer.email}</strong><p className="small dim">{job?.sender.kind==='fo'?'Sent by Fo from its Wajo email. Allow that address in your printer settings if required.':job?.sender.label??'Checking sending connection…'}</p>{job&&<p className="small">{job.document.title} · {job.pageCount} {job.pageCount===1?'page':'pages'}</p>}</div>
   <fieldset disabled={sending.current||job?.status==='submitted'||job?.status==='send_uncertain'}><label>Color<select aria-label="Print color" value={request?.color??'grayscale'} disabled={busy&&!!job} onChange={e=>setRequest({...request,color:e.target.value as 'color'|'grayscale'})}><option value="grayscale">Black & white</option><option value="color">Color</option></select></label>
   <label>Sides<select aria-label="Print sides" value={request?.duplex?'double':'single'} onChange={e=>setRequest({...request,duplex:e.target.value==='double'})}><option value="single">Single-sided</option><option value="double" disabled={printer.autoDuplex!=='yes'}>Double-sided</option></select></label>
   <label>Copies<input placeholder="1" aria-label="Print copies" type="number" min="1" max="10" value={request?.copies??1} onChange={e=>setRequest({...request,copies:Number(e.target.value)})}/></label>
   <label>Paper layout<select aria-label="Print paper" value={request?.size??printer.plainPaper} onChange={e=>setRequest({...request,size:e.target.value as PrintRequest['size']})}><option value="letter" disabled={printer.plainPaper==='a4'}>Letter</option><option value="a4" disabled={printer.plainPaper!=='a4'}>A4</option><option value="4x6">4×6 card on plain paper</option></select></label>
   <p className="small">Paper: {printer.plainPaper==='a4'?'A4':printer.plainPaper==='letter'?'Letter':'check Epson settings'} (printer setting). Copies repeat PDF pages.</p>
   <label>Special instructions<textarea placeholder="Type here…" maxLength={500} value={request?.instructions??''} onChange={e=>setRequest({...request,instructions:e.target.value})}/></label>
   </fieldset>{request?.instructions&&<p className="small">Instructions are saved as job notes. Email printing cannot execute arbitrary printer commands.</p>}
   {(job?.plan??plan)?.lines.filter(line=>line.how==='not_possible').map(line=><p role="alert" key={line.setting}>{line.result}</p>)}{plan?.limitations.map(text=><p className="small" key={text}>{text}</p>)}{plan?.questions.map(q=><p role="alert" key={q.key}>{q.text} Change the setting above before approving.</p>)}
   {job?.blocker&&<p role="alert">{job.blocker} <a href="#/welcome?printing=1">Open Profile → Printing</a></p>}
   {twin&&<p role="status">{uncertain?'An earlier send is still uncertain. Check sent mail and the printer; Tatada will not resend it.':'Previously submitted. Approve & Send authorizes one new copy.'}</p>}
   <button className="linkbtn" disabled={!job||busy} onClick={()=>void showPreview()}>Optional preview</button>
   {preview&&<iframe title="Exact print PDF preview" src={preview} style={{width:'100%',height:260}}/>}
   <button className="btn solid" disabled={busy||!job||!!job.blocker||uncertain||!!plan?.lines.some(line=>line.how==='not_possible'&&line.setting!=='sides')||job.status!=='awaiting_approval'} onClick={()=>void approve()}>{job?.sender.kind==='fo'?'Send with Wajo':'Approve & Send'}</button>
   {job?.sender.kind==='fo'&&job.status==='send_uncertain'&&<a href="https://wajo.ai" target="_blank" rel="noreferrer">Open Wajo to check your request ↗</a>}<p role="status">{busy?'Preparing…':job?.status==='submitted'?'Email submitted. Physical printing is not verified.':job?.status==='send_uncertain'?(job.error??'Delivery is uncertain. Not resent. Check Wajo and your printer.'):job?.status==='blocked'||job?.status==='failed'?job.error:'Nothing is sent until you approve.'}</p>
  </>}{problem&&<p role="alert">{problem}</p>}
 </ConfirmationDialog></div>
}

export function PrintPanel(props:{id:string;doc?:string}){const {info}=useServer();return <SecurityGate>{info.prototype?<div className="screen"><h1>PDF printing</h1><p>Cloud delivery is disabled for this prototype. Download the PDF and print it yourself.</p><button className="btn" onClick={()=>go(`/trip/${props.id}/print${props.doc?`/${props.doc}`:''}?preview=1`)}>Open PDF download</button></div>:<PrintPanelContent {...props}/>}</SecurityGate>}
