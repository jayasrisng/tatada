import type { AppState } from '../types'
import { seed } from '../data/seed'

export const STORAGE_KEY = 'tatada:v1'
export const RECOVERY_KEY = `${STORAGE_KEY}:recovery`
type Check = (value: unknown) => boolean
const str: Check = (v) => typeof v === 'string'
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const bool: Check = (v) => typeof v === 'boolean'
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const optional = (check: Check): Check => (v) => v === undefined || check(v)
const list = (check: Check): Check => (v) => Array.isArray(v) && v.every(check)
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v)
const shape = (fields: Record<string, Check>): Check => (v) => object(v) && Object.entries(fields).every(([key, check]) => check(v[key]))
const record = (check: Check): Check => (v) => object(v) && Object.values(v).every(check)
const strings = list(str)
const tint = oneOf('yellow', 'pink', 'blue', 'green', 'orange')
const phase = oneOf('discover', 'plan', 'prepare', 'travel', 'remember')
const category = oneOf('flight', 'stay', 'move', 'eat')
const result = shape({ summary: str, evidence: strings })
const intent = oneOf('early_checkin', 'delay')
const email = shape({ intent, to: str, toName: str, subject: str, body: str, transferQuote: bool })
const form = shape({ intent, tripId: str, itemId: optional(str), prompt: str, submitted: optional(bool),
  fields: list(shape({ key: oneOf('hotelName', 'hotelEmail', 'checkIn', 'arrivalTime', 'ref'), label: str,
    type: oneOf('text', 'email', 'date', 'time'), required: bool, placeholder: optional(str) })) })
const action = shape({
  id: str, tripId: optional(str), title: str, channel: oneOf('email', 'call', 'fo'),
  recipient: shape({ name: str, contact: str }), script: str, dataShared: strings, cost: str,
  risk: oneOf('low', 'medium', 'high'), mode: oneOf('simulated', 'real'),
  status: oneOf('proposed', 'running', 'needs_input', 'done', 'verified', 'failed', 'cancelled'),
  plan: list(shape({ text: str, question: optional(shape({ text: str, options: strings })) })),
  cursor: (v) => num(v) && Number.isInteger(v) && (v as number) >= 0,
  log: list(shape({ text: str, at: num })), answers: strings, result: optional(result),
  outcomeKey: optional(str), checklistItemId: optional(str), createdAt: num,
  outcomeData: optional(shape({ demo: bool, transfer: optional(bool) })), email: optional(email),
})
const trip = shape({
  id: str, destination: str, country: str, start: str, end: str, travelers: num, companions: str,
  budget: num, vibe: strings, constraints: strings, discounts: strings,
  status: oneOf('planning', 'upcoming', 'past'), tint, summary: record(str), localAddress: optional(str),
  arrival: optional(str), demoScenario: optional(oneOf('lisbon')),
  itinerary: optional(list(shape({ id: str, day: str, time: optional(str), title: str, dress: oneOf('casual', 'active', 'dressy', 'cold'), note: optional(str) }))),
  options: list(shape({ id: str, category, title: str, subtitle: str, price: str,
    status: oneOf('chosen', 'considering', 'rejected'), reason: optional(str), highlights: strings,
    tradeoffs: strings, metrics: record(str), sources: list(shape({ label: str, kind: oneOf('reviews', 'official', 'fares', 'forum', 'map') })) })),
  bookings: list(shape({ id: str, kind: oneOf('flight', 'stay', 'dinner', 'transfer', 'activity'), title: str, when: str, ref: str, detail: str, simulated: bool,
    checkIn: optional(str), checkOut: optional(str), contact: optional(str), at: optional(str) })),
  memories: list(shape({ id: str, day: str, text: str, kind: oneOf('note', 'photo', 'receipt'), place: optional(str), tint: optional(tint) })),
})
const stateShape = shape({
  onboarded: bool,
  profile: shape({ name: str, homeAirport: str, style: strings, diet: strings, memberships: strings }),
  trips: list(trip),
  items: list(shape({ id: str, tripId: optional(str), text: str, phase, done: bool,
    kind: oneOf('booking', 'task', 'doc', 'pack', 'idea', 'memory'), note: optional(str), magicPrompt: optional(str), actionId: optional(str) })),
  actions: list(action),
  chat: list(shape({ id: str, from: oneOf('me', 'tatada'), text: str, actionId: optional(str), bullets: optional(strings), addedItems: optional(strings),
    form: optional(form), serverActionId: optional(str) })),
  canvas: record(shape({ x: num, y: num, r: num })),
  wardrobe: optional(list(shape({
    id: str, name: str, category: oneOf('top', 'bottom', 'dress', 'layer', 'shoes'), color: str,
    vibe: list(oneOf('casual', 'dressy', 'active', 'warm')), image: optional(str), source: oneOf('photo', 'camera'), isolated: optional(bool), addedAt: num,
  }))),
  looks: optional(list(shape({ id: str, tripId: str, garmentIds: strings, day: optional(str), verdict: oneOf('keep', 'skip'), at: num }))),
  archivedActions: optional(list(shape({
    id: str, provider: oneOf('live', 'mock', 'simulated'), status: str, title: str, to: optional(str),
    outcome: optional(str), summary: optional(str), evidence: strings, progress: list(shape({ at: num, text: str })),
  }))),
  decisions: optional(list(shape({
    tripId: str, topic: oneOf('early_checkin'), updatedAt: num,
    inputs: shape({
      standardCheckIn: optional(shape({ value: str, source: oneOf('you', 'demo'), at: num })),
      policy: optional(shape({ value: oneOf('on_request', 'not_offered'), source: oneOf('you', 'demo'), at: num })),
    }),
    validation: optional(shape({ actionId: str, provider: oneOf('live', 'mock'), status: oneOf('verified', 'unverified'),
      outcome: optional(str), summary: str, evidence: strings, at: num })),
  }))),
})
export const isAppState = (value: unknown): value is AppState => stateShape(value)
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>

// Receive storage lazily: even accessing window.localStorage can throw.
/** Storage key for one account's local cache. Accounts on a shared browser never share a key. */
export const accountKey = (accountId: string) => `${STORAGE_KEY}:acct:${accountId}`

export function loadState(storage: () => StorageAccess, key = STORAGE_KEY, fallback: () => AppState = seed): { state: AppState; warning: string | null } {
  const recovery = `${key}:recovery`
  try {
    const target = storage()
    const raw = target.getItem(key)
    if (raw === null) return { state: fallback(), warning: null }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { /* handled as invalid below */ }
    if (isAppState(parsed)) return { state: parsed, warning: null }
    // Keep the original data before allowing the recovered session to persist.
    target.setItem(recovery, raw)
    return { state: fallback(), warning: `Saved data could not be loaded. A fresh copy was started; the original is backed up and can be downloaded from your profile.` }
  } catch {
    return { state: fallback(), warning: 'Browser storage is unavailable. Changes may be lost when you close or reload this page.' }
  }
}

export function saveState(state: AppState, storage: () => StorageAccess, key = STORAGE_KEY): boolean {
  try { storage().setItem(key, JSON.stringify(state)); return true } catch { return false }
}
