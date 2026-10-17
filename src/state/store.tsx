import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { AppState, CanvasPos, ChatMessage, ChecklistItem, FoAction, Memory, Profile, Trip } from '../types'
import { seed } from '../data/seed'
import { outcome, think } from '../magic/engine'

const KEY = 'tatada:v1'
export const uid = () => Math.random().toString(36).slice(2, 9)

type Act =
  | { type: 'reset'; state: AppState }
  | { type: 'onboard'; profile: Profile }
  | { type: 'addTrip'; trip: Trip; items: ChecklistItem[] }
  | { type: 'toggleItem'; id: string }
  | { type: 'editItem'; id: string; text: string }
  | { type: 'addItem'; item: ChecklistItem }
  | { type: 'deleteItem'; id: string }
  | { type: 'choose'; tripId: string; optionId: string }
  | { type: 'addMemory'; tripId: string; memory: Memory }
  | { type: 'moveCard'; id: string; pos: CanvasPos }
  | { type: 'chat'; messages: ChatMessage[]; action?: FoAction; items?: ChecklistItem[] }
  | { type: 'clearChat' }
  | { type: 'approve'; id: string; script: string }
  | { type: 'cancel'; id: string }
  | { type: 'answer'; id: string; answer: string }
  | { type: 'tick'; id: string }

const patchAction = (s: AppState, id: string, fn: (a: FoAction) => FoAction): AppState => ({
  ...s,
  actions: s.actions.map((a) => (a.id === id ? fn(a) : a)),
})

function reducer(s: AppState, a: Act): AppState {
  switch (a.type) {
    case 'reset':
      return a.state
    case 'onboard':
      return { ...s, onboarded: true, profile: a.profile }
    case 'addTrip':
      return { ...s, trips: [a.trip, ...s.trips], items: [...s.items, ...a.items] }
    case 'toggleItem':
      return { ...s, items: s.items.map((i) => (i.id === a.id ? { ...i, done: !i.done } : i)) }
    case 'editItem':
      return { ...s, items: s.items.map((i) => (i.id === a.id ? { ...i, text: a.text } : i)) }
    case 'addItem':
      return { ...s, items: [...s.items, a.item] }
    case 'deleteItem':
      return { ...s, items: s.items.filter((i) => i.id !== a.id) }
    case 'choose':
      return {
        ...s,
        trips: s.trips.map((t) => {
          if (t.id !== a.tripId) return t
          const target = t.options.find((o) => o.id === a.optionId)
          if (!target) return t
          return {
            ...t,
            options: t.options.map((o) =>
              o.id === a.optionId
                ? { ...o, status: 'chosen', reason: o.reason ?? 'You picked this one.' }
                : o.category === target.category && o.status === 'chosen'
                  ? { ...o, status: 'considering' }
                  : o,
            ),
          }
        }),
      }
    case 'addMemory':
      return { ...s, trips: s.trips.map((t) => (t.id === a.tripId ? { ...t, memories: [...t.memories, a.memory] } : t)) }
    case 'moveCard':
      return { ...s, canvas: { ...s.canvas, [a.id]: a.pos } }
    case 'chat':
      return {
        ...s,
        chat: [...s.chat, ...a.messages],
        actions: a.action ? [...s.actions, a.action] : s.actions,
        items: a.items ? [...s.items, ...a.items] : s.items,
      }
    case 'clearChat':
      return { ...s, chat: [] }
    case 'approve':
      return patchAction(s, a.id, (x) => ({
        ...x,
        script: a.script,
        status: 'running',
        log: [{ text: 'You approved this', at: Date.now() }],
      }))
    case 'cancel':
      return patchAction(s, a.id, (x) => ({ ...x, status: 'cancelled' }))
    case 'answer':
      return patchAction(s, a.id, (x) => ({
        ...x,
        status: 'running',
        answers: [...x.answers, a.answer],
        cursor: x.cursor + 1,
        log: [...x.log, { text: `You chose: ${a.answer}`, at: Date.now() }],
      }))
    case 'tick':
      return tick(s, a.id)
  }
}

function tick(s: AppState, id: string): AppState {
  const act = s.actions.find((x) => x.id === id)
  if (!act) return s
  const now = Date.now()

  if (act.status === 'running') {
    if (act.cursor < act.plan.length) {
      const step = act.plan[act.cursor]
      if (step.question) {
        return patchAction(s, id, (x) => ({ ...x, status: 'needs_input', log: [...x.log, { text: step.text, at: now }] }))
      }
      return patchAction(s, id, (x) => ({ ...x, cursor: x.cursor + 1, log: [...x.log, { text: step.text, at: now }] }))
    }
    const res = outcome(act.outcomeKey, act.answers)
    if (res === 'cancelled') {
      return patchAction(s, id, (x) => ({
        ...x,
        status: 'cancelled',
        result: { summary: 'You declined both times. Fo thanked the host and hung up. Nothing was booked.', evidence: [] },
      }))
    }
    return patchAction(s, id, (x) => ({ ...x, status: 'done', result: { summary: res.summary, evidence: res.evidence } }))
  }

  if (act.status === 'done') {
    // Verified only once the outcome has evidence attached.
    const res = outcome(act.outcomeKey, act.answers)
    let next = patchAction(s, id, (x) => ({ ...x, status: 'verified', log: [...x.log, { text: 'Outcome verified against evidence', at: now }] }))
    if (res !== 'cancelled') {
      if (act.checklistItemId) {
        next = {
          ...next,
          items: next.items.map((i) =>
            i.id === act.checklistItemId ? { ...i, done: true, note: res.booking?.ref ?? 'done by Fo', actionId: act.id } : i,
          ),
        }
      }
      if (res.booking && act.tripId) {
        const booking = { ...res.booking, id: uid() }
        next = { ...next, trips: next.trips.map((t) => (t.id === act.tripId ? { ...t, bookings: [...t.bookings, booking] } : t)) }
      }
    }
    return next
  }
  return s
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* fall through to seed */
  }
  return seed()
}

interface Store {
  state: AppState
  dispatch: React.Dispatch<Act>
  ask: (prompt: string, tripId?: string, checklistItemId?: string) => void
  resetDemo: (fresh?: boolean) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  // Drives simulated Fo actions forward, one step at a time.
  useEffect(() => {
    const timers = state.actions
      .filter((a) => a.status === 'running' || a.status === 'done')
      .map((a) => window.setTimeout(() => dispatch({ type: 'tick', id: a.id }), a.status === 'done' ? 1100 : 1400))
    return () => timers.forEach(clearTimeout)
  }, [state.actions])

  const ask = (prompt: string, tripId?: string, checklistItemId?: string) => {
    const trip = state.trips.find((t) => t.id === tripId)
    const reply = think(prompt, trip, checklistItemId)
    const action: FoAction | undefined = reply.action && {
      ...reply.action,
      id: uid(),
      createdAt: Date.now(),
      status: 'proposed',
      cursor: 0,
      log: [],
      answers: [],
      mode: 'simulated',
    }
    const items = reply.addItems?.map((i) => ({ ...i, id: uid() }))
    dispatch({
      type: 'chat',
      messages: [
        { id: uid(), from: 'me', text: prompt },
        { id: uid(), from: 'tatada', text: reply.text, bullets: reply.bullets, actionId: action?.id, addedItems: items?.map((i) => i.text) },
      ],
      action,
      items,
    })
  }

  const resetDemo = (fresh = false) => {
    const s = seed()
    dispatch({ type: 'reset', state: fresh ? { ...s, onboarded: false } : s })
  }

  return <Ctx.Provider value={{ state, dispatch, ask, resetDemo }}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}
