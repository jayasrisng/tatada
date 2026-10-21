import {test,expect,type Page} from '@playwright/test'
import {PDFDocument} from 'pdf-lib'
import {readFile} from 'node:fs/promises'
/** Public sample UI only. No provider responses are mocked or claimed live. */
async function sample(page:Page){
 await page.goto('./')
 const enter=page.getByRole('button',{name:/^explore a sample trip/})
 await Promise.race([enter.waitFor({state:'visible'}),page.getByRole('button',{name:'Home',exact:true}).waitFor({state:'visible'})])
 if(await enter.isVisible())await enter.click()
 await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible()
}
async function reopen(page:Page){
 await page.reload()
 const enter=page.getByRole('button',{name:/^explore a sample trip/})
 await Promise.race([enter.waitFor({state:'visible'}),page.locator('main.app:not(.chromeless)').waitFor({state:'visible'})])
 if(await enter.isVisible())await enter.click()
}
async function route(page:Page,path:string){await page.evaluate(p=>{location.hash=p},path)}
test.beforeEach(async({page},testInfo)=>{
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
 await page.getByRole('button',{name:'create my trip',exact:true}).click();await expect(page.getByRole('heading',{name:'QA Disposable Kyoto',exact:true})).toBeVisible()
 const hash=await page.evaluate(()=>location.hash);await reopen(page);await expect(page.getByRole('heading',{name:'QA Disposable Kyoto',exact:true})).toBeVisible();expect(await page.evaluate(()=>location.hash)).toBe(hash)
})
test('tasks add, edit, complete and persist',async({page})=>{
 await route(page,'/tasks');const add=page.getByLabel('Add to prepare');await add.pressSequentially('QA disposable task');await add.press('Enter')
 await page.getByRole('button',{name:'Edit: QA disposable task',exact:true}).click();await page.getByLabel('Edit item',{exact:true}).fill('QA edited task');await page.getByLabel('Edit item',{exact:true}).press('Enter')
 await page.getByRole('checkbox',{name:'QA edited task',exact:true}).click();await page.getByRole('button',{name:/^show \d+ done$/}).click();await expect(page.locator('.crow.done').filter({hasText:'QA edited task'})).toBeVisible()
 await reopen(page);await page.getByRole('button',{name:/^show \d+ done$/}).click();await expect(page.locator('.crow.done').filter({hasText:'QA edited task'})).toBeVisible()
})
test('itinerary completion is editable and persists; Calendar file is a sample',async({page})=>{
 await route(page,'/trip/lisbon/itinerary');const stop=page.getByRole('checkbox',{name:/^Done:/}).first();await expect(stop).toBeVisible();const label=await stop.getAttribute('aria-label');await stop.check()
 await reopen(page);await expect(page.getByRole('checkbox',{name:label!,exact:true})).toBeChecked()
 await page.getByText('Calendar · Google, Apple & Outlook',{exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'download calendar file (.ics)',exact:true}).click();const d=await download;const text=await readFile((await d.path())!,'utf8');expect(text).toContain('BEGIN:VCALENDAR');expect(text).toContain('BEGIN:VEVENT');expect(text).toContain('[Sample]')
})
test('journal create, edit, reload and PDF preview preserve the content',async({page})=>{
 await route(page,'/trip/lisbon/journal');await page.getByLabel('Moment note').pressSequentially('QA synthetic journal memory');await page.getByRole('button',{name:'save moment',exact:true}).click()
 const moment=page.getByRole('article').filter({hasText:'QA synthetic journal memory'});await moment.getByRole('button',{name:'edit moment'}).click();await moment.getByPlaceholder('Write your memory here…').fill('QA edited journal memory');await moment.getByRole('button',{name:'save moment'}).click()
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
