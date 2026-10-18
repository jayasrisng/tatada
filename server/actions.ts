import { canonical, randomToken, sha256 } from './crypto.ts'
import { classify, extractEvidence } from './evidence.ts'
import { isNotConnected, type FoAdapter, type FoReply } from './fo.ts'
import { McpHttpError, McpRpcError, McpUncertainError } from './mcp.ts'
import type { Store } from './store.ts'
import { TERMINAL, type ActionDraft, type PublicAction, type ServerAction } from './types.ts'

/*
 * The authoritative action lifecycle. The browser can propose, edit, approve,
 * answer, cancel, and ask to retry or re-check. Only this service talks to Fo.
 *
 *   proposed ─approve(hash)→ approved → sending → waiting ⇄ needs_input
 *                                         │          │         └ answering
 *                                         └→ send_uncertain → (reconcile)
 *                                                    waiting → verifying → verified | unverified
 *   plus failed / timeout / cancelled
 *
 * Safety rules:
 *  - Approval binds to a hash of the exact Fo message, recipient, shared data and trip.
 *  - The record moves to "sending" and is saved *before* the network call, so a
 *    crash mid-send is treated as uncertain after restart.
 *  - Uncertain sends are reconciled against Fo's conversations (by an embedded
 *    reference) before anything is ever sent again. Retries are owner-initiated.
 *  - Fo's questions wait for the owner. Nothing here answers them.
 *  - "verified" needs a send record for the approved recipient in Fo's transcript.
 */

export class ActionError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i
const nonEmpty = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export function validateDraft(input: unknown): ActionDraft {
  const d = (input ?? {}) as Record<string, unknown>
  const bad = (what: string) => {
    throw new ActionError(400, `Invalid ${what}`)
  }
  if (d.intent !== 'early_checkin' && d.intent !== 'delay') bad('intent')
  if (!nonEmpty(d.tripId, 100)) bad('trip')
  if (d.checklistItemId !== undefined && !nonEmpty(d.checklistItemId, 100)) bad('checklist item')
  if (!nonEmpty(d.to, 254) || !EMAIL.test((d.to as string).trim())) bad('recipient email')
  if (!nonEmpty(d.toName, 120) || /[<>\n]/.test(d.toName as string)) bad('recipient name')
  if (!nonEmpty(d.subject, 200) || /\n/.test(d.subject as string)) bad('subject')
  if (!nonEmpty(d.body, 5000)) bad('message')
  if (typeof d.transferQuote !== 'boolean') bad('transfer flag')
  if (!Array.isArray(d.shared) || d.shared.length > 12 || !d.shared.every((s) => nonEmpty(s, 80))) bad('shared details')
  return {
    intent: d.intent as ActionDraft['intent'],
    tripId: (d.tripId as string).trim(),
    checklistItemId: (d.checklistItemId as string | undefined)?.trim(),
    to: (d.to as string).trim(),
    toName: (d.toName as string).trim(),
    subject: (d.subject as string).trim(),
    body: (d.body as string).trim(),
    transferQuote: d.transferQuote as boolean,
    shared: (d.shared as string[]).map((s) => s.trim()),
  }
}

export function composeFoMessage(d: ActionDraft, ref: string) {
  return [
    'Please send the email below from my email account, exactly as written.',
    `Send it only to ${d.to}. Don't send anything else, and don't reply to anyone on my behalf.`,
    'Tell me once it is sent. If you need anything from me first, ask me.',
    '',
    `To: ${d.toName} <${d.to}>`,
    `Subject: ${d.subject}`,
    '',
    d.body,
    '',
    '---',
    `Tatada request ${ref}. This line is for my records; don't include it in the email.`,
  ].join('\n')
}

interface Options {
  store: Store
  fo: FoAdapter
  now?: () => number
  /** Live mode only sends to these addresses. Empty = live sends blocked. */
  liveRecipients?: string[]
  timeoutMs?: number
  pollWaitSeconds?: number
  maxReconcile?: number
}

export class ActionService {
  private store: Store
  private fo: FoAdapter
  private now: () => number
  private liveRecipients: Set<string>
  private timeoutMs: number
  private pollWait: number
  private maxReconcile: number
  private inFlight = new Set<string>()

