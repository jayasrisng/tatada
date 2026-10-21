import {useEffect,useState} from 'react'
import {authClient,signOutAuth} from '../state/supabase-auth'
import {api,useServer} from '../state/server'

export function ChangePassword(){
 const {refresh,logout}=useServer()
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('')
 const [factor,setFactor]=useState(''),[code,setCode]=useState(''),[ready,setReady]=useState(false)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{
  let live=true
  void authClient().then(c=>c.auth.mfa.listFactors()).then(({data,error})=>{
   if(error)throw error
   if(live){setFactor(data.totp.find(f=>f.status==='verified')?.id??'');setReady(true)}
  }).catch(()=>{if(live)setMessage('Could not check authenticator enrollment. Refresh and try again, or contact the owner.')})
  return()=>{live=false}
 },[])
 return <main className="screen center"><h1>Change your temporary password</h1>
  <p>Your workspace stays locked until Supabase confirms a password change and you sign in again.</p>
  <form onSubmit={async e=>{
   e.preventDefault();if(busy||!ready)return
   if(password!==confirm||password===current||password.length<12){setMessage('Use a different password of at least 12 characters and confirm it exactly.');return}
   setBusy(true);setMessage('')
   try{
    if(factor){const c=await authClient();const {error}=await c.auth.mfa.challengeAndVerify({factorId:factor,code});if(error)throw Error('Authenticator verification failed. Try a current code.')}
    await api('/api/auth/password',{method:'POST',json:{currentPassword:current,password}})
    setCurrent('');setPassword('');setConfirm('');setCode('')
    await signOutAuth();location.hash='/welcome?password_changed=1';await refresh()
   }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
  }}>
   <label>Current temporary password<input className="chalk-input" type="password" autoComplete="current-password" maxLength={1024} required value={current} onChange={e=>setCurrent(e.target.value)}/></label>
   <label>New password<input className="chalk-input" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label>Confirm new password<input className="chalk-input" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
   {factor&&<label>Authenticator code<input className="chalk-input" autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={e=>setCode(e.target.value)}/></label>}
   <button className="btn btn-solid" disabled={busy||!ready}>Change password</button>
   <button className="linkbtn" type="button" disabled={busy} onClick={()=>void logout().catch(e=>setMessage((e as Error).message))}>Sign out</button>
   {message&&<p role="status">{message}</p>}
  </form>
 </main>
}
