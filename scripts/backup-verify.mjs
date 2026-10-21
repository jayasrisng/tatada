// Native PostgreSQL application-data restore verification. No Docker or production writes.
// Input is a private encrypted export prepared through the existing connected Supabase tools.
// The explicit zero-Auth/zero-Storage guard prevents overstating this narrow backup scope.
import{privateDecrypt,constants}from'node:crypto'
import{readFileSync,writeFileSync,mkdirSync,mkdtempSync,chmodSync}from'node:fs'
import{spawnSync}from'node:child_process'
import{join}from'node:path'
process.umask(0o077)
const here=process.argv[2],bin=process.env.TATADA_POSTGRES_BIN??'/private/tmp/tatada-postgres17/Postgres.app/Contents/Versions/17/bin';if(!here)throw Error('Supply the private encrypted-export directory. No cloud credentials are needed.');
const folder=mkdtempSync('/private/tmp/tatada-native-restore-'),socket=join(folder,'socket');mkdirSync(socket,{mode:0o700});chmodSync(here,0o700)
const bundle=JSON.parse(readFileSync(join(here,'source.encrypted.json'),'utf8')),key=readFileSync(join(here,'restore-key.pem'))
const raw=Buffer.concat(bundle.encrypted.map(hex=>privateDecrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(hex,'hex')))),source=JSON.parse(raw)
if(source.authUsers!==0||source.storageObjects!==0||source.appTables.length!==1||source.appTables[0].table!=='tatada_runtime')throw Error('Scope changed; stop.')
function run(name,args,input){const r=spawnSync(join(bin,name),args,{input,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error(`Native ${name} failed; private diagnostics withheld.`);return r.stdout}
const psql=(db,sql)=>run('psql',['-X','-qAt','-h',socket,'-p','56521','-d',db,'-v','ON_ERROR_STOP=1'],sql)
const qi=s=>'"'+s.replaceAll('"','""')+'"'
let started=false
try{
 run('initdb',['-D',join(folder,'data'),'--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'])
 run('pg_ctl',['-D',join(folder,'data'),'-l',join(folder,'server.log'),'-o',`-h '' -k ${socket} -p 56521 -c timezone=UTC`,'-w','start']);started=true
 psql('postgres',"create role anon;create role authenticated;create role service_role;create database source_restore;")
 const columns=source.columns.map(c=>`${qi(c.name)} ${c.type}${c.notNull?' not null':''}${c.default?` default ${c.default}`:''}`).join(',')
 let sql=`begin;set local check_function_bodies=off;create table public.tatada_runtime(${columns});\n`
 for(const c of source.constraints)sql+=`alter table public.tatada_runtime add constraint ${qi(c.name)} ${c.definition};\n`
 for(const row of source.runtimeRows)sql+=`insert into public.tatada_runtime select * from jsonb_populate_record(null::public.tatada_runtime,convert_from(decode('${Buffer.from(JSON.stringify(row)).toString('hex')}','hex'),'UTF8')::jsonb);\n`
 for(const fn of source.functions){if(!/^tatada_(acquire|save|release|auth_session_active)$/.test(fn.name))throw Error('Unexpected function; stop');sql+=fn.definition+';\n'}
 sql+='alter table public.tatada_runtime enable row level security;revoke all on public.tatada_runtime from public,anon,authenticated;grant select,insert,update on public.tatada_runtime to service_role;revoke all on all functions in schema public from public,anon,authenticated;grant execute on all functions in schema public to service_role;commit;'
 psql('source_restore',sql)
 const query="select json_build_object('rows',count(*),'stateChecksum',min(md5(state::text)),'rowChecksum',min(md5(to_jsonb(t)::text))) from public.tatada_runtime t;"
 const first=JSON.parse(psql('source_restore',query).trim());if(first.rows!==source.runtimeRows.length||first.stateChecksum!==source.runtimeChecksum||first.rowChecksum!==source.rowChecksum)throw Error('Source restore mismatch')
 run('pg_dump',['-h',socket,'-p','56521','-d','source_restore','--format=custom','--file',join(here,'verified-application.dump')])
 psql('postgres','create database independent_restore;')
 run('pg_restore',['-h',socket,'-p','56521','-d','independent_restore','--exit-on-error','--single-transaction',join(here,'verified-application.dump')])
 const restored=JSON.parse(psql('independent_restore',query).trim());if(JSON.stringify(restored)!==JSON.stringify(first))throw Error('Independent pg_restore mismatch')
 for(const role of ['anon','authenticated']){const r=spawnSync(join(bin,'psql'),['-X','-qAt','-h',socket,'-p','56521','-d','independent_restore','-v','ON_ERROR_STOP=1'],{input:`set role ${role};select state from public.tatada_runtime;`,encoding:'utf8'});if(r.status===0)throw Error('Restore lost row access protection')}
 const result={verifiedAt:new Date().toISOString(),source:source.project,scope:'All current Tatada application tables/rows and stored functions; actual source has zero Auth users and zero Storage objects. Supabase platform infrastructure/Auth service itself is NOT reconstructed.',postgres:run('postgres',['--version']).trim(),restored,rlsDenied:['anon','authenticated'],productionWrites:false}
 writeFileSync(join(here,'verified.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result))
}catch(error){console.error(error.message);console.error('Native application backup verification failed. No production writes were performed.');process.exitCode=1}finally{if(started)try{run('pg_ctl',['-D',join(folder,'data'),'-m','fast','-w','stop'])}catch{console.error('Stop the temporary native PostgreSQL process before continuing.')}}
