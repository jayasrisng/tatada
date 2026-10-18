import { Buffer } from 'node:buffer'
import { pkceChallenge, randomToken, Sealer } from './crypto.ts'
import type { OAuthObservation, Store } from './store.ts'
import type { TokenSet } from './types.ts'

/*
 * MCP OAuth 2.1 client for Tatada's backend: RFC 9728 resource discovery,
 * RFC 8414 server metadata, RFC 7591 dynamic registration (public client),
 * authorization code + PKCE (S256) with a single-use state, and refresh.
 * Tokens are sealed at rest and never leave the server.
 */

export type Fetch = typeof fetch
export type Json = Record<string, any>

interface ServerMeta {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
  code_challenge_methods_supported?: string[]
}

export class OAuthError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const STATE_TTL_MS = 10 * 60 * 1000

export class FoOAuth {
  private meta?: ServerMeta
  private store: Store
  private sealer: Sealer
  private resource: string
  private redirectUri: string
  private fetch: Fetch
  private now: () => number

  constructor(o: { store: Store; sealer: Sealer; resource: string; redirectUri: string; fetch?: Fetch; now?: () => number }) {
    this.store = o.store
    this.sealer = o.sealer
    this.resource = o.resource
    this.redirectUri = o.redirectUri
    this.fetch = o.fetch ?? fetch
    this.now = o.now ?? Date.now
  }

  async discover(): Promise<ServerMeta> {
    if (this.meta) return this.meta
    const r = new URL(this.resource)
    const prm = await this.json(`${r.origin}/.well-known/oauth-protected-resource${r.pathname === '/' ? '' : r.pathname}`)
    if (prm.resource && prm.resource !== this.resource) throw new OAuthError('discovery', `resource mismatch: ${prm.resource}`)
    const issuer = prm.authorization_servers?.[0]
    if (typeof issuer !== 'string') throw new OAuthError('discovery', 'no authorization server advertised')
    const meta = (await this.json(`${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`)) as ServerMeta
    if (meta.issuer !== issuer) throw new OAuthError('discovery', 'issuer mismatch')
    if (!meta.code_challenge_methods_supported?.includes('S256')) throw new OAuthError('discovery', 'server does not support PKCE S256')
    this.meta = meta
    return meta
  }

