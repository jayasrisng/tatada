import type { AppState, Booking, CanvasPos, ChatMessage, ChecklistItem, DecisionRecord, FoAction, Garment, ItineraryItem, Look, Memory, Profile, StayDetails, TravelPhoto, Trip } from '../types'
import { outcome } from '../magic/engine'
import { uid } from './id'

export type Act =
  | { type: 'importTravelPhotos'; photos: TravelPhoto[]; trips: Trip[] }
  | { type: 'deleteTravelPhoto'; id: string }
  | { type: 'markCountry'; code: string; mark: 'visited' | 'not_visited' | null }
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
  | { type: 'saveStayDetails'; tripId: string; details: StayDetails; messageId?: string }
  | { type: 'addBooking'; tripId: string; booking: Booking }
  | { type: 'applyServerOutcome'; tripId: string; itemId: string; actionId: string; done: boolean; note: string }
  | { type: 'setDecisionInput'; tripId: string; key: 'standardCheckIn' | 'policy'; value?: string; at: number }
  | { type: 'recordValidation'; tripId: string; validation: NonNullable<DecisionRecord['validation']> }
  | { type: 'addGarment'; garment: Garment }
  | { type: 'editGarment'; id: string; patch: Partial<Pick<Garment, 'name' | 'category' | 'color' | 'vibe'>> }
  | { type: 'deleteGarment'; id: string }
  | { type: 'swipeLook'; look: Look }
  | { type: 'unkeepLook'; id: string }
  | { type: 'resetLooks'; tripId: string }
  | { type: 'saveItinerary'; tripId: string; item: ItineraryItem }
  | { type: 'deleteItinerary'; tripId: string; id: string }

const patchAction = (s: AppState, id: string, fn: (a: FoAction) => FoAction): AppState => ({
  ...s,
  actions: s.actions.map((a) => (a.id === id ? fn(a) : a)),
})

