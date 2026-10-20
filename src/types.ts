export type Phase = 'discover' | 'plan' | 'prepare' | 'travel' | 'remember'

export const PHASES: { id: Phase; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'plan', label: 'Plan' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'travel', label: 'Travel' },
  { id: 'remember', label: 'Remember' },
]

export type ItemKind = 'booking' | 'task' | 'doc' | 'pack' | 'idea' | 'memory'

export interface ChecklistItem {
  id: string
  tripId?: string // undefined = standalone task
  text: string
  phase: Phase
  done: boolean
  kind: ItemKind
  note?: string
  /** A Magic prompt that would let Fo handle this item. */
  priority?: boolean
  magicPrompt?: string
  actionId?: string
}

export type Category = 'flight' | 'stay' | 'move' | 'eat'

export interface Source {
  label: string
  kind: 'reviews' | 'official' | 'fares' | 'forum' | 'map'
}

export interface ResearchOption {
  id: string
  category: Category
  title: string
  subtitle: string
  price: string
  status: 'chosen' | 'considering' | 'rejected'
  /** Why chosen, or why rejected. */
  reason?: string
  highlights: string[]
  tradeoffs: string[]
  metrics: Record<string, string>
  sources: Source[]
}

export interface Booking {
  paidPrice?: {amount:string;currency:string}

  importHash?: string
  originalId?: string
  departureZone?: string
  arrivalZone?: string
  address?: string
  arrivesAt?: string
  flight?: { airline: string; number: string; from: string; to: string }
  id: string
  kind: 'flight' | 'stay' | 'dinner' | 'transfer' | 'activity'
  title: string
  when: string
  ref: string
  detail: string
  simulated: boolean
  /** Stay bookings: ISO dates. */
  checkIn?: string
  checkOut?: string
  /** Email address the traveler supplied for this booking. */
  contact?: string
  /** Local start time, 'YYYY-MM-DDTHH:mm'. */
  at?: string
}

export interface Memory {
  /** Bundled illustration, restricted to known assets rather than remote image URLs. */
  illustration?: 'sydney-harbour' | 'sydney-lunch'
  /** Compact JPEG, saved with this account and included in private exports. */
  image?: string
  id: string
  day: string
  text: string
  kind: 'note' | 'photo' | 'receipt'
  place?: string
  tint?: 'yellow' | 'pink' | 'blue' | 'green' | 'orange'
}

export interface SavedResearch {
  id: string
  checkedAt: string
  model: string
  searched: boolean
  sections: { text: string; sources: { url: string; title: string }[] }[]
}

export type JourneyStep = 'flight' | 'arrival' | 'stay' | 'days' | 'onward'

export interface TripPlanning {
  origin: string
  transport: 'drive' | 'rental-car' | 'flight' | 'rail' | 'other'
  arriveBy: string
  homeBy: string
  goals: string
}
export interface PlanGuide {
  checkedAt: string
  summary: string
  packing: string[]
  notes: {title: string; text: string; url?: string}[]
}
export interface TripTurn {stopId?:string;id:string;from:'you'|'magic';text:string;at:string}

export interface Trip {
  conversation?:TripTurn[]
  planning?: TripPlanning
  planGuide?: PlanGuide
  timeZone?: string
  journeyDone?: Partial<Record<JourneyStep, boolean>>
  mapPlaces?: {name: string; lat: number; lon: number}[]
  presentation?: boolean
  destinationPoint?: { lat: number; lon: number }
  research?: SavedResearch[]
  id: string
  destination: string
  country: string
  start: string // ISO date
  end: string
  travelers: number
  companions: string
  budget: number
  vibe: string[]
  constraints: string[]
  discounts: string[]
  status: 'planning' | 'upcoming' | 'past'
  tint: 'yellow' | 'pink' | 'blue' | 'green' | 'orange'
  summary: Partial<Record<Category, string>>
  options: ResearchOption[]
  bookings: Booking[]
  memories: Memory[]
  localAddress?: string
  /** Day-by-day plan the traveler can add to, edit, and delete. */
  itinerary?: ItineraryItem[]
  /** Expected arrival at the destination, local 'YYYY-MM-DDTHH:mm'. */
  arrival?: string
  /** Scripted sample scenarios exist only for fixture trips. */
  demoScenario?: 'lisbon'
}

export type ActionStatus =
  | 'proposed'
  | 'running'
  | 'needs_input'
  | 'done'
  | 'verified'
  | 'failed'
  | 'cancelled'

export interface ActionStep {
  text: string
  question?: { text: string; options: string[] }
}

export interface FoAction {
  id: string
  tripId?: string
  title: string
  channel: 'email' | 'call' | 'fo'
  recipient: { name: string; contact: string }
  script: string
  dataShared: string[]
  cost: string
  risk: 'low' | 'medium' | 'high'
  mode: 'simulated' | 'real'
  status: ActionStatus
  plan: ActionStep[]
  cursor: number
  log: { text: string; at: number }[]
  answers: string[]
  result?: { summary: string; evidence: string[] }
  /** Builds the outcome from the user's answers once the plan finishes. */
  outcomeKey?: string
  outcomeData?: { demo: boolean; transfer?: boolean }
  /** Structured email for stay requests; the server path sends exactly this. */
  email?: EmailDraft
  checklistItemId?: string
  createdAt: number
}

export type StayIntent = 'early_checkin' | 'delay'

export interface EmailDraft {
  intent: StayIntent
  to: string
  toName: string
  subject: string
  body: string
  transferQuote: boolean
}

