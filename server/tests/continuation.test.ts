import test from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../store.ts'
import { ShareService } from '../sharing.ts'
import { AmadeusTravel } from '../travel.ts'
import { seed } from '../../src/data/seed.ts'
import { MockFoAdapter } from '../fo.ts'
import { ActionService } from '../actions.ts'
import { createApp } from '../app.ts'
import { webRequest } from '../web.ts'
const ORIGIN='https://fixture.tatada.test'
function fixture() {const store=Store.memory(),fo=new MockFoAdapter(store),actions=new ActionService({store,fo});const handle=createApp({store,fo,actions,appUrl:ORIGIN,secureCookies:true,bearerSessions:true,allowedOrigin:ORIGIN});const request=(path:string,token?:string,body?:unknown)=>webRequest(new Request(ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{origin:ORIGIN,'x-tatada':'1',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)}),path,handle);return {store,request}}
test('revocable view-only snapshot verifies owner/current preview, strips private fields and expires',()=>{
 const store=Store.memory(),state=seed(),trip=state.trips[0];trip.itinerary![0].note='PRIVATE';store.data.accounts.a={kind:'demo',createdAt:1,lastLoginAt:1};store.data.workspaces.a={version:1,updatedAt:1,state};let now=100
 const sharing=new ShareService(store,()=>now),review={format:'tatada-shared-trip',version:1,exportedAt:'',destination:trip.destination,country:trip.country,start:trip.start,end:trip.end,itinerary:trip.itinerary!.map(i=>({id:i.id,day:i.day,time:i.time,title:i.title,dress:i.dress}))}
 const link=sharing.create('a',trip.id,review),raw=JSON.stringify(sharing.view(link.token))
 assert.equal(raw.includes('PRIVATE'),false);assert.equal(raw.includes(trip.bookings[0].ref),false);assert.equal(JSON.stringify(store.data.shares).includes(link.token),false)
 assert.throws(()=>sharing.revoke('b',link.id),/not found/);assert.throws(()=>sharing.create('b',trip.id,review),/valid trip/)
 assert.throws(()=>sharing.create('a',trip.id,{...review,destination:'Other'}),/changed/)
 sharing.revoke('a',link.id);assert.throws(()=>sharing.view(link.token),/unavailable/)
 const expiring=sharing.create('a',trip.id,review);now+=31*86400000;assert.throws(()=>sharing.view(expiring.token),/unavailable/)
})
test('account export omits credentials; deletion is confirmed, scoped and revokes links/sessions',async()=>{
 const {store,request}=fixture(),first=await (await request('/api/session',undefined,{})).json() as {sessionToken:string},second=await (await request('/api/session',undefined,{})).json() as {sessionToken:string},id=Object.values(store.data.sessions)[0].userId
 store.data.tokens[id]='SECRET';store.data.gmailTokens={[id]:'GMAILSECRET'};store.data.workspaces[id]={version:1,updatedAt:1,state:seed()}
 const exported=await (await request('/api/account/export',first.sessionToken)).json() as {workspace:unknown};assert.ok(exported.workspace);assert.equal(JSON.stringify(exported).includes('SECRET'),false)
 assert.equal((await request('/api/account/delete',first.sessionToken,{confirm:'no'})).status,400)
 assert.equal((await request('/api/account/delete',first.sessionToken,{confirm:'DELETE'})).status,200)
 assert.equal(store.data.tokens[id],undefined);assert.equal(store.data.gmailTokens[id],undefined);assert.equal(store.data.workspaces[id],undefined)
 assert.equal((await request('/api/workspace',first.sessionToken)).status,401);assert.equal((await request('/api/workspace',second.sessionToken)).status,200)
})
test('strict nested HTTP workspace validation rejects credential fields and stale writes',async()=>{
 const state=seed()
 const store=Store.memory(),fo=new MockFoAdapter(store),actions=new ActionService({store,fo}),app=createApp({store,fo,actions,appUrl:ORIGIN,secureCookies:false,bearerSessions:true})
 const call=(path:string,method:string,token?:string,body?:unknown)=>webRequest(new Request(ORIGIN+path,{method,headers:{'x-tatada':'1',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)}),path,app)
 const who=await(await call('/api/session','POST',undefined,{})).json() as {sessionToken:string}
 assert.equal((await call('/api/workspace','PUT',who.sessionToken,{baseVersion:0,state})).status,200)
 assert.equal((await call('/api/workspace','PUT',who.sessionToken,{baseVersion:0,state})).status,409)
 assert.equal((await call('/api/workspace','PUT',who.sessionToken,{baseVersion:1,state:{...state,profile:{...state.profile,oauthToken:'SECRET'}}})).status,400)
})
test('read-only Amadeus adapter uses exact query, server credentials and discloses test environment',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[]
 const travel=new AmadeusTravel({clientId:'fixture-client',clientSecret:'fixture-secret',environment:'test',fetch:async(input,init)=>{calls.push({url:String(input),init});return Response.json(String(input).includes('/token')?{access_token:'TOKEN',expires_in:1800}:{data:[{scheduledDepartureDate:'2026-10-19',flightDesignator:{carrierCode:'ZZ',flightNumber:123},flightPoints:[{iataCode:'SFO',departure:{timings:[{qualifier:'STD',value:'2026-10-19T18:30:00-07:00'}]}}],private:'SECRET'}]})}})
 const result=await travel.flightStatus('ZZ','123','2026-10-19');assert.equal(result.environment,'test');assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.match(calls[1].url,/carrierCode=ZZ/);assert.equal(travel.capabilities().booking,false)
 await travel.flightStatus('ZZ','123','2026-10-19');assert.equal(calls.filter(c=>c.url.includes('/token')).length,1)
 await assert.rejects(()=>travel.flightStatus('Bad airline','123','2026-10-19'),/exact/)
})

