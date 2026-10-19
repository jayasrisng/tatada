import { useState } from 'react'
import type { Trip } from '../types'
import { useStore } from '../state/store'
import { applyProposal, undoProposal, validateProposal, structuredProposal, type Proposal } from '../assistant/proposals'
import { Btn } from './ui'
export function FoProposal({ trip, text, sourceId }: { trip: Trip; text: string; sourceId: string }) {
  const { state, dispatch } = useStore(), [draft, setDraft] = useState<Proposal | null>(null), [error, setError] = useState('')
  const update = state.assistantUpdates?.find(u => u.id === sourceId)
  return <div className="fo-proposal">
    {update ? <p className="small" role="status">{update.undone ? 'Saved update undone.' : 'Saved as your trip record.'} {!update.undone && <button className="linkbtn" onClick={() => { try { undoProposal(state, sourceId); dispatch({ type: 'undoProposal', id: sourceId }) } catch (e) { setError((e as Error).message) } }}>undo</button>}</p> : <button className="linkbtn small" onClick={() => { try { const structured = structuredProposal(text); setDraft(structured ? validateProposal(structured, state, trip.id) : { kind: 'task', tripId: trip.id, text: text.slice(0, 5000), day: trip.start }); setError('') } catch (e) { setError((e as Error).message) } }}>review as trip update</button>}
    {draft && !update && <form className="details-form" aria-label="Review Fo update" onSubmit={e => { e.preventDefault(); try { applyProposal(state, sourceId, draft); dispatch({ type: 'applyProposal', id: sourceId, proposal: draft }); setDraft(null); setError('') } catch (e) { setError((e as Error).message) } }}>
      <p className="small dim">Fo advice → your saved record. No booking or provider action is confirmed.</p><label>Save as<select className="chalk-input" aria-label="Suggestion type" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Proposal['kind'], day: draft.day ?? trip.start })}><option value="task">Task</option><option value="itinerary">Itinerary stop</option><option value="journal">Journal note</option></select></label>
      <label>Text<textarea className="chalk-input" aria-label="Suggestion text" maxLength={5000} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} /></label>
      {draft.kind !== 'task' && <label>Day<input className="chalk-input" aria-label="Suggestion day" type="date" min={trip.start} max={trip.end} value={draft.day ?? ''} onChange={e => setDraft({ ...draft, day: e.target.value })} /></label>}
      {draft.kind === 'itinerary' && <label>Local time<input className="chalk-input" aria-label="Suggestion time" type="time" value={draft.time ?? ''} onChange={e => setDraft({ ...draft, time: e.target.value })} /></label>}
      <div className="ac-buttons"><Btn type="submit">apply reviewed update</Btn><Btn kind="ghost" type="button" onClick={() => setDraft(null)}>cancel</Btn></div>
    </form>}{error && <p role="alert" className="small">{error}</p>}
  </div>
}
