import { ReadingText } from './ReadingText'
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { api, useServer } from '../state/server'
import type { Trip } from '../types'
import type { ResearchAnswer } from './ResearchPanel'

// Shared in-flight requests avoid duplicate research on remount/StrictMode. Account-scoped; bounded.
const requests = new Map<string, Promise<ResearchAnswer>>()
export function TripResearch({ trip }: { trip: Trip }) {
  const { dispatch } = useStore(), { info } = useServer()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const note = trip.research?.[0]
  const context = `${trip.destination}, ${trip.country}. Dates: ${trip.start} to ${trip.end}. Star’s local date: ${new Date().toLocaleDateString('en-CA')}. Device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`
  const key = `${info.account?.id ?? 'disconnected'}:${context}:${refresh}`
  useEffect(() => {
    if (!info.authenticated || info.provider !== 'live' || trip.status === 'past') return
    if (!refresh && note && note.sections.map(s => s.text).join('').split(/\s+/).length <= 190 && Date.now() - Date.parse(note.checkedAt) < 6 * 60 * 60_000) return
    let live = true
    setBusy(true); setError('')
    let request = requests.get(key)
    if (!request) {
      if (requests.size >= 30) requests.delete(requests.keys().next().value!)
      request = api<ResearchAnswer>('/api/intelligence', {method: 'POST', json: {context, question: 'Write a travel pocket guide a 10-year-old can understand. At most 140 words TOTAL. Use five short Markdown headings: Stay safe, Getting around, Phone and money, Local manners, A little wonder. Under each heading use no more than two short sentences, each under 16 words. Put the most useful action first. Plain everyday words, no introduction or long lists. Use supplied dates. Check official sources for current closures, seasonal cautions, emergency and entry guidance. Only give emergency numbers verified in official sources. Do not infer nationality or visa eligibility. Say when conditions cannot be checked. No visual spoilers, no homework. Include one sourced cultural fact.'}, signal: AbortSignal.timeout(100_000)})
      requests.set(key, request)
      request.catch(() => { if (requests.get(key) === request) requests.delete(key) })
    }
    request.then(answer => { if (live) dispatch({type: 'saveResearch', tripId: trip.id, note: {id: crypto.randomUUID(), checkedAt: answer.checkedAt, model: answer.model, searched: answer.searched, sections: answer.sections}}) }, e => { if (live) setError((e as Error).message) }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [key, info.authenticated, info.provider, trip.status])
  if (trip.status === 'past' && !note) return null
  return <section className="research-card trip-briefing" aria-label="Before you get there">
    <h3>Before you get there</h3>
    {busy && <p role="status">Getting the useful bits ready…</p>}
    {error && <p role="alert">Your briefing isn’t ready yet. {error}</p>}
    {!info.authenticated && <p>Connect the live backend to let Tatada prepare your briefing.</p>}
    {note && <div>
      {!note.searched && <p className="small">Not verified yet. Open sources for details.</p>}
      <div className="brief-bites">{briefBites(note.sections.map(s => s.text).join('')).map((bite, i) => <article key={i} className="brief-bite"><h4>{bite.title}</h4><ReadingText text={bite.more && `${bite.lead} ${bite.more}`.length<=240 ? `${bite.lead} ${bite.more}` : bite.lead} /></article>)}</div>
      <details className="briefing-sources"><summary>Sources &amp; last checked</summary><p className="small dim">Checked {new Date(note.checkedAt).toLocaleString()}. Conditions can change.{!note.searched && ' No citations returned; treat claims as unverified.'}</p><ul className="small">{[...new Map(note.sections.flatMap(s => s.sources).map(source => [source.url, source])).values()].map(source => <li key={source.url}><a href={/^https:\/\//.test(source.url) ? source.url : undefined} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details>
    </div>}

    {!busy && info.authenticated && <button className="linkbtn small" onClick={() => { requests.delete(key); setRefresh(n => n + 1) }}>{error ? 'try again' : 'refresh'}</button>}
  </section>
}

/** Keep the source wording intact; fold long existing answers rather than inventing a summary. */
export function briefBites(text: string) {
  const groups = text.split(/(?=^#{1,6}\s)/m).filter(s => s.trim())
  const blocks = groups.length > 1 ? groups : text.split(/\n\s*\n/).filter(s => s.trim())
  return blocks.slice(0, 5).map((block, i) => {
    const match = /^#{1,6}\s+([^\n]+)\n?/.exec(block.trim())
    const title = match ? match[1].replace(/\*\*/g, '') : ['Good to know', 'On the ground', 'Keep in mind', 'Small details', 'One more thing'][i]
    const body = (match ? block.trim().slice(match[0].length) : block).trim()
    return {title, lead: body, more: ''}
  })
}
