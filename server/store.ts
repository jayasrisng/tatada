import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ServerAction } from './types.ts'

/*
 * Durable server state in one JSON file, written atomically (temp + rename)
 * after every change. Good enough for a single-process demo server; swap for
 * a database before running more than one instance.
 */

export interface PendingAuth {
  /** sha256 of the login nonce cookie in the browser that started this login. */
  binding: string
  verifier: string
  redirectUri: string
  createdAt: number
}

export interface Account {
  /** 'owner': the single local owner of a localhost-only server (no Wajo identity). */
  kind: 'wajo' | 'demo' | 'owner' | 'connected'
  subjectKey?: string
  identitySource?: string
  createdAt: number
  lastLoginAt: number
}

export interface Session {
  userId: string
  createdAt: number
  expiresAt?: number
  lastSeenAt?: number
}

export interface Data {
  calendarWrites?: Record<string,{tripId:string;state:'running'|'uncertain'}>
  calendarLinks?: Record<string,{subject:string;state:'creating'|'ready'|'uncertain';id?:string}>
  calendarExchanges?: Record<string,{owner:string;stateHash:string;payload:string;expiresAt:number}>
  calendarEpochs?: Record<string,number>
  calendarTokens?: Record<string,string>
  calendarPending?: Record<string,{owner:string;binding:string;verifier:string;createdAt:number;returnTo:string;epoch:number}>

  shares?: Record<string,import('./sharing.ts').ShareLink>
  gmailExchanges?: Record<string,{owner:string;stateHash:string;payload:string;expiresAt:number}>
  gmailEpochs?: Record<string, number>
  gmailTokens?: Record<string, string>
  gmailPending?: Record<string, {owner: string; binding: string; verifier: string; createdAt: number; returnTo: string; epoch: number}>
  users: Record<string, { createdAt: number }>
  /**
   * Tatada accounts. 'wajo' accounts exist only for a verified Wajo identity;
   * 'demo' accounts exist only in mock mode.
   */
  accounts: Record<string, Account>
  /** sha256(issuer|subject) → account id. */
  subjects: Record<string, string>
  /** account id → that account's app data (trips, tasks, preferences, Magic history). */
  workspaces: Record<string, { version: number; updatedAt: number; state: unknown }>
  /** What identity resolution found on each login: source names only, never subject values. */
  identityObservations: { at: number; source: string | null; field?: string; foShape?: unknown }[]
  /** sha256(session id) → session. Raw session ids are never stored. */
  sessions: Record<string, Session>
  sessionExchanges?: Record<string, { userId: string; expiresAt: number; binding: string }>
  loginBindings?: Record<string, string>
  oauthClient?: { issuer: string; clientId: string; redirectUri: string; registeredAt: number }
  /** OAuth state → pending login. Single use, short-lived. */
  pendingAuth: Record<string, PendingAuth>
  /** user id → sealed TokenSet. Never sent to the browser. */
  tokens: Record<string, string>
  actions: Record<string, ServerAction>
  /** Mock provider state, so mock conversations survive restarts too. */
  mock: Record<string, unknown>
  /** user id → recent raw-response summaries from live Fo, for validating its real format. */
  foTrace: Record<string, unknown[]>
  /**
   * What Wajo's token endpoint actually returns: field names and token shape only,
   * never values. Used to judge whether Wajo exposes any stable user identity.
   */
  oauthObservations: OAuthObservation[]
  /** Conversations with real (or mock) Fo; see chat.ts. */
  foChats?: Record<string, unknown>
  /** account id → Epson Connect printer settings; see print.ts. Private to that account. */
  printers?: Record<string, unknown>
  /** Print jobs with their approved PDFs; see print.ts. */
  printJobs?: Record<string, unknown>
}

export interface OAuthObservation {
  at: number
  grant: 'authorization_code' | 'refresh_token'
  ok: boolean
  status: number
  fields: string[]
  tokenType?: string
  expiresIn?: number
  scope?: string
  hasRefreshToken: boolean
  refreshRotated?: boolean
  /** Access token format: claim *names* if it's a JWT, otherwise 'opaque'. */
  accessTokenFormat: 'jwt' | 'opaque' | 'none'
  jwtClaimNames?: string[]
  error?: string
}

const empty = (): Data => ({ users: {}, accounts: {}, subjects: {}, workspaces: {}, identityObservations: [], sessions: {}, pendingAuth: {}, tokens: {}, actions: {}, mock: {}, foTrace: {}, oauthObservations: [] })

export class Store {
  data: Data
  private file?: string
  private persist?: (data: Data) => Promise<void>
  private pending: Promise<void> = Promise.resolve()

  constructor(file?: string, persist?: (data: Data) => Promise<void>) {
    this.persist = persist
    this.file = file
    this.data = empty()
    if (file && existsSync(file)) this.data = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) }
  }

  /** In-memory store for tests. */
  static memory() {
    return new Store()
  }

  save() {
    if (this.persist) {
      const snapshot = structuredClone(this.data)
      this.pending = this.pending.then(() => this.persist!(snapshot))
      void this.pending.catch(() => {}) // flush() reports persistence failures to the caller
    }
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = join(dirname(this.file), `.${Date.now()}-${process.pid}.tmp`)
    writeFileSync(tmp, JSON.stringify(this.data, null, 1), { mode: 0o600 })
    renameSync(tmp, this.file)
    chmodSync(this.file, 0o600)
  }

  async flush() { await this.pending }

  /** Mutate and persist in one step. */
  update<T>(fn: (d: Data) => T): T {
    const out = fn(this.data)
    this.save()
    return out
  }
}
