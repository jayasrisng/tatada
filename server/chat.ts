import { canonical, randomToken, sha256 } from './crypto.ts'
import { isNotConnected, type FoAdapter, type FoReply } from './fo.ts'
import { McpHttpError, McpRpcError } from './mcp.ts'
import { ActionError } from './actions.ts'
import { riskOf, type RiskCategory } from './risk.ts'
import type { Store } from './store.ts'

/*
 * Conversations with the real Fo (ask_fo / get_fo_reply / get_fo_conversation).
 *
 *   prepare(text)  → server composes the exact outgoing message and its risk categories
 *   send(hash)     → only that exact message, once (idempotency key), only with every
 *                    risk category explicitly confirmed; one message in flight per chat
 *   worker         → ask_fo, then polls get_fo_reply; replies and questions are appended
 *                    verbatim as Fo's words (never as verified outcomes)
 *
 * Uncertain sends are reconciled against Fo's own transcript before anything is
 * resent, and a restart mid-send counts as uncertain. Creating or opening a chat
 * never calls ask_fo.
 */

export interface ChatTurn {
  id: string
  role: 'me' | 'fo'
  kind?: 'reply' | 'question' | 'error'
  text: string
  at: number
  risk?: RiskCategory[]
  delivery?: 'sending' | 'delivered' | 'uncertain' | 'failed'
}

export type ChatStatus = 'idle' | 'sending' | 'send_uncertain' | 'working' | 'needs_input' | 'failed' | 'timeout'

export interface FoChat {
  id: string
  ownerId: string
  tripId?: string
  createdAt: number
  updatedAt: number
  ref: string
  conversationId?: string
  status: ChatStatus
  turns: ChatTurn[]
  progress?: string
  error?: string
  pending?: { text: string; message: string; hash: string; risk: RiskCategory[]; preparedAt: number }
  inflight?: { turnId: string; message: string; attempts: number }
  keys: string[]
  deadline?: number
  nextRunAt?: number
  pollErrors: number
}

const BUSY: ChatStatus[] = ['sending', 'send_uncertain', 'working']
const MAX_TEXT = 4000

export class FoChatService {
  private store: Store
  private fo: FoAdapter
  private now: () => number
  private timeoutMs: number
  private pollWait: number
  private inFlight = new Set<string>()

  constructor(o: { store: Store; fo: FoAdapter; now?: () => number; timeoutMs?: number; pollWaitSeconds?: number }) {
    this.store = o.store
    this.fo = o.fo
    this.now = o.now ?? Date.now
    this.timeoutMs = o.timeoutMs ?? 10 * 60_000
    this.pollWait = o.pollWaitSeconds ?? 20
  }

  private get chats() {
    return (this.store.data.foChats ??= {}) as Record<string, FoChat>
  }

  create(ownerId: string, tripId?: unknown): FoChat {
    if (tripId !== undefined && (typeof tripId !== 'string' || tripId.length > 100)) throw new ActionError(400, 'Invalid trip')
    const c: FoChat = { id: randomToken(12), ownerId, tripId: tripId as string | undefined, createdAt: this.now(), updatedAt: this.now(), ref: `T-${sha256(randomToken()).slice(0, 8)}`, status: 'idle', turns: [], keys: [], pollErrors: 0 }
    this.store.update(() => (this.chats[c.id] = c))
    return this.view(c)
  }

  list(ownerId: string, tripId?: string | null): FoChat[] {
    return Object.values(this.chats)
      .filter((c) => c.ownerId === ownerId && (tripId === undefined || (c.tripId ?? null) === tripId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => this.view(c))
  }

  get(ownerId: string, id: string): FoChat {
    return this.view(this.own(ownerId, id))
  }

  /** Composes the exact message and its risks. Nothing is sent. */
  prepare(ownerId: string, id: string, body: { text?: unknown; context?: unknown }): FoChat {
    const c = this.own(ownerId, id)
    if (BUSY.includes(c.status)) throw new ActionError(409, 'Fo is still working on the last message.')
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text || text.length > MAX_TEXT) throw new ActionError(400, 'Write a message first.')
    const context = typeof body.context === 'string' && body.context.trim() ? body.context.trim().slice(0, 500) : ''
    const first = !c.conversationId && !c.turns.some((t) => t.role === 'me')
    const message = [context, text, first ? `(Tatada ref ${c.ref})` : ''].filter(Boolean).join('\n\n')
    const answering = c.status === 'needs_input' ? [...c.turns].reverse().find((t) => t.role === 'fo')?.text : undefined
    const risk = riskOf(message, answering)
    c.pending = { text, message, risk, hash: sha256(canonical({ id: c.id, message, risk })), preparedAt: this.now() }
    this.touch(c)
    return this.view(c)
  }

