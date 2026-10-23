import {useStore} from '../../state/store'
import type {Profile} from '../../types'
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {api,useServer} from '../../state/server'
import {authClient} from '../../state/supabase-auth'
interface SecurityStatus{unlocked:boolean;expiresAt:number;hasTotp:boolean}
export function SecurityGate({children}:{children:ReactNode}){
 const {info,logout}=useServer(),[status,setStatus]=useState<SecurityStatus>(),[message,setMessage]=useState(''),[code,setCode]=useState(''),[qr,setQr]=useState(''),[setupKey,setSetupKey]=useState(''),[factor,setFactor]=useState(''),[busy,setBusy]=useState(false)
 const {state,dispatch,workspace}=useStore();const requires=workspace.kind!=='device'&&info.authMethod==='supabase'&&workspace.kind!=='demo'&&workspace.kind!=='local-demo';const profile=useRef(state.profile);profile.current=state.profile
 const checking=useRef(false)
 const active=useRef(true),locallyLocked=useRef(false),wasUnlocked=useRef(false)
 const refresh=useCallback(async()=>{if(checking.current)return;checking.current=true;try{const s=await api<SecurityStatus>('/api/security/status');if(!active.current)return s;const unlocked=s.unlocked&&!locallyLocked.current
  if(unlocked&&!wasUnlocked.current){const w=await api<{state?:{profile?:Profile}}>('/api/workspace');const p=profile.current;if(w.state?.profile&&!p.name&&!p.homeAirport&&!p.homeBases?.length&&!p.personalNeeds?.length&&!p.style.length&&!p.diet.length&&!p.memberships.length)dispatch({type:'hydrateProfile',profile:w.state.profile})}
  wasUnlocked.current=unlocked;if(active.current)setStatus({...s,unlocked});return s
 }catch{if(active.current){wasUnlocked.current=false;setStatus(undefined);setMessage('Sensitive access is locked. Sign in again if your session expired.')}}finally{checking.current=false}},[dispatch])
 useEffect(()=>{active.current=true;if(!requires)return;void refresh();const timer=setInterval(()=>void refresh(),15000);window.addEventListener('tatada-auth-changed',refresh);return()=>{active.current=false;clearInterval(timer);window.removeEventListener('tatada-auth-changed',refresh)}},[requires,refresh])
 const lock=useCallback(()=>{locallyLocked.current=true;wasUnlocked.current=false;setStatus(s=>s&&{...s,unlocked:false});setQr('');setSetupKey('');setCode('');void api('/api/security/lock',{method:'POST'}).catch(()=>{})},[])
 useEffect(()=>{if(!status?.unlocked)return;const timer=setTimeout(lock,Math.max(0,status.expiresAt-Date.now()));const hidden=()=>{if(document.hidden)lock()};document.addEventListener('visibilitychange',hidden);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',hidden)}},[status?.unlocked,status?.expiresAt,lock])
 if(!requires)return <>{children}</>
 if(status?.unlocked)return <><button className="linkbtn" onClick={lock}>Lock sensitive access</button>{children}</>
 return <section className="privacy-card" aria-label="Account security"><h2>Unlock sensitive access</h2><p>Use an authenticator app. Access locks after five minutes or when this tab is hidden. Your document vault keeps its separate encryption passphrase.</p>
 <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const client=await authClient();let id=factor;if(!id){const {data,error}=await client.auth.mfa.listFactors();if(error)throw Error('Could not load authenticator factors.');id=data.totp.find(f=>f.status==='verified')?.id??'';if(!id){const {data:enrolled,error:enrollError}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:`Tatada ${new Date().toISOString()}`});if(enrollError)throw Error('Could not enroll an authenticator. Check provider configuration.');setFactor(enrolled.id);setQr(enrolled.totp.qr_code);setSetupKey(enrolled.totp.secret);setMessage('Scan this QR code or add the setup key manually in your authenticator, then enter its code.');return}setFactor(id)}if(!code)throw Error('Enter your authenticator code.');const {error}=await client.auth.mfa.challengeAndVerify({factorId:id,code});if(error)throw Error('Authenticator code is invalid or expired.');setQr('');setSetupKey('');setCode('');locallyLocked.current=false;const verified=await refresh();if(!verified?.unlocked){locallyLocked.current=true;throw Error('Access remains locked. Wait a moment and verify again.')} }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
 {qr&&<img src={qr.startsWith('data:image/svg+xml;')?qr:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="Authenticator enrollment QR code"/>}
 {setupKey&&<details><summary>Set up without scanning</summary><p>In your authenticator, add a time-based account with this setup key. Keep it private; it is shown only during this enrollment.</p><code aria-label="Authenticator setup key">{setupKey}</code></details>}
 <label>Authenticator code<input placeholder="Type here…" className="chalk-input" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label>
 <button className="btn btn-solid" disabled={busy}>{status?.hasTotp||factor?'Verify authenticator':'Set up authenticator'}</button>{message&&<p role="status">{message}</p>}
 </form><div className="ac-buttons"><button className="linkbtn" type="button" onClick={()=>void logout(false).catch(e=>setMessage((e as Error).message))}>Sign out</button><button className="linkbtn" type="button" onClick={()=>void logout(true).catch(e=>setMessage((e as Error).message))}>Sign out everywhere</button></div></section>
}
