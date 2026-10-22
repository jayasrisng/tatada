import {useServer} from '../../state/server'
import {useEffect,useState} from 'react'
import {browserOnly} from '../../config'
import {getPrinter,getSender,removePrinter,savePrinter,type Sender} from '../../print/client'
import type {PrinterProfile} from '../../print/plan'
import {GmailConnection} from '../integrations/GmailConnection'
const empty:PrinterProfile={email:'',senderEmail:'',plainPaper:'letter',colorInk:'unknown',autoDuplex:'unknown',bodyPrintingOff:'unknown',senderApproved:'unknown',printingConsent:false,defaults:{color:'grayscale',duplex:false,copies:1,size:'letter'},updatedAt:0}
export function ProfilePrinting(){
 const {info}=useServer()
 const [profile,setProfile]=useState(empty),[sender,setSender]=useState<Sender>(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(browserOnly)return;let active=true;Promise.all([getPrinter(),info.prototype?Promise.resolve({sender:{kind:'gmail' as const,ok:false,verified:false,label:'Cloud delivery disabled'}}):getSender()]).then(([p,s])=>{if(active){setProfile(p??empty);setSender(s.sender)}},e=>{if(active)setMessage(e.message)});return()=>{active=false}},[info.account?.id,info.prototype])
 const defaults=profile.defaults??empty.defaults!
 const changeDefault=(value:Partial<typeof defaults>)=>setProfile({...profile,defaults:{...defaults,...value}})
 if(browserOnly)return <p>Printing connections require a connected Tatada account. PDF previews remain available.</p>
 return <form className="printer-settings" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{setProfile(await savePrinter({...profile,printingConsent:true}));setMessage(info.prototype?'Printer saved. PDF downloads are ready to use.':'Printing profile saved. Review each document before sending.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
  <p>Add your Epson Connect address once. Your PDFs are always available to download.</p>
  <label>Printer email address<input className="chalk-input" type="email" required value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label>
  <details className="advanced-printer"><summary>Paper &amp; delivery settings</summary>
  {sender?.kind!=='fo'&&<label>Sending email address<input className="chalk-input" type="email" value={profile.senderEmail??''} onChange={e=>setProfile({...profile,senderEmail:e.target.value})}/></label>}
  {!info.prototype&&sender?.kind!=='fo'&&<><GmailConnection preferredEmail={profile.senderEmail}/><p className="small">Authorized sender: {sender?.verified?sender.label:'Connect Gmail to verify the sending address.'}</p></>}
  <label>Default color<select value={defaults.color??'grayscale'} onChange={e=>changeDefault({color:e.target.value as 'color'|'grayscale'})}><option value="grayscale">Black & white</option><option value="color">Color</option></select></label>
  <label>Automatic two-sided printer<select value={profile.autoDuplex} onChange={e=>setProfile({...profile,autoDuplex:e.target.value as PrinterProfile['autoDuplex']})}><option value="unknown">Not sure</option><option value="yes">Supported</option><option value="no">Not supported</option></select></label>
  <label>Default sides<select value={defaults.duplex?'double':'single'} onChange={e=>changeDefault({duplex:e.target.value==='double'})}><option value="single">Single-sided</option><option value="double" disabled={profile.autoDuplex!=='yes'}>Double-sided</option></select></label>
  <label>Plain paper size in Epson settings<select value={profile.plainPaper} onChange={e=>setProfile({...profile,plainPaper:e.target.value as PrinterProfile['plainPaper'],defaults:{...defaults,size:e.target.value as 'letter'|'a4'}})}><option value="letter">Letter</option><option value="a4">A4</option><option value="unknown">Not sure</option></select></label>
  <label>Default copies<input type="number" min="1" max="10" value={defaults.copies??1} onChange={e=>changeDefault({copies:Number(e.target.value)})}/></label>
  <p className="small">Copies repeat pages inside the PDF. Paper size is a printer-wide Epson setting; Tatada cannot change it by email.</p>
  <label><input type="checkbox" checked={profile.bodyPrintingOff==='yes'} onChange={e=>setProfile({...profile,bodyPrintingOff:e.target.checked?'yes':'unknown'})}/>I turned off email body and sender information printing in Epson settings.</label>
  <label><input type="checkbox" checked={profile.senderApproved==='yes'} onChange={e=>setProfile({...profile,senderApproved:e.target.checked?'yes':'unknown'})}/>This sender is allowed by my Epson printer.</label>
  </details>
  <p className="delivery-note">{info.prototype?'Direct delivery is not available on this release. Download your PDF to print.':sender?.kind==='fo'&&sender.ok?'Wajo will handle your approved print request. Your printer may need to allow its sender address.':sender?.verified?'Your sending account is connected. Review each PDF before sending.':'Printer saved settings do not enable delivery. A connected sending service is still required.'}</p>
  <p className="small dim">Saving keeps this printer for future requests. Nothing is sent until you approve a document.</p>
  <button className="btn solid" disabled={busy}>Save printing profile</button>
  <button type="button" className="linkbtn" disabled={busy} onClick={async()=>{setBusy(true);try{await removePrinter();setProfile(empty);setMessage('Printer disconnected. Prepared approvals are invalid.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>Disconnect printer</button>
  {message&&<p role="status">{message}</p>}
 </form>
}
