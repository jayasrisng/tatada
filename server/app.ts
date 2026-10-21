import type {PrintFiles} from './print-files.ts'
import type {CalendarService} from './calendar.ts'
import {withoutTrip} from '../src/travel/delete.ts'
import type {AppState} from '../src/types.ts'
import type {AmadeusTravel} from './travel.ts'
import {ShareService} from './sharing.ts'
import {validateWorkspace} from '../shared/workspace.ts'
import type { GmailConnection } from './gmail.ts'
import type { IntelligenceService } from './intelligence.ts'
import { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomToken, sha256 } from './crypto.ts'
import { ActionError, type ActionService } from './actions.ts'
import { OAuthError, type FoOAuth, type Json } from './oauth.ts'
import type { Store, Session } from './store.ts'
import type { FoAdapter } from './fo.ts'
import { subjectKey, type WajoIdentity } from './identity.ts'
import type { FoChatService } from './chat.ts'
import { foCapabilities } from './capabilities.ts'
import { PrintError, type PrintService } from './print.ts'
import { isNotConnected } from './fo.ts'
import type { TokenSet } from './types.ts'

/*
 * HTTP API.
 *
 * Accounts: Wajo OAuth authorizes each connection. Verified provider identities
 * find stable accounts; opaque identities get isolated workspaces. A one-use
 * recovery key can restore an existing workspace. Mock mode labels demo accounts.
 *
 * Sessions: random 256-bit id in an HttpOnly, SameSite=Lax cookie; only its
 * hash is stored. 30-day absolute and 14-day idle expiry; rotated on login.
 * Mutations need the X-Tatada header (CSRF). Provider tokens never leave the server.
 */

export type ResolveIdentity = (a: { tokens: TokenSet; body: Json; issuer: string }) => Promise<{ identity: WajoIdentity | null; foShape?: unknown }>

interface Deps {
  printFiles?:PrintFiles
  travel?:AmadeusTravel
  calendar?: CalendarService
  gmail?: GmailConnection
  intelligence?: IntelligenceService
  store: Store
  actions: ActionService
  fo?: FoAdapter
  oauth?: FoOAuth
  resolveIdentity?: ResolveIdentity
  appUrl: string
  secureCookies: boolean
  /** Exact frontend origin for split-host deployments; enables credentialed CORS. */
  allowedOrigin?: string
  /** Cookie-independent session exchange for hosted cross-site APIs. */
  bearerSessions?: boolean
  /** New isolated session workspace when Fo authorizes but exposes no stable account ID. */
  browserAccounts?: boolean
  loginCookiePath?: string
  now?: () => number
  chats?: FoChatService
  /**
   * Single-owner local mode: no sign-in; every request is the one owner.
   * Only safe because the server listens on 127.0.0.1 and every request's
   * Host (and Origin, for writes) must be one of these.
   */
  owner?: { allowedHosts: string[]; allowedOrigins: string[] }
  /** How live Fo is authorized: per-user OAuth, the local owner's API key, or mock. */
  foAuth?: string | (()=>string)
  /** Epson Connect email printing (printer settings and print jobs per account). */
  print?: PrintService
}

export const OWNER_ID = 'owner'

const COOKIE = 'tatada_sid'
const LOGIN_COOKIE = 'tatada_login'
const MAX_BODY = 32 * 1024
const MAX_WORKSPACE = 1024 * 1024
export const SESSION_TTL = 30 * 24 * 3600_000
export const SESSION_IDLE = 14 * 24 * 3600_000

/** Write-lease requests persist counters across edge handler recreation. */
class Limiter {
  private limit: number
  private windowMs: number
  private now: () => number
  private store: Store
  private scope: string
  constructor(limit: number, windowMs: number, now: () => number, store: Store, scope: string) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
    this.store = store
    this.scope = scope
  }
  allow(key: string) {
    const t = this.now()
    const id = sha256(`${this.scope}:${key}`)
    return this.store.update(d => {
      const hits = d.rateLimits ??= {}
      for (const [k,v] of Object.entries(hits)) if(v.reset <= t)delete hits[k]
      const h = hits[id] ??= {n:0,reset:t+this.windowMs}
      return ++h.n <= this.limit
    })
  }
}

