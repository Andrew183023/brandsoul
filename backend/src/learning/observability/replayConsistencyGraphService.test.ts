import assert from 'node:assert/strict'
import test from 'node:test'

import { createReplayConsistencyGraphService } from './replayConsistencyGraphService.js'
import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  replayConsistencyEquilibrium: number
  replayDegradationPersistence: number
  replayFingerprint: string
  governanceClassification?: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: args.replayConsistencyEquilibrium,
    replayDegradationPersistence: args.replayDegradationPersistence,
    replayFingerprint: args.replayFingerprint,
    governanceClassification: args.governanceClassification ?? 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    reinforcementEscalationPersistence: 0.31,
    saturationEquilibrium: 0.26,
    oscillationDamping: 0.72,
    projectionStabilityConvergence: 0.69,
    rankingDiversityPreservation: 0.59,
    entropyEvolution: 0.45,
    projectionLockInPersistence: 0.23,
    lowConfidenceAmplificationPersistence: 0.18,
    generatedAt: args.generatedAt,
    ...contractMetadata,
  }
}

test('replay consistency graph service builds deterministic replay-safe payload', async () => {
  const evidence = [
    buildEvidence({
      evidenceId: 'e-100',
      generatedAt: '2026-05-09T09:00:00.000Z',
      replayConsistencyEquilibrium: 0.88,
      replayDegradationPersistence: 0.17,
      replayFingerprint: 'fp-1',
      governanceClassification: 'SAFE',
    }),
    buildEvidence({
      evidenceId: 'e-101',
      generatedAt: '2026-05-09T10:00:00.000Z',
      replayConsistencyEquilibrium: 0.8,
      replayDegradationPersistence: 0.24,
      replayFingerprint: 'fp-2',
      governanceClassification: 'CAUTION',
    }),
    buildEvidence({
      evidenceId: 'e-102',
      generatedAt: '2026-05-09T11:00:00.000Z',
      replayConsistencyEquilibrium: 0.77,
      replayDegradationPersistence: 0.41,
      replayFingerprint: 'fp-2',
      governanceClassification: 'UNSAFE',
    }),
  ]

  const service = createReplayConsistencyGraphService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T12:00:00.000Z',
  })

  const first = await service.buildReplayGraphs({
    historyLimit: 50,
    rollingHours: [2, 6],
    replayConsistencyBucketCount: 5,
  })
  const second = await service.buildReplayGraphs({
    historyLimit: 50,
    rollingHours: [2, 6],
    replayConsistencyBucketCount: 5,
  })

  assert.equal(first.aggregationArchitecture.derivedOnly, true)
  assert.equal(first.aggregationArchitecture.replaySafe, true)
  assert.equal(first.aggregationArchitecture.deterministic, true)
  assert.equal(first.graph.timeSeries.length, 3)
  assert.equal(first.graph.rollingAverages.length, 2)
  assert.equal(first.graph.degradationDeltas.length, 3)
  assert.equal(first.graph.replayConsistencyBuckets.length, 5)
  assert.equal(first.graph.replayVariance.length, 6)
  assert.equal(first.graph.collapseSummary.totalCollapsedSamples, 1)
  assert.equal(first.epistemicConfidence.classification, 'HIGH_CONFIDENCE')
  assert.equal(first.epistemicConfidence.replaySummary.classification, 'HIGH_CONFIDENCE')
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.equal(first.compatibility.highestRiskClassification, 'FULLY_COMPATIBLE')
})

test('replay consistency graph fingerprint ignores request-time generatedAt but changes with evidence', async () => {
  const evidence = [
    buildEvidence({
      evidenceId: 'e-200',
      generatedAt: '2026-05-09T09:00:00.000Z',
      replayConsistencyEquilibrium: 0.88,
      replayDegradationPersistence: 0.17,
      replayFingerprint: 'fp-1',
      governanceClassification: 'SAFE',
    }),
    buildEvidence({
      evidenceId: 'e-201',
      generatedAt: '2026-05-09T10:00:00.000Z',
      replayConsistencyEquilibrium: 0.8,
      replayDegradationPersistence: 0.24,
      replayFingerprint: 'fp-2',
      governanceClassification: 'CAUTION',
    }),
    buildEvidence({
      evidenceId: 'e-202',
      generatedAt: '2026-05-09T11:00:00.000Z',
      replayConsistencyEquilibrium: 0.77,
      replayDegradationPersistence: 0.41,
      replayFingerprint: 'fp-2',
      governanceClassification: 'UNSAFE',
    }),
  ]

  const first = await createReplayConsistencyGraphService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T12:00:00.000Z',
  }).buildReplayGraphs({ historyLimit: 50, rollingHours: [2, 6], replayConsistencyBucketCount: 5 })

  const second = await createReplayConsistencyGraphService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T15:00:00.000Z',
  }).buildReplayGraphs({ historyLimit: 50, rollingHours: [2, 6], replayConsistencyBucketCount: 5 })

  const changedEvidence = [
    ...evidence.slice(0, -1),
    buildEvidence({
      evidenceId: 'e-202',
      generatedAt: '2026-05-09T11:00:00.000Z',
      replayConsistencyEquilibrium: 0.91,
      replayDegradationPersistence: 0.08,
      replayFingerprint: 'fp-3',
      governanceClassification: 'SAFE',
    }),
  ]

  const third = await createReplayConsistencyGraphService({
    listEvidenceChronological: async () => changedEvidence,
    now: () => '2026-05-09T16:00:00.000Z',
  }).buildReplayGraphs({ historyLimit: 50, rollingHours: [2, 6], replayConsistencyBucketCount: 5 })

  assert.notEqual(first.generatedAt, second.generatedAt)
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.deepEqual(first.graph.rollingAverages, second.graph.rollingAverages)
  assert.notEqual(first.payloadFingerprint, third.payloadFingerprint)
})
