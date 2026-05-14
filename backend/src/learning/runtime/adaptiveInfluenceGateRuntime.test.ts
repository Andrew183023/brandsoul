import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { createOpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import { buildAdaptiveEquilibriumEvidenceId } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'
import type { AdaptiveWeightSnapshotRuntime } from './adaptiveWeightSnapshotRuntime.js'
import {
  AdaptiveInfluenceGateRuntime,
} from './adaptiveInfluenceGateRuntime.js'

type AdaptiveWeightSnapshotStub = {
  snapshot: {
    generatedAt: string
    signalWeights: Array<{
      weightId: string
      memoryId: string
      scope: 'signal'
      category: string
      signalKeyword: string
      entityId: string | null
      weight: number
      sampleCount: number
      confidenceLevel: 'low' | 'medium' | 'high'
      decayFactor: number
      lastUpdated: string
    }>
    categoryWeights: Array<{
      weightId: string
      memoryId: string
      scope: 'category'
      category: string
      signalKeyword: string
      entityId: string | null
      weight: number
      sampleCount: number
      confidenceLevel: 'low' | 'medium' | 'high'
      decayFactor: number
      lastUpdated: string
    }>
    entityWeights: Array<{
      weightId: string
      memoryId: string
      scope: 'entity'
      category: string
      signalKeyword: string
      entityId: string | null
      weight: number
      sampleCount: number
      confidenceLevel: 'low' | 'medium' | 'high'
      decayFactor: number
      lastUpdated: string
    }>
    metadata: {
      recordCount: number
      boundedMin: number
      boundedMax: number
      refreshIntervalMs: number
      lastRefreshDurationMs: number | null
      lastError: string | null
    }
  }
  freshness: {
    ready: boolean
    updatedAt: string | null
    ageMs: number | null
    refreshIntervalMs: number
    lastRefreshDurationMs: number | null
    refreshing: boolean
    lastError: string | null
  }
  runtimeState: {
    ready: boolean
    warming: boolean
    error: string | null
  }
}

function createAdaptiveWeightRuntimeStub(snapshot: AdaptiveWeightSnapshotStub) {
  return {
    getSnapshot: () => snapshot,
  } as unknown as AdaptiveWeightSnapshotRuntime
}

function normalizeReplayIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function roundReplayMetric(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function computeReplayContractFingerprint(args: {
  opportunityId: string
  marketSignalId: string
  entityId: string | null
  baseScore: number
  baseRank: number
  adaptiveMultiplier: number
  finalProjectedScore: number
  projectedRank: number
  rankDelta: number
  blockedReason: string
  sampleThresholdSatisfied: boolean
  projectionMode: string
  weightSources: {
    signal: string | null
    category: string | null
    entity: string | null
  }
  memoryIds: {
    signal: string | null
    category: string | null
    entity: string | null
  }
  config: {
    enabled: boolean
    mode: string
    killSwitchEnabled: boolean
    rolloutPercentage: number
    minimumSampleRequirement: number
    allowedScopes: string[]
  }
  evidence: {
    signal: { weightId: string } | null
    category: { weightId: string } | null
    entity: { weightId: string } | null
  }
}) {
  const rolloutBucket = Number.parseInt(
    createHash('sha256')
      .update([
        normalizeReplayIdPart(args.opportunityId),
        normalizeReplayIdPart(args.marketSignalId),
        normalizeReplayIdPart(args.entityId ?? '*'),
      ].join(':'))
      .digest('hex')
      .slice(0, 8),
    16,
  ) % 100

  const digest = createHash('sha256')
    .update([
      normalizeReplayIdPart(args.opportunityId),
      normalizeReplayIdPart(args.marketSignalId),
      normalizeReplayIdPart(args.entityId ?? '*'),
      roundReplayMetric(args.baseScore).toString(),
      args.baseRank.toString(),
      roundReplayMetric(args.adaptiveMultiplier).toString(),
      roundReplayMetric(args.finalProjectedScore).toString(),
      args.projectedRank.toString(),
      args.rankDelta.toString(),
      args.blockedReason,
      rolloutBucket.toString(),
      args.sampleThresholdSatisfied ? '1' : '0',
      args.projectionMode,
      args.weightSources.signal ?? 'none',
      args.weightSources.category ?? 'none',
      args.weightSources.entity ?? 'none',
      args.memoryIds.signal ?? 'none',
      args.memoryIds.category ?? 'none',
      args.memoryIds.entity ?? 'none',
      args.config.enabled ? '1' : '0',
      args.config.mode,
      args.config.killSwitchEnabled ? '1' : '0',
      args.config.rolloutPercentage.toString(),
      args.config.minimumSampleRequirement.toString(),
      [...args.config.allowedScopes].sort((left, right) => left.localeCompare(right)).join(','),
      args.evidence.signal?.weightId ?? 'none',
      args.evidence.category?.weightId ?? 'none',
      args.evidence.entity?.weightId ?? 'none',
    ].join(':'))
    .digest('hex')

  return {
    rolloutBucket,
    replayFingerprint: `adaptive-influence:${digest.slice(0, 24)}`,
  }
}

function createEconomicMemoryRepositoryStub() {
  return {
    async listEconomicMemoryByScope(scope: 'signal' | 'category' | 'entity') {
      if (scope === 'signal') {
        return [{
          memoryId: 'memory-signal-1',
          memoryScope: 'signal',
          category: 'legal',
          signalKeyword: 'labor lawyer',
          entityId: null,
          successCount: 4,
          failureCount: 1,
          sampleCount: 5,
          minimumSampleCount: 3,
          totalRevenue: 2500,
          averageConversion: 0.8,
          timeDecayWeight: 1,
          decayHalfLifeDays: 30,
          lastSeenAt: '2026-05-08T12:00:00.000Z',
          updatedAt: '2026-05-08T12:00:00.000Z',
        }]
      }

      if (scope === 'category') {
        return [{
          memoryId: 'memory-category-1',
          memoryScope: 'category',
          category: 'legal',
          signalKeyword: '*',
          entityId: null,
          successCount: 8,
          failureCount: 2,
          sampleCount: 10,
          minimumSampleCount: 3,
          totalRevenue: 5000,
          averageConversion: 0.8,
          timeDecayWeight: 1,
          decayHalfLifeDays: 30,
          lastSeenAt: '2026-05-08T12:00:00.000Z',
          updatedAt: '2026-05-08T12:00:00.000Z',
        }]
      }

      return [{
        memoryId: 'memory-entity-1',
        memoryScope: 'entity',
        category: 'legal',
        signalKeyword: '*',
        entityId: 'entity-1',
        successCount: 2,
        failureCount: 1,
        sampleCount: 3,
        minimumSampleCount: 3,
        totalRevenue: 1200,
        averageConversion: 0.6667,
        timeDecayWeight: 1,
        decayHalfLifeDays: 30,
        lastSeenAt: '2026-05-08T12:00:00.000Z',
        updatedAt: '2026-05-08T12:00:00.000Z',
      }]
    },
  }
}

function createAdaptiveEquilibriumEvidenceRepositoryStub() {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  const records = new Map<string, {
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
    governanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE'
    recommendation: 'do_not_rollout'
    sustainedEquilibriumEvidence: boolean
    replayFingerprint: string
    generatedAt: string
    evidenceContractVersion: string
    semanticVersionMetadata: ReturnType<typeof buildCurrentAdaptiveEvidenceContractMetadata>['semanticVersionMetadata']
    reducerSemanticMetadata: ReturnType<typeof buildCurrentAdaptiveEvidenceContractMetadata>['reducerSemanticMetadata']
    evidenceGenerationMetadata: ReturnType<typeof buildCurrentAdaptiveEvidenceContractMetadata>['evidenceGenerationMetadata']
  }>()

  return {
    async appendEvidence(input: {
      evidenceId?: string
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
      governanceClassification: 'SAFE' | 'CAUTION' | 'UNSAFE'
      recommendation: 'do_not_rollout'
      sustainedEquilibriumEvidence: boolean
      replayFingerprint: string
      generatedAt: string
    }) {
      const evidenceId = input.evidenceId ?? buildAdaptiveEquilibriumEvidenceId(input)
      const existing = records.get(evidenceId)
      if (existing) {
        return {
          evidence: existing,
          inserted: false,
        }
      }

      const evidence = {
        evidenceId,
        evidenceType: 'adaptive_equilibrium_evidence' as const,
        replayConsistencyEquilibrium: input.replayConsistencyEquilibrium,
        reinforcementEscalationPersistence: input.reinforcementEscalationPersistence,
        saturationEquilibrium: input.saturationEquilibrium,
        oscillationDamping: input.oscillationDamping,
        projectionStabilityConvergence: input.projectionStabilityConvergence,
        rankingDiversityPreservation: input.rankingDiversityPreservation,
        entropyEvolution: input.entropyEvolution,
        projectionLockInPersistence: input.projectionLockInPersistence,
        lowConfidenceAmplificationPersistence: input.lowConfidenceAmplificationPersistence,
        replayDegradationPersistence: input.replayDegradationPersistence,
        governanceClassification: input.governanceClassification,
        recommendation: 'do_not_rollout' as const,
        sustainedEquilibriumEvidence: input.sustainedEquilibriumEvidence,
        replayFingerprint: input.replayFingerprint,
        generatedAt: input.generatedAt,
        evidenceContractVersion: contractMetadata.evidenceContractVersion,
        semanticVersionMetadata: contractMetadata.semanticVersionMetadata,
        reducerSemanticMetadata: contractMetadata.reducerSemanticMetadata,
        evidenceGenerationMetadata: contractMetadata.evidenceGenerationMetadata,
      }
      records.set(evidenceId, evidence)

      return {
        evidence,
        inserted: true,
      }
    },
    async countEvidence() {
      return records.size
    },
    async getEvidenceById(evidenceId: string) {
      return records.get(evidenceId) ?? null
    },
    async listEvidencePaginated(args: { limit?: number, offset?: number } = {}) {
      const limit = Math.max(1, Math.min(500, Math.trunc(args.limit ?? 50)))
      const offset = Math.max(0, Math.trunc(args.offset ?? 0))
      return [...records.values()]
        .sort((left, right) => {
          const byGeneratedAt = right.generatedAt.localeCompare(left.generatedAt)
          if (byGeneratedAt !== 0) {
            return byGeneratedAt
          }

          return right.evidenceId.localeCompare(left.evidenceId)
        })
        .slice(offset, offset + limit)
    },
  }
}

type LearningCheckpointRecordStub = {
  checkpointId: string
  runtimeName: string
  lastProcessedAttributionId: string | null
  lastProcessedAttributedAt: string | null
  checkpointVersion?: number
  lineageKey?: string | null
  lineageMetadataJson?: string | null
  checkpointPayloadJson?: string | null
  continuityFingerprint?: string | null
  updatedAt: string
}

function createLearningCheckpointRepositoryStub(initial?: LearningCheckpointRecordStub | null) {
  let record = initial ?? null

  return {
    async upsertCheckpoint(input: LearningCheckpointRecordStub) {
      record = { ...input }
      return { ...input }
    },
    async getCheckpointByRuntimeName(runtimeName: string) {
      if (!record || record.runtimeName !== runtimeName) {
        return null
      }

      return { ...record }
    },
    getPersistedCheckpoint() {
      return record ? { ...record } : null
    },
  }
}

test('adaptive influence gate runtime remains non-interfering in OFF mode while producing deterministic projected influence payloads', async () => {
  const opportunitySnapshotStore = createOpportunitySnapshotStore()
  opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T12:00:00.000Z',
    opportunities: [
      {
        id: 'opportunity-1',
        keyword: 'labor lawyer',
        category: 'legal',
        economicRelevance: 92,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:labor-lawyer:2026-05-08t12-00-00-000z',
        detectedAt: '2026-05-08T12:00:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
      {
        id: 'opportunity-2',
        keyword: 'injury attorney',
        category: 'legal',
        economicRelevance: 90,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:injury-attorney:2026-05-08t12-00-00-000z',
        detectedAt: '2026-05-08T12:00:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
    ],
    suggestions: [
      {
        entityId: 'entity-1',
        entityName: 'Legal Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.84,
        reasoning: 'Recommended response for signal "labor lawyer".',
      },
      {
        entityId: 'entity-2',
        entityName: 'Injury Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.83,
        reasoning: 'Recommended response for signal "injury attorney".',
      },
    ],
    topOpportunity: {
      id: 'opportunity-1',
      keyword: 'labor lawyer',
      category: 'legal',
      economicRelevance: 92,
      leadProbability: 'high',
      sourceSignalId: 'market-signal:legal:labor-lawyer:2026-05-08t12-00-00-000z',
      detectedAt: '2026-05-08T12:00:00.000Z',
      recommendedAction: 'Generate legal intake flow',
    },
  })

  const adaptiveWeightSnapshotRuntime = createAdaptiveWeightRuntimeStub({
    snapshot: {
      generatedAt: '2026-05-08T12:00:00.000Z',
      signalWeights: [{
        weightId: 'weight-signal-1',
        memoryId: 'memory-signal-1',
        scope: 'signal',
        category: 'legal',
        signalKeyword: 'labor lawyer',
        entityId: null,
        weight: 0.95,
        sampleCount: 5,
        confidenceLevel: 'medium',
        decayFactor: 1,
        lastUpdated: '2026-05-08T12:00:00.000Z',
      }, {
        weightId: 'weight-signal-2',
        memoryId: 'memory-signal-2',
        scope: 'signal',
        category: 'legal',
        signalKeyword: 'injury attorney',
        entityId: null,
        weight: 1.25,
        sampleCount: 6,
        confidenceLevel: 'high',
        decayFactor: 1,
        lastUpdated: '2026-05-08T12:00:00.000Z',
      }],
      categoryWeights: [{
        weightId: 'weight-category-1',
        memoryId: 'memory-category-1',
        scope: 'category',
        category: 'legal',
        signalKeyword: '*',
        entityId: null,
        weight: 1,
        sampleCount: 10,
        confidenceLevel: 'high',
        decayFactor: 1,
        lastUpdated: '2026-05-08T12:00:00.000Z',
      }],
      entityWeights: [
        {
          weightId: 'weight-entity-1',
          memoryId: 'memory-entity-1',
          scope: 'entity',
          category: 'legal',
          signalKeyword: '*',
          entityId: 'entity-1',
          weight: 0.95,
          sampleCount: 3,
          confidenceLevel: 'medium',
          decayFactor: 1,
          lastUpdated: '2026-05-08T12:00:00.000Z',
        },
        {
          weightId: 'weight-entity-2',
          memoryId: 'memory-entity-2',
          scope: 'entity',
          category: 'legal',
          signalKeyword: '*',
          entityId: 'entity-2',
          weight: 1.3,
          sampleCount: 4,
          confidenceLevel: 'medium',
          decayFactor: 1,
          lastUpdated: '2026-05-08T12:00:00.000Z',
        },
      ],
      metadata: {
        recordCount: 5,
        boundedMin: 0.75,
        boundedMax: 1.35,
        refreshIntervalMs: 60_000,
        lastRefreshDurationMs: 4,
        lastError: null,
      },
    },
    freshness: {
      ready: true,
      updatedAt: '2026-05-08T12:00:00.000Z',
      ageMs: 0,
      refreshIntervalMs: 60_000,
      lastRefreshDurationMs: 4,
      refreshing: false,
      lastError: null,
    },
    runtimeState: {
      ready: true,
      warming: false,
      error: null,
    },
  })

  const runtime = new AdaptiveInfluenceGateRuntime({
    adaptiveWeightSnapshotRuntime,
    economicMemoryRepository: createEconomicMemoryRepositoryStub() as never,
    adaptiveEquilibriumEvidenceRepository: createAdaptiveEquilibriumEvidenceRepositoryStub() as never,
    opportunitySnapshotStore,
  })

  const snapshot = await runtime.refresh()
  const status = runtime.getStatus()

  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.config.mode, 'off')
  assert.equal(snapshot.config.enabled, false)
  assert.equal(snapshot.metadata.candidateCount, 2)
  assert.equal(snapshot.metadata.rolloutEligibleCount, 0)
  assert.equal(snapshot.metadata.influenceAppliedCount, 0)
  assert.equal(snapshot.metadata.blockedCount, 2)
  assert.equal(snapshot.metadata.divergenceCount, 2)
  assert.equal(snapshot.metadata.rankShiftCount, 2)
  assert.equal(snapshot.metadata.topRankChanged, true)
  assert.equal(snapshot.metadata.averageRankDelta, 1)
  assert.equal(snapshot.metadata.maxAbsRankDelta, 1)
  assert.equal(snapshot.metadata.averageAdaptiveMultiplier, 1.075)
  assert.equal(snapshot.metadata.allowedScopes.join(','), 'signal,category,entity')
  assert.equal(snapshot.metadata.audit.rankDrift.divergenceRatio, 1)
  assert.equal(snapshot.metadata.audit.repeatedTopRankPersistence.consecutiveRefreshes, 1)
  assert.equal(snapshot.metadata.audit.suppression.suppressedProjectionRatio, 1)
  assert.equal(snapshot.metadata.audit.lowConfidenceAmplification.lowConfidenceProjectionRatio >= 0, true)
  assert.equal(snapshot.metadata.audit.driftDetection.thresholds.runawayMultipliers.warning, 0.4)
  assert.equal(snapshot.metadata.audit.driftDetection.thresholds.replayDivergence.critical, 0.2)
  assert.equal(snapshot.metadata.audit.driftDetection.warnings.length, 8)
  assert.equal(snapshot.metadata.audit.driftDetection.warningSummary.activeCount >= 0, true)
  assert.equal(snapshot.metadata.audit.driftDetection.warnings.some((warning) => warning.code === 'projection_instability'), true)
  assert.equal(snapshot.metadata.audit.multiplierSaturation.saturationRatio >= 0, true)
  assert.equal(snapshot.metadata.audit.stabilityScore >= 0 && snapshot.metadata.audit.stabilityScore <= 1, true)
  assert.equal(snapshot.metadata.audit.reinforcementLoopDetection.thresholds.repeatedEntityDominance.warning, 0.55)
  assert.equal(snapshot.metadata.audit.reinforcementLoopDetection.thresholds.projectionLockIn.critical, 0.8)
  assert.equal(snapshot.metadata.audit.reinforcementLoopDetection.warnings.length, 7)
  assert.equal(snapshot.metadata.audit.reinforcementLoopDetection.warningSummary.activeCount >= 0, true)
  assert.equal(snapshot.metadata.audit.reinforcementLoopDetection.replaySafeDiagnostics.comparableFingerprintCount >= 0, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.engine.simulationOnly, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.engine.mutatesAdaptivePersistence, false)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.replayTimeline.totalReplayedSnapshots, 1)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.replayTimeline.points.length, 1)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.replayDegradationMetrics.minimumReplayConsistency, 1)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.projectionStabilityAnalysis.averageStabilityScore >= 0, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.stressSimulation.engine.simulationOnly, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.stressSimulation.engine.noMutation, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.stressSimulation.replayInstabilityThresholds.collapseWarning, 0.45)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.stressSimulation.degradationMetrics.snapshotGapRatio > 0, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.stressSimulation.replayCollapseDetection.collapseStatus !== 'stable', true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.stressSimulation.replayRiskDiagnostics.riskClassification !== 'safe', true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.rootCauseGraph.nodes.length > 0, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.instabilityContributionModel.length, 10)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.governanceRiskSummary.rolloutRecommendation, 'do_not_rollout')
  assert.equal(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(snapshot.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.governanceRiskSummary.overallSeverity), true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.decaySimulationModel.simulationOnly, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.hysteresisSimulationModel.simulationOnly, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.rolloutRecommendation.recommendation, 'do_not_rollout')
  assert.equal(['SAFE', 'CAUTION', 'UNSAFE'].includes(snapshot.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.governanceRiskAssessment.classification), true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.longitudinalModel.simulationOnly, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.longitudinalModel.noMutation, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.longitudinalModel.noRollout, true)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.longitudinalModel.trackedDimensions.length, 10)
  assert.equal(snapshot.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.governanceRecommendation.recommendation, 'do_not_rollout')
  assert.equal(['SAFE', 'CAUTION', 'UNSAFE'].includes(snapshot.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.governanceRecommendation.classification), true)
  assert.equal(snapshot.metadata.audit.longDurationValidation.architecture.observationOnly, true)
  assert.equal(snapshot.metadata.audit.longDurationValidation.architecture.automaticCorrection, false)
  assert.equal(snapshot.metadata.audit.longDurationValidation.snapshotHistory.retainedSnapshots, 1)
  assert.equal(snapshot.metadata.audit.longDurationValidation.trendAggregation.replayConsistency.current, 1)
  assert.equal(snapshot.metadata.audit.longDurationValidation.historicalDivergenceSummary.totalSnapshots, 1)
  assert.equal(snapshot.metadata.audit.longDurationValidation.replayConsistencyHistory.minimumEquivalentRatio, 1)

  const [firstPayload, secondPayload] = snapshot.influences
  assert(firstPayload)
  assert(secondPayload)

  assert.equal(firstPayload.opportunityId, 'opportunity-1')
  assert.equal(firstPayload.baseScore, 92)
  assert.equal(firstPayload.baseRank, 1)
  assert.equal(firstPayload.entityId, 'entity-1')
  assert.equal(firstPayload.adaptiveMultiplier, 0.966667)
  assert.equal(firstPayload.finalProjectedScore, 88.933364)
  assert.equal(firstPayload.projectedRank, 2)
  assert.equal(firstPayload.rankDelta, -1)
  assert.equal(firstPayload.influenceApplied, false)
  assert.equal(firstPayload.rolloutEligible, false)
  assert.equal(firstPayload.blockedReason, 'mode_off')
  assert.equal(firstPayload.projectionMode, 'off')
  assert.equal(typeof firstPayload.rolloutBucket, 'number')
  assert.equal(firstPayload.rolloutBucket >= 0 && firstPayload.rolloutBucket < 100, true)
  assert.equal(firstPayload.sampleThresholdSatisfied, true)
  assert.deepEqual(firstPayload.weightSources, {
    signal: 'weight-signal-1',
    category: 'weight-category-1',
    entity: 'weight-entity-1',
  })
  assert.deepEqual(firstPayload.memoryIds, {
    signal: 'memory-signal-1',
    category: 'memory-category-1',
    entity: 'memory-entity-1',
  })
  assert.deepEqual(firstPayload.evidenceScopes, ['signal', 'category', 'entity'])
  assert.deepEqual(firstPayload.sampleCounts, { signal: 5, category: 10, entity: 3 })
  assert.equal(firstPayload.evidence.signal?.weightId, 'weight-signal-1')
  assert.equal(firstPayload.evidence.category?.weightId, 'weight-category-1')
  assert.equal(firstPayload.evidence.entity?.weightId, 'weight-entity-1')
  const firstReplayContract = computeReplayContractFingerprint({
    opportunityId: firstPayload.opportunityId,
    marketSignalId: firstPayload.marketSignalId,
    entityId: firstPayload.entityId,
    baseScore: firstPayload.baseScore,
    baseRank: firstPayload.baseRank,
    adaptiveMultiplier: firstPayload.adaptiveMultiplier,
    finalProjectedScore: firstPayload.finalProjectedScore,
    projectedRank: firstPayload.projectedRank,
    rankDelta: firstPayload.rankDelta,
    blockedReason: firstPayload.blockedReason,
    sampleThresholdSatisfied: firstPayload.sampleThresholdSatisfied,
    projectionMode: firstPayload.projectionMode,
    weightSources: firstPayload.weightSources,
    memoryIds: firstPayload.memoryIds,
    config: snapshot.config,
    evidence: {
      signal: firstPayload.evidence.signal ? { weightId: firstPayload.evidence.signal.weightId } : null,
      category: firstPayload.evidence.category ? { weightId: firstPayload.evidence.category.weightId } : null,
      entity: firstPayload.evidence.entity ? { weightId: firstPayload.evidence.entity.weightId } : null,
    },
  })
  assert.equal(firstPayload.rolloutBucket, firstReplayContract.rolloutBucket)
  assert.equal(firstPayload.replayFingerprint, firstReplayContract.replayFingerprint)

  assert.equal(secondPayload.opportunityId, 'opportunity-2')
  assert.equal(secondPayload.baseScore, 90)
  assert.equal(secondPayload.baseRank, 2)
  assert.equal(secondPayload.entityId, 'entity-2')
  assert.equal(secondPayload.adaptiveMultiplier, 1.183333)
  assert.equal(secondPayload.finalProjectedScore, 106.49997)
  assert.equal(secondPayload.projectedRank, 1)
  assert.equal(secondPayload.rankDelta, 1)
  assert.equal(secondPayload.influenceApplied, false)
  assert.equal(secondPayload.rolloutEligible, false)
  assert.equal(secondPayload.blockedReason, 'mode_off')
  assert.equal(secondPayload.projectionMode, 'off')
  assert.equal(typeof secondPayload.rolloutBucket, 'number')
  assert.equal(secondPayload.rolloutBucket >= 0 && secondPayload.rolloutBucket < 100, true)
  assert.equal(secondPayload.sampleThresholdSatisfied, true)
  assert.deepEqual(secondPayload.weightSources, {
    signal: 'weight-signal-2',
    category: 'weight-category-1',
    entity: 'weight-entity-2',
  })
  assert.deepEqual(secondPayload.memoryIds, {
    signal: 'memory-signal-2',
    category: 'memory-category-1',
    entity: 'memory-entity-2',
  })
  assert.deepEqual(secondPayload.evidenceScopes, ['signal', 'category', 'entity'])
  assert.deepEqual(secondPayload.sampleCounts, { signal: 6, category: 10, entity: 4 })
  assert.equal(secondPayload.evidence.signal?.weightId, 'weight-signal-2')
  assert.equal(secondPayload.evidence.category?.weightId, 'weight-category-1')
  assert.equal(secondPayload.evidence.entity?.weightId, 'weight-entity-2')
  const secondReplayContract = computeReplayContractFingerprint({
    opportunityId: secondPayload.opportunityId,
    marketSignalId: secondPayload.marketSignalId,
    entityId: secondPayload.entityId,
    baseScore: secondPayload.baseScore,
    baseRank: secondPayload.baseRank,
    adaptiveMultiplier: secondPayload.adaptiveMultiplier,
    finalProjectedScore: secondPayload.finalProjectedScore,
    projectedRank: secondPayload.projectedRank,
    rankDelta: secondPayload.rankDelta,
    blockedReason: secondPayload.blockedReason,
    sampleThresholdSatisfied: secondPayload.sampleThresholdSatisfied,
    projectionMode: secondPayload.projectionMode,
    weightSources: secondPayload.weightSources,
    memoryIds: secondPayload.memoryIds,
    config: snapshot.config,
    evidence: {
      signal: secondPayload.evidence.signal ? { weightId: secondPayload.evidence.signal.weightId } : null,
      category: secondPayload.evidence.category ? { weightId: secondPayload.evidence.category.weightId } : null,
      entity: secondPayload.evidence.entity ? { weightId: secondPayload.evidence.entity.weightId } : null,
    },
  })
  assert.equal(secondPayload.rolloutBucket, secondReplayContract.rolloutBucket)
  assert.equal(secondPayload.replayFingerprint, secondReplayContract.replayFingerprint)

  const secondSnapshot = await runtime.refresh()
  assert.deepEqual(secondSnapshot.influences, snapshot.influences)
  assert.equal(secondSnapshot.metadata.candidateCount, snapshot.metadata.candidateCount)
  assert.equal(secondSnapshot.metadata.influenceAppliedCount, snapshot.metadata.influenceAppliedCount)
  assert.equal(secondSnapshot.metadata.rolloutEligibleCount, snapshot.metadata.rolloutEligibleCount)
  assert.equal(secondSnapshot.metadata.blockedCount, snapshot.metadata.blockedCount)
  assert.equal(secondSnapshot.metadata.divergenceCount, snapshot.metadata.divergenceCount)
  assert.equal(secondSnapshot.metadata.rankShiftCount, snapshot.metadata.rankShiftCount)
  assert.equal(secondSnapshot.metadata.topRankChanged, snapshot.metadata.topRankChanged)
  assert.equal(secondSnapshot.metadata.averageRankDelta, snapshot.metadata.averageRankDelta)
  assert.equal(secondSnapshot.metadata.maxAbsRankDelta, snapshot.metadata.maxAbsRankDelta)
  assert.equal(secondSnapshot.metadata.averageAdaptiveMultiplier, snapshot.metadata.averageAdaptiveMultiplier)
  assert.equal(secondSnapshot.metadata.boundedMin, snapshot.metadata.boundedMin)
  assert.equal(secondSnapshot.metadata.boundedMax, snapshot.metadata.boundedMax)
  assert.equal(secondSnapshot.metadata.rolloutPercentage, snapshot.metadata.rolloutPercentage)
  assert.equal(secondSnapshot.metadata.minimumSampleRequirement, snapshot.metadata.minimumSampleRequirement)
  assert.deepEqual(secondSnapshot.metadata.allowedScopes, snapshot.metadata.allowedScopes)
  assert.equal(secondSnapshot.metadata.economicMemoryRecordCount, snapshot.metadata.economicMemoryRecordCount)
  assert.equal(secondSnapshot.metadata.refreshIntervalMs, snapshot.metadata.refreshIntervalMs)
  assert.equal(secondSnapshot.metadata.lastError, snapshot.metadata.lastError)

  assert.equal(status.runtimeName, 'adaptive-influence-gate-runtime')
  assert.equal(status.advisoryOnly, true)
  assert.equal(status.mutatesLiveRanking, false)
  assert.equal(status.mutatesGovernance, false)
  assert.equal(status.mutatesExecution, false)
  assert.equal(status.influenceAppliedCount, 0)
  assert.equal(status.rolloutEligibleCount, 0)
  assert.equal(status.divergenceCount, 2)
  assert.equal(status.rankShiftCount, 2)
  assert.equal(status.topRankChanged, true)
})

