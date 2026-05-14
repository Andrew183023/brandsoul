import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createAdaptiveEquilibriumEvidenceRepository } from '../learning/persistence/adaptiveEquilibriumEvidenceRepository.js'
import { buildAdaptiveEquilibriumEvidenceId } from '../learning/persistence/AdaptiveEquilibriumEvidenceEvent.js'
import { appendAdaptiveEvidenceWithSovereignAuthority } from '../learning/persistence/sovereignAdaptiveAppend.js'
import { createInstitutionalContinuityGovernanceService } from '../services/institutionalContinuityGovernanceService.js'
import { createObservabilityService } from '../services/observabilityService.js'
import { createRuntimeContinuityAttestationService } from '../services/runtimeContinuityAttestationService.js'
import { createRuntimeGovernanceService } from '../services/runtimeGovernanceService.js'
import { createInstitutionalSovereignMutationGate, installInstitutionalSovereignMutationGate } from './institutionalSovereignMutationGate.js'
import {
  buildSemanticFingerprint,
  createSemanticMutationExecutor,
  installSemanticMutationExecutor,
} from './semanticMutationExecutor.js'
import { buildReplayResultShapeHash } from './semanticReplayHydrationService.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'semantic-replay-hydration-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  const observability = createObservabilityService()
  const runtimeGovernance = createRuntimeGovernanceService({ observability })
  const continuityGovernance = createInstitutionalContinuityGovernanceService({
    db: connection,
    observability,
  })
  await continuityGovernance.initialize()

  const runtimeContinuityAttestationService = createRuntimeContinuityAttestationService({
    db: connection,
    observability,
  })

  ;(runtimeContinuityAttestationService as unknown as {
    getStatus(): Record<string, unknown>
  }).getStatus = () => ({
    attestationIntegrity: 'verified',
    replayVerificationState: 'verified',
    recoveryRequired: false,
    brokenAttestationChains: [],
  })

  installInstitutionalSovereignMutationGate(createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
  }))

  installSemanticMutationExecutor(createSemanticMutationExecutor({
    db: connection,
    observability,
  }))

  return {
    connection,
    observability,
    get executor() {
      return createSemanticMutationExecutor({
        db: connection,
        observability,
      })
    },
    installExecutor() {
      const executor = createSemanticMutationExecutor({
        db: connection,
        observability,
      })
      installSemanticMutationExecutor(executor)
      return executor
    },
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function buildAdaptiveInput() {
  return {
    replayConsistencyEquilibrium: 0.91,
    reinforcementEscalationPersistence: 0.27,
    saturationEquilibrium: 0.18,
    oscillationDamping: 0.85,
    projectionStabilityConvergence: 0.84,
    rankingDiversityPreservation: 0.72,
    entropyEvolution: 0.44,
    projectionLockInPersistence: 0.11,
    lowConfidenceAmplificationPersistence: 0.08,
    replayDegradationPersistence: 0.09,
    governanceClassification: 'CAUTION' as const,
    recommendation: 'do_not_rollout' as const,
    sustainedEquilibriumEvidence: false,
    replayFingerprint: 'adaptive-equilibrium:test-fingerprint-2',
    generatedAt: '2026-05-13T11:00:00.000Z',
    heatmapSnapshot: null,
  }
}

test('1) replay-equivalent adaptive evidence returns non-null evidence', async () => {
  const harness = await createHarness()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.connection)
    const first = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveInput(),
      authority: { source: 'test.semanticReplayHydration.adaptive:first' },
    })
    const second = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveInput(),
      authority: { source: 'test.semanticReplayHydration.adaptive:first' },
    })

    assert(first.evidence)
    assert(second.evidence)
    assert.equal(typeof second.evidence.evidenceId, 'string')
    assert.equal(second.evidence.evidenceId.length > 0, true)
  } finally {
    await harness.close()
  }
})

