import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type MutationAuthorityClassification =
  | 'sovereign-gated'
  | 'partially-gated'
  | 'ungated'
  | 'startup-only'
  | 'recovery-only'
  | 'replay-only'
  | 'legacy compatibility'
  | 'unsafe'

export type MutationAuthorityNode = {
  path: string
  classification: MutationAuthorityClassification
  reasons: string[]
}

const ROOT = path.resolve(process.cwd(), 'src')

const CANDIDATE_FILES = [
  'api/routes/entity.ts',
  'api/routes/orchestrator.ts',
  'api/middleware/requireEntityOwner.ts',
  'auth/authService.ts',
  'brain/flowmind/flowMindActionExecutor.ts',
  'entities/identity/canonicalEntityIdentityBackfillService.ts',
  'learning/negative-attribution/runtime/negativeAttributionRuntime.ts',
  'learning/persistence/sovereignAdaptiveAppend.ts',
  'learning/runtime/adaptiveInfluenceGateRuntime.ts',
  'learning/runtime/economicFeedbackRuntime.ts',
  'learning/runtime/terminalFailureDetectionRuntime.ts',
  'market-signals/opportunities/governance/runtime/opportunityGovernanceRuntime.ts',
  'modules/legalCases/caseService.ts',
  'orchestrator/flowMindCommandTransactionService.ts',
  'orchestrator/sovereignMutationCommandService.ts',
  'server.ts',
  'services/institutionalContinuityGovernanceService.ts',
  'services/runtimeContinuityAttestationService.ts',
]

function classifySource(source: string, relativePath: string): MutationAuthorityNode {
  const reasons: string[] = []

  if (source.includes('institutionalSovereignMutationGate')) {
    reasons.push('imports sovereign gate')
  }
  if (source.includes('runWithMutationAuthority')) {
    reasons.push('direct authority context issuer')
  }
  if (source.includes('traceMutation')) {
    reasons.push('repository-local mutation trace')
  }
  if (source.includes('.run(') || source.includes('.transaction(')) {
    reasons.push('contains persistence write primitive')
  }

  let classification: MutationAuthorityClassification = 'unsafe'
  if (source.includes('institutionalSovereignMutationGate')) {
    classification = 'sovereign-gated'
  } else if (source.includes('runWithMutationAuthority') || source.includes('traceMutation')) {
    classification = 'partially-gated'
  } else if (source.includes('.run(') || source.includes('.transaction(')) {
    classification = relativePath.includes('server.ts') ? 'startup-only' : 'ungated'
  }

  if (relativePath.includes('runtimeContinuityAttestationService')) {
    classification = 'recovery-only'
  }
  if (relativePath.includes('sovereignAdaptiveAppend')) {
    classification = 'replay-only'
  }
  if (relativePath.includes('canonicalEntityIdentityBackfillService')) {
    classification = 'legacy compatibility'
  }

  return {
    path: relativePath,
    classification,
    reasons,
  }
}

export async function buildMutationAuthorityGraph() {
  const nodes: MutationAuthorityNode[] = []

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

  const detectedBypassPaths = nodes
    .filter((node) => node.classification !== 'sovereign-gated')
    .map((node) => node.path)

  const centralizedAuthorityCoverage = nodes.length === 0
    ? 100
    : Number((((nodes.length - detectedBypassPaths.length) / nodes.length) * 100).toFixed(2))

  return {
    nodes,
    detectedBypassPaths,
    centralizedAuthorityCoverage,
  }
}
