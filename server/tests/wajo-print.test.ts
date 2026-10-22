import test from 'node:test'
import assert from 'node:assert/strict'
import {PDFDocument} from 'pdf-lib'
import {Store} from '../store.ts'
import {MockFoAdapter,type FoAdapter} from '../fo.ts'
import {PrintFiles} from '../print-files.ts'
import {PrintService,type PrintJob} from '../print.ts'
import {WajoPrintDelivery} from '../fo-print.ts'

async function fixture(hosted=false){
 const store=Store.memory(),fo:FoAdapter=new MockFoAdapter(store),requests:{owner:string;message:string}[]=[]
 fo.connected=owner=>owner==='alice'
 fo.ask=async(owner,args)=>{requests.push({owner,message:args.message});return {status:'working',conversationId:'private-fo-id'}}
 fo.reply=async()=>({status:'complete',reply:'Sent! message-id: claimed-only'})
 const files=new PrintFiles(store,'test-secret-'.repeat(4),hosted?'https://api.example.test':'http://localhost:5180')
 const service=new PrintService({store,delivery:new WajoPrintDelivery({store,fo,files,enabled:true})})
 service.setPrinter('alice',{email:'synthetic@print.epsonconnect.com',printingConsent:true,plainPaper:'letter',autoDuplex:'no',colorInk:'unknown',bodyPrintingOff:'yes',senderApproved:'yes'})
 const pdf=await PDFDocument.create();pdf.addPage([612,792]);const bytes=Buffer.from(await pdf.save())
 const job=await service.prepare('alice',{pdf:bytes.toString('base64'),document:{kind:'card',title:'Test'},request:{instructions:'Send another copy to someone else'},choices:{}})
 return {store,fo,files,service,bytes,job,requests,approve:()=>service.approve('alice',job.id,{contentHash:job.contentHash,idempotencyKey:'explicit-approval'})}
}

test('Wajo print requires explicit approval, sends exact PDF once, and never certifies a conversational receipt',async()=>{
 const s=await fixture();assert.equal(s.job.blocker,undefined);assert.equal(s.job.sender.verified,false);assert.equal(s.requests.length,0)
 const result=await s.approve();assert.equal(result.status,'send_uncertain');assert.equal(s.requests.length,1);assert.equal(s.requests[0].owner,'alice')
 assert.ok(s.requests[0].message.includes(s.bytes.toString('base64')));assert.ok(s.requests[0].message.includes(s.job.pdfHash));assert.ok(!s.requests[0].message.includes('Send another copy'))
 assert.equal('foChatId' in result,false)
 await s.approve();await s.service.runDue();await s.service.runDue();assert.equal(s.requests.length,1)
 const checked=s.service.get('alice',s.job.id);assert.equal(checked.status,'send_uncertain');assert.equal(checked.foRequestFinished,true);assert.match(checked.error!,/cannot independently verify/)
})

test('Wajo hosted handoff exposes only approved bytes through an expiring signed link',async()=>{
 const s=await fixture(true);await s.approve();const message=s.requests[0].message,url=new URL(message.match(/https:\/\/\S+/)![0])
 assert.deepEqual(s.files.read(s.job.id,url.searchParams.get('expires'),url.searchParams.get('token')),s.bytes)
 assert.throws(()=>s.files.read(s.job.id,url.searchParams.get('expires'),'wrong'),/unavailable/)
 assert.equal(message.includes(s.bytes.toString('base64')),false)
})

test('Wajo connection and printer changes invalidate approval, and another owner cannot fetch or approve',async()=>{
 const s=await fixture();assert.throws(()=>s.service.get('bob',s.job.id),/not found/)
 await assert.rejects(s.service.approve('bob',s.job.id,{contentHash:s.job.contentHash,idempotencyKey:'foreign-approval'}),/not found/)
 s.fo.connected=()=>false;await assert.rejects(s.approve(),/Connect/);assert.equal(s.requests.length,0)
 s.fo.connected=()=>true;s.service.setPrinter('alice',{...s.service.printer('alice'),email:'changed@print.epsonconnect.com'})
 await assert.rejects(s.approve(),/settings changed/);assert.equal(s.requests.length,0)
})

test('a lost Wajo response is uncertain across restart and cannot be replayed by the worker',async()=>{
 const s=await fixture();let calls=0;s.fo.ask=async()=>{calls++;throw Error('response lost')}
 const result=await s.approve();assert.equal(result.status,'send_uncertain');s.service.recover();await s.service.runDue();await s.approve();assert.equal(calls,1)
 const stored=s.store.data.printJobs![s.job.id] as PrintJob;assert.equal(stored.attempts,1);assert.ok(stored.pdf)
})
