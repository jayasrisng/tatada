import {useState} from 'react'
import {api} from '../../state/server'
import {saveSession} from '../../config'
export function AccountRecovery(){
 const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <details className="profile-section"><summary>Restore an existing workspace</summary><p>Use the one-use recovery key saved from your Tatada account. You may need to reconnect Wajo afterward.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const result=await api<{sessionToken?:string}>('/api/auth/recover',{method:'POST',json:{key:key.trim()}});if(result.sessionToken)saveSession(result.sessionToken);location.hash='/';location.reload()}catch(e){setError((e as Error).message);setBusy(false)}}}><label>Recovery key<input className="chalk-input" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} /></label><button className="btn" disabled={busy||!key.trim()}>Restore my workspace</button>{error&&<p role="alert">{error}</p>}</form></details>
}
