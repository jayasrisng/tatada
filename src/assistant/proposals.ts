import type { AppState } from '../types'
import { isIsoDate, isTime } from '../magic/dates'
export interface Proposal { kind: 'task' | 'itinerary' | 'journal'; tripId: string; text: string; day?: string; time?: string }

export function validateProposal(value: unknown, state: AppState, tripId: string): Proposal {
  const v = value as Proposal
  if (!v || typeof v !== 'object' || Object.keys(v).some(k => !['kind','tripId','text','day','time'].includes(k)) || !['task','itinerary','journal'].includes(v.kind) || v.tripId !== tripId || !state.trips.some(t => t.id === tripId) || typeof v.text !== 'string' || !v.text.trim() || v.text.length > 5000) throw new Error('Review a supported suggestion for this trip.')
  const trip = state.trips.find(t => t.id === tripId)!
  if (v.kind !== 'task' && (!v.day || !isIsoDate(v.day) || v.day < trip.start || v.day > trip.end)) throw new Error('Choose a day within this trip.')
  if (v.time !== undefined && v.time !== '' && !isTime(v.time)) throw new Error('Choose a valid local time.')
  return { kind: v.kind, tripId, text: v.text.trim(), ...(v.kind !== 'task' ? { day: v.day } : {}), ...(v.kind === 'itinerary' && v.time ? { time: v.time } : {}) }
}
/** Optional explicit contract in a Fo reply. Arbitrary prose never executes or becomes a confirmed booking. */
export function structuredProposal(text: string): unknown | undefined {
  const block = text.match(/```tatada-proposal\s*\n([\s\S]*?)```/)
  if (!block) return
  try { return JSON.parse(block[1]) } catch { throw new Error('Fo’s structured suggestion was invalid. You can edit a local note instead.') }
}
export function applyProposal(state: AppState, id: string, value: Proposal): AppState {
  const p = validateProposal(value, state, value.tripId)
  if (!id || id.length > 300) throw new Error('Invalid suggestion identifier.')
  if (state.assistantUpdates?.some(u => u.id === id)) return state
  const recordId = `fo-${id}`, trip = state.trips.find(t => t.id === p.tripId)!
  const record = p.kind === 'task' ? { id: recordId, tripId: p.tripId, text: p.text, phase: 'plan' as const, kind: 'task' as const, done: false } : p.kind === 'journal' ? { id: recordId, text: p.text, day: p.day!, kind: 'note' as const } : { id: recordId, title: p.text, day: p.day!, time: p.time, dress: 'casual' as const }
  if (state.items.some(i=>i.id===recordId)||trip.memories.some(i=>i.id===recordId)||trip.itinerary?.some(i=>i.id===recordId)) throw new Error('This suggestion already has a saved record.')
  return { ...state, items: p.kind === 'task' ? [...state.items, record as AppState['items'][number]] : state.items,
    trips: state.trips.map(t => t.id !== p.tripId ? t : p.kind === 'journal' ? { ...t, memories: [...t.memories, record as typeof t.memories[number]] } : p.kind === 'itinerary' ? { ...t, itinerary: [...(t.itinerary ?? []), record as NonNullable<typeof t.itinerary>[number]] } : t),
    assistantUpdates: [...(state.assistantUpdates ?? []), { id, tripId: p.tripId, kind: p.kind, recordId, snapshot: JSON.stringify(record), undone: false }],
  }
}
export function undoProposal(state: AppState, id: string): AppState {
  const update = state.assistantUpdates?.find(u => u.id === id)
  if (!update || update.undone) return state
  const trip = state.trips.find(t => t.id === update.tripId), record = update.kind === 'task' ? state.items.find(i => i.id === update.recordId) : update.kind === 'journal' ? trip?.memories.find(i => i.id === update.recordId) : trip?.itinerary?.find(i => i.id === update.recordId)
  if (record && JSON.stringify(record) !== update.snapshot) throw new Error('You edited this record after saving. Review or remove it in the trip; undo will not discard those edits.')
  return { ...state, items: state.items.filter(i => i.id !== update.recordId), trips: state.trips.map(t => t.id !== update.tripId ? t : { ...t, memories: t.memories.filter(i=>i.id!==update.recordId), itinerary: t.itinerary?.filter(i=>i.id!==update.recordId) }), assistantUpdates: state.assistantUpdates!.map(u=>u.id===id?{...u,undone:true}:u) }
}
