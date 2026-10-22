import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
const require=createRequire(join(process.env.TATADA_TEST_BUILD,'package.json'))
const {mealStops,parseMeals,mealContext,mealItem,stopKind}=require('./travel/context.js')
const {reducer}=require('./state/reducer.js')
const {seed}=require('./data/seed.js')
test('meal context includes dated route and diet; saved lunch is derived without copying reservations',()=>{
 const trip={start:'2026-10-25',end:'2026-10-25',destination:'Yosemite',bookings:[],itinerary:[{id:'a',day:'2026-10-25',time:'12:00',title:"Eat vegetarian at Degnan’s Kitchen"},{id:'b',title:'Drive to Yosemite'}]}
 assert.equal(mealStops(trip).length,1);assert.equal(stopKind('Meet at the office'),'work');assert.equal(stopKind('Lower Yosemite Fall'),'waterfall')
 const context=JSON.parse(mealContext(trip,{diet:['halal'],personalNeeds:['infant care'],style:[]}));assert.deepEqual(context.diet,['halal']);assert.equal(context.route[0].time,'12:00');assert.deepEqual(context.needs,['infant care'])
})
test('meal results restrict dates and option count and reject unsafe source URLs',()=>{
 const option={name:'Cafe',why:'Nearby',food:'Beans',dietNote:'Unknown',address:'Main St',url:'javascript:alert(1)'}
 const meals=parseMeals(JSON.stringify({meals:[{day:'2026-10-25',meal:'lunch',area:'Valley',options:Array(8).fill(option)},{day:'2027-01-01',meal:'dinner',options:[option]}]}),{start:'2026-10-25',end:'2026-10-25'})
 assert.equal(meals.length,1);assert.equal(meals[0].options.length,3);assert.equal(meals[0].options[0].url,'');assert.match(mealItem(meals[0],option,'id',false).note,/Unverified/)
 assert.throws(()=>parseMeals('{"meals":[]}',{start:'2026-10-25',end:'2026-10-25'}))
})
test('saved pins reject invalid coordinates and update one named place without duplicates',()=>{
 let state=seed(),id=state.trips[0].id
 assert.equal(reducer(state,{type:'saveMapPlace',tripId:id,place:{name:'Bad',lat:100,lon:0}}),state)
 for(const lat of [37,38])state=reducer(state,{type:'saveMapPlace',tripId:id,place:{name:'Test stop',lat,lon:-120}})
 const pins=state.trips[0].mapPlaces.filter(p=>p.name==='Test stop');assert.equal(pins.length,1);assert.equal(pins[0].lat,38)
})
