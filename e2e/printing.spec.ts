import {test,expect} from '@playwright/test'
import {seed} from '../src/data/seed'
test.use({baseURL:'http://127.0.0.1:5200/'})
test('controlled API: profile defaults persist; opening, previewing and reloading never approve; explicit double click submits once',async({page})=>{
 let approvals=0,prepared=0,pdf='',printer:any={email:'fixture-printer@print.epsonconnect.com',senderEmail:'fixture@example.test',printingConsent:true,plainPaper:'letter',colorInk:'yes',autoDuplex:'yes',bodyPrintingOff:'yes',senderApproved:'yes',updatedAt:1,defaults:{color:'grayscale',duplex:false,copies:2,size:'letter'}},jobs:any[]=[]
 const sender={kind:'gmail',verified:true,label:'fixture@example.test',ok:true}
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON(),respond=(data:any)=>route.fulfill({json:data})
  if(path==='/api/session')return respond({authenticated:true,provider:'live',foConnected:true,account:{id:'browser-fixture-account',kind:'connected'},printDelivery:'gmail'})
  if(path==='/api/workspace')return respond({state:seed,version:1,updatedAt:1})
  if(path==='/api/print/printer'){if(request.method()==='PUT')printer={...body,updatedAt:Date.now()};return respond({printer})}
  if(path==='/api/print/sender')return respond({delivery:'gmail',sender})
  if(path==='/api/gmail/status')return respond({configured:true,connected:true,email:'fixture@example.test'})
  if(path==='/api/print/jobs'&&request.method()==='POST'){prepared++;pdf=body.pdf;const j={id:`fixture-${prepared}`,status:'awaiting_approval',createdAt:Date.now(),updatedAt:Date.now(),document:body.document,request:body.request,choices:body.choices,plan:{repeat:body.request.copies,pageSize:'letter',lines:[],questions:[],limitations:[]},sender,address:printer.email,printer:printer.email,contentHash:`fixture-hash-${prepared}`,pdfHash:`fixture-pdf-${prepared}`,pageCount:body.request.copies,bytes:100,events:[],attempts:0};jobs.push(j);return respond({job:j})}
  if(path==='/api/print/jobs')return respond({jobs})
  if(path.endsWith('/pdf'))return route.fulfill({body:Buffer.from(pdf,'base64'),contentType:'application/pdf'})
  if(path.endsWith('/approve')){approvals++;const j=jobs.find(j=>path.includes(`/${j.id}/`));j.status='submitted';return respond({job:j})}
  if(path.startsWith('/api/fo/chats'))return respond({chats:[]})
  if(path.startsWith('/api/actions'))return respond({actions:[]})
  if(path.includes('/calendar/status'))return respond({configured:false,connected:false})
  return respond({})
 })
 await page.goto('./#/welcome?printing=1');await expect(page.getByLabel('Sending email address')).toHaveValue('fixture@example.test');await page.getByLabel('Default copies').fill('3');await page.getByRole('button',{name:'Save printing profile'}).click();await expect(page.getByRole('status').filter({hasText:'Printing profile saved'})).toBeVisible()
 await page.evaluate(()=>{location.hash='/trip/lisbon/print?panel=1'});const dialog=page.getByRole('dialog',{name:'Print settings'});await expect(dialog).toBeVisible();await expect(page.getByLabel('Print copies')).toHaveValue('3');await expect(page.getByLabel('Print color')).toHaveValue('grayscale');await expect(dialog.locator('input[type=email]')).toHaveCount(0);await expect.poll(()=>prepared).toBeGreaterThan(0);expect(approvals).toBe(0)
 await page.getByRole('button',{name:'Optional preview'}).click();await expect(page.getByTitle('Exact print PDF preview')).toBeVisible();expect(approvals).toBe(0)
 await page.reload();await expect(page.getByRole('button',{name:'Approve & Send'})).toBeEnabled();expect(approvals).toBe(0)
 await page.getByLabel('Print copies').fill('2');await expect(page.getByRole('button',{name:'Approve & Send'})).toBeEnabled();await page.getByRole('button',{name:'Approve & Send'}).click({clickCount:2});await expect(page.getByRole('status').filter({hasText:'Email submitted.'})).toBeVisible();expect(approvals).toBe(1)
 await page.reload();await expect(page.getByRole('button',{name:'Approve & Send'})).toBeEnabled();expect(approvals).toBe(1)
})
