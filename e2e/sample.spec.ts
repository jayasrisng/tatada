import {test,expect,type Page} from '@playwright/test'
import {PDFDocument} from 'pdf-lib'
import {readFile} from 'node:fs/promises'
/** Public sample UI only. No provider responses are mocked or claimed live. */
async function sample(page:Page){
 await page.goto('./')
 const enter=page.getByRole('button',{name:/^explore a sample trip/})
 await Promise.race([enter.waitFor({state:'visible'}),page.getByRole('button',{name:'Home',exact:true}).waitFor({state:'visible'})])
 if(await enter.isVisible())await enter.click()
 await expect(page.locator('main.app')).not.toHaveAttribute('inert','')
 await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible()
}
async function reopen(page:Page){
 await page.reload()
 const enter=page.getByRole('button',{name:/^explore a sample trip/})
 await Promise.race([enter.waitFor({state:'visible'}),page.locator('main.app:not(.chromeless)').waitFor({state:'visible'})])
 if(await enter.isVisible())await enter.click()
 await expect(page.locator('main.app')).not.toHaveAttribute('inert','')
}
async function route(page:Page,path:string){await page.evaluate(p=>{location.hash=p},path)}
test.beforeEach(async({page},testInfo)=>{
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}))
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(['warning','error'].includes(m.type()))console.log(`[browser ${testInfo.project.name}] ${m.type()}: ${m.text().replace(/([?&](?:code|state|token|binding)[^=]*=)[^&#\s]+/gi,'$1[redacted]')}`)})
 ;(page as Page&{auditErrors:string[]}).auditErrors=errors
 await sample(page)
 // Fresh contexts; tests remain inside sample browser storage and never approve sends.
 testInfo.annotations.push({type:'coverage',description:'sample UI; no live provider claims'})
})
test.afterEach(async({page})=>{expect((page as Page&{auditErrors:string[]}).auditErrors).toEqual([])})
test('map, navigation, Magic, themes and narrow layout',async({page})=>{
 await expect(page.locator('svg.world-map')).toBeVisible()
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom out',exact:true}).click();await page.getByRole('button',{name:'Reset world map'}).click()
 await page.getByRole('button',{name:/Switch to whiteboard/}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light')
 for(const name of ['Trips','Tasks','Closet','Home']){await page.getByRole('button',{name:name==='Tasks'?/^Tasks/:name,exact:name!=='Tasks'}).click();await expect(page.locator('main.app')).toBeVisible()}
 await page.getByRole('button',{name:'Ask Magic'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close Magic'}).click()
 await reopen(page);await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})
test('create a disposable trip and preserve it across refresh',async({page})=>{
 await route(page,'/new');await page.getByRole('button',{name:'edit details myself'}).click()
 await page.getByLabel('Build my itinerary from these details and my saved preferences').uncheck()
 await page.getByPlaceholder('Where are we going?').fill('QA Disposable Kyoto')
 const start=new Date(Date.now()+30*86400000).toISOString().slice(0,10),end=new Date(Date.now()+34*86400000).toISOString().slice(0,10)
 await page.getByLabel('Leave',{exact:true}).fill(start);await page.getByLabel('Return',{exact:true}).fill(end)
 await page.getByRole('button',{name:'create my trip',exact:true}).click();await expect(page.getByText('QA Disposable Kyoto',{exact:true})).toBeVisible()
 const hash=await page.evaluate(()=>location.hash);await reopen(page);await expect(page.getByText('QA Disposable Kyoto',{exact:true})).toBeVisible();expect(await page.evaluate(()=>location.hash)).toBe(hash)
})
test('tasks add, edit, complete and persist',async({page})=>{
 await route(page,'/tasks');const add=page.getByLabel('Add to prepare');await add.fill('QA disposable task');await add.press('Enter')
 await page.getByRole('button',{name:'Edit: QA disposable task',exact:true}).click();await page.getByLabel('Edit item',{exact:true}).fill('QA edited task');await page.getByLabel('Edit item',{exact:true}).press('Enter')
 await page.getByRole('checkbox',{name:'QA edited task',exact:true}).click();await page.getByRole('button',{name:/^show \d+ done$/}).click();await expect(page.locator('.crow.done').filter({hasText:'QA edited task'})).toBeVisible()
 await reopen(page);await page.getByRole('button',{name:/^show \d+ done$/}).click();await expect(page.locator('.crow.done').filter({hasText:'QA edited task'})).toBeVisible()
})
test('itinerary completion is editable and persists; Calendar file is a sample',async({page})=>{
 await route(page,'/trip/lisbon/itinerary');const stop=page.getByRole('checkbox',{name:/^Done:/}).first();await expect(stop).toBeVisible();const label=await stop.getAttribute('aria-label');await stop.check()
 await reopen(page);await expect(page.getByRole('checkbox',{name:label!,exact:true})).toBeChecked()
 await route(page,'/trip/lisbon/plan');await page.getByRole('button',{name:'Calendar',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'download calendar file (.ics)',exact:true}).click();const d=await download;const text=await readFile((await d.path())!,'utf8');expect(text).toContain('BEGIN:VCALENDAR');expect(text).toContain('BEGIN:VEVENT');expect(text).toContain('[Sample]')
})
test('journal create, edit, reload and PDF preview preserve the content',async({page})=>{
 await route(page,'/trip/lisbon/journal');await page.getByLabel('Moment note').fill('QA synthetic journal memory');await page.getByRole('button',{name:'save moment',exact:true}).click()
 const moment=page.getByRole('article').filter({hasText:'QA synthetic journal memory'});await moment.getByRole('button',{name:'edit moment'}).click();const editor=page.getByRole('article').filter({has:page.getByPlaceholder('Write your memory here…')});await editor.getByPlaceholder('Write your memory here…').fill('QA edited journal memory');await editor.getByRole('button',{name:'save moment'}).click()
 await reopen(page);await expect(page.getByText('QA edited journal memory',{exact:true})).toBeVisible()
 // Direct preview route has no one-use send intent and never approves a job.
 await route(page,'/trip/lisbon/print/journal?preview=1');const link=page.getByRole('link',{name:'Download PDF',exact:true});await expect(link).toHaveAttribute('href',/^blob:/)
 const bytes=await link.evaluate(async a=>Array.from(new Uint8Array(await(await fetch((a as HTMLAnchorElement).href)).arrayBuffer())))
 const pdf=await PDFDocument.load(new Uint8Array(bytes));expect(pdf.getPageCount()).toBeGreaterThan(0);expect(pdf.getTitle()).toMatch(/journal/i)
})
test('unknown trip gives a recoverable state and history navigation works',async({page})=>{
 await route(page,'/trip/qa-nonexistent/print?preview=1');await expect(page.getByText('nothing to print here',{exact:true})).toBeVisible();await page.getByRole('button',{name:'pick a trip'}).click();await expect(page.getByRole('heading',{name:'Trips',exact:true})).toBeVisible()
 await page.goBack();await expect(page.getByText('nothing to print here',{exact:true})).toBeVisible();await page.goForward();await expect(page.getByRole('heading',{name:'Trips',exact:true})).toBeVisible()
})

test('primary trip actions and quiet secondary controls remain discoverable',async({page})=>{
 await page.getByRole('button',{name:'Trips',exact:true}).click();await page.locator('.tour-new-trip').click();await expect(page.getByLabel('Tell me about your trip')).toBeVisible()
 await route(page,'/trip/lisbon/plan');await expect(page.getByRole('region',{name:'Pending tasks'})).toBeVisible()
 await expect(page.getByRole('button',{name:'Overview',exact:true})).toHaveAttribute('aria-current','page')
 await expect(page.getByRole('button',{name:'Bookings',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Preview PDF',exact:true}).click();await expect(page.getByRole('link',{name:'Download PDF',exact:true})).toHaveAttribute('href',/^blob:/)
 await route(page,'/welcome');await expect(page.getByText('Payment methods',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Preferences',exact:true}).click();await expect(page.getByLabel('Your name')).toBeVisible()
})

test('optional lessons guide saved photos, vault uploads and reviewed exports',async({page})=>{
 await route(page,'/tour?lesson=photo')
 const tour=page.getByRole('complementary',{name:'Star guide'})
 await expect(page.locator('#star-tour-copy')).toContainText('journal photo')
 await page.locator('.moment-attach input').setInputFiles({name:'first-photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')})
 await page.getByRole('button',{name:'save moment',exact:true}).click();await expect(page.locator('#star-tour-copy')).toContainText('ready to explore')
 await tour.getByRole('button',{name:'Your vault',exact:true}).click()
 await page.getByLabel('Vault passphrase').fill('synthetic-tour-passphrase');await page.getByRole('button',{name:'create private vault',exact:true}).click()
 await expect(page.locator('#star-tour-copy')).toContainText('Choose a document')
 const pdf=await PDFDocument.create();pdf.addPage();await page.getByLabel('Upload vault document').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())})
 await page.getByRole('button',{name:'save encrypted',exact:true}).click();await expect(page.locator('#star-tour-copy')).toContainText('ready to explore')
 await tour.getByRole('button',{name:'Export / import',exact:true}).click()
 const download=page.waitForEvent('download');await page.locator('[data-tour="export-data"]').click();await download;await expect(page.locator('#star-tour-copy')).toContainText('Have a backup?')
 await tour.getByLabel('Guide topic').selectOption({label:'Export a trip'});await page.getByRole('button',{name:'Share trip',exact:true}).click();await page.getByRole('checkbox',{name:'I reviewed exactly what will be shared'}).check();await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));const share=page.waitForEvent('download');await page.getByRole('button',{name:'share trip file',exact:true}).click();await share;await expect(page.locator('#star-tour-copy')).toContainText('ready to explore')
 await tour.getByRole('button',{name:'Done',exact:true}).click();await expect(tour).toHaveCount(0)
})

test('trip mode has four destinations and one persistent exit',async({page})=>{
 await route(page,'/trip/lisbon/itinerary');await page.getByRole('button',{name:'Enter trip mode',exact:true}).click()
 const nav=page.getByRole('navigation',{name:'Trip navigation'})
 const header=page.getByRole('banner',{name:'Current trip'})
 const context=await header.innerText()
 await expect(nav.getByRole('button')).toHaveCount(4)
 await expect(page.getByRole('button',{name:'My World',exact:true})).toHaveCount(1)
 await expect(page.getByRole('button',{name:/Exit trip mode|leave trip mode|Trip menu/i})).toHaveCount(0)
 await expect(page.getByRole('navigation',{name:'Trip sections',exact:true})).toHaveCount(0)
 for(const name of ['Overview','Itinerary','Bookings','Journal']) {
   await nav.getByRole('button',{name,exact:true}).click()
   await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page')
   expect(await header.innerText()).toBe(context)
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
   const box=await header.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y).toBeLessThan(2)
 }
 await reopen(page);await expect(nav.getByRole('button',{name:'Journal',exact:true})).toHaveAttribute('aria-current','page')
 await page.getByRole('button',{name:'My World',exact:true}).click()
 await expect(header).toHaveCount(0);await expect(nav).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Trips',exact:true})).toBeVisible()
})

test('first-time setup offers a skippable introduction',async({page})=>{
 await route(page,'/welcome');await page.getByRole('button',{name:'reset demo data',exact:true}).click()
 await page.getByRole('button',{name:'Show me around',exact:true}).click();await expect(page.getByRole('complementary',{name:'Star guide'})).toBeVisible()
 await page.getByRole('button',{name:'Close tour',exact:true}).click();await expect(page.getByRole('button',{name:'Take a quick tour'})).toBeVisible()
})


test('overview stays concise and disclosures reset across tabs',async({page})=>{
 await expect(page.getByRole('button',{name:'Plan a trip',exact:true})).toHaveCount(0)
 await route(page,'/trip/lisbon/plan')
 await page.getByRole('button',{name:'Calendar',exact:true}).click()
 const calendar=page.getByRole('dialog',{name:'Calendar',exact:true})
 await expect(calendar).toBeVisible();await page.keyboard.press('Escape');await expect(calendar).toHaveCount(0)
 await page.getByRole('button',{name:'Itinerary',exact:true}).click();await expect(page.getByRole('group',{name:'Trip tools'})).toHaveCount(0)
 await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.locator('details.phase')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Before you get there',exact:true})).toHaveCount(1)
 await page.getByRole('button',{name:'Bookings',exact:true}).click()
 for(const name of ['Transportation','Stay','Experiences','Eat'])await expect(page.getByRole('tab',{name,exact:true})).toBeVisible()
 await page.getByRole('tab',{name:'Stay',exact:true}).click()
 const edit=page.locator('details.manage-arrangements');await edit.locator('summary').first().click();await expect(edit).toHaveAttribute('open','')
 await page.getByRole('tab',{name:'Eat',exact:true}).click();await expect(edit).not.toHaveAttribute('open','')
 await page.getByRole('tab',{name:'Stay',exact:true}).click();await expect(edit).not.toHaveAttribute('open','')
 await page.getByRole('tab',{name:'Experiences',exact:true}).click();await expect(page.getByRole('button',{name:'add activity',exact:true})).toBeVisible()
})


test('four trip tools open accessible popups without automatic actions',async({page})=>{
 await route(page,'/trip/lisbon/plan')
 const tools=page.getByRole('group',{name:'Trip tools'})
 await expect(tools.getByRole('button')).toHaveCount(4)
 for(const name of ['Keep this trip offline','Before you get there','Share trip','Calendar']) {
   const trigger=tools.getByRole('button',{name,exact:true});await trigger.click()
   const popup=page.getByRole('dialog',{name,exact:true});await expect(popup).toBeVisible()
   await expect(popup.getByRole('button',{name:'Close popup'})).toBeFocused()
   if(name==='Keep this trip offline')await expect(popup.getByRole('button',{name:'download trip',exact:true})).toBeVisible()
   if(name==='Share trip')await expect(popup.getByRole('checkbox',{name:'I reviewed exactly what will be shared'})).not.toBeChecked()
   if(name==='Calendar')await expect(popup.getByRole('button',{name:'download calendar file (.ics)'})).toBeVisible()
   await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(trigger).toBeFocused()
 }
 await tools.getByRole('button',{name:'Share trip',exact:true}).click()
 const share=page.getByRole('dialog',{name:'Share trip',exact:true})
 await share.getByRole('checkbox',{name:'Include written journal notes'}).check()
 await share.getByRole('button',{name:'Close popup'}).click()
 await tools.getByRole('button',{name:'Share trip',exact:true}).click()
 await expect(page.getByRole('checkbox',{name:'Include written journal notes'})).not.toBeChecked()
})

test('itinerary tools are four popups and saved meals appear in Eat',async({page})=>{
 await route(page,'/trip/lisbon/itinerary')
 const tools=page.getByRole('group',{name:'Itinerary tools'})
 await expect(tools.getByRole('button')).toHaveCount(4)
 for(const name of ['Talk','Plan','Pack','Details']){
  const trigger=tools.getByRole('button',{name,exact:true});await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(trigger).toBeFocused()
 }
 await page.getByRole('button',{name:'Bookings',exact:true}).click();await page.getByRole('tab',{name:'Eat',exact:true}).click()
 await expect(page.getByRole('region',{name:'Meals along your route'}).getByText('Saturday dinner at Horta da Graça',{exact:true})).toBeVisible()
 await page.getByText('Find meals',{exact:true}).click();await expect(page.getByLabel('Meal request')).toBeVisible()
 await page.getByRole('tab',{name:'Stay',exact:true}).click();await page.getByRole('tab',{name:'Eat',exact:true}).click();await expect(page.getByLabel('Meal request')).not.toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})

test('map location is opt-in and stops when leaving the screen',async({page})=>{
 await page.evaluate(()=>{(window as any).geoCalls=0;(window as any).geoClears=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(ok:any)=>{(window as any).geoCalls++;ok({coords:{latitude:38.72,longitude:-9.14,accuracy:25}});return 7},clearWatch:()=>{(window as any).geoClears++}}})})
 await route(page,'/trip/lisbon/plan');await expect(page.getByRole('button',{name:'Use my location',exact:true})).toBeEnabled()
 expect(await page.evaluate(()=>(window as any).geoCalls)).toBe(0)
 await page.getByRole('button',{name:'Use my location',exact:true}).click();await expect(page.getByText(/Accuracy ±25 m/)).toBeVisible()
 await page.getByRole('button',{name:'Itinerary',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).geoClears)).toBe(1)
 await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByRole('button',{name:'Use my location',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).geoCalls)).toBe(1)
})
