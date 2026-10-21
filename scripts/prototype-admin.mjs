// Owner-run Supabase Admin API. Secrets stay in process memory, never files/argv/logs.
import {createInterface} from 'node:readline'
import {Writable} from 'node:stream'
import {randomUUID,randomBytes} from 'node:crypto'
import {spawn,spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {createClient} from '@supabase/supabase-js'
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Use an interactive private terminal, without recording or shell redirection.')
let hidden=false
const output=new Writable({write(chunk,_encoding,callback){if(!hidden)process.stdout.write(chunk);callback()}})
const rl=createInterface({input:process.stdin,output,terminal:true,historySize:0})
const ask=(prompt,secret=false)=>new Promise(resolve=>{hidden=false;rl.question(prompt,value=>{hidden=false;if(secret)process.stdout.write('\n');resolve(value)});hidden=secret})
try{
 const mode=(await ask('Action (create / reset / revoke / preview): ')).trim()
 if(!['create','reset','revoke','preview'].includes(mode))throw Error('Unknown action.')
 const target=mode==='preview'?'':(await ask(mode==='create'?'Invited email: ':'Existing Supabase user UID: ')).trim()
 if(mode!=='preview'&&(mode==='create'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target):!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)))throw Error('Invalid email or UID.')
 const key=await ask('Tatada Supabase server-only secret/service-role key (hidden): ',true)
 const client=createClient('https://utmbjcgttsjvdpghiqkf.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
 let password
 if(mode==='create'||mode==='reset'){
  password=await ask('Unique temporary password generated in your password manager (hidden): ',true)
  const confirmation=await ask('Confirm temporary password (hidden): ',true)
  if(password.length<20||password!==confirmation)throw Error('Use a unique password of at least 20 characters and confirm it exactly.')
 }
 if(mode==='preview'){
  const publicKey=(await ask('Public anon/publishable key (never the server key): ')).trim()
  let role;try{role=JSON.parse(Buffer.from(publicKey.split('.')[1]??'','base64url').toString()).role}catch{}
  if(!publicKey||publicKey===key||publicKey.startsWith('sb_secret_')||role==='service_role')throw Error('Public key required.')
  rl.close()
  const frontendEnv={...process.env,VITE_ENABLE_BACKEND:'true',VITE_API_URL:'http://127.0.0.1:8789',VITE_API_TRANSPORT:'bearer',VITE_BASE_PATH:'/'}
  // The service credential is passed only to the backend child, in memory.
  delete frontendEnv.SUPABASE_SERVICE_ROLE_KEY
  const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir','.local/prototype-live-check/frontend'],{stdio:'inherit',env:frontendEnv})
  if(build.status!==0)throw Error('Preview build failed.')
  const serverEnv={...process.env,SUPABASE_URL:'https://utmbjcgttsjvdpghiqkf.supabase.co',SUPABASE_ANON_KEY:publicKey,SUPABASE_SERVICE_ROLE_KEY:key,TATADA_AUTH_MODE:'supabase',TATADA_SINGLE_OWNER:'0',TATADA_FO_MODE:'mock',TATADA_BEARER_SESSIONS:'1',TATADA_BIND_HOST:'127.0.0.1',TATADA_SECRET:randomBytes(48).toString('base64url'),TATADA_DATA_DIR:resolve('.local/prototype-live-check/data'),APP_URL:'http://127.0.0.1:5179',PUBLIC_URL:'http://127.0.0.1:8789',PORT:'8789',NODE_ENV:'development'}
  const children=[spawn(process.execPath,['server/index.ts'],{stdio:'inherit',env:serverEnv}),spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--outDir','.local/prototype-live-check/frontend','--host','127.0.0.1','--port','5179','--strictPort'],{stdio:'inherit',env:frontendEnv})]
  let ending=false
  const stop=()=>{if(ending)return;ending=true;for(const child of children)child.kill('SIGTERM')}
  process.once('SIGINT',stop);process.once('SIGTERM',stop)
  for(const child of children){child.once('error',()=>{process.exitCode=1;stop()});child.once('exit',code=>{if(code)process.exitCode=code;stop()})}
  console.log('Private verification preview: http://127.0.0.1:5179/ — local workspace data, real Supabase Auth. Stop with Ctrl+C.')
  await Promise.all(children.map(child=>new Promise(resolve=>child.once('close',resolve))))
 }else{
 let result
 if(mode==='create')result=await client.auth.admin.createUser({email:target,password,email_confirm:true,app_metadata:{tatada_prototype:true,tatada_password_reset:randomUUID()}})
 else{
  const existing=await client.auth.admin.getUserById(target)
  if(existing.error||!existing.data.user)throw Error('Account lookup failed. Check the project and UID in the Supabase dashboard.')
  const app_metadata={...existing.data.user.app_metadata,tatada_prototype:mode!=='revoke',...mode==='reset'?{tatada_password_reset:randomUUID()}:{} }
  result=await client.auth.admin.updateUserById(target,{app_metadata,...mode==='reset'?{password,email_confirm:true}:{}})
 }
 password=undefined
 if(result.error||!result.data.user)throw Error('Administrative operation failed. Check the invitation limit, migration and Auth configuration in Supabase. No credentials were logged.')
 console.log(`Completed ${mode}. Supabase UID: ${result.data.user.id}`)
 console.log(mode==='revoke'?'Application access revoked. Workspace data retained.':'Deliver the temporary password separately through a secure channel. First-login rotation is required.')
 }
}catch(error){console.error(error instanceof Error&&error.message.startsWith('Use a unique')?error.message:'Operation did not complete. Check your inputs and the Supabase dashboard; no credentials were logged.');process.exitCode=1}
finally{rl.close()}
