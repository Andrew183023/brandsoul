import assert from 'node:assert/strict'
import test from 'node:test'

import { createAdaptiveTimelineDashboardService } from './adaptiveTimelineDashboardService.js'
import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  replayConsistencyEquilibrium: number
  projectionStabilityConvergence: number
  reinforcementEscalationPersistence: number
  saturationEquilibrium: number
  oscillationDamping: number
  entropyEvolution: number
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
    rankingDiversityPreservation: 0.52,
    entropyEvolution: args.entropyEvolution,
    projectionLockInPersistence: 0.31,
    lowConfidenceAmplificationPersistence: 0.27,
    replayDegradationPersistence: 0.12,
    governanceClassification: 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: `fingerprint:${args.evidenceId}`,
    generatedAt: args.generatedAt,
    ...contractMetadata,
  }
}

test('adaptive timeline dashboard builds hourly/daily/rolling windows and trends deterministically', async () => {
  const records = [
    buildEvidence({
      evidenceId: 'e-001',
      generatedAt: '2026-05-08T08:10:00.000Z',
      replayConsistencyEquilibrium: 0.82,
      projectionStabilityConvergence: 0.79,
      reinforcementEscalationPersistence: 0.41,
      saturationEquilibrium: 0.35,
      oscillationDamping: 0.66,
      entropyEvolution: 0.44,
    }),
    buildEvidence({
      evidenceId: 'e-002',
      generatedAt: '2026-05-08T08:40:00.000Z',
      replayConsistencyEquilibrium: 0.84,
      projectionStabilityConvergence: 0.81,
      reinforcementEscalationPersistence: 0.39,
      saturationEquilibrium: 0.33,
      oscillationDamping: 0.68,
      entropyEvolution: 0.45,
    }),
    buildEvidence({
      evidenceId: 'e-003',
      generatedAt: '2026-05-08T09:15:00.000Z',
      replayConsistencyEquilibrium: 0.9,
      projectionStabilityConvergence: 0.87,
      reinforcementEscalationPersistence: 0.28,
      saturationEquilibrium: 0.24,
      oscillationDamping: 0.76,
      entropyEvolution: 0.48,
    }),
  ]

  const service = createAdaptiveTimelineDashboardService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-08T10:00:00.000Z',
  })

  const first = await service.buildDashboard({ historyLimit: 50, rollingHours: [1, 6, 24] })
  const second = await service.buildDashboard({ historyLimit: 50, rollingHours: [1, 6, 24] })

  assert.equal(first.aggregationArchitecture.derivedOnly, true)
  assert.equal(first.aggregationArchitecture.noMutation, true)
  assert.equal(first.aggregationArchitecture.noRollout, true)
  assert.equal(first.historicalSnapshots.length, 3)
  assert.equal(first.hourlyWindows.length, 2)
  assert.equal(first.dailyWindows.length, 1)
  assert.equal(first.rollingWindows.length, 3)
  assert.equal(first.epistemicConfidence.classification, 'HIGH_CONFIDENCE')
  assert.equal(first.epistemicConfidence.metrics.replayCoverage, 1)

  const replayTrend = first.longitudinalTrends.find((trend) => trend.metric === 'replayConsistency')
  assert.equal(replayTrend?.direction, 'improving')

  const driftTrend = first.longitudinalTrends.find((trend) => trend.metric === 'driftAccumulation')
  assert.equal(driftTrend?.direction, 'improving')

  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.equal(first.compatibility.highestRiskClassification, 'FULLY_COMPATIBLE')
})

test('adaptive timeline dashboard fingerprint ignores request-time generatedAt but changes with evidence', async () => {
  const records = [
    buildEvidence({
      evidenceId: 'e-201',
      generatedAt: '2026-05-08T08:10:00.000Z',
      replayConsistencyEquilibrium: 0.82,
      projectionStabilityConvergence: 0.79,
      reinforcementEscalationPersistence: 0.41,
      saturationEquilibrium: 0.35,
      oscillationDamping: 0.66,
      entropyEvolution: 0.44,
    }),
    buildEvidence({
      evidenceId: 'e-202',
      generatedAt: '2026-05-08T09:15:00.000Z',
      replayConsistencyEquilibrium: 0.9,
      projectionStabilityConvergence: 0.87,
      reinforcementEscalationPersistence: 0.28,
      saturationEquilibrium: 0.24,
      oscillationDamping: 0.76,
      entropyEvolution: 0.48,
    }),
  ]

  const first = await createAdaptiveTimelineDashboardService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-08T10:00:00.000Z',
  }).buildDashboard({ historyLimit: 50, rollingHours: [1, 6, 24] })

  const second = await createAdaptiveTimelineDashboardService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-08T12:30:00.000Z',
  }).buildDashboard({ historyLimit: 50, rollingHours: [1, 6, 24] })

  const changedEvidence = [
    ...records.slice(0, -1),
    buildEvidence({
      evidenceId: 'e-202',
      generatedAt: '2026-05-08T09:15:00.000Z',
      replayConsistencyEquilibrium: 0.74,
      projectionStabilityConvergence: 0.63,
      reinforcementEscalationPersistence: 0.52,
      saturationEquilibrium: 0.46,
      oscillationDamping: 0.55,
      entropyEvolution: 0.38,
    }),
  ]

  const third = await createAdaptiveTimelineDashboardService({
    listEvidenceChronological: async () => changedEvidence,
    now: () => '2026-05-08T14:00:00.000Z',
  }).buildDashboard({ historyLimit: 50, rollingHours: [1, 6, 24] })

  assert.notEqual(first.generatedAt, second.generatedAt)
  assert.equal(first.payloadFingerprint, second.payloadFingerprint)
  assert.deepEqual(first.rollingWindows, second.rollingWindows)
  assert.notEqual(first.payloadFingerprint, third.payloadFingerprint)
})

test('adaptive timeline dashboard returns stable trend for epsilon-only variation', async () => {
  const records = [
    buildEvidence({
      evidenceId: 'e-010',
      generatedAt: '2026-05-08T10:05:00.000Z',
      replayConsistencyEquilibrium: 0.8,
      projectionStabilityConvergence: 0.75,
      reinforcementEscalationPersistence: 0.3,
      saturationEquilibrium: 0.2,
      oscillationDamping: 0.7,
      entropyEvolution: 0.5,
    }),
    buildEvidence({
      evidenceId: 'e-011',
      generatedAt: '2026-05-08T11:05:00.000Z',
      replayConsistencyEquilibrium: 0.808,
      projectionStabilityConvergence: 0.752,
      reinforcementEscalationPersistence: 0.302,
      saturationEquilibrium: 0.198,
      oscillationDamping: 0.701,
      entropyEvolution: 0.498,
    }),
  ]

  const service = createAdaptiveTimelineDashboardService({
    listEvidenceChronological: async () => records,
    now: () => '2026-05-08T12:00:00.000Z',
  })

  const dashboard = await service.buildDashboard({ rollingHours: [24] })
  const replayTrend = dashboard.longitudinalTrends.find((trend) => trend.metric === 'replayConsistency')
  const entropyTrend = dashboard.longitudinalTrends.find((trend) => trend.metric === 'entropyEvolution')

  assert.equal(replayTrend?.direction, 'stable')
  assert.equal(entropyTrend?.direction, 'stable')
  assert.equal(dashboard.rollingWindows[0]?.label, 'rolling_24h')
})