  constructor(o: Options) {
    this.store = o.store
    this.fo = o.fo
    this.now = o.now ?? Date.now
    this.liveRecipients = new Set((o.liveRecipients ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean))
    this.timeoutMs = o.timeoutMs ?? 15 * 60_000
    this.pollWait = o.pollWaitSeconds ?? 20
    this.maxReconcile = o.maxReconcile ?? 5
  }

  get provider() {
    return this.fo.mode
  }

  get liveAllowlist() {
    return [...this.liveRecipients]
  }

  /* ───────── owner commands ───────── */

  create(ownerId: string, input: unknown): PublicAction {
    const draft = validateDraft(input)
    const ref = `T-${sha256(randomToken()).slice(0, 8)}`
    const a: ServerAction = {
      id: randomToken(12),
      ownerId,
      createdAt: this.now(),
      updatedAt: this.now(),
      provider: this.fo.mode,
      draft,
      ref,
      foMessage: '',
      contentHash: '',
      dedupeKey: '',
      status: 'proposed',
      progress: [],
      answers: [],
      sendAttempts: 0,
      reconcileAttempts: 0,
      pollErrors: 0,
    }
    this.bind(a)
    this.store.update((d) => (d.actions[a.id] = a))
    return publicView(a)
  }

  get(ownerId: string, id: string): PublicAction {
    return publicView(this.own(ownerId, id))
  }

  list(ownerId: string, ids?: string[]): PublicAction[] {
    return Object.values(this.store.data.actions)
      .filter((a) => a.ownerId === ownerId && (!ids || ids.includes(a.id)))
      .sort((x, y) => x.createdAt - y.createdAt)
      .map(publicView)
  }

  /** Edits are only allowed before approval and always produce a new hash. */
  edit(ownerId: string, id: string, input: unknown): PublicAction {
    const a = this.own(ownerId, id)
    if (a.status !== 'proposed') throw new ActionError(409, 'This request was already approved or closed. Start a new one to change it.')
    const next = validateDraft({ ...(input as object), tripId: a.draft.tripId, checklistItemId: a.draft.checklistItemId, intent: a.draft.intent })
    a.draft = next
    this.bind(a)
    this.touch(a)
    return publicView(a)
  }

  approve(ownerId: string, id: string, body: { contentHash?: unknown; idempotencyKey?: unknown }): PublicAction {
    const a = this.own(ownerId, id)
    const key = body.idempotencyKey
    if (typeof key !== 'string' || key.length < 8 || key.length > 100) throw new ActionError(400, 'Missing idempotency key')
    if (a.approval && a.approval.idempotencyKey === key && a.approval.contentHash === body.contentHash) return publicView(a)
    if (a.status !== 'proposed') throw new ActionError(409, 'This request was already approved or closed.')
    if (body.contentHash !== a.contentHash) throw new ActionError(409, 'The message changed. Review it again before approving.')
    if (this.fo.mode === 'live') {
      if (!this.liveRecipients.has(a.draft.to.toLowerCase())) {
        throw new ActionError(403, `Live sends are limited to approved test recipients, and ${a.draft.to} isn't one of them.`)
      }
      if (!this.fo.connected(ownerId)) throw new ActionError(409, 'Connect Fo before approving.')
    }
    const dup = Object.values(this.store.data.actions).find(
      (x) => x.id !== a.id && x.ownerId === ownerId && x.dedupeKey === a.dedupeKey && x.status !== 'proposed' && x.status !== 'cancelled' && !(x.status === 'failed' && x.retryable),
    )
    if (dup) throw new ActionError(409, 'You already approved this exact email. Check that request instead of sending it again.')
    a.approval = { contentHash: a.contentHash, idempotencyKey: key, at: this.now() }
    a.status = 'approved'
    a.deadline = this.now() + this.timeoutMs
    a.nextRunAt = this.now()
    this.log(a, 'You approved this exact message')
    this.touch(a)
    return publicView(a)
  }

