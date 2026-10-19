import {AmadeusTravel} from './travel.ts'
import { GmailConnection, GmailPrintDelivery } from './gmail.ts'
import { IntelligenceService } from './intelligence.ts'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Sealer, randomToken } from './crypto.ts'
import { Store } from './store.ts'
import { FoOAuth } from './oauth.ts'
import { McpClient } from './mcp.ts'
import { LiveFoAdapter, MockFoAdapter, type FoAdapter } from './fo.ts'
import { ActionService } from './actions.ts'
import { createApp, type ResolveIdentity } from './app.ts'
import { FoChatService } from './chat.ts'
import { fromAccessToken, fromFoApi, fromTokenResponse } from './identity.ts'
import { loadLocalEnv } from './env.ts'
import { ApiKeyCredentials } from './apikey.ts'
import { OWNER_ID } from './app.ts'
import { MockPrintDelivery, PrintService } from './print.ts'

/*
 * Tatada server.
 *   TATADA_FO_MODE=mock (default) | live
 *   PORT=8787  APP_URL=http://localhost:5173  PUBLIC_URL=http://localhost:8787
 *   FO_RESOURCE=https://mcp.api.wajo.ai/fo
 *   TATADA_LIVE_RECIPIENTS=you@example.com,friend@example.com   (live sends go nowhere else)
 *   TATADA_SECRET=<32+ chars> seals provider tokens at rest
 *   TATADA_DATA_DIR=.data
 *   WAJO_FO_ENDPOINT=https://mcp.api.wajo.ai/fo   (alias of FO_RESOURCE)
 *   WAJO_FO_API_KEY=wak_…   single-owner mode only: Fo acts as the key's Wajo account
 * A local .env is loaded first; variables already set in the shell win.
 */

