import {useEffect,useState} from 'react'
import {api,useServer} from '../state/server'
import {useRoute} from '../state/ui'
import {BETA_VERSION} from '../../shared/release'

export function InviteActivation({token}:{token:string}){
 const {info}=useServer(),[valid,setValid]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('Checking invitation…')
 useEffect(()=>{let live=true;setValid(false);setMessage('Checking invitation…');void api('/api/beta/invitation',{method:'POST',json:{token}}).then(()=>{if(live){setValid(true);setMessage('')}},()=>{if(live)setMessage('This invitation is expired, revoked, used or unavailable. Ask the owner for a new one.')});return()=>{live=false}},[token])
 return <main className="screen center"><h1>Join Tatada’s private beta</h1><p>This private link grants one account. Keep it private. Your email is a login label; email ownership is not independently verified for this beta.</p>
 {info.authenticated?<p>You are already signed in. Open this invitation in a separate browser profile to create a separate account.</p>:valid&&<form onSubmit={async e=>{e.preventDefault();if(busy)return;if(password!==confirm){setMessage('Passwords must match.');return}setBusy(true);setMessage('');try{await api('/api/beta/activate',{method:'POST',json:{token,email,password}});setPassword('');setConfirm('');history.replaceState(null,'',`${location.pathname}#/welcome?invite_activated=1`);location.reload()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>
 <label>Email login label<input className="chalk-input" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Create password<input className="chalk-input" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label>Confirm password<input className="chalk-input" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
 <p>Use a unique strong password. No confirmation email will be sent. Keep this login label and password in your password manager.</p><button className="btn btn-solid" disabled={busy}>Activate account</button></form>}
 {message&&<p role="status">{message}</p>}<a href="#/welcome">Return to sign in</a></main>
}
export function feedbackPage(route:string[]){const [root,,tab]=route;if(!root)return '/home';if(root==='trip')return `/trip/:id${['itinerary','packing','notebook','journal','print'].includes(tab)?`/${tab}`:''}`;return ['welcome','trips','tasks','closet','journal','policies'].includes(root)?`/${root}`:'/other'}
export function BetaFeedback(){
 const {info}=useServer(),route=useRoute(),[message,setMessage]=useState(''),[category,setCategory]=useState('other'),[critical,setCritical]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('')
 if(!info.beta||!info.authenticated)return null
 return <details className="privacy-card" style={{margin:'1rem'}}><summary>Report a Bug / Send Feedback</summary><p>Describe what went wrong and what you expected. Do not include passwords, tokens, passport details, booking references, private travel information or screenshots.</p>
 <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setStatus('');try{await api('/api/beta/feedback',{method:'POST',json:{message,category,severity:critical?'critical':'normal',page:feedbackPage(route),device:innerWidth<600?'phone':'desktop'}});setMessage('');setStatus('Feedback sent to the owner. Thank you.')}catch(e){setStatus((e as Error).message)}finally{setBusy(false)}}}>
 <label>Problem category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="other">Other</option><option value="account">Sign-in or session</option><option value="saving">Saving work</option><option value="layout">Layout</option><option value="downloads">Downloads</option></select></label>
 <label>Describe the problem<textarea className="chalk-input" minLength={5} maxLength={2000} required value={message} onChange={e=>setMessage(e.target.value)}/></label>
 <label><input type="checkbox" checked={critical} onChange={e=>setCritical(e.target.checked)}/>Critical: data loss, another account’s data, or unable to use the app</label>
 <p className="small">Included: page type {feedbackPage(route)}, version {BETA_VERSION}, phone/desktop and server timestamp. No trip IDs, URLs, account tokens or travel content are attached automatically.</p>
 <button className="btn" disabled={busy}>Send feedback</button>{status&&<p role="status">{status}</p>}</form></details>
}
interface Invitation{id:string;slot:number;state:string;expiresAt:string;userId?:string}
interface Feedback{id:string;slot?:number;createdAt:string;category:string;severity:string;status:string;message:string;page:string;version:string;device:string}
export function BetaOwner(){
 const {info}=useServer(),[data,setData]=useState<{invitations:Invitation[];feedback:Feedback[]}>(),[link,setLink]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const load=()=>api<{invitations:Invitation[];feedback:Feedback[]}>('/api/beta/admin').then(setData)
 useEffect(()=>{let live=true;if(info.betaOwner&&info.beta)void api<{invitations:Invitation[];feedback:Feedback[]}>('/api/beta/admin').then(value=>{if(live)setData(value)},e=>{if(live)setMessage(e.message)});return()=>{live=false}},[info.betaOwner,info.beta])
 if(!info.betaOwner||!info.beta)return null
 async function act(action:string,id?:string,status?:string){setBusy(true);setMessage('');try{const result=await api<{token?:string}>('/api/beta/admin',{method:'POST',json:{action,id,status}});if(result.token)setLink(`${location.origin}${import.meta.env.BASE_URL}#/invite/${result.token}`);await load()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="privacy-card"><h2>Private beta owner</h2><p>Ten tester slots, separate from your owner account. Pending links reserve slots, expire after 24 hours and work once. Revoking a claimed invitation removes access and keeps the workspace data.</p>
 <button className="btn" disabled={busy} onClick={()=>void act('create')}>Generate invitation link</button><button className="linkbtn" disabled={busy} onClick={()=>void load().catch(e=>setMessage(e.message))}>Refresh beta status</button>
 {link&&<div><label>Private invitation link<input className="chalk-input" readOnly value={link}/></label><button className="btn" onClick={()=>void navigator.clipboard.writeText(link).then(()=>setMessage('Copied. Share privately; the link is shown only here.'),()=>setMessage('Copy the link from the field.'))}>Copy invitation link</button><button className="linkbtn" onClick={()=>setLink('')}>Hide link</button></div>}
 <ul>{data?.invitations.map(i=><li key={i.id}>Tester slot {i.slot}: {i.state} · expires {new Date(i.expiresAt).toLocaleString()}{!['revoked','expired'].includes(i.state)&&<button className="linkbtn" disabled={busy} onClick={()=>void act('revoke',i.id)}>Revoke {i.state==='claimed'?'access':'link'}</button>}</li>)}</ul>
 <h3>Tester feedback</h3><p>{data?.feedback.filter(f=>f.status==='open').length??0} open · {data?.feedback.filter(f=>f.status==='open'&&f.severity==='critical').length??0} critical</p>
 {data?.feedback.map(f=><article key={f.id}><strong>{f.severity==='critical'?'Critical · ':''}{f.category} · {f.status}</strong><p>{f.message}</p><p className="small">{f.slot===0?'Owner':`Tester slot ${f.slot??'revoked'}`} · {f.page} · {f.version} · {f.device} · {new Date(f.createdAt).toLocaleString()}</p><button className="linkbtn" disabled={busy} onClick={()=>void act('resolve',f.id,f.status==='open'?'resolved':'open')}>{f.status==='open'?'Mark resolved':'Reopen'}</button></article>)}
 {message&&<p role="status">{message}</p>}</section>
}
