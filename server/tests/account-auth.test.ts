import test from 'node:test'
import assert from 'node:assert/strict'
import {SupabaseIdentity,ownerFor,linkOwner,freshMfa,principalAllowed,MFA_WINDOW,finishAuthDeletions,type IdentityGateway,type Principal} from '../account-auth.ts'
import {PrintService,MockPrintDelivery} from '../print.ts'
import {Store} from '../store.ts'
import {sha256} from '../crypto.ts'
import {createApp} from '../app.ts'
import {webRequest} from '../web.ts'
import {setup} from './helpers.ts'
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const t=1_000_000,p:Principal={id:uid,sessionId:sid,sessionCreatedAt:t-1000,hasTotp:true,mfaAt:t}
const recovery=`tatada-recovery_${'a'.repeat(43)}`
function legacy(store:Store){store.data.accounts.old={kind:'connected',createdAt:1,lastLoginAt:1};store.data.workspaces.old={version:8,updatedAt:2,state:{onboarded:true,profile:{name:'Private fixture'},trips:[{id:'trip'}],journal:[{id:'journal'}]}};store.data.tokens.old='sealed-fixture';store.data.accountRecovery={[sha256(recovery)]:{owner:'old',createdAt:1}}}
test('single-use linking preserves all old records, supports empty bootstrap, and survives store reload',()=>{
 const store=Store.memory();legacy(store);const before=structuredClone(store.data.workspaces.old);const initial=ownerFor(store,p,t,true)!;store.data.workspaces[initial]={version:1,updatedAt:t,state:{onboarded:false,profile:{name:'',homeAirport:'',style:[],diet:[],memberships:[]},trips:[],canvas:{}}}
 assert.equal(linkOwner(store,p,recovery,t),'old');assert.deepEqual(store.data.workspaces.old,before);assert.equal(store.data.tokens.old,'sealed-fixture');assert.ok(store.data.accounts[initial]);assert.equal(store.data.accountRecovery?.[sha256(recovery)],undefined)
 const restored=Store.memory();restored.data=JSON.parse(JSON.stringify(store.data));assert.equal(ownerFor(restored,p,t),'old');assert.throws(()=>linkOwner(restored,p,recovery,t),/invalid or already used/)
 const second={...p,id:'other-uid'};store.data.accountRecovery![sha256(recovery)]={owner:'old',createdAt:1};assert.throws(()=>linkOwner(store,second,recovery,t),/already linked/);assert.deepEqual(store.data.workspaces.old,before)
})
test('linking refuses populated destinations and missing MFA without consuming recovery credentials',()=>{
 const store=Store.memory();legacy(store);const current=ownerFor(store,p,t,true)!;store.data.gmailTokens={[current]:'sealed-other'}
 const before=JSON.stringify(store.data);assert.throws(()=>linkOwner(store,p,recovery,t),/contains data/);assert.equal(JSON.stringify(store.data),before);assert.throws(()=>linkOwner(store,{...p,mfaAt:undefined},recovery,t),/Recent TOTP/);assert.equal(JSON.stringify(store.data),before)
})
test('MFA expires, explicit relocking rejects old elevation, and sessions enforce idle/absolute/revocation limits',()=>{
 const s=Store.memory();assert.equal(freshMfa(s,p,t),true);assert.equal(freshMfa(s,p,t+MFA_WINDOW),false);s.data.authLocks={[sid]:t};assert.equal(freshMfa(s,p,t),false);assert.equal(freshMfa(s,{...p,mfaAt:t+1000},t+1000),true)
 assert.equal(principalAllowed(s,p,t),true);assert.equal(principalAllowed(s,p,t+14*86400000),false);s.data.authLastSeen={[sid]:t+29*86400000};assert.equal(principalAllowed(s,p,t+30*86400000),false)
 s.data.authRevokedSessions={[sid]:0};assert.equal(principalAllowed(s,p,t),false);delete s.data.authRevokedSessions[sid];s.data.authRevokedBefore={[uid]:t};assert.equal(principalAllowed(s,p,t),false);assert.equal(principalAllowed(s,{...p,sessionCreatedAt:t+1},t+1),true)
})
test('Supabase verifier checks authoritative user and session before trusting signed claims; both TOTP AMRs work',async()=>{
 let userStatus=200,active=true,confirmed=true,sessionStatus=200,calls:string[]=[]
 const claims={sub:uid,session_id:sid,iss:'https://auth.fixture/auth/v1',role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,aal:'aal2',amr:[{method:'mfa/totp',timestamp:Math.floor(Date.now()/1000)}]}
 const token=(change={})=>`fixture.${Buffer.from(JSON.stringify({...claims,...change})).toString('base64url')}.fixture`
 const identity=new SupabaseIdentity({url:'https://auth.fixture',publicKey:'public-fixture',serviceKey:'service-fixture',fetch:async(input,init)=>{calls.push(String(input));if(String(input).endsWith('/user'))return Response.json({id:uid,email_confirmed_at:confirmed?'2026-01-01':null,factors:[{factor_type:'totp',status:'verified'}]},{status:userStatus});assert.equal(new Headers(init?.headers).get('authorization'),'Bearer service-fixture');return Response.json({active,createdAt:Date.now()-1000},{status:sessionStatus})}})
 assert.ok((await identity.verify(token()))?.mfaAt);assert.ok((await identity.verify(token({amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]})))?.mfaAt)
 for(const change of [{sub:sid},{iss:'https://attacker.fixture/auth/v1'},{exp:1},{session_id:'not-uuid'},{aud:'anonymous'}])assert.equal(await identity.verify(token(change)),null)
 assert.equal((await identity.verify(token({amr:[{method:'password',timestamp:Date.now()/1000}]})))?.mfaAt,undefined)
 active=false;assert.equal(await identity.verify(token()),null);active=true;confirmed=false;assert.equal(await identity.verify(token()),null);confirmed=true
 calls=[];userStatus=401;assert.equal(await identity.verify(token()),null);assert.equal(calls.length,1);userStatus=200;sessionStatus=503;await assert.rejects(()=>identity.verify(token()),/server configuration/)
})
function fixture(){const s=setup();let elevated=true,deleted:string[]=[];const principals:Record<string,Principal>={alice:{...p},bob:{...p,id:'bob',sessionId:'bob-session'}};const identity:IdentityGateway={publicConfig:{mode:'supabase',url:'https://auth.fixture',publicKey:'public-fixture'},verify:async token=>principals[token]?{...principals[token],mfaAt:elevated?s.clock.t:undefined}:null,deleteUser:async id=>{deleted.push(id)}}
 const printer=new PrintService({store:s.store,delivery:new MockPrintDelivery(s.store)});const handle=createApp({print:printer,store:s.store,actions:s.service,appUrl:'https://app.fixture',secureCookies:true,identity,now:()=>s.clock.t})
 const request=async(token:string,path:string,method='GET',body?:unknown)=>{const r=await webRequest(new Request('https://app.fixture'+path,{method,headers:{authorization:`Bearer ${token}`,'x-tatada':'1',origin:'https://app.fixture','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),path,handle);return {status:r.status,body:await r.json() as any}}
 return {...s,printer,request,deleted,identity,lock:()=>{elevated=false}}
}
test('API isolates verified UIDs and printers; MFA gates profile, export, print, Wajo and account operations',async()=>{
 const f=fixture();for(const token of ['alice','bob'])assert.equal((await f.request(token,'/api/session','POST')).status,200)
 const a=f.store.data.authOwners![uid].owner,b=f.store.data.authOwners!.bob.owner;assert.notEqual(a,b)
 f.printer.setPrinter(a,{email:'controlled-fixture@print.epsonconnect.com'});assert.equal((await f.request('bob','/api/print/printer')).body.printer,null);assert.equal((await f.request('alice','/api/print/printer')).body.printer.email,'controlled-fixture@print.epsonconnect.com')
 const cfg=await f.request('','/api/auth/config');assert.equal(cfg.body.publicKey,'public-fixture');assert.equal(cfg.body.serviceKey,undefined)
 f.store.data.workspaces[a]={version:1,updatedAt:t,state:{onboarded:true,profile:{name:'Alice private'},trips:[],items:[],actions:[],chat:[],canvas:{},decisions:[]}}
 assert.equal((await f.request('bob','/api/workspace')).body.state,null)
 f.lock();assert.equal((await f.request('alice','/api/workspace')).body.state.profile.name,'')
 for(const [path,method]of [['/api/shares','GET'],['/api/account/export','GET'],['/api/print/printer','GET'],['/api/auth/wajo/link','POST'],['/api/fo/disconnect','POST'],['/api/account/recovery-key','POST'],['/api/account/delete','POST']])assert.equal((await f.request('alice',path,method)).status,403,path)
 const changed={...(f.store.data.workspaces[a].state as object),profile:{name:'Attacker'}};assert.equal((await f.request('alice','/api/workspace','PUT',{state:changed,version:1})).status,403);assert.equal((f.store.data.workspaces[a].state as any).profile.name,'Alice private')
 assert.equal((await f.request('alice','/api/payments','POST',{})).status,403)
 assert.equal((await f.request('unverified','/api/session','POST')).body.authenticated,false)
})
test('logout invalidates the app session, while consented deletion targets only its verified UID and preserves another owner',async()=>{
 const f=fixture();await f.request('alice','/api/session','POST');await f.request('bob','/api/session','POST');const bobOwner=f.store.data.authOwners!.bob.owner
 assert.equal((await f.request('alice','/api/account/delete','POST',{confirm:'DELETE',userId:'bob'})).status,200);assert.deepEqual(f.deleted,[uid]);assert.ok(f.store.data.accounts[bobOwner]);assert.equal((await f.request('alice','/api/session','POST')).body.authenticated,false)
 await f.request('bob','/api/auth/logout','POST',{everywhere:true});assert.equal((await f.request('bob','/api/session','POST')).body.authenticated,false)
})
test('provider deletion failure keeps a persisted tombstone and bounded retry job',async()=>{
 const s=Store.memory();s.data.authDeletedUsers={[uid]:t};s.data.authDeletions={[uid]:{status:'pending',requestedAt:t,attempts:0}};let calls=0;const identity:IdentityGateway={publicConfig:{mode:'supabase',url:'https://auth.fixture',publicKey:'fixture'},verify:async()=>null,deleteUser:async()=>{calls++;if(calls===1)throw Error('fixture unavailable')}}
 await finishAuthDeletions(s,identity,t);assert.equal(s.data.authDeletions[uid].status,'pending');assert.equal(principalAllowed(s,p,t),false);await finishAuthDeletions(s,identity,t+1);assert.equal(calls,1);await finishAuthDeletions(s,identity,t+60001);assert.equal(s.data.authDeletions[uid].status,'done')
})
test('mapping-only rollback preserves legacy records and never resurrects a consumed key',()=>{
 const s=Store.memory();legacy(s);const records=JSON.stringify({workspace:s.data.workspaces.old,tokens:s.data.tokens.old});const from=ownerFor(s,p,t,true)!;linkOwner(s,p,recovery,t)
 const history=s.data.authLinkHistory!.at(-1)!;assert.equal(history.from,from);assert.equal(history.to,'old')
 // Isolated operator rollback rehearsal: change the mapping only, not a database restore.
 s.update(d=>{assert.equal(d.authOwners![uid].owner,history.to);d.authOwners![uid]={owner:history.from!,linkedAt:t+1}})
 assert.equal(ownerFor(s,p,t+1),from);assert.equal(JSON.stringify({workspace:s.data.workspaces.old,tokens:s.data.tokens.old}),records);assert.equal(s.data.accountRecovery![sha256(recovery)],undefined)
})
test('concurrent hosted recovery claims serialize and preserve ownership on handler recreation',async()=>{
 const {createEdgeHandler}=await import('../edge.ts');const s=Store.memory();legacy(s);let state=structuredClone(s.data),lease:string|undefined
 const repository={read:async()=>structuredClone(state),acquire:async(token:string)=>{if(lease)return{busy:true};lease=token;return{state:structuredClone(state)}},save:async(token:string,next:typeof state)=>{assert.equal(token,lease);state=structuredClone(next)},release:async(token:string)=>{assert.equal(token,lease);lease=undefined}}
 const now=Date.now();const identity:IdentityGateway={publicConfig:{mode:'supabase',url:'https://auth.fixture',publicKey:'fixture'},verify:async token=>({...p,id:token,sessionId:`session-${token}`,sessionCreatedAt:now-1000,mfaAt:now})}
 const options={repository,identity,appUrl:'https://app.fixture',publicUrl:'https://edge.fixture/functions/v1/tatada-api',secret:'fixture-secret-'.repeat(4),mode:'mock' as const}
 const request=(handler:ReturnType<typeof createEdgeHandler>,token:string,path:string,body:unknown={})=>handler(new Request(options.publicUrl+path,{method:'POST',headers:{origin:'https://app.fixture','x-tatada':'1',authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)}))
 const handle=createEdgeHandler(options);await request(handle,'alice','/api/session');await request(handle,'bob','/api/session')
 const results=await Promise.all(['alice','bob'].map(token=>request(handle,token,'/api/account/link',{key:recovery})));assert.deepEqual(results.map(r=>r.status).sort(),[200,401])
 const winner=results[0].status===200?'alice':'bob',loser=winner==='alice'?'bob':'alice';assert.equal(state.authOwners![winner].owner,'old');assert.notEqual(state.authOwners![loser].owner,'old');assert.equal(state.accountRecovery![sha256(recovery)],undefined)
 const recreated=createEdgeHandler(options),session=await request(recreated,winner,'/api/session');assert.equal((await session.json() as any).account.id,'old');assert.deepEqual(state.workspaces.old,s.data.workspaces.old);assert.equal(state.tokens.old,'sealed-fixture')
})

test('auth public configuration rejects accidental secret-key exposure',()=>{for(const publicKey of ['sb_secret_synthetic',`header.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.signature`])assert.throws(()=>new SupabaseIdentity({url:'https://auth.fixture',publicKey,serviceKey:'synthetic-server-key'}),/public|service|Separate/);})
test('Wajo remains an optional owner-bound integration; connecting and disconnecting never replace email identity',async()=>{
 const s=setup();Object.defineProperty(s.fo,'mode',{value:'live'});let serial=0
 const oauth={connected:(owner:string)=>!!s.store.data.tokens[owner],start:async(binding:string)=>{const state=`fixture-state-${++serial}`;s.store.data.pendingAuth[state]={binding,verifier:'fixture',redirectUri:'https://app.fixture/api/fo/callback',createdAt:s.clock.t};return `https://wajo.fixture/authorize?state=${state}`},finish:async(_code:string,state:string,binding:string)=>{assert.equal(s.store.data.pendingAuth[state].binding,binding);s.store.update(d=>{delete d.pendingAuth[state]});return{tokens:{accessToken:'provider-fixture'}}},saveFor:(owner:string)=>s.store.update(d=>{d.tokens[owner]='sealed-provider-fixture'})}
 const identity:IdentityGateway={publicConfig:{mode:'supabase',url:'https://auth.fixture',publicKey:'fixture'},verify:async token=>token==='email-fixture'?{...p,mfaAt:s.clock.t}:null}
 const handle=createApp({store:s.store,actions:s.service,identity,oauth:oauth as unknown as import('../oauth.ts').FoOAuth,secureCookies:true,bearerSessions:true,appUrl:'https://app.fixture',now:()=>s.clock.t})
 const request=(path:string,method='GET',body?:unknown,cookie?:string)=>webRequest(new Request('https://app.fixture'+path,{method,headers:{authorization:'Bearer email-fixture','x-tatada':'1',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)}),path,handle)
 await request('/api/session','POST');const owner=s.store.data.authOwners![uid].owner
 const attempt=async()=>{const ticket=await(await request('/api/auth/wajo/link','POST',{clientBinding:'a'.repeat(64)})).json() as {ticket:string};const start=await request(`/api/auth/wajo/start?client_binding=${'a'.repeat(64)}&reconnect=${ticket.ticket}`);assert.equal(start.status,302);return {state:new URL(start.headers.get('location')!).searchParams.get('state')!,cookie:start.headers.get('set-cookie')!.split(';')[0]}}
 const first=await attempt();const callback=await request(`/api/fo/callback?code=fixture&state=${first.state}`,'GET',undefined,first.cookie);assert.match(callback.headers.get('location')!,/fo=connected/);assert.equal(s.store.data.tokens[owner],'sealed-provider-fixture');assert.equal(Object.keys(s.store.data.accounts).length,1);assert.equal(s.store.data.authOwners![uid].owner,owner)
 const pending=await attempt();assert.equal((await request('/api/fo/disconnect','POST')).status,200);assert.equal(s.store.data.tokens[owner],undefined);assert.equal(s.store.data.pendingAuth[pending.state],undefined);assert.equal((await(await request('/api/session','POST')).json() as any).authenticated,true)
 const expired=await attempt();s.clock.t+=MFA_WINDOW;const denied=await request(`/api/fo/callback?code=fixture&state=${expired.state}`,'GET',undefined,expired.cookie);assert.match(denied.headers.get('location')!,/reconnect_expired/);assert.equal(s.store.data.tokens[owner],undefined)
})
