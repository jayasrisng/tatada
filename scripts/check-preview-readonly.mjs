// Read-only diagnostics on the actual localhost preview. No provider tools or account data in the ledger.
import assert from 'node:assert/strict'
import {appendFileSync} from 'node:fs'
import {validateWorkspace} from '../shared/workspace.ts'
const base=process.env.BASE??'http://127.0.0.1:5180'
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/)
const runId=`diagnostic-${new Date().toISOString().replaceAll(':','-')}`
const log=(event,data={})=>appendFileSync('docs/verification/continuation-runs.jsonl',JSON.stringify({runId,at:new Date().toISOString(),category:'diagnostic',event,...data})+'\n')
log('started',{providerCalls:0})
try{
 for(const path of ['/','/sw.js','/api/health','/api/workspace','/api/shares','/api/gmail/status','/api/travel/capabilities']){
  log('tool-start',{tool:'http.GET',path})
  const response=await fetch(base+path,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200)
  const result={status:response.status}
  if(path==='/api/workspace'){const body=await response.json();result.validWorkspace=validateWorkspace(body.state);assert.equal(result.validWorkspace,true)}
  if(path==='/api/gmail/status'){const body=await response.json();result.configured=!!body.configured;result.connected=!!body.connected}
  if(path==='/api/travel/capabilities'){const body=await response.json();result.configured=body.configured??true;result.booking=body.booking}
  log('tool-complete',{tool:'http.GET',path,...result});console.log(path,result)
 }
 log('completed',{success:true,providerCalls:0})
}catch(error){log('completed',{success:false,errorClass:error.name});throw error}
