import type { AppState, ChecklistItem, Trip } from '../types'

/*
 * Seeded demo data. Everything here is SAMPLE content: fares, ratings, and
 * confirmation codes are illustrative and not pulled from live sources.
 * Hotel and restaurant names in Lisbon are fictional.
 */

const lisbon: Trip = {
  id: 'lisbon',
  destination: 'Lisbon',
  country: 'Portugal',
  start: '2026-11-06',
  end: '2026-11-11',
  travelers: 2,
  companions: 'with partner',
  budget: 2400,
  vibe: ['food', 'slow mornings', 'design', 'walkable'],
  constraints: ['vegetarian', 'no flights before 9am'],
  discounts: ['Amex Gold', 'TAP Miles&Go'],
  status: 'upcoming',
  tint: 'yellow',
  localAddress: 'Largo do Chafariz de Dentro 12, 1100-139 Lisboa',
  arrival: '2026-11-07T11:30',
  demoScenario: 'lisbon',
  summary: {
    flight:
      'Nonstop wins: it lands mid-morning, you skip a connection, and it respects your no-early-flights rule. It costs $140 more than the cheapest fare that still fits.',
    stay:
      'Alfama fits "slow mornings, walkable" best. Casa do Largo has rooftop breakfast and a host who answers emails. The catch: hills and an older wing with no lift.',
    move: 'Walk, tram, and metro cover everything. A transit card is about €30 for two over four days. Skip the car.',
    eat: 'Lisbon is easy for vegetarians if you book ahead on weekends. Saturday dinner needs a reservation, so Fo can call.',
  },
  options: [
    {
      id: 'f1', category: 'flight', status: 'chosen',
      title: 'TAP · nonstop', subtitle: 'SFO 3:45pm → LIS 11:30am (+1)',
      price: '$1,180 for 2',
      reason: 'Fits every rule you gave. Morning arrival = a full first day.',
      highlights: ['Nonstop, 11h 45m', 'Earns TAP Miles&Go', 'Lands before hotel check-in'],
      tradeoffs: ['Overnight, so sleep on the plane', '$140 above cheapest valid fare'],
      metrics: { Time: '11h 45m', Stops: '0', Departs: '3:45pm', Price: '$1,180' },
      sources: [{ label: 'Fare snapshot', kind: 'fares' }, { label: 'Airline schedule', kind: 'official' }],
    },
    {
      id: 'f2', category: 'flight', status: 'considering',
      title: 'United + Lufthansa', subtitle: 'SFO 1:10pm → FRA → LIS 2:30pm (+1)',
      price: '$1,040 for 2',
      highlights: ['Cheapest fare that follows your rules', 'Star Alliance protection'],
      tradeoffs: ['1 stop, 70-min connection', 'Arrives mid-afternoon'],
      metrics: { Time: '15h 20m', Stops: '1', Departs: '1:10pm', Price: '$1,040' },
      sources: [{ label: 'Fare snapshot', kind: 'fares' }],
    },
    {
      id: 'f3', category: 'flight', status: 'rejected',
      title: 'Delta via JFK', subtitle: 'SFO 6:05am → JFK → LIS',
      price: '$990 for 2',
      reason: 'Leaves at 6:05am. You said no flights before 9am.',
      highlights: [], tradeoffs: [],
      metrics: { Time: '14h 10m', Stops: '1', Departs: '6:05am', Price: '$990' },
      sources: [{ label: 'Fare snapshot', kind: 'fares' }],
    },
    {
      id: 'f4', category: 'flight', status: 'rejected',
      title: 'LAX + budget hop', subtitle: 'Two separate tickets',
      price: '$950 for 2',
      reason: 'Saves $90, but a missed connection on separate tickets isn\'t protected.',
      highlights: [], tradeoffs: [],
      metrics: { Time: '19h+', Stops: '2', Departs: '9:30am', Price: '$950' },
      sources: [{ label: 'Fare snapshot', kind: 'fares' }, { label: 'r/travel thread', kind: 'forum' }],
    },
    {
      id: 's1', category: 'stay', status: 'chosen',
      title: 'Casa do Largo', subtitle: 'Boutique guesthouse · Alfama',
      price: '€165 / night',
      reason: 'Walkable, quiet mornings, rooftop breakfast. Host replies within a day.',
      highlights: ['Rooftop breakfast', '4.8 ★ across 600+ reviews', 'Free cancellation to Nov 1'],
      tradeoffs: ['Steep hills', 'Older wing has no lift'],
      metrics: { Area: 'Alfama', Rating: '4.8', Walk: '★★★★★', Price: '€165' },
      sources: [{ label: 'Guest reviews', kind: 'reviews' }, { label: 'Hotel site', kind: 'official' }, { label: 'Map check', kind: 'map' }],
    },
    {
      id: 's2', category: 'stay', status: 'considering',
      title: 'Mirador Chiado', subtitle: 'Design hotel · Chiado',
      price: '€210 / night',
      highlights: ['Elevator, flat streets nearby', 'Central for museums'],
      tradeoffs: ['€180 more over 4 nights', 'Busier street at night'],
      metrics: { Area: 'Chiado', Rating: '4.6', Walk: '★★★★★', Price: '€210' },
      sources: [{ label: 'Guest reviews', kind: 'reviews' }],
    },
    {
      id: 's3', category: 'stay', status: 'considering',
      title: 'Príncipe Real flat', subtitle: 'Apartment · self check-in',
      price: '€140 / night',
      highlights: ['Kitchen', 'Leafy, quiet neighborhood'],
      tradeoffs: ['No breakfast', 'Cleaning fee €60'],
      metrics: { Area: 'Príncipe Real', Rating: '4.7', Walk: '★★★★☆', Price: '€140' },
      sources: [{ label: 'Listing reviews', kind: 'reviews' }],
    },
    {
      id: 's4', category: 'stay', status: 'rejected',
      title: 'Airport chain hotel', subtitle: 'Near LIS',
      price: '€98 / night',
      reason: 'It\'s cheap, but you\'d need a 20-minute cab to everything. That\'s the opposite of "walkable".',
      highlights: [], tradeoffs: [],
      metrics: { Area: 'Airport', Rating: '4.1', Walk: '★☆☆☆☆', Price: '€98' },
      sources: [{ label: 'Map check', kind: 'map' }],
    },
    {
      id: 'm1', category: 'move', status: 'chosen',
      title: 'Transit card + walking', subtitle: 'Metro, trams, ferries',
      price: '≈ €30 for 2',
      reason: 'Covers almost everything you\'ve saved.',
      highlights: ['Tram 28 passes your street', 'Works on the Cascais train'],
      tradeoffs: ['Tram 28 is crowded midday'],
      metrics: { Cost: '€30', Effort: 'low', Night: 'ok', Hills: 'meh' },
      sources: [{ label: 'City transit site', kind: 'official' }],
    },
    {
      id: 'm2', category: 'move', status: 'considering',
      title: 'Rideshare for late nights', subtitle: 'Uber / Bolt',
      price: '≈ €8 / ride',
      highlights: ['Saves your legs on the hills after dinner'],
      tradeoffs: ['Surge pricing on weekends'],
      metrics: { Cost: '€8/ride', Effort: 'none', Night: 'great', Hills: 'great' },
      sources: [{ label: 'Local forum', kind: 'forum' }],
    },
    {
      id: 'm3', category: 'move', status: 'rejected',
      title: 'Rental car', subtitle: '4 days',
      price: '≈ €220',
      reason: 'Parking in Alfama is miserable, and the Sintra day trip works fine by train.',
      highlights: [], tradeoffs: [],
      metrics: { Cost: '€220', Effort: 'high', Night: 'ok', Hills: 'ok' },
      sources: [{ label: 'Local forum', kind: 'forum' }],
    },
    {
      id: 'e1', category: 'eat', status: 'chosen',
      title: 'Horta da Graça', subtitle: 'Vegetarian tasting menu · Graça',
      price: '€55 pp',
      reason: 'Your Saturday-night dinner. It books up, so Fo can call.',
      highlights: ['Fully vegetarian', 'Viewpoint 3 min away'],
      tradeoffs: ['Phone reservations only'],
      metrics: { Veg: 'all', Booking: 'phone', Walk: '12 min', Price: '€55' },
      sources: [{ label: 'Diner reviews', kind: 'reviews' }, { label: 'Map check', kind: 'map' }],
    },
    {
      id: 'e2', category: 'eat', status: 'considering',
      title: 'Riverside food hall', subtitle: 'Cais do Sodré',
      price: '€15–25 pp',
      highlights: ['No booking', 'Lots of veg stalls'],
      tradeoffs: ['Loud, communal tables'],
      metrics: { Veg: 'many', Booking: 'none', Walk: '25 min', Price: '€20' },
      sources: [{ label: 'Diner reviews', kind: 'reviews' }],
    },
    {
      id: 'e3', category: 'eat', status: 'rejected',
      title: 'Tourist-strip seafood', subtitle: 'Main pedestrian street',
      price: '€35 pp',
      reason: 'Hardly any vegetarian dishes, and the reviews keep mentioning hard-sell menus.',
      highlights: [], tradeoffs: [],
      metrics: { Veg: 'few', Booking: 'walk-in', Walk: '15 min', Price: '€35' },
      sources: [{ label: 'Diner reviews', kind: 'reviews' }],
    },
  ],
  bookings: [
    { id: 'b1', kind: 'flight', title: 'TAP · SFO → LIS', when: 'Fri, Nov 6 · 3:45pm', at: '2026-11-06T15:45', ref: 'K7Q2ZP', detail: 'Seats 23A / 23B', simulated: true },
    // .example is a reserved domain: the fixture contact can never reach a real inbox.
    { id: 'b2', kind: 'stay', title: 'Casa do Largo', when: 'Sat, Nov 7 → Wed, Nov 11 · 4 nights', checkIn: '2026-11-07', checkOut: '2026-11-11', contact: 'reservas@casadolargo.example', ref: 'CDL-48213', detail: 'Room 3, rooftop breakfast', simulated: true },
    { id: 'b3', kind: 'flight', title: 'TAP · LIS → SFO', when: 'Wed, Nov 11 · 12:40pm', at: '2026-11-11T12:40', ref: 'K7Q2ZP', detail: 'Seats 31C / 31D', simulated: true },
  ],
  memories: [
    { id: 'lm1', day: 'Oct 12', text: 'Started a list of miradouros to watch the sunset from.', kind: 'note', tint: 'yellow' },
  ],
}

