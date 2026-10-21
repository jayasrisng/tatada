import test from 'node:test'
import assert from 'node:assert/strict'
import {createEdgeHandler,type EdgeRepository} from '../edge.ts'
import {Store,type Data} from '../store.ts'
import {sha256} from '../crypto.ts'
const origin='https://jayasrisng.com',base='https://edge.example.test/functions/v1/tatada-api'
const state=(name:string)=>({onboarded:true,trips:[],items:[],profile:{name,homeAirport:'',style:[],diet:[],memberships:[]},actions:[],chat:[],canvas:{}})
class Repository implements EdgeRepository {
 state:Data=Store.memory().data;token?:string;hold=false;writes=0;failSave=false
 async read(){return structuredClone(this.state)}
 async acquire(token:string){if(this.token||this.hold)return {busy:true};this.token=token;return {state:structuredClone(this.state)}}
 async save(token:string,data:Data){assert.equal(token,this.token);if(this.failSave)throw Error('simulated disk unavailable');await new Promise(r=>setTimeout(r,5));this.state=structuredClone(data);this.writes++}
 async release(token:string){assert.equal(token,this.token);this.token=undefined}
 account(name:string){const token='fixture-session-'+name.padEnd(30,'x'),now=Date.now();this.state.accounts[name]={kind:'connected',createdAt:now,lastLoginAt:now};this.state.sessions[sha256(token)]={userId:name,createdAt:now,lastSeenAt:now,expiresAt:now+60000};return token}
}
function setup(repository=new Repository(),leaseWaitMs=500){const handle=createEdgeHandler({repository,appUrl:origin+'/tatada',publicUrl:base,secret:'fixture-concurrency-secret-'.repeat(3),mode:'live',leaseWaitMs});const call=(path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST')=>handle(new Request(base+path,{method,headers:{origin,'x-tatada':'1','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));return {repository,call}}
test('five authenticated accounts save concurrently without lost updates or cross-account reads',async()=>{
 const s=setup(),tokens=Array.from({length:5},(_,i)=>s.repository.account('account-'+i))
 const saved=await Promise.all(tokens.map((token,i)=>s.call('/api/workspace',token,{baseVersion:0,state:state('Account '+i)},'PUT')))
 assert.deepEqual(saved.map(r=>r.status),[200,200,200,200,200])
 for(const [i,token]of tokens.entries()){const r=await s.call('/api/workspace',token),w=await r.json() as {version:number;state:{profile:{name:string}}};assert.equal(w.version,1);assert.equal(w.state.profile.name,'Account '+i)}
 assert.equal(Object.keys(s.repository.state.workspaces).length,5)
})
test('same-version concurrent saves accept one winner and return conflicts, not silent overwrites',async()=>{
 const s=setup(),token=s.repository.account('one')
 const writes=await Promise.all(Array.from({length:5},(_,i)=>s.call('/api/workspace',token,{baseVersion:0,state:state('Draft '+i)},'PUT')))
 assert.deepEqual(writes.map(r=>r.status).sort(),[200,409,409,409,409])
 const winningIndex=writes.findIndex(r=>r.status===200),w=await(await s.call('/api/workspace',token)).json() as {version:number;state:{profile:{name:string}}};assert.equal(w.version,1);assert.equal(w.state.profile.name,'Draft '+winningIndex)
})
test('reads see the committed snapshot during a held worker lease; writes fail bounded and do not mutate',async()=>{
 const s=setup(new Repository(),20),token=s.repository.account('one');s.repository.state.workspaces.one={version:1,updatedAt:Date.now(),state:state('Before')};s.repository.hold=true
 assert.equal((await s.call('/api/workspace',token)).status,200)
 const response=await s.call('/api/workspace',token,{baseVersion:1,state:state('After')},'PUT');assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'2');assert.equal(s.repository.state.workspaces.one.version,1)
 s.repository.hold=false;assert.equal((await s.call('/api/workspace',token,{baseVersion:1,state:state('After')},'PUT')).status,200)
 const restarted=setup(s.repository);assert.equal((await(await restarted.call('/api/workspace',token)).json() as {version:number}).version,2)
})
test('lost persistence leaves lease abandoned and never returns success',async()=>{
 const s=setup(new Repository(),0),token=s.repository.account('one');s.repository.failSave=true
 assert.equal((await s.call('/api/workspace',token,{baseVersion:0,state:state('Unsaved')},'PUT')).status,503)
 assert.ok(s.repository.token);assert.equal(s.repository.state.workspaces.one,undefined)
})
test('edge recovery attempts enforce the limit across fresh handlers',async()=>{
 const repository=new Repository()
 for(let i=0;i<10;i++)assert.equal((await setup(repository).call('/api/auth/recover',undefined,{key:'invalid'})).status,401)
 assert.equal((await setup(repository).call('/api/auth/recover',undefined,{key:'invalid'})).status,429)
})
test('bounded acquisition waiting resolves a burst that fast-fail acquisition rejects',async()=>{
 for(const [wait,expected]of [[0,[200,503,503,503,503]],[500,[200,200,200,200,200]]] as const){
  const s=setup(new Repository(),wait),tokens=Array.from({length:5},(_,i)=>s.repository.account('burst-'+i))
  const responses=await Promise.all(tokens.map((t,i)=>s.call('/api/workspace',t,{baseVersion:0,state:state('Burst '+i)},'PUT')))
  assert.deepEqual(responses.map(r=>r.status).sort(),[...expected])
 }
})
