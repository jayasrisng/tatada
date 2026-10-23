import {test,expect} from '@playwright/test'
const deviceURL=process.env.TATADA_DEVICE_TEST_URL??'http://127.0.0.1:5202/'
test.skip(!!process.env.TATADA_E2E_URL&&!process.env.TATADA_DEVICE_TEST_URL,'Controlled device fixtures run only against the local candidate')
test.use({baseURL:deviceURL})
test('device workspace opens directly and retains preferences and printer without cloud workspace writes',async({page})=>{
 let cloudWrites=0,printerCalls=0,connected=false
 await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname
  if(path.endsWith('/workspace'))cloudWrites++
  if(path.includes('/print/printer'))printerCalls++
  if(path.endsWith('/auth/wajo/start')){const u=new URL(r.request().url());return r.fulfill({status:302,headers:{location:`${deviceURL}#/?auth_exchange=fixture&auth_attempt=${u.searchParams.get('attempt')}`}})}
  if(path.endsWith('/auth/exchange')){connected=true;return r.fulfill({json:{sessionToken:'fixture-device-session'}})}
  if(path.endsWith('/auth/logout')){connected=false;return r.fulfill({json:{authenticated:false}})}
  if(path.endsWith('/auth/config'))return r.fulfill({json:{mode:'legacy'}})
  if(path.endsWith('/session'))return r.fulfill({json:{provider:'live',authenticated:connected,foConnected:connected,...connected?{account:{id:'fixture-connection',kind:'connected'}}:{}}})
  return r.fulfill({json:{actions:[],chats:[],sender:{kind:'fo',ok:connected,verified:false,label:'Wajo'}}})
 })
 await page.goto('./');await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible()
 await expect(page.getByText(/invite.only/i)).toHaveCount(0)
 await page.evaluate(()=>location.hash='/welcome')
 await page.locator('[data-tour="wajo"]').click();await expect(page.getByRole('link',{name:'Connect Wajo',exact:true})).toBeVisible()
 await page.locator('[data-tour="printer"]').click();await page.getByLabel('Printer email address').fill('fixture@print.epsonconnect.com')
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved.')
 await page.locator('[data-tour="preferences"]').click();await page.getByLabel('Your name').fill('Device tester')
 await page.getByRole('button',{name:'next',exact:true}).click();await page.getByRole('button',{name:'next',exact:true}).click();await page.getByRole('button',{name:'save details',exact:true}).click()
 await expect(page.locator('.screen.welcome')).toHaveCount(0);await page.evaluate(()=>location.hash='/welcome');await page.locator('[data-tour="wajo"]').click();await page.getByRole('link',{name:'Connect Wajo',exact:true}).click();await expect(page.getByText('Connected',{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Hello, Device tester.'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Hello, Device tester.'})).toBeVisible();await page.locator('[data-tour="printer"]').click();await expect(page.getByLabel('Printer email address')).toHaveValue('fixture@print.epsonconnect.com')
 if(await page.locator('[data-tour="wajo"]').locator('..').getAttribute('open')===null)await page.locator('[data-tour="wajo"]').click();await page.getByRole('button',{name:'Disconnect',exact:true}).click();await expect(page.getByRole('heading',{name:'Hello, Device tester.'})).toBeVisible();
 expect(cloudWrites).toBe(0);expect(printerCalls).toBe(0)
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tatada:v1:device')!).trips.length)).toBe(0)
})

test('five-step setup resumes after Wajo and waits for each essential action',async({page})=>{
 let connected=false
 await page.route('**/api/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,ok=(json:unknown)=>r.fulfill({json})
  if(path.endsWith('/auth/wajo/start'))return r.fulfill({status:302,headers:{location:`${deviceURL}#/?auth_exchange=guide-fixture&auth_attempt=${url.searchParams.get('attempt')}`}})
  if(path.endsWith('/auth/exchange')){connected=true;return ok({sessionToken:'fixture-setup-session'})}
  if(path.endsWith('/session'))return ok({provider:'live',authenticated:connected,foConnected:connected,...connected?{account:{id:'guide-fixture',kind:'connected'}}:{}})
  return ok({actions:[],chats:[],mode:'legacy'})
 })
 await page.goto('./');await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();await page.evaluate(()=>location.hash='/welcome');await page.getByRole('button',{name:'Take a quick tour'}).click()
 const guide=page.getByRole('complementary',{name:'Star guide'})
 await expect(guide).toContainText('1 of 5');await expect(guide.getByRole('button',{name:'Done',exact:true})).toHaveCount(0)
 await page.getByRole('link',{name:'Connect Wajo',exact:true}).click();await expect(guide).toContainText('2 of 5');await page.reload();await expect(guide).toContainText('2 of 5')
 await page.getByLabel('Printer email address').fill('guide-fixture@print.epsonconnect.com');await expect(guide).toContainText('2 of 5');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(guide).toContainText('3 of 5')
 await page.locator('.tour-new-trip').click();await expect(guide).toContainText('3 of 5');await page.getByRole('button',{name:'edit details myself'}).click();await page.getByLabel('Build my itinerary from these details and my saved preferences').uncheck();await page.getByPlaceholder('Where are we going?').fill('First setup trip');await page.getByRole('button',{name:'create my trip',exact:true}).click()
 await expect(guide).toContainText('4 of 5');await page.getByRole('button',{name:'Enter trip mode',exact:true}).click();await expect(guide).toContainText('5 of 5');await expect(page.getByRole('button',{name:'My World',exact:true})).toBeVisible();await page.getByRole('button',{name:'My World',exact:true}).click();await expect(guide).toContainText('ready to explore')
 expect(await page.evaluate(()=>sessionStorage.getItem('tatada:v1:device:onboarding'))).toBeNull();await guide.getByRole('button',{name:'Done',exact:true}).click();await expect(guide).toHaveCount(0)
})

test('essential setup can be skipped without a trip or a connection',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{provider:'live',authenticated:false,foConnected:false,actions:[],chats:[]}}))
 await page.goto('./');await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();await page.evaluate(()=>location.hash='/tour');const guide=page.getByRole('complementary',{name:'Star guide'});await expect(guide).toContainText('1 of 5')
 for(const step of ['2 of 5','3 of 5','ready to explore']){await guide.getByRole('button',{name:'Skip step',exact:true}).click();await expect(guide).toContainText(step)}
 await guide.getByRole('button',{name:'Done',exact:true}).click();await page.reload();await expect(guide).toHaveCount(0)
})
