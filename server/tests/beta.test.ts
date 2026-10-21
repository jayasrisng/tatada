import test from 'node:test'
import assert from 'node:assert/strict'
import {SupabaseBeta,feedbackInput} from '../beta.ts'
// Synthetic credentials only. These fetch fixtures never contact Supabase.
const token='a'.repeat(43),actor='11111111-1111-4111-8111-111111111111'
test('activation uses server Admin credentials, binds the nonce and confirms only technically; no provider data is returned',async()=>{
 const calls:{url:string;body:any;headers:Headers}[]=[]
 const gateway=new SupabaseBeta({url:'https://auth.fixture',serviceKey:'synthetic-server-only',fetch:async(input,init)=>{const body=JSON.parse(String(init?.body));calls.push({url:String(input),body,headers:new Headers(init?.headers)});return Response.json(String(input).endsWith('/users')?{id:actor,email:'synthetic@example.test'}:{id:actor,role:'tester'})}})
 assert.equal(await gateway.activate(token,'synthetic@example.test','Synthetic-only-password!'),undefined)
 assert.equal(calls.length,2);const a=calls[1];assert.equal(a.headers.get('authorization'),'Bearer synthetic-server-only');assert.equal(a.body.email_confirm,true);assert.equal(a.body.app_metadata.tatada_email_ownership_verified,false);assert.equal(a.body.app_metadata.tatada_beta_claim,calls[0].body.p_args.nonce);assert.equal(a.body.app_metadata.tatada_beta_invitation,actor);assert.equal(a.body.app_metadata.role,undefined)
 assert.throws(()=>gateway.inspect('guess'),/invalid/)
})
test('Auth client failures release a claim; ambiguous server failures stay unavailable to replay',async()=>{
 for(const status of [400,500]){const actions:string[]=[];const gateway=new SupabaseBeta({url:'https://auth.fixture',serviceKey:'synthetic',fetch:async(input,init)=>{if(String(input).endsWith('/users'))return Response.json({msg:'secret-provider-details'},{status});const b=JSON.parse(String(init?.body));actions.push(b.p_action);return Response.json({id:actor})}});await assert.rejects(()=>gateway.activate(token,'synthetic@example.test','Synthetic-only-password!'),error=>error instanceof Error&&!error.message.includes('secret-provider-details'));assert.deepEqual(actions,status===400?['begin','failed']:['begin'])}
})
test('invitation token is random, stored only as a hash and exposed once to the owner; review exposes no service key',async()=>{
 let args:any;const gateway=new SupabaseBeta({url:'https://auth.fixture',serviceKey:'synthetic-secret',fetch:async(_input,init)=>{args=JSON.parse(String(init?.body));return Response.json({id:actor,slot:1})}})
 const result=await gateway.admin(actor,'create') as any;assert.match(result.token,/^[\w-]{43}$/);assert.match(args.p_args.hash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(args).includes(result.token),false);assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);await assert.rejects(()=>gateway.admin(actor,'bootstrap'),/Unknown/)
})
test('feedback captures only coarse diagnostics, rejecting obvious credentials and URLs',()=>{
 const safe=feedbackInput({message:'The layout overflows on my phone.',category:'layout',page:'/trip/real-private-id?token=x',device:'phone',version:'forged',passport:'private',access_token:'private'})
 assert.equal(safe.page,'/other');assert.equal(safe.version,'0.1.0-beta.1');assert.equal('passport'in safe,false);assert.equal('access_token'in safe,false)
 for(const message of ['password: Synthetic-only-password!','passport=private','See https://private.example/trip','api_key: synthetic','booking reference: private'])assert.throws(()=>feedbackInput({message}),/without/)
})
