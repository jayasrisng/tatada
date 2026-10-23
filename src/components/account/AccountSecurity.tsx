import {useStore} from '../../state/store'
import {authClient} from '../../state/supabase-auth'
import {useEffect,useState} from 'react'
import {api,useServer} from '../../state/server'
export function AccountSecurity(){const {workspace}=useStore();const {info}=useServer(),[key,setKey]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[email,setEmail]=useState('')
 useEffect(()=>{if(info.authMethod!=='supabase')return;let live=true;void authClient().then(c=>c.auth.getUser()).then(({data})=>{if(live)setEmail(data.user?.email??'')}).catch(()=>{});return()=>{live=false}},[info.authMethod])
 if(info.authMethod!=='supabase'||workspace.kind==='demo'||workspace.kind==='local-demo')return null
 return <section><h2>Account security</h2>{email&&<p>Signed in as {email}</p>}<p>Your saved trips belong to this account. An authenticator protects sensitive changes. Contact the owner if you lose access; knowing an email address alone does not recover an account.</p><details><summary>Link an existing Wajo workspace</summary><p>Use its saved one-use recovery key. Linking preserves its records and does not merge two populated workspaces. The key is consumed once.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api('/api/account/link',{method:'POST',json:{key:key.trim()}});setKey('');location.reload()}catch(e){setMessage((e as Error).message);setBusy(false)}}}><label>Existing workspace recovery key<input placeholder="Enter your passphrase" type="password" className="chalk-input" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label><button className="btn" disabled={busy||!key.trim()}>Link existing workspace</button></form>{message&&<p role="status">{message}</p>}</details></section>
}
