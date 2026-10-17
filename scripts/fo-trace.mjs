// Prints what real Fo responses looked like (structure + short previews) and
// each live action's progress, from the live server's data file. Never prints tokens.
//   node scripts/fo-trace.mjs [path-to-data-file]
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? '.data/server-live.json'
const data = JSON.parse(readFileSync(file, 'utf8'))
for (const [user, entries] of Object.entries(data.foTrace ?? {})) {
  console.log(`\n=== Fo responses for session ${user.slice(0, 6)}…`)
  for (const e of entries) {
    console.log(`\n[${new Date(e.at).toISOString()}] ${e.tool} ${e.ok ? 'ok' : 'ERROR'}${e.isError ? ' (isError)' : ''}`)
    if (e.error) console.log('  error:', e.error)
    if (e.contentTypes) console.log('  content:', e.contentTypes.join(', '))
    if (e.structured) console.log('  structuredContent shape:', JSON.stringify(e.structured))
    if (e.textShape) console.log('  text JSON shape:', JSON.stringify(e.textShape))
    if (e.textPreview) console.log('  text preview:', e.textPreview.replace(/\n/g, '⏎ ').slice(0, 400))
  }
}
for (const a of Object.values(data.actions ?? {})) {
  console.log(`\n=== action ${a.id} → ${a.draft.to} · ${a.status}${a.result ? ` · ${a.result.outcome}` : ''}${a.error ? ` · ${a.error}` : ''}`)
  for (const p of a.progress) console.log(`  ${new Date(p.at).toISOString()}  ${p.text}`)
  if (a.result) for (const ev of a.result.evidence) console.log(`  evidence: ${ev.kind} ${ev.detail.slice(0, 120)}`)
}
