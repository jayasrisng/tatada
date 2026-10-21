// Offline owner bootstrap. Run privately; no password or bearer link is logged.
import {createInterface} from 'node:readline'
import {Writable} from 'node:stream'
import {randomBytes,createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Use your own private, non-recorded terminal.')
let hidden=false
const output=new Writable({write(chunk,_encoding,done){if(!hidden)process.stdout.write(chunk);done()}})
const rl=createInterface({input:process.stdin,output,terminal:true,historySize:0})
const ask=prompt=>new Promise(resolve=>{hidden=false;rl.question(prompt,value=>{hidden=false;process.stdout.write('\n');resolve(value)});hidden=true})
try{
 const key=await ask('Existing Supabase server-only key (hidden): ')
 const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex')
 const client=createClient('https://utmbjcgttsjvdpghiqkf.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await client.rpc('tatada_beta',{p_action:'bootstrap',p_actor:null,p_args:{hash}})
 if(error||data?.error)throw Error('Owner setup is unavailable. Check migrations or an existing owner/pending setup.')
 const app=process.argv.includes('--local')?'http://127.0.0.1:5179/':'https://jayasrisng.com/tatada/'
 const copied=spawnSync('/usr/bin/pbcopy',[],{input:`${app}#/invite/${token}`})
 if(copied.status!==0)throw Error('Clipboard access failed. The pending setup expires in 30 minutes; do not log its token.')
 console.log('Owner setup link copied to your clipboard. Paste it into your own browser within 30 minutes and choose your password. The link works once. Do not share it. After use, replace your clipboard contents.')
}catch{console.error('Owner setup did not complete. No credentials or links were logged. Check the migration and owner state.');process.exitCode=1}finally{rl.close()}
