import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

type Hit = {
  file: string
  line: number
  snippet: string
  rule: string
}

const ALLOWED_FILES = new Set([
  'brandsoul/services/auth_store.py',
])

const ALLOW_MARKER = 'LEGACY_PYTHON_AUTHORITY_ALLOWED'

const FORBIDDEN_PATTERNS: Array<{ rule: string; matcher: RegExp }> = [
  { rule: 'direct spark read', matcher: /\bget_spark_by_tenant_id\s*\(/ },
  { rule: 'direct spark write', matcher: /\bupsert_spark\s*\(/ },
  { rule: 'direct spark mutation SQL', matcher: /\b(INSERT\s+INTO|UPDATE)\s+sparks\b/i },
  { rule: 'new semantic authority reference to python', matcher: /semanticAuthority\s*[:=]\s*["']python\./i },
  {
    rule: 'new runtime mediation route registration',
    matcher: /record_legacy_runtime_participation\("\/(?!channel\/message|chat|interaction\/simulate)[^"\n]*"\s*,\s*"runtime_mediation"\)/,
  },
]

async function collectPythonFiles(root: string): Promise<string[]> {
  const details = await stat(root)
  if (details.isFile()) {
    return root.endsWith('.py') ? [root] : []
  }

  const entries = await readdir(root, { withFileTypes: true })
  const collected: string[] = []

  for (const entry of entries) {
    if (entry.name === '__pycache__' || entry.name === '.venv') {
      continue
    }

    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      collected.push(...await collectPythonFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.py')) {
      collected.push(fullPath)
    }
  }

  return collected
}

test('brandsoul semantic authority remains encapsulated behind backend gateway', async () => {
  const workspaceRoot = path.resolve(process.cwd(), '..')
  const brandsoulRoot = path.resolve(workspaceRoot, 'brandsoul')
  const files = await collectPythonFiles(brandsoulRoot)
  const hits: Hit[] = []

  for (const file of files) {
    const relative = path.relative(workspaceRoot, file).split(path.sep).join('/')
    if (ALLOWED_FILES.has(relative)) {
      continue
    }

    const source = await readFile(file, 'utf-8')
    const lines = source.split(/\r?\n/)

    lines.forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) {
        return
      }
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.matcher.test(line)) {
          hits.push({
            file: relative,
            line: index + 1,
            snippet: line.trim(),
            rule: pattern.rule,
          })
        }
      }
    })
  }

  assert.deepEqual(hits, [], `Forbidden direct Python semantic authority usage found:\n${hits.map((hit) => `${hit.file}:${hit.line} [${hit.rule}] ${hit.snippet}`).join('\n')}`)
})
