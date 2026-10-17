import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Compile the pure application modules with the project's existing TypeScript;
// no browser, test framework, or extra dependency is needed.
const output = mkdtempSync(join(tmpdir(), 'tatada-tests-'))
try {
  const compiled = spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'),
    'src/state/reducer.ts', 'src/state/persistence.ts', '--outDir', output,
    '--module', 'commonjs', '--target', 'ES2022', '--strict', '--skipLibCheck'], { stdio: 'inherit' })
  if (compiled.status !== 0) process.exitCode = compiled.status ?? 1
  else {
    writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}')
    const tests = spawnSync(process.execPath, ['--test', 'tests/state.test.mjs', 'tests/trip.test.mjs'], {
      stdio: 'inherit', env: { ...process.env, TATADA_TEST_BUILD: output },
    })
    // The server runs as TypeScript directly (Node type stripping).
    const server = spawnSync(process.execPath, ['--test', 'server/tests/*.test.ts'], { stdio: 'inherit' })
    process.exitCode = tests.status || server.status || 0
  }
} finally { rmSync(output, { recursive: true, force: true }) }
