// Rehearse the hosted shape: /tatada/ frontend + a separate API origin.
// Everything uses temporary mock data. Existing local servers are left alone.
import { preview } from 'vite'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const work = mkdtempSync(join(tmpdir(), 'tatada-predemo-'))
const front = 'http://localhost:15173'
const api = 'http://localhost:18787'
const children = new Set()
const start = (args, env = {}) => {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'inherit' })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}
const run = (args, env) => new Promise((resolve, reject) => {
  const child = start(args, env)
  child.once('error', reject)
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`)))
})
let site
try {
  await run(['node_modules/vite/bin/vite.js', 'build', '--base', '/tatada/', '--outDir', join(work, 'dist')], { VITE_API_URL: api })
  const server = start(['server/index.ts'], { NODE_ENV: 'development', PORT: '18787', APP_URL: `${front}/tatada`, PUBLIC_URL: api, TATADA_FO_MODE: 'mock', TATADA_SINGLE_OWNER: '0', TATADA_DATA_DIR: join(work, 'data') })
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    try { ready = (await fetch(`${api}/api/health`)).ok } catch {}
    if (ready || server.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error('Temporary mock API did not start')
  site = await preview({ base: '/tatada/', build: { outDir: join(work, 'dist') }, preview: { host: 'localhost', port: 15173, strictPort: true } })
  const env = { BASE: `${front}/tatada`, API_BASE: api }
  await run(['scripts/smoke.mjs'], env)
  await run(['scripts/themes.mjs'], env)
  await run(['scripts/presentation.mjs'], env)
  // The deployed asset paths must all remain beneath /tatada/.
  const html = await (await fetch(`${front}/tatada/`)).text()
  if (!html.includes('/tatada/assets/') || !html.includes('/tatada/favicon.svg')) throw new Error('Subpath assets are broken')
  console.log('Pre-demo passed: /tatada/, separate API origin, mock actions, reloads, both themes.')
} finally {
  if (site) await new Promise((resolve) => site.httpServer.close(resolve))
  for (const child of children) child.kill('SIGTERM')
  await Promise.all([...children].map((child) => new Promise((resolve) => child.once('exit', resolve))))
  rmSync(work, { recursive: true, force: true })
}
