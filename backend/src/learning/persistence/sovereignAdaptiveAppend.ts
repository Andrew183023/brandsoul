import { buildSemanticFingerprint, getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'
import { verifyCanonicalReplayShape } from '../../sovereignty/semanticReplayHydrationService.js'
import type {
  AdaptiveEquilibriumEvidenceEvent,
  AppendAdaptiveEquilibriumEvidenceInput,
  AdaptiveEquilibriumGovernanceClassification,
} from './AdaptiveEquilibriumEvidenceEvent.js'
import type {
  AdaptiveEquilibriumEvidenceRepository,
} from './adaptiveEquilibriumEvidenceRepository.js'
import type {
  AppendGovernanceEvidenceTimelineEventInput,
} from './GovernanceEvidenceTimelineEvent.js'
import type {
  AppendGovernanceEvidenceTimelineEventResult,
  GovernanceEvidenceTimelineRepository,
} from './governanceEvidenceTimelineRepository.js'
import { buildCurrentAdaptiveEvidenceContractMetadata } from './adaptiveEvidenceContract.js'

type SovereignAppendAuthority = {
  source: string
}

export type AdaptiveEvidenceReplayMetadata = {
  replayEquivalent: boolean
  replayResultState: 'original' | 'hydrated' | 'reconstructed' | 'fallback-safe' | 'invalid'
  lineageHash: string
  replayFingerprint: string
  canonicalShapeVerified: boolean
}

export type AdaptiveEvidenceSovereignAppendResult = {
  evidence: AdaptiveEquilibriumEvidenceEvent
  inserted: boolean
  replayMetadata: AdaptiveEvidenceReplayMetadata
  semanticIntegrity: 'verified' | 'partial' | 'invalid'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function isAdaptiveEvidenceEvent(value: unknown): value is AdaptiveEquilibriumEvidenceEvent {
  const record = asRecord(value)
  if (!record) {
    return false
  }

  return typeof record.evidenceId === 'string'
    && typeof record.replayFingerprint === 'string'
    && typeof record.generatedAt === 'string'
    && typeof record.recommendation === 'string'
}

function buildFallbackAdaptiveEvidence(args: {
  evidenceId: string
  input: AppendAdaptiveEquilibriumEvidenceInput
}): AdaptiveEquilibriumEvidenceEvent {
  const contractMetadata = buildCurrentAdaptiveEvidenceContractMetadata()
  return {
    evidenceId: args.evidenceId,
    evidenceType: 'adaptive_equilibrium_evidence',
    replayConsistencyEquilibrium: args.input.replayConsistencyEquilibrium,
    reinforcementEscalationPersistence: args.input.reinforcementEscalationPersistence,
    saturationEquilibrium: args.input.saturationEquilibrium,
    oscillationDamping: args.input.oscillationDamping,
    projectionStabilityConvergence: args.input.projectionStabilityConvergence,
    rankingDiversityPreservation: args.input.rankingDiversityPreservation,
    entropyEvolution: args.input.entropyEvolution,
    projectionLockInPersistence: args.input.projectionLockInPersistence,
    lowConfidenceAmplificationPersistence: args.input.lowConfidenceAmplificationPersistence,
    replayDegradationPersistence: args.input.replayDegradationPersistence,
    governanceClassification: args.input.governanceClassification,
    recommendation: 'do_not_rollout',
    sustainedEquilibriumEvidence: args.input.sustainedEquilibriumEvidence,
    replayFingerprint: args.input.replayFingerprint,
    generatedAt: args.input.generatedAt,
    heatmapSnapshot: args.input.heatmapSnapshot ?? null,
    evidenceContractVersion: contractMetadata.evidenceContractVersion,
    semanticVersionMetadata: contractMetadata.semanticVersionMetadata,
    reducerSemanticMetadata: contractMetadata.reducerSemanticMetadata,
    evidenceGenerationMetadata: contractMetadata.evidenceGenerationMetadata,
  }
}

function normalizeAdaptiveEvidenceResult(payload: unknown, fallbackEvidence: AdaptiveEquilibriumEvidenceEvent): AdaptiveEvidenceSovereignAppendResult {
  const record = asRecord(payload)
  if (!record) {
    return {
      evidence: fallbackEvidence,
      inserted: false,
      replayMetadata: {
        replayEquivalent: true,
        replayResultState: 'fallback-safe',
        lineageHash: 'fallback-lineage',
        replayFingerprint: fallbackEvidence.replayFingerprint,
        canonicalShapeVerified: true,
      },
      semanticIntegrity: 'partial',
    }
  }

  const candidateEvidence = isAdaptiveEvidenceEvent(record.evidence)
    ? record.evidence
    : fallbackEvidence

  const metadataRecord = asRecord(record.replayMetadata)
  const replayResultState = metadataRecord?.replayResultState
  const normalizedReplayResultState: AdaptiveEvidenceReplayMetadata['replayResultState'] = replayResultState === 'original'
    || replayResultState === 'hydrated'
    || replayResultState === 'reconstructed'
    || replayResultState === 'fallback-safe'
    || replayResultState === 'invalid'
    ? replayResultState
    : 'hydrated'

  const semanticIntegrity = record.semanticIntegrity === 'verified'
    || record.semanticIntegrity === 'partial'
    || record.semanticIntegrity === 'invalid'
    ? record.semanticIntegrity
    : 'verified'

  return {
    evidence: candidateEvidence,
    inserted: record.inserted === true,
    replayMetadata: {
      replayEquivalent: metadataRecord?.replayEquivalent === true,
      replayResultState: normalizedReplayResultState,
      lineageHash: typeof metadataRecord?.lineageHash === 'string'
        ? metadataRecord.lineageHash
        : 'semantic-lineage-missing',
      replayFingerprint: typeof metadataRecord?.replayFingerprint === 'string'
        ? metadataRecord.replayFingerprint
        : candidateEvidence.replayFingerprint,
      canonicalShapeVerified: metadataRecord?.canonicalShapeVerified !== false,
    },
    semanticIntegrity,
  }
}

function parseGovernanceClassification(value: unknown): AdaptiveEquilibriumGovernanceClassification {
  if (value === 'SAFE' || value === 'CAUTION' || value === 'UNSAFE') {
    return value
  }

  return 'UNSAFE'
}

function hydrateAdaptiveEvidenceResult(payload: unknown, fallbackEvidence: AdaptiveEquilibriumEvidenceEvent): AdaptiveEvidenceSovereignAppendResult | null {
  const record = asRecord(payload)
  if (!record) {
    return null
  }

  const evidenceRecord = asRecord(record.evidence)
  if (!evidenceRecord) {
    return null
  }

  const evidence: AdaptiveEquilibriumEvidenceEvent = isAdaptiveEvidenceEvent(evidenceRecord)
    ? evidenceRecord
    : {
      ...fallbackEvidence,
      evidenceId: typeof evidenceRecord.evidenceId === 'string' ? evidenceRecord.evidenceId : fallbackEvidence.evidenceId,
      replayFingerprint: typeof evidenceRecord.replayFingerprint === 'string'
        ? evidenceRecord.replayFingerprint
        : fallbackEvidence.replayFingerprint,
      generatedAt: typeof evidenceRecord.generatedAt === 'string' ? evidenceRecord.generatedAt : fallbackEvidence.generatedAt,
      governanceClassification: parseGovernanceClassification(evidenceRecord.governanceClassification),
    }

  return {
    evidence,
    inserted: record.inserted === true,
    replayMetadata: {
      replayEquivalent: true,
      replayResultState: 'hydrated',
      lineageHash: typeof (record as Record<string, unknown>).lineageHash === 'string'
        ? String((record as Record<string, unknown>).lineageHash)
        : 'hydrated-lineage',
      replayFingerprint: evidence.replayFingerprint,
      canonicalShapeVerified: true,
    },
    semanticIntegrity: 'verified',
  }
}

export async function appendAdaptiveEvidenceWithSovereignAuthority(args: {
  repository: AdaptiveEquilibriumEvidenceRepository
  input: AppendAdaptiveEquilibriumEvidenceInput
  authority: SovereignAppendAuthority
}): Promise<AdaptiveEvidenceSovereignAppendResult> {
  const evidenceId = args.input.evidenceId ?? `${args.authority.source}:adaptive-evidence`
  const fallbackEvidence = buildFallbackAdaptiveEvidence({
    evidenceId,
    input: args.input,
  })

  let semanticExecutor: ReturnType<typeof getSemanticMutationExecutor>
  try {
    semanticExecutor = getSemanticMutationExecutor()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('Semantic mutation executor is not installed')) {
      throw error
    }

    const persisted = await args.repository.appendEvidence(args.input)
    return {
      evidence: persisted.evidence,
      inserted: persisted.inserted,
      replayMetadata: {
        replayEquivalent: false,
        replayResultState: 'fallback-safe',
        lineageHash: 'semantic-executor-unavailable',
        replayFingerprint: persisted.evidence.replayFingerprint,
        canonicalShapeVerified: true,
      },
      semanticIntegrity: 'partial',
    }
  }

  const { result } = await semanticExecutor.executeSemanticMutation({
    authoritySource: args.authority.source,
    intent: {
      intentId: evidenceId,
      intentType: 'adaptive.evidence.append',
      domain: 'replay',
      actor: 'governance',
      targetRef: {},
      semanticPurpose: 'append replay-relevant adaptive equilibrium evidence for governance review',
      expectedInstitutionalEffect: ['adaptive_evidence_recorded'],
      riskLevel: 'high',
      replayRelevant: true,
      continuityRelevant: true,
      authRelevant: false,
      createdAt: args.input.generatedAt,
    },
    captureBeforeState: () => null,
    executePersistence: async () => args.repository.appendEvidence(args.input),
    captureAfterState: (persisted) => persisted.evidence,
    canonicalReplayShape: {
      requiredFields: ['evidence', 'evidence.evidenceId', 'evidence.replayFingerprint'],
      allowNullPayload: false,
    },
    canonicalShapeVerifier: (payload) => {
      const verification = verifyCanonicalReplayShape<AdaptiveEvidenceSovereignAppendResult>(payload, {
        requiredFields: ['evidence', 'evidence.evidenceId', 'evidence.replayFingerprint'],
        allowNullPayload: false,
      })

      if (!verification.canonicalShapeVerified) {
        return verification
      }

      return {
        ...verification,
        normalizedPayload: normalizeAdaptiveEvidenceResult(payload, fallbackEvidence),
      }
    },
    replayHydrateResult: (payload) => hydrateAdaptiveEvidenceResult(payload, fallbackEvidence),
    replayReconstructResult: async () => {
      const reconstructedEvidence = await args.repository.getEvidenceById(evidenceId)
      if (!reconstructedEvidence) {
        return null
      }

      return {
        evidence: reconstructedEvidence,
        inserted: false,
        replayMetadata: {
          replayEquivalent: true,
          replayResultState: 'reconstructed',
          lineageHash: 'reconstructed-lineage',
          replayFingerprint: reconstructedEvidence.replayFingerprint,
          canonicalShapeVerified: true,
        },
        semanticIntegrity: 'partial',
      }
    },
    replayFallbackResult: () => ({
      evidence: fallbackEvidence,
      inserted: false,
      replayMetadata: {
        replayEquivalent: true,
        replayResultState: 'fallback-safe',
        lineageHash: 'fallback-safe-lineage',
        replayFingerprint: fallbackEvidence.replayFingerprint,
        canonicalShapeVerified: true,
      },
      semanticIntegrity: 'partial',
    }),
    deriveEffect: ({ intent, afterState, sovereignAttestation }) => ({
      effectId: `${intent.intentId}:effect`,
      intentId: intent.intentId,
      effectType: 'adaptive.evidence.appended',
      domain: intent.domain,
      changedFields: ['adaptiveEquilibriumEvidence'],
      institutionalMeaning: 'new replay evidence now constrains future governance interpretation',
      replayFingerprint: buildSemanticFingerprint(afterState),
      continuityLineageHash: sovereignAttestation.lineageHash,
      mutationLineageHash: '',
      verified: false,
    }),
    mapResult: ({ persisted, sovereignAttestation }) => ({
      evidence: persisted.evidence,
      inserted: persisted.inserted,
      replayMetadata: {
        replayEquivalent: false,
        replayResultState: 'original' as const,
        lineageHash: sovereignAttestation.lineageHash,
        replayFingerprint: persisted.evidence.replayFingerprint,
        canonicalShapeVerified: true,
      },
      semanticIntegrity: 'verified' as const,
    }),
  })

  if (result.replayMetadata.replayResultState !== 'original') {
    console.info('[adaptive-influence] adaptive evidence hydrated', {
      replayResultState: result.replayMetadata.replayResultState,
      semanticIntegrity: result.semanticIntegrity,
      evidenceId: result.evidence.evidenceId,
    })
  }

  return result as AdaptiveEvidenceSovereignAppendResult
}

export async function appendGovernanceTimelineEventWithSovereignAuthority(args: {
  repository: GovernanceEvidenceTimelineRepository
  input: AppendGovernanceEvidenceTimelineEventInput
  authority: SovereignAppendAuthority
}): Promise<AppendGovernanceEvidenceTimelineEventResult> {
  const { result } = await getSemanticMutationExecutor().executeSemanticMutation({
    authoritySource: args.authority.source,
    intent: {
      intentId: args.input.eventId ?? `${args.input.sourceEvidenceId ?? args.authority.source}:timeline`,
      intentType: 'governance.timeline.append',
      domain: 'governance',
      actor: 'governance',
      targetRef: {},
      semanticPurpose: 'append a governance timeline interpretation derived from replay evidence',
      expectedInstitutionalEffect: ['governance_timeline_event_recorded'],
      riskLevel: 'high',
      replayRelevant: true,
      continuityRelevant: true,
      authRelevant: false,
      createdAt: args.input.timestamp,
    },
    captureBeforeState: () => null,
    executePersistence: async () => args.repository.appendEvent(args.input),
    captureAfterState: (persisted) => persisted.event,
    deriveEffect: ({ intent, afterState, sovereignAttestation }) => ({
      effectId: `${intent.intentId}:effect`,
      intentId: intent.intentId,
      effectType: 'governance.timeline.appended',
      domain: intent.domain,
      changedFields: ['governanceTimelineEvent'],
      institutionalMeaning: 'governance meaning was explicitly appended to the institutional evidence timeline',
      replayFingerprint: buildSemanticFingerprint(afterState),
      continuityLineageHash: sovereignAttestation.lineageHash,
      mutationLineageHash: '',
      verified: false,
    }),
  })
  return result
}

export async function appendGovernanceTimelineEventsWithSovereignAuthority(args: {
  repository: GovernanceEvidenceTimelineRepository
  inputs: AppendGovernanceEvidenceTimelineEventInput[]
  authority: SovereignAppendAuthority
}): Promise<AppendGovernanceEvidenceTimelineEventResult[]> {
  const { result } = await getSemanticMutationExecutor().executeSemanticMutation({
    authoritySource: args.authority.source,
    intent: {
      intentId: `${args.authority.source}:${args.inputs.length}`,
      intentType: 'governance.timeline.append_many',
      domain: 'governance',
      actor: 'governance',
      targetRef: {},
      semanticPurpose: 'append a deterministic batch of governance timeline interpretations',
      expectedInstitutionalEffect: ['governance_timeline_batch_recorded'],
      riskLevel: 'high',
      replayRelevant: true,
      continuityRelevant: true,
      authRelevant: false,
      createdAt: new Date().toISOString(),
    },
    captureBeforeState: () => null,
    executePersistence: async () => {
      const results: AppendGovernanceEvidenceTimelineEventResult[] = []
      for (const input of args.inputs) {
        results.push(await args.repository.appendEvent(input))
      }

      return results
    },
    captureAfterState: (persisted) => persisted.map((entry) => entry.event),
    deriveEffect: ({ intent, afterState, sovereignAttestation }) => ({
      effectId: `${intent.intentId}:effect`,
      intentId: intent.intentId,
      effectType: 'governance.timeline.batch_appended',
      domain: intent.domain,
      changedFields: ['governanceTimelineEventBatch'],
      institutionalMeaning: 'a replay-consistent batch of governance meaning was recorded',
      replayFingerprint: buildSemanticFingerprint(afterState),
      continuityLineageHash: sovereignAttestation.lineageHash,
      mutationLineageHash: '',
      verified: false,
    }),
  })
  return result
}
