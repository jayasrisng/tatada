import {useEffect,useState} from 'react'
import {browserOnly} from '../config'
import {getPrinter,getSender,removePrinter,savePrinter,type Sender} from '../print/client'
import type {PrinterProfile} from '../print/plan'
import {GmailConnection} from './GmailConnection'
const empty:PrinterProfile={email:'',senderEmail:'',plainPaper:'letter',colorInk:'unknown',autoDuplex:'unknown',bodyPrintingOff:'unknown',senderApproved:'unknown',printingConsent:false,defaults:{color:'grayscale',duplex:false,copies:1,size:'letter'},updatedAt:0}
export function ProfilePrinting(){
 const [profile,setProfile]=useState(empty),[sender,setSender]=useState<Sender>(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(browserOnly)return;let active=true;Promise.all([getPrinter(),getSender()]).then(([p,s])=>{if(active){setProfile(p??empty);setSender(s.sender)}},e=>{if(active)setMessage(e.message)});return()=>{active=false}},[])
 const defaults=profile.defaults??empty.defaults!
 const changeDefault=(value:Partial<typeof defaults>)=>setProfile({...profile,defaults:{...defaults,...value}})
 if(browserOnly)return <p>Printing connections require a connected Tatada account. PDF previews remain available.</p>
 return <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{setProfile(await savePrinter(profile));setMessage('Printing profile saved. Each job still needs Approve & Send.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
  <p>Save a printer and authorize its sending account once. Every print still needs your approval.</p>
  <label>Sending email address<input className="chalk-input" type="email" required value={profile.senderEmail??''} onChange={e=>setProfile({...profile,senderEmail:e.target.value})}/></label>
  <label>Printer email address<input className="chalk-input" type="email" required value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label>
  <GmailConnection preferredEmail={profile.senderEmail}/><p className="small">Authorized sender: {sender?.verified?sender.label:'Connect Gmail to verify the sending address.'}</p>
  <label>Default color<select value={defaults.color??'grayscale'} onChange={e=>changeDefault({color:e.target.value as 'color'|'grayscale'})}><option value="grayscale">Black & white</option><option value="color">Color</option></select></label>
  <label>Automatic two-sided printer<select value={profile.autoDuplex} onChange={e=>setProfile({...profile,autoDuplex:e.target.value as PrinterProfile['autoDuplex']})}><option value="unknown">Not sure</option><option value="yes">Supported</option><option value="no">Not supported</option></select></label>
  <label>Default sides<select value={defaults.duplex?'double':'single'} onChange={e=>changeDefault({duplex:e.target.value==='double'})}><option value="single">Single-sided</option><option value="double" disabled={profile.autoDuplex!=='yes'}>Double-sided</option></select></label>
  <label>Plain paper size in Epson settings<select value={profile.plainPaper} onChange={e=>setProfile({...profile,plainPaper:e.target.value as PrinterProfile['plainPaper'],defaults:{...defaults,size:e.target.value as 'letter'|'a4'}})}><option value="letter">Letter</option><option value="a4">A4</option><option value="unknown">Not sure</option></select></label>
  <label>Default copies<input type="number" min="1" max="10" value={defaults.copies??1} onChange={e=>changeDefault({copies:Number(e.target.value)})}/></label>
  <p className="small">Copies repeat pages inside the PDF. Paper size is a printer-wide Epson setting; Tatada cannot change it by email.</p>
  <label><input type="checkbox" checked={profile.bodyPrintingOff==='yes'} onChange={e=>setProfile({...profile,bodyPrintingOff:e.target.checked?'yes':'unknown'})}/>I turned off email body and sender information printing in Epson settings.</label>
  <label><input type="checkbox" checked={profile.senderApproved==='yes'} onChange={e=>setProfile({...profile,senderApproved:e.target.checked?'yes':'unknown'})}/>This sender is allowed by my Epson printer.</label>
  <label><input type="checkbox" checked={profile.printingConsent===true} onChange={e=>setProfile({...profile,printingConsent:e.target.checked})}/>Use this connection for future print jobs that I individually approve.</label>
  <button className="btn solid" disabled={busy}>Save printing profile</button>
  <button type="button" className="linkbtn" disabled={busy} onClick={async()=>{setBusy(true);try{await removePrinter();setProfile(empty);setMessage('Printer disconnected. Prepared approvals are invalid.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>Disconnect printer</button>
  {message&&<p role="status">{message}</p>}
 </form>
}