const kyoto: Trip = {
  id: 'kyoto',
  destination: 'Kyoto',
  country: 'Japan',
  start: '2026-04-03',
  end: '2026-04-09',
  travelers: 1,
  companions: 'solo',
  budget: 3200,
  vibe: ['temples', 'food', 'early walks'],
  constraints: ['vegetarian'],
  discounts: [],
  status: 'past',
  tint: 'pink',
  summary: {},
  options: [],
  bookings: [
    { id: 'kb1', kind: 'stay', title: 'Ryokan in Higashiyama', when: 'Fri, Apr 3 → Thu, Apr 9', checkIn: '2026-04-03', checkOut: '2026-04-09', ref: 'RYK-2207', detail: 'Tatami room, kaiseki dinner', simulated: true },
  ],
  memories: [
    { id: 'km1', day: 'Apr 4', text: 'Philosopher\'s Path at 7am. Empty, petals everywhere.', kind: 'photo', place: 'Philosopher\'s Path', tint: 'pink' },
    { id: 'km2', day: 'Apr 4', text: 'Tamagoyaki on a stick, twice.', kind: 'note', place: 'Nishiki Market', tint: 'yellow' },
    { id: 'km3', day: 'Apr 5', text: 'Got lost in Gion, found a six-seat jazz bar.', kind: 'note', place: 'Gion', tint: 'blue' },
    { id: 'km4', day: 'Apr 6', text: 'Kaiseki dinner. Eleven courses, all vegetarian on request.', kind: 'receipt', place: 'Ryokan · ¥18,400', tint: 'orange' },
    { id: 'km5', day: 'Apr 7', text: 'Fushimi Inari before sunrise. Climbed to the top, legs gone.', kind: 'photo', place: 'Fushimi Inari', tint: 'green' },
    { id: 'km6', day: 'Apr 8', text: 'Bought a hand-dyed furoshiki for Mom.', kind: 'receipt', place: 'Sanjō · ¥3,200', tint: 'pink' },
  ],
}

