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
 create table auth.users(id uuid primary key,encrypted_password text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
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
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from tatada_private.prototype_invites'),/permission denied/);await assert.rejects(()=>db.query('select public.tatada_auth_session_active($1,$2)',[id,sid]),/permission denied/);await assert.rejects(()=>db.query('select public.tatada_complete_password_change($1,$2,$3,null)',[id,sid,'untrusted']),/permission denied/);await db.exec('reset role')}
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'anon'})]);assert.deepEqual((await db.query('select tatada_private.auth_session_active($1,$2) v',[id,sid])).rows[0],{v:{active:false}})
 }finally{await db.close()}
})
