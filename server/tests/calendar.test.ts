import test from 'node:test'
import assert from 'node:assert/strict'
import {CalendarConnection,CalendarService} from '../calendar.ts'
import {Store} from '../store.ts'
import {Sealer} from '../crypto.ts'
import {seed} from '../../src/data/seed.ts'
import {tripCalendarEvents,calendarFile} from '../../src/travel/calendar.ts'
const scope='https://www.googleapis.com/auth/calendar.app.created'
function fixture(){
 const store=Store.memory(),calls:string[]=[]
 const connection=new CalendarConnection({store,sealer:new Sealer('calendar-fixture-private-key-long-enough'),clientId:'fixture',clientSecret:'secret',redirectUri:'http://localhost:5180/api/gmail/callback',fetch:async(input)=>{calls.push(String(input));return Response.json(String(input).endsWith('/userinfo')?{email:'star@example.test',email_verified:true,sub:'google-fixture'}:{access_token:'ACCESS_SECRET',refresh_token:'REFRESH_SECRET',expires_in:3600,scope:'openid email '+scope})}})
 const connect=async()=>{const url=new URL(connection.begin('a','BINDING','/trip/lisbon'));await connection.finish('a',url.searchParams.get('state')!,'CODE','BINDING')}
 store.data.workspaces.a={state:seed(),version:1,updatedAt:1};return {store,connection,calls,connect}
}
test('calendar export omits private data, preserves local times, uses exclusive stay ends and escapes ICS injection',()=>{
 const t=seed().trips[0];t.bookings[0].ref='PRIVATEPNR';t.bookings[0].contact='private@example.test';t.bookings[0].detail='PRIVATEDETAIL';t.bookings[0].at='2026-11-06T15:45';t.itinerary![0].note='PRIVATENOTE';t.itinerary![0].title='Walk\r\nATTENDEE:evil@example.test'
 const events=tripCalendarEvents(t),raw=JSON.stringify(events),ics=calendarFile(t.id,events,new Date('2026-01-01T00:00:00Z'))
 for(const privateText of ['PRIVATEPNR','PRIVATEDETAIL','PRIVATENOTE','private@example.test'])assert.equal(raw.includes(privateText),false)
 assert.equal(ics.includes('\r\nATTENDEE:'),false);assert.match(raw,/15:45/);assert.match(ics,/VALUE=DATE:20261106/)
 const stay=events.find(e=>e.key==='booking-b2')!;assert.equal(stay.end.date,'2026-11-11');assert.match(ics,/TRANSP:TRANSPARENT/)
})
test('Calendar consent uses narrow independent scope, state/PKCE binding, sealed tokens and local disconnect without revoking Gmail',async()=>{
 const f=fixture(),url=new URL(f.connection.begin('a','BINDING','https://evil.example'))
 assert.equal(url.searchParams.get('scope'),'openid email '+scope);assert.equal(url.searchParams.get('code_challenge_method'),'S256')
 const state=url.searchParams.get('state')!;assert.equal(f.connection.pending(state),true)
 await assert.rejects(f.connection.finish('b',state,'CODE','BINDING'),/another browser/)
 await assert.rejects(f.connection.finish('a',state,'CODE','WRONG'),/another browser/)
 await f.connection.finish('a',state,'CODE','BINDING');assert.equal(f.connection.pending(state),false)
 assert.equal(JSON.stringify(f.store.data).includes('ACCESS_SECRET'),false);assert.equal(f.connection.status('b').connected,false)
 f.store.data.gmailTokens={a:'GMAIL_STAYS'};await f.connection.disconnect('a');assert.equal(f.store.data.gmailTokens.a,'GMAIL_STAYS');assert.equal(f.calls.some(c=>c.includes('/revoke')),false)
})
test('reviewed Calendar additions are idempotent, preserve manual edits, and detect changed source',async()=>{
 const f=fixture();await f.connect();const saved=new Map<string,Record<string,unknown>>(),calls:{url:string;method?:string;body?:Record<string,unknown>}[]=[]
 const service=new CalendarService(f.store,f.connection,async(input,init)=>{
  const url=String(input),body=typeof init?.body==='string'?JSON.parse(init.body):undefined;calls.push({url,method:init?.method,body})
  if(url.endsWith('/calendars'))return Response.json({id:'tatada@example.test'})
  if(init?.method==='POST'){if(saved.has(body.id))return new Response('',{status:409});saved.set(body.id,body);return Response.json(body)}
  return Response.json(saved.get(url.split('/').at(-1)!))
 })
 const p=service.preview('a','lisbon'),keys=p.events.slice(0,2).map(e=>e.key)
 await assert.rejects(service.add('a','lisbon','bad',keys),/changed/);assert.equal(calls.length,0)
 assert.equal((await service.add('a','lisbon',p.previewHash,keys)).created,2)
 assert.equal((await service.add('a','lisbon',p.previewHash,keys)).alreadyPresent,2)
 assert.equal(calls.filter(c=>c.url.endsWith('/calendars')).length,1)
 for(const c of calls.filter(c=>c.method==='POST'&&c.url.includes('/events'))){assert.match(c.url,/sendUpdates=none/);assert.equal(c.body?.attendees,undefined)}
 saved.values().next().value!.summary='Edited by user'
 const result=await service.add('a','lisbon',p.previewHash,keys);assert.equal(result.conflicts,1);assert.equal(result.alreadyPresent,1)
 await assert.rejects(service.add('b','lisbon',p.previewHash,keys),/Save this trip/)
})
test('ambiguous event write reuses stable IDs on retry and clears uncertainty only after reconciliation',async()=>{
 const f=fixture();await f.connect();let stored:Record<string,unknown>|undefined,once=true
 const service=new CalendarService(f.store,f.connection,async(input,init)=>{
  if(String(input).endsWith('/calendars'))return Response.json({id:'calendar'})
  if(init?.method==='GET')return Response.json(stored)
  if(stored)return new Response('',{status:409})
  stored=JSON.parse(String(init?.body));if(once){once=false;throw new Error('Network lost after acceptance')}return Response.json({})
 })
 const p=service.preview('a','lisbon'),keys=[p.events[0].key]
 assert.equal((await service.add('a','lisbon',p.previewHash,keys)).failed,1);assert.equal(f.store.data.calendarWrites?.a.state,'uncertain')
 assert.equal((await service.add('a','lisbon',p.previewHash,keys)).alreadyPresent,1);assert.equal(f.store.data.calendarWrites?.a,undefined)
})
test('ambiguous calendar creation is persisted before side effect and never blindly repeated',async()=>{
 const f=fixture();await f.connect();let creates=0
 const service=new CalendarService(f.store,f.connection,async()=>{assert.equal(f.store.data.calendarLinks?.a.state,'creating');creates++;throw new Error('Timed out')})
 const p=service.preview('a','lisbon'),keys=[p.events[0].key]
 await assert.rejects(service.add('a','lisbon',p.previewHash,keys));assert.equal(f.store.data.calendarLinks?.a.state,'uncertain')
 await assert.rejects(service.add('a','lisbon',p.previewHash,keys),/unresolved/);assert.equal(creates,1)
})

