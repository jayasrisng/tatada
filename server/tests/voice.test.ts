import test from 'node:test'
import assert from 'node:assert/strict'
import { LiveFoAdapter } from '../fo.ts'
import { McpClient } from '../mcp.ts'
import { Store } from '../store.ts'

test('voice accepts only the actual Wajo joinUrl contract and never logs call credentials',async()=>{
 const store=Store.memory(), calls: string[]=[]
 let output: object={content:[],structuredContent:{joinUrl:'https://wajo.ai/call/short-lived-ticket'}}
 const transport=new McpClient('https://provider.test',{fetch:async(_input,init)=>{
  const body=JSON.parse(String(init?.body));calls.push(body.method)
  return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{},serverInfo:{name:'test',version:'1'}}:output})
 }})
 const adapter=new LiveFoAdapter({connected:()=>true,accessToken:async()=> 'private-api-key'},transport,store)
 assert.equal(calls.length,0)
 const result=await adapter.startVoice('star')
 assert.deepEqual(result.links,['https://wajo.ai/call/short-lived-ticket'])
 assert.equal(JSON.stringify(store.data).includes('short-lived-ticket'),false)
 assert.equal(JSON.stringify(result).includes('private-api-key'),false)
 for(const joinUrl of ['https://evil.example/call/token','javascript:alert(1)','https://wajo.ai/call-widget/widget.js','https://wajo.ai.evil.example/call/ticket']){
  output={structuredContent:{joinUrl}}
  assert.deepEqual((await adapter.startVoice('star')).links,[])
 }
 output={content:[{type:'text',text:'A prose link https://wajo.ai/call/untrusted'}]}
 assert.deepEqual((await adapter.startVoice('star')).links,[])
})

test('embedded voice redeems only the one-use Wajo call ticket and never persists participant credentials',async()=>{
 const store=Store.memory(),requests:{url:string;headers:unknown}[]=[]
 const transport=new McpClient('https://provider.test',{fetch:async(_input,init)=>{const body=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='initialize'?{}:{structuredContent:{joinUrl:'https://wajo.ai/call/one-use-ticket'}}})}})
 let response={signalUrl:'wss://livekit.api.wajo.ai',participantToken:'ephemeral-participant-token',iceTransportPolicy:'relay'}
 const adapter=new LiveFoAdapter({connected:()=>true,accessToken:async()=> 'server-only-key'},transport,store,async(input,init)=>{requests.push({url:String(input),headers:init?.headers});return Response.json(response)})
 const join=await adapter.joinVoice('owner')
 assert.equal(join.signalUrl,'wss://livekit.api.wajo.ai/');assert.equal(join.iceTransportPolicy,'relay')
 assert.equal(requests[0].url,'https://mcp.api.wajo.ai/v1/fo-calls/one-use-ticket:join');assert.equal(requests[0].headers,undefined)
 assert.equal(JSON.stringify(store.data).includes('ephemeral-participant-token'),false);assert.equal(JSON.stringify(join).includes('server-only-key'),false)
 for(const signalUrl of ['wss://evil.example','ws://livekit.api.wajo.ai','wss://livekit.api.wajo.ai.evil.example','wss://user:password@livekit.api.wajo.ai']){response={...response,signalUrl};await assert.rejects(adapter.joinVoice('owner'),/Unsupported voice endpoint/)}
})
