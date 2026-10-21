import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
const require=createRequire(join(process.env.TATADA_TEST_BUILD,'package.json'))
const {fetchWithBackoff}=require('./state/retry.js')
test('reads and session status retry explicit temporary rejection, never uncertain mutations',async()=>{
 for(const [method,path,expected]of [['GET','/api/calendar/status',2],['POST','/api/session',2],['PUT','/api/workspace',1],['POST','/api/print/jobs/id/approve',1],['POST','/api/calendar/add',1]]){
  let calls=0;const response=await fetchWithBackoff('https://api.test'+path,{method},path,async()=>++calls===1?new Response('{}',{status:503,headers:{'retry-after':'0.001'}}):new Response('{}',{status:200}));assert.equal(calls,expected);assert.equal(response.status,expected===2?200:503)
 }
})
test('network uncertainty and invalid/revoked authentication never retry',async()=>{
 let calls=0;await assert.rejects(fetchWithBackoff('https://api.test',{},'/api/status',async()=>{calls++;throw Error('network interrupted')}),/interrupted/);assert.equal(calls,1)
 calls=0;assert.equal((await fetchWithBackoff('https://api.test',{},'/api/status',async()=>{calls++;return new Response('{}',{status:401})})).status,401);assert.equal(calls,1)
})
test('retry backoff stops when aborted',async()=>{
 const c=new AbortController();let calls=0
 const pending=fetchWithBackoff('https://api.test',{signal:c.signal},'/api/status',async()=>{calls++;return new Response('{}',{status:503,headers:{'retry-after':'2'}})})
 setTimeout(()=>c.abort(),5);await assert.rejects(pending);assert.equal(calls,1)
})
