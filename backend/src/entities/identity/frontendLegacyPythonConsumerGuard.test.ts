import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

async function collectFiles(root: string): Promise<string[]> {
  const details = await stat(root)
  if (details.isFile()) {
    return [root]
  }

  const entries = await readdir(root, { withFileTypes: true })
  const collected: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
        continue
      }
      collected.push(...await collectFiles(fullPath))
      continue
    }

    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      collected.push(fullPath)
    }
  }

  return collected
}

test('frontend has no direct dependency on legacy python authority routes', async () => {
  const workspaceRoot = path.resolve(process.cwd(), '..')
  const frontendRoot = path.resolve(workspaceRoot, 'brandsoul-frontend/src')
  const files = await collectFiles(frontendRoot)
  const forbiddenPatterns = [
    /\/admin\/spark\b/,
    /\/admin\/persona\b/,
    /\bbuildPythonApiUrl\b/,
    /\breadPythonApiBaseUrl\b/,
    /\bPYTHON_API_BASE_URL\b/,
    /\bdeprecatedPythonAccountFlows\b/,
  ]
  const hits: string[] = []

  for (const file of files) {
    const source = await readFile(file, 'utf-8')
    const lines = source.split(/\r?\n/)
    const relative = path.relative(workspaceRoot, file).split(path.sep).join('/')

    lines.forEach((line, idx) => {
      if (forbiddenPatterns.some((pattern) => pattern.test(line))) {
        hits.push(`${relative}:${idx + 1}:${line.trim()}`)
      }
    })
  }

  assert.deepEqual(hits, [], `Frontend direct legacy python consumers detected:\n${hits.join('\n')}`)
})
