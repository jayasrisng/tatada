import { useEffect, useRef, useState } from 'react'
import { api, useServer } from '../../state/server'
import { VoiceField } from './VoiceField'
import { Btn } from '../layout/ui'
export interface ResearchAnswer { checkedAt: string; model: string; sections: { text: string; sources: { url: string; title: string }[] }[]; searched: boolean; incomplete: boolean }
export function ResearchPanel({ context = '', prompt = '', title = 'A little clarity', onSave,auto=false }: {auto?:boolean; context?: string; prompt?: string; title?: string; onSave?: (answer: ResearchAnswer) => void }) {
  const { info } = useServer(), [question, setQuestion] = useState(prompt), [answer, setAnswer] = useState<ResearchAnswer | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const version = useRef(0)
  useEffect(() => setQuestion(prompt), [prompt])
  useEffect(() => { version.current++; setAnswer(null); setError(''); setBusy(false) }, [context])
  useEffect(() => () => { version.current++ }, [])
  async function research(){
    const current=++version.current;setBusy(true);setError('');setAnswer(null)
    try{const result=await api<ResearchAnswer>('/api/intelligence',{method:'POST',json:{question,context},signal:AbortSignal.timeout(100000)});if(current===version.current)setAnswer(result)}catch(e){if(current===version.current)setError((e as Error).message)}finally{if(current===version.current)setBusy(false)}
  }
  const autoStarted=useRef(false)
  useEffect(()=>{let mounted=true;queueMicrotask(()=>{if(mounted&&auto&&!autoStarted.current&&info.authenticated&&info.provider==='live'){autoStarted.current=true;void research()}});return()=>{mounted=false}},[auto,info.authenticated,info.provider])
  return <section className="research-card" aria-label={title}>
    <h3>{title}</h3>
    {context && <details><summary>Trip details shared with Claude</summary><p className="small">{context}</p></details>}
    <form onSubmit={e=>{e.preventDefault();void research()}}>
      <VoiceField label="Your question" value={question} onChange={setQuestion} maxLength={4000} required disabled={busy} placeholder="What would you like to do, eat or explore?" />
      <Btn type="submit" disabled={busy || !info.authenticated || info.provider === 'mock'}>{busy ? 'checking sources…' : 'research this'}</Btn>
    </form>
    {!info.authenticated && <p className="small">Connect the live backend from your profile to use research.</p>}
    {error && <p role="alert">{error}</p>}
    {answer && <div aria-live="polite">{onSave && <Btn kind="ghost" onClick={() => onSave(answer)}>save this briefing</Btn>}<p className="small dim">Checked {new Date(answer.checkedAt).toLocaleString()} · {answer.searched ? 'source-linked research; facts may still change' : 'no source citations returned; treat factual claims as unverified'}{answer.incomplete ? ' · answer may be incomplete' : ''}</p>{answer.sections.map((s, i) => <div key={i}><p className="research-copy">{s.text}</p>{s.sources.length > 0 && <ul className="small">{[...new Map(s.sources.map((source) => [source.url, source])).values()].map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>}</div>)}</div>}
  </section>
}
