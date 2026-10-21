// Run yourself in a private terminal. No database values or credentials are logged.
// Requires Docker; creates only an isolated local Supabase stack, never a cloud resource.
import {createInterface} from 'node:readline'
import {Writable} from 'node:stream'
import {spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,chmodSync,rmSync} from 'node:fs'
import {resolve,join,relative} from 'node:path'
import {randomUUID} from 'node:crypto'
const ref='utmbjcgttsjvdpghiqkf',repository=resolve(import.meta.dirname,'..')
process.umask(0o077)
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Use your own private, non-recorded terminal.')
if(spawnSync('docker',['info'],{stdio:'ignore'}).status!==0)throw Error('Install/start Docker Desktop first. No cloud resources are needed.')
const destination=resolve(process.argv[2]??'')
if(!process.argv[2]||!relative(repository,destination).startsWith('..'))throw Error('Supply a private backup directory OUTSIDE the repository, ideally on an encrypted disk.')
mkdirSync(destination,{recursive:true,mode:0o700});chmodSync(destination,0o700)
const folder=mkdtempSync(join(destination,'tatada-')),work=join(folder,'work');mkdirSync(work,{mode:0o700})
let hidden=false
const output=new Writable({write(chunk,_encoding,done){if(!hidden)process.stdout.write(chunk);done()}})
const rl=createInterface({input:process.stdin,output,terminal:true,historySize:0})
const ask=prompt=>new Promise(resolve=>{hidden=false;rl.question(prompt,value=>{hidden=false;process.stdout.write('\n');resolve(value)});hidden=true})
let env,container,started=false
function command(binary,args,input){const r=spawnSync(binary,args,{cwd:work,env,input,encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error(`Failed ${binary} ${args.slice(0,2).join(' ')}. Details withheld to avoid credential disclosure. Backup is NOT verified.`);return r.stdout}
const cli=(...args)=>command('npx',['--yes','supabase@2.121.0',...args])
const localSql=sql=>command('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],sql)
let pat
async function source(sql){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{authorization:`Bearer ${pat}`,'content-type':'application/json'},body:JSON.stringify({query:sql,read_only:true}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Read-only source manifest failed; backup is NOT verified.');return r.json()}
const quote=x=>'"'+x.replaceAll('"','""')+'"'
const tableQuery="select schemaname,tablename from pg_tables where schemaname in('auth','storage','public','tatada_private') and not (schemaname='auth' and tablename='schema_migrations') and not (schemaname='storage' and tablename='migrations') order by schemaname,tablename"
async function manifest(){const tables=await source(tableQuery),result={};for(const t of tables){const name=`${quote(t.schemaname)}.${quote(t.tablename)}`,sql=`select count(*)::text n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) checksum from ${name} t`;result[name]={sql,...(await source(sql))[0]}}return result}
try{
 pat=await ask('Supabase personal access token (hidden; not a frontend key): ')
 const password=await ask('Existing database password (hidden): ')
 if(await ask('Existing encryption secret/service key and provider secrets retained privately? Type YES: ')!=='YES')throw Error('Retain the existing encryption/provider secrets before proceeding. Do not rotate them.')
 env={...process.env,SUPABASE_ACCESS_TOKEN:pat,SUPABASE_DB_PASSWORD:password}
 cli('init');cli('link','--project-ref',ref)
 const before=await manifest();const storage=Object.entries(before).find(([name])=>name==='"storage"."objects"')?.[1]
 if(storage&&storage.n!=='0')throw Error('Storage objects require a separate object-file backup. This database-only procedure cannot verify that backup.')
 cli('db','dump','--linked','--role-only','-f',join(folder,'roles.sql'))
 cli('db','dump','--linked','--schema','public,tatada_private','-f',join(folder,'schema.sql'))
 cli('db','dump','--linked','--data-only','--use-copy','--exclude','auth.schema_migrations,storage.migrations','-f',join(folder,'data.sql'))
 // Separate empty workdir: candidate migrations must NEVER influence this diff.
 const auth=cli('db','diff','--linked','--schema','auth,storage')
 if(/\b(?:drop|truncate)\s+(?:table|schema|function|trigger|extension|type)\b/i.test(auth))throw Error('Auth/schema diff contains removals. Stop for review; no restore or production changes were made.')
 writeFileSync(join(folder,'auth-custom.sql'),auth,{mode:0o600})
 const after=await manifest();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Production changed while exporting. Repeat during a quiet window; backup is NOT verified.')
 const project=`tatada_restore_${randomUUID().replaceAll('-','')}`;container=`supabase_db_${project}`
 const config=join(work,'supabase/config.toml');let text=readFileSync(config,'utf8').replace(/^project_id = .*$/m,`project_id = "${project}"`).replace(/543(\d\d)/g,'564$1').replace(/^major_version = \d+/m,'major_version = 17');writeFileSync(config,text)
 // Remove source link before starting the isolated local stack.
 rmSync(join(work,'supabase/.temp'),{recursive:true,force:true});env={...process.env};started=true
 cli('start','-x','studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor')
 const restore=filename=>{const sql=readFileSync(join(folder,filename),'utf8');if(sql.trim())localSql(`begin;set local session_replication_role=replica;\n${sql}\ncommit;`)}
 restore('roles.sql');restore('schema.sql');restore('auth-custom.sql');restore('data.sql')
 const checked={};for(const [name,expected]of Object.entries(before)){const actual=JSON.parse(localSql(`select row_to_json(x) from (${expected.sql}) x;`).trim());if(actual.n!==expected.n||actual.checksum!==expected.checksum)throw Error(`Restore mismatch in ${name}; backup is NOT verified.`);checked[name]={rows:actual.n,checksum:actual.checksum}}
 writeFileSync(join(folder,'verified.json'),JSON.stringify({verifiedAt:new Date().toISOString(),project:ref,scope:'Critical application/Auth/storage rows; platform migration ledgers excluded',tables:checked},null,2),{mode:0o600})
 console.log(`Independent local restore matched all ${Object.keys(checked).length} application/Auth/storage tables. Private backup: ${folder}. Keep the backup and existing encryption/provider secrets together in secure storage. This does not verify real login or authorize deployment by itself.`)
}catch(error){console.error(error.message);process.exitCode=1}finally{if(started){try{cli('stop','--no-backup')}catch{console.error('Local cleanup incomplete. Stop only the tatada_restore stack manually. Production was not restored or changed.')}}rl.close()}