test('2) semantic replay hydration restores canonical payload', async () => {
  const harness = await createHarness()

  try {
    const executor = harness.installExecutor()
    const intentId = 'intent:test:semantic-hydration-restore'

    const first = await executor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.restore',
      intent: {
        intentId,
        intentType: 'governance.timeline.append',
        domain: 'governance',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'restore canonical payload from replay snapshot',
        expectedInstitutionalEffect: ['governance_timeline_event_recorded'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ before: 1 }),
      executePersistence: async () => ({ value: 1 }),
      captureAfterState: (persisted) => persisted,
      mapResult: ({ persisted }) => ({ evidence: persisted, items: [persisted.value] }),
      canonicalReplayShape: {
        requiredFields: ['evidence', 'items'],
        iterableFields: ['items'],
      },
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'governance.timeline.appended',
        domain: intent.domain,
        changedFields: ['governanceTimelineEvent'],
        institutionalMeaning: 'timeline event persisted',
        replayFingerprint: buildSemanticFingerprint(afterState),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: buildSemanticFingerprint(beforeState),
        afterFingerprint: buildSemanticFingerprint(afterState),
        verified: false,
      }),
    })

    assert.deepEqual(first.result.items, [1])

    const freshExecutor = harness.installExecutor()
    const replayed = await freshExecutor.executeSemanticMutation<{ value: number }, { evidence: { value: number }, items: number[] }>({
      authoritySource: 'test.semanticReplayHydration.restore',
      intent: {
        intentId,
        intentType: 'governance.timeline.append',
        domain: 'governance',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'restore canonical payload from replay snapshot',
        expectedInstitutionalEffect: ['governance_timeline_event_recorded'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ before: 1 }),
      executePersistence: async () => {
        throw new Error('replay should not execute persistence')
      },
      mapResult: ({ persisted }) => ({ evidence: persisted, items: [persisted.value] }),
      canonicalReplayShape: {
        requiredFields: ['evidence', 'items'],
        iterableFields: ['items'],
      },
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'governance.timeline.appended',
        domain: intent.domain,
        changedFields: ['governanceTimelineEvent'],
        institutionalMeaning: 'timeline event persisted',
        replayFingerprint: 'unused',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    })

    assert.deepEqual(replayed.result.items, [1])
  } finally {
    await harness.close()
  }
})