  answer(ownerId: string, id: string, text: unknown): PublicAction {
    const a = this.own(ownerId, id)
    if (a.status !== 'needs_input') throw new ActionError(409, 'Fo isn\'t waiting for an answer.')
    if (!nonEmpty(text, 1000)) throw new ActionError(400, 'Write an answer first.')
    a.pendingAnswer = text.trim()
    a.answers.push({ at: this.now(), text: a.pendingAnswer })
    a.question = undefined
    a.status = 'answering'
    // Time spent waiting on the owner doesn't count against Fo's deadline.
    a.deadline = this.now() + this.timeoutMs
    a.nextRunAt = this.now()
    this.touch(a)
    return publicView(a)
  }

  cancel(ownerId: string, id: string): PublicAction {
    const a = this.own(ownerId, id)
    if (a.status === 'proposed' || a.status === 'approved') {
      a.status = 'cancelled'
      this.log(a, a.sendAttempts ? 'Cancelled' : 'Cancelled before anything was sent')
    } else if (a.status === 'needs_input') {
      a.status = 'cancelled'
      this.log(a, 'Cancelled. Tatada won\'t answer Fo\'s question, but Fo may still have the unanswered request.')
    } else throw new ActionError(409, 'This can\'t be cancelled now. Fo already has it.')
    this.touch(a)
    return publicView(a)
  }

  /** Owner-initiated retry. Always reconciles with Fo first. */
  retry(ownerId: string, id: string): PublicAction {
    const a = this.own(ownerId, id)
    if (a.status !== 'failed' || !a.retryable) throw new ActionError(409, 'This request can\'t be retried.')
    const duplicate = Object.values(this.store.data.actions).some((other) =>
      other.id !== a.id && other.ownerId === ownerId && other.dedupeKey === a.dedupeKey &&
      !['proposed', 'cancelled'].includes(other.status) && !(other.status === 'failed' && other.retryable))
    if (duplicate) throw new ActionError(409, 'Another request for this exact email was already approved. Check that request instead.')
    a.status = 'send_uncertain'
    a.retryRequested = true
    a.reconcileAttempts = 0
    a.error = undefined
    a.retryable = undefined
    a.deadline = this.now() + this.timeoutMs
    a.nextRunAt = this.now()
    this.log(a, 'Checking with Fo before retrying')
    this.touch(a)
    return publicView(a)
  }

  /** Read-only re-check, e.g. for a hotel reply after "request sent". */
  check(ownerId: string, id: string): PublicAction {
    const a = this.own(ownerId, id)
    const ok = ['verified', 'unverified', 'timeout'].includes(a.status) || (a.status === 'failed' && !a.retryable)
    if (!ok || !a.conversationId) throw new ActionError(409, 'Nothing to check yet.')
    a.status = 'waiting'
    a.pollErrors = 0
    a.error = undefined
    a.deadline = this.now() + this.timeoutMs
    a.nextRunAt = this.now()
    this.log(a, 'Checking Fo again')
    this.touch(a)
    return publicView(a)
  }

  /* ───────── worker ───────── */

  /** After a restart: anything that was mid-send is now uncertain. */
  recover() {
    this.store.update((d) => {
      for (const a of Object.values(d.actions)) {
        if (a.status === 'sending') {
          a.status = 'send_uncertain'
          a.progress.push({ at: this.now(), text: 'Tatada restarted mid-send. Checking with Fo before doing anything else.' })
        }
        if (a.status === 'answering') {
          // We can't know if the answer arrived, so don't resend it. Polling shows whether Fo still needs it.
          a.status = 'waiting'
          a.pendingAnswer = undefined
          a.progress.push({ at: this.now(), text: 'Tatada restarted. Checking whether Fo got your answer.' })
        }
        if (!TERMINAL.includes(a.status) && a.status !== 'proposed' && a.status !== 'needs_input') a.nextRunAt = this.now()
      }
    })
  }

  /** Runs every action that's due, one at a time. Returns how many ran. */
  async runDue(limit = Infinity): Promise<number> {
    const due = Object.values(this.store.data.actions).filter(
      (a) => !TERMINAL.includes(a.status) && !['proposed', 'needs_input'].includes(a.status) && (a.nextRunAt ?? 0) <= this.now() && !this.inFlight.has(a.id),
    ).slice(0, limit)
    for (const a of due) {
      this.inFlight.add(a.id)
      try {
        await this.step(a)
      } finally {
        this.inFlight.delete(a.id)
      }
    }
    return due.length
  }

