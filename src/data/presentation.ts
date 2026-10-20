import type { AppState, ChecklistItem, Garment, Trip } from '../types'

// Opt-in presentation content for Jayasri's local account. No invented booking references or live outcomes.
const past = [
  ['mexico-city', 'Mexico City', 'Mexico', 'MX', '2026-01-10', 19.4326, -99.1332, 'A long lunch and a slow neighbourhood walk.'],
  ['paris', 'Paris', 'France', 'FR', '2026-02-14', 48.8566, 2.3522, 'A museum morning, then time to wander without a checklist.'],
  ['vijayawada', 'Vijayawada', 'India', 'IN', '2026-03-20', 16.5062, 80.648, 'Family time. The best part of the plan was leaving most of it open.'],
  ['nairobi', 'Nairobi', 'Kenya', 'KE', '2026-05-08', -1.2921, 36.8219, 'A conversation over lunch became the favourite part of the day.'],
  ['rio', 'Rio de Janeiro', 'Brazil', 'BR', '2026-06-12', -22.9068, -43.1729, 'An unhurried waterfront afternoon and a journal entry before bed.'],
  ['sydney', 'Sydney', 'Australia', 'AU', '2026-08-07', -33.8688, 151.2093, 'A harbour walk with the phone tucked away.'],
] as const
const colors = ['yellow', 'pink', 'blue', 'green', 'orange'] as const
function makeTrip(id: string, destination: string, country: string, start: string, end: string, lat: number, lon: number, index: number, completed = false): Trip {
  return { id: `showcase-${id}`, presentation: true, destination, country, start, end, destinationPoint: {lat, lon}, travelers: 1, companions: completed ? 'solo' : '', budget: 0, vibe: ['leave room for surprise'], constraints: [], discounts: [], status: completed ? 'past' : 'upcoming', tint: colors[index % colors.length], summary: {}, options: [], bookings: [], memories: [], itinerary: [] }
}
const endDay = (date: string) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10) }
export function presentationTrips(): Trip[] {
  const la = makeTrip('la', 'LAX', 'United States', '2026-10-19', '2026-10-25', 34.0522, -118.2437, 0)
  const yosemite = makeTrip('yosemite', 'Yosemite', 'United States', '2026-11-06', '2026-11-08', 37.7459, -119.5936, 1)
  // Saved sample arrangements make the owner’s upcoming LA journey usable end to end.
  la.arrival = '2026-10-19T10:30'
  la.localAddress = 'Little Tokyo, Los Angeles'
  la.summary = {flight:'SFO to LAX, then home on Sunday.',stay:'Six nights in Little Tokyo. Check in after the afternoon walk.',move:'Airport ride to the stay, then walking and local transit.',eat:'Lunch downtown, an easy dinner near the room, and time for breakfast.'}
  la.bookings = [
    {id:la.id+'-outbound',kind:'flight',title:'SFO → LAX',when:'2026-10-19 · 09:00 departure · 10:30 arrival',at:'2026-10-19T09:00',flight:{airline:'Tatada Air',number:'TT 201',from:'SFO',to:'LAX'},ref:'',detail:'One traveler · illustrative flight',simulated:true},
    {id:la.id+'-transfer',kind:'transfer',title:'LAX → Little Tokyo',when:'2026-10-19 · after arrival',at:'2026-10-19T11:30',ref:'',detail:'Airport ride to the stay · illustrative arrangement',simulated:true},
    {id:la.id+'-stay',kind:'stay',title:'Little Tokyo stay',when:'Oct 19–25 · check in 15:00 · check out 11:00',checkIn:la.start,checkOut:la.end,ref:'',detail:'One room · six nights · illustrative stay',simulated:true},
    {id:la.id+'-dinner',kind:'dinner',title:'Dinner near the stay',when:'2026-10-19 · 18:30',at:'2026-10-19T18:30',ref:'',detail:'An easy first-night meal · no real table reserved',simulated:true},
    {id:la.id+'-return',kind:'flight',title:'LAX → SFO',when:'2026-10-25 · 17:00 departure',at:'2026-10-25T17:00',flight:{airline:'Tatada Air',number:'TT 202',from:'LAX',to:'SFO'},ref:'',detail:'One traveler · illustrative flight',simulated:true},
  ]
  // Upcoming itineraries are researched from the traveler’s actual dates and route.
  return [la, yosemite, ...past.map(([id, city, country, , date, lat, lon, memory], i) => {
    const trip = makeTrip(id, city, country, date, endDay(date), lat, lon, i + 2, true)
    const airport = ({'mexico-city':'MEX',paris:'CDG',vijayawada:'VGA',nairobi:'NBO',rio:'GIG',sydney:'SYD'} as Record<string,string>)[id]
    const area = ({'mexico-city':'Roma Norte',paris:'Left Bank',vijayawada:'Family home',nairobi:'Westlands',rio:'Botafogo',sydney:'Surry Hills'} as Record<string,string>)[id]
    const family = id === 'vijayawada'
    trip.budget = [940,1420,1180,1540,1260,1640][i]
    trip.localAddress = `${area}, ${city}`
    trip.arrival = date + 'T10:30'
    trip.summary = {flight:`SFO → ${airport} and home again. The arrival left room for a quiet first afternoon.`,stay:family?'Stayed with family. No hotel needed.':`Two nights in ${area}. A comfortable base with breakfast and room to unwind.`,move:family?'Airport pickup and local rides with family.':`Airport transfer, then local transit and walking. Kept the long journeys to a minimum.`,eat:family?'Breakfast at home, family lunches and a relaxed dinner together.':'Breakfast near the stay, a proper lunch break, and an unhurried dinner. Snacks and water in the day bag.'}
    trip.options = ([['flight',`SFO ↔ ${airport}`, 'Round-trip flight', `$${[480,760,980,1100,820,1180][i]}`,trip.summary.flight],['stay',family?'Stay with family':`${area} · two nights`,family?'Family visit':'Neighbourhood stay',family?'Hosted':`$${[260,420,0,280,260,300][i]}`,trip.summary.stay],['move',family?'Airport pickup & family rides':'Airport transfer & city transit','Getting around',family?'Family rides':'Transit + walking',trip.summary.move],['eat',family?'Meals with family':'Breakfast, lunch & dinner','All meals, with time for breaks','Meals covered',trip.summary.eat]] as const).map(([category,title,subtitle,price,reason])=>({id:`${trip.id}-${category}`,category,title,subtitle,price,reason,status:'chosen' as const,highlights:category==='stay'?['A base for both nights','Room to unpack and rest']:category==='eat'?['Breakfast, lunch and dinner','Water and snack breaks']:category==='move'?['Airport arrival and departure covered','Local travel kept flexible']:['Outbound and return travel','Arrival and departure on the itinerary'],tradeoffs:[],metrics:{Status:'Completed'},sources:[]}))
    trip.bookings = [
      {id:`${trip.id}-outbound`,kind:'flight',flight:{airline:'Tatada Air',number:`TT ${101+i*2}`,from:'SFO',to:airport},title:`SFO → ${airport}`,when:`${date} · arrival 10:30`,ref:'',detail:'Outbound journey',simulated:true,at:date+'T10:30'},
      {id:`${trip.id}-stay`,kind:'stay',title:family?'Stay with family':`${area} stay`,when:`${date} → ${trip.end}`,checkIn:date,checkOut:trip.end,ref:'',detail:family?'Hosted by family':'Two nights · breakfast included',simulated:true},
      {id:`${trip.id}-transfer`,kind:'transfer',title:family?'Family airport pickup':'Airport transfer',when:`${date} · 11:30`,ref:'',detail:family?'Pickup and drive home':'Airport to the stay',simulated:true,at:date+'T11:30'},
      {id:`${trip.id}-return`,kind:'flight',flight:{airline:'Tatada Air',number:`TT ${102+i*2}`,from:airport,to:'SFO'},title:`${airport} → SFO`,when:`${trip.end} · departure 17:00`,ref:'',detail:'Return journey',simulated:true,at:trip.end+'T17:00'},
    ]
    const middle = new Date(date+'T12:00:00Z'); middle.setUTCDate(middle.getUTCDate()+1)
    const days = [date,middle.toISOString().slice(0,10),trip.end]
    trip.itinerary = days.flatMap((day,dayIndex)=>[
      {id:`${trip.id}-${dayIndex}-breakfast`,day,time:'08:30',title:family?'Breakfast at home':'Breakfast near the stay',dress:'casual' as const},
      {id:`${trip.id}-${dayIndex}-morning`,day,time:dayIndex===0?'10:30':'10:00',title:dayIndex===0?`Arrive at ${airport}, transfer & settle in`:dayIndex===2?'A slow last walk and packing':family?'A day with family':`Explore ${area} at an easy pace`,dress:'casual' as const},
      {id:`${trip.id}-${dayIndex}-lunch`,day,time:'13:00',title:family?'Lunch with family':'Lunch & a conversation',dress:'casual' as const},
      {id:`${trip.id}-${dayIndex}-afternoon`,day,time:'15:00',title:dayIndex===2?`Leave for ${airport}`:dayIndex===0?'Unpack, rest & a short neighbourhood walk':'An open afternoon, with a coffee or snack break',dress:'casual' as const},
      {id:`${trip.id}-${dayIndex}-evening`,day,time:dayIndex===2?'17:00':'19:00',title:dayIndex===2?'Flight home':family?'Dinner together, then a journal note':'Dinner, then a journal note',dress:'casual' as const},
    ])
    trip.memories = [{id:`${trip.id}-journal-1`,day:date,kind:'note',text:`Arrived, unpacked and gave myself time to settle in. ${memory}`,tint:'yellow'}, {id:`${trip.id}-journal-2`,day:days[1],kind:'note',text:family?'A whole day with family. No need to turn every hour into an activity.':'A full day with room to change the plan. A good lunch, a long walk, and a conversation I wanted to remember.',tint:'blue'}, {id:`${trip.id}-journal-3`,day:trip.end,kind:'note',text:'Packed everything, left time for the airport, and wrote down one small thing I wanted to carry home.',tint:'pink'}]
    if (id === 'sydney') fillSydney(trip)
    return trip
  })]
}
export function withPresentation(state: AppState, defaultWardrobe: Garment[] = []): AppState {
  const removed = new Set(['lisbon', 'bigsur', 'kyoto', ...state.trips.filter(t => t.presentation).map(t => t.id)])
  const trips = presentationTrips().map(trip => ({...trip, research: state.trips.find(t => t.id === trip.id)?.research}))
  const items: ChecklistItem[] = trips.flatMap(trip => [
    {id: `${trip.id}-transport`, tripId: trip.id, phase: 'plan', kind: 'task', text: 'Choose transport & accommodation', done: trip.status === 'past'},
    {id: `${trip.id}-essentials`, tripId: trip.id, phase: 'prepare', kind: 'doc', text: 'Check documents, personal medicines & emergency contacts', done: trip.status === 'past'},
    {id: `${trip.id}-pack`, tripId: trip.id, phase: 'prepare', kind: 'pack', text: trip.destination === 'Yosemite' ? 'Pack layers, walking shoes, water, lunch & a power bank' : 'Pack outfits, comfortable shoes, chargers & toiletries', done: trip.status === 'past'},
    {id: `${trip.id}-journal-task`, tripId: trip.id, phase: 'remember', kind: 'memory', text: 'One small memory before bed', done: trip.status === 'past'},
  ])
  return {...state, profile: {...state.profile, name: state.profile.name === 'Ana' ? 'Jayasri' : state.profile.name}, wardrobe: state.wardrobe ?? defaultWardrobe, onboarded: true, trips: [...trips, ...state.trips.filter(t => !removed.has(t.id))], items: [...state.items.filter(i => !i.tripId || !removed.has(i.tripId)), ...items], actions: state.actions.filter(a => !a.tripId || !removed.has(a.tripId)), decisions: state.decisions?.filter(d => !removed.has(d.tripId)), countryMarks: {...state.countryMarks, ...Object.fromEntries(past.map(p => [p[3], 'visited' as const]))}, photoHistory: [...(state.photoHistory ?? []).filter(p => !p.id.startsWith('showcase-')).map(p => p.tripId && removed.has(p.tripId) ? {...p, tripId: undefined} : p), ...past.map(([id, city, country, , date, lat, lon]) => ({id: `showcase-location-${id}`, tripId: `showcase-${id}`, fingerprint: `showcase-location-${id}`, filename: 'Travel location', capturedAt: date + 'T12:00:00', dateSource: 'you' as const, labelSource: 'you' as const, city, country, place: city === 'Vijayawada' ? 'Family visit' : 'Neighbourhood walk', lat, lon, image: ''}))]}
}

