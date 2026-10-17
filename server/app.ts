import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomToken, sha256 } from './crypto.ts'
import { ActionError, type ActionService } from './actions.ts'
import { OAuthError, type FoOAuth } from './oauth.ts'
import type { Store } from './store.ts'
import type { FoAdapter } from './fo.ts'

/*
 * HTTP API. Every /api route except /api/session and the OAuth callback needs
 * a session cookie (HttpOnly, SameSite=Lax). State-changing requests also need
 * the X-Tatada header, which a cross-site form or image can't send.
 * Provider tokens never appear in any response.
 */

interface Deps {
  store: Store
  fo?: FoAdapter
  actions: ActionService
  oauth?: FoOAuth
  appUrl: string
  secureCookies: boolean
}

const COOKIE = 'tatada_sid'
const MAX_BODY = 32 * 1024

export function createApp(deps: Deps) {
  const { store, actions, oauth, appUrl } = deps

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
    res.end(JSON.stringify(body))
  }
  const redirect = (res: ServerResponse, to: string) => {
    res.writeHead(302, { location: to, 'cache-control': 'no-store' })
    res.end()
  }

  const cookieOf = (req: IncomingMessage) =>
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .find(([k]) => k === COOKIE)?.[1]

  const userOf = (req: IncomingMessage): string | undefined => {
    const sid = cookieOf(req)
    return sid ? store.data.sessions[sha256(sid)]?.userId : undefined
  }

  const readJson = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) {
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

  const status = (userId: string) => ({
    provider: actions.provider,
    foConnected: actions.provider === 'mock' ? true : !!oauth?.connected(userId),
    liveRecipients: actions.provider === 'live' ? actions.liveAllowlist : [],
  })

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'
    try {
      if (!path.startsWith('/api/')) return send(res, 404, { error: 'Not found' })

      // Mutations need the custom header (CSRF defence alongside SameSite).
      if (method !== 'GET' && req.headers['x-tatada'] !== '1') return send(res, 403, { error: 'Missing X-Tatada header' })

      if (path === '/api/session' && method === 'POST') {
        const existing = userOf(req)
        if (existing) return send(res, 200, { ok: true, ...status(existing) })
        const userId = randomToken(12)
        const sid = randomToken(32)
        store.update((d) => {
          d.users[userId] = { createdAt: Date.now() }
          d.sessions[sha256(sid)] = { userId, createdAt: Date.now() }
        })
        const cookie = `${COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${deps.secureCookies ? '; Secure' : ''}`
        return send(res, 200, { ok: true, ...status(userId) }, { 'set-cookie': cookie })
      }

      const userId = userOf(req)
      if (path === '/api/fo/callback' && method === 'GET') {
        if (!oauth) return redirect(res, `${appUrl}/#/welcome?fo=unavailable`)
        if (!userId) return redirect(res, `${appUrl}/#/welcome?fo=error&reason=session`)
        const err = url.searchParams.get('error')
        if (err) return redirect(res, `${appUrl}/#/welcome?fo=denied`)
        try {
          await oauth.finish(userId, url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '')
          return redirect(res, `${appUrl}/#/welcome?fo=connected`)
        } catch (e) {
          const reason = e instanceof OAuthError ? e.code : 'error'
          return redirect(res, `${appUrl}/#/welcome?fo=error&reason=${encodeURIComponent(reason)}`)
        }
      }

      if (!userId) return send(res, 401, { error: 'No session' })

      if (path === '/api/status' && method === 'GET') return send(res, 200, status(userId))

      if (path === '/api/fo/connect' && method === 'GET') {
        if (!oauth) return send(res, 409, { error: 'Fo is in mock mode. Start the server with TATADA_FO_MODE=live to connect.' })
        try {
          return redirect(res, await oauth.start(userId))
        } catch (e) {
          const reason = e instanceof OAuthError ? e.code : 'error'
          return redirect(res, `${appUrl}/#/welcome?fo=error&reason=${encodeURIComponent(reason)}`)
        }
      }
      // Read-only checks of the real connection: tools/list and the conversation list's shape.
      if (path === '/api/fo/diagnostics' && method === 'GET') {
        const fo = deps.fo
        if (!fo) return send(res, 409, { error: 'No Fo adapter' })
        if (!fo.connected(userId)) return send(res, 409, { error: 'Connect Fo first.' })
        const out: Record<string, unknown> = { provider: fo.mode, checkedAt: Date.now() }
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
        return send(res, 200, out)
      }
      if (path === '/api/fo/trace' && method === 'GET') return send(res, 200, { trace: deps.fo?.trace(userId) ?? [] })

      if (path === '/api/fo/disconnect' && method === 'POST') {
        oauth?.disconnect(userId)
        return send(res, 200, status(userId))
      }

      if (path === '/api/actions' && method === 'GET') {
        const ids = url.searchParams.get('ids')?.split(',').filter(Boolean).slice(0, 100)
        return send(res, 200, { actions: actions.list(userId, ids) })
      }
      if (path === '/api/actions' && method === 'POST') return send(res, 201, { action: actions.create(userId, await readJson(req)) })

      const m = path.match(/^\/api\/actions\/([\w-]{8,40})(?:\/(approve|answer|cancel|retry|check))?$/)
      if (m) {
        const [, id, verb] = m
        if (!verb && method === 'GET') return send(res, 200, { action: actions.get(userId, id) })
        if (!verb && method === 'PATCH') return send(res, 200, { action: actions.edit(userId, id, await readJson(req)) })
        if (verb && method === 'POST') {
          const body = await readJson(req)
          const action =
            verb === 'approve' ? actions.approve(userId, id, body)
            : verb === 'answer' ? actions.answer(userId, id, body.text)
            : verb === 'cancel' ? actions.cancel(userId, id)
            : verb === 'retry' ? actions.retry(userId, id)
            : actions.check(userId, id)
          return send(res, 200, { action })
        }
      }
      return send(res, 404, { error: 'Not found' })
    } catch (e) {
      if (e instanceof ActionError) return send(res, e.status, { error: e.message })
      console.error('[tatada]', e)
      return send(res, 500, { error: 'Something went wrong on the Tatada server' })
    }
  }
}
