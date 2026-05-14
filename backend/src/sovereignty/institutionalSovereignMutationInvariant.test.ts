import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'src')
const allowedRunWithMutationAuthority = new Set([
  'sovereignty/authorityBoundary.ts',
  'sovereignty/institutionalSovereignMutationGate.ts',
  'sovereignty/mutationAuthorityGraph.ts',
  'sovereignty/sovereignTestMutationHarness.ts',
])

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(fullPath)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      yield fullPath
    }
  }
}

test('no new runWithMutationAuthority usage appears outside sovereign gate internals', async () => {
  const violations: string[] = []

  for await (const file of walk(root)) {
    const relativePath = path.relative(root, file).replaceAll(path.sep, '/')
    const source = await readFile(file, 'utf-8')
    if (source.includes('runWithMutationAuthority') && !allowedRunWithMutationAuthority.has(relativePath)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})
