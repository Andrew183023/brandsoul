import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export type EntityIdentityFallbackAuditPattern =
  | 'finalForm.identity'
  | 'social.publicName'
  | 'brand.name'
  | 'legacy.spark'
  | 'legacy.persona'

export type EntityIdentityFallbackOccurrence = {
  file: string
  line: number
  pattern: EntityIdentityFallbackAuditPattern
  classification: 'SAFE_COMPATIBILITY' | 'MUST_REPLACE' | 'LEGACY_PYTHON_AUTHORITY' | 'TEST_ONLY'
  snippet: string
}

export type EntityIdentityFallbackAuditReport = {
  generatedAt: string
  occurrences: EntityIdentityFallbackOccurrence[]
  countsByClassification: Record<'SAFE_COMPATIBILITY' | 'MUST_REPLACE' | 'LEGACY_PYTHON_AUTHORITY' | 'TEST_ONLY', number>
}

const DEFAULT_ROOTS = [
  'backend/src',
  'brandsoul',
]

const PATTERN_DEFINITIONS: Array<{ pattern: EntityIdentityFallbackAuditPattern; matcher: RegExp }> = [
  { pattern: 'finalForm.identity', matcher: /\bfinalForm\.identity\b/ },
  { pattern: 'social.publicName', matcher: /\bsocial\.publicName\b/ },
  { pattern: 'brand.name', matcher: /\bbrand\.name\b/ },
  { pattern: 'legacy.spark', matcher: /\b(fetch_tenant_spark|SparkPayload)\b/ },
  { pattern: 'legacy.persona', matcher: /\bPersona\b/ },
]

async function collectFiles(root: string): Promise<string[]> {
  const details = await stat(root)
  if (details.isFile()) {
    return /\.(ts|tsx|py)$/.test(path.basename(root)) ? [root] : []
  }

  const entries = await readdir(root, { withFileTypes: true })
  const collected: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === '__pycache__' || entry.name === 'data') {
        continue
      }
      collected.push(...await collectFiles(fullPath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (/\.(ts|tsx|py)$/.test(entry.name)) {
      collected.push(fullPath)
    }
  }

  return collected
}

function classifyOccurrence(file: string): EntityIdentityFallbackOccurrence['classification'] {
  if (file.endsWith('.test.ts') || file.includes('/tests/') || file.endsWith('_test.py') || file.includes('/test_')) {
    return 'TEST_ONLY'
  }

  if (file === 'backend/src/entities/identity/entityIdentityFallbackAudit.ts') {
    return 'TEST_ONLY'
  }

  if (file.startsWith('brandsoul/')) {
    return 'LEGACY_PYTHON_AUTHORITY'
  }

  if (
    file === 'backend/src/services/publicProfileMapper.ts'
    || file === 'backend/src/api/routes/entity.ts'
    || file === 'backend/src/orchestrator/dashboardProjection.ts'
    || file === 'backend/src/services/discoveryEngine.ts'
    || file === 'backend/src/services/globalFeedEngine.ts'
  ) {
    return 'SAFE_COMPATIBILITY'
  }

  return 'MUST_REPLACE'
}

export async function runEntityIdentityFallbackAudit(args: {
  workspaceRoot: string
  roots?: string[]
  now?: () => string
}): Promise<EntityIdentityFallbackAuditReport> {
  const roots = (args.roots ?? DEFAULT_ROOTS).map((root) => path.resolve(args.workspaceRoot, root))
  const files = (await Promise.all(roots.map((root) => collectFiles(root)))).flat().sort()
  const occurrences: EntityIdentityFallbackOccurrence[] = []
  const countsByClassification: EntityIdentityFallbackAuditReport['countsByClassification'] = {
    SAFE_COMPATIBILITY: 0,
    MUST_REPLACE: 0,
    LEGACY_PYTHON_AUTHORITY: 0,
    TEST_ONLY: 0,
  }

  for (const file of files) {
    const source = await readFile(file, 'utf-8')
    const lines = source.split(/\r?\n/)

    lines.forEach((line, index) => {
      for (const definition of PATTERN_DEFINITIONS) {
        if (definition.matcher.test(line)) {
          const relativeFile = path.relative(args.workspaceRoot, file).split(path.sep).join('/')
          const classification = classifyOccurrence(relativeFile)
          countsByClassification[classification] += 1
          occurrences.push({
            file: relativeFile,
            line: index + 1,
            pattern: definition.pattern,
            classification,
            snippet: line.trim(),
          })
        }
      }
    })
  }

  return {
    generatedAt: args.now?.() ?? new Date().toISOString(),
    occurrences,
    countsByClassification,
  }
}
