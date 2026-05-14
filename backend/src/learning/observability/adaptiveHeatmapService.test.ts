import assert from 'node:assert/strict'
import test from 'node:test'

import { createAdaptiveHeatmapService } from './adaptiveHeatmapService.js'
import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  categoryScore: number
  entityScore: number
  replayDivergenceIntensityScore: number
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: 0.82,
    reinforcementEscalationPersistence: 0.34,
    saturationEquilibrium: 0.28,
    oscillationDamping: 0.69,
    projectionStabilityConvergence: 0.77,
    rankingDiversityPreservation: 0.54,
    entropyEvolution: 0.46,
    projectionLockInPersistence: 0.22,
    lowConfidenceAmplificationPersistence: 0.19,
    replayDegradationPersistence: 0.16,
    governanceClassification: 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: `fp:${args.evidenceId}`,
    generatedAt: args.generatedAt,
    heatmapSnapshot: {
      category: [
        {
          key: 'legal',
          label: 'legal',
          opportunityCount: 2,
          projectedShare: 0.6,
          projectedScoreShare: 0.65,
          averageAdaptiveWeight: 1.1,
          averageRankDominance: 0.8,
          concentrationScore: args.categoryScore,
        },
      ],
      entity: [
        {
          key: 'entity-1',
          label: 'entity-1',
          opportunityCount: 1,
          projectedShare: 0.4,
          projectedScoreShare: 0.5,
          averageAdaptiveWeight: 1.08,
          averageRankDominance: 0.9,
          concentrationScore: args.entityScore,
        },
      ],
      adaptiveScope: [
        {
          scope: 'signal',
          opportunityCount: 2,
          projectedShare: 0.6,
          averageAdaptiveWeight: 1.05,
          concentrationScore: 0.52,
        },
      ],
      rankingDistribution: [
        {
          rank: 1,
          opportunityId: 'opp-1',
          category: 'legal',
          entityId: 'entity-1',
          baseRank: 2,
          projectedRank: 1,
          rankDelta: 1,
          adaptiveWeight: 1.1,
          dominanceScore: 0.88,
        },
      ],
      replayDivergence: {
        divergenceRatio: 0.32,
        averageAbsRankDelta: 0.8,
        maxAbsRankDelta: 2,
        equivalentFingerprintRatio: 0.9,
        oscillationFrequency: 0.22,
        saturationRatio: 0.18,
        replayDivergenceIntensityScore: args.replayDivergenceIntensityScore,
      },
      summary: {
        candidateCount: 3,
        topCategoryKey: 'legal',
        topEntityKey: 'entity-1',
        rankingDominanceScore: 0.88,
        saturationIntensityScore: 0.31,
        reinforcementIntensityScore: 0.67,
        oscillationIntensityScore: 0.22,
      },
    },
    ...contractMetadata,
  }
}

test('adaptive heatmap service builds deterministic replay-safe hotspot payloads', async () => {
  const records = [
    buildEvidence({
      evidenceId: 'e-001',
      generatedAt: '2026-05-09T08:00:00.000Z',
      categoryScore: 0.58,
      entityScore: 0.49,
      replayDivergenceIntensityScore: 0.4,
    }),
    buildEvidence({
      evidenceId: 'e-002',
      generatedAt: '2026-05-09T09:00:00.000Z',
      categoryScore: 0.72,
      entityScore: 0.68,
      replayDivergenceIntensityScore: 0.52,
    }),
    buildEvidence({
      evidenceId: 'e-003',
      generatedAt: '2026-05-09T10:00:00.000Z',
      categoryScore: 0.87,
      entityScore: 0.73,
      replayDivergenceIntensityScore: 0.69,
    }),
  ]

  const service = createAdaptiveHeatmapService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-09T11:00:00.000Z',
  })

  const first = await service.buildHeatmaps({ historyLimit: 50, hotspotLimit: 10 })
  const second = await service.buildHeatmaps({ historyLimit: 50, hotspotLimit: 10 })

  assert.equal(first.aggregationArchitecture.observationOnly, true)
  assert.equal(first.aggregationArchitecture.longitudinalTracking, true)
  assert.equal(first.heatmaps.category.current[0]?.key, 'legal')
  assert.equal(first.heatmaps.entity.current[0]?.key, 'entity-1')
  assert.equal(first.heatmaps.replayDivergence.current?.replayDivergenceIntensityScore, 0.69)
  assert.equal(first.hotspots.current.some((hotspot) => hotspot.classification === 'critical'), true)
  assert.equal(first.hotspots.longitudinalTracking.some((track) => track.key === 'legal'), true)
  assert.equal(first.hotspots.longitudinalTracking.some((track) => track.key === 'replay_divergence'), true)
  assert.equal(first.observability.heatmapSnapshotCount, 3)
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.equal(first.compatibility.highestRiskClassification, 'FULLY_COMPATIBLE')
})

test('adaptive heatmap fingerprint ignores request-time generatedAt but changes with evidence', async () => {
  const records = [
    buildEvidence({
      evidenceId: 'e-101',
      generatedAt: '2026-05-09T08:00:00.000Z',
      categoryScore: 0.58,
      entityScore: 0.49,
      replayDivergenceIntensityScore: 0.4,
    }),
    buildEvidence({
      evidenceId: 'e-102',
      generatedAt: '2026-05-09T09:00:00.000Z',
      categoryScore: 0.72,
      entityScore: 0.68,
      replayDivergenceIntensityScore: 0.52,
    }),
  ]

  const first = await createAdaptiveHeatmapService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-09T11:00:00.000Z',
  }).buildHeatmaps({ historyLimit: 50, hotspotLimit: 10 })

  const second = await createAdaptiveHeatmapService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-09T14:00:00.000Z',
  }).buildHeatmaps({ historyLimit: 50, hotspotLimit: 10 })

  const changedRecords = [
    records[0],
    buildEvidence({
      evidenceId: 'e-102',
      generatedAt: '2026-05-09T09:00:00.000Z',
      categoryScore: 0.91,
      entityScore: 0.82,
      replayDivergenceIntensityScore: 0.74,
    }),
  ]

  const third = await createAdaptiveHeatmapService({
    listEvidenceChronological: async () => changedRecords,
    now: () => '2026-05-09T16:00:00.000Z',
  }).buildHeatmaps({ historyLimit: 50, hotspotLimit: 10 })

  assert.notEqual(first.generatedAt, second.generatedAt)
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.notEqual(first.payloadFingerprint, third.payloadFingerprint)
})
