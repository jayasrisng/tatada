import {useState} from 'react'
import {authClient} from '../state/supabase-auth'
export function EmailSignIn(){const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 return <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const client=await authClient();if(!sent){const {error}=await client.auth.signInWithOtp({email:email.trim()});if(error)throw Error('Could not send a sign-in code. Check the address or try later.');setSent(true);setMessage('Check your email for the one-time code.')}else{const {error}=await client.auth.verifyOtp({email:email.trim(),token:code.trim(),type:'email'});if(error)throw Error('The code is invalid or expired. Request a new code.');setCode('');window.dispatchEvent(new Event('tatada-auth-changed'))}}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
 <label>Email<input className="chalk-input" type="email" autoComplete="email" required value={email} disabled={sent} onChange={e=>setEmail(e.target.value)}/></label>
 {sent&&<label>One-time code<input className="chalk-input" inputMode="numeric" autoComplete="one-time-code" required maxLength={12} value={code} onChange={e=>setCode(e.target.value)}/></label>}
 <button className="btn btn-solid" disabled={busy}>{sent?'Verify & sign in':'Email me a code'}</button>{sent&&<button className="linkbtn" type="button" disabled={busy} onClick={()=>{setSent(false);setCode('')}}>Use another address or request a new code</button>}
 <p className="small">Your verified email opens the same Tatada workspace on each device. Wajo is an optional connection.</p>{message&&<p role="status">{message}</p>}
 </form>
}
