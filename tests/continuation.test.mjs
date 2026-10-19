import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require=createRequire(join(process.env.TATADA_TEST_BUILD,'package.json'))
const {seed}=require('./data/seed.js'),{isAppState}=require('./state/persistence.js'),{reducer}=require('./state/reducer.js')
const {extractConfirmation,duplicateBooking}=require('./travel/confirmations.js'),{savedArrangement}=require('./travel/arrangements.js')
const {localInstant,nextTravelStep}=require('./travel/next.js')
const {applyProposal,undoProposal,validateProposal,structuredProposal}=require('./assistant/proposals.js')
const flightText=`Flight confirmation\nAirline: Sample Air\nFlight: ZZ123\nFrom: SFO\nTo: CDG\nDeparture date: 2026-10-19\nDeparture time: 18:30\nArrival date: 2026-10-20\nArrival time: 14:00\nDeparture zone: America/Los_Angeles\nArrival zone: Europe/Paris\nConfirmation: TEST123`
test('import labeled overnight flight, preserve unknowns, reject duplicates across PDF/text and separate return legs',()=>{
 assert.equal(extractConfirmation(flightText+'\nOnline check-in opens the day before.').draft.kind,'flight')
 const {draft}=extractConfirmation(flightText),b={...savedArrangement(draft,'f'),importHash:'hash'}
 assert.equal(b.arrivesAt,'2026-10-20T14:00');assert.equal(b.departureZone,'America/Los_Angeles');assert.equal(b.simulated,false);assert.equal(b.contact,undefined)
 assert.equal(duplicateBooking([b],draft,'hash'),true);assert.equal(duplicateBooking([b],draft,'other'),true)
 assert.equal(duplicateBooking([b],{...draft,date:'2026-10-25'},'other'),false)
 const s=seed();s.trips[0].bookings=[b];const next=reducer(s,{type:'saveBooking',tripId:s.trips[0].id,booking:{...b,id:'new'}});assert.equal(next,s)
})
test('hotel and transport extraction leave ambiguous dates and conflicting fields blank',()=>{
 const hotel=extractConfirmation('Hotel: Test House\nCheck in: 2026-10-20\nCheck out: 2026-10-23\nAddress: 10 Sample Road\nConfirmation: H123').draft
 assert.equal(hotel.kind,'stay');assert.equal(hotel.time,'');assert.equal(savedArrangement(hotel,'h').address,'10 Sample Road')
 const ambiguous=extractConfirmation('Transport: Train\nDate: 10/11/26\nFrom: A\nFrom: B')
 assert.equal(ambiguous.draft.kind,'transfer');assert.equal(ambiguous.draft.date,'');assert.equal(ambiguous.draft.from,'');assert.ok(ambiguous.warnings.length>=3)
 assert.throws(()=>extractConfirmation('Passport number: PRIVATE'),/vault/)
})
test('local schedule handles overnight/date-line flights, different zones and rejects DST gaps/ambiguities',()=>{
 assert.equal(new Date(localInstant('2026-10-19T18:30','America/Los_Angeles')).toISOString(),'2026-10-20T01:30:00.000Z')
 assert.equal(localInstant('2026-03-08T02:30','America/Los_Angeles'),undefined)
 assert.equal(localInstant('2026-11-01T01:30','America/Los_Angeles'),undefined)
 assert.equal(localInstant('2026-10-19T12:00','Not/AZone'),undefined)
 const b=savedArrangement(extractConfirmation(flightText).draft,'f'),trip={...seed().trips[0],timeZone:'Europe/Paris',bookings:[b],itinerary:[]}
 assert.match(nextTravelStep(trip,new Date('2026-10-20T02:00Z')).title,/Arrive/)
 assert.equal(nextTravelStep({...trip,journeyDone:{flight:true,arrival:true}},new Date('2026-10-20T02:00Z')),undefined)
 assert.match(nextTravelStep({...trip,bookings:[{...b,departureZone:undefined,arrivalZone:undefined}],timeZone:undefined},new Date()).needsReview,/zone/)
})
test('next step includes today check-in, activities and excludes completed stops',()=>{
 const trip={...seed().trips[0],timeZone:'Europe/Paris',bookings:[{id:'stay',kind:'stay',title:'House',when:'2026-11-07',checkIn:'2026-11-07',ref:'R',simulated:false,detail:'',address:'Sample street'}],itinerary:[{id:'i',day:'2026-11-07',time:'18:00',title:'Walk',dress:'casual',done:true}]}
 assert.match(nextTravelStep(trip,new Date('2026-11-07T12:00Z')).title,/Check in/)
 assert.equal(nextTravelStep({...trip,journeyDone:{stay:true}},new Date('2026-11-07T12:00Z')),undefined)
})
test('reviewed Fo updates validate current trip, survive reload, apply once and undo without deleting later edits',()=>{
 const s=seed(),tripId=s.trips[0].id,p={kind:'itinerary',tripId,text:'A quiet walk',day:s.trips[0].start,time:'14:00'}
 const saved=applyProposal(s,'chat:reply',p);assert.equal(applyProposal(saved,'chat:reply',p),saved);assert.equal(isAppState(JSON.parse(JSON.stringify(saved))),true)
 const edited=reducer(saved,{type:'saveItinerary',tripId,item:{...saved.trips[0].itinerary.at(-1),title:'My changed walk'}})
 assert.throws(()=>undoProposal(edited,'chat:reply'),/edited/)
 const undone=undoProposal(saved,'chat:reply');assert.equal(undone.trips[0].itinerary.length,s.trips[0].itinerary.length);assert.equal(undoProposal(undone,'chat:reply'),undone)
 assert.throws(()=>validateProposal({...p,tripId:'other'},s,tripId),/this trip/)
 assert.throws(()=>validateProposal({...p,day:'1900-01-01'},s,tripId),/within/)
 assert.throws(()=>validateProposal({...p,booking:{confirmed:true}},s,tripId),/supported/)
 assert.deepEqual(structuredProposal('```tatada-proposal\n'+JSON.stringify(p)+'\n```'),p)
})
test('strict workspace contract rejects nested credential injection, malformed dates, zones and duplicate IDs, keeps legacy memories',()=>{
 const s=seed();assert.equal(isAppState(s),true)
 for(const mutate of [s=>s.profile.tokens={access:'SECRET'},s=>s.trips[0].bookings[0].vault='PRIVATE',s=>s.trips[0].start='2026-02-30',s=>s.items.push(s.items[0]),s=>s.trips[0].timeZone='Not/Real',s=>s.trips[0].itinerary[0].time='29:00',s=>s.trips[0].bookings[0].flight={from:'SFO',to:2}]){const value=structuredClone(s);mutate(value);assert.equal(isAppState(value),false)}
})

