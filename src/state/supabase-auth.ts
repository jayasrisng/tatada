import type {SupabaseClient} from '@supabase/supabase-js'
import {apiUrl} from '../config'
import {setAuthToken} from './auth-token'
let storageKey:string|undefined
let client:SupabaseClient|undefined,pending:Promise<SupabaseClient|undefined>|undefined
export function initializeAuth(){return pending??=(async()=>{
 const response=await fetch(apiUrl('/api/auth/config'),{credentials:'omit',signal:AbortSignal.timeout(15000)})
 if(response.status===404)return undefined
 if(!response.ok)throw Error('Account authentication is unavailable.')
 const config=await response.json() as {mode?:string;url?:string;publicKey?:string}
 if(config.mode!=='supabase')return undefined
 if(!config.url||!config.publicKey)throw Error('Email authentication needs configuration.')
 const {createClient}=await import('@supabase/supabase-js')
 storageKey=`tatada:supabase:${config.url}`
 client=createClient(config.url,config.publicKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey}})
 client.auth.onAuthStateChange((_event,session)=>{setAuthToken(session?.access_token);setTimeout(()=>window.dispatchEvent(new Event('tatada-auth-changed')),0)})
 const {data,error}=await client.auth.getSession();if(error)throw Error('Could not restore the authentication session.');setAuthToken(data.session?.access_token)
 return client
})().catch(error=>{pending=undefined;throw error})}
export async function authClient(){const value=await initializeAuth();if(!value)throw Error('Supabase email authentication is not configured.');return value}
export async function signOutAuth(everywhere=false){if(!client)return;let failed=false;try{const {error}=await client.auth.signOut({scope:everywhere?'global':'local'});failed=!!error}finally{setAuthToken();if(storageKey)try{localStorage.removeItem(storageKey)}catch{/* memory token still cleared */}}if(failed)throw Error('The device session was cleared. Provider revocation needs attention.')}