export interface StayDetails {
  hotelName?: string
  hotelEmail?: string
  checkIn?: string
  arrivalTime?: string
  ref?: string
}

export interface DetailsField {
  key: keyof StayDetails
  label: string
  type: 'text' | 'email' | 'date' | 'time'
  required: boolean
  placeholder?: string
}

export interface DetailsForm {
  intent: StayIntent
  tripId: string
  itemId?: string
  prompt: string
  fields: DetailsField[]
  submitted?: boolean
}

export interface ChatMessage {
  id: string
  from: 'me' | 'tatada'
  text: string
  actionId?: string
  bullets?: string[]
  addedItems?: string[]
  form?: DetailsForm
  /** Action owned by the Tatada server (real or mock Fo). */
  serverActionId?: string
}

export interface Profile {
  name: string
  homeBases?: string[]
  personalNeeds?: string[]
  homeAirport: string
  style: string[]
  diet: string[]
  memberships: string[]
}

/* ── Decision records (Diverge → Collide → Converge → Validate) ── */

/** hypothesis: plausible, unconfirmed · fact: from your trip or your own entry · outcome: what execution actually produced */
export type ClaimKind = 'hypothesis' | 'fact' | 'outcome'
export type ClaimStatus = 'open' | 'holds' | 'disqualified' | 'confirmed' | 'refuted'

export interface Provenance {
  kind: 'trip' | 'you' | 'demo' | 'general' | 'fo_live' | 'fo_mock'
  label: string
  /** When the source said it (ms). Absent for timeless general knowledge. */
  at?: number
}

export interface Claim {
  id: string
  text: string
  kind: ClaimKind
  status: ClaimStatus
  source: Provenance
  /** Why this isn't settled, in words. No numeric confidence. */
  uncertainty?: string
  evidence?: string[]
}

export interface Collision {
  between: string[]
  note: string
  disqualifier: boolean
}

export type Verdict = 'ask' | 'not_needed' | 'dont_ask' | 'need_info' | 'awaiting_reply' | 'confirmed' | 'declined'

export interface DecisionInput<T extends string = string> {
  value: T
  source: 'you' | 'demo'
  at: number
}

/** What persists: the traveler's inputs and the validation result. Claims are derived. */
export interface DecisionRecord {
  tripId: string
  topic: 'early_checkin'
  inputs: {
    standardCheckIn?: DecisionInput
    policy?: DecisionInput<'on_request' | 'not_offered'>
  }
  validation?: {
    actionId: string
    provider: 'live' | 'mock'
    status: 'verified' | 'unverified'
    outcome?: string
    summary: string
    evidence: string[]
    at: number
  }
  updatedAt: number
}

export interface CanvasPos {
  x: number
  y: number
  r: number
}

export interface AppliedUpdate {id:string;tripId:string;kind:'task'|'itinerary'|'journal';recordId:string;snapshot:string;undone:boolean}

export interface AppState {
  assistantUpdates?: AppliedUpdate[]
  onboarded: boolean
  profile: Profile
  trips: Trip[]
  items: ChecklistItem[]
  actions: FoAction[]
  chat: ChatMessage[]
  canvas: Record<string, CanvasPos>
  decisions?: DecisionRecord[]
  /** Read-only history of Fo requests brought in by an import. Never re-executed. */
  archivedActions?: ArchivedAction[]
  /** Clothes from the traveler's own photos or camera. */
  photoHistory?: TravelPhoto[]
  wardrobe?: Garment[]
  /** Outfits kept or skipped while swiping, per trip (or 'today'). */
  looks?: Look[]
  /** Countries ticked or unticked by hand, keyed by ISO code. Overrides what photos imply. */
  countryMarks?: Record<string, 'visited' | 'not_visited'>
}

/* ── Style ── */

export type GarmentCategory = 'top' | 'bottom' | 'dress' | 'layer' | 'shoes'
export type Vibe = 'casual' | 'dressy' | 'active' | 'warm'
export type DressCode = 'casual' | 'active' | 'dressy' | 'cold'

export interface Garment {
  id: string
  name: string
  category: GarmentCategory
  /** Main color, used to draw it on the avatar. */
  color: string
  vibe: Vibe[]
  /** '/wardrobe/x.png' for extracted photos, or a small data: URL from the camera. */
  image?: string
  source: 'photo' | 'camera'
  /** A transparent garment image suitable for layering on the figure. */
  isolated?: boolean
  /** SHA-256 of the photo it was detected in, so the same photo isn't imported twice. */
  sourceFingerprint?: string
  addedAt: number
}

export interface Look {
  id: string
  tripId: string
  garmentIds: string[]
  day?: string
  verdict: 'keep' | 'skip'
  at: number
}

export interface ItineraryItem {
  done?: boolean
  id: string
  day: string
  time?: string
  title: string
  dress: DressCode
  note?: string
}

export interface ArchivedAction {
  id: string
  provider: 'live' | 'mock' | 'simulated'
  status: string
  title: string
  to?: string
  outcome?: string
  summary?: string
  evidence: string[]
  progress: { at: number; text: string }[]
}

export interface TravelPhoto {
  id: string
  tripId?: string
  fingerprint: string
  filename: string
  capturedAt: string
  dateSource: 'exif' | 'you'
  city: string
  country: string
  /** A named place (venue, landmark, neighborhood) the traveler confirmed. Never derived from bare coordinates. */
  place?: string
  /** Where the labels came from: photo metadata, a reverse-geocoding proposal the traveler accepted, or typed by them. */
  labelSource?: 'metadata' | 'geocoded' | 'you'
  lat?: number
  lon?: number
  image: string
}
