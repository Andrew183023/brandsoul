import assert from 'node:assert/strict'
import test from 'node:test'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from '../persistence/adaptiveEvidenceContract.js'
import type { GovernanceEvidenceTimelineEvent } from '../persistence/GovernanceEvidenceTimelineEvent.js'
import {
  reduceGovernanceEvidenceHistory,
  reduceGovernanceEvidenceTimelineEvents,
} from './governanceEvidenceTimelineReducer.js'

function buildEvidence(overrides: Partial<AdaptiveEquilibriumEvidenceEvent> = {}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: 'evidence-1',
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: 0.9,
    reinforcementEscalationPersistence: 0.2,
    saturationEquilibrium: 0.1,
    oscillationDamping: 0.9,
    projectionStabilityConvergence: 0.9,
    rankingDiversityPreservation: 0.8,
    entropyEvolution: 0.5,
    projectionLockInPersistence: 0.1,
    lowConfidenceAmplificationPersistence: 0.1,
    replayDegradationPersistence: 0.1,
    governanceClassification: 'SAFE',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: 'replay:fingerprint:1',
    generatedAt: '2026-05-09T12:00:00.000Z',
    ...contractMetadata,
    ...overrides,
  }
}

test('reduceGovernanceEvidenceTimelineEvents emits transition and risk events from observability diagnostics', () => {
  const previous = buildEvidence({
    evidenceId: 'evidence-prev',
    governanceClassification: 'SAFE',
    replayDegradationPersistence: 0.1,
  })
  const current = buildEvidence({
    evidenceId: 'evidence-current',
    governanceClassification: 'UNSAFE',
    replayDegradationPersistence: 0.25,
    generatedAt: '2026-05-09T12:05:00.000Z',
  })

  const events = reduceGovernanceEvidenceTimelineEvents({
    current,
    previous,
    eventSequence: 5,
    context: {
      replayCollapseDetected: true,
      replayCollapseSignals: ['replay_gap_detected'],
      instabilityRiskClassification: 'unsafe',
      saturationRatio: 0.56,
      reinforcementLoopIntensity: 0.61,
      equilibriumScore: 0.52,
    },
  })

  assert.equal(events.some((event) => event.eventType === 'classification_transition'), true)
  assert.equal(events.some((event) => event.eventType === 'replay_collapse'), true)
  assert.equal(events.some((event) => event.eventType === 'instability_spike'), true)
  assert.equal(events.some((event) => event.eventType === 'saturation_spike'), true)
  assert.equal(events.some((event) => event.eventType === 'reinforcement_escalation'), true)
  assert.equal(events.some((event) => event.eventType === 'equilibrium_degradation'), true)
  assert.equal(events.some((event) => event.eventType === 'replay_degradation_evolution'), true)

  const transition = events.find((event) => event.eventType === 'classification_transition')
  assert.notEqual(transition, undefined)
  assert.equal(transition?.severity, 'CRITICAL')
  assert.equal(transition?.triggerFactors.includes('safe_to_unsafe'), true)
})

test('reduceGovernanceEvidenceHistory aggregates transitions, milestones and type totals', () => {
  const events: GovernanceEvidenceTimelineEvent[] = [
    {
      eventId: 'evt-1',
      eventType: 'classification_transition',
      timestamp: '2026-05-09T12:00:00.000Z',
      classification: 'CAUTION',
      recommendation: 'do_not_rollout',
      severity: 'MEDIUM',
      triggerFactors: ['safe_to_caution'],
      replayFingerprint: 'rf-1',
      longitudinalWindow: 'long',
      sourceEvidenceId: 'ev-1',
    },
    {
      eventId: 'evt-2',
      eventType: 'classification_transition',
      timestamp: '2026-05-09T12:10:00.000Z',
      classification: 'UNSAFE',
      recommendation: 'do_not_rollout',
      severity: 'HIGH',
      triggerFactors: ['caution_to_unsafe'],
      replayFingerprint: 'rf-2',
      longitudinalWindow: 'long',
      sourceEvidenceId: 'ev-2',
    },
    {
      eventId: 'evt-3',
      eventType: 'evidence_milestone',
      timestamp: '2026-05-09T12:15:00.000Z',
      classification: 'UNSAFE',
      recommendation: 'do_not_rollout',
      severity: 'LOW',
      triggerFactors: ['periodic_governance_milestone'],
      replayFingerprint: 'rf-3',
      longitudinalWindow: 'long',
      sourceEvidenceId: 'ev-3',
    },
  ]

  const reduced = reduceGovernanceEvidenceHistory({ events })

  assert.equal(reduced.transitions.totalTransitions, 2)
  assert.equal(reduced.transitions.safeToCaution, 1)
  assert.equal(reduced.transitions.cautionToUnsafe, 1)
  assert.equal(reduced.transitions.safeToUnsafe, 0)
  assert.equal(reduced.milestones.totalMilestones, 1)
  assert.equal(reduced.milestones.latestMilestoneAt, '2026-05-09T12:15:00.000Z')
  assert.equal(reduced.eventTypeTotals.classification_transition, 2)
  assert.equal(reduced.eventTypeTotals.evidence_milestone, 1)
  assert.equal(reduced.recommendationEvolution.sequence.length, 2)
})