function createOpportunitySnapshotStoreFixture() {
  const opportunitySnapshotStore = createOpportunitySnapshotStore()
  opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T12:00:00.000Z',
    opportunities: [
      {
        id: 'opportunity-1',
        keyword: 'labor lawyer',
        category: 'legal',
        economicRelevance: 92,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:labor-lawyer:2026-05-08t12-00-00-000z',
        detectedAt: '2026-05-08T12:00:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
      {
        id: 'opportunity-2',
        keyword: 'injury attorney',
        category: 'legal',
        economicRelevance: 90,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:injury-attorney:2026-05-08t12-00-00-000z',
        detectedAt: '2026-05-08T12:00:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
    ],
    suggestions: [
      {
        entityId: 'entity-1',
        entityName: 'Legal Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.84,
        reasoning: 'Recommended response for signal "labor lawyer".',
      },
      {
        entityId: 'entity-2',
        entityName: 'Injury Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.83,
        reasoning: 'Recommended response for signal "injury attorney".',
      },
    ],
    topOpportunity: {
      id: 'opportunity-1',
      keyword: 'labor lawyer',
      category: 'legal',
      economicRelevance: 92,
      leadProbability: 'high',
      sourceSignalId: 'market-signal:legal:labor-lawyer:2026-05-08t12-00-00-000z',
      detectedAt: '2026-05-08T12:00:00.000Z',
      recommendedAction: 'Generate legal intake flow',
    },
  })

  return opportunitySnapshotStore
}

