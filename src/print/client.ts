import { api } from '../state/server'
import { apiUrl, sessionHeaders, usesBearer } from '../config'
import type { PlanLine, PrintChoices, PrintPlan, PrintRequest, PrinterProfile } from './plan'

export type PrintStatus = 'awaiting_approval' | 'sending' | 'submitted' | 'send_uncertain' | 'blocked' | 'failed' | 'cancelled'
export interface Sender { kind: 'mock' | 'fo' | 'gmail'; verified: boolean; label: string; ok?: boolean; reason?: string }
export interface PrintJob {
  id: string
  createdAt: number
  updatedAt: number
  document: { kind: 'card' | 'journal' | 'flights' | 'hotels' | 'packing' | 'all'; title: string; tripId?: string }
  pdfHash: string
  bytes: number
  pageCount: number
  request: PrintRequest
  choices: PrintChoices
  plan: PrintPlan & { lines: PlanLine[] }
  printer: string
  address: string
  sender: Sender
  blocker?: string
  contentHash: string
  ref: string
  status: PrintStatus
  attempts: number
  events: { at: number; text: string }[]
  error?: string
}

export const getPrinter = () => api<{ printer: PrinterProfile | null }>('/api/print/printer').then((r) => r.printer)
export const savePrinter = (p: Omit<PrinterProfile, 'updatedAt'>) => api<{ printer: PrinterProfile }>('/api/print/printer', { method: 'PUT', json: p }).then((r) => r.printer)
export const removePrinter = () => api('/api/print/printer', { method: 'DELETE' })
export const getSender = () => api<{ delivery: 'mock' | 'fo' | 'gmail'; sender: Sender }>('/api/print/sender')
export const listJobs = () => api<{ jobs: PrintJob[] }>('/api/print/jobs').then((r) => r.jobs)

const toBase64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }
export const prepareJob = (body: { pdf: Uint8Array; document: PrintJob['document']; request: PrintRequest; choices: PrintChoices }) =>
  api<{ job: PrintJob }>('/api/print/jobs', { method: 'POST', json: { ...body, pdf: toBase64(body.pdf) }, signal: AbortSignal.timeout(60_000) }).then((r) => r.job)

/** The stored PDF exactly as it will be attached. */
export async function jobPdf(id: string): Promise<Blob> {
  const r = await fetch(apiUrl(`/api/print/jobs/${id}/pdf`), { credentials: usesBearer ? 'omit' : 'include', headers: sessionHeaders(), signal: AbortSignal.timeout(30_000) })
  if (!r.ok || r.headers.get('content-type') !== 'application/pdf') throw new Error('The preview could not be loaded.')
  return r.blob()
}

/** One approval key per job, kept across reloads, so repeated clicks or refreshes never send twice. */
export function approvalKey(jobId: string, fresh = false) {
  const k = `tatada:print-approval:${jobId}`
  let key = fresh ? null : sessionStorage.getItem(k)
  if (!key) { key = `${jobId}-${crypto.randomUUID()}`; sessionStorage.setItem(k, key) }
  return key
}
export const approveJob = (job: PrintJob, o: { allowDuplicate?: boolean; resendAfterUncertain?: boolean } = {}) =>
  api<{ job: PrintJob }>(`/api/print/jobs/${job.id}/approve`, { method: 'POST', json: { contentHash: job.contentHash, idempotencyKey: approvalKey(job.id, !!o.resendAfterUncertain), ...o }, signal: AbortSignal.timeout(60_000) }).then((r) => r.job)
export const checkJob = (id: string) => api<{ job: PrintJob }>(`/api/print/jobs/${id}/check`, { method: 'POST' }).then((r) => r.job)
export const cancelJob = (id: string) => api<{ job: PrintJob }>(`/api/print/jobs/${id}/cancel`, { method: 'POST' }).then((r) => r.job)

export const getJob=(id:string)=>api<{job:PrintJob}>(`/api/print/jobs/${id}`).then(r=>r.job)
