import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type SemanticMutationAuthorityClassification =
  | 'passive persistence'
  | 'semantic mutation'
  | 'orchestration mutation'
  | 'implicit semantic write'
  | 'unsafe semantic authority'

export type SemanticMutationAuthorityNode = {
  path: string
  classification: SemanticMutationAuthorityClassification
  reasons: string[]
}

const ROOT = path.resolve(process.cwd(), 'src')
const CANDIDATE_FILES = [
  'auth/authService.ts',
  'api/routes/entity.ts',
  'modules/legalCases/caseService.ts',
  'services/publicInteractionActionService.ts',
  'learning/governance/governanceEvidenceTimelineService.ts',
  'learning/persistence/sovereignAdaptiveAppend.ts',
  'learning/runtime/economicFeedbackRuntime.ts',
  'learning/runtime/adaptiveInfluenceGateRuntime.ts',
  'learning/persistence/governanceEvidenceTimelineRepository.ts',
  'learning/persistence/adaptiveEquilibriumEvidenceRepository.ts',
  'learning/persistence/learningCheckpointRepository.ts',
  'auth/repositories/dualAuthStoreAdapter.ts',
]

const REPOSITORY_PASSIVITY_FORBIDDEN = [
  'semanticPurpose',
  'institutionalMeaning',
  'governanceDecision',
]

function classifySource(source: string, relativePath: string): SemanticMutationAuthorityNode {
  const reasons: string[] = []

  if (source.includes('executeSemanticMutation') || source.includes('semanticMutationExecutor')) {
    reasons.push('uses semantic mutation executor')
  }
  if (source.includes('evaluateAndExecute(') || source.includes('authSovereignMutationService.execute(')) {
    reasons.push('uses sovereign mutation orchestration')
  }
  if (source.includes('.run(') || source.includes('.transaction(') || source.includes('traceMutation(')) {
    reasons.push('contains mutation-capable persistence primitive')
  }
  if ((relativePath.includes('/repositories/') || relativePath.includes('/persistence/')) && REPOSITORY_PASSIVITY_FORBIDDEN.some((token) => source.includes(token))) {
    reasons.push('repository passivity violation')
  }

  let classification: SemanticMutationAuthorityClassification = 'unsafe semantic authority'
  if (relativePath.includes('/repositories/') || relativePath.includes('/persistence/')) {
    classification = reasons.includes('repository passivity violation')
      ? 'unsafe semantic authority'
      : 'passive persistence'
  } else if (source.includes('executeSemanticMutation') || source.includes('semanticMutationExecutor')) {
    classification = 'semantic mutation'
  } else if (source.includes('evaluateAndExecute(') || source.includes('authSovereignMutationService.execute(')) {
    classification = 'orchestration mutation'
  } else if (source.includes('.run(') || source.includes('.transaction(') || source.includes('traceMutation(')) {
    classification = 'implicit semantic write'
  }

  return {
    path: relativePath,
    classification,
    reasons,
  }
}

export async function buildSemanticMutationAuthorityGraph() {
  const nodes: SemanticMutationAuthorityNode[] = []

  for (const relativePath of CANDIDATE_FILES) {
    const absolutePath = path.join(ROOT, relativePath)
    try {
      const source = await readFile(absolutePath, 'utf-8')
      nodes.push(classifySource(source, relativePath))
    } catch {
      nodes.push({
        path: relativePath,
        classification: 'unsafe semantic authority',
        reasons: ['source file unavailable during graph build'],
      })
    }
  }

  const unsafeSemanticWriters = nodes
    .filter((node) => node.classification === 'unsafe semantic authority' || node.classification === 'implicit semantic write')
    .map((node) => node.path)

  const repositoryPassivityViolations = nodes
    .filter((node) => node.classification === 'unsafe semantic authority' && (node.path.includes('/repositories/') || node.path.includes('/persistence/')))
    .map((node) => node.path)

  const semanticCoverage = nodes.length === 0
    ? 100
    : Number((((nodes.length - unsafeSemanticWriters.length) / nodes.length) * 100).toFixed(2))

  return {
    nodes,
    unsafeSemanticWriters,
    repositoryPassivityViolations,
    semanticCoverage,
  }
}
