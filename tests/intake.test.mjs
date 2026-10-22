import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
const require=createRequire(join(process.env.TATADA_TEST_BUILD,'package.json'))
const {parseIntake,buildIntakeContext}=require('./assistant/intake.js')
const {planningContext}=require('./assistant/itinerary.js')
const {seed}=require('./data/seed.js')
const prior={destination:'Yosemite',origin:'Milpitas',transport:'drive',start:'2026-10-24',end:'2026-10-24',travelers:1,goals:'Glacier Point; arrive by 07:00; leave the park by 18:00.'}

test('a follow-up patch keeps confirmed trip facts instead of asking for them again',()=>{
 const reply=parseIntake(JSON.stringify({reply:'Your day trip is ready.',questions:[],ready:true,draft:{companions:'solo',origin:'',destination:''}}),'2026-10-21',prior)
 assert.equal(reply.ready,true)
 assert.deepEqual(reply.draft,{...prior,companions:'solo'})
 const changed=parseIntake(JSON.stringify({reply:'Updated.',questions:[],ready:true,draft:{origin:'San Jose'}}),'2026-10-21',prior)
 assert.equal(changed.draft.origin,'San Jose')
 assert.equal(changed.draft.goals,prior.goals)
})
test('intake retains the first full requirements beyond six turns and deduplicates a retried message',()=>{
 const first={id:'first',from:'you',text:'Start in Milpitas. '+ 'A day trip. '.repeat(42)+'Prioritize Glacier Point and return that evening.',at:''}
 const turns=[first,...Array.from({length:8},(_,i)=>({id:String(i),from:i%2?'you':'magic',text:i%2?'Confirmed detail '+i:'Missing detail '+i,at:''})),first]
 const context=JSON.parse(buildIntakeContext(prior,turns,seed().profile,'2026-10-21','America/Los_Angeles'))
 assert.equal(context.requirements.filter(t=>t===first.text).length,1)
 assert.match(context.requirements[0],/Glacier Point/)
 assert.equal(context.draft.origin,'Milpitas')
 assert.equal(context.recentQuestions.length,2)
})
test('saved-trip planning retains original requests that are absent from its short goal field',()=>{
 const state=seed(),trip={...state.trips[0],start:prior.start,end:prior.end,planning:{origin:'Milpitas',transport:'drive',goals:'Visit Yosemite'},conversation:[{id:'req',from:'you',text:prior.goals,at:''}]}
 const context=JSON.parse(planningContext(trip,state.profile))
 assert.equal(context.journey.origin,'Milpitas')
 assert.deepEqual(context.requirements,[prior.goals])
})
test('oversized conversations fail explicitly instead of silently dropping earlier requirements',()=>{
 assert.throws(()=>buildIntakeContext(prior,[{id:'large',from:'you',text:'x'.repeat(8000),at:''}],seed().profile,'2026-10-21','UTC'),/earlier answers have been kept/)
})