import {createApp} from '../app.ts'
import {MockFoAdapter} from '../fo.ts'
import {ActionService} from '../actions.ts'
import {webRequest} from '../web.ts'
import {sha256} from '../crypto.ts'
test('hosted Calendar callback stages without cookies and completes only in the initiating account/tab; account deletion protects active writes',async()=>{
 const f=fixture(),origin='https://calendar-fixture.test',fo=new MockFoAdapter(f.store),actions=new ActionService({store:f.store,fo}),calendar=new CalendarService(f.store,f.connection)
 const handle=createApp({store:f.store,fo,actions,calendar,appUrl:origin,secureCookies:true,bearerSessions:true,allowedOrigin:origin})
 const request=(path:string,token?:string,body?:unknown)=>webRequest(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'x-tatada':'1',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)}),path,handle)
 const first=await(await request('/api/session',undefined,{})).json() as {sessionToken:string},second=await(await request('/api/session',undefined,{})).json() as {sessionToken:string},owner=Object.values(f.store.data.sessions)[0].userId
 f.store.data.workspaces[owner]={state:seed(),version:1,updatedAt:1}
 const prepared=await(await request('/api/calendar/prepare',first.sessionToken,{binding:sha256('TAB_SECRET'),returnTo:'/trip/lisbon'})).json() as {url:string}
 const callback=await request('/api/gmail/callback?state='+new URL(prepared.url).searchParams.get('state')+'&code=CODE')
 assert.equal(callback.status,302)
 const exchange=new URL(callback.headers.get('location')!).hash.split('calendar_exchange=')[1];assert.ok(exchange)
 assert.equal((await request('/api/calendar/complete',second.sessionToken,{exchange,binding:'TAB_SECRET'})).status,400)
 assert.equal((await request('/api/calendar/complete',first.sessionToken,{exchange,binding:'WRONG'})).status,400)
 assert.equal((await request('/api/calendar/complete',first.sessionToken,{exchange,binding:'TAB_SECRET'})).status,200)
 const exported=await(await request('/api/account/export',first.sessionToken)).text();assert.equal(exported.includes('ACCESS_SECRET'),false)
 assert.equal((await request('/api/calendar/add',first.sessionToken,{tripId:'lisbon',confirm:'no',keys:[]})).status,400)
 f.store.data.calendarWrites={[owner]:{tripId:'lisbon',state:'uncertain'}}
 assert.equal((await request('/api/account/delete',first.sessionToken,{confirm:'DELETE'})).status,409)
 assert.equal((await request('/api/trips/delete',first.sessionToken,{tripId:'lisbon',confirm:'DELETE',baseVersion:1})).status,409)
 delete f.store.data.calendarWrites[owner]
 assert.equal((await request('/api/account/delete',first.sessionToken,{confirm:'DELETE'})).status,200)
 assert.equal(f.store.data.calendarTokens?.[owner],undefined)
})

test('failed persistence prevents external Calendar writes and releases the in-process lock',async()=>{
 const f=fixture();await f.connect();let external=0
 const service=new CalendarService(f.store,f.connection,async()=>{external++;return Response.json({id:'calendar'})}),p=service.preview('a','lisbon')
 f.store.flush=async()=>{throw new Error('Persistence unavailable')}
 await assert.rejects(service.add('a','lisbon',p.previewHash,[p.events[0].key]),/Persistence/)
 await assert.rejects(service.add('a','lisbon',p.previewHash,[p.events[0].key]),/Persistence/)
 assert.equal(external,0)
})
