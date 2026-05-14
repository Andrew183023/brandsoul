import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type AuthAuthorityClassification =
  | 'sovereign-gated'
  | 'partially-gated'
  | 'ungated'
  | 'startup-only'
  | 'recovery-only'
  | 'compatibility-only'
  | 'unsafe'

export type AuthAuthorityNode = {
  path: string
  classification: AuthAuthorityClassification
  reasons: string[]
}

const ROOT = path.resolve(process.cwd(), 'src')

const CANDIDATE_FILES = [
  'auth/authService.ts',
  'auth/refreshSessionService.ts',
  'auth/repositories/accessAuditRepository.ts',
  'auth/repositories/backendNativeAuthStoreRepository.ts',
  'auth/repositories/dualAuthStoreAdapter.ts',
  'auth/repositories/legacyAuthStoreRepository.ts',
  'auth/repositories/refreshSessionRepository.ts',
  'auth/repositories/signingKeyRepository.ts',
  'auth/migration/legacyAuthImportService.ts',
]

function classifySource(source: string, relativePath: string): AuthAuthorityNode {
  const reasons: string[] = []

  if (source.includes('AuthSovereignMutationService') || source.includes('authSovereignMutationService')) {
    reasons.push('imports auth sovereign mutation service')
  }
  if (source.includes('institutionalSovereignMutationGate')) {
    reasons.push('imports institutional sovereign gate')
  }
  if (source.includes('runWithMutationAuthority') || source.includes('traceMutation')) {
    reasons.push('contains direct mutation authority')
  }
  if (source.includes('.run(') || source.includes('.transaction(')) {
    reasons.push('contains persistence write primitive')
  }

  let classification: AuthAuthorityClassification = 'unsafe'
  if (source.includes('AuthSovereignMutationService') || source.includes('authSovereignMutationService')) {
    classification = 'sovereign-gated'
  } else if (source.includes('runWithMutationAuthority') || source.includes('traceMutation')) {
    classification = 'partially-gated'
  } else if (source.includes('.run(') || source.includes('.transaction(')) {
    classification = 'ungated'
  }

  if (relativePath.includes('legacyAuthImportService')) {
    classification = source.includes('institutionalSovereignMutationGate') ? 'recovery-only' : 'compatibility-only'
  }
  if (relativePath.includes('/repositories/')) {
    classification = source.includes('.run(') ? 'compatibility-only' : classification
  }

  return {
    path: relativePath,
    classification,
    reasons,
  }
}

export async function buildAuthAuthorityGraph() {
  const nodes: AuthAuthorityNode[] = []

  for (const relativePath of CANDIDATE_FILES) {
    const absolutePath = path.join(ROOT, relativePath)
    try {
      const source = await readFile(absolutePath, 'utf-8')
      nodes.push(classifySource(source, relativePath))
    } catch {
      nodes.push({
        path: relativePath,
        classification: 'unsafe',
        reasons: ['source file unavailable during graph build'],
      })
    }
  }

  const ungatedAuthPaths = nodes
    .filter((node) => node.classification !== 'sovereign-gated')
    .map((node) => node.path)

  const centralizedAuthCoverage = nodes.length === 0
    ? 100
    : Number((((nodes.length - ungatedAuthPaths.length) / nodes.length) * 100).toFixed(2))

  return {
    nodes,
    ungatedAuthPaths,
    centralizedAuthCoverage,
  }
}