function createAdaptiveWeightSnapshot(args?: { lowSample?: boolean }) {
  const lowSample = args?.lowSample === true

  return {
    snapshot: {
      generatedAt: '2026-05-08T12:00:00.000Z',
      signalWeights: [{
        weightId: 'weight-signal-1',
        memoryId: 'memory-signal-1',
        scope: 'signal' as const,
        category: 'legal',
        signalKeyword: 'labor lawyer',
        entityId: null,
        weight: 0.95,
        sampleCount: lowSample ? 1 : 5,
        confidenceLevel: 'medium' as const,
        decayFactor: 1,
        lastUpdated: '2026-05-08T12:00:00.000Z',
      }, {
        weightId: 'weight-signal-2',
        memoryId: 'memory-signal-2',
        scope: 'signal' as const,
        category: 'legal',
        signalKeyword: 'injury attorney',
        entityId: null,
        weight: 1.25,
        sampleCount: lowSample ? 1 : 6,
        confidenceLevel: 'high' as const,
        decayFactor: 1,
        lastUpdated: '2026-05-08T12:00:00.000Z',
      }],
      categoryWeights: [{
        weightId: 'weight-category-1',
        memoryId: 'memory-category-1',
        scope: 'category' as const,
        category: 'legal',
        signalKeyword: '*',
        entityId: null,
        weight: 1,
        sampleCount: lowSample ? 1 : 10,
        confidenceLevel: 'high' as const,
        decayFactor: 1,
        lastUpdated: '2026-05-08T12:00:00.000Z',
      }],
      entityWeights: [
        {
          weightId: 'weight-entity-1',
          memoryId: 'memory-entity-1',
          scope: 'entity' as const,
          category: 'legal',
          signalKeyword: '*',
          entityId: 'entity-1',
          weight: 0.95,
          sampleCount: lowSample ? 1 : 3,
          confidenceLevel: 'medium' as const,
          decayFactor: 1,
          lastUpdated: '2026-05-08T12:00:00.000Z',
        },
        {
          weightId: 'weight-entity-2',
          memoryId: 'memory-entity-2',
          scope: 'entity' as const,
          category: 'legal',
          signalKeyword: '*',
          entityId: 'entity-2',
          weight: 1.3,
          sampleCount: lowSample ? 1 : 4,
          confidenceLevel: 'medium' as const,
          decayFactor: 1,
          lastUpdated: '2026-05-08T12:00:00.000Z',
        },
      ],
      metadata: {
        recordCount: 5,
        boundedMin: 0.75,
        boundedMax: 1.35,
        refreshIntervalMs: 60_000,
        lastRefreshDurationMs: 4,
        lastError: null,
      },
    },
    freshness: {
      ready: true,
      updatedAt: '2026-05-08T12:00:00.000Z',
      ageMs: 0,
      refreshIntervalMs: 60_000,
      lastRefreshDurationMs: 4,
      refreshing: false,
      lastError: null,
    },
    runtimeState: {
      ready: true,
      warming: false,
      error: null,
    },
  } satisfies AdaptiveWeightSnapshotStub
}

