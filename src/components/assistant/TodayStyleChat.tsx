import { ReadingText } from '../layout/ReadingText'
import { useState } from 'react'
import { api, useServer } from '../../state/server'
import { useStore } from '../../state/store'
import { useToday } from '../../state/today'
import { Doodle } from '../layout/Doodle'
import { VoiceField } from './VoiceField'
import type { ResearchAnswer } from './ResearchPanel'

export function TodayStyleChat() {
  const {state} = useStore(), {info} = useServer(), today = useToday()
  const [text, setText] = useState(''), [turns, setTurns] = useState<{me: string; reply: string}[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const wardrobe = state.wardrobe ?? []
  return <section className="research-card today-style-chat" aria-label="Dress for your day">
    <h3>What’s your day looking like?</h3>
    <div aria-live="polite">{turns.map((turn, i) => <div key={i} className="style-chat-turn"><p className="dim">You · {turn.me}</p><ReadingText text={turn.reply} /></div>)}</div>
    <form onSubmit={async e => {
      e.preventDefault(); if (!text.trim() || busy) return
      const question = text.trim(); setBusy(true); setError('')
      const context = JSON.stringify({date: today, closet: wardrobe.slice(0, 80).map(g => ({id: g.id, name: g.name, category: g.category, color: g.color, vibe: g.vibe})), recentConversation: turns.slice(-3).map(t => ({question: t.me.slice(0, 400), answer: t.reply.slice(0, 700)}))}).slice(0, 8000)
      try {const answer = await api<ResearchAnswer>('/api/intelligence', {method: 'POST', json: {purpose: 'style', question, context}, signal: AbortSignal.timeout(100_000)}); setTurns(previous => [...previous.slice(-5), {me: question, reply: answer.sections.map(s => s.text).join('\n\n')}]); setText(current=>current.trim()===question?'':current) } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
    }}>
      <VoiceField ariaLabel="Today outfit plans" value={text} onChange={setText} maxLength={2000} placeholder="What’s the plan? Anything in the wash?" required disabled={busy} actions={<button type="submit" className="iconbtn" aria-label="style my day" disabled={busy||!text.trim()||!info.authenticated||info.provider!=='live'}><Doodle name="sparkle" size={24}/></button>}/>
      {busy&&<p role="status" className="small dim">Putting a look together…</p>}
    </form>
    {!wardrobe.length && <p className="small">Your closet is empty. Add a few pieces in Style so suggestions can use what you own.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
