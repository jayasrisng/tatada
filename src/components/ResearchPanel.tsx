import { useEffect, useRef, useState } from 'react'
import { api, useServer } from '../state/server'
import { SpeechButton } from './SpeechButton'
import { Btn } from './ui'
export interface ResearchAnswer { checkedAt: string; model: string; sections: { text: string; sources: { url: string; title: string }[] }[]; searched: boolean; incomplete: boolean }
export function ResearchPanel({ context = '', prompt = '', title = 'A little clarity', onSave }: { context?: string; prompt?: string; title?: string; onSave?: (answer: ResearchAnswer) => void }) {
  const { info } = useServer(), [question, setQuestion] = useState(prompt), [answer, setAnswer] = useState<ResearchAnswer | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const version = useRef(0)
  useEffect(() => setQuestion(prompt), [prompt])
  useEffect(() => { version.current++; setAnswer(null); setError(''); setBusy(false) }, [context])
  useEffect(() => () => { version.current++ }, [])
  return <section className="research-card" aria-label={title}>
    <h3>{title}</h3><p className="small dim">Claude researches public sources. Your question and the trip context below go to Anthropic. No documents, wallet, or full profile are attached.</p>
    {context && <details><summary>Context being shared</summary><p className="small">{context}</p></details>}
    <form onSubmit={async (e) => { e.preventDefault(); const current = ++version.current; setBusy(true); setError(''); setAnswer(null); try { const result = await api<ResearchAnswer>('/api/intelligence', { method: 'POST', json: { question, context }, signal: AbortSignal.timeout(100_000) }); if (current === version.current) setAnswer(result) } catch (e) { if (current === version.current) setError((e as Error).message) } finally { if (current === version.current) setBusy(false) } }}>
      <label>Your question<textarea className="chalk-input" value={question} maxLength={4000} required onChange={(e) => setQuestion(e.target.value)} placeholder="A sports bar showing F1? Flights for a family visit? A little history before I arrive?" /></label>
      <SpeechButton onText={(text) => setQuestion((previous) => [previous, text].filter(Boolean).join(' '))} />
      <Btn type="submit" disabled={busy || !info.authenticated || info.provider === 'mock'}>{busy ? 'checking sources…' : 'research this'}</Btn>
    </form>
    {!info.authenticated && <p className="small">Connect the live backend from your profile to use research.</p>}
    {error && <p role="alert">{error}</p>}
    {answer && <div aria-live="polite">{onSave && <Btn kind="ghost" onClick={() => onSave(answer)}>save this briefing</Btn>}<p className="small dim">Checked {new Date(answer.checkedAt).toLocaleString()} · {answer.searched ? 'source-linked research; facts may still change' : 'no source citations returned; treat factual claims as unverified'}{answer.incomplete ? ' · answer may be incomplete' : ''}</p>{answer.sections.map((s, i) => <div key={i}><p className="research-copy">{s.text}</p>{s.sources.length > 0 && <ul className="small">{[...new Map(s.sources.map((source) => [source.url, source])).values()].map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>}</div>)}</div>}
  </section>
}
