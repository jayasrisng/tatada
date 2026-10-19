// Explicit local-owner rehearsal setup. Retains a private rollback copy and uses optimistic concurrency.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WARDROBE } from '../src/data/seed.ts'
import { withPresentation } from '../src/data/presentation.ts'
const base = new URL(process.env.BASE ?? 'http://127.0.0.1:5180')
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('Presentation setup is restricted to the local owner runtime.')
if (!process.argv.includes('--apply')) throw new Error('Pass --apply to populate the local presentation account.')
const session = await (await fetch(new URL('/api/status', base))).json()
if (!session.owner || !session.authenticated || session.provider !== 'live') throw new Error('The live local-owner runtime is required.')
const response = await fetch(new URL('/api/workspace', base))
if (!response.ok) throw new Error('Could not read the current workspace.')
const current = await response.json()
if (!current.state) throw new Error('No existing account found; do not silently replace a new account.')
const folder = resolve('.data/presentation-backups'); mkdirSync(folder, {recursive: true, mode: 0o700})
const backup = resolve(folder, `before-${Date.now()}.json`)
writeFileSync(backup, JSON.stringify(current), {mode: 0o600, flag: 'wx'})
const state = withPresentation(current.state, WARDROBE)
const saved = await fetch(new URL('/api/workspace', base), {method:'PUT', headers:{'content-type':'application/json', 'x-tatada':'1', origin:base.origin}, body:JSON.stringify({baseVersion:current.version, state})})
if (!saved.ok) throw new Error(`Workspace not changed: HTTP ${saved.status}. Backup retained.`)
console.log(JSON.stringify({saved:true, backup, upcoming:state.trips.filter(t=>t.presentation && t.status!=='past').map(t=>t.destination), past:state.trips.filter(t=>t.presentation && t.status==='past').map(t=>t.destination)}))
