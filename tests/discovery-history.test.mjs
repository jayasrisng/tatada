import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require=createRequire(join(process.env.TATADA_TEST_BUILD,'package.json'))
const {travelStats,photoGroups}=require('./travel/history.js')
const {seed}=require('./data/seed.js')
const {reducer}=require('./state/reducer.js')
const {buildExport,parseImport}=require('./state/portability.js')
const photo=(id,day,extra={})=>({id,fingerprint:id,filename:`${id}.jpg`,capturedAt:`${day}T12:00:00`,dateSource:'you',city:'Paris',country:'France',image:'data:image/jpeg;base64,AAAA',...extra})
test('travel counts use confirmed photos; nearby GPS collapses into stops and missing GPS stays unmapped',()=>{
 assert.deepEqual(travelStats([]),{countries:0,cities:0,places:0,stops:0,photos:0})
 const ps=[photo('a','2020-01-01',{lat:48.85,lon:2.35}),photo('b','2020-01-02',{lat:48.8501,lon:2.3501,city:' paris ',country:' FRANCE '}),photo('c','2020-01-03'),photo('d','2020-01-04',{lat:48.86,lon:2.36})]
 assert.deepEqual(travelStats(ps),{countries:1,cities:1,places:0,stops:2,photos:4})
 assert.equal(photoGroups([...ps,photo('e','2020-05-01')]).length,2)
})
test('photo import deduplicates files and export/restoration preserves GPS, labels and trip links',()=>{
 const s=seed(),p=photo('one','2020-01-01',{tripId:'photo-trip',lat:48.85,lon:2.35})
 const trip={...s.trips[0],id:'photo-trip',destination:'Paris',country:'France',start:'2020-01-01',end:'2020-01-01',status:'past'}
 const next=reducer(s,{type:'importTravelPhotos',photos:[p,p],trips:[trip]})
 assert.equal(next.photoHistory.length,1)
 assert.equal(reducer(next,{type:'importTravelPhotos',photos:[p],trips:[trip]}).trips.filter(t=>t.id==='photo-trip').length,1)
 const restored=parseImport(JSON.stringify(buildExport(next,[])))
 assert.equal(restored.ok,true)
 assert.deepEqual(restored.state.photoHistory,[p])
 assert.equal(reducer(next,{type:'deleteTravelPhoto',id:p.id}).photoHistory.length,0)
})

