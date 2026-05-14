import assert from 'node:assert/strict'
import test from 'node:test'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'
import { deriveEpistemicConfidenceMetadata } from './epistemicConfidence.js'

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  replayFingerprint: string
  replayConsistencyEquilibrium?: number
  projectionStabilityConvergence?: number
  entropyEvolution?: number
  projectionLockInPersistence?: number
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()

  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: args.replayConsistencyEquilibrium ?? 0.84,
    reinforcementEscalationPersistence: 0.21,
    saturationEquilibrium: 0.2,
    oscillationDamping: 0.79,
    projectionStabilityConvergence: args.projectionStabilityConvergence ?? 0.82,
    rankingDiversityPreservation: 0.61,
    entropyEvolution: args.entropyEvolution ?? 0.46,
    projectionLockInPersistence: args.projectionLockInPersistence ?? 0.19,
    lowConfidenceAmplificationPersistence: 0.14,
    replayDegradationPersistence: 0.12,
    governanceClassification: 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: args.replayFingerprint,
    generatedAt: args.generatedAt,
    ...contractMetadata,
  }
}

test('epistemic confidence emits low density warning when evidence is sparse over wide time span', () => {
  const events = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a' }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-03T00:00:00.000Z', replayFingerprint: 'fp-b' }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-05T00:00:00.000Z', replayFingerprint: 'fp-c' }),
  ]

  const metadata = deriveEpistemicConfidenceMetadata(events)

  assert.equal(metadata.warnings.some((warning) => warning.code === 'low_evidence_density'), true)
})

test('epistemic confidence reports replay coverage degradation with missing replay fingerprints', () => {
  const events = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a' }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T01:00:00.000Z', replayFingerprint: '' }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-01T02:00:00.000Z', replayFingerprint: '' }),
    buildEvidence({ evidenceId: 'e-4', generatedAt: '2026-05-01T03:00:00.000Z', replayFingerprint: 'fp-d' }),
  ]

  const metadata = deriveEpistemicConfidenceMetadata(events)

  assert.equal(metadata.metrics.replayCoverage < 0.7, true)
  assert.equal(metadata.warnings.some((warning) => warning.code === 'replay_coverage_degradation'), true)
})

test('epistemic confidence detects temporal gap pressure from large chronological intervals', () => {
  const events = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a' }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T18:00:00.000Z', replayFingerprint: 'fp-b' }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-02T12:00:00.000Z', replayFingerprint: 'fp-c' }),
  ]

  const metadata = deriveEpistemicConfidenceMetadata(events)

  assert.equal(metadata.metrics.temporalGapPressure > 0.4, true)
  assert.equal(metadata.warnings.some((warning) => warning.code === 'temporal_gap_pressure_high'), true)
})

test('epistemic confidence classification remains stable across minor perturbations', () => {
  const baseline = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a', replayConsistencyEquilibrium: 0.8 }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T01:00:00.000Z', replayFingerprint: 'fp-b', replayConsistencyEquilibrium: 0.81 }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-01T02:00:00.000Z', replayFingerprint: 'fp-c', replayConsistencyEquilibrium: 0.79 }),
    buildEvidence({ evidenceId: 'e-4', generatedAt: '2026-05-01T03:00:00.000Z', replayFingerprint: 'fp-d', replayConsistencyEquilibrium: 0.8 }),
  ]

  const perturbed = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a', replayConsistencyEquilibrium: 0.802 }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T01:00:00.000Z', replayFingerprint: 'fp-b', replayConsistencyEquilibrium: 0.808 }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-01T02:00:00.000Z', replayFingerprint: 'fp-c', replayConsistencyEquilibrium: 0.792 }),
    buildEvidence({ evidenceId: 'e-4', generatedAt: '2026-05-01T03:00:00.000Z', replayFingerprint: 'fp-d', replayConsistencyEquilibrium: 0.801 }),
  ]

  const baselineMetadata = deriveEpistemicConfidenceMetadata(baseline)
  const perturbedMetadata = deriveEpistemicConfidenceMetadata(perturbed)

  assert.equal(baselineMetadata.classification, perturbedMetadata.classification)
})

test('epistemic confidence exposes governance summary consistent with governance interpretation metrics', () => {
  const events = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a' }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T01:00:00.000Z', replayFingerprint: 'fp-b' }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-01T02:00:00.000Z', replayFingerprint: 'fp-c' }),
    buildEvidence({ evidenceId: 'e-4', generatedAt: '2026-05-01T03:00:00.000Z', replayFingerprint: 'fp-d' }),
  ]

  const metadata = deriveEpistemicConfidenceMetadata(events)

  assert.equal(
    metadata.governanceSummary.classification === 'MEDIUM_CONFIDENCE'
      || metadata.governanceSummary.classification === 'HIGH_CONFIDENCE',
    true,
  )
  assert.equal(metadata.governanceSummary.governanceInterpretationConfidence >= 0.7, true)
})

test('epistemic confidence exposes replay summary consistent with replay interpretation metrics', () => {
  const events = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a' }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T01:00:00.000Z', replayFingerprint: 'fp-b' }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-01T02:00:00.000Z', replayFingerprint: 'fp-c' }),
    buildEvidence({ evidenceId: 'e-4', generatedAt: '2026-05-01T03:00:00.000Z', replayFingerprint: 'fp-d' }),
  ]

  const metadata = deriveEpistemicConfidenceMetadata(events)

  assert.equal(metadata.replaySummary.classification, 'HIGH_CONFIDENCE')
  assert.equal(metadata.replaySummary.replayConfidence >= 0.7, true)
})

test('epistemic confidence derivation is immutable and does not mutate historical evidence records', () => {
  const events = [
    buildEvidence({ evidenceId: 'e-1', generatedAt: '2026-05-01T00:00:00.000Z', replayFingerprint: 'fp-a' }),
    buildEvidence({ evidenceId: 'e-2', generatedAt: '2026-05-01T01:00:00.000Z', replayFingerprint: 'fp-b' }),
    buildEvidence({ evidenceId: 'e-3', generatedAt: '2026-05-01T02:00:00.000Z', replayFingerprint: 'fp-c' }),
  ]

  const before = JSON.parse(JSON.stringify(events)) as AdaptiveEquilibriumEvidenceEvent[]
  void deriveEpistemicConfidenceMetadata(events)

  assert.deepEqual(events, before)
  assert.equal(events.map((event) => event.evidenceId).join(','), 'e-1,e-2,e-3')
  assert.equal(events.map((event) => event.replayFingerprint).join(','), 'fp-a,fp-b,fp-c')
})