export function createApp(deps: Deps) {
  const { store, actions, oauth, appUrl } = deps
  const now = deps.now ?? Date.now
  const shares = new ShareService(store,now)
  const live = actions.provider === 'live'
  const authLimit = new Limiter(10, 10 * 60_000, now, store, 'auth')
  const writeLimit = new Limiter(120, 60_000, now, store, 'write')
  const secure = deps.secureCookies ? '; Secure' : ''
  const loginCookiePath = deps.loginCookiePath ?? '/api/'

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
    res.end(JSON.stringify(body))
  }
  const redirect = (res: ServerResponse, to: string, cookies: string[] = []) => {
    res.writeHead(302, { location: to, 'cache-control': 'no-store', ...(cookies.length ? { 'set-cookie': cookies } : {}) })
    res.end()
  }
  const sessionCookie = (sid: string) => `${COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`
  const clear = (name: string, path = '/') => `${name}=; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=0${secure}`

  const cookie = (req: IncomingMessage, name: string) =>
    (name === COOKIE && deps.bearerSessions && /^Bearer [\w-]{20,100}$/.test(String(req.headers.authorization ?? ''))
      ? `${COOKIE}=${String(req.headers.authorization).slice(7)}` : req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .find(([k]) => k === name)?.[1]

  /** The live session for this request, or undefined. Expired sessions are deleted. */
  const sessionOf = (req: IncomingMessage): { key: string; s: Session } | undefined => {
    const sid = cookie(req, COOKIE)
    if (!sid) return undefined
    const key = sha256(sid)
    const s = store.data.sessions[key]
    if (!s) return undefined
    const t = now()
    // Sessions from before expiry tracking, or past either limit, are over.
    if (!s.expiresAt || s.expiresAt <= t || (s.lastSeenAt ?? s.createdAt) + SESSION_IDLE <= t || !store.data.accounts[s.userId]) {
      store.update((d) => delete d.sessions[key])
      return undefined
    }
    if (t - (s.lastSeenAt ?? 0) > 3600_000) store.update(() => (s.lastSeenAt = t))
    return { key, s }
  }

  const newSession = (userId: string, replaceKey?: string) => {
    const sid = randomToken(32)
    store.update((d) => {
      if (replaceKey) delete d.sessions[replaceKey]
      d.sessions[sha256(sid)] = { userId, createdAt: now(), expiresAt: now() + SESSION_TTL, lastSeenAt: now() }
    })
    return sid
  }

  const readBody = (req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > max) {
          reject(new ActionError(413, 'Request too large'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => {
        if (!chunks.length) return resolve({})
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {})
        } catch {
          reject(new ActionError(400, 'Invalid JSON'))
        }
      })
      req.on('error', reject)
    })

  const status = (userId?: string) => {
    const account = userId ? store.data.accounts[userId] : undefined
    return {
      provider: actions.provider,
      demo: !live,
      authenticated: !!account,
      owner: !!deps.owner,
      account: account ? { id: userId, kind: account.kind, identitySource: account.identitySource, since: account.createdAt } : undefined,
      foConnected: !account ? false : live ? !!(deps.fo?.connected(userId!) ?? oauth?.connected(userId!)) : true,
      foAuth: (typeof deps.foAuth==='function'?deps.foAuth():deps.foAuth) ?? (live ? 'oauth' : 'mock'),
      liveRecipients: live && account ? actions.liveAllowlist : [],
    }
  }

  const ip = (req: IncomingMessage) => req.socket.remoteAddress ?? 'unknown'

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'
    try {
      if (!path.startsWith('/api/')) return send(res, 404, { error: 'Not found' })
      const file=method==='GET'&&path.match(/^\/api\/print\/file\/([\w-]{8,40})$/)
      if(file&&deps.printFiles){const pdf=deps.printFiles.read(file[1],url.searchParams.get('expires'),url.searchParams.get('token'));res.writeHead(200,{'content-type':'application/pdf','content-disposition':'attachment; filename=tatada-print.pdf','content-length':pdf.length,'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});return res.end(pdf)}
      if (deps.allowedOrigin) {
        res.setHeader('vary', 'Origin')
        const origin = req.headers.origin
        if (origin && origin !== deps.allowedOrigin) return send(res, 403, { error: 'Request origin not allowed' })
        if (origin === deps.allowedOrigin) {
          res.setHeader('access-control-allow-origin', origin)
          res.setHeader('access-control-allow-credentials', 'true')
        }
        if (method === 'OPTIONS') {
          if (origin !== deps.allowedOrigin) return send(res, 403, { error: 'Request origin not allowed' })
          const headers = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map((h) => h.trim()).filter(Boolean)
          if (headers.some((h) => !['content-type', 'x-tatada', 'authorization'].includes(h))) return send(res, 403, { error: 'Request headers not allowed' })
          res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
          res.setHeader('access-control-allow-headers', 'Content-Type, X-Tatada, Authorization')
          res.writeHead(204)
          return res.end()
        }
        if (method !== 'GET' && origin !== deps.allowedOrigin) return send(res, 403, { error: 'Request origin not allowed' })
      }
      if (path === '/api/health' && method === 'GET') return send(res, 200, { ok: true, provider: actions.provider })
      if (method !== 'GET' && req.headers['x-tatada'] !== '1') return send(res, 403, { error: 'Missing X-Tatada header' })

      // Owner mode: refuse anything that isn't this machine's own app (blocks LAN access and DNS rebinding).
      if (deps.owner) {
        if (!deps.owner.allowedHosts.includes(String(req.headers.host ?? '').toLowerCase())) return send(res, 403, { error: 'This Tatada server only serves this computer.' })
        const origin = req.headers.origin
        if (method !== 'GET' && (!origin || !deps.owner.allowedOrigins.includes(origin))) return send(res, 403, { error: 'Request origin not allowed' })
        if (!store.data.accounts[OWNER_ID]) store.update((d) => (d.accounts[OWNER_ID] = { kind: 'owner', createdAt: now(), lastLoginAt: now() }))
      }
      if (deps.bearerSessions && path === '/api/auth/exchange' && method === 'POST') {
        const body = await readBody(req)
        const code = typeof body.code === 'string' ? body.code : ''
        const binding = typeof body.binding === 'string' ? sha256(body.binding) : ''
        const entry = store.data.sessionExchanges?.[sha256(code)]
        const failure = !entry ? 'exchange_invalid' : entry.binding !== binding ? 'exchange_browser_mismatch' : entry.usedAt!==undefined ? 'exchange_used' : entry.expiresAt <= now() ? 'exchange_expired' : undefined
        if(failure){console.info('[tatada auth]',failure);return send(res,401,{error:failure==='exchange_browser_mismatch'?'This sign-in belongs to a different browser. Start a new sign-in here.':failure==='exchange_used'?'This sign-in was already used. Start a new sign-in.':'This sign-in expired or is invalid. Start a new sign-in.',code:failure})}
        store.update(() => {entry!.usedAt=now();entry!.expiresAt=Math.min(entry!.expiresAt,now())}) // older servers also reject consumed tombstones
        return send(res, 200, { sessionToken: newSession(entry!.userId) })
      }
      const current = deps.owner ? undefined : sessionOf(req)
      const userId = deps.owner ? OWNER_ID : current?.s.userId

      /* ── session & sign-in ── */

      if (path === '/api/session' && method === 'POST') {
        if (userId) return send(res, 200, status(userId))
        // Demo accounts exist only in mock mode, and say so.
        if (!live) {
          const id = randomToken(12)
          store.update((d) => (d.accounts[id] = { kind: 'demo', createdAt: now(), lastLoginAt: now() }))
          const sid = newSession(id)
          return send(res, 200, { ...status(id), ...(deps.bearerSessions ? { sessionToken: sid } : {}) }, { 'set-cookie': sessionCookie(sid) })
        }
        return send(res, 200, status())
      }

      // Bind hosted reconnect to an already authenticated Tatada workspace, without putting a bearer token in a URL.
      if(path==='/api/auth/wajo/link'&&method==='POST'){
        if(!userId||!store.data.accounts[userId])return send(res,401,{error:'Sign in before reconnecting Wajo.'})
        const body=await readBody(req),binding=body.clientBinding
        if(typeof binding!=='string'||!/^[a-f0-9]{64}$/.test(binding))return send(res,400,{error:'Invalid browser binding.'})
        const ticket=randomToken(32)
        store.update(d=>{const tickets=d.foLoginTickets??={};for(const [key,value]of Object.entries(tickets))if(value.expiresAt<=now())delete tickets[key];tickets[sha256(ticket)]={owner:userId,clientBinding:binding,expiresAt:now()+60000}})
        return send(res,200,{ticket})
      }

      if(path==='/api/auth/recover'&&method==='POST'){
        if(!authLimit.allow(`recovery:${ip(req)}`))return send(res,429,{error:'Too many recovery attempts. Try again later.'})
        const body=await readBody(req),key=typeof body.key==='string'?body.key.trim():''
        const hash=sha256(key),entry=store.data.accountRecovery?.[hash]
        if(!/^tatada-recovery_[\w-]{43}$/.test(key)||!entry||!store.data.accounts[entry.owner]||store.data.accounts[entry.owner].kind==='owner')return send(res,401,{error:'Recovery key invalid or already used.'})
        store.update(d=>{delete d.accountRecovery?.[hash]})
        const sid=newSession(entry.owner,current?.key)
        return send(res,200,{...status(entry.owner),...(deps.bearerSessions?{sessionToken:sid}:{})},{'set-cookie':sessionCookie(sid)})
      }
      if(path==='/api/account/recovery-key'&&method==='POST'){
        if(!userId||!store.data.accounts[userId]||deps.owner)return send(res,401,{error:'Sign in to your hosted Tatada account first.'})
        const key=`tatada-recovery_${randomToken(32)}`
        store.update(d=>{const records=d.accountRecovery??={};for(const [k,v]of Object.entries(records))if(v.owner===userId)delete records[k];records[sha256(key)]={owner:userId,createdAt:now()}})
        return send(res,200,{key,notice:'One-use recovery key. Keep it privately; it grants access to your Tatada workspace. Generating another invalidates this key.'})
      }
      if ((path === '/api/auth/wajo/start' || path === '/api/fo/connect') && method === 'GET') {
        if (!live || !oauth) return redirect(res, `${appUrl}/#/welcome?auth=demo_mode`)
        if (!authLimit.allow(`start:${ip(req)}`)) return redirect(res, `${appUrl}/#/welcome?auth=rate_limited`)
        const clientBinding = url.searchParams.get('client_binding') ?? ''
        const attempt=url.searchParams.get('attempt')??''
        if(attempt&&!/^[a-f0-9]{32}$/.test(attempt))return redirect(res,`${appUrl}/#/welcome?auth=error&reason=browser_binding`)
        if (deps.bearerSessions && !/^[a-f0-9]{64}$/.test(clientBinding)) return redirect(res, `${appUrl}/#/welcome?auth=error&reason=browser_binding`)
        let reconnectAccount=current?.s.userId
        const ticket=url.searchParams.get('reconnect')
        if(ticket){
          const entry=store.data.foLoginTickets?.[sha256(ticket)]
          if(!entry||entry.expiresAt<=now()||entry.clientBinding!==clientBinding)return redirect(res,`${appUrl}/#/welcome?auth=error&reason=reconnect_expired`)
          reconnectAccount=entry.owner;store.update(d=>{delete d.foLoginTickets?.[sha256(ticket)]})
        }
        const nonce = randomToken(24)
        try {
          const to = await oauth.start(sha256(nonce))
          const pendingState=new URL(to).searchParams.get('state')!
          if(reconnectAccount)store.update(d=>{d.pendingAuth[pendingState].accountId=reconnectAccount})
          if (deps.bearerSessions) {
            const state = new URL(to).searchParams.get('state')!
            store.update((d) => {
              const bindings = d.loginBindings ??= {}
              for (const key of Object.keys(bindings)) if (!d.pendingAuth[key]) {delete bindings[key];delete d.loginAttempts?.[key]}
              bindings[state] = clientBinding
              if(attempt)(d.loginAttempts??={})[state]=attempt
            })
          }
          return redirect(res, to, [`${LOGIN_COOKIE}_${sha256(pendingState).slice(0,20)}=${nonce}; HttpOnly; SameSite=Lax; Path=${loginCookiePath}; Max-Age=600${secure}`])
        } catch (e) {
          return redirect(res, `${appUrl}/#/welcome?auth=error&reason=${encodeURIComponent(e instanceof OAuthError ? e.code : 'error')}`)
        }
      }

      if (path === '/api/fo/callback' && method === 'GET') {
        const stateCookie=`${LOGIN_COOKIE}_${sha256(url.searchParams.get('state')??'').slice(0,20)}`
        const activeCookie=cookie(req,stateCookie)?stateCookie:LOGIN_COOKIE // pre-release pending attempts remain valid
        const done = (q: string, cookies: string[] = []) => redirect(res, `${appUrl}/#/${q}`, [clear(activeCookie, loginCookiePath), ...cookies])
        if (!live || !oauth || (!deps.resolveIdentity && !deps.owner)) return done('welcome?auth=demo_mode')
        if (url.searchParams.get('error')) return done(deps.owner ? '?fo=denied' : 'welcome?auth=denied')
        const reconnectAccount=store.data.pendingAuth[url.searchParams.get('state')??'']?.accountId
        let login
        try {
          login = await oauth.finish(url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', sha256(cookie(req, activeCookie) ?? ''))
        } catch (e) {
          return done(`welcome?auth=error&reason=${encodeURIComponent(e instanceof OAuthError ? e.code : 'error')}`)
        }
        // Owner mode: Fo is authorized for the one local owner. No Wajo identity is claimed or needed.
        if (deps.owner) {
          oauth.saveFor(OWNER_ID, login.tokens)
          store.update((d) => {
            ;(d.foKeyDisabled??={})[OWNER_ID]=true
            d.identityObservations.push({ at: now(), source: 'single_owner_local' })
            if (d.identityObservations.length > 20) d.identityObservations.shift()
          })
          return done('?fo=connected')
        }
        if (!deps.resolveIdentity) return done('welcome?auth=demo_mode')
        let resolved: Awaited<ReturnType<ResolveIdentity>>
        try {
          resolved = await deps.resolveIdentity(login)
        } catch {
          resolved = { identity: null }
        }
        store.update((d) => {
          d.identityObservations.push({ at: now(), source: resolved.identity?.source ?? null, field: resolved.identity?.field, foShape: resolved.foShape })
          if (d.identityObservations.length > 20) d.identityObservations.shift()
        })
        // No stable identity never merges workspaces. Hosted pre-demos may create
        // a new isolated connection session after real OAuth consent instead.
        if (!resolved.identity && !deps.browserAccounts) return done('welcome?auth=no_identity')
        const accountId = store.update((d) => {
          if (!resolved.identity) {
            if(reconnectAccount&&d.accounts[reconnectAccount]?.kind==='connected'){d.accounts[reconnectAccount].lastLoginAt=now();return reconnectAccount}
            const id = randomToken(12)
            d.accounts[id] = { kind: 'connected', createdAt: now(), lastLoginAt: now(), identitySource: 'oauth_connection_session' }
            return id
          }
          const key = subjectKey(resolved.identity)
          let id = d.subjects[key]
          if (!id || !d.accounts[id]) {
            id = randomToken(12)
            d.subjects[key] = id
            d.accounts[id] = { kind: 'wajo', subjectKey: key, identitySource: resolved.identity.source, createdAt: now(), lastLoginAt: now() }
          }
          d.accounts[id].lastLoginAt = now()
          return id
        })
        oauth.saveFor(accountId, login.tokens)
        if (deps.bearerSessions) {
          const state = url.searchParams.get('state') ?? ''
          const binding = store.data.loginBindings?.[state]
          const attempt=store.data.loginAttempts?.[state]
          if (!binding) return done('welcome?auth=error&reason=browser_binding')
          const code = randomToken(32)
          store.update((d) => {
            delete d.loginBindings?.[state]
            delete d.loginAttempts?.[state]
            const exchanges = d.sessionExchanges ??= {}
            for (const [key, value] of Object.entries(exchanges)) if (value.expiresAt + 10*60_000 <= now()) delete exchanges[key]
            exchanges[sha256(code)] = { userId: accountId, binding, expiresAt: now() + 60_000 }
          })
          return done(`?auth_exchange=${code}${attempt?`&auth_attempt=${attempt}`:''}`)
        }
        // Rotate: whatever session this browser had is replaced.
        return done('?auth=signed_in', [sessionCookie(newSession(accountId, current?.key))])
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        // Owner mode has no sign-in; "log out" means forgetting the Fo authorization.
        if (deps.owner) {
          store.update((d) => {delete d.tokens[OWNER_ID];(d.foKeyDisabled??={})[OWNER_ID]=true})
          return send(res, 200, status(OWNER_ID))
        }
        if (current) {
          const body = await readBody(req)
          store.update((d) => {
            delete d.sessions[current.key]
            if (body.everywhere === true) for (const [k, s] of Object.entries(d.sessions)) if (s.userId === current.s.userId) delete d.sessions[k]
            // Drop stored Wajo tokens once no session for the account remains.
            if (!Object.values(d.sessions).some((s) => s.userId === current.s.userId)) delete d.tokens[current.s.userId]
          })
        }
        return send(res, 200, status(), { 'set-cookie': clear(COOKIE) })
      }

      const calendarCallback=path==='/api/gmail/callback'&&deps.calendar?.connection.pending(url.searchParams.get('state')??'')
      if(deps.bearerSessions&&calendarCallback&&method==='GET'){try{if(url.searchParams.get('error'))throw new Error('Declined');const staged=deps.calendar!.connection.stage(url.searchParams.get('state')??'',url.searchParams.get('code')??'');return redirect(res,`${appUrl}/#${staged.returnTo}?calendar_exchange=${staged.exchange}`)}catch{return redirect(res,`${appUrl}/#/welcome?calendar=error`)}}
      if(deps.bearerSessions&&path==='/api/gmail/callback'&&method==='GET'){
        try{if(!deps.gmail||url.searchParams.get('error'))throw new Error('Gmail declined');const staged=deps.gmail.stage(url.searchParams.get('state')??'',url.searchParams.get('code')??'');return redirect(res,`${appUrl}/#${staged.returnTo}?gmail_exchange=${staged.exchange}`)}catch{return redirect(res,`${appUrl}/#/welcome?gmail=error`)}
      }
      const publicShare=path.match(/^\/api\/shared\/([\w-]{40,60})$/)
      if(publicShare&&method==='GET')return send(res,200,{trip:shares.view(publicShare[1])},{'referrer-policy':'no-referrer'})

      if (!userId) return send(res, 401, { error: live ? 'Sign in with Wajo' : 'No session' })
      if (method !== 'GET' && !writeLimit.allow(`w:${userId}`)) return send(res, 429, { error: 'Too many requests. Slow down a little.' })

      if(path==='/api/calendar/status'&&method==='GET')return send(res,200,deps.calendar?.connection.status(userId)??{configured:false,connected:false})
      if(path==='/api/calendar/prepare'&&method==='POST'){
        const b=await readBody(req);if(!deps.calendar||typeof b.binding!=='string'||!/^[a-f0-9]{64}$/.test(b.binding))return send(res,400,{error:'Calendar setup or browser binding is missing.'})
        if(!authLimit.allow(`calendar:${userId}`))return send(res,429,{error:'Try connecting Calendar later.'})
        return send(res,200,{url:deps.calendar.connection.begin(userId,b.binding,typeof b.returnTo==='string'?b.returnTo:'/welcome')})
      }
      if(path==='/api/calendar/complete'&&method==='POST'){
        const b=await readBody(req);if(!deps.calendar||typeof b.exchange!=='string'||typeof b.binding!=='string'||b.binding.length>200)return send(res,400,{error:'Calendar browser confirmation missing.'})
        await deps.calendar.connection.complete(userId,b.exchange,sha256(b.binding));return send(res,200,deps.calendar.connection.status(userId))
      }
      if(path==='/api/calendar/connect'&&method==='GET'){
        if(!deps.calendar)return send(res,503,{error:'Google Calendar needs server configuration.'})
        if(!authLimit.allow(`calendar:${userId}`))return send(res,429,{error:'Try connecting Calendar later.'})
        const binding=randomToken();return redirect(res,deps.calendar.connection.begin(userId,sha256(binding),url.searchParams.get('returnTo')??'/welcome'),[`tatada_calendar=${binding}; HttpOnly; SameSite=Lax; Path=${deps.loginCookiePath??'/api/'}; Max-Age=600${secure}`])
      }
      if(calendarCallback&&method==='GET'){
        let destination='/welcome',result='connected';try{if(url.searchParams.get('error'))throw new Error('Declined');destination=await deps.calendar!.connection.finish(userId,url.searchParams.get('state')??'',url.searchParams.get('code')??'',sha256(cookie(req,'tatada_calendar')??''))}catch{result='error'}
        return redirect(res,`${appUrl}/#${destination}?calendar=${result}`,[clear('tatada_calendar',deps.loginCookiePath??'/api/')])
      }
      if(path==='/api/calendar/disconnect'&&method==='POST'){await deps.calendar?.connection.disconnect(userId);return send(res,200,{disconnected:true})}
      if(path==='/api/calendar/preview'&&method==='POST'){const b=await readBody(req);if(!deps.calendar||typeof b.tripId!=='string')return send(res,400,{error:'Choose a saved trip.'});return send(res,200,deps.calendar.preview(userId,b.tripId))}
      if(path==='/api/calendar/add'&&method==='POST'){
        const b=await readBody(req);if(!deps.calendar||b.confirm!=='ADD'||typeof b.tripId!=='string'||typeof b.previewHash!=='string'||!Array.isArray(b.keys)||!b.keys.every(k=>typeof k==='string'))return send(res,400,{error:'Review and confirm the selected trip events.'})
        return send(res,200,await deps.calendar.add(userId,b.tripId,b.previewHash,b.keys as string[]))
      }
      if(path==='/api/gmail/prepare'&&method==='POST'){
        const body=await readBody(req)
        if(!deps.gmail)return send(res,503,{error:'Gmail needs server configuration.'})
        if(typeof body.binding!=='string'||!/^[a-f0-9]{64}$/.test(body.binding))return send(res,400,{error:'Missing browser binding.'})
        if(!authLimit.allow(`gmail:${userId}`))return send(res,429,{error:'Try connecting Gmail again later.'})
        return send(res,200,{url:deps.gmail.begin(userId,body.binding,typeof body.returnTo==='string'?body.returnTo:'/welcome',typeof body.email==='string'?body.email:undefined)})
      }
      if(path==='/api/gmail/complete'&&method==='POST'){
        const body=await readBody(req)
        if(!deps.gmail||typeof body.exchange!=='string'||typeof body.binding!=='string'||body.binding.length>200)return send(res,400,{error:'Missing Gmail browser confirmation.'})
        await deps.gmail.complete(userId,body.exchange,sha256(body.binding))
        return send(res,200,deps.gmail.status(userId))
      }
      if (path === '/api/gmail/status' && method === 'GET') return send(res, 200, deps.gmail?.status(userId) ?? {configured:false,connected:false,reason:'Gmail is not enabled on this server.'})
      if (path === '/api/gmail/connect' && method === 'GET') {
        if (!deps.gmail) return send(res,503,{error:'Gmail is not enabled on this server.'})
        if (!authLimit.allow(`gmail:${userId}`)) return send(res,429,{error:'Too many email connection attempts. Try later.'})
        const binding=randomToken()
        const destination=deps.gmail.begin(userId,sha256(binding),url.searchParams.get('returnTo') ?? '/welcome',url.searchParams.get('email')??undefined)
        return redirect(res,destination,[`tatada_gmail=${binding}; HttpOnly; SameSite=Lax; Path=${deps.loginCookiePath ?? '/api/'}; Max-Age=600${secure}`])
      }
      if (path === '/api/gmail/callback' && method === 'GET') {
        let destination='/welcome', result='error'
        try {
          if (!deps.gmail || url.searchParams.get('error')) throw new Error('Authorization declined')
          destination=await deps.gmail.finish(userId,url.searchParams.get('state') ?? '',url.searchParams.get('code') ?? '',sha256(cookie(req,'tatada_gmail') ?? ''))
          result='connected'
        } catch { /* Never expose authorization codes, tokens or provider errors. */ }
        return redirect(res,`${appUrl}/#${destination}?gmail=${result}`,[clear('tatada_gmail',deps.loginCookiePath ?? '/api/')])
      }
      if (path === '/api/gmail/disconnect' && method === 'POST') {
        if (deps.gmail) await deps.gmail.disconnect(userId)
        return send(res,200,{connected:false})
      }

      if (path === '/api/status' && method === 'GET') return send(res, 200, status(userId))

      /* ── Fo: truthful connection state (read-only tools/list) ── */
      if (path === '/api/fo/status' && method === 'GET') {
        const fo = deps.fo
        if (!fo) return send(res, 200, { state: 'disconnected', provider: actions.provider })
        if (!fo.connected(userId)) return send(res, 200, { state: 'disconnected', provider: fo.mode })
        try {
          const tools = await fo.tools(userId)
          return send(res, 200, { state: 'connected', provider: fo.mode, auth: typeof deps.foAuth==='function'?deps.foAuth():deps.foAuth, tools: tools.map((t) => t.name), capabilities: foCapabilities(tools), checkedAt: now() })
        } catch (e) {
          return send(res, 200, { state: isNotConnected(e) ? 'disconnected' : 'error', provider: fo.mode, error: (e as Error).message.slice(0, 200) })
        }
      }

      if(path==='/api/fo/conversations'&&method==='GET'){
        if(!deps.fo?.connected(userId))return send(res,409,{error:'Connect your Wajo account first.'})
        return send(res,200,{conversations:await deps.fo.conversations(userId)})
      }
      if(path==='/api/fo/conversations/import'&&method==='POST'){
        if(!deps.chats)return send(res,503,{error:'Fo chat is unavailable.'})
        const body=await readBody(req)
        return send(res,200,{chat:await deps.chats.importConversation(userId,body.conversationId,body.tripId)})
      }
      /* ── Fo chat ── */
      if (deps.chats && path === '/api/fo/chats' && method === 'GET') {
        const t = url.searchParams.get('tripId')
        return send(res, 200, { chats: deps.chats.list(userId, t === null ? undefined : t === '' ? null : t) })
      }
      if (deps.chats && path === '/api/fo/chats' && method === 'POST') {
        const body = await readBody(req)
        return send(res, 201, { chat: deps.chats.create(userId, body.tripId ?? undefined) })
      }
      const cm = deps.chats && path.match(/^\/api\/fo\/chats\/([\w-]{8,40})(?:\/(prepare|send|discard|check|sync))?$/)
      if (deps.chats && cm) {
        const [, id, verb] = cm
        if (!verb && method === 'GET') return send(res, 200, { chat: deps.chats.get(userId, id) })
        if (verb && method === 'POST') {
          const body = await readBody(req)
          const chat =
            verb === 'prepare' ? deps.chats.prepare(userId, id, body)
            : verb === 'send' ? deps.chats.send(userId, id, body)
            : verb === 'discard' ? deps.chats.discard(userId, id)
            : verb === 'sync' ? await deps.chats.sync(userId,id)
            : deps.chats.check(userId, id)
          return send(res, 200, { chat })
        }
      }

      if (path === '/api/intelligence' && method === 'POST') {
        if (!deps.intelligence) return send(res, 503, { error: 'Claude research is not configured on this server.' })
        return send(res, 200, await deps.intelligence.research(userId, await readBody(req)))
      }

      if(path==='/api/fo/voice/join'&&method==='POST'){
        if(!deps.fo?.joinVoice||deps.fo.mode!=='live'||!deps.fo.connected(userId))return send(res,409,{error:'Connect Wajo Fo first.'})
        if(!authLimit.allow(`voice:${userId}`))return send(res,429,{error:'Too many call attempts. Try later.'})
        try{return send(res,200,await deps.fo.joinVoice(userId))}catch{return send(res,503,{error:'Fo could not connect. Try a new call.'})}
      }

      if (path === '/api/fo/voice' && method === 'POST') {
        if (!deps.fo?.startVoice || deps.fo.mode !== 'live' || !deps.fo.connected(userId)) return send(res, 409, { error: 'Connect live Wajo Fo first.' })
        try { return send(res, 200, await deps.fo.startVoice(userId)) } catch { return send(res, 503, { error: 'Wajo could not open a voice session. Try live chat instead.' }) }
      }

      if(path==='/api/shares'&&method==='GET')return send(res,200,{links:shares.list(userId,url.searchParams.get('tripId')??undefined)})
      if(path==='/api/shares'&&method==='POST'){
        const body=await readBody(req,MAX_WORKSPACE)
        if(typeof body.tripId!=='string')return send(res,400,{error:'Choose a saved trip.'})
        return send(res,201,shares.create(userId,body.tripId,body.snapshot,body.includeNotes===true))
      }
      const revokeShare=path.match(/^\/api\/shares\/([\w-]{8,40})\/revoke$/)
      if(revokeShare&&method==='POST'){shares.revoke(userId,revokeShare[1]);return send(res,200,{revoked:true})}

      if(path==='/api/trips/delete'&&method==='POST'){
        const body=await readBody(req),cur=store.data.workspaces[userId]
        if(body.confirm!=='DELETE'||typeof body.tripId!=='string'||!Number.isSafeInteger(body.baseVersion))return send(res,400,{error:'Confirm permanent trip deletion.'})
        if(!cur||cur.version!==body.baseVersion)return send(res,409,{error:'Workspace changed. Reload and review before deleting.'})
        if(!validateWorkspace(cur.state))return send(res,409,{error:'Workspace needs recovery before deletion.'})
        const state=cur.state as unknown as AppState
        if(!state.trips.some(t=>t.id===body.tripId))return send(res,404,{error:'Trip not found.'})
        const activeAction=Object.values(store.data.actions).some(a=>a.ownerId===userId&&a.draft.tripId===body.tripId&&['approved','sending','send_uncertain','waiting','answering','verifying'].includes(a.status))
        const activeChat=(deps.chats?.list(userId)??[]).some(c=>c.tripId===body.tripId&&['sending','send_uncertain','working'].includes(c.status))
        const tripPrints=Object.values(store.data.printJobs??{}).filter(v=>{const j=v as {ownerId?:string;document?:{tripId?:string}};return j.ownerId===userId&&j.document?.tripId===body.tripId})
        if(store.data.calendarWrites?.[userId]?.tripId===body.tripId||activeAction||activeChat||tripPrints.some(v=>['sending','send_uncertain'].includes((v as {status:string}).status)))return send(res,409,{error:'Resolve this trip’s active or uncertain provider requests before deleting.'})
        const next={version:cur.version+1,updatedAt:now(),state:withoutTrip(state,body.tripId,Object.values(store.data.actions).filter(a=>a.ownerId===userId&&a.draft.tripId===body.tripId).map(a=>a.id))}
        store.update(d=>{
          d.workspaces[userId]=next
          for(const [key,value] of Object.entries(d.actions))if(value.ownerId===userId&&value.draft.tripId===body.tripId)delete d.actions[key]
          for(const table of [d.foChats,d.shares])if(table)for(const [key,value] of Object.entries(table)){const v=value as {ownerId?:string;owner?:string;tripId?:string};if((v.ownerId===userId||v.owner===userId)&&v.tripId===body.tripId)delete table[key]}
          for(const job of tripPrints)delete d.printJobs![(job as {id:string}).id]
        })
        await store.flush();return send(res,200,next)
      }

      if(path==='/api/account/export'&&method==='GET')return send(res,200,{format:'tatada-account-data',version:1,exportedAt:new Date(now()).toISOString(),workspace:store.data.workspaces[userId]?.state??null,chats:deps.chats?.list(userId)??[],actions:actions.list(userId),shares:shares.list(userId),printer:store.data.printers?.[userId]??null,printJobs:Object.values(store.data.printJobs??{}).filter(value=>(value as {ownerId?:string}).ownerId===userId).map(value=>{const j=value as {id?:string;status?:string;pdf?:string;createdAt?:number;updatedAt?:number};return {id:j.id,status:j.status,pdf:j.pdf,createdAt:j.createdAt,updatedAt:j.updatedAt}})})
      if(path==='/api/account/delete'&&method==='POST'){
        const body=await readBody(req)
        if(body.confirm!=='DELETE')return send(res,400,{error:'Type DELETE to confirm account data deletion.'})
        const activeActions=Object.values(store.data.actions).some(a=>a.ownerId===userId&&['approved','sending','send_uncertain','waiting','answering','verifying'].includes(a.status))
        const activeChats=(deps.chats?.list(userId)??[]).some(c=>['sending','send_uncertain','working'].includes(c.status))
        const activePrint=Object.values(store.data.printJobs??{}).some(value=>{const j=value as {ownerId?:string;status?:string};return j.ownerId===userId&&['sending','send_uncertain'].includes(j.status??'')})
        if(store.data.calendarWrites?.[userId]||activeActions||activeChats||activePrint)return send(res,409,{error:'A provider request is still active or uncertain. Resolve it before deleting so it cannot recreate data or hide an external action.'})
        store.update(d=>{
          for(const table of [d.actions,d.foChats,d.printJobs,d.shares,d.accountRecovery,d.foLoginTickets])if(table)for(const [k,v] of Object.entries(table))if((v as {ownerId?:string;owner?:string}).ownerId===userId||(v as {owner?:string}).owner===userId)delete table[k]
          for(const table of [d.sessions,d.sessionExchanges])if(table)for(const [k,v] of Object.entries(table))if(v.userId===userId)delete table[k]
          for(const table of [d.calendarExchanges,d.calendarPending])if(table)for(const [k,v] of Object.entries(table))if(v.owner===userId)delete table[k]
          if(d.gmailExchanges)for(const [k,v] of Object.entries(d.gmailExchanges))if(v.owner===userId)delete d.gmailExchanges[k]
          if(d.gmailPending)for(const [k,v] of Object.entries(d.gmailPending))if(v.owner===userId)delete d.gmailPending[k]
          for(const [k,v] of Object.entries(d.subjects))if(v===userId)delete d.subjects[k]
          for(const table of [d.workspaces,d.tokens,d.calendarWrites,d.calendarLinks,d.calendarTokens,d.calendarEpochs,d.gmailTokens,d.gmailEpochs,d.printers,d.foTrace,d.users,d.accounts])if(table)delete table[userId]
        })
        await store.flush()
        return send(res,200,{deleted:true,retention:'Active Tatada records and stored authorization removed. Device copies and owner-managed backups require separate removal. Provider histories and already downloaded copies remain outside Tatada.'},{'set-cookie':clear(COOKIE)})
      }

      if(path==='/api/travel/capabilities'&&method==='GET')return send(res,200,deps.travel?.capabilities()??{configured:false,flightStatus:false,inventory:false,booking:false,checkIn:false,loyalty:false})
      if(path==='/api/travel/offers'&&method==='POST'){
        const body=await readBody(req)
        if(!deps.travel)return send(res,503,{error:'Fare inventory is not connected yet. Compare airline and seller sites, or use sourced fare research.'})
        if(typeof body.from!=='string'||typeof body.to!=='string'||typeof body.date!=='string'||typeof body.adults!=='number')return send(res,400,{error:'Choose airports, departure date and traveler count.'})
        return send(res,200,await deps.travel.searchOffers(body.from,body.to,body.date,body.adults))
      }
      if(path==='/api/travel/flight-status'&&method==='POST'){
        const body=await readBody(req)
        if(!deps.travel)return send(res,503,{error:'Live travel data needs a configured provider account. Saved details remain available.'})
        const state=store.data.workspaces[userId]?.state as {trips?:{id:string;bookings:{id:string;flight?:{number:string};at?:string}[]}[]}|undefined
        const booking=state?.trips?.find(t=>t.id===body.tripId)?.bookings.find(b=>b.id===body.bookingId)
        const match=booking?.flight?.number.replace(/\s/g,'').match(/^([A-Z0-9]{2,3}?)(\d{1,4})$/i)
        if(!match||!booking?.at)return send(res,400,{error:'Save the airline code, flight number and departure-local date first.'})
        return send(res,200,await deps.travel.flightStatus(match[1].toUpperCase(),match[2],booking.at.slice(0,10)))
      }

      /* ── per-account workspace ── */

      if (path === '/api/workspace' && method === 'GET') {
        const w = store.data.workspaces[userId]
        return send(res, 200, { version: w?.version ?? 0, updatedAt: w?.updatedAt, state: w?.state ?? null })
      }
      if (path === '/api/workspace' && method === 'PUT') {
        const body = await readBody(req, MAX_WORKSPACE)
        const st = body.state as Record<string, unknown> | undefined
        if (!Number.isSafeInteger(body.baseVersion) || Number(body.baseVersion)<0 || !validateWorkspace(st)) {
          return send(res, 400, { error: 'Invalid workspace' })
        }
        const cur = store.data.workspaces[userId]
        if ((cur?.version ?? 0) !== body.baseVersion) return send(res, 409, { error: 'Workspace changed elsewhere', version: cur?.version ?? 0, state: cur?.state ?? null })
        const next = { version: (cur?.version ?? 0) + 1, updatedAt: now(), state: st }
        store.update((d) => (d.workspaces[userId] = next))
        return send(res, 200, { version: next.version, updatedAt: next.updatedAt })
      }

      /* ── Fo connection checks (read-only) ── */

      if (path === '/api/fo/diagnostics' && method === 'GET') {
        const fo = deps.fo
        if (!fo) return send(res, 409, { error: 'No Fo adapter' })
        if (!fo.connected(userId)) return send(res, 409, { error: 'Reconnect Wajo first.' })
        const out: Record<string, unknown> = { provider: fo.mode, checkedAt: now() }
        try {
          out.tools = await fo.tools(userId)
        } catch (e) {
          out.toolsError = (e as Error).message
        }
        try {
          out.conversations = await fo.probeConversations(userId)
        } catch (e) {
          out.conversationsError = (e as Error).message
        }
        out.identity = store.data.identityObservations.at(-1) ?? null
        return send(res, 200, out)
      }
      if (path === '/api/fo/oauth-observations' && method === 'GET') return send(res, 200, { observations: oauth?.observations() ?? [], identity: store.data.identityObservations })
      if (path === '/api/fo/test-refresh' && method === 'POST') {
        if (!oauth) return send(res, 409, { error: 'Demo mode has no Wajo session.' })
        try {
          return send(res, 200, { observation: await oauth.testRefresh(userId), connected: oauth.connected(userId) })
        } catch (e) {
          return send(res, 409, { error: e instanceof OAuthError ? e.message : 'Refresh failed', connected: oauth.connected(userId) })
        }
      }
      if (path === '/api/fo/trace' && method === 'GET') return send(res, 200, { trace: deps.fo?.trace(userId) ?? [] })

      /* ── actions ── */

      if (path === '/api/actions' && method === 'GET') {
        const ids = url.searchParams.get('ids')?.split(',').filter(Boolean).slice(0, 100)
        return send(res, 200, { actions: actions.list(userId, ids) })
      }
      if (path === '/api/actions' && method === 'POST') return send(res, 201, { action: actions.create(userId, await readBody(req)) })

      const m = path.match(/^\/api\/actions\/([\w-]{8,40})(?:\/(approve|answer|cancel|retry|check))?$/)
      if (m) {
        const [, id, verb] = m
        if (!verb && method === 'GET') return send(res, 200, { action: actions.get(userId, id) })
        if (!verb && method === 'PATCH') return send(res, 200, { action: actions.edit(userId, id, await readBody(req)) })
        if (verb && method === 'POST') {
          const body = await readBody(req)
          const action =
            verb === 'approve' ? actions.approve(userId, id, body)
            : verb === 'answer' ? actions.answer(userId, id, body.text)
            : verb === 'cancel' ? actions.cancel(userId, id)
            : verb === 'retry' ? actions.retry(userId, id)
            : actions.check(userId, id)
          return send(res, 200, { action })
        }
      }
      /* ── printing: everything is scoped to the signed-in account ── */
      const print = deps.print
      if (print && path === '/api/print/printer') {
        if (method === 'GET') return send(res, 200, { printer: print.printer(userId) ?? null, storage: 'account' })
        if (method === 'PUT') return send(res, 200, { printer: print.setPrinter(userId, await readBody(req)) })
        if (method === 'DELETE') { print.removePrinter(userId); return send(res, 200, { printer: null }) }
      }
      if (print && path === '/api/print/sender' && method === 'GET') return send(res, 200, { delivery: print.mode, sender: await print.sender(userId) })
      if (print && path === '/api/print/jobs' && method === 'GET') return send(res, 200, { jobs: print.list(userId) })
      if (print && path === '/api/print/jobs' && method === 'POST') return send(res, 201, { job: await print.prepare(userId, await readBody(req, 6 * 1024 * 1024)) })
      const pj = path.match(/^\/api\/print\/jobs\/([\w-]{6,40})(?:\/(pdf|approve|cancel|check))?$/)
      if (print && pj) {
        const [, id, verb] = pj
        if (!verb && method === 'GET') return send(res, 200, { job: print.get(userId, id) })
        if (verb === 'pdf' && method === 'GET') {
          const bytes = print.pdf(userId, id)
          res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': bytes.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline; filename="tatada-print.pdf"' })
          return void res.end(bytes)
        }
        if (verb && method === 'POST') {
          const body = verb === 'approve' ? await readBody(req) : {}
          const job = verb === 'approve' ? await print.approve(userId, id, body) : verb === 'cancel' ? print.cancel(userId, id) : await print.check(userId, id)
          return send(res, 200, { job })
        }
      }
      return send(res, 404, { error: 'Not found' })
    } catch (e) {
      if (e instanceof ActionError) return send(res, e.status, { error: e.message })
      if (e instanceof PrintError) return send(res, e.status, { error: e.message, code: e.code })
      // Log the class and message only; never request headers (cookies) or bodies.
      console.error('[tatada] request failed')
      return send(res, 500, { error: 'Something went wrong on the Tatada server' })
    }
  }
}
