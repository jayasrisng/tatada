import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { GmailConnection, GmailPrintDelivery } from '../gmail.ts'
import { Sealer } from '../crypto.ts'
import { Store } from '../store.ts'
import { PrintUncertain, type PrintJob } from '../print.ts'

function setup(o:{scope?:string;email?:string;verified?:boolean;refresh?:boolean}={}){
 const store=Store.memory(),clock={now:1000},calls:{url:string;body?:URLSearchParams}[]=[]
 const connection=new GmailConnection({store,sealer:new Sealer('private-test-key-with-more-than-thirty-two-characters'),clientId:'client-id',clientSecret:'client-secret',redirectUri:'http://127.0.0.1:5180/api/gmail/callback',now:()=>clock.now,fetch:async(input,init)=>{
  const url=String(input),body=init?.body instanceof URLSearchParams?init.body:undefined;calls.push({url,body})
  if(url.endsWith('/userinfo'))return Response.json({email:o.email??'star@example.test',email_verified:o.verified??true,sub:'google-subject'})
  if(url.endsWith('/revoke'))return new Response('')
  if(url.endsWith('/token'))return Response.json({access_token:body?.get('grant_type')==='refresh_token'?'refreshed-access-secret':'initial-access-secret',...(o.refresh===false?{}:{refresh_token:'private-refresh-secret'}),expires_in:120,scope:o.scope??'openid email https://www.googleapis.com/auth/gmail.send'})
  throw new Error('Unexpected test URL')
 }})
 const begin=(owner='a',binding='browser-binding')=>new URL(connection.begin(owner,binding,'/trip/trip-one/print')).searchParams.get('state')!
 const connect=async()=>{const state=begin();await connection.finish('a',state,'authorization-code','browser-binding')}
 return {store,clock,calls,connection,begin,connect}
}
const job=()=>({id:'job-123',address:'fixture-desk@print.epsonconnect.com',sender:{kind:'gmail',verified:true,label:'star@example.test'},document:{kind:'card'}} as PrintJob)

