import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ServerAction } from './types.ts'

/*
 * Durable server state in one JSON file, written atomically (temp + rename)
 * after every change. Good enough for a single-process demo server; swap for
 * a database before running more than one instance.
 */

export interface PendingAuth {
  userId: string
  verifier: string
  redirectUri: string
  createdAt: number
}

export interface Data {
  users: Record<string, { createdAt: number }>
  /** sha256(session id) → user id. Raw session ids are never stored. */
  sessions: Record<string, { userId: string; createdAt: number }>
  oauthClient?: { issuer: string; clientId: string; redirectUri: string; registeredAt: number }
  /** OAuth state → pending login. Single use, short-lived. */
  pendingAuth: Record<string, PendingAuth>
  /** user id → sealed TokenSet. Never sent to the browser. */
  tokens: Record<string, string>
  actions: Record<string, ServerAction>
  /** Mock provider state, so mock conversations survive restarts too. */
  mock: Record<string, unknown>
}

const empty = (): Data => ({ users: {}, sessions: {}, pendingAuth: {}, tokens: {}, actions: {}, mock: {} })

export class Store {
  data: Data
  private file?: string

  constructor(file?: string) {
    this.file = file
    this.data = empty()
    if (file && existsSync(file)) this.data = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) }
  }

  /** In-memory store for tests. */
  static memory() {
    return new Store()
  }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = join(dirname(this.file), `.${Date.now()}-${process.pid}.tmp`)
    writeFileSync(tmp, JSON.stringify(this.data, null, 1), { mode: 0o600 })
    renameSync(tmp, this.file)
    chmodSync(this.file, 0o600)
  }

  /** Mutate and persist in one step. */
  update<T>(fn: (d: Data) => T): T {
    const out = fn(this.data)
    this.save()
    return out
  }
}
