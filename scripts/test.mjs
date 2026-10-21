import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const mode = process.argv[2]
if (mode && !['--unit', '--integration'].includes(mode)) throw new Error('Use --unit or --integration')
const run = (args, env = process.env) => spawnSync(process.execPath, args, { stdio: 'inherit', env }).status ?? 1
const files = (dir, suffix) => readdirSync(dir).filter(f => f.endsWith(suffix)).sort().map(f => join(dir, f))
let failed = 0
if (mode !== '--integration') {
 const output = mkdtempSync(join(tmpdir(), 'tatada-tests-'))
 try {
  const modules = ['assistant/context','travel/readiness','state/reducer','state/persistence','state/portability','style/looks','discovery/places','discovery/eventFormat','discovery/zone','travel/arrangements','travel/calendar','travel/next','travel/display','travel/history','travel/importer','print/plan','print/pdf','sharing/trip','privacy/vault','state/retry','state/login']
  failed = run([resolve('node_modules/typescript/bin/tsc'), ...modules.map(m=>`src/${m}.ts`), '--outDir',output,'--module','commonjs','--target','ES2022','--strict','--skipLibCheck','--esModuleInterop'])
  if (!failed) {
   writeFileSync(join(output,'package.json'),'{"type":"commonjs"}')
   failed = run(['--test',...files('tests','.test.mjs')],{...process.env,TATADA_TEST_BUILD:join(output,'src'),NODE_PATH:resolve('node_modules')})
  }
 } finally {rmSync(output,{recursive:true,force:true})}
}
if (mode !== '--unit') failed = run(['--test',...files('server/tests','.test.ts')]) || failed
process.exitCode = failed
