import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createInstitutionalContinuityGovernanceService } from '../services/institutionalContinuityGovernanceService.js'
import { createObservabilityService } from '../services/observabilityService.js'
import { createRuntimeContinuityAttestationService } from '../services/runtimeContinuityAttestationService.js'
import { createRuntimeGovernanceService } from '../services/runtimeGovernanceService.js'
import { createInstitutionalSovereignMutationGate, installInstitutionalSovereignMutationGate } from './institutionalSovereignMutationGate.js'
import { createSemanticMutationExecutor, installSemanticMutationExecutor } from './semanticMutationExecutor.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'semantic-mutation-'))
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

  const gate = createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
  })
  installInstitutionalSovereignMutationGate(gate)
  const executor = createSemanticMutationExecutor({
    db: connection,
    observability,
  })
  installSemanticMutationExecutor(executor)

  return {
    connection,
    runtimeGovernance,
    executor,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('semantic mutation attestation is persisted and status reports coverage', async () => {
  const harness = await createHarness()

  try {
    const mutation = await harness.executor.executeSemanticMutation({
      authoritySource: 'test.semantic',
      intent: {
        intentId: 'intent:test:auth-register',
        intentType: 'auth.registration.bootstrap',
        domain: 'auth',
        actor: 'public',
        targetRef: { userId: '1', tenantId: '2' },
        semanticPurpose: 'bootstrap auth authority',
        expectedInstitutionalEffect: ['user_registered'],
        riskLevel: 'critical',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: true,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ user: null }),
      executePersistence: async () => ({ userId: 1, tenantId: 2 }),
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'auth.registration.completed',
        domain: intent.domain,
        changedFields: ['user', 'tenant'],
        institutionalMeaning: 'auth authority bootstrapped',
        replayFingerprint: JSON.stringify(afterState),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    })

    assert.equal(mutation.effect.verified, true)

    const row = await harness.connection.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM flowmind_semantic_mutation_attestation`,
    )
    assert.equal(row?.count, 1)

    const status = await harness.executor.getStatus()
    assert.equal(status.verifiedEffectCoverage, 100)
    assert.equal(Array.isArray(status.semanticMutationAuthorityGraph), true)
  } finally {
    await harness.close()
  }
})

test('semantic replay is deterministic for same intent and state and drift is detected', async () => {
  const harness = await createHarness()

  try {
    const buildMutation = () => harness.executor.executeSemanticMutation({
      authoritySource: 'test.semantic.replay',
      intent: {
        intentId: `intent:test:replay:${Math.random().toString(36).slice(2, 8)}`,
        intentType: 'governance.timeline.append',
        domain: 'governance',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'record timeline meaning',
        expectedInstitutionalEffect: ['governance_timeline_event_recorded'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ previous: null }),
      executePersistence: async () => ({ eventId: 'event-1', classification: 'UNSAFE' }),
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'governance.timeline.appended',
        domain: intent.domain,
        changedFields: ['governanceTimelineEvent'],
        institutionalMeaning: 'timeline meaning appended',
        replayFingerprint: JSON.stringify({
          beforeState,
          afterState,
          effectType: 'governance.timeline.appended',
        }),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    })

    const first = await buildMutation()
    const second = await buildMutation()
    assert.equal(first.effect.replayFingerprint, second.effect.replayFingerprint)

    await assert.rejects(() => harness.executor.executeSemanticMutation({
      authoritySource: 'test.semantic.drift',
      intent: {
        intentId: 'intent:test:drift',
        intentType: 'runtime.checkpoint.update',
        domain: 'checkpoint',
        actor: 'runtime',
        targetRef: { runtimeId: 'runtime-a' },
        semanticPurpose: 'persist checkpoint',
        expectedInstitutionalEffect: ['runtime_checkpoint_advanced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ checkpoint: 'a' }),
      executePersistence: async () => ({ checkpoint: 'b' }),
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.checkpoint.updated',
        domain: intent.domain,
        changedFields: [],
        institutionalMeaning: '',
        replayFingerprint: '',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    }))
  } finally {
    await harness.close()
  }
})

test('existing sovereign gate still blocks unsafe semantic mutation', async () => {
  const harness = await createHarness()

  try {
    harness.runtimeGovernance.registerStartupFailure({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      message: 'forced degraded mode',
    })

    await assert.rejects(() => harness.executor.executeSemanticMutation({
      authoritySource: 'test.semantic.blocked',
      intent: {
        intentId: 'intent:test:blocked',
        intentType: 'auth.refresh.rotate',
        domain: 'auth',
        actor: 'public',
        targetRef: { userId: '1' },
        semanticPurpose: 'rotate refresh authority',
        expectedInstitutionalEffect: ['refresh_session_rotated'],
        riskLevel: 'critical',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: true,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      executePersistence: async () => ({ ok: true }),
      deriveEffect: ({ intent, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'auth.refresh.rotation.completed',
        domain: intent.domain,
        changedFields: ['refreshSession'],
        institutionalMeaning: 'refresh authority rotated',
        replayFingerprint: 'fp',
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        verified: false,
      }),
    }))
  } finally {
    await harness.close()
  }
})
