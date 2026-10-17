import { useRef, useState } from 'react'
import { ACTIVE, useServer, type ServerAction } from '../state/server'
import { Doodle } from './Doodle'
import { Btn, Chip, Paper } from './ui'

const LABEL: Record<ServerAction['status'], string> = {
  proposed: 'waiting for your ok',
  approved: 'queued',
  sending: 'handing it to Fo…',
  send_uncertain: 'checking with Fo before anything else',
  waiting: 'Fo is on it',
  needs_input: 'Fo needs you',
  answering: 'sending your answer…',
  verifying: 'checking Fo\'s records for proof…',
  verified: 'done, with proof',
  unverified: 'Fo says done, but there\'s no proof',
  failed: 'didn\'t go through',
  timeout: 'still running, stopped waiting',
  cancelled: 'cancelled',
}

/** An action owned by the Tatada server (real Fo or the mock adapter). */
export function ServerActionCard({ action }: { action: ServerAction }) {
  const { approve, edit, command, newKey } = useServer()
  const key = useRef(newKey())
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ to: action.draft.to, subject: action.draft.subject, body: action.draft.body })
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFo, setShowFo] = useState(false)
  const live = action.provider === 'live'
  const running = ACTIVE.includes(action.status)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = () =>
    run(async () => {
      await edit(action.id, draft)
      setEditing(false)
      key.current = newKey() // new content, new approval
    })

  const evidence = action.result?.evidence ?? []

  return (
    <div className={`action-card status-${action.status === 'answering' ? 'running' : action.status} ${live ? 'real' : 'mockfo'}`} data-server-action={action.id} data-status={action.status}>
      <div className="ac-head">
        <span className={`ac-icon ${running ? 'pulse' : ''}`}>
          <Doodle name="mail" size={24} />
        </span>
        <div className="ac-title">
          <strong>{action.draft.intent === 'delay' ? 'Late arrival heads-up' : `Early check-in${action.draft.transferQuote ? ' + transfer quote' : ''}`}</strong>
          <span className="ac-status" role="status">{LABEL[action.status]}</span>
        </div>
        <span className={`stamp ${live ? 'real' : 'mock'}`}>{live ? 'REAL · via Fo' : 'MOCK FO'}</span>
      </div>

      {action.status === 'proposed' && (
        <>
          <dl className="ac-facts">
            <div>
              <dt>Fo will email</dt>
              <dd>
                {action.draft.toName} <span className="dim">· {action.draft.to}</span>
              </dd>
            </div>
            <div>
              <dt>from</dt>
              <dd>your email account, via Fo</dd>
            </div>
            <div>
              <dt>shares</dt>
              <dd className="chips">
                {action.draft.shared.map((d) => (
                  <Chip key={d}>{d}</Chip>
                ))}
              </dd>
            </div>
            <div>
              <dt>cost</dt>
              <dd>Free to ask{action.draft.transferQuote ? ' · a transfer quote only, nothing booked' : ''}</dd>
            </div>
          </dl>
          <Paper className="ac-script" tilt={-0.6}>
            <span className="paper-label">exact email</span>
            {editing ? (
              <div className="ac-edit">
                <label>
                  to <input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} aria-label="Recipient email" />
                </label>
                <label>
                  subject <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} aria-label="Subject" />
                </label>
                <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={8} aria-label="Email body" />
              </div>
            ) : (
              <>
                <p className="ac-subject">{action.draft.subject}</p>
                <p className="ac-body">{action.draft.body}</p>
              </>
            )}
          </Paper>
          <button className="linkbtn small" onClick={() => setShowFo(!showFo)} aria-expanded={showFo}>
            {showFo ? 'hide' : 'see'} exactly what Fo receives
          </button>
          {showFo && <pre className="fo-message">{action.foMessage}</pre>}
          <div className="ac-buttons">
            {editing ? (
              <Btn kind="solid" icon="tick" disabled={busy || !draft.body.trim()} onClick={saveEdit}>
                Save changes
              </Btn>
            ) : (
              <Btn kind="solid" icon="tick" disabled={busy} onClick={() => run(() => approve(action, key.current))}>
                Approve & send
              </Btn>
            )}
            <Btn kind="ghost" icon="pencil" disabled={busy} onClick={() => (editing ? (setEditing(false), setDraft({ to: action.draft.to, subject: action.draft.subject, body: action.draft.body })) : setEditing(true))}>
              {editing ? 'Discard' : 'Edit'}
            </Btn>
            <Btn kind="ghost" disabled={busy} onClick={() => run(() => command(action.id, 'cancel'))}>
              Not now
            </Btn>
          </div>
          <p className="ac-fine">
            {live ? 'Approving sends this exact email from your account. Any edit needs a fresh approval.' : 'Mock Fo: the whole pipeline runs, but no real email is sent.'}
          </p>
        </>
      )}

      {action.status !== 'proposed' && action.progress.length > 0 && (
        <ol className="ac-log">
          {action.progress.map((l, i) => (
            <li key={i} className={i === action.progress.length - 1 && running ? 'now' : ''}>
              {l.text}
            </li>
          ))}
          {running && <li className="typing" aria-label="working">•••</li>}
        </ol>
      )}

      {action.status === 'needs_input' && (
        <form
          className="ac-question"
          onSubmit={(e) => {
            e.preventDefault()
            if (answer.trim()) void run(async () => (await command(action.id, 'answer', { text: answer.trim() }), setAnswer('')))
          }}
        >
          <p>
            <Doodle name="bolt" size={18} /> Fo asks: {action.question}
          </p>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="your answer, in your words" aria-label="Your answer to Fo" />
          <div className="ac-buttons">
            <Btn kind="solid" disabled={busy || !answer.trim()} type="submit">
              Send answer
            </Btn>
            <Btn kind="ghost" type="button" disabled={busy} onClick={() => run(() => command(action.id, 'cancel'))}>
              Stop here
            </Btn>
          </div>
          <p className="ac-fine">Tatada never answers Fo for you.</p>
        </form>
      )}

      {action.result && action.status === 'verified' && (
        <div className="ac-result">
          <p className="ac-summary">
            <Doodle name="tick" size={22} className="ok" /> {action.result.summary}
          </p>
          <ul className="ac-evidence">
            {evidence.map((e, i) => (
              <li key={i}>
                <Doodle name="receipt" size={16} /> {e.kind === 'email_sent' ? `Send record: ${e.detail}${e.messageId ? ` (${e.messageId})` : ''}` : `Reply: "${e.detail}"`}
              </li>
            ))}
          </ul>
          {action.result.outcome === 'request_sent' && (
            <Btn kind="ghost" icon="search" disabled={busy} onClick={() => run(() => command(action.id, 'check'))}>
              check for a reply
            </Btn>
          )}
        </div>
      )}

      {['unverified', 'failed', 'timeout'].includes(action.status) && (
        <div className="ac-result">
          <p className="ac-problem">{action.error}</p>
          <div className="ac-buttons">
            {action.status === 'failed' && action.retryable && (
              <Btn kind="ghost" disabled={busy} onClick={() => run(() => command(action.id, 'retry'))}>
                retry (checks Fo first)
              </Btn>
            )}
            {action.conversationId && (action.status !== 'failed' || !action.retryable) && (
              <Btn kind="ghost" icon="search" disabled={busy} onClick={() => run(() => command(action.id, 'check'))}>
                check again
              </Btn>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="ac-problem" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
