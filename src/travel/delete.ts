import type { AppState } from '../types.js'
/** Remove a trip and its dependent workspace records; independent clothes/profile stay. */
export function withoutTrip(state: AppState, tripId: string, serverActions: string[] = []): AppState {
  const actionIds = new Set(state.actions.filter(a => a.tripId === tripId).map(a => a.id))
  return {...state,
    trips: state.trips.filter(t => t.id !== tripId),
    items: state.items.filter(i => i.tripId !== tripId),
    actions: state.actions.filter(a => a.tripId !== tripId),
    chat: state.chat.filter(m => (!m.actionId || !actionIds.has(m.actionId)) && (!m.serverActionId || !serverActions.includes(m.serverActionId))),
    decisions: state.decisions?.filter(d => d.tripId !== tripId),
    looks: state.looks?.filter(l => l.tripId !== tripId),
    photoHistory: state.photoHistory?.filter(p => p.tripId !== tripId),
    assistantUpdates: state.assistantUpdates?.filter(u => u.tripId !== tripId),
    canvas: Object.fromEntries(Object.entries(state.canvas).filter(([key]) => key !== tripId)),
  }
}