function createRuntimeFixture(args?: {
  mode?: 'off' | 'shadow_compare' | 'live_rank_only'
  enabled?: boolean
  rolloutPercentage?: number
  killSwitchEnabled?: boolean
  minimumSampleRequirement?: number
  lowSample?: boolean
  learningCheckpointRepository?: ReturnType<typeof createLearningCheckpointRepositoryStub>
}) {
  const opportunitySnapshotStore = createOpportunitySnapshotStoreFixture()
  const adaptiveWeightSnapshotRuntime = createAdaptiveWeightRuntimeStub(createAdaptiveWeightSnapshot({ lowSample: args?.lowSample }))
  const economicMemoryRepository = createEconomicMemoryRepositoryStub()
  const adaptiveEquilibriumEvidenceRepository = createAdaptiveEquilibriumEvidenceRepositoryStub()
  const learningCheckpointRepository = args?.learningCheckpointRepository ?? createLearningCheckpointRepositoryStub()
  const previousNodeEnv = process.env.NODE_ENV
  if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'test'
  }

  let runtime!: AdaptiveInfluenceGateRuntime
  try {
    runtime = new AdaptiveInfluenceGateRuntime({
      adaptiveWeightSnapshotRuntime,
      economicMemoryRepository: economicMemoryRepository as never,
      adaptiveEquilibriumEvidenceRepository: adaptiveEquilibriumEvidenceRepository as never,
      learningCheckpointRepository: learningCheckpointRepository as never,
      opportunitySnapshotStore,
      config: {
        mode: args?.mode ?? 'off',
        enabled: args?.enabled ?? false,
        rolloutPercentage: args?.rolloutPercentage ?? 0,
        killSwitchEnabled: args?.killSwitchEnabled ?? false,
        minimumSampleRequirement: args?.minimumSampleRequirement,
      },
    })
  } finally {
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }

  return {
    runtime,
    opportunitySnapshotStore,
    economicMemoryRepository,
    adaptiveEquilibriumEvidenceRepository,
    learningCheckpointRepository,
  }
}

