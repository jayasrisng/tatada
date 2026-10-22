import {test,expect,type Page} from '@playwright/test'
import {createHash} from 'node:crypto'
import {seed} from '../src/data/seed'
test.skip(!!process.env.TATADA_E2E_URL,'Controlled auth fixtures run only against the local candidate')
test.use({baseURL:'http://127.0.0.1:5200/'})
async function fixture(page:Page){
 let starts=0,exchanges=0,recoveries=0,expectedBinding='',workspace=seed(),version=1
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url()),path=url.pathname,body=request.postDataJSON(),ok=(data:unknown)=>route.fulfill({json:data}),authorized=request.headers().authorization==='Bearer fixture-browser-session'
  if(path==='/api/auth/wajo/start'){starts++;expectedBinding=url.searchParams.get('client_binding')??'';return route.fulfill({status:302,headers:{location:`http://127.0.0.1:5200/#/?auth_exchange=fixture-${starts}&auth_attempt=${url.searchParams.get('attempt')}`}})}
  if(path==='/api/auth/exchange'){exchanges++;if(body.code==='expired-fixture')return route.fulfill({status:401,json:{error:'Expired sign-in',code:'exchange_expired'}});if(createHash('sha256').update(body.binding??'').digest('hex')!==expectedBinding)return route.fulfill({status:401,json:{error:'Different browser',code:'exchange_browser_mismatch'}});return ok({sessionToken:'fixture-browser-session'})}
  if(path==='/api/session')return ok({provider:'live',authenticated:authorized,foConnected:false,...authorized?{account:{id:'fixture-account',kind:'connected'}}:{}})
  if(path==='/api/auth/recover'){recoveries++;if(body.key!==`tatada-recovery_${'a'.repeat(43)}`||recoveries>2)return route.fulfill({status:401,json:{error:'Recovery key invalid or already used.'}});return ok({sessionToken:'fixture-browser-session'})}
  if(path==='/api/workspace'){if(request.method()==='PUT'){workspace=body.state;version++}return ok({state:workspace,version})}
  if(path==='/api/print/printer')return ok({printer:null})
  if(path==='/api/print/sender')return ok({delivery:'gmail',sender:{kind:'gmail',ok:false,verified:false,label:'Not connected'}})
  if(path.startsWith('/api/actions'))return ok({actions:[]})
  if(path.startsWith('/api/fo/chats'))return ok({chats:[]})
  return ok({configured:false,connected:false})
 });return {exchanges:()=>exchanges,recoveries:()=>recoveries}
}
test('controlled OAuth: new login exchanges once, returning refresh keeps the session and saved tasks',async({page})=>{const state=await fixture(page);await page.goto('./');await page.getByRole('link',{name:'Continue with Wajo'}).click();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();expect(state.exchanges()).toBe(1);expect(page.url()).not.toContain('auth_exchange');await expect(page.locator('main.app')).not.toHaveAttribute('inert','');await page.evaluate(()=>{location.hash='/tasks'});const add=page.getByLabel('Add to prepare');await add.fill('Controlled account task');await add.press('Enter');await expect(page.getByRole('button',{name:'Edit: Controlled account task',exact:true})).toBeVisible();await expect.poll(async()=>page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('fixture-account')))).toBe(true);await page.reload();await expect(page.getByRole('button',{name:'Edit: Controlled account task',exact:true})).toBeVisible();expect(state.exchanges()).toBe(1)})
test('controlled OAuth: expired callback clears the code and offers a working fresh sign-in',async({page})=>{const state=await fixture(page);await page.goto('./#/welcome?auth_exchange=expired-fixture');await expect(page.getByRole('alert')).toContainText('sign-in expired');expect(page.url()).not.toContain('auth_exchange');await page.getByRole('link',{name:'Continue with Wajo'}).click();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();expect(state.exchanges()).toBe(2)})
test('controlled recovery: invalid key is rejected; a valid key restores the existing account across reload',async({page})=>{const state=await fixture(page);await page.goto('./#/welcome');await page.getByText('Recover an older workspace',{exact:true}).click();await page.getByText('Restore an existing workspace',{exact:true}).click();await page.getByLabel('Recovery key',{exact:true}).fill('invalid-fixture');await page.getByRole('button',{name:'Restore my workspace'}).click();await expect(page.getByRole('alert')).toContainText('invalid or already used');await page.getByLabel('Recovery key',{exact:true}).fill(`tatada-recovery_${'a'.repeat(43)}`);await page.getByRole('button',{name:'Restore my workspace'}).click();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();expect(state.recoveries()).toBe(2)})

test('controlled meal research carries route and diet and saves a choice across tabs',async({page})=>{
 await fixture(page)
 let research:any
 await page.route('**/api/intelligence',async route=>{research=route.request().postDataJSON();return route.fulfill({json:{searched:true,checkedAt:'2026-10-22T12:00:00Z',sections:[{text:JSON.stringify({meals:[{day:'2026-11-07',meal:'lunch',area:'Alfama',options:[{name:'Fixture Vegetarian Cafe',why:'Near your saved stop',food:'Chickpea stew',dietNote:'Confirm ingredients',address:'Fixture Street, Lisbon',url:'https://example.test/menu'}]}]}),sources:[{url:'https://example.test/menu',title:'Fixture menu'}]}]}})})
 await page.goto('./');await page.getByRole('link',{name:'Continue with Wajo'}).click();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible()
 await page.evaluate(()=>location.hash='/trip/lisbon/notebook');await page.getByRole('tab',{name:'Eat',exact:true}).click();await page.getByText('Find meals',{exact:true}).click()
 await page.getByRole('button',{name:'Find options',exact:true}).click();await expect(page.getByText('Fixture Vegetarian Cafe',{exact:true})).toBeVisible()
 expect(research.context).toContain('Horta');expect(JSON.parse(research.context).diet.length).toBeGreaterThan(0)
 await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();await expect(page.getByRole('button',{name:'Add to itinerary',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Itinerary',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Done: Lunch at Fixture Vegetarian Cafe',exact:true})).toBeVisible()
})