  discard(ownerId: string, id: string): FoChat {
    const c = this.own(ownerId, id)
    c.pending = undefined
    this.touch(c)
    return this.view(c)
  }

  /** Sends exactly the prepared message. Every risk category must be confirmed. */
  send(ownerId: string, id: string, body: { hash?: unknown; idempotencyKey?: unknown; confirm?: unknown }): FoChat {
    const c = this.own(ownerId, id)
    const key = body.idempotencyKey
    if (typeof key !== 'string' || key.length < 8 || key.length > 100) throw new ActionError(400, 'Missing idempotency key')
    if (c.keys.includes(key)) return this.view(c) // a repeated tap or retry of the same request
    if (BUSY.includes(c.status)) throw new ActionError(409, 'Fo is still working on the last message.')
    const p = c.pending
    if (!p || body.hash !== p.hash) throw new ActionError(409, 'The message changed. Review it again before sending.')
    const confirmed = new Set(Array.isArray(body.confirm) ? body.confirm : [])
    const missing = p.risk.filter((r) => !confirmed.has(r))
    if (missing.length) throw new ActionError(403, `Confirm separately before sending: ${missing.join(', ')}`)
    if (!this.fo.connected(ownerId)) throw new ActionError(409, 'Fo isn\'t authorized yet.')
    const turn: ChatTurn = { id: randomToken(8), role: 'me', text: p.message, at: this.now(), risk: p.risk, delivery: 'sending' }
    c.turns.push(turn)
    c.keys = [...c.keys, key].slice(-50)
    c.inflight = { turnId: turn.id, message: p.message, attempts: 0 }
    c.pending = undefined
    c.status = 'sending'
    c.error = undefined
    c.progress = undefined
    c.deadline = this.now() + this.timeoutMs
    c.nextRunAt = this.now()
    this.touch(c)
    return this.view(c)
  }

  /** Read-only: resume polling after a timeout. */
  check(ownerId: string, id: string): FoChat {
    const c = this.own(ownerId, id)
    if (c.status !== 'timeout' || !c.conversationId) throw new ActionError(409, 'Nothing to check.')
    c.status = 'working'
    c.deadline = this.now() + this.timeoutMs
    c.nextRunAt = this.now()
    this.touch(c)
    return this.view(c)
  }

  recover() {
    this.store.update(() => {
      for (const c of Object.values(this.chats)) {
        if (c.status === 'sending') c.status = 'send_uncertain'
        if (BUSY.includes(c.status)) c.nextRunAt = this.now()
      }
    })
  }

  async runDue(): Promise<number> {
    const due = Object.values(this.chats).filter((c) => BUSY.includes(c.status) && (c.nextRunAt ?? 0) <= this.now() && !this.inFlight.has(c.id))
    for (const c of due) {
      this.inFlight.add(c.id)
      try {
        if (c.status === 'sending') await this.sendNow(c)
        else if (c.status === 'send_uncertain') await this.reconcile(c)
        else await this.poll(c)
      } finally {
        this.inFlight.delete(c.id)
      }
    }
    return due.length
  }

  private async sendNow(c: FoChat) {
    const f = c.inflight!
    f.attempts++
    this.touch(c) // saved before the network call: a crash here is "uncertain"
    let r: FoReply
    try {
      r = await this.fo.ask(c.ownerId, c.conversationId ? { message: f.message, conversationId: c.conversationId } : { message: f.message, newConversation: true })
    } catch (e) {
      const rejected = isNotConnected(e) || (e instanceof McpHttpError && e.definite) || (e instanceof McpRpcError && [-32600, -32601, -32602].includes(e.code))
      if (rejected) {
        this.deliver(c, 'failed')
        c.status = 'failed'
        c.error = isNotConnected(e) ? 'Fo isn\'t authorized. Authorize Fo, then send again.' : `Fo rejected the message: ${(e as Error).message}`
      } else {
        this.deliver(c, 'uncertain')
        c.status = 'send_uncertain'
        c.nextRunAt = this.now() + 2000
      }
      return this.touch(c)
    }
    this.deliver(c, 'delivered')
    this.apply(c, r)
  }

