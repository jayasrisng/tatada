import {useServer} from '../../state/server'
import {useEffect,useState} from 'react'
import {browserOnly} from '../../config'
import {getPrinter,removePrinter,savePrinter} from '../../print/client'
import type {PrinterProfile} from '../../print/plan'
const empty:PrinterProfile={email:'',senderEmail:'',plainPaper:'letter',colorInk:'unknown',autoDuplex:'unknown',bodyPrintingOff:'unknown',senderApproved:'unknown',printingConsent:false,defaults:{color:'grayscale',duplex:false,copies:1,size:'letter'},updatedAt:0}
export function ProfilePrinting(){
 const {info}=useServer()
 const [profile,setProfile]=useState(empty),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(browserOnly)return;let active=true;getPrinter().then(p=>{if(active)setProfile(p??empty)},e=>{if(active)setMessage(e.message)});return()=>{active=false}},[info.account?.id])
 const defaults=profile.defaults??empty.defaults!
 const changeDefault=(value:Partial<typeof defaults>)=>setProfile({...profile,defaults:{...defaults,...value}})
 if(browserOnly)return <p>Printing connections require a connected Tatada account. PDF previews remain available.</p>
 return <form className="printer-settings" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{setProfile(await savePrinter({...profile,printingConsent:true}));setMessage('Saved.');window.dispatchEvent(new Event('tatada-printer-saved'))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
  <label className="sr-only" htmlFor="printer-email">Printer email address</label><input id="printer-email" className="chalk-input" type="email" required placeholder="abc@print.epsonconnect.com" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/>
  <details className="advanced-printer"><summary>Default printing settings</summary><div className="printing-options">
  <select aria-label="Default color" value={defaults.color??'grayscale'} onChange={e=>changeDefault({color:e.target.value as 'color'|'grayscale'})}><option value="grayscale">Black & white</option><option value="color">Color</option></select>
  <select aria-label="Default sides" value={defaults.duplex?'double':'single'} onChange={e=>changeDefault({duplex:e.target.value==='double'})}><option value="single">Single-sided</option><option value="double">Double-sided</option></select>
  <select aria-label="Paper size" value={profile.plainPaper} onChange={e=>setProfile({...profile,plainPaper:e.target.value as PrinterProfile['plainPaper'],defaults:{...defaults,size:e.target.value as 'letter'|'a4'}})}><option value="letter">Letter</option><option value="a4">A4</option><option value="unknown">Paper: not sure</option></select>
  <select aria-label="Default copies" value={defaults.copies??1} onChange={e=>changeDefault({copies:Number(e.target.value)})}>{Array.from({length:10},(_,i)=><option key={i} value={i+1}>{i+1} {i===0?'copy':'copies'}</option>)}</select>
  </div></details><div className="ac-buttons"><button className="btn btn-solid" disabled={busy}>Save</button>{profile.updatedAt>0&&<button type="button" className="linkbtn" disabled={busy} onClick={async()=>{try{await removePrinter();setProfile(empty);setMessage('Disconnected.')}catch(e){setMessage((e as Error).message)}}}>Disconnect printer</button>}</div>
  {message&&<p role="status">{message}</p>}
 </form>
}
