import {PrintFiles} from './print-files.ts'
import {WajoPrintDelivery} from './fo-print.ts'
import {CalendarConnection,CalendarService} from './calendar.ts'
import {IntelligenceService} from './intelligence.ts'
import {GmailConnection} from './gmail.ts'
import {AmadeusTravel} from './travel.ts'
import { createApp } from './app.ts'
import { Store, type Data } from './store.ts'
import { ActionService } from './actions.ts'
import { FoChatService } from './chat.ts'
import { FoOAuth } from './oauth.ts'
import { Sealer } from './crypto.ts'
import { McpClient } from './mcp.ts'
import { LiveFoAdapter, MockFoAdapter, type FoAdapter } from './fo.ts'
import { fromAccessToken, fromFoApi, fromTokenResponse } from './identity.ts'
import { webRequest } from './web.ts'
import { MockPrintDelivery, PrintService } from './print.ts'

export interface EdgeRepository {
  read(): Promise<Partial<Data>>
  acquire(token: string): Promise<{ busy?: boolean; state?: Partial<Data>; recovered?: boolean }>
  save(token: string, state: Data): Promise<void>
  release(token: string): Promise<void>
}
export interface EdgeOptions {
  repository: EdgeRepository
  appUrl: string
  publicUrl: string
  secret: string
  resource?: string
  liveRecipients?: string[]
  mode?: 'live' | 'mock'
  research?: {key:string;model?:string}
  gmail?: {clientId:string;clientSecret:string;redirectUri?:string}
  travel?: {clientId:string;clientSecret:string;environment:'test'|'production'}
  waitUntil?: (promise: Promise<unknown>) => void
  /** Only retry lease acquisition, before executing any handler or side effect. */
  leaseWaitMs?: number
}

/** One database lease coordinates writes and side effects across edge instances.
 * Reads use a committed snapshot. Each background invocation advances bounded
 * work; open clients keep polling, and interrupted sends are reconciled.
 */
