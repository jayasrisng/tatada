import test from 'node:test'
import assert from 'node:assert/strict'
import { IntelligenceService } from '../intelligence.ts'

test('research uses actual citation blocks, bounds web search, and excludes unknown input fields', async () => {
 const calls: {url:string;body?:Record<string,unknown>}[]=[]
 const request=(async(input: string|URL|Request,init?:RequestInit)=>{
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body})
  if(url.endsWith('/models'))return Response.json({data:[{id:'verified-sonnet-model'}]})
  return Response.json({stop_reason:'end_turn',content:[{type:'text',text:'A claim with evidence.',citations:[{url:'https://example.org/official',title:'Official source'},{url:'javascript:alert(1)',title:'Unsafe'}]}]})
 }) as typeof fetch
 const service=new IntelligenceService({key:'private-key',fetch:request})
 const out=await service.research('star',{question:'Tell me about this place',context:'Madrid',passport:'must never be sent'})
 assert.equal(out.searched,true);assert.deepEqual(out.sections[0].sources,[{url:'https://example.org/official',title:'Official source'}])
 assert.equal(JSON.stringify(calls).includes('must never be sent'),false)
 assert.equal((calls[1].body?.tools as {max_uses:number}[])[0].max_uses,3)
 assert.equal(JSON.stringify(out).includes('private-key'),false)
 await service.research('star',{question:'Again'})
 assert.equal(calls.filter(c=>c.url.endsWith('/models')).length,1)
})
test('research without citations stays unverified; oversized inputs and rate limits are enforced',async()=>{
 const service=new IntelligenceService({key:'key',model:'model',now:()=>10000,fetch:async()=>Response.json({stop_reason:'max_tokens',content:[{type:'text',text:'Unverified answer'}]})})
 const out=await service.research('star',{question:'A question'})
 assert.equal(out.searched,false);assert.equal(out.incomplete,true)
 await assert.rejects(service.research('star',{question:'x'.repeat(4001)}),/4,000/)
 for(let i=0;i<3;i++)await service.research('star',{question:'A question'})
 await assert.rejects(service.research('star',{question:'A question'}),/busy/)
})
test('provider errors are sanitized and never become fabricated answers',async()=>{
 const service=new IntelligenceService({key:'private-key',model:'model',fetch:async()=>Response.json({error:{message:'private-key echoed'}},{status:401})})
 await assert.rejects(service.research('star',{question:'A question'}),(e:Error)=>!e.message.includes('private-key')&&/unavailable/.test(e.message))
})

test('closet styling uses supplied garment metadata without web search tools', async () => {
 let sent: Record<string,unknown> = {}
 const service = new IntelligenceService({key:'private',model:'configured-model',fetch:async (_url,init)=>{sent=JSON.parse(String(init?.body));return Response.json({stop_reason:'end_turn',content:[{type:'text',text:'Wear your supplied blue shirt with your black trousers.'}]})}})
 const answer=await service.research('star',{purpose:'style',question:'Office then a birthday dinner; skip the white sweater.',context:'Closet: blue shirt, black trousers, white sweater.'})
 assert.equal('tools' in sent,false)
 assert.match(String(sent.system),/only clothing supplied/)
 assert.match(String(sent.system),/laundry/)
 assert.equal(answer.searched,false)
 assert.match(answer.sections[0].text,/supplied blue shirt/)
})

test('research budget covers reasoning and preserves search blocks when resuming a pause', async()=>{
 const seen:Record<string,unknown>[]=[]
 const paused=[{type:'server_tool_use',id:'search-1',name:'web_search',input:{query:'Los Angeles official transit'}},{type:'web_search_tool_result',tool_use_id:'search-1',content:[{type:'web_search_result',url:'https://www.metro.net',encrypted_content:'opaque-search-content'}]}]
 const service=new IntelligenceService({key:'private',model:'configured-model',fetch:async(_url,init)=>{
  const body=JSON.parse(String(init?.body));seen.push(body)
  if(seen.length===1)return Response.json({stop_reason:'pause_turn',content:paused})
  return Response.json({stop_reason:'end_turn',content:[{type:'text',text:'Keep your transit directions ready.',citations:[{url:'https://www.metro.net',title:'Metro'}]}]})
 }})
 const answer=await service.research('star',{question:'Help me prepare for LA'})
 assert.equal(seen.length,2);assert.equal(seen[0].max_tokens,6144)
 assert.deepEqual((seen[1].messages as unknown[])[1],{role:'assistant',content:paused})
 assert.equal(answer.incomplete,false);assert.equal(answer.searched,true)
 assert.equal(answer.toolCalls[0].tool,'web_search');assert.equal(answer.toolCalls[0].status,'completed')
 assert.equal(answer.toolCalls[0].query,'Los Angeles official transit')
 assert.equal(JSON.stringify(answer).includes('opaque-search-content'),false)
})
test('research bounds repeated pauses and explains reasoning-only token exhaustion',async()=>{
 let calls=0
 const pause=new IntelligenceService({key:'private',model:'configured-model',fetch:async()=>{calls++;return Response.json({stop_reason:'pause_turn',content:[{type:'thinking',thinking:'not user output'}]})}})
 await assert.rejects(pause.research('star',{question:'Help'}),/still searching/);assert.equal(calls,2)
 const exhausted=new IntelligenceService({key:'private',model:'configured-model',fetch:async()=>Response.json({stop_reason:'max_tokens',content:[{type:'thinking',thinking:'not user output'}]})})
 await assert.rejects(exhausted.research('star',{question:'Help'}),/output limit/)
})
