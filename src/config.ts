/** Sign-in and hosted actions are paused; explicitly opt in for backend rehearsals. */
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
const bindingKey = `tatada:login-binding:${base}`
export const sessionHeaders = (): Record<string, string> => {
  try {
    const token = usesBearer ? sessionStorage.getItem(sessionKey) : null
    return token ? { authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}
export const saveSession = (token?: string) => {
  if (!usesBearer) return
  if (token) sessionStorage.setItem(sessionKey, token)
  else sessionStorage.removeItem(sessionKey)
}
export const loginBinding = () => sessionStorage.getItem(bindingKey) ?? ''
export async function beginSignIn(event?: { preventDefault(): void }) {
  if (!usesBearer) return
  event?.preventDefault()
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
  sessionStorage.setItem(bindingKey, secret)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))), (b) => b.toString(16).padStart(2, '0')).join('')
  window.location.assign(`${apiUrl('/api/auth/wajo/start')}?client_binding=${hash}`)
}