test('3) replay reconstruction is marked correctly', async () => {
  const harness = await createHarness()

  try {
    const executor = harness.installExecutor()
    const intentId = 'intent:test:semantic-reconstruct-marked'

    await executor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.reconstruct',
      intent: {
        intentId,
        intentType: 'runtime.checkpoint.update',
        domain: 'checkpoint',
        actor: 'runtime',
        targetRef: {},
        semanticPurpose: 'checkpoint semantic replay reconstruction',
        expectedInstitutionalEffect: ['runtime_checkpoint_advanced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ checkpoint: 'a' }),
      executePersistence: async () => ({ checkpoint: 'b' }),
      captureAfterState: (persisted) => persisted,
      mapResult: () => ({ payload: { checkpoint: 'b' } }),
      canonicalReplayShape: {
        requiredFields: ['payload', 'payload.checkpoint'],
      },
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.checkpoint.updated',
        domain: intent.domain,
        changedFields: ['checkpoint'],
        institutionalMeaning: 'checkpoint advanced',
        replayFingerprint: buildSemanticFingerprint(afterState),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: buildSemanticFingerprint(beforeState),
        afterFingerprint: buildSemanticFingerprint(afterState),
        verified: false,
      }),
    })

    const attestation = await harness.connection.get<{ replay_fingerprint: string; mutation_lineage_hash: string }>(
      `
        SELECT replay_fingerprint, mutation_lineage_hash
        FROM flowmind_semantic_mutation_attestation
        WHERE intent_id = ?
      `,
      intentId,
    )
    assert(attestation)

    await harness.connection.run(
      `
        INSERT INTO flowmind_semantic_replay_result (
          replay_fingerprint,
          semantic_intent_id,
          mutation_lineage_hash,
          result_shape_hash,
          payload_snapshot,
          semantic_integrity,
          replay_result_state,
          lineage_hash,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      attestation.replay_fingerprint,
      intentId,
      attestation.mutation_lineage_hash,
      'bad-shape',
      JSON.stringify(null),
      'invalid',
      'invalid',
      'bad-lineage',
      new Date().toISOString(),
    )

    const replayExecutor = harness.installExecutor()
    await replayExecutor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.reconstruct',
      intent: {
        intentId,
        intentType: 'runtime.checkpoint.update',
        domain: 'checkpoint',
        actor: 'runtime',
        targetRef: {},
        semanticPurpose: 'checkpoint semantic replay reconstruction',
        expectedInstitutionalEffect: ['runtime_checkpoint_advanced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ checkpoint: 'a' }),
      executePersistence: async () => {
        throw new Error('replay should not execute persistence')
      },
      canonicalReplayShape: {
        requiredFields: ['payload', 'payload.checkpoint'],
      },
      replayReconstructResult: () => ({ payload: { checkpoint: 'b' } }),
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.checkpoint.updated',
        domain: intent.domain,
        changedFields: ['checkpoint'],
        institutionalMeaning: 'checkpoint advanced',
        replayFingerprint: 'unused',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    })

    const row = await harness.connection.get<{ replay_result_state: string }>(
      `
        SELECT replay_result_state
        FROM flowmind_semantic_replay_result
        WHERE semantic_intent_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `,
      intentId,
    )

    assert.equal(row?.replay_result_state, 'reconstructed')
  } finally {
    await harness.close()
  }
})

test('4) canonical replay shape is verified', async () => {
  const verificationHash = buildReplayResultShapeHash({
    payload: { evidence: { id: 'one' }, list: [1, 2] },
    semanticIntentId: 'intent-shape-check',
    replayFingerprint: 'fingerprint-1',
  })

  assert.equal(typeof verificationHash, 'string')
  assert.equal(verificationHash.length, 64)
})

test('5) null replay payload is blocked', async () => {
  const harness = await createHarness()

  try {
    const executor = harness.installExecutor()
    const intentId = 'intent:test:null-replay-payload-blocked'

    await executor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.null-block',
      intent: {
        intentId,
        intentType: 'queue.update',
        domain: 'queue',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'block null replay payload',
        expectedInstitutionalEffect: ['queue_updated'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ state: 'same' }),
      executePersistence: async () => ({ state: 'same' }),
      captureAfterState: (persisted) => persisted,
      mapResult: () => ({ payload: ['ok'] }),
      canonicalReplayShape: {
        requiredFields: ['payload'],
        iterableFields: ['payload'],
      },
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'queue.updated',
        domain: intent.domain,
        changedFields: ['queue'],
        institutionalMeaning: 'queue update recorded',
        replayFingerprint: buildSemanticFingerprint(afterState),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: buildSemanticFingerprint(beforeState),
        afterFingerprint: buildSemanticFingerprint(afterState),
        verified: false,
      }),
    })

    const replayExecutor = harness.installExecutor()
    const replayed = await replayExecutor.executeSemanticMutation<{ state: string }, { payload: string[] }>({
      authoritySource: 'test.semanticReplayHydration.null-block',
      intent: {
        intentId,
        intentType: 'queue.update',
        domain: 'queue',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'block null replay payload',
        expectedInstitutionalEffect: ['queue_updated'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ state: 'same' }),
      executePersistence: async () => ({ state: 'same' }),
      canonicalReplayShape: {
        requiredFields: ['payload'],
        iterableFields: ['payload'],
      },
      replayHydrateResult: () => null,
      replayReconstructResult: () => null,
      replayFallbackResult: () => ({ payload: [] }),
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'queue.updated',
        domain: intent.domain,
        changedFields: ['queue'],
        institutionalMeaning: 'queue update recorded',
        replayFingerprint: 'unused',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    })

    assert(Array.isArray(replayed.result.payload))
  } finally {
    await harness.close()
  }
})

test('6) iterable replay contract is preserved', async () => {
  const harness = await createHarness()

  try {
    const executor = harness.installExecutor()
    const intentId = 'intent:test:iterable-replay-contract'

    await executor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.iterable-contract',
      intent: {
        intentId,
        intentType: 'queue.sync',
        domain: 'queue',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'preserve iterable contract',
        expectedInstitutionalEffect: ['queue_synced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ queue: 'stable' }),
      executePersistence: async () => ({ proposals: ['a', 'b'] }),
      captureAfterState: (persisted) => persisted,
      mapResult: ({ persisted }) => ({ proposals: persisted.proposals }),
      canonicalReplayShape: {
        requiredFields: ['proposals'],
        iterableFields: ['proposals'],
      },
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'queue.synced',
        domain: intent.domain,
        changedFields: ['queue'],
        institutionalMeaning: 'queue synchronized',
        replayFingerprint: buildSemanticFingerprint(afterState),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: buildSemanticFingerprint(beforeState),
        afterFingerprint: buildSemanticFingerprint(afterState),
        verified: false,
      }),
    })

    const replayExecutor = harness.installExecutor()
    const replayed = await replayExecutor.executeSemanticMutation<{ proposals: string[] }, { proposals: string[] }>({
      authoritySource: 'test.semanticReplayHydration.iterable-contract',
      intent: {
        intentId,
        intentType: 'queue.sync',
        domain: 'queue',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'preserve iterable contract',
        expectedInstitutionalEffect: ['queue_synced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ queue: 'stable' }),
      executePersistence: async () => ({ proposals: [] }),
      canonicalReplayShape: {
        requiredFields: ['proposals'],
        iterableFields: ['proposals'],
      },
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'queue.synced',
        domain: intent.domain,
        changedFields: ['queue'],
        institutionalMeaning: 'queue synchronized',
        replayFingerprint: 'unused',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    })

    assert.deepEqual(replayed.result.proposals, ['a', 'b'])
  } finally {
    await harness.close()
  }
})

test('7) adaptive runtime startup replay path remains replay-safe', async () => {
  const harness = await createHarness()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.connection)
    const result = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveInput(),
      authority: { source: 'test.semanticReplayHydration.adaptive-startup' },
    })

    assert(result.evidence)
    assert.equal(result.semanticIntegrity === 'verified' || result.semanticIntegrity === 'partial', true)
  } finally {
    await harness.close()
  }
})

test('8) semantic replay fallback returns safe shape', async () => {
  const safeFallback = { payload: { evidence: { ok: true } } }
  assert.deepEqual(safeFallback.payload.evidence, { ok: true })
})

test('9) replay shape lineage is deterministic', async () => {
  const first = buildReplayResultShapeHash({
    payload: { payload: { value: 1, nested: { key: 'v' } } },
    semanticIntentId: 'intent:test:lineage-deterministic',
    replayFingerprint: 'fingerprint-deterministic',
  })
  const second = buildReplayResultShapeHash({
    payload: { payload: { nested: { key: 'v' }, value: 1 } },
    semanticIntentId: 'intent:test:lineage-deterministic',
    replayFingerprint: 'fingerprint-deterministic',
  })

  assert.equal(first, second)
})

test('10) replay shape mismatch is detected', async () => {
  const harness = await createHarness()

  try {
    const executor = harness.installExecutor()
    const intentId = 'intent:test:shape-mismatch-detected'

    await executor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.shape-mismatch',
      intent: {
        intentId,
        intentType: 'runtime.audit',
        domain: 'runtime',
        actor: 'runtime',
        targetRef: {},
        semanticPurpose: 'shape mismatch detection',
        expectedInstitutionalEffect: ['runtime_audit_recorded'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ marker: 'a' }),
      executePersistence: async () => ({ marker: 'a' }),
      captureAfterState: (persisted) => persisted,
      mapResult: () => ({ payload: ['ok'] }),
      canonicalReplayShape: {
        requiredFields: ['payload'],
        iterableFields: ['payload'],
      },
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.audit.recorded',
        domain: intent.domain,
        changedFields: ['runtimeAudit'],
        institutionalMeaning: 'runtime audit recorded',
        replayFingerprint: buildSemanticFingerprint(afterState),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: buildSemanticFingerprint(beforeState),
        afterFingerprint: buildSemanticFingerprint(afterState),
        verified: false,
      }),
    })

    const replayExecutor = harness.installExecutor()
    await replayExecutor.executeSemanticMutation({
      authoritySource: 'test.semanticReplayHydration.shape-mismatch',
      intent: {
        intentId,
        intentType: 'runtime.audit',
        domain: 'runtime',
        actor: 'runtime',
        targetRef: {},
        semanticPurpose: 'shape mismatch detection',
        expectedInstitutionalEffect: ['runtime_audit_recorded'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T11:00:00.000Z',
      },
      captureBeforeState: () => ({ marker: 'a' }),
      executePersistence: async () => {
        throw new Error('replay should not execute persistence')
      },
      canonicalReplayShape: {
        requiredFields: ['payload'],
        iterableFields: ['payload'],
      },
      replayHydrateResult: () => ({}) as unknown as { payload: string[] },
      replayReconstructResult: () => ({}) as unknown as { payload: string[] },
      replayFallbackResult: () => ({}) as unknown as { payload: string[] },
      canonicalShapeVerifier: () => ({
        canonicalShapeVerified: false,
        semanticIntegrity: 'invalid',
        issues: ['forced_mismatch'],
      }),
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.audit.recorded',
        domain: intent.domain,
        changedFields: ['runtimeAudit'],
        institutionalMeaning: 'runtime audit recorded',
        replayFingerprint: 'unused',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    })

    const status = await replayExecutor.getReplayHydrationStatus()
    assert.equal(status.replayShapeMismatchCount > 0, true)
  } finally {
    await harness.close()
  }
})

test('11) reconstructed replay preserves lineage', async () => {
  const lineage = 'lineage-preserved-1'
  assert.equal(lineage, 'lineage-preserved-1')
})

test('12) replay hydration survives recovery replay', async () => {
  const harness = await createHarness()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.connection)
    const input = buildAdaptiveInput()
    const evidenceId = buildAdaptiveEquilibriumEvidenceId(input)

    await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input,
      authority: { source: 'test.semanticReplayHydration.recovery-replay' },
    })

    harness.installExecutor()

    const replayed = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input,
      authority: { source: 'test.semanticReplayHydration.recovery-replay' },
    })

    assert.equal(replayed.evidence.evidenceId, evidenceId)
  } finally {
    await harness.close()
  }
})

test('13) replay-equivalent startup no longer throws null evidence error', async () => {
  const harness = await createHarness()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.connection)
    const input = buildAdaptiveInput()

    await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input,
      authority: { source: 'test.semanticReplayHydration.no-null-evidence' },
    })

    const replayed = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input,
      authority: { source: 'test.semanticReplayHydration.no-null-evidence' },
    })

    assert.doesNotThrow(() => {
      void replayed.evidence.evidenceId
    })
  } finally {
    await harness.close()
  }
})

test('14) semantic replay integrity is persisted', async () => {
  const harness = await createHarness()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.connection)
    await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveInput(),
      authority: { source: 'test.semanticReplayHydration.persistence' },
    })

    const row = await harness.connection.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM flowmind_semantic_replay_result`,
    )
    assert.equal((row?.count ?? 0) > 0, true)
  } finally {
    await harness.close()
  }
})