const bigSur: Trip = {
  id: 'bigsur',
  destination: 'Big Sur',
  country: 'California',
  start: '2026-12-12',
  end: '2026-12-14',
  travelers: 4,
  companions: 'with friends',
  budget: 1200,
  vibe: ['nature', 'cozy', 'road trip'],
  constraints: [],
  discounts: ['AAA'],
  status: 'planning',
  tint: 'green',
  summary: {
    stay: 'Still looking. Cabins with a fireplace that sleep four go fast in December.',
  },
  options: [
    {
      id: 'bs1', category: 'stay', status: 'considering',
      title: 'Creekside cabins', subtitle: 'Sleeps 4 · fireplace',
      price: '$310 / night',
      highlights: ['Fireplace', 'Walk to the river'],
      tradeoffs: ['No cell service'],
      metrics: { Sleeps: '4', Fire: 'yes', Drive: '2h 40m', Price: '$310' },
      sources: [{ label: 'Listing reviews', kind: 'reviews' }],
    },
  ],
  bookings: [],
  memories: [],
}

let n = 0
const item = (
  tripId: string | undefined,
  phase: ChecklistItem['phase'],
  text: string,
  done = false,
  kind: ChecklistItem['kind'] = 'task',
  extra: Partial<ChecklistItem> = {},
): ChecklistItem => ({ id: `i${++n}`, tripId, phase, text, done, kind, ...extra })