  private async step(a: ServerAction) {
    switch (a.status) {
      case 'approved':
        return this.send(a)
      case 'send_uncertain':
        return this.reconcile(a)
      case 'waiting':
        return this.poll(a)
      case 'answering':
        return this.deliverAnswer(a)
      case 'verifying':
        return this.verify(a)
    }
  }

  private async send(a: ServerAction) {
    // Configuration can change between approval and execution or after restart.
    if (this.fo.mode === 'live' && !this.liveRecipients.has(a.draft.to.toLowerCase())) {
      this.fail(a, 'This recipient is no longer allowed for live sends. Nothing was sent.', false)
      return this.touch(a)
    }
    a.status = 'sending'
    a.sendAttempts++
    this.touch(a) // saved before the network call on purpose
    let r: FoReply
    try {
      r = await this.fo.ask(a.ownerId, { message: a.foMessage, newConversation: true })
    } catch (e) {
      const rejected = isNotConnected(e) || (e instanceof McpHttpError && e.definite) ||
        (e instanceof McpRpcError && [-32600, -32601, -32602].includes(e.code))
      if (!rejected) {
        a.status = 'send_uncertain'
        this.log(a, 'Lost the connection mid-send. Checking with Fo before doing anything else.')
        a.nextRunAt = this.now() + 2000
      } else {
        // Rejected before Fo processed it (auth, validation): nothing was sent.
        this.fail(a, isNotConnected(e) ? 'Fo isn\'t connected. Reconnect, then retry.' : `Fo rejected the request: ${(e as Error).message}`, true)
      }
      return this.touch(a)
    }
    this.log(a, 'Fo received the request')
    this.apply(a, r)
  }

  private async reconcile(a: ServerAction) {
    let found: string | undefined
    try {
      const convos = await this.fo.conversations(a.ownerId)
      for (const c of convos.slice(0, 15)) {
        const t = await this.fo.conversation(a.ownerId, c.conversationId)
        if (t.some((e) => e.role === 'user' && e.text.includes(a.ref))) {
          found = c.conversationId
          break
        }
      }
    } catch {
      a.reconcileAttempts++
      if (a.reconcileAttempts >= this.maxReconcile) {
        this.fail(a, 'Couldn\'t confirm whether Fo received this. Check your Fo conversations before trying again.', false)
      } else a.nextRunAt = this.now() + Math.min(30_000, 2000 * 2 ** a.reconcileAttempts)
      return this.touch(a)
    }
    if (found) {
      a.conversationId = found
      a.status = 'waiting'
      a.retryRequested = false
      a.nextRunAt = this.now()
      this.log(a, 'Found the request in Fo. Continuing without resending.')
    } else if (a.retryRequested) {
      a.retryRequested = false
      a.status = 'approved'
      a.nextRunAt = this.now()
      this.log(a, 'The earlier send was explicitly rejected. No matching conversation found; retrying once.')
    } else {
      this.fail(a, 'Could not find this request in Fo’s recent conversations. This does not prove it was never received. Check Fo before starting another request.', false)
    }
    this.touch(a)
  }

  private async poll(a: ServerAction) {
    if (a.deadline && this.now() > a.deadline) {
      a.status = 'timeout'
      a.error = 'Fo is still working. Tatada stopped waiting; check again later.'
      return this.touch(a)
    }
    try {
      const r = await this.fo.reply(a.ownerId, a.conversationId!, this.pollWait)
      a.pollErrors = 0
      this.apply(a, r)
    } catch (e) {
      if (isNotConnected(e)) {
        this.fail(a, 'Fo was disconnected. Reconnect, then check again.', false)
        return this.touch(a)
      }
      a.pollErrors++
      a.nextRunAt = this.now() + Math.min(30_000, 1000 * 2 ** a.pollErrors)
      this.touch(a)
    }
  }