export function createEdgeHandler(options: EdgeOptions) {
  const { repository } = options
  const appUrl = options.appUrl.replace(/\/$/, '')
  const origin = new URL(appUrl).origin
  const publicUrl = options.publicUrl.replace(/\/$/, '')
  const prefix = new URL(publicUrl).pathname
  const resource = options.resource ?? 'https://mcp.api.wajo.ai/fo'
  const acquire = async (token: string, signal: AbortSignal) => {
    const deadline = Date.now() + (options.leaseWaitMs ?? 2000)
    let lease = await repository.acquire(token)
    while (lease.busy && !signal.aborted && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(25 + Math.random() * 50, deadline - Date.now())))
      if (signal.aborted) break
      lease = await repository.acquire(token)
    }
    return lease
  }
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type, X-Tatada, Authorization', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', vary: 'Origin' }
  const error = (text: string, status = 503) => Response.json({ error: text }, { status, headers: { ...cors, 'cache-control': 'no-store', 'retry-after': '2' } })
  const intelligence=options.research?new IntelligenceService(options.research):undefined
  const travel=options.travel?new AmadeusTravel(options.travel):undefined
  const configure = (store: Store) => {
    const mcp = new McpClient(resource, { timeoutMs: 15000 })
    const oauth = new FoOAuth({ store, sealer: new Sealer(options.secret), resource, redirectUri: `${publicUrl}/api/fo/callback`, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) })
    const inner: FoAdapter = options.mode === 'mock' ? new MockFoAdapter(store) : new LiveFoAdapter(oauth, mcp, store)
    // Flush the saved sending/answering record before any provider side effect.
    const fo = new Proxy(inner, {
      get(target, property) {
        const value = Reflect.get(target, property)
        if (typeof value !== 'function') return value
        return property === 'ask' ? async (...args: unknown[]) => { await store.flush(); return value.apply(target, args) } : value.bind(target)
      },
    }) as FoAdapter
    const actions = new ActionService({ store, fo, pollWaitSeconds: 1, liveRecipients: options.liveRecipients })
    const chats = new FoChatService({ store, fo, pollWaitSeconds: 1 })
    const gmail=options.gmail?new GmailConnection({store,sealer:new Sealer(options.secret),...options.gmail,redirectUri:options.gmail.redirectUri??`${publicUrl}/api/gmail/callback`}):undefined
    const calendar=options.gmail?new CalendarService(store,new CalendarConnection({store,sealer:new Sealer(options.secret),...options.gmail,redirectUri:options.gmail.redirectUri??`${publicUrl}/api/gmail/callback`})):undefined
    const printFiles=new PrintFiles(store,options.secret,publicUrl)
    const print = new PrintService({ store, delivery: options.mode === 'mock' ? new MockPrintDelivery(store) : new WajoPrintDelivery({store,fo,chats,files:printFiles}) })
    const handle = createApp({ printFiles,store, fo, actions, chats, print, calendar, gmail, intelligence, travel, oauth: options.mode === 'mock' ? undefined : oauth, appUrl, secureCookies: true, allowedOrigin: origin, bearerSessions: true, browserAccounts: true, loginCookiePath: `${prefix}/`,
      resolveIdentity: async ({ body, tokens, issuer }) => {
        const identity = fromTokenResponse(body, issuer) ?? fromAccessToken(tokens.accessToken, issuer, Date.now())
        return identity ? { identity } : fromFoApi(mcp, tokens.accessToken, issuer)
      },
    })
    return { handle, actions, chats, print }
  }
  const worker = async () => {
    const token = crypto.randomUUID()
    const lease = await repository.acquire(token)
    if (lease.busy) return
    const store = new Store(undefined, (state) => repository.save(token, state))
    store.data = { ...store.data, ...lease.state }
    const { actions, chats, print } = configure(store)
    let committed = false
    try {
      if (lease.recovered) { actions.recover(); chats.recover(); print.recover() }
      await actions.runDue(1)
      await chats.runDue(1)
      await print.runDue(1)
      await store.flush()
      committed = true
    } finally {
      // A failed flush must leave the lease abandoned, so the next worker reconciles.
      if (committed) await repository.release(token)
    }
  }
  const kick = () => {
    const task = worker().catch(() => console.error('[tatada worker] background work failed; retry after lease recovery'))
    if (options.waitUntil) options.waitUntil(task)
    else void task
  }
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const shortPrefix = `/${prefix.split('/').pop()}`
    const path = url.pathname.startsWith(prefix + '/') ? url.pathname.slice(prefix.length) : url.pathname.startsWith(shortPrefix + '/') ? url.pathname.slice(shortPrefix.length) : url.pathname
    const from = request.headers.get('origin')
    if (from && from !== origin) return new Response('Origin not allowed', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'GET' && from !== origin) return error('Request origin not allowed', 403)
    if (path === '/api/health') return Response.json({ ok: true, provider: options.mode ?? 'live', storage: 'supabase' }, { headers: cors })
    // These routes only expose an authenticated committed snapshot; no provider I/O.
    // Anonymous live startup only reads status. Authenticated requests may refresh
    // session expiry tracking; mock mode creates accounts. Both retain the lease.
    const sessionSnapshot = options.mode !== 'mock' && path === '/api/session' && request.method === 'POST'
      && !request.headers.has('authorization') && !request.headers.has('cookie')
    const snapshot = sessionSnapshot || (path==='/api/intelligence'&&request.method==='POST') || request.method === 'GET' && (/^\/api\/(print\/(?:file\/[\w-]+|jobs(?:\/[\w-]+(?:\/pdf)?)?)|status|workspace|actions(?:\/[\w-]+)?|fo\/chats(?:\/[\w-]+)?)$/.test(path))
    let token: string | undefined
    let committed = false
    try {
      let data: Partial<Data>
      let recovered = false
      if (snapshot) data = await repository.read()
      else {
        token = crypto.randomUUID()
        const lease = await acquire(token, request.signal)
        if (lease.busy) return error('A request is in progress. Please try again in a moment.')
        data = lease.state ?? {}
        recovered = !!lease.recovered
      }
      const store = new Store(undefined, token ? (state) => repository.save(token!, state) : undefined)
      store.data = { ...store.data, ...data }
      const api = configure(store)
      if (recovered) { api.actions.recover(); api.chats.recover(); api.print.recover() }
      const response = await webRequest(request, `${path}${url.search}`, api.handle)
      await store.flush()
      committed = true
      if (token) { await repository.release(token); token = undefined }
      const pending=Object.values(store.data.actions).some(a=>['approved','sending','send_uncertain','waiting','answering','verifying'].includes(a.status))||Object.values(store.data.foChats??{}).some(value=>['sending','send_uncertain','working'].includes((value as {status:string}).status))||Object.values(store.data.printJobs??{}).some(value=>{const j=value as {sender?:{kind:string};status:string;createdAt:number};return j.sender?.kind==='fo'&&j.status==='send_uncertain'&&Date.now()-j.createdAt<30*60_000})
      if ((snapshot || response.ok)&&pending) kick()
      return response
    } catch {
      console.error('[tatada edge] request failed')
      return error('Tatada could not complete this request. Try again in a moment.')
    } finally {
      if (token && committed) await repository.release(token)
    }
  }
}