const configured = loadLocalEnv('.env', ['WAJO_FO_ENDPOINT', 'WAJO_FO_API_KEY', 'TATADA_SECRET'])
const env = process.env
const port = Number(env.PORT ?? 8787)
const appUrl = (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const publicUrl = env.PUBLIC_URL ?? `http://localhost:${port}`
const mode = env.TATADA_FO_MODE === 'live' ? 'live' : 'mock'
/*
 * TATADA_SINGLE_OWNER=1: a localhost-only, single-user server with no sign-in.
 * Fo is authorized once for the owner. Never expose this mode beyond 127.0.0.1.
 */
const singleOwner = env.TATADA_SINGLE_OWNER === '1'
const appOrigin = new URL(appUrl).origin
if (env.NODE_ENV === 'production') {
  if (singleOwner) throw new Error('Single-owner mode cannot run on a public production server')
  if (!env.APP_URL || !env.PUBLIC_URL || !appUrl.startsWith('https://') || !publicUrl.startsWith('https://')) throw new Error('Production requires HTTPS APP_URL and PUBLIC_URL')
  if (!env.TATADA_SECRET || env.TATADA_SECRET.length < 32) throw new Error('Production requires TATADA_SECRET with at least 32 characters')
  if (!env.TATADA_DATA_DIR) throw new Error('Production requires TATADA_DATA_DIR on persistent storage')
}
if (singleOwner && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(appOrigin)) {
  console.error('[tatada] single-owner mode only runs with a localhost APP_URL')
  process.exit(1)
}
const dataDir = resolve(env.TATADA_DATA_DIR ?? '.data')
mkdirSync(dataDir, { recursive: true, mode: 0o700 })

function secret(): string {
  if (env.TATADA_SECRET) return env.TATADA_SECRET
  // Local development: a generated key kept beside the data, readable only by you.
  const file = join(dataDir, 'secret.key')
  if (!existsSync(file)) writeFileSync(file, randomToken(48), { mode: 0o600 })
  console.warn(`[tatada] TATADA_SECRET not set; using ${file}`)
  return readFileSync(file, 'utf8').trim()
}

const store = new Store(join(dataDir, `server-${mode}.json`))
let fo: FoAdapter
let oauth: FoOAuth | undefined
let resolveIdentity: ResolveIdentity | undefined
let foAuth = 'mock'
if (mode === 'live') {
  const resource = env.WAJO_FO_ENDPOINT ?? env.FO_RESOURCE ?? 'https://mcp.api.wajo.ai/fo'
  oauth = new FoOAuth({ store, sealer: new Sealer(secret()), resource, redirectUri: `${publicUrl}/api/fo/callback` })
  const mcp = new McpClient(resource)
  // The API key stands in for one Wajo account, so it only ever serves the local owner.
  const apiKey = singleOwner && env.WAJO_FO_API_KEY ? new ApiKeyCredentials(env.WAJO_FO_API_KEY, OWNER_ID) : undefined
  if (env.WAJO_FO_API_KEY && !singleOwner) console.warn('[tatada] WAJO_FO_API_KEY ignored: a shared key cannot identify individual users; sign-in uses per-user OAuth')
  foAuth = apiKey ? 'api_key' : 'oauth'
  fo = new LiveFoAdapter(apiKey ?? oauth, mcp, store)
  // Verified Wajo identity, from Wajo's own responses only (see identity.ts).
  resolveIdentity = async ({ tokens, body, issuer }) => {
    const direct = fromTokenResponse(body, issuer) ?? fromAccessToken(tokens.accessToken, issuer, Date.now())
    if (direct) return { identity: direct }
    const viaFo = await fromFoApi(new McpClient(resource), tokens.accessToken, issuer)
    return { identity: viaFo.identity, foShape: viaFo.shape }
  }
} else {
  fo = new MockFoAdapter(store)
}

const actions = new ActionService({
  store,
  fo,
  liveRecipients: (env.TATADA_LIVE_RECIPIENTS ?? '').split(','),
  pollWaitSeconds: mode === 'live' ? 20 : 0,
})
actions.recover()

const chats = new FoChatService({ store, fo, pollWaitSeconds: mode === 'live' ? 20 : 0 })
chats.recover()
// Printing uses an independently authorized Gmail sender, not Fo's text-only API.
const gmail = new GmailConnection({store,sealer:new Sealer(secret()),clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,redirectUri:env.GOOGLE_REDIRECT_URI ?? `${appUrl}/api/gmail/callback`})
const print = new PrintService({ store, delivery: mode === 'live' ? new GmailPrintDelivery(gmail) : new MockPrintDelivery(store) })
print.recover()
const travel=env.AMADEUS_CLIENT_ID&&env.AMADEUS_CLIENT_SECRET?new AmadeusTravel({clientId:env.AMADEUS_CLIENT_ID,clientSecret:env.AMADEUS_CLIENT_SECRET,environment:env.AMADEUS_ENV==='production'?'production':'test'}):undefined
const appPort = new URL(appUrl).port
const owner = singleOwner
  ? {
      allowedHosts: [`localhost:${appPort}`, `127.0.0.1:${appPort}`, `localhost:${port}`, `127.0.0.1:${port}`],
      allowedOrigins: [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`],
    }
  : undefined
const intelligenceKey = env.CLAUDE_API_KEY ?? env.ANTHROPIC_API_KEY
const intelligence = intelligenceKey ? new IntelligenceService({ key: intelligenceKey, model: env.CLAUDE_MODEL }) : undefined
const handle = createApp({travel, gmail, intelligence, store, actions, fo, print, oauth: foAuth === 'api_key' ? undefined : oauth, foAuth, resolveIdentity: singleOwner ? undefined : resolveIdentity, chats, owner, appUrl, allowedOrigin: singleOwner ? undefined : appOrigin, secureCookies: publicUrl.startsWith('https://') })
// Single-owner mode listens on the loopback interface only.
createServer((req, res) => void handle(req, res)).listen(port, singleOwner ? '127.0.0.1' : undefined, () => {
  console.log(`[tatada] server on ${publicUrl}${singleOwner ? ' · single-owner, localhost only' : ''} · Fo ${mode}${mode === 'live' ? ` (${foAuth})` : ''} · config set: ${configured.join(', ') || 'none'}${mode === 'live' ? ` · live recipients: ${actions.liveAllowlist.join(', ') || 'none (sends blocked)'}` : ''}`)
})

let busy = false
setInterval(async () => {
  if (busy) return
  busy = true
  try {
    await actions.runDue()
    await chats.runDue()
  } catch {
    console.error('[tatada] worker failed')
  } finally {
    busy = false
  }
}, 500)
