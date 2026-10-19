// Fixture-only checks: no provider messages, mail, print jobs or owner data.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { seed, WARDROBE } from '../src/data/seed.ts'
import { withPresentation } from '../src/data/presentation.ts'
const browser = await chromium.launch({channel:'chrome',headless:true})
const base = process.env.BASE ?? 'http://127.0.0.1:5180'
mkdirSync('scripts/out/policies',{recursive:true})
try {
 const page = await browser.newPage({viewport:{width:390,height:844}}), errors=[]
 const state=withPresentation(seed(),WARDROBE)
 page.on('pageerror',e=>errors.push(e.message))
 page.setDefaultTimeout(12000)
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/api/status'||path==='/api/session')return route.fulfill({json:{provider:'live',authenticated:true,owner:true,foConnected:true,account:{id:'policy-fixture',kind:'owner'}}})
  if(path==='/api/workspace')return route.fulfill({json:{state,version:1}})
  if(path==='/api/actions')return route.fulfill({json:{actions:[]}})
  return route.fulfill({status:503,json:{error:'Not connected in this fixture'}})
 })
 for(const theme of ['dark','light']) {
  await page.goto(base+'/#/');await page.locator('.arrival').waitFor({state:'hidden'})
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  const picker=page.getByLabel('Trip mode destination')
  await picker.waitFor();assert.equal(await page.locator('.trip-launch-choice>svg').count(),0)
  const styles=await picker.evaluate(el=>{const s=getComputedStyle(el),o=getComputedStyle(el.options[0]);return{arrow:s.backgroundImage,appearance:s.appearance,scheme:s.colorScheme,option:o.color,surface:o.backgroundColor,ink:getComputedStyle(document.documentElement).getPropertyValue('--chalk').trim()}})
  assert.match(styles.arrow,/data:image\/svg/);assert.equal(styles.appearance,'none');assert.equal(styles.scheme,theme)
  assert.equal(styles.option,theme==='dark'?'rgb(241, 237, 228)':'rgb(41, 46, 50)');assert.equal(styles.surface,theme==='dark'?'rgb(35, 37, 42)':'rgb(238, 233, 223)')
  await picker.selectOption('showcase-yosemite');assert.equal(await picker.inputValue(),'showcase-yosemite')
  await page.screenshot({path:`scripts/out/policies/menu-${theme}.png`})
  await page.goto(base+'/#/welcome');await page.getByRole('navigation',{name:'Policies'}).getByRole('link',{name:'Privacy',exact:true}).click()
  await page.getByRole('heading',{name:'Privacy',exact:true}).waitFor();await page.getByRole('heading',{name:'Your travel documents'}).waitFor()
  assert.ok(await page.getByText('This preview does not yet offer complete account deletion',{exact:false}).count())
  for(const [tab,heading] of [['Sources & credits','Maps and places'],['Terms & conditions','Plans and real actions']]){await page.getByRole('navigation',{name:'Policies'}).getByRole('link',{name:tab,exact:true}).click();await page.getByRole('heading',{name:heading}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
  await page.getByRole('button',{name:'Close policies'}).click();await page.getByRole('button',{name:'Close profile'}).click();assert.ok(page.url().endsWith('#/'))
 }
 await page.goto(base+'/#/');await page.locator('.arrival').waitFor({state:'hidden'})
 await page.getByRole('button',{name:'Ask Magic',exact:true}).click()
 await page.getByRole('tab',{name:'nearby & events',exact:true}).click()
 const footer=page.locator('.discover-foot');await footer.waitFor()
 assert.equal((await footer.innerText()).trim(),'© OpenStreetMap contributors · Sources')
 await footer.getByRole('link',{name:'Sources',exact:true}).click()
 await page.getByRole('heading',{name:'Maps and places'}).waitFor()
 assert.equal(await page.getByRole('dialog',{name:'Magic',exact:true}).count(),0)
 assert.deepEqual(errors,[])
 console.log('Passed: branded light/dark native menus, single arrow, working selection, profile policy navigation, readable mobile policies and explicit deletion limitation. No external actions.')
} finally {await browser.close()}