  private async reconcile(c: FoChat) {
    const f = c.inflight
    if (!f) return this.fail(c, 'Lost track of the last message.')
    try {
      const candidates = c.conversationId ? [c.conversationId] : (await this.fo.conversations(c.ownerId)).slice(0, 15).map((x) => x.conversationId)
      for (const id of candidates) {
        const t = await this.fo.conversation(c.ownerId, id)
        const marker = c.conversationId ? f.message.trim() : c.ref
        if (t.some((e) => e.role === 'user' && e.text.includes(marker))) {
          c.conversationId = id
          this.deliver(c, 'delivered')
          c.status = 'working'
          c.nextRunAt = this.now()
          return this.touch(c)
        }
      }
    } catch {
      c.pollErrors++
      if (c.pollErrors > 5) return this.fail(c, 'Couldn\'t confirm whether Fo got the last message. Check Fo before sending it again.')
      c.nextRunAt = this.now() + 2000 * c.pollErrors
      return this.touch(c)
    }
    // Not found in Fo's records. That isn't proof it never arrived, so no automatic resend.
    this.deliver(c, 'failed')
    this.fail(c, 'Fo has no record of the last message. Check Fo, then send it again if needed.')
  }

  private async poll(c: FoChat) {
    if (c.deadline && this.now() > c.deadline) {
      c.status = 'timeout'
      c.error = 'Fo is still working. Tatada stopped waiting; check again later.'
      return this.touch(c)
    }
    try {
      const r = await this.fo.reply(c.ownerId, c.conversationId!, this.pollWait)
      c.pollErrors = 0
      this.apply(c, r)
    } catch (e) {
      if (isNotConnected(e)) return this.fail(c, 'Fo authorization ended. Authorize Fo again, then check.')
      c.pollErrors++
      c.nextRunAt = this.now() + Math.min(30_000, 1000 * 2 ** c.pollErrors)
      this.touch(c)
    }
  }

  private apply(c: FoChat, r: FoReply) {
    if (r.conversationId && !c.conversationId) c.conversationId = r.conversationId
    if (!c.conversationId) {
      c.status = 'send_uncertain'
      c.nextRunAt = this.now() + 1000
      return this.touch(c)
    }
    if (r.progress) c.progress = r.progress
    switch (r.status) {
      case 'working':
        c.status = 'working'
        c.nextRunAt = this.now() + 1000
        break
      case 'needs_user':
        c.turns.push({ id: randomToken(8), role: 'fo', kind: 'question', text: r.progress ?? r.reply ?? 'Fo has a question.', at: this.now() })
        c.status = 'needs_input'
        c.progress = undefined
        c.inflight = undefined
        break
      case 'complete':
        c.turns.push({ id: randomToken(8), role: 'fo', kind: 'reply', text: r.reply ?? '(Fo finished without a message.)', at: this.now() })
        c.status = 'idle'
        c.progress = undefined
        c.inflight = undefined
        break
      case 'failed':
        c.turns.push({ id: randomToken(8), role: 'fo', kind: 'error', text: r.reply ?? 'Fo couldn\'t finish.', at: this.now() })
        c.status = 'failed'
        c.progress = undefined
        c.inflight = undefined
        break
    }
    this.touch(c)
  }

  private deliver(c: FoChat, d: ChatTurn['delivery']) {
    const t = c.turns.find((x) => x.id === c.inflight?.turnId)
    if (t) t.delivery = d
  }

  private fail(c: FoChat, error: string) {
    c.status = 'failed'
    c.error = error
    c.inflight = undefined
    this.touch(c)
  }

  private own(ownerId: string, id: string) {
    const c = this.chats[id]
    if (!c || c.ownerId !== ownerId) throw new ActionError(404, 'Not found')
    return c
  }

  private touch(c: FoChat) {
    c.updatedAt = this.now()
    this.store.save()
  }

  private view(c: FoChat): FoChat {
    const { keys, nextRunAt, pollErrors, ownerId, inflight, ...rest } = c
    void keys, void nextRunAt, void pollErrors, void ownerId, void inflight
    return structuredClone({ ...rest, ownerId: '', keys: [], pollErrors: 0 }) as FoChat
  }
}
