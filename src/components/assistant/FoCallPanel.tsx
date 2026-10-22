import {useEffect,useRef,useState} from 'react'
import {api,useServer} from '../../state/server'
import {Btn} from '../layout/ui'
import {Doodle} from '../layout/Doodle'
import type {VoiceJoin,connectVoice} from '../../voice/session'
type Call=Awaited<ReturnType<typeof connectVoice>>
export function FoVoice(){
 const {info}=useServer(),dialog=useRef<HTMLDialogElement>(null),sink=useRef<HTMLDivElement>(null),session=useRef<Call|null>(null),controller=useRef<AbortController|null>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[active,setActive]=useState(false),[muted,setMuted]=useState(false),[audioBlocked,setAudioBlocked]=useState(false)
 const end=()=>{controller.current?.abort();session.current?.hangUp();session.current=null;setActive(false);setBusy(false);setMuted(false);setMessage('Call ended')}
 useEffect(()=>()=>{controller.current?.abort();session.current?.hangUp()},[])
 async function start(){
  if(busy||active)return
  controller.current?.abort();const current=new AbortController();controller.current=current
  if(!dialog.current?.open)dialog.current?.showModal()
  setBusy(true);setMessage('Connecting to Fo…');setAudioBlocked(false)
  try{
   const [{connectVoice},join]=await Promise.all([import('../../voice/session'),api<VoiceJoin>('/api/fo/voice/join',{method:'POST',signal:current.signal})])
   if(current.signal.aborted)return
   const connected=await connectVoice(join,{sink:sink.current!,signal:current.signal,status:text=>{if(!current.signal.aborted){setMessage(text);if(text==='Call ended'){setActive(false);setMuted(false)}}}})
   if(current.signal.aborted){connected.hangUp();return}
   session.current=connected;setActive(true)
   await connected.enableAudio().catch(()=>setAudioBlocked(true))
  }catch(e){if(!current.signal.aborted)setMessage((e as Error).name==='NotAllowedError'?'Allow microphone access to call Fo.':'Fo could not connect. Check microphone permissions and try again.')}
  finally{if(controller.current===current)setBusy(false)}
 }
 return <div className="fo-voice"><Btn kind="ghost" icon="phone" disabled={busy||!info.foConnected||info.provider!=='live'} onClick={()=>void start()}>call Fo</Btn>
  <dialog ref={dialog} className="fo-call-panel" aria-label="Fo voice call" onCancel={()=>end()} onClose={()=>{if(active||busy)end()}}><button type="button" className="iconbtn fo-call-close" aria-label="Close call" onClick={()=>{end();dialog.current?.close()}}><Doodle name="x" size={22}/></button><Doodle name="sparkle" size={50}/><h2>Fo</h2><p role="status">{message}</p><div ref={sink}/><div className="ac-buttons">{active?<><Btn kind="ghost" disabled={busy} onClick={async()=>{setBusy(true);try{await session.current?.mute(!muted);setMuted(v=>!v)}catch{setMessage('Microphone could not change.')}finally{setBusy(false)}}}>{muted?'unmute':'mute'}</Btn><Btn kind="solid" onClick={end}>end call</Btn></>:<Btn kind="solid" disabled={busy} onClick={()=>void start()}>{busy?'connecting…':'call again'}</Btn>}{audioBlocked&&<Btn onClick={()=>void session.current?.enableAudio().then(()=>setAudioBlocked(false),()=>setMessage('Allow audio playback in your browser.'))}>enable audio</Btn>}</div></dialog>
 </div>
}