  /** Registers Tatada once per issuer + redirect URI. */
  async clientId(): Promise<string> {
    const meta = await this.discover()
    const c = this.store.data.oauthClient
    if (c && c.issuer === meta.issuer && c.redirectUri === this.redirectUri) return c.clientId
    if (!meta.registration_endpoint) throw new OAuthError('registration', 'server does not allow dynamic registration')
    const res = await this.fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'Tatada',
        redirect_uris: [this.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp',
      }),
    })
    const body = (await res.json().catch(() => ({}))) as Json
    if (!res.ok || typeof body.client_id !== 'string') {
      throw new OAuthError('registration', `registration rejected (${res.status}): ${body.error_description ?? body.error ?? 'no detail'}`)
    }
    this.store.update((d) => (d.oauthClient = { issuer: meta.issuer, clientId: body.client_id, redirectUri: this.redirectUri, registeredAt: this.now() }))
    return body.client_id
  }

  /**
   * Starts a Wajo login. `binding` is the hash of a nonce held in an HttpOnly
   * cookie in the browser that started it, so a login can't be completed in
   * someone else's browser (login CSRF).
   */
  async start(binding: string): Promise<string> {
    const [meta, clientId] = [await this.discover(), await this.clientId()]
    const state = randomToken(32)
    const verifier = randomToken(48)
    this.store.update((d) => {
      for (const [k, v] of Object.entries(d.pendingAuth)) if (this.now() - v.createdAt > STATE_TTL_MS) delete d.pendingAuth[k]
      d.pendingAuth[state] = { binding, verifier, redirectUri: this.redirectUri, createdAt: this.now() }
    })
    const u = new URL(meta.authorization_endpoint)
    u.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: this.redirectUri,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      scope: 'mcp',
      resource: this.resource,
      state,
    }).toString()
    return u.toString()
  }

  /**
   * Completes a login. The state is consumed whether or not this succeeds.
   * Returns the tokens and the raw token response (for identity resolution);
   * nothing is stored until the caller has an account to store it under.
   */
  async finish(code: string, state: string, binding: string): Promise<{ tokens: TokenSet; body: Json; issuer: string }> {
    const pending = this.store.update((d) => {
      const p = d.pendingAuth[state]
      delete d.pendingAuth[state]
      return p
    })
    if (!pending) throw new OAuthError('state', 'unknown or already used login attempt')
    if (!binding || pending.binding !== binding) throw new OAuthError('state', 'login attempt was started in a different browser')
    if (this.now() - pending.createdAt > STATE_TTL_MS) throw new OAuthError('state', 'login attempt expired')
    const { tokens, body } = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
      client_id: await this.clientId(),
      resource: this.resource,
    })
    return { tokens, body, issuer: (await this.discover()).issuer }
  }

  /** Stores tokens for an account, sealed. */
  saveFor(accountId: string, tokens: TokenSet) {
    this.saveTokens(accountId, tokens)
  }

  connected(userId: string) {
    return !!this.store.data.tokens[userId]
  }

  disconnect(userId: string) {
    this.store.update((d) => delete d.tokens[userId])
  }

  /** A valid access token, refreshed if it's about to expire. */
  async accessToken(userId: string, forceRefresh = false): Promise<string> {
    const t = this.loadTokens(userId)
    if (!t) throw new OAuthError('not_connected', 'Fo is not connected')
    const stale = t.expiresAt !== undefined && t.expiresAt - 60_000 <= this.now()
    if (!forceRefresh && !stale) return t.accessToken
    if (!t.refreshToken) {
      this.disconnect(userId)
      throw new OAuthError('not_connected', 'Fo session expired; reconnect Fo')
    }
    try {
      const { tokens: next } = await this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
        client_id: await this.clientId(),
        resource: this.resource,
      })
      // Some servers rotate refresh tokens; keep the old one if not.
      this.saveTokens(userId, { ...next, refreshToken: next.refreshToken ?? t.refreshToken })
      return next.accessToken
    } catch (e) {
      if (e instanceof OAuthError && e.code === 'token') this.disconnect(userId)
      throw e
    }
  }

  private async tokenRequest(params: Record<string, string>): Promise<{ tokens: TokenSet; body: Json }> {
    const meta = await this.discover()
    const res = await this.fetch(meta.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    })
    const body = (await res.json().catch(() => ({}))) as Json
    this.observe(params, res.status, res.ok, body)
    if (!res.ok || typeof body.access_token !== 'string') {
      throw new OAuthError('token', `token request failed (${res.status}): ${body.error ?? 'no detail'}`)
    }
    if (body.token_type && String(body.token_type).toLowerCase() !== 'bearer') throw new OAuthError('token', 'unexpected token type')
    return {
      body,
      tokens: {
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
        expiresAt: typeof body.expires_in === 'number' ? this.now() + body.expires_in * 1000 : undefined,
        scope: body.scope,
      },
    }
  }

  /** Records the token response's structure (names, types, lifetimes), never token values. */
  private observe(params: Record<string, string>, status: number, ok: boolean, body: Json) {
    const access = typeof body.access_token === 'string' ? body.access_token : ''
    const parts = access.split('.')
    let jwtClaimNames: string[] | undefined
    if (parts.length === 3) {
      try {
        jwtClaimNames = Object.keys(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))).sort()
      } catch {
        /* not a JWT after all */
      }
    }
    const o: OAuthObservation = {
      at: this.now(),
      grant: params.grant_type as OAuthObservation['grant'],
      ok,
      status,
      fields: Object.keys(body).sort(),
      tokenType: typeof body.token_type === 'string' ? body.token_type : undefined,
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : undefined,
      scope: typeof body.scope === 'string' ? body.scope : undefined,
      hasRefreshToken: typeof body.refresh_token === 'string',
      refreshRotated: params.grant_type === 'refresh_token' && typeof body.refresh_token === 'string' ? body.refresh_token !== params.refresh_token : undefined,
      accessTokenFormat: !access ? 'none' : jwtClaimNames ? 'jwt' : 'opaque',
      jwtClaimNames,
      error: typeof body.error === 'string' ? body.error : undefined,
    }
    this.store.update((d) => {
      d.oauthObservations.push(o)
      if (d.oauthObservations.length > 20) d.oauthObservations.splice(0, d.oauthObservations.length - 20)
    })
  }

  observations() {
    return this.store.data.oauthObservations
  }

  /** Forces one refresh and reports the outcome without revealing tokens. */
  async testRefresh(userId: string) {
    const before = this.store.data.oauthObservations.length
    await this.accessToken(userId, true)
    return this.store.data.oauthObservations.slice(before).at(-1)
  }

  private saveTokens(userId: string, t: TokenSet) {
    this.store.update((d) => (d.tokens[userId] = this.sealer.seal(JSON.stringify(t))))
  }

  private loadTokens(userId: string): TokenSet | undefined {
    const sealed = this.store.data.tokens[userId]
    return sealed ? (JSON.parse(this.sealer.open(sealed)) as TokenSet) : undefined
  }

  private async json(url: string): Promise<Json> {
    const res = await this.fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new OAuthError('discovery', `${url} → ${res.status}`)
    return (await res.json()) as Json
  }
}
