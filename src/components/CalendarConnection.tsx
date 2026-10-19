import {useEffect,useState} from 'react'
import {api,useServer} from '../state/server'
import {apiUrl,usesBearer} from '../config'
import {hashQuery} from '../state/ui'
export interface CalendarState{configured:boolean;connected:boolean;email?:string;reason?:string}
const completions=new Map<string,Promise<CalendarState>>()
export function CalendarConnection({returnTo='/welcome',onConnectionChange}:{returnTo?:string;onConnectionChange?:(connected:boolean)=>void}){
 const {info}=useServer(),[status,setStatus]=useState<CalendarState>(),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const account=info.account?.id,bindingKey=`tatada:calendar-binding:${apiUrl('')}`
 useEffect(()=>{let active=true;setStatus(undefined);onConnectionChange?.(false);setError('');if(!info.authenticated)return
  const exchange=hashQuery().get('calendar_exchange')
  let request:Promise<CalendarState>
  if(exchange){const binding=sessionStorage.getItem(bindingKey);if(!binding){setError('Calendar confirmation belongs to another tab. Connect again.');return}const key=`${account}:${exchange}`;request=completions.get(key)!;if(!request){if(completions.size>=30)completions.delete(completions.keys().next().value!);request=api<CalendarState>('/api/calendar/complete',{method:'POST',json:{exchange,binding}});completions.set(key,request)}}else request=api<CalendarState>('/api/calendar/status')
  request.then(s=>{if(active){setStatus(s);onConnectionChange?.(s.connected);if(exchange){sessionStorage.removeItem(bindingKey);const q=hashQuery();q.delete('calendar_exchange');history.replaceState(null,'',`${location.pathname}${location.hash.split('?')[0]}${q.size?'?'+q:''}`)}}},e=>{if(active)setError((e as Error).message)})
  return()=>{active=false}
 },[info.authenticated,account,bindingKey])
 if(!info.authenticated||info.provider==='mock')return <p className="small dim">Google Calendar needs the connected Tatada app. Calendar file downloads still work.</p>
 return <section aria-label="Google Calendar connection"><h3>Google Calendar</h3><p className="small">Add reviewed travel plans to a separate Tatada calendar. Your existing calendars are not read or edited.</p>
 {status?.connected?<><p>Connected: {status.email}</p><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/api/calendar/disconnect',{method:'POST'});setStatus({configured:true,connected:false});onConnectionChange?.(false)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>disconnect Calendar</button><p className="small dim">Disconnect removes Tatada’s local Calendar tokens. Added Google events remain. Manage the Google app grant in Google Account settings; revoking a shared Google grant can also affect Gmail.</p></>:status?.configured?(usesBearer?<button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(bindingKey,secret);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),binding=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');const r=await api<{url:string}>('/api/calendar/prepare',{method:'POST',json:{binding,returnTo}});location.assign(r.url)}catch(e){setError((e as Error).message);setBusy(false)}}}>connect Google Calendar</button>:<a className="btn" href={`${apiUrl('/api/calendar/connect')}?returnTo=${encodeURIComponent(returnTo)}`}>connect Google Calendar</a>):<p className="small dim">{status?'Google OAuth setup required.':'Checking Calendar connection…'}</p>}
 {hashQuery().get('calendar')==='error'&&<p role="alert">Google Calendar did not connect. Check API access and Google consent.</p>}{error&&<p role="alert">{error}</p>}
 </section>
}
