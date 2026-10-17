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
import { fromAccessToken, fromFoApi, fromTokenResponse } from './identity.ts'

/*
 * Tatada server.
 *   TATADA_FO_MODE=mock (default) | live
 *   PORT=8787  APP_URL=http://localhost:5173  PUBLIC_URL=http://localhost:8787
 *   FO_RESOURCE=https://mcp.api.wajo.ai/fo
 *   TATADA_LIVE_RECIPIENTS=you@example.com,friend@example.com   (live sends go nowhere else)
 *   TATADA_SECRET=<32+ chars> seals provider tokens at rest
 *   TATADA_DATA_DIR=.data
 */

const env = process.env
const port = Number(env.PORT ?? 8787)
const appUrl = env.APP_URL ?? 'http://localhost:5173'
const publicUrl = env.PUBLIC_URL ?? `http://localhost:${port}`
const mode = env.TATADA_FO_MODE === 'live' ? 'live' : 'mock'
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
if (mode === 'live') {
  const resource = env.FO_RESOURCE ?? 'https://mcp.api.wajo.ai/fo'
  oauth = new FoOAuth({ store, sealer: new Sealer(secret()), resource, redirectUri: `${publicUrl}/api/fo/callback` })
  const mcp = new McpClient(resource)
  fo = new LiveFoAdapter(oauth, mcp, store)
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

const handle = createApp({ store, actions, fo, oauth, resolveIdentity, appUrl, secureCookies: publicUrl.startsWith('https://') })
createServer((req, res) => void handle(req, res)).listen(port, () => {
  console.log(`[tatada] server on ${publicUrl} · Fo ${mode}${mode === 'live' ? ` · live recipients: ${actions.liveAllowlist.join(', ') || 'none (sends blocked)'}` : ''}`)
})

let busy = false
setInterval(async () => {
  if (busy) return
  busy = true
  try {
    await actions.runDue()
  } catch (e) {
    console.error('[tatada] worker', e)
  } finally {
    busy = false
  }
}, 500)
