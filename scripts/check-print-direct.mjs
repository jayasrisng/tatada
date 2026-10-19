// Isolated print provider fixture. No email or physical print can happen here.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { seed, WARDROBE } from '../src/data/seed.ts'
import { withPresentation } from '../src/data/presentation.ts'
import { planPrint } from '../src/print/plan.ts'
const base=process.env.BASE??'http://127.0.0.1:5180'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext(), page=await context.newPage()
 const state=withPresentation(seed(),WARDROBE), printer={email:'fixture-desk@print.epsonconnect.com',plainPaper:'letter',colorInk:'yes',autoDuplex:'yes',bodyPrintingOff:'yes',senderApproved:'yes',directPrint:true,updatedAt:1}
 state.looks=[{id:'packing-fixture',tripId:'showcase-la',garmentIds:WARDROBE.slice(0,3).map(g=>g.id),verdict:'keep',at:1}]
 let creates=0, approvals=0, job, bytes;let blocked=false
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method()
  if(path==='/api/session'||path==='/api/status')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'print-test',kind:'owner'}}})
  if(path==='/api/workspace')return route.fulfill({json:{state,version:1}})
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  if(path==='/api/gmail/status')return route.fulfill({json:{configured:true,connected:true,email:'sender@example.test'}})
  if(path==='/api/print/printer')return route.fulfill({json:{printer}})
  if(path==='/api/print/sender')return route.fulfill({json:{delivery:'gmail',sender:{kind:'gmail',verified:true,label:'sender@example.test'}}})
  if(path==='/api/print/jobs'&&method==='GET')return route.fulfill({json:{jobs:job?[job]:[]}})
  if(path==='/api/print/jobs'&&method==='POST'){
   creates++;const body=request.postDataJSON();bytes=Buffer.from(body.pdf,'base64');job={id:'fixture-'+creates,createdAt:1,updatedAt:1,document:body.document,pdfHash:'fixture-hash',bytes:bytes.length,pageCount:1,request:body.request,choices:body.choices,plan:planPrint(body.request,printer,body.choices,1),printer:printer.email,address:printer.email,sender:{kind:'gmail',verified:true,label:'sender@example.test'},blocker:blocked?'Fixture attachment delivery unavailable':undefined,contentHash:'fixture-approval-hash',ref:'fixture',status:'awaiting_approval',attempts:0,events:[]};return route.fulfill({json:{job}})
  }
  if(path.endsWith('/pdf'))return route.fulfill({contentType:'application/pdf',body:bytes})
  if(path.endsWith('/approve')){approvals++;assert.equal(request.postDataJSON().contentHash,job.contentHash);job={...job,status:'submitted'};return route.fulfill({json:{job}})}
  return route.fulfill({status:503,json:{error:'Not connected in fixture'}})
 })
 await page.goto(base+'/#/trip/showcase-mexico-city')
 await page.getByRole('button',{name:'Print',exact:true}).click()
 await page.getByRole('button',{name:'Add ⭐ sticker',exact:true}).waitFor();assert.equal(creates,0);await page.locator('.print-final-actions').getByRole('button',{name:'Print',exact:true}).click()
 await page.getByText(/Sent to printer email/).waitFor()
 assert.equal(creates,1);assert.equal(approvals,1);assert.equal(await page.getByRole('form',{name:'Printer setup'}).count(),0)
 await page.reload();await page.locator('.print-screen').waitFor();await page.getByText(/Sent to printer email/).waitFor();assert.equal(creates,1);assert.equal(approvals,1)
 // A pasted URL cannot create a new automatic print intent.
 await page.goto(base+'/#/trip/showcase-mexico-city/print?run=forged-token');await page.locator('.print-screen').waitFor();assert.equal(creates,1);assert.equal(approvals,1)
 blocked=true;await page.goto(base+'/#/trip/showcase-paris');await page.getByRole('button',{name:'Print',exact:true}).click();await page.locator('.print-final-actions').getByRole('button',{name:'Print',exact:true}).click();await page.getByText(/Fixture attachment delivery unavailable/).waitFor();assert.equal(creates,2);assert.equal(approvals,1)
 blocked=false;await page.goto(base+'/#/style');await page.getByRole('group',{name:'Closet for'}).getByRole('button',{name:'LAX',exact:true}).click();await page.getByRole('tab',{name:'packing',exact:true}).click();await page.getByRole('button',{name:'print packing list',exact:true}).click();await page.locator('.print-final-actions').getByRole('button',{name:'Print',exact:true}).click();await page.getByText(/Sent to printer email/).waitFor()
 assert.equal(job.document.kind,'packing');assert.equal(creates,3);assert.equal(approvals,2)
 const {writeFileSync}=await import('node:fs');writeFileSync('scripts/out/packing-managed.pdf',bytes)
 console.log('Passed: saved printer skips setup, entry opens decoration; final Print prepares and submits once, reload/pasted URLs never reprint, and missing delivery capability blocks approval. No actual email sent.')
}finally{await browser.close()}
