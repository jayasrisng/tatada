import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { shareTrip, parseSharedTrip } = require('./sharing/trip.js')
const { seed } = require('./data/seed.js')
const { reducer } = require('./state/reducer.js')
const { buildExport, parseImport } = require('./state/portability.js')
const { newVault, unlockVault, encryptVault } = require('./privacy/vault.js')
test('friend snapshot excludes booking references, private notes, profile and documents', () => {
 const trip={...seed().trips[0],itinerary:[{id:'one',day:seed().trips[0].start,title:'Meet a friend',dress:'casual',note:'private room code 123'}]}
 const snapshot=shareTrip(trip), raw=JSON.stringify(snapshot)
 assert.equal(raw.includes('private room code'),false)
 assert.equal(snapshot.bookings,undefined);assert.equal(snapshot.profile,undefined);assert.equal(snapshot.notes,undefined)
 assert.deepEqual(parseSharedTrip(raw).itinerary,snapshot.itinerary)
 const hostile={...snapshot,profile:{passport:'secret'},itinerary:[{...snapshot.itinerary[0],note:'injected'}]}
 assert.equal(parseSharedTrip(JSON.stringify(hostile)).profile,undefined)
 assert.equal(parseSharedTrip(JSON.stringify(hostile)).itinerary[0].note,undefined)
})
test('shared import rejects invalid calendar dates, invalid itinerary dates and unsupported data',()=>{
 const snapshot=shareTrip(seed().trips[0])
 assert.throws(()=>parseSharedTrip(JSON.stringify({...snapshot,start:'2026-99-99'})),/not a supported/)
 assert.throws(()=>parseSharedTrip(JSON.stringify({...snapshot,itinerary:[{id:'bad',day:'1900-01-01',title:'bad',dress:'casual'}]})),/not a supported/)
 assert.throws(()=>parseSharedTrip(JSON.stringify({...snapshot,version:2})),/not a supported/)
})
test('priority is a reversible local flag, never an action; new profile fields survive backup',()=>{
 const state=seed();state.profile.homeBases=['Madrid','Little Rock'];state.profile.personalNeeds=['step-free'];
 const item=state.items[0], next=reducer(state,{type:'prioritizeItem',id:item.id})
 assert.equal(next.items[0].priority,true);assert.deepEqual(next.actions,state.actions)
 const restored=parseImport(JSON.stringify(buildExport(next,[])))
 assert.equal(restored.ok,true);assert.deepEqual(restored.state.profile.homeBases,['Madrid','Little Rock']);assert.equal(restored.state.items[0].priority,true)
 assert.equal(reducer(next,{type:'prioritizeItem',id:item.id}).items[0].priority,false)
})
test('document vault round trips authenticated encryption; wrong key and tampering fail',async()=>{
 const pass='a long private passphrase', {key,envelope}=await newVault(pass)
 const docs=[{id:'doc1',kind:'passport',name:'passport.pdf',mime:'application/pdf',file:'JVBERg==',addedAt:1,fields:{'Full name':'A Star','Document number':'TOP-SECRET'}}]
 const saved=await encryptVault(key,envelope.salt,docs,2)
 assert.equal(JSON.stringify(saved).includes('TOP-SECRET'),false)
 assert.equal(key.extractable,false)
 assert.deepEqual((await unlockVault(pass,saved)).docs,docs)
 await assert.rejects(unlockVault('the wrong long passphrase',saved),/Could not unlock/)
 const ciphertext=(saved.ciphertext[0]==='A'?'B':'A')+saved.ciphertext.slice(1)
 await assert.rejects(unlockVault(pass,{...saved,ciphertext}),/Could not unlock/)
 const again=await encryptVault(key,envelope.salt,docs,3)
 assert.notEqual(again.iv,saved.iv);assert.notEqual(again.ciphertext,saved.ciphertext)
 await assert.rejects(newVault('short'),/12 characters/)
})
test('saved research retains sources and checked time through backup; new map imports discard review images',()=>{
 const {toTravelPhoto}=require('./travel/importer.js')
 const photo=toTravelPhoto({id:'p',fingerprint:'f',fileName:'x.jpg',image:'private original image',capturedAt:'',dateSource:'you',fields:{country:'France',city:'Paris',place:''},sources:{country:'you'},inHistory:false})
 assert.equal(photo.image,'')
 const state=seed(), trip=state.trips[0], note={id:'research1',checkedAt:'2026-10-18T12:00:00Z',model:'actual-model',searched:true,sections:[{text:'Source-linked information',sources:[{url:'https://example.org/source',title:'Source'}]}]}
 const next=reducer(state,{type:'saveResearch',tripId:trip.id,note}),restored=parseImport(JSON.stringify(buildExport(next,[])))
 assert.equal(restored.ok,true);assert.deepEqual(restored.state.trips[0].research,[note])
})

test('photo moments survive private backup and stay out of friend snapshots',()=>{
 const state=seed(), trip=state.trips[0]
 const memory={id:'photo-1',day:'2026-10-18',text:'Lunch together',place:'Our cafe',kind:'photo',image:'data:image/jpeg;base64,/9j/2Q=='}
 const next=reducer(state,{type:'addMemory',tripId:trip.id,memory})
 const restored=parseImport(JSON.stringify(buildExport(next,[])))
 assert.equal(restored.ok,true)
 assert.deepEqual(restored.state.trips[0].memories.at(-1),memory)
 assert.ok(!JSON.stringify(shareTrip(next.trips[0],true)).includes('data:image'))
 const hostile=structuredClone(next);hostile.trips[0].memories.at(-1).image='data:text/html;base64,PHNjcmlwdD4='
 assert.equal(parseImport(JSON.stringify(buildExport(hostile,[]))).ok,false)
})

