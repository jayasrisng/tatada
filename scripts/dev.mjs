// One explicit live local runtime. Personal API keys never leave the backend.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
if (existsSync('.env')) process.loadEnvFile('.env')
const env = process.env
const perUserLogin=env.TATADA_WAJO_LOGIN==='1'
if (!perUserLogin&&!env.WAJO_FO_API_KEY) { console.error('Add WAJO_FO_API_KEY to your private .env to run live Tatada. No mock connection was started.'); process.exit(1) }
const appPort = Number(env.TATADA_DEV_PORT ?? 5173)
const backendPort = await new Promise((resolve, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)) }) })
const appURL = `http://127.0.0.1:${appPort}`
const common = { ...env, APP_URL: appURL, PUBLIC_URL: `http://127.0.0.1:${backendPort}`, PORT: String(backendPort), TATADA_BIND_HOST:'127.0.0.1', TATADA_FO_MODE: 'live', TATADA_SINGLE_OWNER: perUserLogin?'0':'1', TATADA_BACKEND_PORT: String(backendPort), VITE_DEVICE_WORKSPACE: perUserLogin?'true':(env.VITE_DEVICE_WORKSPACE??'false'), VITE_ENABLE_BACKEND: 'true', VITE_API_URL: '', VITE_API_TRANSPORT: env.TATADA_BEARER_SESSIONS==='1'?'bearer':'cookie', VITE_BASE_PATH: '/' }
if(env.TATADA_PREVIEW_BUILD==='1'){const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:common});if(build.status!==0)process.exit(build.status??1)}
const frontendArgs=env.TATADA_PREVIEW_BUILD==='1'?['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(appPort),'--strictPort']:['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(appPort),'--strictPort']
const children = [spawn(process.execPath, ['server/index.ts'], { stdio: 'inherit', env: common }), spawn(process.execPath, frontendArgs, { stdio: 'inherit', env: common })]
let ending = false
const stop = (code = 0) => { if (ending) return; ending = true; children.forEach((c) => c.kill('SIGTERM')); process.exitCode = code }
children.forEach((c) => { c.once('error', () => stop(1)); c.once('exit', (code) => stop(code ?? 0)) })
process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop())
console.log(`[tatada] live local workspace at ${appURL}; personal backend bound to loopback only`)
