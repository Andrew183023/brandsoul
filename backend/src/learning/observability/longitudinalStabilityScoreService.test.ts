import assert from 'node:assert/strict'
import test from 'node:test'

import { createLongitudinalStabilityScoreService } from './longitudinalStabilityScoreService.js'
import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  replayConsistencyEquilibrium: number
  reinforcementEscalationPersistence: number
  saturationEquilibrium: number
  oscillationDamping: number
  projectionStabilityConvergence: number
  entropyEvolution: number
  replayDegradationPersistence: number
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: args.replayConsistencyEquilibrium,
    reinforcementEscalationPersistence: args.reinforcementEscalationPersistence,
    saturationEquilibrium: args.saturationEquilibrium,
    oscillationDamping: args.oscillationDamping,
    projectionStabilityConvergence: args.projectionStabilityConvergence,
    rankingDiversityPreservation: 0.58,
    entropyEvolution: args.entropyEvolution,
    projectionLockInPersistence: 0.22,
    lowConfidenceAmplificationPersistence: 0.18,
    replayDegradationPersistence: args.replayDegradationPersistence,
    governanceClassification: 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: `fp:${args.evidenceId}`,
    generatedAt: args.generatedAt,
    ...contractMetadata,
  }
}

test('longitudinal stability score service builds deterministic weighted score payloads with confidence intervals', async () => {
  const evidence = [
    buildEvidence({
      evidenceId: 'e-001',
      generatedAt: '2026-05-09T08:00:00.000Z',
      replayConsistencyEquilibrium: 0.82,
      reinforcementEscalationPersistence: 0.34,
      saturationEquilibrium: 0.28,
      oscillationDamping: 0.69,
      projectionStabilityConvergence: 0.74,
      entropyEvolution: 0.46,
      replayDegradationPersistence: 0.16,
    }),
    buildEvidence({
      evidenceId: 'e-002',
      generatedAt: '2026-05-09T09:00:00.000Z',
      replayConsistencyEquilibrium: 0.88,
      reinforcementEscalationPersistence: 0.27,
      saturationEquilibrium: 0.21,
      oscillationDamping: 0.76,
      projectionStabilityConvergence: 0.81,
      entropyEvolution: 0.5,
      replayDegradationPersistence: 0.12,
    }),
    buildEvidence({
      evidenceId: 'e-003',
      generatedAt: '2026-05-09T10:00:00.000Z',
      replayConsistencyEquilibrium: 0.93,
      reinforcementEscalationPersistence: 0.19,
      saturationEquilibrium: 0.15,
      oscillationDamping: 0.84,
      projectionStabilityConvergence: 0.89,
      entropyEvolution: 0.57,
      replayDegradationPersistence: 0.08,
    }),
  ]

  const service = createLongitudinalStabilityScoreService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T11:00:00.000Z',
  })

  const first = await service.buildStabilityScore({ historyLimit: 50, rollingHours: [2, 6, 24] })
  const second = await service.buildStabilityScore({ historyLimit: 50, rollingHours: [2, 6, 24] })

  assert.equal(first.aggregationArchitecture.observationOnly, true)
  assert.equal(first.aggregationArchitecture.weightedLongitudinalScoring, true)
  assert.equal(first.currentScore?.finalScore !== null, true)
  assert.equal(first.currentScore?.weightedBaseScore !== null, true)
  assert.equal(first.currentScore?.degradationPenalty !== null, true)
  assert.equal(first.currentScore?.classification, 'SAFE')
  assert.equal(first.currentScore?.confidenceInterval.sampleCount, 3)
  assert.equal(first.rollingAverages.length, 3)
  assert.equal(first.rollingAverages[0]?.confidenceInterval.sampleCount >= 1, true)
  assert.equal(first.longitudinalEvolution.direction, 'improving')
  assert.equal(first.replaySafePayload.classification, 'SAFE')
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.equal(first.compatibility.highestRiskClassification, 'FULLY_COMPATIBLE')
})

test('longitudinal stability score fingerprint ignores request-time generatedAt but changes with evidence', async () => {
  const evidence = [
    buildEvidence({
      evidenceId: 'e-201',
      generatedAt: '2026-05-09T08:00:00.000Z',
      replayConsistencyEquilibrium: 0.82,
      reinforcementEscalationPersistence: 0.34,
      saturationEquilibrium: 0.28,
      oscillationDamping: 0.69,
      projectionStabilityConvergence: 0.74,
      entropyEvolution: 0.46,
      replayDegradationPersistence: 0.16,
    }),
    buildEvidence({
      evidenceId: 'e-202',
      generatedAt: '2026-05-09T09:00:00.000Z',
      replayConsistencyEquilibrium: 0.88,
      reinforcementEscalationPersistence: 0.27,
      saturationEquilibrium: 0.21,
      oscillationDamping: 0.76,
      projectionStabilityConvergence: 0.81,
      entropyEvolution: 0.5,
      replayDegradationPersistence: 0.12,
    }),
  ]

  const first = await createLongitudinalStabilityScoreService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T11:00:00.000Z',
  }).buildStabilityScore({ historyLimit: 50, rollingHours: [2, 6, 24] })

  const second = await createLongitudinalStabilityScoreService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T15:00:00.000Z',
  }).buildStabilityScore({ historyLimit: 50, rollingHours: [2, 6, 24] })

  const changedEvidence = [
    evidence[0],
    buildEvidence({
      evidenceId: 'e-202',
      generatedAt: '2026-05-09T09:00:00.000Z',
      replayConsistencyEquilibrium: 0.63,
      reinforcementEscalationPersistence: 0.49,
      saturationEquilibrium: 0.41,
      oscillationDamping: 0.52,
      projectionStabilityConvergence: 0.58,
      entropyEvolution: 0.34,
      replayDegradationPersistence: 0.29,
    }),
  ]

  const third = await createLongitudinalStabilityScoreService({
    listEvidenceChronological: async () => changedEvidence,
    now: () => '2026-05-09T16:00:00.000Z',
  }).buildStabilityScore({ historyLimit: 50, rollingHours: [2, 6, 24] })

  assert.notEqual(first.generatedAt, second.generatedAt)
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.deepEqual(first.rollingAverages, second.rollingAverages)
  assert.notEqual(first.payloadFingerprint, third.payloadFingerprint)
})

