/** Shared browser/server nested workspace contract; no provider or private document fields. */
type Check = (value: unknown) => boolean
const str: Check = (v) => typeof v === 'string' && v.length <= 2_000_000
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const bool: Check = (v) => typeof v === 'boolean'
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const optional = (check: Check): Check => (v) => v === undefined || check(v)
const list = (check: Check): Check => (v) => Array.isArray(v) && v.length <= 10000 && v.every(check)
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v)
const shape = (fields: Record<string, Check>): Check => (v) => object(v) && Object.keys(v).every(k => Object.hasOwn(fields, k)) && Object.entries(fields).every(([key, check]) => check(v[key]))
const record = (check: Check): Check => (v) => object(v) && Object.entries(v).every(([k, value]) => !['__proto__','constructor','prototype'].includes(k) && check(value))
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
  timeZone: optional(str),
  journeyDone: optional(v => object(v) && Object.entries(v).every(([key, value]) => ['flight','arrival','stay','days','onward'].includes(key) && bool(value))),
  mapPlaces: optional(list(shape({name: str, lat: num, lon: num}))), presentation: optional(bool), destinationPoint: optional(shape({ lat: num, lon: num })),
  research: optional(list(shape({ id: str, checkedAt: str, model: str, searched: bool, sections: list(shape({ text: str, sources: list(shape({ url: str, title: str })) })) }))),
  id: str, destination: str, country: str, start: str, end: str, travelers: num, companions: str,
  budget: num, vibe: strings, constraints: strings, discounts: strings,
  status: oneOf('planning', 'upcoming', 'past'), tint, summary: record(str), localAddress: optional(str),
  arrival: optional(str), demoScenario: optional(oneOf('lisbon')),
  itinerary: optional(list(shape({ done: optional(bool), id: str, day: str, time: optional(str), title: str, dress: oneOf('casual', 'active', 'dressy', 'cold'), note: optional(str) }))),
  options: list(shape({ id: str, category, title: str, subtitle: str, price: str,
    status: oneOf('chosen', 'considering', 'rejected'), reason: optional(str), highlights: strings,
    tradeoffs: strings, metrics: record(str), sources: list(shape({ label: str, kind: oneOf('reviews', 'official', 'fares', 'forum', 'map') })) })),
  bookings: list(shape({ paidPrice:optional(shape({amount:(v)=>typeof v==='string'&&/^\d{1,9}(?:\.\d{1,2})?$/.test(v),currency:(v)=>typeof v==='string'&&/^[A-Z]{3}$/.test(v)})), importHash: optional(str),originalId:optional(str),departureZone:optional(str),arrivalZone:optional(str), address: optional(str), arrivesAt: optional(str), flight: optional(shape({airline:str,number:str,from:str,to:str})), id: str, kind: oneOf('flight', 'stay', 'dinner', 'transfer', 'activity'), title: str, when: str, ref: str, detail: str, simulated: bool,
    checkIn: optional(str), checkOut: optional(str), contact: optional(str), at: optional(str) })),
  memories: list(shape({ illustration: optional(oneOf('sydney-harbour','sydney-lunch')), image: optional((v) => typeof v === 'string' && v.length <= 90000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)), id: str, day: str, text: str, kind: oneOf('note', 'photo', 'receipt'), place: optional(str), tint: optional(tint) })),
})
const stateShape = shape({
  assistantUpdates: optional(list(shape({id:str,tripId:str,kind:oneOf('task','itinerary','journal'),recordId:str,snapshot:str,undone:bool}))),
  onboarded: bool,
  profile: shape({ name: str, homeAirport: str, homeBases: optional(strings), personalNeeds: optional(strings), style: strings, diet: strings, memberships: strings }),
  trips: list(trip),
  items: list(shape({ id: str, tripId: optional(str), text: str, phase, done: bool,
    kind: oneOf('booking', 'task', 'doc', 'pack', 'idea', 'memory'), note: optional(str), priority: optional(bool), magicPrompt: optional(str), actionId: optional(str) })),
  actions: list(action),
  chat: list(shape({ id: str, from: oneOf('me', 'tatada'), text: str, actionId: optional(str), bullets: optional(strings), addedItems: optional(strings),
    form: optional(form), serverActionId: optional(str) })),
  canvas: record(shape({ x: num, y: num, r: num })),
  photoHistory: optional(list(shape({ id: str, tripId: optional(str), fingerprint: str, filename: str, capturedAt: str, dateSource: oneOf('exif', 'you'), city: str, country: str, place: optional(str), labelSource: optional(oneOf('metadata', 'geocoded', 'you')), lat: optional(num), lon: optional(num), image: str }))),
  countryMarks: optional(record(oneOf('visited', 'not_visited'))),
  wardrobe: optional(list(shape({
    id: str, name: str, category: oneOf('top', 'bottom', 'dress', 'layer', 'shoes'), color: str,
    vibe: list(oneOf('casual', 'dressy', 'active', 'warm')), image: optional(str), source: oneOf('photo', 'camera'), isolated: optional(bool), sourceFingerprint: optional(str), addedAt: num,
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
const iso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const time = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
const stamp = (v: string) => iso(v.slice(0,10)) && (v.length===10 || v.length===16&&v[10]==='T'&&time(v.slice(11)))
const zone = (v: string | undefined) => {if (!v) return true;try{new Intl.DateTimeFormat('en',{timeZone:v});return v==='UTC'||v.includes('/')}catch{return false}}
const unique = (rows: {id:string}[]) => rows.every(r=>r.id.trim().length>0&&r.id.length<=200) && new Set(rows.map(r=>r.id)).size===rows.length
export function validateWorkspace(value: unknown): boolean {
  if (!stateShape(value)) return false
  const v = value as {trips: {id:string;start:string;end:string;travelers:number;budget:number;timeZone?:string;bookings: {id:string;at?:string;arrivesAt?:string;checkIn?:string;checkOut?:string;departureZone?:string;arrivalZone?:string}[];itinerary?:{id:string;day:string;time?:string}[];memories:{id:string;day:string}[]}[];items:{id:string;tripId?:string}[];actions:{id:string}[];chat:{id:string}[]}
  if (!unique(v.trips)||!unique(v.items)||!unique(v.actions)||!unique(v.chat)) return false
  return v.trips.every(t=>iso(t.start)&&iso(t.end)&&t.end>=t.start&&Number.isInteger(t.travelers)&&t.travelers>0&&t.budget>=0&&zone(t.timeZone)&&unique(t.bookings)&&unique(t.itinerary??[])&&unique(t.memories)&&
    t.bookings.every(b=>(!b.at||stamp(b.at))&&(!b.arrivesAt||stamp(b.arrivesAt))&&(!b.checkIn||iso(b.checkIn))&&(!b.checkOut||iso(b.checkOut))&&zone(b.departureZone)&&zone(b.arrivalZone))&&
    (t.itinerary??[]).every(i=>iso(i.day)&&(!i.time||time(i.time))))
}
