import {useState} from 'react'
import {authClient,signOutAuth} from '../state/supabase-auth'
export function EmailSignIn(){const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 return <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const client=await authClient();const {error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)throw Error('Sign-in failed. Check your invited account details or contact the prototype owner.');setPassword('');window.dispatchEvent(new Event('tatada-auth-changed'))}catch(e){setMessage((e as Error).message);await signOutAuth().catch(()=>{})}finally{setBusy(false)}}}>
 <p>Private prototype · up to 10 invited testers. Accounts are created by the owner.</p>
 <label>Email<input className="chalk-input" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input className="chalk-input" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button className="btn btn-solid" disabled={busy}>Sign in</button>
 <p className="small">Need an account or a password reset? Contact the prototype owner. Automated email recovery is not available.</p>{message&&<p role="status">{message}</p>}
 </form>
}