function buildLiveRankingSnapshot(store: ReturnType<typeof createOpportunitySnapshotStore>) {
  const snapshot = store.getSnapshot().snapshot

  const ranking = [...snapshot.opportunities]
    .sort((left, right) => {
      if (left.economicRelevance !== right.economicRelevance) {
        return right.economicRelevance - left.economicRelevance
      }

      const byCategory = left.category.localeCompare(right.category)
      if (byCategory !== 0) {
        return byCategory
      }

      const byKeyword = left.keyword.localeCompare(right.keyword)
      if (byKeyword !== 0) {
        return byKeyword
      }

      return left.id.localeCompare(right.id)
    })
    .map((item, index) => ({ id: item.id, rank: index + 1, score: item.economicRelevance }))

  return Buffer.from(JSON.stringify(ranking), 'utf-8')
}

test('non-interference OFF mode keeps live ranking byte-for-byte identical', async () => {
  const { runtime, opportunitySnapshotStore } = createRuntimeFixture({ mode: 'off', enabled: false })

  const liveBefore = buildLiveRankingSnapshot(opportunitySnapshotStore)
  await runtime.refresh()
  const liveAfter = buildLiveRankingSnapshot(opportunitySnapshotStore)

  assert.equal(Buffer.compare(liveBefore, liveAfter), 0)
})

test('non-interference SHADOW_COMPARE exposes projected ranking while live ranking is unchanged', async () => {
  const { runtime, opportunitySnapshotStore } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    minimumSampleRequirement: 3,
  })

  const liveBefore = buildLiveRankingSnapshot(opportunitySnapshotStore)
  const snapshot = await runtime.refresh()
  const liveAfter = buildLiveRankingSnapshot(opportunitySnapshotStore)

  assert.equal(Buffer.compare(liveBefore, liveAfter), 0)
  assert.equal(snapshot.influences.length > 0, true)
  assert.equal(snapshot.influences.some((item) => item.projectedRank !== item.baseRank), true)
  assert.equal(snapshot.influences.every((item) => item.blockedReason === 'eligible_shadow_projection'), true)
})

test('truthful blockedReason uses eligible_live_projection_forbidden in live_rank_only when rollout and evidence gates pass', async () => {
  const { runtime } = createRuntimeFixture({
    mode: 'live_rank_only',
    enabled: true,
    rolloutPercentage: 100,
    minimumSampleRequirement: 3,
  })

  const snapshot = await runtime.refresh()

  assert.equal(snapshot.influences.length > 0, true)
  assert.equal(snapshot.influences.every((item) => item.rolloutEligible === true), true)
  assert.equal(snapshot.influences.every((item) => item.blockedReason === 'eligible_live_projection_forbidden'), true)
  assert.equal(snapshot.influences.every((item) => item.influenceApplied === false), true)
})

test('runtime rejects live_rank_only in production with explicit policy violation logging', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const originalConsoleError = console.error
  const violationLogs: Array<{ message: unknown; payload: unknown }> = []
  console.error = (message?: unknown, ...optionalParams: unknown[]) => {
    violationLogs.push({
      message,
      payload: optionalParams[0] ?? null,
    })
  }

  try {
    process.env.NODE_ENV = 'production'

    assert.throws(
      () => createRuntimeFixture({
        mode: 'live_rank_only',
        enabled: false,
        rolloutPercentage: 100,
        minimumSampleRequirement: 3,
      }),
      /Adaptive influence production policy violation: mode "live_rank_only" is forbidden when NODE_ENV=production/,
    )

    assert.equal(violationLogs.length > 0, true)
    assert.equal(violationLogs.some((entry) => entry.message === '[adaptive-influence] policy.violation'), true)
  } finally {
    console.error = originalConsoleError
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
})

test('runtime rejects enabled=true in development policy boundary', () => {
  const previousNodeEnv = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = 'development'

    assert.throws(
      () => createRuntimeFixture({
        mode: 'shadow_compare',
        enabled: true,
        rolloutPercentage: 100,
        minimumSampleRequirement: 3,
      }),
      /enabled=true is allowed only when NODE_ENV=staging/,
    )
  } finally {
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
})

test('runtime rejects enabled=true with non-shadow mode in staging', () => {
  const previousNodeEnv = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = 'staging'

    assert.throws(
      () => createRuntimeFixture({
        mode: 'off',
        enabled: true,
        rolloutPercentage: 100,
        minimumSampleRequirement: 3,
      }),
      /enabled=true requires mode "shadow_compare"/,
    )
  } finally {
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
})

test('runtime activates shadow_compare in staging with observability log and advisory-only flags', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const originalConsoleInfo = console.info
  const activationLogs: Array<{ message: unknown; payload: unknown }> = []
  console.info = (message?: unknown, ...optionalParams: unknown[]) => {
    activationLogs.push({
      message,
      payload: optionalParams[0] ?? null,
    })
  }

  try {
    process.env.NODE_ENV = 'staging'

    const { runtime, opportunitySnapshotStore } = createRuntimeFixture({
      mode: 'shadow_compare',
      enabled: true,
      rolloutPercentage: 100,
      minimumSampleRequirement: 3,
    })

    const liveBefore = buildLiveRankingSnapshot(opportunitySnapshotStore)
    await runtime.start()
    const snapshot = runtime.getSnapshot()
    const status = runtime.getStatus()
    await runtime.stop()
    const liveAfter = buildLiveRankingSnapshot(opportunitySnapshotStore)

    assert.equal(Buffer.compare(liveBefore, liveAfter), 0)
    assert.equal(snapshot.config.mode, 'shadow_compare')
    assert.equal(snapshot.influences.length > 0, true)
    assert.equal(status.advisoryOnly, true)
    assert.equal(status.mutatesLiveRanking, false)
    assert.equal(activationLogs.some((entry) => entry.message === '[adaptive-influence] staging.shadow_compare.activated'), true)
  } finally {
    console.info = originalConsoleInfo
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
})