export function reducer(s: AppState, a: Act): AppState {
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
        items: a.items ? addUnique(s.items, a.items) : s.items,
      }
    case 'saveStayDetails':
      return saveStayDetails(s, a.tripId, a.details, a.messageId)
    case 'addBooking':
      return { ...s, trips: s.trips.map((t) => (t.id === a.tripId ? { ...t, bookings: [...t.bookings, a.booking] } : t)) }
    case 'importTravelPhotos': {
      const seen = new Set((s.photoHistory ?? []).map((p) => p.fingerprint))
      const photos = a.photos.filter((p) => !seen.has(p.fingerprint) && !!seen.add(p.fingerprint))
      const referenced = new Set(photos.map((p) => p.tripId))
      return { ...s, trips: [...s.trips, ...a.trips.filter((t) => referenced.has(t.id) && !s.trips.some((old) => old.id === t.id))], photoHistory: [...(s.photoHistory ?? []), ...photos] }
    }
    case 'deleteTravelPhoto':
      return { ...s, photoHistory: (s.photoHistory ?? []).filter((p) => p.id !== a.id) }
    case 'markCountry': {
      const marks = { ...(s.countryMarks ?? {}) }
      if (a.mark) marks[a.code] = a.mark
      else delete marks[a.code]
      return { ...s, countryMarks: marks }
    }
    case 'addGarment':
      return { ...s, wardrobe: [...(s.wardrobe ?? []), a.garment] }
    case 'editGarment':
      return { ...s, wardrobe: (s.wardrobe ?? []).map((g) => (g.id === a.id ? { ...g, ...a.patch } : g)) }
    case 'deleteGarment':
      // Looks that relied on the garment lose it; a look with nothing left goes away.
      return {
        ...s,
        wardrobe: (s.wardrobe ?? []).filter((g) => g.id !== a.id),
        looks: (s.looks ?? []).map((l) => ({ ...l, garmentIds: l.garmentIds.filter((id) => id !== a.id) })).filter((l) => l.garmentIds.length),
      }
    case 'swipeLook': {
      const same = (l: Look) => l.tripId === a.look.tripId && [...l.garmentIds].sort().join() === [...a.look.garmentIds].sort().join()
      // One verdict per outfit per trip: swiping again replaces the old one.
      return { ...s, looks: [...(s.looks ?? []).filter((l) => !same(l)), a.look] }
    }
    case 'unkeepLook':
      return { ...s, looks: (s.looks ?? []).map((l) => (l.id === a.id ? { ...l, verdict: 'skip' } : l)) }
    case 'resetLooks':
      return { ...s, looks: (s.looks ?? []).filter((l) => l.tripId !== a.tripId) }
    case 'saveItinerary':
      return {
        ...s,
        trips: s.trips.map((t) => {
          if (t.id !== a.tripId || a.item.day < t.start || a.item.day > t.end || !a.item.title.trim()) return t
          const list = t.itinerary ?? []
          const next = list.some((i) => i.id === a.item.id) ? list.map((i) => (i.id === a.item.id ? a.item : i)) : [...list, a.item]
          return { ...t, itinerary: next.sort((x, y) => (x.day + (x.time ?? '')).localeCompare(y.day + (y.time ?? ''))) }
        }),
      }
    case 'deleteItinerary':
      return { ...s, trips: s.trips.map((t) => (t.id === a.tripId ? { ...t, itinerary: (t.itinerary ?? []).filter((i) => i.id !== a.id) } : t)) }
    case 'setDecisionInput':
      return withDecision(s, a.tripId, (d) => {
        const inputs = { ...d.inputs }
        if (!a.value) delete inputs[a.key]
        else if (a.key === 'policy') inputs.policy = { value: a.value as 'on_request' | 'not_offered', source: 'you', at: a.at }
        else inputs.standardCheckIn = { value: a.value, source: 'you', at: a.at }
        return { ...d, inputs, updatedAt: a.at }
      })
    case 'recordValidation': {
      const cur = s.decisions?.find((d) => d.tripId === a.tripId && d.topic === 'early_checkin')?.validation
      const v = a.validation
      if (cur && cur.actionId === v.actionId && cur.status === v.status && cur.outcome === v.outcome) return s
      // A real (live) result is never replaced by a mock one.
      if (cur?.provider === 'live' && cur.status === 'verified' && v.provider === 'mock') return s
      return withDecision(s, a.tripId, (d) => ({ ...d, validation: v, updatedAt: v.at }))
    }
    case 'applyServerOutcome':
      return {
        ...s,
        items: s.items.map((i) =>
          // Only the same trip's task, and never re-open a finished one.
          i.id === a.itemId && i.tripId === a.tripId ? { ...i, done: i.done || a.done, note: a.note, actionId: a.actionId } : i,
        ),
      }
    case 'clearChat':
      return { ...s, chat: [] }
    case 'approve':
      return patchAction(s, a.id, (x) => x.status !== 'proposed' || !a.script.trim() || x.mode !== 'simulated' ? x : ({
        ...x,
        script: a.script.trim(),
        status: 'running',
        log: [{ text: 'You approved this', at: Date.now() }],
      }))
    case 'cancel':
      return patchAction(s, a.id, (x) => x.status === 'proposed' || x.status === 'needs_input' ? { ...x, status: 'cancelled' } : x)
    case 'answer':
      return patchAction(s, a.id, (x) => x.status !== 'needs_input' || !x.plan[x.cursor]?.question?.options.includes(a.answer) ? x : ({
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
  if (!act || act.mode !== 'simulated') return s
  const now = Date.now()

  if (act.status === 'running') {
    if (act.cursor < act.plan.length) {
      const step = act.plan[act.cursor]
      if (step.question) {
        return patchAction(s, id, (x) => ({ ...x, status: 'needs_input', log: [...x.log, { text: step.text, at: now }] }))
      }
      return patchAction(s, id, (x) => ({ ...x, cursor: x.cursor + 1, log: [...x.log, { text: step.text, at: now }] }))
    }
    const res = outcome(act.outcomeKey, act.answers, act.outcomeData)
    if (res === 'cancelled') {
      return patchAction(s, id, (x) => ({
        ...x,
        status: 'cancelled',
        result: { summary: 'You declined the offered times. Fo thanked the host and hung up. Nothing was booked.', evidence: [] },
      }))
    }
    return patchAction(s, id, (x) => ({ ...x, status: 'done', result: { summary: res.summary, evidence: res.evidence } }))
  }

  if (act.status === 'done') {
    // A completion claim alone cannot verify an action or finish a task.
    if (!act.result?.evidence.some((e) => e.trim())) {
      return patchAction(s, id, (x) => ({ ...x, status: 'failed', log: [...x.log, { text: 'No evidence was provided; outcome could not be verified', at: now }] }))
    }
    const res = outcome(act.outcomeKey, act.answers, act.outcomeData)
    let next = patchAction(s, id, (x) => ({ ...x, status: 'verified', log: [...x.log, { text: 'Outcome verified against evidence', at: now }] }))
    if (res === 'cancelled') return patchAction(s, id, (x) => ({ ...x, status: 'cancelled' }))
    if (act.checklistItemId) {
      next = {
        ...next,
        items: next.items.map((i) =>
          i.id === act.checklistItemId && i.tripId === act.tripId
            ? { ...i, done: i.done || res.itemDone, note: res.booking?.ref ?? res.itemNote ?? i.note, actionId: act.id }
            : i,
        ),
      }
    }
    if (res.booking && act.tripId) {
      const booking = { ...res.booking, id: uid() }
      next = { ...next, trips: next.trips.map((t) => (t.id === act.tripId ? { ...t, bookings: [...t.bookings, booking] } : t)) }
    }
    return next
  }
  return s
}


const key = (i: Pick<ChecklistItem, 'tripId' | 'text'>) => `${i.tripId ?? ''}::${i.text.trim().toLowerCase()}`

/** Adds items, skipping any the same trip already has. */
function addUnique(existing: ChecklistItem[], incoming: ChecklistItem[]): ChecklistItem[] {
  const seen = new Set(existing.map(key))
  const out = [...existing]
  for (const item of incoming) {
    if (seen.has(key(item))) continue
    seen.add(key(item))
    out.push(item)
  }
  return out
}

/** Stores booking details the traveler typed in, so we never ask twice. */
function saveStayDetails(s: AppState, tripId: string, d: StayDetails, messageId?: string): AppState {
  const val = (v?: string) => (v && v.trim() ? v.trim() : undefined)
  const chat = messageId ? s.chat.map((m) => (m.id === messageId && m.form ? { ...m, form: { ...m.form, submitted: true } } : m)) : s.chat
  return {
    ...s,
    chat,
    trips: s.trips.map((t) => {
      if (t.id !== tripId) return t
      const stay = t.bookings.find((b) => b.kind === 'stay')
      const patch = {
        ...(val(d.hotelName) && { title: val(d.hotelName)! }),
        ...(val(d.hotelEmail) && { contact: val(d.hotelEmail) }),
        ...(val(d.checkIn) && { checkIn: val(d.checkIn) }),
        ...(val(d.ref) && { ref: val(d.ref)! }),
      }
      const bookings = stay
        ? t.bookings.map((b) => (b === stay ? { ...b, ...patch } : b))
        : val(d.hotelName)
          ? [...t.bookings, { id: uid(), kind: 'stay' as const, title: val(d.hotelName)!, when: val(d.checkIn) ?? '', ref: val(d.ref) ?? '', detail: 'added by you', simulated: false, ...patch }]
          : t.bookings
      const day = val(d.checkIn) ?? stay?.checkIn ?? t.arrival?.split('T')[0]
      const arrival = val(d.arrivalTime) && day ? `${day}T${val(d.arrivalTime)}` : t.arrival
      return { ...t, bookings, arrival }
    }),
  }
}

function withDecision(s: AppState, tripId: string, fn: (d: DecisionRecord) => DecisionRecord): AppState {
  if (!s.trips.some((t) => t.id === tripId)) return s
  const list = s.decisions ?? []
  const cur = list.find((d) => d.tripId === tripId && d.topic === 'early_checkin') ?? { tripId, topic: 'early_checkin' as const, inputs: {}, updatedAt: 0 }
  const next = fn(cur)
  return { ...s, decisions: [...list.filter((d) => d !== cur), next] }
}