export const LISBON_EARLY_CHECKIN = 'Email Casa do Largo to ask for early check-in on Sat, Nov 7 and an airport transfer quote'
export const LISBON_DINNER = 'Call Horta da Graça to book a table for 2 on Saturday, Nov 7, vegetarian tasting menu'

const items: ChecklistItem[] = [
  item('lisbon', 'discover', 'Pick a neighborhood: Alfama vs Príncipe Real', true, 'idea'),
  item('lisbon', 'discover', 'Set budget: $2,400 for two', true, 'idea'),
  item('lisbon', 'plan', 'Book flights SFO → LIS', true, 'booking', { note: 'TAP · K7Q2ZP' }),
  item('lisbon', 'plan', 'Book Casa do Largo, 4 nights', true, 'booking', { note: 'CDL-48213' }),
  item('lisbon', 'plan', 'Early check-in + airport transfer', false, 'booking', { magicPrompt: LISBON_EARLY_CHECKIN }),
  item('lisbon', 'plan', 'Saturday dinner at Horta da Graça', false, 'booking', { magicPrompt: LISBON_DINNER }),
  item('lisbon', 'plan', 'Travel insurance', false, 'doc'),
  item('lisbon', 'plan', 'Sintra day trip tickets', false, 'booking'),
  item('lisbon', 'prepare', 'Passports valid 6+ months', true, 'doc'),
  item('lisbon', 'prepare', 'Tell the bank we\'re traveling', false, 'task'),
  item('lisbon', 'prepare', 'Pack layers + a rain shell', false, 'pack'),
  item('lisbon', 'prepare', 'Download offline Lisbon map', false, 'task'),
  item('lisbon', 'prepare', 'Print the trip card', false, 'doc'),
  item('lisbon', 'travel', 'Check in for TAP (opens 24h before)', false, 'task'),
  item('lisbon', 'travel', 'Buy transit cards at the airport', false, 'task'),
  item('lisbon', 'remember', 'One memory note a day', false, 'memory'),
  item('lisbon', 'remember', 'Make the travel journal', false, 'memory'),
  item('kyoto', 'remember', 'Make the travel journal', false, 'memory'),
  item('kyoto', 'remember', 'Send photos to Mom', true, 'memory'),
  item('bigsur', 'discover', 'Agree on dates with everyone', true, 'idea'),
  item('bigsur', 'discover', 'Find a cabin that sleeps 4', false, 'idea'),
  item('bigsur', 'plan', 'Check Highway 1 road closures', false, 'task'),
  item(undefined, 'prepare', 'Renew Global Entry', false, 'doc'),
]

export const seed = (): AppState => ({
  onboarded: true,
  profile: {
    name: 'Ana',
    homeAirport: 'SFO',
    style: ['slow mornings', 'food'],
    diet: ['vegetarian'],
    memberships: ['Amex Gold', 'TAP Miles&Go'],
  },
  trips: [lisbon, bigSur, kyoto],
  items,
  actions: [],
  chat: [],
  canvas: {},
  // Demo fixture: Lisbon's standard check-in time, labeled as demo data in the decision record.
  decisions: [{ tripId: 'lisbon', topic: 'early_checkin', inputs: { standardCheckIn: { value: '15:00', source: 'demo', at: Date.parse('2026-10-12T17:00:00Z') } }, updatedAt: Date.parse('2026-10-12T17:00:00Z') }],
})

/** Demo fixture: sample outfits for the Lisbon trip, keyed by date. Not a real forecast. */
export const LISBON_STYLE: Record<string, { temp: string; sky: string; look: string[]; note: string }> = {
  '2026-11-07': { temp: '19° / 13°', sky: 'sun', look: ['linen shirt', 'light chinos', 'white sneakers'], note: 'hills all day: comfy shoes' },
  '2026-11-08': { temp: '17° / 12°', sky: 'umbrella', look: ['knit sweater', 'dark jeans', 'rain shell'], note: 'showers after 3pm' },
  '2026-11-09': { temp: '18° / 12°', sky: 'sun', look: ['striped tee', 'overshirt', 'loafers'], note: 'Sintra: layers for the hilltop' },
  '2026-11-10': { temp: '18° / 13°', sky: 'sun', look: ['slip dress or chinos', 'light jacket'], note: 'nice dinner night' },
}
export const LISBON_GAPS = ['Grippy walking shoes', 'Packable rain shell', 'Type F plug adapter']
