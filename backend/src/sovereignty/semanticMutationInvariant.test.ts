import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'src')
const forbiddenRepositoryTokens = [
  'semanticPurpose',
  'institutionalMeaning',
  'governanceDecision',
]

const highRiskFiles = [
  'auth/authService.ts',
  'modules/legalCases/caseService.ts',
  'services/publicInteractionActionService.ts',
  'learning/persistence/sovereignAdaptiveAppend.ts',
  'learning/runtime/economicFeedbackRuntime.ts',
  'learning/runtime/adaptiveInfluenceGateRuntime.ts',
]

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

test('repository semantic meaning violations and missing high-risk semantic executors are detected', async () => {
  const violations: string[] = []

  for await (const file of walk(root)) {
    const relativePath = path.relative(root, file).replaceAll(path.sep, '/')
    const source = await readFile(file, 'utf-8')
    if (relativePath.includes('/repositories/') || relativePath.includes('/persistence/')) {
      if (relativePath === 'learning/persistence/sovereignAdaptiveAppend.ts') {
        continue
      }
      for (const token of forbiddenRepositoryTokens) {
        if (source.includes(token)) {
          violations.push(`${relativePath}:${token}`)
        }
      }
    }
  }

  for (const relativePath of highRiskFiles) {
    const source = await readFile(path.join(root, relativePath), 'utf-8')
    if (!source.includes('executeSemanticMutation')) {
      violations.push(`${relativePath}:missing-executor`)
    }
  }

  assert.deepEqual(violations, [])
})
