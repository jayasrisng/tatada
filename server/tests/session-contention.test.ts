import test from 'node:test'
import assert from 'node:assert/strict'
import {createEdgeHandler,type EdgeRepository} from '../edge.ts'
import type {Data} from '../store.ts'
class BusyRepository implements EdgeRepository {
 reads=0;acquires=0;state:Partial<Data>={}
 async read(){this.reads++;return structuredClone(this.state)}
 async acquire(){this.acquires++;return {busy:true}}
 async save(){throw Error('read-only session must not write')}
 async release(){throw Error('read-only session must not release another request lease')}
}
const origin='https://jayasrisng.com',base='https://api.example.test/functions/v1/tatada-api'
function handler(repository:BusyRepository,mode:'live'|'mock'='live') {return createEdgeHandler({repository,mode,leaseWaitMs:0,appUrl:origin+'/tatada',publicUrl:base,secret:'audit-test-secret-'.repeat(3)})}
const request=(from=origin)=>new Request(base+'/api/session',{method:'POST',headers:{origin:from,'x-tatada':'1'}})
test('five anonymous live session requests use committed snapshots while a writer holds the lease',async()=>{
 const repository=new BusyRepository(),handle=handler(repository)
 const responses=await Promise.all(Array.from({length:5},()=>handle(request())))
 assert.deepEqual(responses.map(r=>r.status),[200,200,200,200,200])
 for(const response of responses){const body=await response.json() as {authenticated:boolean;sessionToken?:string};assert.equal(body.authenticated,false);assert.equal(body.sessionToken,undefined)}
 assert.equal(repository.reads,5);assert.equal(repository.acquires,0);assert.deepEqual(repository.state,{})
})
test('session snapshots reject foreign origins; authenticated sessions and mock creation retain the lease',async()=>{
 const repository=new BusyRepository();assert.equal((await handler(repository)(request('https://evil.example'))).status,403)
 const authenticated=request();authenticated.headers.set('authorization','Bearer audit-invalid')
 assert.equal((await handler(repository)(authenticated)).status,503)
 const cookie=request();cookie.headers.set('cookie','tatada_session=audit-invalid')
 assert.equal((await handler(repository)(cookie)).status,503)
 assert.equal((await handler(repository,'mock')(request())).status,503);assert.equal(repository.acquires,3)
})
