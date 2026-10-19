import {useState} from 'react'
import {useStore} from '../state/store'
import type {Memory} from '../types'
import {isIsoDate} from '../magic/dates'
import {humanDate} from '../travel/display'
import {Doodle} from './Doodle'
import {Btn} from './ui'
export function JournalMoment({memory:m,tripId,index,onDelete}:{memory:Memory;tripId:string;index:number;onDelete:()=>void}) {
 const {dispatch}=useStore(),[editing,setEditing]=useState(false),[text,setText]=useState(m.text),[day,setDay]=useState(m.day),[place,setPlace]=useState(m.place??''),[error,setError]=useState('')
 return <article className={`memory ${m.kind} tint-${m.tint??'yellow'}`} aria-label={`Journal moment ${index+1}`}>
  <header className="journal-entry-date"><time dateTime={m.day}>{humanDate(m.day)}</time>{m.place&&<span>{m.place}</span>}</header>
  {m.illustration&&<figure className="journal-illustration"><img src={`${import.meta.env.BASE_URL}journal/${m.illustration}-v1.jpg`} alt={m.illustration==='sydney-harbour'?'Drawn memory: two stick figures beside Sydney Harbour':'Drawn memory: lunch in Manly'} loading="lazy"/></figure>}
  {m.kind==='photo'&&<div className="memory-pic">{m.image?<img src={m.image} alt={m.text||'Trip moment'} loading="lazy"/>:<Doodle name="camera" size={30}/>}</div>}
  {m.kind==='receipt'&&<Doodle name="receipt" size={18}/>}
  {editing?<form className="moment-edit" aria-label="Edit journal moment" onSubmit={e=>{e.preventDefault();if(!isIsoDate(day))return setError('Choose a valid date.');if(!text.trim()&&!m.image&&!m.illustration)return setError('Add a few words.');dispatch({type:'editMemory',tripId,id:m.id,changes:{text:text.trim(),day,place:place.trim()||undefined}});setEditing(false);setError('')}}>
   <label className="journal-edit-words"><span className="sr-only">Your words</span><textarea placeholder="Write your memory here…" required={!m.image&&!m.illustration} maxLength={5000} value={text} onChange={e=>setText(e.target.value)}/></label>
   <label>Date<input type="date" required value={day} onChange={e=>setDay(e.target.value)}/></label><label><span className="sr-only">Place</span><input placeholder="Add a place…" maxLength={150} value={place} onChange={e=>setPlace(e.target.value)}/></label>
   {error&&<p role="alert">{error}</p>}<div className="ac-buttons"><Btn type="submit">save moment</Btn><Btn type="button" kind="ghost" onClick={()=>setEditing(false)}>cancel</Btn></div>
  </form>:<><p>{m.text}</p><div className="memory-controls"><button className="linkbtn" onClick={()=>{setText(m.text);setDay(m.day);setPlace(m.place??'');setError('');setEditing(true)}}>edit moment</button><button className="linkbtn" onClick={onDelete}>delete moment</button></div></>}
 </article>
}