test('longitudinal stability score service degrades classification under high persistence penalties', async () => {
  const evidence = [
    buildEvidence({
      evidenceId: 'e-101',
      generatedAt: '2026-05-09T08:00:00.000Z',
      replayConsistencyEquilibrium: 0.48,
      reinforcementEscalationPersistence: 0.82,
      saturationEquilibrium: 0.77,
      oscillationDamping: 0.22,
      projectionStabilityConvergence: 0.31,
      entropyEvolution: 0.19,
      replayDegradationPersistence: 0.73,
    }),
    buildEvidence({
      evidenceId: 'e-102',
      generatedAt: '2026-05-09T09:00:00.000Z',
      replayConsistencyEquilibrium: 0.44,
      reinforcementEscalationPersistence: 0.8,
      saturationEquilibrium: 0.79,
      oscillationDamping: 0.18,
      projectionStabilityConvergence: 0.28,
      entropyEvolution: 0.17,
      replayDegradationPersistence: 0.76,
    }),
  ]

  const service = createLongitudinalStabilityScoreService({
    listEvidenceChronological: async () => evidence,
    now: () => '2026-05-09T10:00:00.000Z',
  })

  const payload = await service.buildStabilityScore({ rollingHours: [24] })
  assert.equal(payload.currentScore?.classification, 'UNSAFE')
  assert.equal(payload.currentScore?.degradationPenalty > 0.2, true)
  assert.equal(payload.longitudinalEvolution.direction, 'degrading')
})

test('longitudinal stability score separates drift stability from equilibrium convergence semantics', async () => {
  const baseline = buildEvidence({
    evidenceId: 'e-301',
    generatedAt: '2026-05-09T08:00:00.000Z',
    replayConsistencyEquilibrium: 0.8,
    reinforcementEscalationPersistence: 0.28,
    saturationEquilibrium: 0.22,
    oscillationDamping: 0.74,
    projectionStabilityConvergence: 0.78,
    entropyEvolution: 0.49,
    replayDegradationPersistence: 0.11,
  })

  const driftChanged: AdaptiveEquilibriumEvidenceEvent = {
    ...baseline,
    evidenceId: 'e-302',
    projectionLockInPersistence: 0.74,
    lowConfidenceAmplificationPersistence: 0.62,
  }

  const equilibriumChanged: AdaptiveEquilibriumEvidenceEvent = {
    ...baseline,
    evidenceId: 'e-303',
    projectionStabilityConvergence: 0.52,
  }

  const [baselinePayload, driftPayload, equilibriumPayload] = await Promise.all([
    createLongitudinalStabilityScoreService({
      listEvidenceChronological: async () => [baseline],
      now: () => '2026-05-09T09:00:00.000Z',
    }).buildStabilityScore({ rollingHours: [24] }),
    createLongitudinalStabilityScoreService({
      listEvidenceChronological: async () => [driftChanged],
      now: () => '2026-05-09T09:00:00.000Z',
    }).buildStabilityScore({ rollingHours: [24] }),
    createLongitudinalStabilityScoreService({
      listEvidenceChronological: async () => [equilibriumChanged],
      now: () => '2026-05-09T09:00:00.000Z',
    }).buildStabilityScore({ rollingHours: [24] }),
  ])

  assert.equal(
    baselinePayload.stabilityScoringArchitecture.componentSemantics.driftStability.proxyBased,
    true,
  )
  assert.deepEqual(
    baselinePayload.stabilityScoringArchitecture.componentSemantics.driftStability.sourceFields,
    ['projectionLockInPersistence', 'lowConfidenceAmplificationPersistence'],
  )
  assert.deepEqual(
    baselinePayload.stabilityScoringArchitecture.componentSemantics.equilibriumConvergence.sourceFields,
    ['projectionStabilityConvergence'],
  )

  assert.notEqual(
    baselinePayload.currentScore?.components.driftStability,
    baselinePayload.currentScore?.components.equilibriumConvergence,
  )
  assert.equal(
    driftPayload.currentScore?.components.equilibriumConvergence,
    baselinePayload.currentScore?.components.equilibriumConvergence,
  )
  assert.equal(
    driftPayload.currentScore?.components.driftStability
      !== baselinePayload.currentScore?.components.driftStability,
    true,
  )
  assert.equal(
    equilibriumPayload.currentScore?.components.driftStability,
    baselinePayload.currentScore?.components.driftStability,
  )
  assert.equal(
    equilibriumPayload.currentScore?.components.equilibriumConvergence
      !== baselinePayload.currentScore?.components.equilibriumConvergence,
    true,
  )
  assert.equal(typeof baselinePayload.currentScore?.classification, 'string')
  assert.equal(typeof driftPayload.currentScore?.classification, 'string')
  assert.equal(typeof equilibriumPayload.currentScore?.classification, 'string')
})
