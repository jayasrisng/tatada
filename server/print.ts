import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { canonical, randomToken, sha256 } from './crypto.ts'
import { foCapabilities } from './capabilities.ts'
import type { FoAdapter } from './fo.ts'
import type { Store } from './store.ts'
import { EPSON_EMAIL, planPrint, printerAddress, type Answer, type PrintChoices, type PrintPlan, type PrintRequest, type PrinterProfile } from '../src/print/plan.ts'

/*
 * Print jobs for Epson Connect Email Print, owned by the server.
 *
 *   awaiting_approval ─approve(hash, key)→ sending → submitted
 *                                            ├→ send_uncertain → (check) → submitted
 *                                            └→ failed | blocked
 *   plus cancelled (by the owner, or replaced by an edited version)
 *
 *  - The PDF is stored here; the preview reads these exact bytes back.
 *  - Approval binds to sha256 of {PDF hash, printer address, sender, plan, copies}.
 *    Any edit makes a new job; the old one is cancelled and its hash no longer approves.
 *  - The job is saved as "sending" before delivery, so a crash reads as uncertain
 *    after restart. Uncertain jobs are never resent automatically.
 *  - Repeated approvals with the same idempotency key return the job unchanged;
 *    the same PDF to the same printer within 15 minutes needs explicit confirmation.
 *  - "submitted" means the email was handed over. Nothing here claims a page printed.
 */

export type PrintStatus = 'awaiting_approval' | 'sending' | 'submitted' | 'send_uncertain' | 'blocked' | 'failed' | 'cancelled'
export interface Sender { kind: 'mock' | 'fo' | 'gmail'; verified: boolean; label: string }
export interface SenderCheck extends Sender { ok: boolean; reason?: string }

export interface PrintJob {
  id: string
  ownerId: string
  createdAt: number
  updatedAt: number
  document: { kind: 'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all'; title: string; tripId?: string }
  pdf?: string
  pdfHash: string
  bytes: number
  pageCount: number
  request: PrintRequest
  choices: PrintChoices
  plan: PrintPlan
  printer: string
  address: string
  sender: Sender
  /** Why this job can't be sent (e.g. Fo can't attach files). Approval is refused while set. */
  blocker?: string
  contentHash: string
  dedupeKey: string
  ref: string
  status: PrintStatus
  approval?: { contentHash: string; idempotencyKey: string; at: number }
  attempts: number
  events: { at: number; text: string }[]
  error?: string
  deliveryRef?: string
}
export type PublicPrintJob = Omit<PrintJob, 'ownerId' | 'pdf' | 'dedupeKey'>

export class PrintError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code }
}
export class PrintUncertain extends Error {}

export interface PrintDelivery {
  readonly mode: 'mock' | 'fo' | 'gmail'
  sender(userId: string): Promise<SenderCheck>
  /** Definite failures return ok:false; anything that might have sent throws PrintUncertain. */
  send(userId: string, job: PrintJob, pdf: Buffer): Promise<{ ok: true; ref: string } | { ok: false; reason: string; blocked?: boolean }>
  reconcile?(userId: string, job: PrintJob): Promise<'submitted' | 'unknown'>
}

const MAX_PDF_BYTES = 4_000_000, MAX_PAGES = 60, DUPLICATE_WINDOW = 15 * 60_000, KEEP_JOBS = 20, KEEP_PDFS = 5
const answer = (v: unknown): Answer => (v === 'yes' || v === 'no' ? v : 'unknown')
const DOC_TITLE = /^[^\n<>]{1,120}$/

export class PrintService {
  private store: Store
  private delivery: PrintDelivery
  private now: () => number
  constructor(o: { store: Store; delivery: PrintDelivery; now?: () => number }) {
    this.store = o.store; this.delivery = o.delivery; this.now = o.now ?? Date.now
  }
  get mode() { return this.delivery.mode }
  private get printers() { return (this.store.data.printers ??= {}) as Record<string, PrinterProfile> }
  private get jobs() { return (this.store.data.printJobs ??= {}) as Record<string, PrintJob> }

