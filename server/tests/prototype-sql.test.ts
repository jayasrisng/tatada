import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
const migration=readFileSync(new URL('../../supabase/migrations/20261021201543_private_prototype_invites.sql',import.meta.url),'utf8')
const schema=readFileSync(new URL('../../supabase/schemas/tatada.sql',import.meta.url),'utf8')
// In-memory PostgreSQL only. Hash placeholders are not real Auth passwords.
async function fixture(full=false){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;
 create schema auth;create schema tatada_private;
 create table auth.users(id uuid primary key,encrypted_password text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default clock_timestamp(),not_after timestamptz);
 grant usage on schema auth to supabase_auth_admin;grant insert,update,select on auth.users to supabase_auth_admin;
 `);await db.exec(full?schema:migration);return db}
const metadata=()=>({tatada_prototype:true,tatada_password_reset:randomUUID()})
async function invite(db:PGlite,id=randomUUID(),meta=metadata()){await db.query('insert into auth.users(id,encrypted_password,raw_app_meta_data)values($1,$2,$3)',[id,'synthetic-initial-hash',meta]);return id}
async function session(db:PGlite,id:string){const sid=randomUUID();await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sid,id]);return sid}
async function verify(db:PGlite,id:string,sid:string){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);return(await db.query<{v:{active:boolean;invited?:boolean;requiresPasswordChange?:boolean;resetNonce?:string;passwordChangedAt?:string|null}}>('select tatada_private.auth_session_active($1,$2) v',[id,sid])).rows[0].v}
test('PostgreSQL invitation triggers reject self-signup and user metadata; slots cap admission at ten and revocation preserves users',async()=>{
 const db=await fixture();try{
 await assert.rejects(()=>invite(db,randomUUID(),{} as ReturnType<typeof metadata>),/administrator provisioning/)
 await assert.rejects(()=>db.query('insert into auth.users(id,encrypted_password,raw_user_meta_data)values($1,$2,$3)',[randomUUID(),'synthetic-hash',metadata()]),/administrator provisioning/)
 await db.exec('set role supabase_auth_admin');const first=await invite(db);await db.exec('reset role')
 for(let i=1;i<10;i++)await invite(db)
 await assert.rejects(()=>invite(db),/limited to ten/)
 await db.query("update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{tatada_prototype}','false') where id=$1",[first]);assert.equal((await verify(db,first,await session(db,first))).active,false)
 await invite(db);assert.equal((await db.query<{n:number}>('select count(*)::integer n from auth.users')).rows[0].n,11)
 assert.equal((await db.query<{n:number}>('select count(*)::integer n from tatada_private.prototype_invites where slot is not null')).rows[0].n,10)
 }finally{await db.close()}
})
test('deferred signup guard matches the real Supabase Admin transaction: insert, then trusted metadata, then confirmation',async()=>{
 const db=await fixture();try{
 const id=randomUUID()
 await db.exec('set role supabase_auth_admin')
 await db.transaction(async tx=>{
  await tx.query('insert into auth.users(id,encrypted_password,raw_app_meta_data)values($1,$2,$3)',[id,'synthetic-initial-hash',{provider:'email',providers:['email']}])
  await tx.query('update auth.users set raw_app_meta_data=raw_app_meta_data||$2 where id=$1',[id,metadata()])
  await tx.query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1',[id])
 })
 await db.exec('reset role');const sid=await session(db,id);assert.equal((await verify(db,id,sid)).requiresPasswordChange,true)
 const invalid=randomUUID()
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.query('insert into auth.users(id,encrypted_password)values($1,$2)',[invalid,'synthetic-initial-hash'])
  await tx.query('update auth.users set raw_user_meta_data=$2 where id=$1',[invalid,metadata()])
 }),/administrator provisioning/)
 assert.equal((await db.query('select id from auth.users where id=$1',[invalid])).rows.length,0)
 }finally{await db.close()}
})
test('PostgreSQL password gate changes only on actual Auth password updates; reset nonce rejects every prior session',async()=>{
 const db=await fixture();try{
 const id=await invite(db),sid=await session(db,id);assert.deepEqual(await verify(db,id,sid),{...(await verify(db,id,sid)),active:true,invited:true,requiresPasswordChange:true})
 await db.query('update auth.users set raw_user_meta_data=$2 where id=$1',[id,{requires_password_change:false,tatada_password_reset:randomUUID()}]);assert.equal((await verify(db,id,sid)).requiresPasswordChange,true)
 await db.query("update auth.users set encrypted_password='synthetic-changed-hash' where id=$1",[id]);assert.equal((await verify(db,id,sid)).active,false)
 const second=await session(db,id);assert.equal((await verify(db,id,second)).requiresPasswordChange,true)
 // Even a real hash mutation (including login-time re-encryption) cannot unlock
 // without service-only completion after an explicit successful Auth change.
 const initial=await verify(db,id,second)
 const complete=async(nonce=initial.resetNonce!,prior: string|null=initial.passwordChangedAt!)=>(await db.query<{v:boolean}>('select tatada_private.complete_password_change($1,$2,$3,$4) v',[id,second,nonce,prior])).rows[0].v
 assert.equal(await complete(),false);assert.equal(await complete('wrong-nonce',null),false)
 assert.equal(await complete(initial.resetNonce!,null),true)
 assert.equal((await verify(db,id,second)).requiresPasswordChange,false)
 await db.query('update auth.users set encrypted_password=$2,raw_app_meta_data=$3 where id=$1',[id,'synthetic-admin-reset-hash',metadata()]);assert.equal((await verify(db,id,second)).active,false)
 const third=await session(db,id);assert.equal((await verify(db,id,third)).requiresPasswordChange,true)
 await db.query("update auth.users set raw_user_meta_data='{}' where id=$1",[id]);assert.equal((await verify(db,id,third)).requiresPasswordChange,true)
 assert.equal((await verify(db,randomUUID(),third)).active,false)
 }finally{await db.close()}
})
test('declarative schema agrees with migration and browser roles cannot read invitations or call the service-only session helper',async()=>{
 const db=await fixture(true);try{
 const id=await invite(db),sid=await session(db,id);assert.equal((await verify(db,id,sid)).requiresPasswordChange,true)
 assert.deepEqual((await db.query('select public.tatada_auth_session_active($1,$2) v',[id,sid])).rows[0],{v:{active:false}})
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from tatada_private.prototype_invites'),/permission denied/);await assert.rejects(()=>db.query('select public.tatada_auth_session_active($1,$2)',[id,sid]),/permission denied/);await assert.rejects(()=>db.query('select public.tatada_prototype_session_active($1,$2)',[id,sid]),/permission denied/);await assert.rejects(()=>db.query('select public.tatada_complete_password_change($1,$2,$3,null)',[id,sid,'untrusted']),/permission denied/);await db.exec('reset role')}
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'anon'})]);assert.deepEqual((await db.query('select tatada_private.auth_session_active($1,$2) v',[id,sid])).rows[0],{v:{active:false}})
 }finally{await db.close()}
})

const betaMigration=readFileSync(new URL('../../supabase/migrations/20261021211841_beta_invitations_feedback.sql',import.meta.url),'utf8')
async function betaFixture(){const db=await fixture();await db.exec(betaMigration);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);return db}
async function beta(db:PGlite,action:string,actor:string|null,args:Record<string,unknown>={}){return(await db.query<{v:any}>('select public.tatada_beta($1,$2,$3) v',[action,actor,args])).rows[0].v}
async function claimed(db:PGlite,hash:string){const nonce=randomUUID(),link=await beta(db,'begin',null,{hash,nonce}),id=randomUUID();assert.equal(link.error,undefined);await db.transaction(async tx=>{await tx.query('insert into auth.users(id,encrypted_password,raw_app_meta_data)values($1,$2,$3)',[id,'synthetic-claimed-hash',{provider:'email'}]);await tx.query('update auth.users set raw_app_meta_data=raw_app_meta_data||$2 where id=$1',[id,{...metadata(),tatada_beta_invitation:link.id,tatada_beta_claim:nonce,tatada_email_ownership_verified:false}])});return id}
test('beta owner bootstrap is one-use and owner is separate from ten reserved tester slots',async()=>{
 const db=await betaFixture();try{
 const ownerHash='a'.repeat(64);await beta(db,'bootstrap',null,{hash:ownerHash});assert.equal((await beta(db,'bootstrap',null,{hash:'b'.repeat(64)})).error,'owner_exists')
 const owner=await claimed(db,ownerHash);assert.equal((await verify(db,owner,await session(db,owner))).requiresPasswordChange,false)
 assert.equal((await db.query<{slot:number}>("select slot from tatada_private.prototype_invites where user_id=$1",[owner])).rows[0].slot,0)
 for(let n=1;n<=10;n++)assert.equal((await beta(db,'create',owner,{hash:n.toString(16).padStart(64,'0')})).slot,n)
 assert.equal((await beta(db,'create',owner,{hash:'f'.repeat(64)})).error,'capacity')
 const tester=await claimed(db,'1'.padStart(64,'0'));assert.equal((await beta(db,'create',tester,{hash:'c'.repeat(64)})).error,'owner_required')
 await db.query('update auth.users set raw_user_meta_data=$2 where id=$1',[tester,{role:'owner',tatada_prototype:true}]);assert.equal((await beta(db,'list',tester)).error,'owner_required')
 assert.equal((await beta(db,'begin',null,{hash:'1'.padStart(64,'0'),nonce:randomUUID()})).error,'invalid_invitation')
 }finally{await db.close()}
})
test('revocation preserves user rows, immediately denies sessions, and frees a slot; expiration and racing claims fail closed',async()=>{
 const db=await betaFixture();try{
 await beta(db,'bootstrap',null,{hash:'a'.repeat(64)});const owner=await claimed(db,'a'.repeat(64))
 const invitation=await beta(db,'create',owner,{hash:'b'.repeat(64)}),tester=await claimed(db,'b'.repeat(64)),sid=await session(db,tester);assert.equal((await verify(db,tester,sid)).active,true)
 await beta(db,'revoke',owner,{id:invitation.id});assert.equal((await verify(db,tester,sid)).active,false);assert.equal((await db.query('select id from auth.users where id=$1',[tester])).rows.length,1)
 await db.query('update auth.users set encrypted_password=$2 where id=$1',[tester,'synthetic-login-reencryption']);assert.equal((await verify(db,tester,await session(db,tester))).active,false)
 const next=await beta(db,'create',owner,{hash:'c'.repeat(64)});assert.equal(next.slot,1)
 const race=await Promise.all([1,2].map(()=>beta(db,'begin',null,{hash:'c'.repeat(64),nonce:randomUUID()})));assert.equal(race.filter(v=>!v.error).length,1)
 await beta(db,'revoke',owner,{id:next.id})
 const expiry=await beta(db,'create',owner,{hash:'d'.repeat(64)});await db.query("update tatada_private.beta_invitations set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expiry.id]);assert.equal((await beta(db,'inspect',null,{hash:'d'.repeat(64)})).error,'invalid_invitation');assert.equal((await beta(db,'create',owner,{hash:'e'.repeat(64)})).slot,1)
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>beta(db,'list',owner),/permission denied/);await assert.rejects(()=>db.query('select * from tatada_private.beta_invitations'),/permission denied/);await db.exec('reset role')}
 }finally{await db.close()}
})
test('feedback is bounded, owner-only for review, and regular users cannot resolve other reports',async()=>{
 const db=await betaFixture();try{
 await beta(db,'bootstrap',null,{hash:'a'.repeat(64)});const owner=await claimed(db,'a'.repeat(64));await beta(db,'create',owner,{hash:'b'.repeat(64)});const tester=await claimed(db,'b'.repeat(64))
 const input={category:'saving',severity:'critical',message:'The save button does not finish.',page:'/trip/:id',version:'synthetic-fixture',device:'phone'}
 const report=await beta(db,'feedback',tester,input);assert.ok(report.id);assert.equal((await beta(db,'list',tester)).error,'owner_required');assert.equal((await beta(db,'resolve',tester,{id:report.id})).error,'owner_required')
 const view=await beta(db,'list',owner);assert.equal(view.feedback[0].severity,'critical');assert.equal(view.invitations[0].token_hash,undefined);assert.equal(view.invitations[0].claim_nonce,undefined)
 await beta(db,'resolve',owner,{id:report.id,status:'resolved'});assert.equal((await beta(db,'list',owner)).feedback[0].status,'resolved')
 for(let n=1;n<5;n++)await beta(db,'feedback',tester,input);assert.equal((await beta(db,'feedback',tester,input)).error,'rate')
 }finally{await db.close()}
})
