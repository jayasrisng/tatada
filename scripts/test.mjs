import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Compile the pure application modules with the project's existing TypeScript;
// no browser, test framework, or extra dependency is needed.
const output = mkdtempSync(join(tmpdir(), 'tatada-tests-'))
try {
  const compiled = spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'),
    'src/state/reducer.ts', 'src/state/persistence.ts', 'src/state/portability.ts', 'src/style/looks.ts', 'src/discovery/places.ts', 'src/discovery/eventFormat.ts', 'src/discovery/zone.ts', 'src/travel/history.ts', '--outDir', output,
    '--module', 'commonjs', '--target', 'ES2022', '--strict', '--skipLibCheck', '--esModuleInterop'], { stdio: 'inherit' })
  if (compiled.status !== 0) process.exitCode = compiled.status ?? 1
  else {
    writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}')
    const tests = spawnSync(process.execPath, ['--test', 'tests/state.test.mjs', 'tests/trip.test.mjs', 'tests/decision.test.mjs', 'tests/portability.test.mjs', 'tests/style.test.mjs', 'tests/discovery-history.test.mjs', 'tests/discovery.test.mjs'], {
      stdio: 'inherit', env: { ...process.env, TATADA_TEST_BUILD: output, NODE_PATH: resolve('node_modules') },
    })
    // The server runs as TypeScript directly (Node type stripping).
    const server = spawnSync(process.execPath, ['--test', 'server/tests/*.test.ts'], { stdio: 'inherit' })
    process.exitCode = (tests.status ?? 1) || (server.status ?? 1)
  }
} finally { rmSync(output, { recursive: true, force: true }) }