test('Gmail requests send-only OAuth and binds a one-use state to account, browser and expiry',async()=>{
 const s=setup(),url=new URL(s.connection.begin('a','binding','https://evil.example'))
 assert.deepEqual(url.searchParams.get('scope')?.split(' '),['openid','email','https://www.googleapis.com/auth/gmail.send'])
 assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256')
 const state=url.searchParams.get('state')!
 await assert.rejects(s.connection.finish('b',state,'code','binding'),/another browser/)
 await assert.rejects(s.connection.finish('a',state,'code','wrong-binding'),/another browser/)
 assert.equal(s.calls.length,0)
 assert.equal(await s.connection.finish('a',state,'code','binding'),'/welcome')
 await assert.rejects(s.connection.finish('a',state,'code','binding'),/expired/)
 const next=s.begin();s.clock.now+=600001;await assert.rejects(s.connection.finish('a',next,'code','browser-binding'),/expired/)
})
test('Gmail credentials are sealed, account-scoped, refreshable and excluded from status',async()=>{
 const s=setup();await s.connect()
 assert.equal(s.connection.status('a').email,'star@example.test');assert.equal(s.connection.status('b').connected,false)
 const data=JSON.stringify(s.store.data),status=JSON.stringify(s.connection.status('a'))
 for(const secret of ['initial-access-secret','private-refresh-secret','client-secret','star@example.test'])assert.equal(data.includes(secret),false)
 assert.equal(status.includes('initial-access-secret'),false)
 assert.equal(await s.connection.access('a'),'initial-access-secret')
 s.clock.now+=70000
 const tokens=await Promise.all([s.connection.access('a'),s.connection.access('a')])
 assert.deepEqual(tokens,['refreshed-access-secret','refreshed-access-secret'])
 assert.equal(s.calls.filter(c=>c.body?.get('grant_type')==='refresh_token').length,1)
 await s.connection.disconnect('a');assert.equal(s.connection.status('a').connected,false)
 assert.equal(s.calls.filter(c=>c.url.endsWith('/revoke')).length,1)
})
test('missing send permission, unverified identity, header injection and missing offline access are rejected',async()=>{
 for(const options of [{scope:'openid email'},{verified:false},{email:'star@example.test\r\nBcc: victim@example.test'},{refresh:false}]){
  const s=setup(options);await assert.rejects(s.connect());assert.equal(s.connection.status('a').connected,false)
 }
 const connection=new GmailConnection({store:Store.memory(),sealer:new Sealer('long-enough-private-key-for-test-encryption'),redirectUri:'http://127.0.0.1/callback'})
 assert.equal(connection.status('a').configured,false);assert.throws(()=>connection.begin('a','binding','/welcome'),/configuration/)
})
test('Gmail sends the exact PDF attachment only to Epson and returns a real message receipt',async()=>{
 const s=setup();await s.connect();let sends=0,raw=''
 const delivery=new GmailPrintDelivery(s.connection,async(input,init)=>{sends++;assert.equal(String(input),'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal((init?.headers as Record<string,string>).authorization,'Bearer initial-access-secret');raw=Buffer.from(JSON.parse(String(init?.body)).raw,'base64url').toString();return Response.json({id:'gmail-message-id'})})
 const pdf=Buffer.from('%PDF-1.4 exact approved bytes')
 assert.deepEqual(await delivery.send('a',job(),pdf),{ok:true,ref:'gmail-message-id'})
 assert.match(raw,/To: fixture-desk@print.epsonconnect.com\r\n/);assert.match(raw,/Content-Type: application\/pdf/)
 assert.ok(raw.includes(pdf.toString('base64')));assert.doesNotMatch(raw,/Content-Type: text\//)
 assert.equal((await delivery.send('a',{...job(),address:'other@example.test'},pdf)).ok,false)
 assert.equal((await delivery.send('b',job(),pdf)).ok,false)
 assert.equal(sends,1)
})
test('Gmail ambiguous sends never become success; definite rejections stay rejected',async()=>{
 const s=setup();await s.connect()
 for(const request of [async()=>new Response('',{status:503}),async()=>Response.json({}),async()=>{throw new Error('network lost')}]){
  const delivery=new GmailPrintDelivery(s.connection,request)
  await assert.rejects(delivery.send('a',job(),Buffer.from('pdf')),PrintUncertain)
 }
 for(const status of [401,403,429]){
  const delivery=new GmailPrintDelivery(s.connection,async()=>new Response('',{status}))
  assert.equal((await delivery.send('a',job(),Buffer.from('pdf'))).ok,false)
 }
})
test('disconnect during refresh cannot restore deleted Gmail access',async()=>{
 const s=setup();await s.connect();s.clock.now+=70000
 const request=s.connection.access('a');await s.connection.disconnect('a')
 await assert.rejects(request,/connection changed/);assert.equal(s.connection.status('a').connected,false)
})

test('Gmail API routes bind the callback cookie and expose no credentials',async()=>{
 const {createServer}=await import('node:http'),{createApp,OWNER_ID}=await import('../app.ts'),{ActionService}=await import('../actions.ts'),{MockFoAdapter}=await import('../fo.ts')
 const s=setup(),fo=new MockFoAdapter(s.store),actions=new ActionService({store:s.store,fo})
 const server=createServer(),appUrl='http://localhost:5173'
 server.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
 const port=(server.address() as {port:number}).port,host=`127.0.0.1:${port}`,base=`http://${host}`
 server.on('request',createApp({store:s.store,fo,actions,gmail:s.connection,appUrl,secureCookies:false,owner:{allowedHosts:[host],allowedOrigins:[appUrl]}}))
 try{
  const started=await fetch(base+'/api/gmail/connect?returnTo=/trip/trip-one/print',{redirect:'manual'})
  assert.equal(started.status,302)
  const location=new URL(started.headers.get('location')!),state=location.searchParams.get('state')!,cookie=started.headers.get('set-cookie')!.split(';')[0]
  const wrong=await fetch(base+`/api/gmail/callback?code=test&state=${state}`,{redirect:'manual'})
  assert.match(wrong.headers.get('location')!,/gmail=error/);assert.equal(s.connection.status(OWNER_ID).connected,false)
  const finished=await fetch(base+`/api/gmail/callback?code=test&state=${state}`,{headers:{cookie},redirect:'manual'})
  assert.equal(finished.headers.get('location'),appUrl+'/#/trip/trip-one/print?gmail=connected')
  const status=await(await fetch(base+'/api/gmail/status')).json() as {connected:boolean}
  assert.equal(status.connected,true);assert.equal(JSON.stringify(status).includes('access-secret'),false)
  const denied=await fetch(base+'/api/gmail/disconnect',{method:'POST',headers:{'x-tatada':'1',origin:'https://evil.example'}})
  assert.equal(denied.status,403)
  const removed=await fetch(base+'/api/gmail/disconnect',{method:'POST',headers:{'x-tatada':'1',origin:appUrl}})
  assert.equal(removed.status,200);assert.equal(s.connection.status(OWNER_ID).connected,false)
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
})

test('disconnect during authorization cannot restore a cancelled connection',async()=>{
 const store=Store.memory();let release!:(response:Response)=>void,signal!:()=>void
 const started=new Promise<void>(resolve=>{signal=resolve})
 const connection=new GmailConnection({store,sealer:new Sealer('a-test-secret-long-enough-for-token-encryption'),clientId:'id',clientSecret:'secret',redirectUri:'http://127.0.0.1/callback',fetch:async(input)=>{
  if(String(input).endsWith('/token'))return Response.json({access_token:'access',refresh_token:'refresh',scope:'openid email https://www.googleapis.com/auth/gmail.send',expires_in:3600})
  signal();return new Promise<Response>(resolve=>{release=resolve})
 }})
 const state=new URL(connection.begin('a','binding','/welcome')).searchParams.get('state')!
 const completing=connection.finish('a',state,'code','binding');await started
 await connection.disconnect('a');release(Response.json({email:'star@example.test',email_verified:true,sub:'subject'}))
 await assert.rejects(completing,/cancelled or replaced/);assert.equal(connection.status('a').connected,false)
})

test('preferred print email is an OAuth hint, never authority to forge the sender',async()=>{
 const s=setup(),url=new URL(s.connection.begin('a','browser-binding','/trip/trip-one/print/flights','preferred@example.test'))
 assert.equal(url.searchParams.get('login_hint'),'preferred@example.test')
 const state=url.searchParams.get('state')!;await s.connection.finish('a',state,'authorization-code','browser-binding')
 assert.equal((await new GmailPrintDelivery(s.connection).sender('a')).label,'star@example.test')
})

test('hosted Gmail callback waits for same account/tab proof without third-party cookies',async()=>{
 const s=setup(),state=s.begin('a','browser-binding'),staged=s.connection.stage(state,'private-code')
 assert.equal(s.calls.length,0);assert.equal(JSON.stringify(s.store.data).includes('private-code'),false)
 await assert.rejects(()=>s.connection.complete('b',staged.exchange,'browser-binding'),/another browser/)
 await assert.rejects(()=>s.connection.complete('a',staged.exchange,'wrong'),/another browser/)
 assert.equal(s.calls.length,0)
 await s.connection.complete('a',staged.exchange,'browser-binding');assert.equal(s.connection.status('a').connected,true)
 await assert.rejects(()=>s.connection.complete('a',staged.exchange,'browser-binding'),/expired/)
})

test('hosted Gmail prepare/callback/complete routes are account-bound without callback cookies',async()=>{
 const {createApp}=await import('../app.ts'),{ActionService}=await import('../actions.ts'),{MockFoAdapter}=await import('../fo.ts'),{webRequest}=await import('../web.ts'),{sha256}=await import('../crypto.ts')
 const s=setup(),fo=new MockFoAdapter(s.store),actions=new ActionService({store:s.store,fo}),app=createApp({store:s.store,fo,actions,gmail:s.connection,appUrl:'https://app.fixture',secureCookies:true,bearerSessions:true})
 const call=(path:string,method='GET',token?:string,body?:unknown)=>webRequest(new Request('https://api.fixture'+path,{method,headers:{'x-tatada':'1',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)}),path,app)
 const a=await(await call('/api/session','POST',undefined,{})).json() as {sessionToken:string},b=await(await call('/api/session','POST',undefined,{})).json() as {sessionToken:string}
 const prepared=await(await call('/api/gmail/prepare','POST',a.sessionToken,{binding:sha256('tab-secret'),returnTo:'/welcome'})).json() as {url:string},state=new URL(prepared.url).searchParams.get('state')!
 const callback=await call(`/api/gmail/callback?state=${state}&code=private-code`)
 assert.equal(callback.status,302);assert.equal(s.calls.length,0)
 const redirect=new URL(callback.headers.get('location')!),exchange=new URLSearchParams(redirect.hash.split('?')[1]).get('gmail_exchange')!
 assert.ok(exchange)
 assert.equal((await call('/api/gmail/complete','POST',b.sessionToken,{exchange,binding:'tab-secret'})).status,400)
 assert.equal((await call('/api/gmail/complete','POST',a.sessionToken,{exchange,binding:'wrong-tab'})).status,400)
 const complete=await call('/api/gmail/complete','POST',a.sessionToken,{exchange,binding:'tab-secret'});assert.equal(complete.status,200);assert.equal((await complete.json() as {connected:boolean}).connected,true)
})