test('trip stop completion is scoped, reversible and survives private backup',()=>{
 const state=seed(),trip=state.trips[0];trip.itinerary=[{id:'stop',day:trip.start,title:'Lunch',dress:'casual'}]
 const next=reducer(state,{type:'toggleStop',tripId:trip.id,id:'stop'})
 assert.equal(next.trips[0].itinerary[0].done,true);assert.deepEqual(next.trips[1],state.trips[1])
 assert.equal(parseImport(JSON.stringify(buildExport(next,[]))).state.trips[0].itinerary[0].done,true)
 assert.equal(reducer(next,{type:'toggleStop',tripId:trip.id,id:'stop'}).trips[0].itinerary[0].done,false)
})

test('journey stage completion is private, trip-scoped, persistent and reversible',()=>{
 const state=seed(),trip=state.trips[0]
 const next=reducer(state,{type:'toggleJourneyStep',tripId:trip.id,step:'flight'})
 assert.equal(next.trips[0].journeyDone.flight,true);assert.deepEqual(next.trips[1],state.trips[1])
 const imported=parseImport(JSON.stringify(buildExport(next,[])));assert.equal(imported.ok,true);assert.equal(imported.state.trips[0].journeyDone.flight,true)
 assert.ok(!JSON.stringify(shareTrip(next.trips[0])).includes('journeyDone'))
 assert.equal(reducer(next,{type:'toggleJourneyStep',tripId:trip.id,step:'flight'}).trips[0].journeyDone.flight,false)
 const malformed=structuredClone(next);malformed.trips[0].journeyDone={injected:true}
 assert.equal(parseImport(JSON.stringify(buildExport(malformed,[]))).ok,false)
})

test('saved date display preserves the calendar day and does not invent invalid dates',()=>{
 const {humanDate,humanWhen}=require('./travel/display.js')
 assert.match(humanDate('2026-10-24'),/24/)
 assert.equal(humanDate('2026-02-31'),'2026-02-31')
 assert.equal(humanDate('not a date'),'not a date')
 assert.ok(!humanWhen('2026-10-24 · arrival 10:30').includes('2026-10-24'))
 assert.match(humanWhen('2026-10-24 · arrival 10:30'),/10:30/)
})

test('travel corrections preserve unedited timing, identifiers and other trips',()=>{
 const {arrangementDraft,savedArrangement}=require('./travel/arrangements.js')
 const state=seed(),trip=state.trips[0]
 const old={id:'real-flight',kind:'flight',title:'SFO → LAX',when:'2026-10-24 · departure 09:00 · arrival 10:30',at:'2026-10-24T09:00',ref:'MY-REF',detail:'Original',simulated:false,flight:{airline:'My Airline',number:'AB 12',from:'SFO',to:'LAX'}}
 const draft=arrangementDraft('2026-10-24','2026-10-26',old);draft.detail='Corrected note'
 const saved=savedArrangement(draft,old.id,old)
 assert.equal(saved.when,old.when);assert.equal(saved.ref,old.ref);assert.deepEqual(saved.flight,old.flight)
 const added=reducer(state,{type:'saveBooking',tripId:trip.id,booking:saved})
 const edited=reducer(added,{type:'saveBooking',tripId:trip.id,booking:{...saved,detail:'Second correction'}})
 assert.equal(edited.trips[0].bookings.filter(b=>b.id===old.id).length,1);assert.deepEqual(edited.trips[1],state.trips[1])
 assert.equal(parseImport(JSON.stringify(buildExport(edited,[]))).state.trips[0].bookings.at(-1).detail,'Second correction')
 draft.date='2026-02-31';assert.throws(()=>savedArrangement(draft,old.id),/valid date/)
 const stay=arrangementDraft('2026-10-24','2026-10-26');stay.kind='stay';stay.title='My stay';stay.end=stay.date
 assert.throws(()=>savedArrangement(stay,'new-stay'),/after check-in/)
})

test('journal edit and delete/undo preserve the exact photo and original order',()=>{
 const state=seed(),trip=state.trips[0],memory={id:'private-photo',day:'2026-10-24',kind:'photo',image:'data:image/jpeg;base64,/9j/2Q==',text:'Lunch',place:'Cafe'}
 trip.memories=[memory,{...memory,id:'second',text:'Dinner'}]
 const edited=reducer(state,{type:'editMemory',tripId:trip.id,id:memory.id,changes:{text:'A lovely lunch',day:'2026-10-25',place:'My cafe'}})
 assert.equal(edited.trips[0].memories[0].image,memory.image);assert.equal(edited.trips[0].memories[0].kind,'photo')
 const removed=reducer(edited,{type:'deleteMemory',tripId:trip.id,id:memory.id})
 const restored=reducer(removed,{type:'restoreMemory',tripId:trip.id,memory:edited.trips[0].memories[0],index:0})
 assert.deepEqual(restored.trips[0].memories,edited.trips[0].memories)
 assert.deepEqual(reducer(restored,{type:'restoreMemory',tripId:trip.id,memory,index:0}).trips[0].memories,restored.trips[0].memories)
 assert.deepEqual(restored.trips[1],state.trips[1])
 assert.equal(parseImport(JSON.stringify(buildExport(restored,[]))).state.trips[0].memories[0].image,memory.image)
})
