import {loginAttempts} from './state/login'
/** Browser-only builds work offline; backend-enabled builds support Wajo sign-in and connected actions. */
export const browserOnly = import.meta.env.VITE_ENABLE_BACKEND !== 'true'

/** Public API base; local development uses Vite's /api proxy. */
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
if (base) {
  const url = new URL(base)
  if (!['https:', 'http:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) throw new Error('Invalid API base URL')
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Hosted API connections require HTTPS')
}
export const apiUrl = (path: string) => `${base}${path}`
export const hasHostedApi = Boolean(base)
export const usesBearer = base.includes('/functions/v1/') || import.meta.env.VITE_API_TRANSPORT === 'bearer'
const sessionKey = `tatada:session:${base}`
const attempts=loginAttempts(base,()=>sessionStorage,()=>localStorage)
let startingLogin=false
export const sessionHeaders = (): Record<string, string> => {
  try {
    const token = usesBearer ? (sessionStorage.getItem(sessionKey) ?? localStorage.getItem(sessionKey)) : null
    return token ? { authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}
export const saveSession = (token?: string) => {
  if (!usesBearer) return
  // This is Tatada's revocable session, never Wajo or Google access/refresh tokens.
  for(const getStorage of [()=>sessionStorage,()=>localStorage])try{
    const storage=getStorage();if(token)storage.setItem(sessionKey,token);else storage.removeItem(sessionKey)
  }catch{/* The other storage may still keep this session usable. */}
}

export const loginBinding = (attempt?:string) => attempts.binding(attempt)
export const clearLoginAttempt = (attempt?:string) => attempts.remove(attempt)
export async function beginSignIn(event?: { preventDefault(): void }) {
  if (!usesBearer) return
  event?.preventDefault()
  if(startingLogin)return
  startingLogin=true
  try{
  const attempt=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
  attempts.create(attempt,secret)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))), (b) => b.toString(16).padStart(2, '0')).join('')
  let reconnect=''
  if(sessionHeaders().authorization){
    const response=await fetch(apiUrl('/api/auth/wajo/link'),{method:'POST',credentials:'omit',headers:{...sessionHeaders(),'x-tatada':'1','content-type':'application/json'},body:JSON.stringify({clientBinding:hash})})
    if(response.status===401)saveSession()
    else if(!response.ok){startingLogin=false;window.location.hash='/welcome?auth=error&reason=reconnect';return}
    else {const {ticket}=await response.json();reconnect=`&reconnect=${encodeURIComponent(ticket)}`}
  }
  window.location.assign(`${apiUrl('/api/auth/wajo/start')}?client_binding=${hash}&attempt=${attempt}${reconnect}`)
  }catch{startingLogin=false;window.location.hash='/welcome?auth=error&reason=browser_storage'}
}