/** Owner-approved sample memories; no fabricated confirmations, prices or real transactions. */
function fillSydney(trip: Trip) {
  trip.travelers = 2; trip.companions = 'a friend'; trip.budget = 3280
  trip.vibe = ['slow mornings', 'harbour walks', 'good food']
  trip.constraints = ['time to rest after the flight']
  trip.summary = {
    flight: 'Two seats, SFO to Sydney and back. We left the first afternoon free to settle in.',
    stay: 'Two nights in Surry Hills. One room for two, with a quiet evening to unpack.',
    move: 'Airport train into the city, walks around the harbour, and the ferry to Manly. We kept the last day close to our bags.',
    eat: 'Pastries at Bourke Street Bakery, a picnic by the harbour, lunch in Manly, and a last shared dinner in Surry Hills.',
  }
  trip.options = trip.options.map(o => ({...o, reason: trip.summary[o.category], price: o.category === 'flight' ? '$2,360 · two people' : o.category === 'stay' ? '$600 · two nights' : o.category === 'eat' ? 'Meals for two' : 'Train, ferry & walking', highlights: o.category === 'eat' ? ['Bourke Street Bakery · Surry Hills', 'Harbour picnic & a Manly lunch', 'Breakfast, lunch, dinner and snack breaks'] : o.highlights, metrics:{Status:'Completed', Travelers:'2'}}))
  trip.bookings = trip.bookings.map(b => ({...b, ...(b.kind === 'flight' ? {flight:{airline:'Tatada Air',number:b.id.endsWith('outbound')?'TT 108':'TT 109',from:b.id.endsWith('outbound')?'SFO':'SYD',to:b.id.endsWith('outbound')?'SYD':'SFO'}} : {}), detail: b.kind === 'flight' ? `${b.detail} · two travelers · illustrative schedule` : b.kind === 'stay' ? 'One room · two people · two nights' : 'Airport train · two people'}))
  trip.bookings.push(
    {id:trip.id+'-ferry',kind:'activity',title:'Circular Quay ↔ Manly ferry',when:'2026-08-08 · a day by the water',ref:'',detail:'Return ferry ride for two · illustrative plan, not a ticket',simulated:true},
    {id:trip.id+'-meal',kind:'dinner',title:'Last dinner in Surry Hills',when:'2026-08-08 · 19:00',ref:'',detail:'A shared meal for two · no reservation reference',simulated:true},
  )
  const entries: [string,string,string, 'casual' | 'active'][] = [
    ['2026-08-07','10:30','Arrive at SYD · airport train & drop bags','casual'],
    ['2026-08-07','12:30','Bourke Street Bakery · pastries & a light lunch for two','casual'],
    ['2026-08-07','14:00','Unpack, shower & a jet-lag nap','casual'],
    ['2026-08-07','16:00','Circular Quay & The Rocks · a slow harbour walk','casual'],
    ['2026-08-07','18:30','Dinner in Surry Hills, then an early night','casual'],
    ['2026-08-08','08:30','Bakery breakfast & coffee','casual'],
    ['2026-08-08','10:00','Ferry from Circular Quay to Manly','casual'],
    ['2026-08-08','11:00','Manly beach walk · pause whenever we feel like it','active'],
    ['2026-08-08','12:30','Fish-and-chips lunch for two in Manly','casual'],
    ['2026-08-08','14:30','Ferry back & a warm drink','casual'],
    ['2026-08-08','16:00','Royal Botanic Garden · sit, wander, catch up','casual'],
    ['2026-08-08','19:00','One last shared dinner in Surry Hills','casual'],
    ['2026-08-09','08:30','Breakfast, pack & check nothing is left behind','casual'],
    ['2026-08-09','10:30','Check out & leave bags with the stay','casual'],
    ['2026-08-09','12:00','A harbour picnic & one last look around The Rocks','casual'],
    ['2026-08-09','14:00','Collect bags & take the airport train','casual'],
    ['2026-08-09','17:00','SYD → SFO · travel home together','casual'],
  ]
  trip.itinerary = entries.map(([day,time,title,dress],i) => ({id:`${trip.id}-scene-${i}`,day,time,title,dress}))
  trip.mapPlaces = [{name:'Surry Hills',lat:-33.884,lon:151.212},{name:'Circular Quay',lat:-33.861,lon:151.211},{name:'The Rocks',lat:-33.859,lon:151.209},{name:'Manly',lat:-33.797,lon:151.288},{name:'Royal Botanic Garden',lat:-33.864,lon:151.217}]
  const moments = [
    ['2026-08-07','Bourke Street Bakery, Surry Hills','First lunch, still on airplane time. We split pastries and sat longer than we meant to. A very good start.'],
    ['2026-08-07','The Rocks','We put the phones away and followed the harbour. No checklist, just the two of us figuring out a new city.'],
    ['2026-08-07','Surry Hills','Dinner close to our room. We were both tired, so an early night felt like the right kind of plan.'],
    ['2026-08-08','Circular Quay → Manly','The ferry became part of the day, not just the way there. We stayed outside for a while and talked about almost nothing.'],
    ['2026-08-08','Manly','Fish and chips for lunch after our walk. We found a place to sit and shared the last few chips. This is the bit I want to remember.'],
    ['2026-08-08','Royal Botanic Garden','A slow afternoon with nowhere urgent to be. We found a seat and let the afternoon happen.'],
    ['2026-08-08','Surry Hills','Our last dinner. We each picked a favourite moment: the ferry for one of us, that first bakery lunch for the other.'],
    ['2026-08-09','The Rocks','One last picnic before collecting our bags. Three days, two people, and so many little things to take home.'],
  ]
  trip.memories = moments.map(([day,place,text],i) => ({id:`${trip.id}-journal-${i+1}`,day,place,text,kind:'note',...(i===1?{illustration:'sydney-harbour' as const}:i===4?{illustration:'sydney-lunch' as const}:{}),tint:colors[i%colors.length]}))
}
