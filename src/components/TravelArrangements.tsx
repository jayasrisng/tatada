import {TripTimeZone} from './NextStep'
import {ConfirmationImport} from './ConfirmationImport'
import {readOriginal,downloadOriginal,deleteOriginal} from '../travel/originals'
import {useEffect,useState} from 'react'
import type {Booking,Trip} from '../types'
import {useStore,uid} from '../state/store'
import {arrangementDraft,savedArrangement,type ArrangementDraft} from '../travel/arrangements'
import {humanWhen} from '../travel/display'
import {Btn} from './ui'
const TYPES: [Booking['kind'],string][]=[['flight','Flight'],['stay','Stay'],['transfer','Getting around'],['dinner','Meal'],['activity','Activity']]
export function TravelArrangements({trip,kind}:{trip:Trip;kind?:Booking['kind']}) {
 const {dispatch,workspace}=useStore(),[draft,setDraft]=useState<ArrangementDraft|null>(null),[editing,setEditing]=useState<string>(),[error,setError]=useState(''),[saved,setSaved]=useState(false),[removed,setRemoved]=useState<Booking|null>(null)
 const target=new URLSearchParams(location.hash.split('?')[1]).get('booking')
 useEffect(()=>{if(target){const row=document.getElementById(`booking-${target}`);row?.scrollIntoView({block:'center'});row?.focus({preventScroll:true})}},[target,trip.id])
 const records=trip.bookings.filter(b=>!kind||b.kind===kind)
 const begin=(record?:Booking)=>{setDraft({...arrangementDraft(trip.start,trip.end,record),...(!record&&kind?{kind}:{}),...(record?.kind==='stay'&&trip.bookings.find(b=>b.kind==='stay')?.id===record.id?{address:record.address??trip.localAddress??''}:{}),...(record?.kind==='flight'&&trip.bookings.find(b=>b.kind==='flight')?.id===record.id?{arrival:record.arrivesAt??trip.arrival??''}:{})});setEditing(record?.id);setError('');setSaved(false)}
 const field=(key:keyof ArrangementDraft,label:string,type='text',required=false)=>draft&&<label><span className={type==='text'?'sr-only':undefined}>{label}</span><input aria-label={label} placeholder={type==='text'?label:undefined} className="chalk-input" type={type} required={required} maxLength={key==='detail'?2000:160} value={String(draft[key]??'')} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>
 return <section className="arrangement-editor" aria-label="Saved travel details">
  <TripTimeZone trip={trip}/><ConfirmationImport trip={trip}/>{records.map(b=><div className="arrangement-row" id={`booking-${b.id}`} tabIndex={-1} key={b.id}><div><strong>{b.title}</strong><p className="small dim">{humanWhen(b.when)}</p>{kind!=='flight'&&b.detail&&<p>{b.detail}</p>}{b.ref&&<code>{b.ref}</code>}</div><div>{b.originalId&&<><button className="linkbtn" onClick={async()=>{try{const file=await readOriginal(workspace.storageKey,b.originalId!);if(!file)throw new Error('Original is not on this device.');downloadOriginal(file)}catch(e){setError((e as Error).message)}}}>download original</button><button className="linkbtn" onClick={async()=>{try{await deleteOriginal(workspace.storageKey,b.originalId!);dispatch({type:'saveBooking',tripId:trip.id,booking:{...b,originalId:undefined}})}catch(e){setError((e as Error).message)}}}>delete original</button></>}<button className="linkbtn" onClick={()=>begin(b)}>edit</button><button className="linkbtn" aria-label={`Remove ${b.title}`} onClick={()=>{setRemoved(b);dispatch({type:'deleteBooking',tripId:trip.id,id:b.id});if(editing===b.id)setDraft(null)}}>remove</button></div></div>)}
  {removed&&<p role="status">Removed {removed.title}. <button className="linkbtn" onClick={()=>{dispatch({type:'saveBooking',tripId:trip.id,booking:removed});setRemoved(null)}}>undo</button></p>}
  {!draft&&<Btn kind="ghost" icon="plus" onClick={()=>begin()}>add {kind?TYPES.find(([k])=>k===kind)?.[1].toLowerCase():'travel details'}</Btn>}
  {draft&&<form className="details-form arrangement-form" aria-label="Travel detail editor" onSubmit={e=>{e.preventDefault();try{const booking=savedArrangement(draft,editing??uid(),trip.bookings.find(b=>b.id===editing));dispatch({type:'saveBooking',tripId:trip.id,booking});setDraft(null);setSaved(true);setError('')}catch(e){setError((e as Error).message)}}}>
   <p className="small dim">Save your travel details here. Saving does not book or contact anyone.</p>
   <label>Type<select className="chalk-input" value={draft.kind} disabled={!!editing} onChange={e=>setDraft({...draft,kind:e.target.value as Booking['kind']})}>{TYPES.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   {draft.kind==='flight'?<><div className="arrangement-fields">{field('from','From','text',true)}{field('to','To','text',true)}</div>{field('airline','Airline (optional)')}{field('number','Flight number (optional)')}</>:field('title','Name','text',true)}
   <div className="arrangement-fields">{field('date',draft.kind==='stay'?'Check in':'Date','date',true)}{draft.kind==='stay'?field('end','Check out','date',true):field('time','Time (optional)','time')}</div>
   {draft.kind==='flight'&&field('arrival','Arrival (destination local time, optional)','datetime-local')}
   {field('address','Address (optional)')}{draft.kind==='flight'&&<>{field('departureZone','Departure time zone (IANA)')}{field('arrivalZone','Arrival time zone (IANA)')}</>}
   <p className="small dim">Paid total from your confirmation (optional)</p><div className="arrangement-fields">{field('paidAmount','Paid total')}{field('currency','Currency (USD, EUR…)')}</div>
   {field('ref','Confirmation / reference (optional)')}{field('detail','Notes (optional)')}{field('contact','Contact email (optional)','email')}
   <label className="small"><input type="checkbox" checked={draft.sample} onChange={e=>setDraft({...draft,sample:e.target.checked})}/> Example data</label>
   {error&&<p role="alert">{error}</p>}<div className="ac-buttons"><Btn type="submit" kind="solid">save details</Btn><Btn type="button" kind="ghost" onClick={()=>setDraft(null)}>cancel</Btn></div>
  </form>}
  {!draft&&error&&<p role="alert">{error}</p>}{saved&&<p role="status" className="small">Saved to this trip.</p>}
 </section>
}
