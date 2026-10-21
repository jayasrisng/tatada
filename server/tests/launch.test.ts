import test from 'node:test'
import assert from 'node:assert/strict'
import {PDFDocument} from 'pdf-lib'
import {Store,type Data} from '../store.ts'
import {MockFoAdapter,type FoAdapter} from '../fo.ts'
import {FoChatService} from '../chat.ts'
import {PrintService,type PrintJob} from '../print.ts'
import {PrintFiles} from '../print-files.ts'
import {WajoPrintDelivery} from '../fo-print.ts'
import {createEdgeHandler,type EdgeRepository} from '../edge.ts'
const printer={email:'tatada-desk@print.epsonconnect.com',plainPaper:'letter',colorInk:'yes',autoDuplex:'yes',bodyPrintingOff:'yes',senderApproved:'yes'}
async function make(){const store=Store.memory();let sends=0,now=Date.now(),receiptValid=true
 const fo:FoAdapter=new MockFoAdapter(store);fo.ask=async(owner)=>{sends++;const job=Object.values(store.data.printJobs??{}).find(j=>(j as PrintJob).ownerId===owner) as PrintJob;return {status:'complete',conversationId:'remote-real-id',reply:'```json\n'+JSON.stringify({tatadaPrint:{jobId:job.id,pdfSha256:receiptValid?job.pdfHash:'wrong',recipient:job.address,status:'sent',senderEmail:'test@gmail.com',messageId:'1a15d1985fd301af'}})+'\n```'}}
 const chats=new FoChatService({store,fo,pollWaitSeconds:0}),files=new PrintFiles(store,'launch-test-'.repeat(4),'https://api.example.test',()=>now),delivery=new WajoPrintDelivery({store,fo,chats,files}),print=new PrintService({store,delivery});print.setPrinter('owner',printer)
 const pdf=await PDFDocument.create();pdf.addPage([612,792]);const bytes=Buffer.from(await pdf.save()),job=await print.prepare('owner',{pdf:bytes.toString('base64'),document:{kind:'card',title:'Demo'},request:{},choices:{}})
 return {store,chats,files,print,job,bytes,sends:()=>sends,expire:()=>{now+=31*60000},invalid:()=>{receiptValid=false}}
}
test('Wajo print is queued once, serves exactly the approved PDF, then reconciles a matching receipt',async()=>{const s=await make();const sent=await s.print.approve('owner',s.job.id,{contentHash:s.job.contentHash,idempotencyKey:'launch-approval-1'});assert.equal(sent.status,'send_uncertain');assert.equal(s.sends(),0)
 const job=s.store.data.printJobs![s.job.id] as PrintJob,link=new URL(s.files.link(job));assert.deepEqual(s.files.read(job.id,link.searchParams.get('expires'),link.searchParams.get('token')),s.bytes)
 assert.throws(()=>s.files.read(job.id,link.searchParams.get('expires'),'wrong'),/unavailable/)
 await s.print.approve('owner',job.id,{contentHash:job.contentHash,idempotencyKey:'launch-approval-1'});await s.chats.runDue();await s.print.runDue();assert.equal(s.sends(),1);assert.equal(s.print.get('owner',job.id).status,'submitted');assert.match(s.print.get('owner',job.id).deliveryRef!,/gmail:1a15/)
 s.expire();assert.throws(()=>s.files.read(job.id,link.searchParams.get('expires'),link.searchParams.get('token')),/expired/)
})
test('a nonmatching Wajo receipt never becomes a submitted print',async()=>{const s=await make();s.invalid();await s.print.approve('owner',s.job.id,{contentHash:s.job.contentHash,idempotencyKey:'launch-approval-2'});await s.chats.runDue();await s.print.runDue();assert.equal(s.print.get('owner',s.job.id).status,'send_uncertain');await s.print.approve('owner',s.job.id,{contentHash:s.job.contentHash,idempotencyKey:'launch-approval-3',resendAfterUncertain:true});await s.chats.runDue();assert.equal(s.sends(),1)})
class Repository implements EdgeRepository{state:Partial<Data>={};token?:string;read=async()=>structuredClone(this.state);async acquire(token:string){if(this.token)return {busy:true};this.token=token;return {state:structuredClone(this.state)}}async save(token:string,state:Data){assert.equal(token,this.token);this.state=structuredClone(state)}async release(token:string){assert.equal(token,this.token);this.token=undefined}}
test('one-use account recovery restores the same hosted workspace; keys are hashed and rotated',async()=>{
 const repository=new Repository(),tasks:Promise<unknown>[]=[],base='https://api.test/functions/v1/tatada-api',origin='https://jayasrisng.com',handle=createEdgeHandler({repository,appUrl:origin+'/tatada',publicUrl:base,secret:'launch-test-'.repeat(4),mode:'mock',waitUntil:t=>tasks.push(t)})
 const call=async(path:string,token?:string,body?:unknown)=>{const r=await handle(new Request(base+path,{method:body===undefined?'GET':'POST',headers:{origin,'x-tatada':'1','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));const data:any=await r.json();while(tasks.length)await tasks.shift();return {status:r.status,data}}
 const login=await call('/api/session',undefined,{}),token=login.data.sessionToken,owner=login.data.account.id
 const first=await call('/api/account/recovery-key',token,{}),second=await call('/api/account/recovery-key',token,{})
 assert.ok(second.data.key);assert.ok(!JSON.stringify(repository.state).includes(second.data.key));assert.equal((await call('/api/account/recovery-key',undefined,{})).status,401)
 await call('/api/auth/logout',token,{})
 assert.equal((await call('/api/auth/recover',undefined,{key:first.data.key})).status,401)
 const recovered=await call('/api/auth/recover',undefined,{key:second.data.key});assert.equal(recovered.status,200);assert.equal(recovered.data.account.id,owner);assert.ok(recovered.data.sessionToken)
 assert.equal((await call('/api/auth/recover',undefined,{key:second.data.key})).status,401)
})
test('signed PDF downloads use snapshots even while a provider worker holds the lease',async()=>{const s=await make();await s.print.approve('owner',s.job.id,{contentHash:s.job.contentHash,idempotencyKey:'launch-approval-4'});const job=s.store.data.printJobs![s.job.id] as PrintJob,link=new URL(s.files.link(job)),repository=new Repository();repository.state=structuredClone(s.store.data);repository.token='busy-provider';const handle=createEdgeHandler({repository,appUrl:'https://jayasrisng.com/tatada',publicUrl:'https://api.example.test',secret:'launch-test-'.repeat(4),mode:'mock'});const response=await handle(new Request(link));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),s.bytes);assert.match(response.headers.get('cache-control')! ,/no-store/)})
