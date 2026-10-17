import { McpClient, McpHttpError, McpUncertainError, type ToolResult } from './mcp.ts'
import { OAuthError, type FoOAuth } from './oauth.ts'
import { randomToken } from './crypto.ts'
import type { Store } from './store.ts'

/*
 * Fo adapters. The live adapter speaks MCP to Wajo with the user's own OAuth
 * token. The mock adapter is a deterministic stand-in used in development and
 * tests; the UI labels its results as mock.
 *
 * Fo's tool outputs are prose-first and their exact shape isn't documented, so
 * normalizeReply/normalizeTranscript accept structured content, JSON text, or
 * plain text. Unknown shapes degrade to "working" or "no evidence", never to
 * "done".
 */

export type FoStatus = 'working' | 'complete' | 'failed' | 'needs_user'

export interface FoReply {
  status: FoStatus
  conversationId?: string
  progress?: string
  reply?: string
}

export interface TranscriptEntry {
  role: string
  text: string
  meta: Record<string, unknown>
}

export interface ToolInfo {
  name: string
  title?: string
  readOnly?: boolean
  destructive?: boolean
  openWorld?: boolean
}

/** What a live Fo response looked like: structure and a short preview, never tokens. */
export interface TraceEntry {
  at: number
  tool: string
  ok: boolean
  isError?: boolean
  contentTypes?: string[]
  structured?: unknown
  textShape?: unknown
  textPreview?: string
  error?: string
}

export interface FoAdapter {
  readonly mode: 'live' | 'mock'
  /** Read-only: tools/list. */
  tools(userId: string): Promise<ToolInfo[]>
  /** Read-only: list_fo_conversations, reduced to its shape and a count. No content. */
  probeConversations(userId: string): Promise<{ count: number; shape: unknown }>
  trace(userId: string): TraceEntry[]
  ask(userId: string, a: { message: string; conversationId?: string; newConversation?: boolean }): Promise<FoReply>
  reply(userId: string, conversationId: string, waitSeconds: number): Promise<FoReply>
  conversation(userId: string, conversationId: string): Promise<TranscriptEntry[]>
  conversations(userId: string): Promise<{ conversationId: string }[]>
  connected(userId: string): boolean
}

/* ───────────── parsing ───────────── */

const textOf = (r: ToolResult) => (r.content ?? []).filter((c) => c.type === 'text' && c.text).map((c) => c.text).join('\n')

