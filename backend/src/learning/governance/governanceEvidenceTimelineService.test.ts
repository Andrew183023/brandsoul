import assert from 'node:assert/strict'
import test from 'node:test'

import { createGovernanceEvidenceTimelineService } from './governanceEvidenceTimelineService.js'
import type { GovernanceEvidenceTimelineRepository } from '../persistence/governanceEvidenceTimelineRepository.js'
import type { GovernanceEvidenceTimelineEvent } from '../persistence/GovernanceEvidenceTimelineEvent.js'
import {
  LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION,
  buildCurrentAdaptiveEvidenceContractMetadata,
} from '../persistence/adaptiveEvidenceContract.js'
import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'

type TimelineEvent = {
  eventId: string
  timestamp: string
  triggerFactors: string[]
  classification: 'SAFE' | 'CAUTION' | 'UNSAFE'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  replayFingerprint: string
  sourceEvidenceId: string
}

function buildEvent(args: TimelineEvent): GovernanceEvidenceTimelineEvent {
  return {
    eventId: args.eventId,
    eventType: 'classification_transition',
    timestamp: args.timestamp,
    classification: args.classification,
    recommendation: 'do_not_rollout',
    severity: args.severity,
    triggerFactors: args.triggerFactors,
    replayFingerprint: args.replayFingerprint,
    longitudinalWindow: 'long',
    sourceEvidenceId: args.sourceEvidenceId,
  }
}

function buildEvidence(args: {
  evidenceId: string
  generatedAt: string
  evidenceContractVersion?: string
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: 0.82,
    reinforcementEscalationPersistence: 0.21,
    saturationEquilibrium: 0.17,
    oscillationDamping: 0.78,
    projectionStabilityConvergence: 0.8,
    rankingDiversityPreservation: 0.63,
    entropyEvolution: 0.48,
    projectionLockInPersistence: 0.16,
    lowConfidenceAmplificationPersistence: 0.12,
    replayDegradationPersistence: 0.11,
    governanceClassification: 'CAUTION',
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: false,
    replayFingerprint: `fp:${args.evidenceId}`,
    generatedAt: args.generatedAt,
    evidenceContractVersion: args.evidenceContractVersion ?? contractMetadata.evidenceContractVersion,
    semanticVersionMetadata: args.evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION
      ? { ...contractMetadata.semanticVersionMetadata, contractSchemaVersion: 0 }
      : contractMetadata.semanticVersionMetadata,
    reducerSemanticMetadata: args.evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION
      ? { ...contractMetadata.reducerSemanticMetadata, reducerSetVersion: 'legacy-unversioned' }
      : contractMetadata.reducerSemanticMetadata,
    evidenceGenerationMetadata: args.evidenceContractVersion === LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION
      ? { ...contractMetadata.evidenceGenerationMetadata, generatedBy: 'unknown_legacy_runtime', runtimeSemanticsVersion: 'legacy-unversioned' }
      : contractMetadata.evidenceGenerationMetadata,
  }
}

test('governance evidence timeline fingerprint ignores request-time generatedAt but changes with evidence', async () => {
  const events = [
    buildEvent({
      eventId: 'event-1',
      sourceEvidenceId: 'e-001',
      timestamp: '2026-05-09T08:00:00.000Z',
      classification: 'UNSAFE',
      severity: 'HIGH',
      triggerFactors: ['caution_to_unsafe'],
      replayFingerprint: 'fp-1',
    }),
    buildEvent({
      eventId: 'event-2',
      sourceEvidenceId: 'e-002',
      timestamp: '2026-05-09T09:00:00.000Z',
      classification: 'SAFE',
      severity: 'LOW',
      triggerFactors: ['caution_to_safe'],
      replayFingerprint: 'fp-2',
    }),
  ]

  const repository = {
    countEvents: async () => events.length,
    listEventsPaginated: async () => events,
    listEventsChronological: async () => events,
    appendEvent: async () => ({ inserted: true, event: events[0] }),
  }

  const first = await createGovernanceEvidenceTimelineService({
    repository: repository as unknown as GovernanceEvidenceTimelineRepository,
    listEvidenceChronological: async () => [
      buildEvidence({
        evidenceId: 'e-001',
        generatedAt: '2026-05-09T08:00:00.000Z',
        evidenceContractVersion: LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION,
      }),
      buildEvidence({
        evidenceId: 'e-002',
        generatedAt: '2026-05-09T09:00:00.000Z',
      }),
    ],
    now: () => '2026-05-09T10:00:00.000Z',
  }).buildHistory({ page: 1, pageSize: 50, historyLimit: 100 })

  const second = await createGovernanceEvidenceTimelineService({
    repository: repository as unknown as GovernanceEvidenceTimelineRepository,
    listEvidenceChronological: async () => [
      buildEvidence({
        evidenceId: 'e-001',
        generatedAt: '2026-05-09T08:00:00.000Z',
        evidenceContractVersion: LEGACY_UNVERSIONED_ADAPTIVE_EVIDENCE_CONTRACT_VERSION,
      }),
      buildEvidence({
        evidenceId: 'e-002',
        generatedAt: '2026-05-09T09:00:00.000Z',
      }),
    ],
    now: () => '2026-05-09T13:00:00.000Z',
  }).buildHistory({ page: 1, pageSize: 50, historyLimit: 100 })

  const changedEvents = [
    events[0],
    buildEvent({
      eventId: 'event-2',
      sourceEvidenceId: 'e-002',
      timestamp: '2026-05-09T09:00:00.000Z',
      classification: 'UNSAFE',
      severity: 'HIGH',
      triggerFactors: ['caution_to_unsafe'],
      replayFingerprint: 'fp-3',
    }),
  ]

  const changedRepository = {
    ...repository,
    countEvents: async () => changedEvents.length,
    listEventsPaginated: async () => changedEvents,
    listEventsChronological: async () => changedEvents,
  }

  const third = await createGovernanceEvidenceTimelineService({
    repository: changedRepository as unknown as GovernanceEvidenceTimelineRepository,
    listEvidenceChronological: async () => [
      buildEvidence({
        evidenceId: 'e-003',
        generatedAt: '2026-05-09T08:00:00.000Z',
      }),
      buildEvidence({
        evidenceId: 'e-004',
        generatedAt: '2026-05-09T09:00:00.000Z',
      }),
    ],
    now: () => '2026-05-09T14:00:00.000Z',
  }).buildHistory({ page: 1, pageSize: 50, historyLimit: 100 })

  assert.notEqual(first.generatedAt, second.generatedAt)
  assert.equal(first.replaySafePayload.payloadFingerprint, second.replaySafePayload.payloadFingerprint)
  assert.notEqual(first.replaySafePayload.payloadFingerprint, third.replaySafePayload.payloadFingerprint)
  assert.equal(first.replaySafePayload.deterministic, true)
  assert.equal(first.epistemicConfidence.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(first.epistemicConfidence.replaySummary.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(first.compatibility.highestRiskClassification, 'PARTIALLY_COMPATIBLE')
  assert.equal(first.compatibility.requiresVersionAwareInterpretation, true)
})
