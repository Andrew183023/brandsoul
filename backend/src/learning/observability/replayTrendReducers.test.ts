import assert from 'node:assert/strict'
import test from 'node:test'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'
import {
  reduceReplayCollapseSummary,
  reduceReplayConsistencyBuckets,
  reduceReplayDegradationDeltas,
  reduceReplayRollingAverages,
  reduceReplayTimeSeries,
  reduceReplayVariance,
} from './replayTrendReducers.js'

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  replayConsistencyEquilibrium: number
  replayDegradationPersistence: number
  reinforcementEscalationPersistence: number
  saturationEquilibrium: number
  oscillationDamping: number
  projectionLockInPersistence: number
  lowConfidenceAmplificationPersistence: number
  governanceClassification?: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
  replayFingerprint: string
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: args.replayConsistencyEquilibrium,
    replayDegradationPersistence: args.replayDegradationPersistence,
    reinforcementEscalationPersistence: args.reinforcementEscalationPersistence,
    saturationEquilibrium: args.saturationEquilibrium,
    oscillationDamping: args.oscillationDamping,
    projectionLockInPersistence: args.projectionLockInPersistence,
    lowConfidenceAmplificationPersistence: args.lowConfidenceAmplificationPersistence,
    projectionStabilityConvergence: 0.7,
    rankingDiversityPreservation: 0.55,
    entropyEvolution: 0.42,
    governanceClassification: args.governanceClassification ?? 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: args.replayFingerprint,
    generatedAt: args.generatedAt,
    ...contractMetadata,
  }
}

test('replay trend reducers build deterministic graph-ready series and reducers', () => {
  const events = [
    buildEvidence({
      evidenceId: 'e-001',
      generatedAt: '2026-05-08T10:00:00.000Z',
      replayConsistencyEquilibrium: 0.91,
      replayDegradationPersistence: 0.12,
      reinforcementEscalationPersistence: 0.2,
      saturationEquilibrium: 0.3,
      oscillationDamping: 0.84,
      projectionLockInPersistence: 0.15,
      lowConfidenceAmplificationPersistence: 0.1,
      governanceClassification: 'SAFE',
      replayFingerprint: 'fp-a',
    }),
    buildEvidence({
      evidenceId: 'e-002',
      generatedAt: '2026-05-08T11:00:00.000Z',
      replayConsistencyEquilibrium: 0.79,
      replayDegradationPersistence: 0.44,
      reinforcementEscalationPersistence: 0.58,
      saturationEquilibrium: 0.62,
      oscillationDamping: 0.45,
      projectionLockInPersistence: 0.49,
      lowConfidenceAmplificationPersistence: 0.51,
      governanceClassification: 'UNSAFE',
      replayFingerprint: 'fp-b',
    }),
    buildEvidence({
      evidenceId: 'e-003',
      generatedAt: '2026-05-08T12:00:00.000Z',
      replayConsistencyEquilibrium: 0.83,
      replayDegradationPersistence: 0.28,
      reinforcementEscalationPersistence: 0.47,
      saturationEquilibrium: 0.41,
      oscillationDamping: 0.63,
      projectionLockInPersistence: 0.31,
      lowConfidenceAmplificationPersistence: 0.34,
      governanceClassification: 'CAUTION',
      replayFingerprint: 'fp-b',
    }),
  ]

  const timeSeries = reduceReplayTimeSeries(events)
  const rolling = reduceReplayRollingAverages({
    timeSeries,
    nowIso: '2026-05-08T12:30:00.000Z',
    rollingHours: [1, 3],
  })
  const deltas = reduceReplayDegradationDeltas(timeSeries)
  const collapse = reduceReplayCollapseSummary({
    timeSeries,
    rollingAverages: rolling,
  })
  const buckets = reduceReplayConsistencyBuckets({
    timeSeries,
    bucketCount: 4,
  })
  const variance = reduceReplayVariance(timeSeries)

  assert.equal(timeSeries.length, 3)
  assert.equal(timeSeries[0]?.metrics.fingerprintEquivalence, 1)
  assert.equal(timeSeries[1]?.metrics.fingerprintEquivalence, 0)
  assert.equal(timeSeries[2]?.metrics.fingerprintEquivalence, 1)

  assert.equal(rolling.length, 2)
  assert.equal(rolling[0]?.label, 'rolling_1h')
  assert.equal(rolling[1]?.label, 'rolling_3h')

  assert.equal(deltas.length, 3)
  assert.equal(deltas[0]?.replayDegradationDelta, 0)

  assert.equal(collapse.totalSamples, 3)
  assert.equal(collapse.totalCollapsedSamples, 1)
  assert.equal(collapse.collapseRatio, 0.333333)

  assert.equal(buckets.length, 4)
  assert.equal(
    buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    3,
  )

  assert.equal(variance.length, 6)
  assert.equal(variance.some((entry) => entry.metric === 'replayConsistencyEvolution'), true)
})
