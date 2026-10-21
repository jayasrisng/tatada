import {test,expect,type Page} from '@playwright/test'
import {seed} from '../src/data/seed'
test.skip(!!process.env.TATADA_E2E_URL,'Controlled identity fixtures are local only')
test.use({baseURL:'http://127.0.0.1:5200/'})
// Synthetic tokens, OTPs and factors: no real email, authenticator or provider action.
async function fixture(page:Page){
 let elevated=false,locked=false,enrolled=false,revoked=false,workspace=seed(),version=1
 const id='11111111-1111-4111-8111-111111111111',factor='22222222-2222-4222-8222-222222222222'
 const user=()=>({id,email:'disposable@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z',email_confirmed_at:'2026-01-01T00:00:00Z',factors:enrolled?[{id:factor,factor_type:'totp',status:'verified',friendly_name:'Fixture'}]:[]})
 const token=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,session_id:factor,aal:elevated?'aal2':'aal1',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),amr:[]})).toString('base64url'),Buffer.from('synthetic-fixture-signature').toString('base64url')].join('.')
 const session=()=>({access_token:token(),refresh_token:'synthetic-fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user()})
 await page.route('https://auth.fixture/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON(),ok=(json:unknown)=>route.fulfill({json})
  if(path.endsWith('/otp'))return ok({})
  if(path.endsWith('/verify')&&!path.includes('/factors/')){if(body.token!=='123456')return route.fulfill({status:400,json:{msg:'Invalid synthetic OTP'}});revoked=false;return ok(session())}
  if(path.endsWith('/user'))return ok(user())
  if(path.endsWith('/factors'))return ok({id:factor,type:'totp',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="40">Fixture only</text></svg>',secret:'SYNTHETICFIXTURE'}})
  if(path.endsWith('/challenge'))return ok({id:'fixture-challenge',type:'totp',expires_at:Math.floor(Date.now()/1000)+300})
  if(path.includes('/factors/')&&path.endsWith('/verify')){if(body.code!=='654321')return route.fulfill({status:400,json:{msg:'Invalid synthetic authenticator'}});enrolled=true;elevated=true;locked=false;return ok(session())}
  if(path.endsWith('/logout'))return route.fulfill({status:204})
  return route.fulfill({status:400,json:{msg:'Unsupported synthetic auth route'}})
 })
 await page.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname,body=r.postDataJSON(),authorized=!!r.headers().authorization&&!revoked,ok=(json:unknown)=>route.fulfill({json})
  if(path==='/api/auth/config')return ok({mode:'supabase',url:'https://auth.fixture',publicKey:'synthetic-public-key'})
  if(path==='/api/session')return ok({authMethod:'supabase',provider:'live',authenticated:authorized,foConnected:false,...authorized?{account:{id:'email-fixture-owner',kind:'connected'}}:{}})
  if(path==='/api/security/status')return ok({hasTotp:enrolled,unlocked:elevated&&!locked,expiresAt:Date.now()+300000})
  if(path==='/api/security/lock'){locked=true;return ok({unlocked:false})}
  if(path==='/api/auth/logout'){revoked=true;return ok({authenticated:false})}
  if(path==='/api/workspace'){if(r.method()==='PUT'){const prior=workspace.profile;workspace=body.state;if(!elevated||locked)workspace.profile=prior;version++}return ok({version,state:elevated&&!locked?workspace:{...workspace,profile:{name:'',homeAirport:'',style:[],diet:[],memberships:[]}}})}
  if(path==='/api/print/printer')return ok({printer:null})
  if(path==='/api/print/sender')return ok({delivery:'gmail',sender:{kind:'gmail',ok:false,verified:false,label:'Not connected'}})
  if(path.startsWith('/api/actions'))return ok({actions:[]})
  if(path.startsWith('/api/fo/chats'))return ok({chats:[]})
  return ok({configured:false,connected:false})
 })
 return {locked:()=>locked}
}
async function signIn(page:Page){await page.goto('./');await page.getByLabel('Email',{exact:true}).fill('disposable@example.test');await page.getByRole('button',{name:'Email me a code'}).click();await page.getByLabel('One-time code',{exact:true}).fill('000000');await page.getByRole('button',{name:'Verify & sign in'}).click();await expect(page.getByRole('status')).toContainText('invalid or expired');await page.getByLabel('One-time code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify & sign in'}).click();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();await expect(page.locator('main.app')).not.toHaveAttribute('inert','')}
test('email OTP rejects an invalid code and restores the same workspace after refresh',async({page})=>{await fixture(page);await signIn(page);await page.reload();await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible();await page.evaluate(()=>{location.hash='/tasks'});await expect(page.getByLabel('Add to prepare')).toBeVisible()})
test('TOTP protects profile, rejects bad factors, hydrates private details, and relocks explicitly',async({page})=>{const state=await fixture(page);await signIn(page);await page.evaluate(()=>{location.hash='/welcome'});await expect(page.getByRole('heading',{name:'Unlock sensitive access'})).toBeVisible();await expect(page.getByRole('button',{name:'edit my details'})).toHaveCount(0);await page.getByRole('button',{name:'Set up authenticator'}).click();await expect(page.getByAltText('Authenticator enrollment QR code')).toBeVisible();await page.getByLabel('Authenticator code',{exact:true}).fill('000000');await page.getByRole('button',{name:'Verify authenticator'}).click();await expect(page.getByRole('status')).toContainText('invalid or expired');await page.getByLabel('Authenticator code',{exact:true}).fill('654321');await page.getByRole('button',{name:'Verify authenticator'}).click();await expect(page.getByRole('button',{name:'edit my details'})).toBeVisible();await expect(page.getByRole('heading',{name:/Your space,/})).toBeVisible();await expect(page.getByText('Wajo did not provide a stable account ID.')).toHaveCount(0);await page.getByRole('button',{name:'Lock sensitive access'}).click();await expect(page.getByRole('heading',{name:'Unlock sensitive access'})).toBeVisible();await expect.poll(state.locked).toBe(true);await expect(page.getByRole('button',{name:'edit my details'})).toHaveCount(0)})
test('email sign-out remains usable before MFA and clears the device session',async({page})=>{await fixture(page);await signIn(page);await page.evaluate(()=>{location.hash='/welcome'});await expect(page.getByRole('heading',{name:'Unlock sensitive access'})).toBeVisible();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByLabel('Email',{exact:true})).toBeVisible();await page.reload();await expect(page.getByLabel('Email',{exact:true})).toBeVisible()})
