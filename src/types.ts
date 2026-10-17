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
  id: string
  kind: 'flight' | 'stay' | 'dinner' | 'transfer' | 'activity'
  title: string
  when: string
  ref: string
  detail: string
  simulated: boolean
}

export interface Memory {
  id: string
  day: string
  text: string
  kind: 'note' | 'photo' | 'receipt'
  place?: string
  tint?: 'yellow' | 'pink' | 'blue' | 'green' | 'orange'
}

export interface Trip {
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
  checklistItemId?: string
  createdAt: number
}

export interface ChatMessage {
  id: string
  from: 'me' | 'tatada'
  text: string
  actionId?: string
  bullets?: string[]
  addedItems?: string[]
}

export interface Profile {
  name: string
  homeAirport: string
  style: string[]
  diet: string[]
  memberships: string[]
}

export interface CanvasPos {
  x: number
  y: number
  r: number
}

export interface AppState {
  onboarded: boolean
  profile: Profile
  trips: Trip[]
  items: ChecklistItem[]
  actions: FoAction[]
  chat: ChatMessage[]
  canvas: Record<string, CanvasPos>
}
