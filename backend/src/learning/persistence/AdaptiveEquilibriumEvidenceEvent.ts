import { createHash } from 'node:crypto'
import {
  buildCurrentAdaptiveEvidenceContractMetadata,
  type AdaptiveEvidenceGenerationMetadata,
  type AdaptiveEvidenceReducerSemanticMetadata,
  type AdaptiveEvidenceSemanticVersionMetadata,
} from './adaptiveEvidenceContract.js'

export type AdaptiveEquilibriumGovernanceClassification = 'SAFE' | 'CAUTION' | 'UNSAFE'

export type AdaptiveHeatmapScopeKey = 'signal' | 'category' | 'entity' | 'multi_scope' | 'unscoped'

export type AdaptiveHeatmapConcentrationCell = {
  key: string
  label: string
  opportunityCount: number
  projectedShare: number
  projectedScoreShare: number
  averageAdaptiveWeight: number
  averageRankDominance: number
  concentrationScore: number
}

export type AdaptiveScopeHeatmapCell = {
  scope: AdaptiveHeatmapScopeKey
  opportunityCount: number
  projectedShare: number
  averageAdaptiveWeight: number
  concentrationScore: number
}

export type AdaptiveRankingDistributionCell = {
  rank: number
  opportunityId: string
  category: string
  entityId: string | null
  baseRank: number
  projectedRank: number
  rankDelta: number
  adaptiveWeight: number
  dominanceScore: number
}

export type AdaptiveReplayDivergenceHeatmap = {
  divergenceRatio: number
  averageAbsRankDelta: number
  maxAbsRankDelta: number
  equivalentFingerprintRatio: number
  oscillationFrequency: number
  saturationRatio: number
  replayDivergenceIntensityScore: number
}

export type AdaptiveHeatmapSnapshot = {
  category: AdaptiveHeatmapConcentrationCell[]
  entity: AdaptiveHeatmapConcentrationCell[]
  adaptiveScope: AdaptiveScopeHeatmapCell[]
  rankingDistribution: AdaptiveRankingDistributionCell[]
  replayDivergence: AdaptiveReplayDivergenceHeatmap
  summary: {
    candidateCount: number
    topCategoryKey: string | null
    topEntityKey: string | null
    rankingDominanceScore: number
    saturationIntensityScore: number
    reinforcementIntensityScore: number
    oscillationIntensityScore: number
  }
}

export type AdaptiveEquilibriumEvidenceEvent = {
  evidenceId: string
  evidenceType: 'adaptive_equilibrium_evidence'
  replayConsistencyEquilibrium: number
  reinforcementEscalationPersistence: number
  saturationEquilibrium: number
  oscillationDamping: number
  projectionStabilityConvergence: number
  rankingDiversityPreservation: number
  entropyEvolution: number
  projectionLockInPersistence: number
  lowConfidenceAmplificationPersistence: number
  replayDegradationPersistence: number
  governanceClassification: AdaptiveEquilibriumGovernanceClassification
  recommendation: 'do_not_rollout'
  sustainedEquilibriumEvidence: boolean
  replayFingerprint: string
  generatedAt: string
  heatmapSnapshot?: AdaptiveHeatmapSnapshot | null
  evidenceContractVersion: string
  semanticVersionMetadata: AdaptiveEvidenceSemanticVersionMetadata
  reducerSemanticMetadata: AdaptiveEvidenceReducerSemanticMetadata
  evidenceGenerationMetadata: AdaptiveEvidenceGenerationMetadata
}

export type AppendAdaptiveEquilibriumEvidenceInput = Omit<
  AdaptiveEquilibriumEvidenceEvent,
  'evidenceId' | 'evidenceType' | 'evidenceContractVersion' | 'semanticVersionMetadata' | 'reducerSemanticMetadata' | 'evidenceGenerationMetadata'
> & {
  evidenceId?: string
  evidenceType?: 'adaptive_equilibrium_evidence'
  evidenceContractVersion?: string
  semanticVersionMetadata?: Partial<AdaptiveEvidenceSemanticVersionMetadata> | null
  reducerSemanticMetadata?: Partial<AdaptiveEvidenceReducerSemanticMetadata> | null
  evidenceGenerationMetadata?: Partial<AdaptiveEvidenceGenerationMetadata> | null
}

function normalizeMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  const bounded = Math.min(Math.max(value, 0), 1)
  return Number(bounded.toFixed(6))
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

export function buildAdaptiveEquilibriumEvidenceId(input: Omit<AppendAdaptiveEquilibriumEvidenceInput, 'evidenceId' | 'evidenceType'>) {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  const payload = {
    replayConsistencyEquilibrium: normalizeMetric(input.replayConsistencyEquilibrium),
    reinforcementEscalationPersistence: normalizeMetric(input.reinforcementEscalationPersistence),
    saturationEquilibrium: normalizeMetric(input.saturationEquilibrium),
    oscillationDamping: normalizeMetric(input.oscillationDamping),
    projectionStabilityConvergence: normalizeMetric(input.projectionStabilityConvergence),
    rankingDiversityPreservation: normalizeMetric(input.rankingDiversityPreservation),
    entropyEvolution: normalizeMetric(input.entropyEvolution),
    projectionLockInPersistence: normalizeMetric(input.projectionLockInPersistence),
    lowConfidenceAmplificationPersistence: normalizeMetric(input.lowConfidenceAmplificationPersistence),
    replayDegradationPersistence: normalizeMetric(input.replayDegradationPersistence),
    governanceClassification: input.governanceClassification,
    recommendation: input.recommendation,
    sustainedEquilibriumEvidence: input.sustainedEquilibriumEvidence,
    replayFingerprint: input.replayFingerprint,
    heatmapSnapshot: input.heatmapSnapshot ?? null,
    evidenceContractVersion: input.evidenceContractVersion ?? contractMetadata.evidenceContractVersion,
    semanticVersionMetadata: input.semanticVersionMetadata ?? contractMetadata.semanticVersionMetadata,
    reducerSemanticMetadata: input.reducerSemanticMetadata ?? contractMetadata.reducerSemanticMetadata,
    evidenceGenerationMetadata: input.evidenceGenerationMetadata ?? contractMetadata.evidenceGenerationMetadata,
  }

  const digest = createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 32)

  return `adaptive-equilibrium-evidence:${digest}`
}
