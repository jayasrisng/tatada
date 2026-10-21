import {WajoPrintDelivery} from '../fo-print.ts'
import {PrintFiles} from '../print-files.ts'
import {FoChatService} from '../chat.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { Store } from '../store.ts'
import { MockFoAdapter } from '../fo.ts'
import { MockPrintDelivery, PrintService, type PrintJob } from '../print.ts'
import { createApp, OWNER_ID } from '../app.ts'
import { setup } from './helpers.ts'

const PRINTER = { email: 'tatada-desk@print.epsonconnect.com', plainPaper: 'letter', colorInk: 'yes', autoDuplex: 'yes', bodyPrintingOff: 'yes', senderApproved: 'yes' }
async function pdf(pages = 1, size: [number, number] = [612, 792], text = 'Lisbon') {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage(size).drawText(`${text} ${i + 1}`, { x: 72, y: 700 })
  doc.setCreationDate(new Date(0)); doc.setModificationDate(new Date(0))
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}
const body = (bytes: Buffer, over: Record<string, unknown> = {}) => ({ pdf: bytes.toString('base64'), document: { kind: 'card', title: 'Lisbon, Portugal', tripId: 'lisbon' }, request: {}, choices: {}, ...over })
function make(o: { store?: Store; fo?: boolean } = {}) {
  const store = o.store ?? Store.memory()
  let t = 1_000_000
  const service = new PrintService({ store, delivery: o.fo ? new WajoPrintDelivery({store,fo:new MockFoAdapter(store),chats:new FoChatService({store,fo:new MockFoAdapter(store)}),files:new PrintFiles(store,'test-secret-'.repeat(4),'http://localhost:5180')}) : new MockPrintDelivery(store), now: () => t })
  return { store, service, tick: (ms: number) => (t += ms), outbox: () => Object.values(((store.data.mock as Record<string, unknown>).printOutbox ?? {}) as Record<string, unknown>), behave: (b: string) => ((store.data.mock as Record<string, unknown>).printBehavior = b) }
}
const approve = (s: ReturnType<typeof make>, user: string, job: { id: string; contentHash: string }, key = `key-${job.id}`, extra = {}) => s.service.approve(user, job.id, { contentHash: job.contentHash, idempotencyKey: key, ...extra })

test('printer settings are validated and private to each account', () => {
  const s = make()
  assert.throws(() => s.service.setPrinter('a', { email: 'me@gmail.com' }), /Epson Connect address/)
  assert.throws(() => s.service.setPrinter('a', { email: 'desk=+bk@print.epsonconnect.com' }), /plain printer address/)
  const p = s.service.setPrinter('a', { ...PRINTER, email: 'Tatada-Desk@PRINT.epsonconnect.com', colorInk: 'maybe' })
  assert.equal(p.email, 'Tatada-Desk@print.epsonconnect.com')
  assert.equal(p.colorInk, 'unknown')
  assert.equal(s.service.printer('b'), undefined, 'another account sees nothing')
  s.service.removePrinter('a')
  assert.equal(s.service.printer('a'), undefined)
})