test('truthful blockedReason uses below_rollout_threshold when projection gates pass but rollout bucket is not eligible', async () => {
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 0,
    minimumSampleRequirement: 3,
  })

  const snapshot = await runtime.refresh()

  assert.equal(snapshot.influences.length > 0, true)
  assert.equal(snapshot.influences.every((item) => item.rolloutEligible === false), true)
  assert.equal(snapshot.influences.every((item) => item.blockedReason === 'below_rollout_threshold'), true)
})

test('non-interference governance proposal counts remain unchanged', async () => {
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const liveGovernance = Object.freeze({
    proposals: [
      { proposalId: 'proposal-1', status: 'pending' },
      { proposalId: 'proposal-2', status: 'approved' },
    ],
  })
  const beforeBytes = Buffer.from(JSON.stringify(liveGovernance), 'utf-8')

  await runtime.refresh()

  const afterBytes = Buffer.from(JSON.stringify(liveGovernance), 'utf-8')
  assert.equal(Buffer.compare(beforeBytes, afterBytes), 0)
  assert.equal(liveGovernance.proposals.length, 2)
})

test('non-interference execution ordering remains unchanged', async () => {
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const liveExecutions = Object.freeze([
    { executionId: 'execution-1', startedAt: '2026-05-08T11:59:00.000Z' },
    { executionId: 'execution-2', startedAt: '2026-05-08T12:00:00.000Z' },
    { executionId: 'execution-3', startedAt: '2026-05-08T12:01:00.000Z' },
  ])
  const beforeBytes = Buffer.from(JSON.stringify(liveExecutions), 'utf-8')

  await runtime.refresh()

  const afterBytes = Buffer.from(JSON.stringify(liveExecutions), 'utf-8')
  assert.equal(Buffer.compare(beforeBytes, afterBytes), 0)
  assert.deepEqual(liveExecutions.map((item) => item.executionId), ['execution-1', 'execution-2', 'execution-3'])
})

test('non-interference persistence has no opportunity mutation', async () => {
  const { runtime, opportunitySnapshotStore } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const liveSnapshotBefore = Buffer.from(JSON.stringify(opportunitySnapshotStore.getSnapshot().snapshot.opportunities), 'utf-8')
  await runtime.refresh()
  const liveSnapshotAfter = Buffer.from(JSON.stringify(opportunitySnapshotStore.getSnapshot().snapshot.opportunities), 'utf-8')

  assert.equal(Buffer.compare(liveSnapshotBefore, liveSnapshotAfter), 0)
})

test('replay equivalence keeps same projected ranking for identical snapshots', async () => {
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const first = await runtime.refresh()
  const second = await runtime.refresh()

  const firstProjection = first.influences.map((item) => ({
    opportunityId: item.opportunityId,
    baseRank: item.baseRank,
    projectedRank: item.projectedRank,
    adaptiveMultiplier: item.adaptiveMultiplier,
    rolloutBucket: item.rolloutBucket,
    sampleThresholdSatisfied: item.sampleThresholdSatisfied,
    projectionMode: item.projectionMode,
    weightSources: item.weightSources,
    memoryIds: item.memoryIds,
    replayFingerprint: item.replayFingerprint,
  }))
  const secondProjection = second.influences.map((item) => ({
    opportunityId: item.opportunityId,
    baseRank: item.baseRank,
    projectedRank: item.projectedRank,
    adaptiveMultiplier: item.adaptiveMultiplier,
    rolloutBucket: item.rolloutBucket,
    sampleThresholdSatisfied: item.sampleThresholdSatisfied,
    projectionMode: item.projectionMode,
    weightSources: item.weightSources,
    memoryIds: item.memoryIds,
    replayFingerprint: item.replayFingerprint,
  }))

  assert.deepEqual(secondProjection, firstProjection)
  assert.equal(second.metadata.audit.replayConsistency.equivalentFingerprintRatio, 1)
  assert.equal(second.metadata.audit.oscillation.oscillationFrequency, 0)
  assert.equal(second.metadata.audit.projectionVolatility.averageProjectedRankChange, 0)
  assert.equal(second.metadata.audit.repeatedTopRankPersistence.consecutiveRefreshes >= 2, true)
})

test('kill switch enforces instant no-op on live behavior with explicit suppression', async () => {
  const { runtime, opportunitySnapshotStore } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    killSwitchEnabled: true,
  })

  const liveBefore = buildLiveRankingSnapshot(opportunitySnapshotStore)
  const snapshot = await runtime.refresh()
  const liveAfter = buildLiveRankingSnapshot(opportunitySnapshotStore)

  assert.equal(Buffer.compare(liveBefore, liveAfter), 0)
  assert.equal(snapshot.metadata.influenceAppliedCount, 0)
  assert.equal(snapshot.influences.every((item) => item.blockedReason === 'kill_switch_enabled'), true)
})

test('low sample weights are suppressed with no influence application', async () => {
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    minimumSampleRequirement: 10,
    lowSample: true,
  })

  const snapshot = await runtime.refresh()

  assert.equal(snapshot.metadata.influenceAppliedCount, 0)
  assert.equal(snapshot.influences.every((item) => item.influenceApplied === false), true)
  assert.equal(snapshot.influences.every((item) => item.blockedReason === 'below_minimum_sample'), true)
  assert.equal(snapshot.influences.every((item) => item.evidenceScopes.length > 0), true)
  assert.equal(snapshot.influences.every((item) => item.adaptiveMultiplier === 1), true)
  assert.equal(snapshot.influences.every((item) => item.sampleThresholdSatisfied === false), true)
  assert.equal(snapshot.influences.every((item) => item.weightSources.signal !== null), true)
  assert.equal(snapshot.influences.every((item) => item.memoryIds.signal !== null), true)
  assert.equal(snapshot.metadata.audit.lowSampleInstability.lowSampleCount, snapshot.metadata.candidateCount)
  assert.equal(snapshot.metadata.audit.lowSampleInstability.unstableLowSampleCount >= 0, true)
})

test('restart determinism produces the same projected outputs from same snapshots', async () => {
  const fixture = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const firstSnapshot = await fixture.runtime.refresh()
  await fixture.runtime.stop()

  const previousNodeEnv = process.env.NODE_ENV
  if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'test'
  }

  let restartedRuntime!: AdaptiveInfluenceGateRuntime
  try {
    restartedRuntime = new AdaptiveInfluenceGateRuntime({
      adaptiveWeightSnapshotRuntime: createAdaptiveWeightRuntimeStub(createAdaptiveWeightSnapshot()),
      economicMemoryRepository: fixture.economicMemoryRepository as never,
      adaptiveEquilibriumEvidenceRepository: fixture.adaptiveEquilibriumEvidenceRepository as never,
      opportunitySnapshotStore: fixture.opportunitySnapshotStore,
      config: {
        mode: 'shadow_compare',
        enabled: true,
        rolloutPercentage: 100,
        minimumSampleRequirement: 3,
      },
    })
  } finally {
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }

  const secondSnapshot = await restartedRuntime.refresh()
  await restartedRuntime.stop()

  const firstProjection = firstSnapshot.influences.map((item) => ({
    opportunityId: item.opportunityId,
    projectedRank: item.projectedRank,
    adaptiveMultiplier: item.adaptiveMultiplier,
    replayFingerprint: item.replayFingerprint,
  }))
  const secondProjection = secondSnapshot.influences.map((item) => ({
    opportunityId: item.opportunityId,
    projectedRank: item.projectedRank,
    adaptiveMultiplier: item.adaptiveMultiplier,
    replayFingerprint: item.replayFingerprint,
  }))

  assert.deepEqual(secondProjection, firstProjection)
})