  private async deliverAnswer(a: ServerAction) {
    a.sendAttempts++
    this.touch(a)
    let r: FoReply
    try {
      r = await this.fo.ask(a.ownerId, { message: a.pendingAnswer!, conversationId: a.conversationId })
    } catch (e) {
      if (e instanceof McpUncertainError) {
        // Don't resend: polling shows whether Fo still needs the answer.
        a.status = 'waiting'
        this.log(a, 'Not sure your answer arrived. Checking with Fo.')
      } else {
        a.status = 'needs_input'
        a.question = a.question ?? 'Your answer couldn\'t be delivered. Please send it again.'
        a.error = (e as Error).message
      }
      a.pendingAnswer = undefined
      a.nextRunAt = this.now() + 1000
      return this.touch(a)
    }
    a.pendingAnswer = undefined
    this.log(a, 'Your answer reached Fo')
    this.apply(a, r)
  }

  private async verify(a: ServerAction) {
    try {
      const transcript = await this.fo.conversation(a.ownerId, a.conversationId!)
      const result = classify(a.draft, extractEvidence(transcript, a.draft))
      if (result) {
        a.status = 'verified'
        a.result = result
        a.error = undefined
        this.log(a, 'Found proof in Fo\'s records')
      } else {
        a.status = 'unverified'
        a.result = undefined
        a.error = `Fo says it's done, but its records don't show an email to ${a.draft.to}. Treat this as not done until you check.`
      }
    } catch {
      a.pollErrors++
      if (a.pollErrors > 5) {
        a.status = 'unverified'
        a.error = 'Couldn\'t read Fo\'s records to check the result.'
      } else a.nextRunAt = this.now() + 2000 * a.pollErrors
    }
    this.touch(a)
  }

  /** Applies a Fo reply to the record. */
  private apply(a: ServerAction, r: FoReply) {
    if (r.conversationId && !a.conversationId) a.conversationId = r.conversationId
    if (!a.conversationId) {
      // Fo answered but gave no handle; find the conversation before anything else.
      a.status = 'send_uncertain'
      a.nextRunAt = this.now() + 1000
      return this.touch(a)
    }
    if (r.progress) this.log(a, r.progress)
    switch (r.status) {
      case 'working':
        a.status = 'waiting'
        a.nextRunAt = this.now() + 1000
        break
      case 'needs_user':
        a.status = 'needs_input'
        a.question = r.progress ?? r.reply ?? 'Fo has a question for you.'
        break
      case 'complete':
        a.status = 'verifying'
        if (r.reply) this.log(a, `Fo: ${r.reply}`)
        a.nextRunAt = this.now()
        break
      case 'failed':
        // Fo had the request, so it may have done part of it: no blind retry.
        this.fail(a, r.reply ?? 'Fo reported that it couldn\'t finish.', false)
        break
    }
    this.touch(a)
  }

  /* ───────── helpers ───────── */

  private bind(a: ServerAction) {
    a.foMessage = composeFoMessage(a.draft, a.ref)
    a.contentHash = sha256(canonical({ foMessage: a.foMessage, to: a.draft.to, shared: a.draft.shared, tripId: a.draft.tripId, item: a.draft.checklistItemId }))
    const { to, subject, body, tripId } = a.draft
    a.dedupeKey = sha256(canonical({ owner: a.ownerId, to: to.toLowerCase(), subject, body, tripId }))
  }

  private own(ownerId: string, id: string): ServerAction {
    const a = this.store.data.actions[id]
    // Same answer for "missing" and "not yours": don't leak which ids exist.
    if (!a || a.ownerId !== ownerId) throw new ActionError(404, 'Not found')
    return a
  }

  private fail(a: ServerAction, error: string, retryable: boolean) {
    a.status = 'failed'
    a.error = error
    a.retryable = retryable
  }

  private log(a: ServerAction, text: string) {
    const last = a.progress.at(-1)
    if (last?.text !== text) a.progress.push({ at: this.now(), text })
  }

  private touch(a: ServerAction) {
    a.updatedAt = this.now()
    this.store.save()
  }
}

export function publicView(a: ServerAction): PublicAction {
  const { ownerId, dedupeKey, nextRunAt, reconcileAttempts, pollErrors, ...rest } = a
  void ownerId, void dedupeKey, void nextRunAt, void reconcileAttempts, void pollErrors
  return structuredClone(rest)
}
