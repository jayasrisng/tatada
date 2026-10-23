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