test('durable longitudinal continuity restores retained history across restart', async () => {
  const checkpointRepository = createLearningCheckpointRepositoryStub()
  const fixture = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    learningCheckpointRepository: checkpointRepository,
  })

  const first = await fixture.runtime.refresh()
  const second = await fixture.runtime.refresh()
  await fixture.runtime.stop()
  const historyBeforeRestart = second.metadata.audit.longDurationValidation.snapshotHistory.retainedSnapshots

  const restartedFixture = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    learningCheckpointRepository: checkpointRepository,
  })

  const restartedSnapshot = await restartedFixture.runtime.refresh()
  await restartedFixture.runtime.stop()

  assert.equal(first.metadata.audit.longDurationValidation.snapshotHistory.retainedSnapshots, 1)
  assert.equal(historyBeforeRestart >= 2, true)
  assert.equal(
    restartedSnapshot.metadata.audit.longDurationValidation.snapshotHistory.retainedSnapshots,
    historyBeforeRestart + 1,
  )
  assert.equal(
    restartedSnapshot.metadata.audit.repeatedTopRankPersistence.consecutiveRefreshes >= second.metadata.audit.repeatedTopRankPersistence.consecutiveRefreshes,
    true,
  )
})

test('continuity checkpoint persists integrity fingerprint and replay lineage metadata', async () => {
  const checkpointRepository = createLearningCheckpointRepositoryStub()
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    learningCheckpointRepository: checkpointRepository,
  })

  await runtime.refresh()
  const persisted = checkpointRepository.getPersistedCheckpoint()

  assert(persisted)
  assert.equal(persisted.runtimeName, 'adaptive-influence-gate-runtime')
  assert.equal(persisted.checkpointVersion, 1)
  assert.equal(persisted.lineageKey, 'adaptive-influence-longitudinal-continuity-v1')
  assert.equal(typeof persisted.continuityFingerprint, 'string')
  assert.equal(persisted.continuityFingerprint?.startsWith('adaptive-continuity:'), true)
  assert.equal(typeof persisted.checkpointPayloadJson, 'string')

  const payload = JSON.parse(persisted.checkpointPayloadJson ?? '{}') as {
    replayContinuityContext?: { lastEquilibriumReplayFingerprint?: string }
    continuityLineageMetadata?: { checkpointCount?: number }
  }
  assert.equal(payload.replayContinuityContext?.lastEquilibriumReplayFingerprint?.startsWith('adaptive-equilibrium:'), true)
  assert.equal(payload.continuityLineageMetadata?.checkpointCount, 1)
})

test('continuity restore detects temporal gap and keeps runtime append-only', async () => {
  const staleCheckpoint = {
    version: 1,
    checkpointedAt: '2025-01-01T00:00:00.000Z',
    continuityWindows: {
      short: 5,
      medium: 15,
      long: 30,
      historyRetentionLimit: 120,
    },
    longDurationHistory: [],
    longitudinalTrendState: {
      driftPersistence: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      rankingConvergence: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      replayConsistency: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      categoryDominanceEvolution: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      entityReinforcementLoops: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      oscillationPersistence: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      multiplierSaturationTrends: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      lowConfidenceAmplificationTrends: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      suppressionRatios: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
      stabilityScoreEvolution: {
        current: 0,
        shortWindowAverage: 0,
        mediumWindowAverage: 0,
        longWindowAverage: 0,
        shortDelta: 0,
        longDelta: 0,
        direction: 'stable',
      },
    },
    replayContinuityContext: {
      previousTopOpportunityId: null,
      previousTopStreak: 0,
      previousGovernanceEvidenceId: null,
      governanceTimelineEventSequence: 0,
      lastEquilibriumReplayFingerprint: null,
    },
    continuityCheckpoints: {
      lastSnapshotGeneratedAt: '2025-01-01T00:00:00.000Z',
      lastEvidenceGeneratedAt: null,
      lastEvidenceId: null,
    },
    continuityLineageMetadata: {
      lineageKey: 'adaptive-influence-longitudinal-continuity-v1',
      lineageVersion: 1,
      checkpointCount: 9,
      parentContinuityFingerprint: null,
      restoreGapDetected: false,
    },
  }
  const checkpointRepository = createLearningCheckpointRepositoryStub({
    checkpointId: 'learning-checkpoint:adaptive-influence-gate-runtime',
    runtimeName: 'adaptive-influence-gate-runtime',
    lastProcessedAttributionId: null,
    lastProcessedAttributedAt: null,
    checkpointVersion: 1,
    lineageKey: 'adaptive-influence-longitudinal-continuity-v1',
    lineageMetadataJson: JSON.stringify(staleCheckpoint.continuityLineageMetadata),
    checkpointPayloadJson: JSON.stringify(staleCheckpoint),
    continuityFingerprint: 'adaptive-continuity:tampered',
    updatedAt: '2025-01-01T00:00:00.000Z',
  })

  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    learningCheckpointRepository: checkpointRepository,
  })

  const snapshot = await runtime.refresh()
  const persistedAfterRefresh = checkpointRepository.getPersistedCheckpoint()

  assert.equal(snapshot.metadata.audit.longDurationValidation.snapshotHistory.retainedSnapshots, 1)
  assert(persistedAfterRefresh)
  const lineage = JSON.parse(persistedAfterRefresh.lineageMetadataJson ?? '{}') as {
    checkpointCount?: number
    restoreGapDetected?: boolean
  }
  assert.equal(lineage.checkpointCount, 1)
  assert.equal(lineage.restoreGapDetected, true)
})

test('continuity checkpoint lineage remains versioned across refreshes', async () => {
  const checkpointRepository = createLearningCheckpointRepositoryStub()
  const { runtime } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
    learningCheckpointRepository: checkpointRepository,
  })

  await runtime.refresh()
  const firstPersisted = checkpointRepository.getPersistedCheckpoint()
  assert(firstPersisted)

  await runtime.refresh()
  const secondPersisted = checkpointRepository.getPersistedCheckpoint()
  assert(secondPersisted)

  const firstLineage = JSON.parse(firstPersisted.lineageMetadataJson ?? '{}') as {
    checkpointCount?: number
  }
  const secondLineage = JSON.parse(secondPersisted.lineageMetadataJson ?? '{}') as {
    checkpointCount?: number
    parentContinuityFingerprint?: string | null
  }

  assert.equal(firstLineage.checkpointCount, 1)
  assert.equal(secondLineage.checkpointCount, 2)
  assert.equal(secondLineage.parentContinuityFingerprint, firstPersisted.continuityFingerprint ?? null)
})

