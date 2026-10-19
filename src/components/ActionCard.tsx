import { useState } from 'react'
import type { FoAction } from '../types'
import { useStore } from '../state/store'
import { Doodle } from './Doodle'
import { Btn, Chip, Paper, SimStamp } from './ui'

const CHANNEL = {
  email: { icon: 'mail', verb: 'email', via: 'by email, from your account' },
  call: { icon: 'phone', verb: 'call', via: 'by phone, on your behalf' },
  fo: { icon: 'bolt', verb: 'ask', via: 'through your Wajo account' },
} as const

const RISK = { low: 'green', medium: 'orange', high: 'pink' } as const

const STATUS_LABEL: Record<FoAction['status'], string> = {
  proposed: 'waiting for your ok',
  running: 'Fo is on it',
  needs_input: 'Fo needs you',
  done: 'checking the result…',
  verified: 'done & verified',
  failed: 'didn\'t work',
  cancelled: 'cancelled',
}

export function ActionCard({ action, compact }: { action: FoAction; compact?: boolean }) {
  const { dispatch } = useStore()
  const [editing, setEditing] = useState(false)
  const [script, setScript] = useState(action.script)
  const ch = CHANNEL[action.channel]
  const live = action.status === 'running' || action.status === 'done'
  const q = action.status === 'needs_input' ? action.plan[action.cursor]?.question : undefined

  return (
    <div className={`action-card status-${action.status} ${action.mode}`}>
      <div className="ac-head">
        <span className={`ac-icon ${live ? 'pulse' : ''}`}>
          <Doodle name={ch.icon} size={24} />
        </span>
        <div className="ac-title">
          <strong>{action.title}</strong>
          <span className="ac-status">{STATUS_LABEL[action.status]}</span>
        </div>
        <SimStamp real={action.mode === 'real'} />
      </div>

      {action.status === 'proposed' && (
        <>
          <dl className="ac-facts">
            <div>
              <dt>Fo will {ch.verb}</dt>
              <dd>
                {action.recipient.name} <span className="dim">· {action.recipient.contact}</span>
              </dd>
            </div>
            <div>
              <dt>how</dt>
              <dd>{ch.via}</dd>
            </div>
            <div>
              <dt>shares</dt>
              <dd className="chips">
                {action.dataShared.map((d) => (
                  <Chip key={d}>{d}</Chip>
                ))}
              </dd>
            </div>
            <div>
              <dt>cost</dt>
              <dd>{action.cost}</dd>
            </div>
            <div>
              <dt>risk</dt>
              <dd>
                <Chip tint={RISK[action.risk]}>{action.risk}</Chip>
              </dd>
            </div>
          </dl>
          <Paper className="ac-script" tilt={-0.6}>
            <span className="paper-label">{action.channel === 'call' ? 'what Fo will say' : 'exact words'}</span>
            {editing ? (
              <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={5} autoFocus aria-label="Edit message" placeholder="Write your message…" />
            ) : (
              <p>{script}</p>
            )}
          </Paper>
          <div className="ac-buttons">
            <Btn kind="solid" icon="tick" disabled={!script.trim()} onClick={() => dispatch({ type: 'approve', id: action.id, script })}>
              Approve
            </Btn>
            <Btn kind="ghost" icon="pencil" onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done' : 'Edit'}
            </Btn>
            <Btn kind="ghost" onClick={() => dispatch({ type: 'cancel', id: action.id })}>
              Not now
            </Btn>
          </div>
          {action.mode === 'simulated' && <p className="ac-fine">Demo mode: approving runs a simulation. No real message goes out.</p>}
        </>
      )}

      {action.status !== 'proposed' && action.log.length > 0 && !compact && (
        <ol className="ac-log">
          {action.log.map((l, i) => (
            <li key={i} className={i === action.log.length - 1 && live ? 'now' : ''}>
              {l.text}
            </li>
          ))}
          {live && <li className="typing" aria-label="working">•••</li>}
        </ol>
      )}

      {q && (
        <div className="ac-question">
          <p>
            <Doodle name="phone" size={18} /> {q.text}
          </p>
          <div className="chips">
            {q.options.map((o) => (
              <Chip key={o} tint="yellow" onClick={() => dispatch({ type: 'answer', id: action.id, answer: o })}>
                {o}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {action.result && (action.status === 'verified' || action.status === 'done' || action.status === 'cancelled') && (
        <div className="ac-result">
          <p className="ac-summary">
            {action.status === 'verified' && <Doodle name="tick" size={22} className="ok" />} {action.result.summary}
          </p>
          {action.result.evidence.length > 0 && (
            <ul className="ac-evidence">
              {action.result.evidence.map((e) => (
                <li key={e}>
                  <Doodle name="receipt" size={16} /> {e}
                </li>
              ))}
            </ul>
          )}
          {action.mode === 'simulated' && <p className="ac-fine">Simulated outcome. Fo was not contacted.</p>}
        </div>
      )}
    </div>
  )
}