test('account deletion refuses in-flight work instead of hiding provider activity',async()=>{
 const {store,request}=fixture(),who=await(await request('/api/session',undefined,{})).json() as {sessionToken:string},owner=Object.values(store.data.sessions)[0].userId
 store.data.actions.active={ownerId:owner,status:'send_uncertain'} as never
 assert.equal((await request('/api/account/delete',who.sessionToken,{confirm:'DELETE'})).status,409)
 assert.ok(store.data.accounts[owner]);assert.ok(store.data.actions.active)
})

test('trip delete requires confirmation/version, is account scoped, removes shares, blocks active print and rejects stale resurrection',async()=>{
 const {store,request}=fixture(),login=await(await request('/api/session',undefined,{})).json() as {sessionToken:string},id=Object.values(store.data.sessions)[0].userId
 const state=seed(),tripId=state.trips[0].id;store.data.workspaces[id]={version:1,updatedAt:1,state}
 store.data.workspaces.other={version:4,updatedAt:1,state:seed()}
 store.data.shares={s:{id:'s',owner:id,tripId} as never,other:{id:'other',owner:'other',tripId} as never}
 assert.equal((await request('/api/trips/delete',login.sessionToken,{tripId,confirm:'no',baseVersion:1})).status,400)
 assert.equal((await request('/api/trips/delete',login.sessionToken,{tripId,confirm:'DELETE',baseVersion:0})).status,409)
 store.data.printJobs={active:{id:'active',ownerId:id,document:{tripId},status:'send_uncertain'} as never}
 assert.equal((await request('/api/trips/delete',login.sessionToken,{tripId,confirm:'DELETE',baseVersion:1})).status,409)
 store.data.printJobs={}
 const result=await request('/api/trips/delete',login.sessionToken,{tripId,confirm:'DELETE',baseVersion:1});assert.equal(result.status,200)
 const deleted=await result.json() as {version:number;state:ReturnType<typeof seed>};assert.equal(deleted.version,2);assert.equal(deleted.state.trips.some(t=>t.id===tripId),false)
 assert.equal(store.data.shares.s,undefined);assert.ok(store.data.shares.other);assert.equal(store.data.workspaces.other.version,4)
 assert.equal((await request('/api/trips/delete',login.sessionToken,{tripId,confirm:'DELETE',baseVersion:1})).status,409)
 assert.equal((await request('/api/travel/offers',login.sessionToken,{from:'SFO',to:'LAX',date:'2026-11-01',adults:1})).status,503)
})
test('fare offers expose itinerary, price and environment without leaking provider fields',async()=>{
 const travel=new AmadeusTravel({clientId:'fixture',clientSecret:'fixture',environment:'production',fetch:async(input)=>Response.json(String(input).includes('/token')?{access_token:'TOKEN',expires_in:1000}:{data:[{id:'1',price:{currency:'USD',total:'143.50'},private:'SECRET',itineraries:[{duration:'PT1H30M',segments:[{departure:{iataCode:'SFO',at:'2026-11-01T09:00'},arrival:{iataCode:'LAX',at:'2026-11-01T10:30'},carrierCode:'WN',number:'123'}]}]}]})})
 const r=await travel.searchOffers('SFO','LAX','2026-11-01',1)
 assert.equal(r.environment,'production');assert.equal(r.offers[0].total,'143.50');assert.equal(r.offers[0].itineraries[0].segments[0].carrier,'WN');assert.equal(JSON.stringify(r).includes('SECRET'),false)
 await assert.rejects(()=>travel.searchOffers('SFO','SFO','2026-11-01',1),/airport/)
})