  /* ── printer settings, private to each account ── */
  printer(userId: string): PrinterProfile | undefined { return this.printers[userId] }
  setPrinter(userId: string, input: Record<string, unknown>): PrinterProfile {
    const email = typeof input.email === 'string' ? input.email.trim() : ''
    if (!EPSON_EMAIL.test(email)) throw new PrintError(400, 'Enter the printer\'s Epson Connect address, like name@print.epsonconnect.com.')
    if (/=\+/.test(email)) throw new PrintError(400, 'Enter the plain printer address; Tatada adds Epson\'s options itself.')
    const senderEmail=typeof input.senderEmail==='string'?input.senderEmail.trim():undefined
    if(senderEmail&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)||senderEmail.length>254))throw new PrintError(400,'Use a valid sending email.')
    const plain = input.plainPaper === 'letter' || input.plainPaper === 'a4' ? input.plainPaper : 'unknown'
    const at = email.lastIndexOf('@')
    const profile: PrinterProfile = { ...(senderEmail?{senderEmail}:{}), directPrint: input.directPrint === true, email: `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`, plainPaper: plain, colorInk: answer(input.colorInk), autoDuplex: answer(input.autoDuplex), bodyPrintingOff: answer(input.bodyPrintingOff), senderApproved: answer(input.senderApproved), updatedAt: this.now() }
    this.store.update((d) => { ((d.printers ??= {}) as Record<string, PrinterProfile>)[userId] = profile })
    return profile
  }
  removePrinter(userId: string) { this.store.update((d) => { delete ((d.printers ??= {}) as Record<string, PrinterProfile>)[userId] }) }
  sender(userId: string) { return this.delivery.sender(userId) }

  /* ── jobs ── */
  private own(userId: string, id: string) {
    const job = this.jobs[id]
    if (!job || job.ownerId !== userId) throw new PrintError(404, 'Print job not found')
    return job
  }
  view(job: PrintJob): PublicPrintJob { const { ownerId: _o, pdf: _p, dedupeKey: _d, ...rest } = job; return rest }
  get(userId: string, id: string) { return this.view(this.own(userId, id)) }
  list(userId: string) { return Object.values(this.jobs).filter((j) => j.ownerId === userId).sort((a, b) => b.createdAt - a.createdAt).slice(0, KEEP_JOBS).map((j) => this.view(j)) }
  pdf(userId: string, id: string): Buffer {
    const job = this.own(userId, id)
    if (!job.pdf) throw new PrintError(410, 'This PDF is no longer kept. Prepare it again.')
    return Buffer.from(job.pdf, 'base64')
  }

  async prepare(userId: string, body: Record<string, unknown>): Promise<PublicPrintJob> {
    const printer = this.printer(userId)
    if (!printer) throw new PrintError(409, 'Add your Epson printer\'s email address first.', 'no_printer')
    const doc = (body.document ?? {}) as Record<string, unknown>
    if (doc.kind !== 'card' && doc.kind !== 'journal' && doc.kind !== 'flights' && doc.kind !== 'hotels' && doc.kind !== 'packing' && doc.kind !== 'all') throw new PrintError(400, 'Unknown document')
    if (typeof doc.title !== 'string' || !DOC_TITLE.test(doc.title)) throw new PrintError(400, 'Invalid document title')
    const b64 = typeof body.pdf === 'string' ? body.pdf : ''
    if (!b64 || b64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new PrintError(400, 'The PDF is missing or larger than 4 MB.')
    const bytes = Buffer.from(b64, 'base64')
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new PrintError(400, 'That file is not a PDF.')
    let parsed: PDFDocument
    try { parsed = await PDFDocument.load(bytes, { updateMetadata: false }) }
    catch (e) { throw new PrintError(400, /encrypt/i.test((e as Error).message) ? 'Password-protected PDFs can\'t be printed by email.' : 'The PDF could not be read.') }
    const pageCount = parsed.getPageCount()
    if (pageCount < 1 || pageCount > MAX_PAGES) throw new PrintError(400, `PDFs must have 1–${MAX_PAGES} pages.`)

    const request = cleanRequest(body.request), choices = cleanChoices(body.choices)
    const draft = planPrint(request, printer, choices)
    if (pageCount % draft.repeat) throw new PrintError(400, 'The page count doesn\'t match the requested copies.')
    const plan = planPrint(request, printer, choices, pageCount / draft.repeat)
    if (plan.questions.length) throw new PrintError(400, 'Answer the open print questions first.', 'questions')
    // The PDF must really be what the plan says (paper size), not just claim it.
    const [ew, eh] = plan.pageSize === 'a4' ? [595.28, 841.89] : [612, 792]
    if (!parsed.getPages().every((p) => Math.abs(p.getWidth() - ew) < 2 && Math.abs(p.getHeight() - eh) < 2)) throw new PrintError(400, `The PDF pages aren't ${plan.pageSize === 'a4' ? 'A4' : 'Letter'} as planned.`)

    const pdfHash = createHash('sha256').update(bytes).digest('hex')
    const check = await this.delivery.sender(userId)
    const sender: Sender = { kind: check.kind, verified: check.verified, label: check.label }
    const address = printerAddress(printer.email, plan.suffix)
    const copies = request.copies ?? 1
    const contentHash = sha256(canonical({ pdfHash, address, sender, plan, copies }))
    const t = this.now()
    const job: PrintJob = {
      id: randomToken(12), ownerId: userId, createdAt: t, updatedAt: t,
      document: { kind: doc.kind, title: doc.title, tripId: typeof doc.tripId === 'string' ? doc.tripId.slice(0, 100) : undefined },
      pdf: b64, pdfHash, bytes: bytes.length, pageCount, request, choices, plan, printer: printer.email, address, sender,
      blocker: check.ok ? (printer.senderEmail&&check.kind==='gmail'&&printer.senderEmail.toLowerCase()!==check.label.toLowerCase()?`Connect ${printer.senderEmail} in print settings.`:undefined) : check.reason ?? 'Sending isn\'t available.',
      contentHash, dedupeKey: sha256(`${pdfHash}|${address}`), ref: randomToken(5), status: 'awaiting_approval', attempts: 0,
      events: [{ at: t, text: 'Prepared. Waiting for your approval.' }],
    }
    this.store.update((d) => {
      const jobs = (d.printJobs ??= {}) as Record<string, PrintJob>
      // An edit replaces the previous unapproved version of the same document.
      for (const old of Object.values(jobs)) if (old.ownerId === userId && old.status === 'awaiting_approval' && old.document.kind === job.document.kind && old.document.tripId === job.document.tripId) {
        old.status = 'cancelled'; old.updatedAt = t; old.events.push({ at: t, text: 'Replaced by an edited version; this approval no longer applies.' })
      }
      jobs[job.id] = job
      this.prune(jobs, userId)
    })
    return this.view(job)
  }

  private prune(jobs: Record<string, PrintJob>, userId: string) {
    const mine = Object.values(jobs).filter((j) => j.ownerId === userId).sort((a, b) => b.createdAt - a.createdAt)
    mine.slice(KEEP_PDFS).forEach((j) => { if (j.status !== 'sending' && j.status !== 'send_uncertain') delete j.pdf })
    mine.slice(KEEP_JOBS * 2).forEach((j) => { if (j.status !== 'sending' && j.status !== 'send_uncertain') delete jobs[j.id] })
  }

  async approve(userId: string, id: string, input: Record<string, unknown>): Promise<PublicPrintJob> {
    const job = this.own(userId, id)
    const key = typeof input.idempotencyKey === 'string' && /^[\w-]{8,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : ''
    if (!key) throw new PrintError(400, 'Missing approval key')
    // A repeated click, retry or refresh with the same approval returns the job; nothing is resent.
    if (job.approval?.idempotencyKey === key) return this.view(job)
    const resend = input.resendAfterUncertain === true && job.status === 'send_uncertain'
    if (job.status !== 'awaiting_approval' && !resend) throw new PrintError(409, `This print job is ${job.status.replace(/_/g, ' ')}.`, job.status)
    if (input.contentHash !== job.contentHash) throw new PrintError(409, 'The document or settings changed. Review the new preview and approve that.', 'changed')
    if (job.blocker) throw new PrintError(409, job.blocker, 'blocked')
    const printer = this.printer(userId)
    if (!printer || printerAddress(printer.email, job.plan.suffix) !== job.address) throw new PrintError(409, 'Your printer settings changed since this preview. Prepare it again.', 'changed')
    const sender = await this.delivery.sender(userId)
    if(printer.senderEmail&&sender.kind==='gmail'&&printer.senderEmail.toLowerCase()!==sender.label.toLowerCase())throw new PrintError(409,'The preferred sending account changed. Prepare the print again.','changed')
    if (!sender.ok || sender.kind !== job.sender.kind || sender.label !== job.sender.label) throw new PrintError(409, sender.ok ? 'The sending account changed since this preview. Prepare it again.' : sender.reason ?? 'Sending isn\'t available.', 'changed')
    const t = this.now()
    const twin = Object.values(this.jobs).find((j) => j.id !== job.id && j.ownerId === userId && j.dedupeKey === job.dedupeKey && (j.status === 'sending' || j.status === 'send_uncertain' || (j.status === 'submitted' && t - j.updatedAt < DUPLICATE_WINDOW)))
    if (twin && input.allowDuplicate !== true) throw new PrintError(409, `This exact document was ${twin.status === 'submitted' ? 'just submitted' : 'already sent (status unknown)'} to this printer. Approve again only if you want another print.`, 'duplicate')
    const pdf = job.pdf
    if (!pdf) throw new PrintError(410, 'This PDF is no longer kept. Prepare it again.')

    this.store.update(() => {
      job.status = 'sending'; job.approval = { contentHash: job.contentHash, idempotencyKey: key, at: t }; job.attempts++; job.updatedAt = t
      job.events.push({ at: t, text: resend ? 'You chose to send again after an uncertain attempt.' : 'Approved. Sending…' })
    })
    await this.store.flush() // persisted as "sending" before any side effect
    try {
      const r = await this.delivery.send(userId, job, Buffer.from(pdf, 'base64'))
      this.store.update(() => {
        job.updatedAt = this.now()
        if (r.ok) { job.status = 'submitted'; job.deliveryRef = r.ref; job.events.push({ at: job.updatedAt, text: 'Email submitted to the printer address. Not proof of a printed page.' }) }
        else { job.status = r.blocked ? 'blocked' : 'failed'; job.error = r.reason; job.events.push({ at: job.updatedAt, text: `Not sent: ${r.reason}` }) }
      })
    } catch (e) {
      this.store.update(() => {
        job.updatedAt = this.now(); job.status = 'send_uncertain'; job.error = e instanceof PrintUncertain ? e.message : 'The send was interrupted.'
        job.events.push({ at: job.updatedAt, text: 'We don\'t know whether the email went out. It won\'t be resent automatically.' })
      })
    }
    return this.view(job)
  }

  cancel(userId: string, id: string) {
    const job = this.own(userId, id)
    if (!['awaiting_approval', 'failed', 'blocked'].includes(job.status)) throw new PrintError(409, `A ${job.status.replace(/_/g, ' ')} job can't be cancelled.`)
    this.store.update(() => { job.status = 'cancelled'; job.updatedAt = this.now(); job.events.push({ at: job.updatedAt, text: 'Cancelled.' }) })
    return this.view(job)
  }

  /** Re-check an uncertain send against the delivery provider. Never resends. */
  async check(userId: string, id: string) {
    const job = this.own(userId, id)
    if (job.status !== 'send_uncertain' || !this.delivery.reconcile) return this.view(job)
    const found = await this.delivery.reconcile(userId, job)
    if (found === 'submitted') this.store.update(() => { job.status = 'submitted'; job.updatedAt = this.now(); job.events.push({ at: job.updatedAt, text: 'Found the earlier send: the email was submitted.' }) })
    return this.view(job)
  }

  /** After a restart, anything caught mid-send is uncertain, not retried. */
  recover() {
    const stuck = Object.values(this.jobs).filter((j) => j.status === 'sending')
    if (!stuck.length) return
    this.store.update(() => { for (const j of stuck) { j.status = 'send_uncertain'; j.updatedAt = this.now(); j.events.push({ at: j.updatedAt, text: 'Tatada restarted during sending. Not resent; check before trying again.' }) } })
  }
}

function cleanRequest(v: unknown): PrintRequest {
  const r = (v ?? {}) as Record<string, unknown>
  const out: PrintRequest = {}
  if (r.color === 'color' || r.color === 'grayscale') out.color = r.color
  if (r.size === 'letter' || r.size === 'a4' || r.size === '4x6') out.size = r.size
  if (typeof r.duplex === 'boolean') out.duplex = r.duplex
  if (typeof r.copies === 'number' && Number.isInteger(r.copies)) { if (r.copies < 1 || r.copies > 10) throw new PrintError(400, 'Copies must be 1–10.'); out.copies = r.copies }
  if (r.document === 'card' || r.document === 'journal' || r.document === 'flights' || r.document === 'hotels' || r.document === 'packing' || r.document === 'all') out.document = r.document
  return out
}
function cleanChoices(v: unknown): PrintChoices {
  const c = (v ?? {}) as Record<string, unknown>
  const out: PrintChoices = {}
  if (c.fourBySix === 'layout-on-plain') out.fourBySix = c.fourBySix
  if (c.duplex === 'single' || c.duplex === 'try') out.duplex = c.duplex
  if (c.copies === 'repeat-pages' || c.copies === 'single') out.copies = c.copies
  return out
}

/* ── delivery ── */

/** Development stand-in: records the email locally. Nothing leaves the computer. */
export class MockPrintDelivery implements PrintDelivery {
  readonly mode = 'mock' as const
  private store: Store
  constructor(store: Store) { this.store = store }
  private get mock() { return this.store.data.mock as { printOutbox?: Record<string, { to: string; pdfHash: string; at: number; ref: string }>; printBehavior?: string } }
  async sender(): Promise<SenderCheck> { return { kind: 'mock', verified: true, label: 'Mock sender (development: no email leaves this computer)', ok: true } }
  async send(_userId: string, job: PrintJob) {
    const behavior = this.mock.printBehavior ?? 'ok'
    if (behavior === 'reject') return { ok: false as const, reason: 'Mock provider rejected the email.' }
    if (behavior === 'timeout_before_send') throw new PrintUncertain('Mock provider timed out.')
    this.store.update(() => { (this.mock.printOutbox ??= {})[job.ref] = { to: job.address, pdfHash: job.pdfHash, at: Date.now(), ref: job.ref } })
    if (behavior === 'timeout_after_send') throw new PrintUncertain('Mock provider timed out after accepting.')
    return { ok: true as const, ref: `mock-${job.ref}` }
  }
  async reconcile(_userId: string, job: PrintJob) { return this.mock.printOutbox?.[job.ref] ? 'submitted' as const : 'unknown' as const }
}

/**
 * Fo delivery. Sends only if Fo's own tool schema shows a way to attach a file.
 * Today ask_fo accepts text only, so this reports that blocker and sends nothing.
 */
export class FoPrintDelivery implements PrintDelivery {
  readonly mode = 'fo' as const
  private fo: FoAdapter
  constructor(fo: FoAdapter) { this.fo = fo }
  async sender(userId: string): Promise<SenderCheck> {
    if (!this.fo.connected(userId)) return { kind: 'fo', verified: false, label: 'Fo not connected', ok: false, reason: 'Connect Fo for this account first.' }
    try {
      const caps = foCapabilities(await this.fo.tools(userId))
      const label = caps.senderVisible ? 'Fo-connected email account' : 'the email account connected to your Wajo account (Tatada can\'t see which)'
      return { kind: 'fo', verified: false, label, ok: caps.attachments, reason: caps.attachments ? undefined : `Fo can't attach files yet: ${caps.reason}` }
    } catch (e) { return { kind: 'fo', verified: false, label: 'Fo unavailable', ok: false, reason: `Couldn't check Fo: ${(e as Error).message.slice(0, 120)}` } }
  }
  async send(userId: string) {
    const check = await this.sender(userId)
    // Even if a future schema allows files, Tatada doesn't send until that path is built and verified.
    return { ok: false as const, blocked: true, reason: check.reason ?? 'Fo attachment delivery isn\'t implemented in Tatada yet.' }
  }
}
