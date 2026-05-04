import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(workspaceRoot, 'src')

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const collected = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      collected.push(...await collectTestFiles(entryPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      collected.push(entryPath)
    }
  }

  return collected
}

const files = (await collectTestFiles(sourceRoot)).sort()

if (files.length === 0) {
  console.error('No source test files found under src/.')
  process.exit(1)
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)