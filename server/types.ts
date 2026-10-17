/* Server-owned action records. The browser only ever sees `PublicAction`. */

export type Intent = 'early_checkin' | 'delay'

export interface ActionDraft {
  tripId: string
  checklistItemId?: string
  intent: Intent
  to: string
  toName: string
  subject: string
  body: string
  transferQuote: boolean
  /** Human-readable list of personal details the email reveals. */
  shared: string[]
}

export type ActionStatus =
  | 'proposed' // drafted, waiting for the owner's approval
  | 'approved' // approved, queued to send
  | 'sending' // ask_fo in flight (a crash here means "uncertain")
  | 'send_uncertain' // we don't know whether Fo got it: reconcile before any resend
  | 'waiting' // Fo has it; polling for progress
  | 'needs_input' // Fo asked the owner something; we never answer for them
  | 'answering' // the owner's answer is being delivered
  | 'verifying' // Fo says done; checking its transcript for evidence
  | 'verified' // evidence found
  | 'unverified' // Fo claims done, but no evidence
  | 'failed'
  | 'timeout'
  | 'cancelled'

export const TERMINAL: ActionStatus[] = ['verified', 'unverified', 'failed', 'timeout', 'cancelled']

export type Outcome = 'request_sent' | 'checkin_confirmed' | 'checkin_declined' | 'reply_received' | 'heads_up_sent'

export interface Evidence {
  kind: 'email_sent' | 'email_reply'
  detail: string
  messageId?: string
  from?: string
}

export interface ActionResult {
  outcome: Outcome
  summary: string
  evidence: Evidence[]
  /** A price the stay quoted. Quotes are never bookings. */
  transferQuote?: string
  itemDone: boolean
  itemNote: string
}

export interface ServerAction {
  id: string
  ownerId: string
  createdAt: number
  updatedAt: number
  provider: 'live' | 'mock'
  draft: ActionDraft
  /** Short reference embedded in the Fo request, used to reconcile uncertain sends. */
  ref: string
  /** The exact text Fo receives. Derived from the draft and ref. */
  foMessage: string
  /** Hash of everything the owner approves: message, recipient, shared data, trip. */
  contentHash: string
  /** Content without the ref, used to stop the same email being sent twice. */
  dedupeKey: string
  status: ActionStatus
  approval?: { contentHash: string; idempotencyKey: string; at: number }
  conversationId?: string
  progress: { at: number; text: string }[]
  question?: string
  answers: { at: number; text: string }[]
  pendingAnswer?: string
  sendAttempts: number
  reconcileAttempts: number
  pollErrors: number
  retryRequested?: boolean
  deadline?: number
  nextRunAt?: number
  error?: string
  retryable?: boolean
  result?: ActionResult
}

export type PublicAction = Omit<ServerAction, 'ownerId' | 'dedupeKey' | 'nextRunAt' | 'reconcileAttempts' | 'pollErrors'>

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scope?: string
}