function payload(r: ToolResult): Record<string, unknown> | unknown[] | undefined {
  if (r.structuredContent && typeof r.structuredContent === 'object') return r.structuredContent as Record<string, unknown>
  const t = textOf(r).trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t)
    } catch {
      /* plain text */
    }
  }
  return undefined
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export function normalizeReply(r: ToolResult): FoReply {
  const p = payload(r)
  const o = (p && !Array.isArray(p) ? p : {}) as Record<string, unknown>
  const text = textOf(r)
  const rawStatus = (str(o.status) ?? str(o.state) ?? '').toLowerCase()
  const reply = str(o.reply) ?? str(o.message) ?? str(o.text) ?? (p ? undefined : str(text))
  const progress = str(o.progress) ?? str(o.progressLine)
  const conversationId = str(o.conversationId) ?? str(o.conversation_id) ?? str((text.match(/conversationId["']?\s*[:=]\s*["']?([\w-]+)/) ?? [])[1])
  const waiting =
    o.waitingForUser === true ||
    ['needs_input', 'input_required', 'waiting_for_user', 'awaiting_user', 'needs_user'].includes(rawStatus) ||
    /waiting for (the user'?s?|your) (answer|reply|input)/i.test(`${progress ?? ''} ${text}`)

  let status: FoStatus
  if (r.isError || rawStatus === 'failed' || rawStatus === 'error') status = 'failed'
  else if (waiting) status = 'needs_user'
  else if (rawStatus === 'complete' || rawStatus === 'completed' || rawStatus === 'done') status = 'complete'
  else status = 'working' // includes unknown shapes: never assume success
  return { status, conversationId, progress, reply }
}

export function normalizeTranscript(r: ToolResult): TranscriptEntry[] {
  const p = payload(r)
  const list = Array.isArray(p)
    ? p
    : ((p as Record<string, unknown> | undefined)?.messages ?? (p as Record<string, unknown> | undefined)?.turns ?? (p as Record<string, unknown> | undefined)?.transcript)
  if (Array.isArray(list)) {
    return list
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => {
        const content = e.content
        const text =
          str(e.text) ??
          str(content) ??
          (Array.isArray(content) ? content.map((c) => (typeof c === 'string' ? c : str((c as Record<string, unknown>)?.text) ?? '')).join('\n') : '') ??
          ''
        const { role, author, from, type, ...meta } = e
        return { role: String(role ?? author ?? type ?? 'unknown').toLowerCase(), text, meta: { ...meta, from, type } }
      })
  }
  // Plain text: one entry per "role: text" line; unknown roles stay unknown.
  return textOf(r)
    .split(/\n(?=\w[\w ]{0,20}:)/)
    .map((chunk) => {
      const m = chunk.match(/^(\w[\w ]{0,20}):\s*([\s\S]*)$/)
      return { role: (m?.[1] ?? 'unknown').toLowerCase(), text: (m?.[2] ?? chunk).trim(), meta: {} }
    })
}

/** Structure of a value without its contents: types, keys, array lengths. */
export function describeShape(v: unknown, depth = 3): unknown {
  if (Array.isArray(v)) return { array: v.length, item: v.length && depth > 0 ? describeShape(v[0], depth - 1) : undefined }
  if (v && typeof v === 'object') {
    if (depth <= 0) return 'object'
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 25).map(([k, x]) => [k, describeShape(x, depth - 1)]))
  }
  return v === null ? 'null' : typeof v
}

const toolInfo = (t: { name: string; title?: string; annotations?: Record<string, unknown> }): ToolInfo => ({
  name: t.name,
  title: t.title ?? (typeof t.annotations?.title === 'string' ? t.annotations.title : undefined),
  readOnly: t.annotations?.readOnlyHint as boolean | undefined,
  destructive: t.annotations?.destructiveHint as boolean | undefined,
  openWorld: t.annotations?.openWorldHint as boolean | undefined,
})

/* ───────────── live ───────────── */

export class LiveFoAdapter implements FoAdapter {
  readonly mode = 'live' as const
  private oauth: FoOAuth
  private mcp: McpClient
  private store?: Store

  constructor(oauth: FoOAuth, mcp: McpClient, store?: Store) {
    this.oauth = oauth
    this.mcp = mcp
    this.store = store
  }

  async tools(userId: string) {
    const list = await this.withToken(userId, (t) => this.mcp.listTools(t))
    return (list.tools ?? []).map(toolInfo)
  }

  async probeConversations(userId: string) {
    const r = await this.call(userId, 'list_fo_conversations', {})
    const p = payload(r)
    const list = Array.isArray(p) ? p : ((p as Record<string, unknown> | undefined)?.conversations as unknown[] | undefined)
    return { count: Array.isArray(list) ? list.length : -1, shape: p ? describeShape(p) : { text: textOf(r).length } }
  }

  trace(userId: string) {
    return (this.store?.data.foTrace[userId] ?? []) as TraceEntry[]
  }

  private record(userId: string, e: TraceEntry) {
    if (!this.store) return
    const list = (this.store.data.foTrace[userId] ??= [])
    list.push(e)
    if (list.length > 40) list.splice(0, list.length - 40)
    this.store.save()
  }

  private async withToken<T>(userId: string, fn: (token: string) => Promise<T>): Promise<T> {
    const token = await this.oauth.accessToken(userId)
    try {
      return await fn(token)
    } catch (e) {
      if (e instanceof McpHttpError && e.status === 401) return fn(await this.oauth.accessToken(userId, true))
      throw e
    }
  }

  connected(userId: string) {
    return this.oauth.connected(userId)
  }

  /** One call; on 401 refresh once and retry. A 401 means Fo never processed it. */
  private async call(userId: string, tool: string, args: Record<string, unknown>) {
    try {
      const r = await this.withToken(userId, (t) => this.mcp.callTool(t, tool, args))
      const text = textOf(r)
      let textShape: unknown
      try {
        textShape = text.trim().startsWith('{') || text.trim().startsWith('[') ? describeShape(JSON.parse(text)) : undefined
      } catch {
        /* prose */
      }
      this.record(userId, {
        at: Date.now(), tool, ok: true, isError: r.isError,
        contentTypes: (r.content ?? []).map((c) => c.type),
        structured: r.structuredContent === undefined ? undefined : describeShape(r.structuredContent),
        textShape,
        textPreview: text.slice(0, 600),
      })
      return r
    } catch (e) {
      this.record(userId, { at: Date.now(), tool, ok: false, error: (e as Error).message.slice(0, 300) })
      throw e
    }
  }

  async ask(userId: string, a: { message: string; conversationId?: string; newConversation?: boolean }) {
    const args: Record<string, unknown> = { message: a.message }
    if (a.conversationId) args.conversationId = a.conversationId
    else if (a.newConversation) args.newConversation = true
    return normalizeReply(await this.call(userId, 'ask_fo', args))
  }

  async reply(userId: string, conversationId: string, waitSeconds: number) {
    return normalizeReply(await this.call(userId, 'get_fo_reply', { conversationId, waitSeconds: Math.min(40, Math.max(0, waitSeconds)) }))
  }

  async conversation(userId: string, conversationId: string) {
    return normalizeTranscript(await this.call(userId, 'get_fo_conversation', { conversationId }))
  }

  async conversations(userId: string) {
    const r = await this.call(userId, 'list_fo_conversations', {})
    const p = payload(r)
    const list = Array.isArray(p) ? p : ((p as Record<string, unknown> | undefined)?.conversations as unknown[] | undefined)
    if (Array.isArray(list)) {
      return list
        .map((c) => str((c as Record<string, unknown>)?.conversationId) ?? str((c as Record<string, unknown>)?.id))
        .filter((id): id is string => !!id)
        .map((conversationId) => ({ conversationId }))
    }
    return [...textOf(r).matchAll(/conversationId["']?\s*[:=]\s*["']?([\w-]+)/g)].map((m) => ({ conversationId: m[1] }))
  }
}

export const isNotConnected = (e: unknown) => e instanceof OAuthError && e.code === 'not_connected'

/* ───────────── mock ───────────── */

/*
 * Deterministic scenarios keyed off the recipient's plus-tag, e.g.
 * frontdesk+confirm@hotel.example. Default: the email is sent, no reply yet.
 *   +confirm     stay replies yes, quotes a transfer
 *   +declined    stay replies no
 *   +needs       Fo asks a question before sending
 *   +fail        Fo reports failure
 *   +timeout     Fo never finishes
 *   +noevidence  Fo says "done" but the transcript has no send record
 *   +uncertain   Fo receives the request but the response is lost
 *   +lost        the request never reaches Fo (network error)
 */
interface MockConvo {
  ownerId: string
  scenario: string
  to: string
  polls: number
  messages: { role: string; text: string; meta?: Record<string, unknown> }[]
  answered: boolean
  status: FoStatus
}

export class MockFoAdapter implements FoAdapter {
  readonly mode = 'mock' as const
  sends = 0
  private store: Store

  constructor(store: Store) {
    this.store = store
  }

  private get convos() {
    return (this.store.data.mock.convos ??= {}) as Record<string, MockConvo>
  }

  connected() {
    return true
  }

  async tools() {
    return [
      { name: 'ask_fo', title: 'Ask Fo', readOnly: false, destructive: true, openWorld: true },
      { name: 'get_fo_reply', title: "Get Fo's reply", readOnly: true, destructive: false, openWorld: false },
      { name: 'get_fo_conversation', title: 'Read a Fo conversation', readOnly: true, destructive: false, openWorld: false },
      { name: 'list_fo_conversations', title: 'List Fo conversations', readOnly: true, destructive: false, openWorld: false },
      { name: 'start_fo_call', title: 'Call Fo', readOnly: false, destructive: false, openWorld: false },
    ]
  }

  async probeConversations(userId: string) {
    const list = await this.conversations(userId)
    return { count: list.length, shape: { mock: true } }
  }

  trace() {
    return []
  }

  async ask(userId: string, a: { message: string; conversationId?: string }) {
    if (a.conversationId) {
      const c = this.own(userId, a.conversationId)
      c.messages.push({ role: 'user', text: a.message })
      c.answered = true
      c.status = 'working'
      this.store.save()
      return { status: 'working' as const, conversationId: a.conversationId, progress: 'Got your answer' }
    }
    const to = (a.message.match(/^To: .*<([^>]+)>/m) ?? [])[1] ?? ''
    const scenario = (to.match(/\+(\w+)@/) ?? [])[1] ?? 'default'
    if (scenario === 'lost') throw new McpUncertainError('mock: connection reset before Fo received it')
    this.sends++
    const id = `mock-${randomToken(9)}`
    this.convos[id] = { ownerId: userId, scenario, to, polls: 0, messages: [{ role: 'user', text: a.message }], answered: false, status: 'working' }
    this.store.save()
    if (scenario === 'uncertain') throw new McpUncertainError('mock: response lost after Fo received it')
    return { status: 'working' as const, conversationId: id, progress: 'Fo is reading your request' }
  }

  async reply(userId: string, conversationId: string): Promise<FoReply> {
    const c = this.own(userId, conversationId)
    c.polls++
    const done = (): FoReply => {
      c.status = 'complete'
      if (c.scenario !== 'noevidence') {
        c.messages.push({ role: 'tool', text: `email.send → sent to ${c.to}`, meta: { toolName: 'email.send', to: c.to, messageId: `<${randomToken(6)}@mail.mock>`, status: 'sent' } })
      }
      if (c.scenario === 'confirm') {
        c.messages.push({ role: 'tool', text: 'Yes, early check-in from noon is no problem. A private airport transfer would be €35 per car.', meta: { toolName: 'email.inbox', from: c.to, subject: 'Re: Early check-in request' } })
      }
      if (c.scenario === 'declined') {
        c.messages.push({ role: 'tool', text: 'Unfortunately early check-in is not possible that day; rooms are ready at 3pm.', meta: { toolName: 'email.inbox', from: c.to } })
      }
      c.messages.push({ role: 'assistant', text: 'Done. I sent the email.' })
      return { status: 'complete', conversationId, reply: 'Done. I sent the email.' }
    }
    let out: FoReply
    if (c.scenario === 'timeout') out = { status: 'working', conversationId, progress: 'Still working on it' }
    else if (c.scenario === 'fail' && c.polls >= 1) {
      c.status = 'failed'
      out = { status: 'failed', conversationId, reply: 'I could not send it: your email account is not connected to Wajo.' }
    } else if (c.scenario === 'needs' && !c.answered) {
      c.status = 'needs_user'
      out = { status: 'needs_user', conversationId, progress: 'Should I CC your travel partner on this email?' }
    } else if (c.polls < 2) out = { status: 'working', conversationId, progress: 'Drafting the email' }
    else out = done()
    this.store.save()
    return out
  }

  async conversation(userId: string, conversationId: string) {
    return this.own(userId, conversationId).messages.map((m) => ({ role: m.role, text: m.text, meta: m.meta ?? {} }))
  }

  async conversations(userId: string) {
    return Object.entries(this.convos)
      .filter(([, c]) => c.ownerId === userId)
      .map(([conversationId]) => ({ conversationId }))
  }

  private own(userId: string, id: string) {
    const c = this.convos[id]
    if (!c || c.ownerId !== userId) throw new McpHttpError(404, 'unknown conversation')
    return c
  }
}