test('task and journal suggestion idempotency survives export/import and remains reversible',()=>{
 const {buildExport,parseImport}=require('./state/portability.js')
 for(const kind of ['task','journal']){
  const s=seed(),tripId=s.trips[0].id,p={kind,tripId,text:'Reviewed suggestion',...(kind==='journal'?{day:s.trips[0].start}:{})}
  const applied=applyProposal(s,`reply-${kind}`,p),restored=parseImport(JSON.stringify(buildExport(applied,[])))
  assert.equal(restored.ok,true);assert.equal(applyProposal(restored.state,`reply-${kind}`,p),restored.state)
  const undone=undoProposal(restored.state,`reply-${kind}`)
  assert.equal(undone.items.length,s.items.length);assert.equal(undone.trips[0].memories.length,s.trips[0].memories.length)
 }
})

test('trip deletion removes dependencies without changing another trip or independent clothes',()=>{
 const s=seed(),id=s.trips[0].id,other=s.trips[1].id
 s.photoHistory=[{id:'photo',tripId:id,image:'',filename:'x',fingerprint:'x',capturedAt:'2026-01-01',dateSource:'you',city:'',country:''}]
 s.looks=[{id:'look',tripId:id,garmentIds:[],verdict:'keep',at:1}]
 s.assistantUpdates=[{id:'p',tripId:id,kind:'task',recordId:'r',snapshot:'{}',undone:false}]
 const next=reducer(s,{type:'deleteTrip',tripId:id})
 assert.equal(next.trips.some(t=>t.id===id),false);assert.ok(next.trips.some(t=>t.id===other))
 for(const table of ['items','actions','decisions','looks','photoHistory','assistantUpdates'])assert.equal((next[table]??[]).some(x=>x.tripId===id),false)
 assert.deepEqual(next.wardrobe,s.wardrobe);assert.ok(isAppState(next));assert.ok(s.trips.some(t=>t.id===id))
})
test('paid totals require both explicit amount and currency and survive workspace validation',()=>{
 const review=extractConfirmation('Airline: Southwest Airlines\nFlight: WN123\nFrom: SFO\nTo: LAX\nDate: 2026-11-01\nPaid total: 143.50\nCurrency: USD')
 const b=savedArrangement(review.draft,'paid');assert.deepEqual(b.paidPrice,{amount:'143.50',currency:'USD'});assert.equal(b.simulated,false)
 const s=seed();s.trips[0].bookings.push(b);assert.ok(isAppState(s))
 assert.equal(extractConfirmation('Flight: WN123\nPaid total: $143').draft.paidAmount,'')
 assert.throws(()=>savedArrangement({...review.draft,paidAmount:'-20'},'bad'),/paid total/)
})