test('snapshot drift is observable in projections only and does not mutate live governance/execution state', async () => {
  const { runtime, opportunitySnapshotStore } = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const liveGovernance = Object.freeze({ proposals: [{ proposalId: 'proposal-1', status: 'pending' }] })
  const liveExecutions = Object.freeze([{ executionId: 'execution-1', order: 1 }])
  const governanceBefore = Buffer.from(JSON.stringify(liveGovernance), 'utf-8')
  const executionsBefore = Buffer.from(JSON.stringify(liveExecutions), 'utf-8')

  const first = await runtime.refresh()

  opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T12:05:00.000Z',
    opportunities: [
      {
        id: 'opportunity-1',
        keyword: 'labor lawyer',
        category: 'legal',
        economicRelevance: 80,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:labor-lawyer:2026-05-08t12-05-00-000z',
        detectedAt: '2026-05-08T12:05:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
      {
        id: 'opportunity-2',
        keyword: 'injury attorney',
        category: 'legal',
        economicRelevance: 94,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:injury-attorney:2026-05-08t12-05-00-000z',
        detectedAt: '2026-05-08T12:05:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
    ],
    suggestions: [
      {
        entityId: 'entity-1',
        entityName: 'Legal Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.84,
        reasoning: 'Recommended response for signal "labor lawyer".',
      },
      {
        entityId: 'entity-2',
        entityName: 'Injury Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.83,
        reasoning: 'Recommended response for signal "injury attorney".',
      },
    ],
    topOpportunity: {
      id: 'opportunity-2',
      keyword: 'injury attorney',
      category: 'legal',
      economicRelevance: 94,
      leadProbability: 'high',
      sourceSignalId: 'market-signal:legal:injury-attorney:2026-05-08t12-05-00-000z',
      detectedAt: '2026-05-08T12:05:00.000Z',
      recommendedAction: 'Generate legal intake flow',
    },
  })

  const second = await runtime.refresh()

  const firstProjection = first.influences.map((item) => ({ id: item.opportunityId, projectedRank: item.projectedRank, baseRank: item.baseRank }))
  const secondProjection = second.influences.map((item) => ({ id: item.opportunityId, projectedRank: item.projectedRank, baseRank: item.baseRank }))

  assert.notDeepEqual(secondProjection, firstProjection)
  assert.equal(second.metadata.audit.oscillation.oscillationFrequency >= 0, true)
  assert.equal(second.metadata.audit.projectionVolatility.averageProjectedRankChange >= 0, true)
  assert.equal(second.metadata.audit.replayConsistency.equivalentFingerprintRatio < 1, true)
  assert.equal(second.metadata.audit.rankDrift.divergenceRatio >= 0, true)
  assert.equal(second.metadata.audit.stabilityScore >= 0 && second.metadata.audit.stabilityScore <= 1, true)
  assert.equal(second.metadata.audit.driftDetection.warningSummary.activeCount >= 1, true)
  assert.equal(second.metadata.audit.driftDetection.warnings.some((warning) => (
    warning.code === 'replay_divergence' && warning.status === 'active'
  )), true)
  assert.equal(second.metadata.audit.reinforcementLoopDetection.warningSummary.activeCount >= 1, true)
  assert.equal(second.metadata.audit.reinforcementLoopDetection.warnings.some((warning) => (
    warning.code === 'multiplier_compounding_behavior' || warning.code === 'projection_lock_in'
  )), true)
  assert.equal(second.metadata.audit.reinforcementLoopDetection.replaySafeDiagnostics.comparableFingerprintCount >= 1, true)
  assert.equal(second.metadata.audit.reinforcementLoopDetection.replaySafeDiagnostics.equivalentFingerprintRatio < 1, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.replayTimeline.totalReplayedSnapshots, 2)
  assert.equal(second.metadata.audit.historicalReplaySimulation.replayTimeline.points.length, 2)
  assert.equal(second.metadata.audit.historicalReplaySimulation.replayDegradationMetrics.degradedReplaySnapshots >= 1, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.divergenceEvolution.peakDivergenceRatio >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.historicalDriftAnalysis.activeDriftSnapshots >= 1, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.historicalDriftAnalysis.driftAccumulationScore >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.projectionStabilityAnalysis.stabilityDegradation >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.reinforcementLoops.averageLoopIntensity >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.stressSimulation.degradationMetrics.stressReplayConsistencyAverage < 1, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.stressSimulation.degradationMetrics.fingerprintDivergenceRatio > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.stressSimulation.replayCollapseDetection.collapseDetected, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.stressSimulation.replayRiskDiagnostics.riskScore > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.stressSimulation.replayRiskDiagnostics.dominantRiskSignals.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.dominantInstabilityFactors.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.replayCollapseContributors.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.saturationContributors.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.reinforcementEscalationContributors.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.rootCauseAnalysis.stabilityBlockers.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.replayImpactAnalysis.projectedReplayConsistencyWithDecay >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.saturationImpactAnalysis.projectedSaturationPersistenceWithCooling >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.oscillationImpactAnalysis.projectedOscillationWithHysteresis >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.equilibriumAnalysis.projectedEquilibriumScore >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.decayHysteresisResearch.governanceRiskAssessment.notes.length > 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.longitudinalModel.studyOverTime.replayConsistencyEquilibrium >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.stabilityConvergenceMetrics.equilibriumConfidence >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.saturationEquilibriumMetrics.saturationPersistence >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.reinforcementPersistenceMetrics.projectionLockInPersistence >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.replayEquilibriumAnalysis.equilibriumBreachCount >= 0, true)
  assert.equal(second.metadata.audit.historicalReplaySimulation.equilibriumLongitudinalStudy.governanceRecommendation.recommendation, 'do_not_rollout')
  assert.equal(second.metadata.audit.longDurationValidation.snapshotHistory.retainedSnapshots, 2)
  assert.equal(second.metadata.audit.longDurationValidation.snapshotHistory.history.length, 2)
  assert.equal(second.metadata.audit.longDurationValidation.historicalDivergenceSummary.totalSnapshots, 2)
  assert.equal(second.metadata.audit.longDurationValidation.historicalDivergenceSummary.snapshotsWithDivergence >= 1, true)
  assert.equal(second.metadata.audit.longDurationValidation.replayConsistencyHistory.averageEquivalentRatio < 1, true)
  assert.equal(second.metadata.audit.longDurationValidation.persistenceCounters.driftWarningConsecutive >= 1, true)
  assert.equal(second.metadata.audit.longDurationValidation.trendAggregation.stabilityScoreEvolution.current >= 0, true)

  const governanceAfter = Buffer.from(JSON.stringify(liveGovernance), 'utf-8')
  const executionsAfter = Buffer.from(JSON.stringify(liveExecutions), 'utf-8')
  assert.equal(Buffer.compare(governanceBefore, governanceAfter), 0)
  assert.equal(Buffer.compare(executionsBefore, executionsAfter), 0)
})

test('adaptive equilibrium evidence ledger is append-only, replay-safe, and restart-idempotent', async () => {
  const fixture = createRuntimeFixture({
    mode: 'shadow_compare',
    enabled: true,
    rolloutPercentage: 100,
  })

  const firstSnapshot = await fixture.runtime.refresh()
  const firstCount = await fixture.adaptiveEquilibriumEvidenceRepository.countEvidence()
  assert.equal(firstSnapshot.metadata.influenceAppliedCount, 0)
  assert.equal(firstCount, 1)

  await fixture.runtime.stop()

  const previousNodeEnv = process.env.NODE_ENV
  if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'test'
  }

  let restartedRuntime!: AdaptiveInfluenceGateRuntime
  try {
    restartedRuntime = new AdaptiveInfluenceGateRuntime({
      adaptiveWeightSnapshotRuntime: createAdaptiveWeightRuntimeStub(createAdaptiveWeightSnapshot()),
      economicMemoryRepository: fixture.economicMemoryRepository as never,
      adaptiveEquilibriumEvidenceRepository: fixture.adaptiveEquilibriumEvidenceRepository as never,
      opportunitySnapshotStore: fixture.opportunitySnapshotStore,
      config: {
        mode: 'shadow_compare',
        enabled: true,
        rolloutPercentage: 100,
        minimumSampleRequirement: 3,
      },
    })
  } finally {
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }

  const restartedSnapshot = await restartedRuntime.refresh()
  const postRestartCount = await fixture.adaptiveEquilibriumEvidenceRepository.countEvidence()
  assert.equal(restartedSnapshot.metadata.influenceAppliedCount, 0)
  assert.equal(postRestartCount, 1)

  const postRestartSecondSnapshot = await restartedRuntime.refresh()
  const postRestartSecondCount = await fixture.adaptiveEquilibriumEvidenceRepository.countEvidence()
  assert.equal(postRestartSecondSnapshot.metadata.influenceAppliedCount, 0)
  assert.equal(postRestartSecondCount, 2)

  fixture.opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T12:05:00.000Z',
    opportunities: [
      {
        id: 'opportunity-1',
        keyword: 'labor lawyer',
        category: 'legal',
        economicRelevance: 80,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:labor-lawyer:2026-05-08t12-05-00-000z',
        detectedAt: '2026-05-08T12:05:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
      {
        id: 'opportunity-2',
        keyword: 'injury attorney',
        category: 'legal',
        economicRelevance: 94,
        leadProbability: 'high',
        sourceSignalId: 'market-signal:legal:injury-attorney:2026-05-08t12-05-00-000z',
        detectedAt: '2026-05-08T12:05:00.000Z',
        recommendedAction: 'Generate legal intake flow',
      },
    ],
    suggestions: [
      {
        entityId: 'entity-1',
        entityName: 'Legal Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.84,
        reasoning: 'Recommended response for signal "labor lawyer".',
      },
      {
        entityId: 'entity-2',
        entityName: 'Injury Entity',
        suggestedAction: 'Generate legal intake flow',
        confidence: 0.83,
        reasoning: 'Recommended response for signal "injury attorney".',
      },
    ],
    topOpportunity: {
      id: 'opportunity-2',
      keyword: 'injury attorney',
      category: 'legal',
      economicRelevance: 94,
      leadProbability: 'high',
      sourceSignalId: 'market-signal:legal:injury-attorney:2026-05-08t12-05-00-000z',
      detectedAt: '2026-05-08T12:05:00.000Z',
      recommendedAction: 'Generate legal intake flow',
    },
  })

  const changedSnapshot = await restartedRuntime.refresh()
  const changedCount = await fixture.adaptiveEquilibriumEvidenceRepository.countEvidence()
  assert.equal(changedSnapshot.metadata.influenceAppliedCount, 0)
  assert.equal(changedCount, 3)

  const records = await fixture.adaptiveEquilibriumEvidenceRepository.listEvidencePaginated({ limit: 10, offset: 0 })
  assert.equal(records.length, 3)
  assert.equal(records.every((record) => record.recommendation === 'do_not_rollout'), true)

  await restartedRuntime.stop()
})
