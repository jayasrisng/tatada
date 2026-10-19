import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { go, hashQuery } from '../state/ui'
import { browserOnly } from '../config'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, TODAY, TopBar } from '../components/ui'
import { EPSON_EMAIL, parsePrintRequest, planPrint, printerAddress, type Answer, type PrintChoices, type PrintRequest, type PrinterProfile } from '../print/plan'
import { approveJob, cancelJob, checkJob, getPrinter, getSender, jobPdf, listJobs, prepareJob, removePrinter, savePrinter, type PrintJob, type Sender } from '../print/client'

const UNKNOWN_PRINTER: Omit<PrinterProfile, 'email' | 'updatedAt'> = { plainPaper: 'unknown', colorInk: 'unknown', autoDuplex: 'unknown', bodyPrintingOff: 'unknown', senderApproved: 'unknown' }
const HOW = { pdf: 'in the PDF', address: 'Epson address option', printer: 'printer setting', not_possible: 'not possible' } as const
const STEPS = ['preparing', 'awaiting approval', 'sending', 'email submitted'] as const

/**
 * One print workflow for the print icon and for "print …" requests in Magic.
 * Nothing is emailed until the exact PDF shown here is approved.
 */
export function PrintView({ id, doc }: { id: string; doc?: string }) {
  const { state } = useStore()
  const trip = state.trips.find((t) => t.id === id)
  const ask = hashQuery().get('ask') ?? ''
  const [text, setText] = useState(ask)
  const parsed = useMemo(() => parsePrintRequest(text), [text])
  const [kind, setKind] = useState<'card' | 'journal'>(doc === 'journal' || parsed.document === 'journal' ? 'journal' : 'card')
  const [request, setRequest] = useState<PrintRequest>(parsed)
  const [choices, setChoices] = useState<PrintChoices>({})
  const [printer, setPrinter] = useState<PrinterProfile | null | undefined>(browserOnly ? null : undefined)
  const [editingPrinter, setEditingPrinter] = useState(false)
  const [sender, setSender] = useState<Sender | null>(null)
  const [job, setJob] = useState<PrintJob | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [localPages, setLocalPages] = useState(0)
  const [lossy, setLossy] = useState(false)
  const [busy, setBusy] = useState(''), [problem, setProblem] = useState(''), [confirmDup, setConfirmDup] = useState(false)
  const url = useRef('')
  const setPreview = (blob: Blob | null) => { if (url.current) URL.revokeObjectURL(url.current); url.current = blob ? URL.createObjectURL(blob) : ''; setPreviewUrl(url.current) }
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  useEffect(() => { setRequest(parsed); setChoices({}); if (parsed.document) setKind(parsed.document) }, [parsed])
  useEffect(() => {
    if (browserOnly) return
    getPrinter().then((p) => { setPrinter(p); setEditingPrinter(!p) }, (e: Error) => { setPrinter(null); setProblem(e.message) })
    getSender().then((r) => setSender(r.sender), () => setSender(null))
    // Show where the last job for this document ended up (after a refresh or restart).
    listJobs().then((jobs) => { const last = jobs.find((j) => j.document.tripId === id && j.status !== 'cancelled'); if (last && last.status !== 'awaiting_approval') setJob(last) }, () => {})
  }, [id])

  // Any change to the document or settings invalidates the prepared job and its approval.
  const invalidate = () => { if (job && job.status === 'awaiting_approval') { setJob(null); setPreview(null) } else if (!job) setPreview(null); setConfirmDup(false) }
  useEffect(invalidate, [kind, JSON.stringify(request), JSON.stringify(choices)])

  if (!trip) return (
    <div className="screen center">
      <Doodle name="printer" size={48} />
      <h2 className="chalk-title">nothing to print here</h2>
      <p className="dim">That trip doesn't exist on this device.</p>
      <Btn kind="solid" onClick={() => go('/trips')}>pick a trip</Btn>
    </div>
  )

  const profile = printer ?? { ...UNKNOWN_PRINTER, email: '', updatedAt: 0 }
  const plan = planPrint(request, profile, choices, job?.pageCount ? job.pageCount / Math.max(1, job.plan.repeat) : localPages || undefined)
  const shownPlan = job?.plan ?? plan
  const phase = !job ? (busy ? 0 : -1) : job.status === 'awaiting_approval' ? 1 : job.status === 'sending' ? 2 : job.status === 'submitted' ? 3 : -1

  async function prepare() {
    setProblem(''); setConfirmDup(false)
    if (plan.questions.length) return setProblem('Answer the questions above first.')
    setBusy('making the PDF…')
    try {
      const { buildPdf } = await import('../print/pdf') // pdf-lib loads only when a PDF is made
      const built = await buildPdf({ kind, trip: trip!, items: state.items, profile: state.profile, printedOn: TODAY }, plan)
      setLossy(built.lossyText); setLocalPages(built.pageCount)
      if (browserOnly || !printer) { setPreview(new Blob([built.bytes as BlobPart], { type: 'application/pdf' })); return }
      setBusy('saving the exact PDF for approval…')
      const prepared = await prepareJob({ pdf: built.bytes, document: { kind, title: built.title, tripId: trip!.id }, request, choices })
      setJob(prepared)
      setPreview(await jobPdf(prepared.id)) // the stored bytes, exactly as they would be attached
    } catch (e) { setProblem((e as Error).message) } finally { setBusy('') }
  }

  async function approve(o: { allowDuplicate?: boolean; resendAfterUncertain?: boolean } = {}) {
    if (!job) return
    setProblem(''); setBusy('sending…')
    try { setJob(await approveJob(job, o)); setConfirmDup(false) }
    catch (e) {
      const err = e as Error & { status?: number }
      if (/exact document was/.test(err.message)) setConfirmDup(true)
      setProblem(err.message)
    } finally { setBusy('') }
  }

  return (
    <div className="screen print-screen">
      <TopBar back={`/trip/${trip.id}`} title="print" />
      <div className="print-flow">
        <div className="chips" role="group" aria-label="Document">
          <Chip on={kind === 'card'} onClick={() => setKind('card')} icon="ticket">trip card</Chip>
          <Chip on={kind === 'journal'} onClick={() => setKind('journal')} icon="book">journal page</Chip>
        </div>
        <label className="print-ask"><span className="small dim">anything special?</span>
          <input className="chalk-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. two copies, black and white" aria-label="Print request" /></label>
        <div className="chips wrap" role="group" aria-label="Print settings">
          <Chip on={request.color === 'grayscale'} onClick={() => setRequest({ ...request, color: request.color === 'grayscale' ? undefined : 'grayscale' })}>black & white</Chip>
          <Chip on={request.color === 'color'} onClick={() => setRequest({ ...request, color: request.color === 'color' ? undefined : 'color' })}>color</Chip>
          <Chip on={request.size === '4x6'} onClick={() => setRequest({ ...request, size: request.size === '4x6' ? undefined : '4x6' })}>4×6</Chip>
          <Chip on={!!request.duplex} onClick={() => setRequest({ ...request, duplex: request.duplex ? undefined : true })}>two-sided</Chip>
          <Chip on={(request.copies ?? 1) > 1} onClick={() => setRequest({ ...request, copies: (request.copies ?? 1) >= 10 ? 1 : (request.copies ?? 1) + 1 })}>{request.copies ?? 1} {(request.copies ?? 1) === 1 ? 'copy' : 'copies'}</Chip>
        </div>

        {plan.questions.map((q) => (
          <div className="print-question" key={q.key} role="group" aria-label={q.text}>
            <p>{q.text}</p>
            <div className="ac-buttons">{q.options.map((o) => <Btn key={o.value} kind="ghost" onClick={() => setChoices({ ...choices, [q.key]: o.value })}>{o.label}</Btn>)}</div>
          </div>
        ))}

        {browserOnly ? (
          <p className="small dim print-note">Emailing to an Epson printer needs your Tatada account, and sign-in is paused in this version. You can still preview the PDF, download it, or print it from this browser. No printer address is saved.</p>
        ) : printer === undefined ? <p className="small dim">checking your printer…</p> : editingPrinter || !printer ? (
          <PrinterSetup current={printer} onSaved={(p) => { setPrinter(p); setEditingPrinter(false) }} onCancel={printer ? () => setEditingPrinter(false) : undefined} senderLabel={sender?.label} />
        ) : (
          <p className="small print-dest">to <strong>{printerAddress(printer.email, shownPlan.suffix)}</strong> · <button className="link-btn" onClick={() => setEditingPrinter(true)}>change</button> <button className="link-btn" onClick={() => void removePrinter().then(() => { setPrinter(null); setEditingPrinter(true); setJob(null); setPreview(null) }, (e: Error) => setProblem(e.message))}>remove</button></p>
        )}

        {!job && <Btn kind="solid" disabled={!!busy || plan.questions.length > 0 || (!browserOnly && (editingPrinter || !printer))} onClick={() => void prepare()}>{busy || 'show the PDF'}</Btn>}

        {phase >= 0 && !browserOnly && <ol className="print-steps" aria-label="Print status">{STEPS.map((s, i) => <li key={s} className={i < phase ? 'done' : i === phase ? 'now' : ''}>{s}</li>)}</ol>}

        {previewUrl && (
          <div className="print-preview">
            <iframe src={previewUrl} title="PDF preview" />
            <p className="small"><a href={previewUrl} target="_blank" rel="noreferrer">open the PDF</a> · <a href={previewUrl} download={`${trip.destination.toLowerCase().replace(/\W+/g, '-')}-${kind}.pdf`}>download</a>{browserOnly && <> · <button className="link-btn" onClick={() => window.open(previewUrl, '_blank')}>print from this browser</button></>}</p>
          </div>
        )}

        {job && (
          <section className="print-summary" aria-label="Print summary">
            <dl>
              <dt>printer</dt><dd>{job.address}</dd>
              <dt>sender</dt><dd>{job.sender.label}{job.sender.verified ? '' : ' · not verified'}</dd>
              <dt>document</dt><dd>{job.document.title} · {job.pageCount} {job.pageCount === 1 ? 'page' : 'pages'} · {Math.round(job.bytes / 1024)} KB</dd>
            </dl>
            <ul className="print-lines">{job.plan.lines.map((l) => <li key={l.setting} className={l.how === 'not_possible' ? 'no' : ''}><strong>{l.setting}</strong> {l.requested !== 'default' && <span className="dim">asked: {l.requested} · </span>}{l.result} <em>{HOW[l.how]}</em></li>)}</ul>
            {lossy && <p className="small">Some characters can't be printed in the PDF font and show as “?”.</p>}
            <details><summary>limitations ({job.plan.limitations.length})</summary><ul className="small">{job.plan.limitations.map((t) => <li key={t}>{t}</li>)}</ul></details>
            {job.blocker && <p className="ac-problem" role="alert">Can't send yet: {job.blocker}</p>}
            {job.status === 'awaiting_approval' && !job.blocker && <div className="ac-buttons">
              <Btn kind="solid" disabled={!!busy} onClick={() => void approve(confirmDup ? { allowDuplicate: true } : {})}>{busy || (confirmDup ? 'yes, print it again' : 'approve & email to printer')}</Btn>
              <Btn kind="ghost" disabled={!!busy} onClick={() => void cancelJob(job.id).then((j) => { setJob(j); setPreview(null) }, (e: Error) => setProblem(e.message))}>cancel</Btn>
            </div>}
            {job.status === 'submitted' && <p role="status">Email submitted to your printer. Tatada can't see the printer, so this isn't proof of a printed page; Epson may email the sender a completion notice.</p>}
            {job.status === 'send_uncertain' && <div role="status"><p>We don't know whether the email went out. It won't be resent automatically.</p>
              <div className="ac-buttons"><Btn kind="ghost" onClick={() => void checkJob(job.id).then(setJob, (e: Error) => setProblem(e.message))}>check again</Btn><Btn kind="ghost" onClick={() => { if (confirm('This may print twice. Send again?')) void approve({ resendAfterUncertain: true }) }}>send again anyway</Btn></div></div>}
            {(job.status === 'failed' || job.status === 'blocked') && <p className="ac-problem" role="alert">Not sent: {job.error}</p>}
            {job.status !== 'awaiting_approval' && <Btn kind="ghost" onClick={() => { setJob(null); setPreview(null) }}>start a new print</Btn>}
          </section>
        )}
        {problem && <p className="ac-problem" role="alert">{problem}</p>}
      </div>
    </div>
  )
}

function PrinterSetup({ current, onSaved, onCancel, senderLabel }: { current: PrinterProfile | null; onSaved: (p: PrinterProfile) => void; onCancel?: () => void; senderLabel?: string }) {
  const [v, setV] = useState({ ...UNKNOWN_PRINTER, ...(current ?? {}), email: current?.email ?? '' })
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const pick = (key: 'colorInk' | 'autoDuplex' | 'bodyPrintingOff' | 'senderApproved', label: string) => (
    <fieldset className="setup-q"><legend>{label}</legend>
      {(['yes', 'no', 'unknown'] as Answer[]).map((a) => <label key={a}><input type="radio" name={key} checked={v[key] === a} onChange={() => setV({ ...v, [key]: a })} /> {a === 'unknown' ? 'not sure' : a}</label>)}
    </fieldset>
  )
  return (
    <form className="printer-setup" aria-label="Printer setup" onSubmit={(e) => {
      e.preventDefault(); setError('')
      if (!EPSON_EMAIL.test(v.email.trim())) return setError('Use the printer\'s Epson Connect address, like name@print.epsonconnect.com.')
      setSaving(true)
      savePrinter({ ...v, email: v.email.trim() }).then(onSaved, (err: Error) => setError(err.message)).finally(() => setSaving(false))
    }}>
      <h3 className="section-h">your Epson printer</h3>
      <label><span className="small dim">printer email address</span><input className="chalk-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="name@print.epsonconnect.com" aria-label="Epson printer email" autoComplete="off" /></label>
      <p className="small dim">Find it in the Epson Connect User Page → Printer List, or on the printer's setup sheet. It's saved privately to your Tatada account.</p>
      <fieldset className="setup-q"><legend>plain paper size set in Epson Connect</legend>
        {(['letter', 'a4', 'unknown'] as const).map((a) => <label key={a}><input type="radio" name="plainPaper" checked={v.plainPaper === a} onChange={() => setV({ ...v, plainPaper: a })} /> {a === 'unknown' ? 'not sure' : a === 'a4' ? 'A4' : 'Letter'}</label>)}
      </fieldset>
      {pick('colorInk', 'it has color ink')}
      {pick('autoDuplex', 'it prints two-sided automatically')}
      <details className="small"><summary>one-time Epson Connect settings</summary>
        <ol>
          <li>In Epson Connect → Print Settings, turn off "Print Email Body" and "Print Sender's Information", or Epson may print an extra page.</li>
          <li>If "Use Approved Senders List" is on, add the address that will send: {senderLabel ?? 'your connected sending account'}.</li>
          <li>Optional: turn on notification emails for that sender to get Epson's completion notice.</li>
        </ol>
        <p>Tatada never asks for your Epson or email password.</p>
      </details>
      {pick('bodyPrintingOff', 'email body and sender info printing are off')}
      {pick('senderApproved', 'the sender is approved (or the list is off)')}
      {error && <p className="ac-problem" role="alert">{error}</p>}
      <div className="ac-buttons"><Btn kind="solid" type="submit" disabled={saving}>{saving ? 'saving…' : 'save printer'}</Btn>{onCancel && <Btn kind="ghost" type="button" onClick={onCancel}>cancel</Btn>}</div>
    </form>
  )
}