test('prepare validates the PDF and the plan, and the preview returns the exact stored bytes', async () => {
  const s = make()
  await assert.rejects(s.service.prepare('a', body(await pdf())), /printer's email address first/)
  s.service.setPrinter('a', PRINTER)
  await assert.rejects(s.service.prepare('a', body(Buffer.from('hello'))), /not a PDF/)
  await assert.rejects(s.service.prepare('a', body(await pdf(1, [595.28, 841.89]))), /aren't Letter/)
  const enc = Buffer.from((await pdf()).toString('latin1').replace('trailer\n<<', 'trailer\n<<\n/Encrypt 1 0 R'), 'latin1')
  await assert.rejects(s.service.prepare('a', body(enc)), /Password-protected/)
  await assert.rejects(s.service.prepare('a', body(await pdf(), { request: { size: '4x6' } })), /open print questions/)
  await assert.rejects(s.service.prepare('a', body(await pdf(), { request: { copies: 50 } })), /Copies must be 1–10/)
  const bytes = await pdf()
  const job = await s.service.prepare('a', body(bytes))
  assert.equal(job.status, 'awaiting_approval')
  assert.equal(job.pageCount, 1)
  assert.equal(job.address, PRINTER.email)
  const preview = s.service.pdf('a', job.id)
  assert.deepEqual(preview, bytes, 'preview = stored attachment')
  assert.equal(job.pdfHash, createHash('sha256').update(preview).digest('hex'))
  assert.throws(() => s.service.pdf('b', job.id), /not found/, 'other accounts cannot read it')
  assert.throws(() => s.service.get('b', job.id), /not found/)
})

test('supported and unsupported settings: grayscale and duplex use documented suffixes; copies and 4×6 need explicit choices', async () => {
  const s = make()
  s.service.setPrinter('a', PRINTER)
  const gray = await s.service.prepare('a', body(await pdf(2), { request: { color: 'grayscale', duplex: true } }))
  assert.equal(gray.address, 'tatada-desk=+bk+dl@print.epsonconnect.com')
  const onePage = await s.service.prepare('a', body(await pdf(1), { request: { duplex: true } }))
  assert.equal(onePage.address, PRINTER.email, 'no two-sided option for a single page')
  assert.match(onePage.plan.lines.find((l) => l.setting === 'sides')!.result, /one page/)
  const copies = await s.service.prepare('a', body(await pdf(3), { request: { copies: 3 }, choices: { copies: 'repeat-pages' } }))
  assert.equal(copies.plan.repeat, 3)
  await assert.rejects(s.service.prepare('a', body(await pdf(2), { request: { copies: 3 }, choices: { copies: 'repeat-pages' } })), /page count doesn't match/)
  const card = await s.service.prepare('a', body(await pdf(1), { request: { size: '4x6' }, choices: { fourBySix: 'layout-on-plain' } }))
  assert.equal(card.plan.layout, '4x6-on-plain')
  s.service.setPrinter('a', { ...PRINTER, autoDuplex: 'no' })
  await assert.rejects(s.service.prepare('a', body(await pdf(2), { request: { duplex: true } })), /open print questions/)
  const single = await s.service.prepare('a', body(await pdf(2), { request: { duplex: true }, choices: { duplex: 'single' } }))
  assert.equal(single.address, PRINTER.email, 'single-sided only when explicitly accepted')
})

test('approval binds to the exact job; edits invalidate it; repeated clicks never send twice', async () => {
  const s = make()
  s.service.setPrinter('a', PRINTER)
  const first = await s.service.prepare('a', body(await pdf(1, undefined, 'v1')))
  await assert.rejects(s.service.approve('a', first.id, { contentHash: 'wrong', idempotencyKey: 'k-000001' }), /changed/)
  const edited = await s.service.prepare('a', body(await pdf(1, undefined, 'v2')))
  assert.equal(s.service.get('a', first.id).status, 'cancelled', 'the earlier version is replaced')
  await assert.rejects(approve(s, 'a', first), /cancelled/)
  await assert.rejects(approve(s, 'b', edited), /not found/, 'other accounts cannot approve')
  const done = await approve(s, 'a', edited, 'click-0001')
  assert.equal(done.status, 'submitted')
  assert.equal(s.outbox().length, 1)
  for (let i = 0; i < 3; i++) assert.equal((await approve(s, 'a', edited, 'click-0001')).status, 'submitted')
  assert.equal(s.outbox().length, 1, 'same approval key: no resend')
  await assert.rejects(approve(s, 'a', edited, 'click-0002'), /submitted/)
  // The same PDF to the same printer again within 15 minutes needs explicit confirmation.
  const again = await s.service.prepare('a', body(await pdf(1, undefined, 'v2')))
  await assert.rejects(approve(s, 'a', again), /just submitted/)
  assert.equal((await approve(s, 'a', again, 'key-dup-ok-1', { allowDuplicate: true })).status, 'submitted')
  assert.equal(s.outbox().length, 2)
})

test('changing the printer after the preview requires a new preview', async () => {
  const s = make()
  s.service.setPrinter('a', PRINTER)
  const job = await s.service.prepare('a', body(await pdf()))
  s.service.setPrinter('a', { ...PRINTER, email: 'other-desk@print.epsonconnect.com' })
  await assert.rejects(approve(s, 'a', job), /printer settings changed/)
  assert.equal(s.outbox().length, 0)
})

test('timeouts and uncertain sends are never resent automatically; check reconciles', async () => {
  const s = make()
  s.service.setPrinter('a', PRINTER)
  s.behave('timeout_after_send')
  const job = await s.service.prepare('a', body(await pdf(1, undefined, 'uncertain')))
  const r = await approve(s, 'a', job, 'key-uncertain')
  assert.equal(r.status, 'send_uncertain')
  assert.equal((await approve(s, 'a', job, 'key-uncertain')).status, 'send_uncertain', 'retrying the same approval does nothing')
  await assert.rejects(approve(s, 'a', job, 'key-other-1'), /send uncertain/)
  assert.equal((await s.service.check('a', job.id)).status, 'submitted', 'found in the provider outbox')
  assert.equal(s.outbox().length, 1)

  s.behave('timeout_before_send')
  const lost = await s.service.prepare('a', body(await pdf(1, undefined, 'lost')))
  assert.equal((await approve(s, 'a', lost, 'key-lost-01')).status, 'send_uncertain')
  assert.equal((await s.service.check('a', lost.id)).status, 'send_uncertain', 'unknown stays unknown')
  s.behave('ok')
  const resent = await approve(s, 'a', lost, 'key-lost-02', { resendAfterUncertain: true })
  assert.equal(resent.status, 'submitted', 'resend only on an explicit request')
})

test('restart recovery turns an interrupted send into "uncertain" without sending', async () => {
  const s = make()
  s.service.setPrinter('a', PRINTER)
  const job = await s.service.prepare('a', body(await pdf()))
  ;(s.store.data.printJobs![job.id] as PrintJob).status = 'sending'
  const restarted = new PrintService({ store: s.store, delivery: new MockPrintDelivery(s.store) })
  restarted.recover()
  assert.equal(restarted.get('a', job.id).status, 'send_uncertain')
  assert.equal(s.outbox().length, 0)
})

test('Wajo PDF delivery requires a reachable hosted backend instead of sending a localhost link', async () => {
  const s = make({ fo: true })
  s.service.setPrinter(OWNER_ID, PRINTER)
  const job = await s.service.prepare(OWNER_ID, body(await pdf()))
  assert.match(job.blocker!, /hosted HTTPS backend/)
  assert.equal(job.sender.verified, false)
  await assert.rejects(approve(s, OWNER_ID, job), /hosted HTTPS backend/)
  assert.equal(s.service.get(OWNER_ID, job.id).status, 'awaiting_approval')
})

test('print API: owner-checked, per account, PDF served as application/pdf', async () => {
  const base = setup()
  const store = base.store
  const print = new PrintService({ store, delivery: new MockPrintDelivery(store) })
  const allowedHosts: string[] = []
  const app = createApp({ store, actions: base.service, print, appUrl: 'http://localhost:5173', secureCookies: false, owner: { allowedHosts, allowedOrigins: ['http://localhost:5173'] } })
  const server = createServer((req, res) => void app(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`
  allowedHosts.push(host) // owner mode serves only this computer
  const url = `http://${host}`
  const h = { origin: 'http://localhost:5173', 'x-tatada': '1', 'content-type': 'application/json' }
  try {
    assert.equal((await fetch(`${url}/api/print/printer`, { method: 'PUT', headers: { ...h, origin: 'https://evil.example' }, body: JSON.stringify(PRINTER) })).status, 403)
    assert.equal(((await (await fetch(`${url}/api/print/printer`)).json()) as { printer: unknown }).printer, null)
    assert.equal((await fetch(`${url}/api/print/printer`, { method: 'PUT', headers: h, body: JSON.stringify(PRINTER) })).status, 200)
    const bytes = await pdf()
    const created = await fetch(`${url}/api/print/jobs`, { method: 'POST', headers: h, body: JSON.stringify(body(bytes)) })
    assert.equal(created.status, 201)
    const { job } = await created.json() as { job: { id: string; contentHash: string } }
    const file = await fetch(`${url}/api/print/jobs/${job.id}/pdf`)
    assert.equal(file.headers.get('content-type'), 'application/pdf')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes, 'the preview URL serves the exact attachment')
    const ok = await fetch(`${url}/api/print/jobs/${job.id}/approve`, { method: 'POST', headers: h, body: JSON.stringify({ contentHash: job.contentHash, idempotencyKey: 'http-key-1' }) })
    assert.equal(((await ok.json()) as { job: { status: string } }).job.status, 'submitted')
    const second = await fetch(`${url}/api/print/jobs/${job.id}/approve`, { method: 'POST', headers: h, body: JSON.stringify({ contentHash: job.contentHash, idempotencyKey: 'http-key-2' }) })
    assert.equal(second.status, 409)
    assert.equal(((await second.json()) as { code: string }).code, 'submitted')
  } finally { await new Promise<void>((r) => server.close(() => r())) }
})

test('two signed-in accounts never see each other\'s printer or print jobs', async () => {
  const base = setup()
  const store = base.store
  const print = new PrintService({ store, delivery: new MockPrintDelivery(store) })
  const ORIGIN = 'http://localhost:5173'
  const app = createApp({ store, actions: base.service, print, appUrl: ORIGIN, secureCookies: false, allowedOrigin: ORIGIN })
  const server = createServer((req, res) => void app(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const signIn = async () => {
    const r = await fetch(`${url}/api/session`, { method: 'POST', headers: { origin: ORIGIN, 'x-tatada': '1' } })
    return r.headers.get('set-cookie')!.split(';')[0]
  }
  try {
    const [a, b] = [await signIn(), await signIn()]
    const h = (cookie: string) => ({ cookie, origin: ORIGIN, 'x-tatada': '1', 'content-type': 'application/json' })
    assert.equal((await fetch(`${url}/api/print/printer`)).status, 401, 'signed out: nothing')
    await fetch(`${url}/api/print/printer`, { method: 'PUT', headers: h(a), body: JSON.stringify(PRINTER) })
    assert.equal(((await (await fetch(`${url}/api/print/printer`, { headers: h(b) })).json()) as { printer: unknown }).printer, null)
    const { job } = await (await fetch(`${url}/api/print/jobs`, { method: 'POST', headers: h(a), body: JSON.stringify(body(await pdf())) })).json() as { job: { id: string; contentHash: string } }
    assert.equal((await fetch(`${url}/api/print/jobs/${job.id}/pdf`, { headers: h(b) })).status, 404)
    assert.equal((await fetch(`${url}/api/print/jobs/${job.id}/approve`, { method: 'POST', headers: h(b), body: JSON.stringify({ contentHash: job.contentHash, idempotencyKey: 'other-acct-1' }) })).status, 404)
    assert.deepEqual(((await (await fetch(`${url}/api/print/jobs`, { headers: h(b) })).json()) as { jobs: unknown[] }).jobs, [])
    assert.equal((await fetch(`${url}/api/print/printer`, { method: 'PUT', headers: { ...h(a), origin: 'https://evil.example' }, body: JSON.stringify(PRINTER) })).status, 403)
  } finally { await new Promise<void>((r) => server.close(() => r())) }
})

test('direct-print preference is account-scoped and retained in the stored printer profile', () => {
 const s=make()
 s.service.setPrinter('a',{...PRINTER,directPrint:true})
 assert.equal(s.service.printer('a')?.directPrint,true)
 assert.equal(s.service.printer('b'),undefined)
 const reopened=new PrintService({store:s.store,delivery:new MockPrintDelivery(s.store)})
 assert.equal(reopened.printer('a')?.directPrint,true)
 reopened.setPrinter('a',{...PRINTER,directPrint:false})
 assert.equal(reopened.printer('a')?.directPrint,false)
})

test('flight and hotel print jobs retain their document kind through approval and delivery', async () => {
  const s = make(); s.service.setPrinter('a', PRINTER)
  for (const kind of ['flights', 'hotels', 'packing'] as const) {
    const job = await s.service.prepare('a', body(await pdf(1, undefined, kind), {document:{kind,title:kind,tripId:'sydney'},request:{document:kind}}))
    assert.equal(job.document.kind, kind); assert.equal(job.request.document, kind)
    assert.equal((await approve(s, 'a', job)).status, 'submitted')
  }
  assert.equal(s.outbox().length, 3)
})

test('a preferred From account must match the authorized Gmail sender, including after preview',async()=>{
 const store=Store.memory(),delivery={mode:'gmail' as const,sender:async()=>({kind:'gmail' as const,verified:true,label:'authorized@example.test',ok:true}),send:async()=>({ok:true as const,ref:'fixture'})},service=new PrintService({store,delivery})
 service.setPrinter('a',{...PRINTER,senderEmail:'preferred@example.test'})
 const blocked=await service.prepare('a',body(await pdf()))
 assert.match(blocked.blocker!,/Connect preferred/)
 service.setPrinter('a',{...PRINTER,senderEmail:'authorized@example.test'})
 const ready=await service.prepare('a',body(await pdf()));assert.equal(ready.blocker,undefined)
 service.setPrinter('a',{...PRINTER,senderEmail:'different@example.test'})
 await assert.rejects(service.approve('a',ready.id,{contentHash:ready.contentHash,idempotencyKey:'account-change'}),/preferred sending account changed/)
})

test('combined All documents retain normal preview and approval protection', async () => {
 const s=make();s.service.setPrinter('a',PRINTER)
 const bytes=await pdf(5), job=await s.service.prepare('a',body(bytes,{document:{kind:'all',title:'My whole trip',tripId:'lisbon'},request:{document:'all'}}))
 assert.equal(job.document.kind,'all');assert.equal(job.pageCount,5);assert.equal(job.status,'awaiting_approval');assert.equal(s.outbox().length,0)
 assert.deepEqual(s.service.pdf('a',job.id),bytes)
})

test('concurrent approval of one exact PDF sends once, including distinct keys', async () => {
  for (const sameKey of [true, false]) {
    const s = make(); s.service.setPrinter('a', PRINTER)
    const job = await s.service.prepare('a', body(await pdf()))
    const results = await Promise.allSettled([approve(s,'a',job,'concurrent-one'),approve(s,'a',job,sameKey?'concurrent-one':'concurrent-two')])
    assert.equal(s.outbox().length,1)
    assert.equal(s.service.get('a',job.id).attempts,1)
    assert.equal(results[0].status,'fulfilled')
    assert.equal(results[1].status,sameKey?'fulfilled':'rejected')
  }
})

test('changed paper and capability settings invalidate a prepared approval', async () => {
  for (const change of [{plainPaper:'a4'},{bodyPrintingOff:'no'},{colorInk:'no'}]) {
    const s=make();s.service.setPrinter('a',PRINTER)
    const job=await s.service.prepare('a',body(await pdf(),{request:{color:'color'}}))
    s.service.setPrinter('a',{...PRINTER,...change})
    await assert.rejects(approve(s,'a',job),/settings changed/)
    assert.equal(s.outbox().length,0)
  }
})
