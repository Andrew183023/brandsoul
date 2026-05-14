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
  const workspace = await mkdtemp(path.join(tmpdir(), 'sovereign-idempotency-'))
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
  ;(runtimeContinuityAttestationService as unknown as { getStatus(): Record<string, unknown> }).getStatus = () => ({
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

  const semanticExecutor = createSemanticMutationExecutor({
    db: connection,
    observability,
  })
  installSemanticMutationExecutor(semanticExecutor)

  return {
    connection,
    observability,
    gate,
    semanticExecutor,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function baseContext() {
  return {
    mutationType: 'test.mutation',
    mutationScope: 'entity' as const,
    requestedCapability: 'orchestrator.command.execute',
    runtimeMode: 'normal',
    continuityMode: 'institutional_safe',
    replayVerificationState: 'verified',
    attestationIntegrity: 'verified',
    recoveryRequired: false,
    actor: 'admin' as const,
    traceId: 'trace:test:mutation',
  }
}

test('duplicate sovereign mutation deduplicated', async () => {
  const harness = await createHarness()

  try {
    let executions = 0
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.duplicate.1',
      mutationId: 'mutation-duplicate-1',
      context: baseContext(),
      work: async () => {
        executions += 1
        return { ok: true }
      },
    })

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.duplicate.2',
      mutationId: 'mutation-duplicate-1',
      context: baseContext(),
      work: async () => {
        executions += 1
        return { ok: true }
      },
    })

    assert.equal(executions, 1)
  } finally {
    await harness.close()
  }
})

test('replay-equivalent execution returns same result', async () => {
  const harness = await createHarness()

  try {
    const first = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.result.1',
      mutationId: 'mutation-replay-equivalent-1',
      context: baseContext(),
      work: async () => ({ status: 'ok', value: 42 }),
    }) as { status: string; value: number }

    const second = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.result.2',
      mutationId: 'mutation-replay-equivalent-1',
      context: baseContext(),
      work: async () => ({ status: 'different', value: 99 }),
    }) as { status: string; value: number }

    assert.deepEqual(second, first)
  } finally {
    await harness.close()
  }
})

test('deduplicated mutation returns same type shape', async () => {
  const harness = await createHarness()

  try {
    const context = {
      ...baseContext(),
      mutationScope: 'queue' as const,
      actor: 'runtime' as const,
      traceId: 'trace:result-shape:array',
    }

    const first = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.shape.1',
      mutationId: 'mutation-shape-array-1',
      context,
      work: async () => [{ proposalId: 'proposal-1' }],
    }) as Array<{ proposalId: string }>

    const second = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.shape.2',
      mutationId: 'mutation-shape-array-1',
      context,
      replayEquivalentResult: () => [],
      work: async () => [{ proposalId: 'proposal-2' }],
    }) as Array<{ proposalId: string }>

    assert.equal(Array.isArray(first), true)
    assert.equal(Array.isArray(second), true)
    assert.deepEqual(second, first)
  } finally {
    await harness.close()
  }
})

test('attestation duplicate prevented', async () => {
  const harness = await createHarness()

  try {
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.attestation.1',
      mutationId: 'mutation-attestation-1',
      context: baseContext(),
      work: async () => 'ok',
    })
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.idempotency.attestation.2',
      mutationId: 'mutation-attestation-1',
      context: baseContext(),
      work: async () => 'ok',
    })

    const row = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_sovereign_mutation_attestation WHERE mutation_id = ?',
      'mutation-attestation-1',
    )
    assert.equal(row?.count, 1)
  } finally {
    await harness.close()
  }
})

test('semantic replay equivalence deterministic', async () => {
  const harness = await createHarness()

  try {
    let persistenceWrites = 0
    const intentId = 'semantic-intent-deterministic-1'

    const first = await harness.semanticExecutor.executeSemanticMutation({
      authoritySource: 'test.semantic.idempotency.1',
      intent: {
        intentId,
        intentType: 'governance.timeline.append',
        domain: 'governance',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'append deterministic governance meaning',
        expectedInstitutionalEffect: ['timeline_event_appended'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ state: 'before' }),
      executePersistence: async () => {
        persistenceWrites += 1
        return { persisted: true }
      },
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'governance.timeline.appended',
        domain: intent.domain,
        changedFields: ['timeline'],
        institutionalMeaning: 'timeline meaning appended',
        replayFingerprint: JSON.stringify({ beforeState, afterState }),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    })

    const second = await harness.semanticExecutor.executeSemanticMutation({
      authoritySource: 'test.semantic.idempotency.2',
      intent: {
        intentId,
        intentType: 'governance.timeline.append',
        domain: 'governance',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'append deterministic governance meaning',
        expectedInstitutionalEffect: ['timeline_event_appended'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ state: 'before' }),
      executePersistence: async () => {
        persistenceWrites += 1
        return { persisted: true }
      },
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'governance.timeline.appended',
        domain: intent.domain,
        changedFields: ['timeline'],
        institutionalMeaning: 'timeline meaning appended',
        replayFingerprint: JSON.stringify({ beforeState, afterState }),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    })

    assert.equal(persistenceWrites, 1)
    assert.equal(second.effect.replayFingerprint, first.effect.replayFingerprint)
  } finally {
    await harness.close()
  }
})

test('replay drift detected', async () => {
  const harness = await createHarness()

  try {
    const intentId = 'semantic-intent-drift-1'

    await harness.semanticExecutor.executeSemanticMutation({
      authoritySource: 'test.semantic.drift.seed',
      intent: {
        intentId,
        intentType: 'runtime.checkpoint.update',
        domain: 'checkpoint',
        actor: 'runtime',
        targetRef: { runtimeId: 'runtime-a' },
        semanticPurpose: 'persist checkpoint',
        expectedInstitutionalEffect: ['checkpoint_advanced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ checkpoint: 'a' }),
      executePersistence: async () => ({ checkpoint: 'b' }),
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.checkpoint.updated',
        domain: intent.domain,
        changedFields: ['checkpoint'],
        institutionalMeaning: 'checkpoint advanced',
        replayFingerprint: JSON.stringify({ beforeState, afterState }),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    })

    await assert.rejects(() => harness.semanticExecutor.executeSemanticMutation({
      authoritySource: 'test.semantic.drift.replay',
      intent: {
        intentId,
        intentType: 'runtime.checkpoint.update',
        domain: 'checkpoint',
        actor: 'runtime',
        targetRef: { runtimeId: 'runtime-a' },
        semanticPurpose: 'persist checkpoint',
        expectedInstitutionalEffect: ['checkpoint_advanced'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ checkpoint: 'different' }),
      executePersistence: async () => ({ checkpoint: 'c' }),
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'runtime.checkpoint.updated',
        domain: intent.domain,
        changedFields: ['checkpoint'],
        institutionalMeaning: 'checkpoint advanced',
        replayFingerprint: JSON.stringify({ beforeState, afterState }),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    }))
  } finally {
    await harness.close()
  }
})

test('recovery replay deduplicated', async () => {
  const harness = await createHarness()

  try {
    let writes = 0
    const context = {
      ...baseContext(),
      mutationScope: 'replay' as const,
      actor: 'recovery' as const,
      traceId: 'trace:recovery:dedupe',
    }

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.recovery.replay.1',
      mutationId: 'recovery-mutation-1',
      context,
      work: async () => {
        writes += 1
        return 'ok'
      },
    })
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.recovery.replay.2',
      mutationId: 'recovery-mutation-1',
      context,
      work: async () => {
        writes += 1
        return 'ok'
      },
    })

    assert.equal(writes, 1)
    const metrics = harness.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.recovery_replay_deduplicated_total ?? 0) > 0, true)
  } finally {
    await harness.close()
  }
})

test('repeated startup replay produces no duplicate effects', async () => {
  const harness = await createHarness()

  try {
    let writes = 0
    const context = {
      ...baseContext(),
      mutationScope: 'runtime' as const,
      actor: 'runtime' as const,
      traceId: 'trace:startup:replay',
    }

    for (let index = 0; index < 3; index += 1) {
      await harness.gate.evaluateAndExecute({
        authoritySource: `test.startup.replay.${index}`,
        mutationId: 'startup-replay-mutation-1',
        context,
        work: async () => {
          writes += 1
          return { ok: true }
        },
      })
    }

    assert.equal(writes, 1)
  } finally {
    await harness.close()
  }
})

test('checkpoint replay idempotent', async () => {
  const harness = await createHarness()

  try {
    let writes = 0
    const context = {
      ...baseContext(),
      mutationScope: 'checkpoint' as const,
      actor: 'runtime' as const,
      traceId: 'trace:checkpoint:replay',
    }

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.checkpoint.1',
      mutationId: 'checkpoint-mutation-1',
      context,
      work: async () => {
        writes += 1
        return 'checkpoint-ok'
      },
    })
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.checkpoint.2',
      mutationId: 'checkpoint-mutation-1',
      context,
      work: async () => {
        writes += 1
        return 'checkpoint-ok'
      },
    })

    assert.equal(writes, 1)
  } finally {
    await harness.close()
  }
})

test('queue replay equivalence preserved', async () => {
  const harness = await createHarness()

  try {
    const context = {
      ...baseContext(),
      mutationScope: 'queue' as const,
      actor: 'runtime' as const,
      traceId: 'trace:queue:replay',
    }

    const first = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.queue.1',
      mutationId: 'queue-mutation-1',
      context,
      work: async () => ({ queueState: 'drained', count: 10 }),
    }) as { queueState: string; count: number }

    const second = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.queue.2',
      mutationId: 'queue-mutation-1',
      context,
      work: async () => ({ queueState: 'changed', count: 999 }),
    }) as { queueState: string; count: number }

    assert.deepEqual(second, first)
  } finally {
    await harness.close()
  }
})

test('lineage replay equivalence deterministic', async () => {
  const harness = await createHarness()

  try {
    const context = {
      ...baseContext(),
      traceId: 'trace:lineage:deterministic',
    }

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.lineage.1',
      mutationId: 'lineage-mutation-1',
      context,
      work: async () => 'ok',
    })

    const row = await harness.connection.get<{
      mutation_lineage_hash: string
      lineage_hash: string
    }>(
      `
        SELECT mutation_lineage_hash, lineage_hash
        FROM flowmind_sovereign_mutation_registry
        WHERE mutation_id = ?
      `,
      'lineage-mutation-1',
    )

    assert.ok((row?.mutation_lineage_hash ?? '').length > 0)
    assert.ok((row?.lineage_hash ?? '').length > 0)
  } finally {
    await harness.close()
  }
})

test('duplicate semantic effect blocked', async () => {
  const harness = await createHarness()

  try {
    const intentId = 'semantic-intent-duplicate-effect-1'

    const execute = () => harness.semanticExecutor.executeSemanticMutation({
      authoritySource: 'test.semantic.duplicate.effect',
      intent: {
        intentId,
        intentType: 'governance.timeline.append',
        domain: 'governance',
        actor: 'governance',
        targetRef: {},
        semanticPurpose: 'append once',
        expectedInstitutionalEffect: ['timeline_once'],
        riskLevel: 'high',
        replayRelevant: true,
        continuityRelevant: true,
        authRelevant: false,
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      captureBeforeState: () => ({ same: true }),
      executePersistence: async () => ({ ok: true }),
      captureAfterState: (persisted) => persisted,
      deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
        effectId: `${intent.intentId}:effect`,
        intentId: intent.intentId,
        effectType: 'governance.timeline.appended',
        domain: intent.domain,
        changedFields: ['timeline'],
        institutionalMeaning: 'timeline once',
        replayFingerprint: JSON.stringify({ beforeState, afterState }),
        continuityLineageHash: sovereignAttestation.lineageHash,
        mutationLineageHash: '',
        beforeFingerprint: JSON.stringify(beforeState),
        afterFingerprint: JSON.stringify(afterState),
        verified: false,
      }),
    })

    await execute()
    await execute()

    const row = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_semantic_mutation_attestation WHERE intent_id = ?',
      intentId,
    )
    assert.equal(row?.count, 1)
  } finally {
    await harness.close()
  }
})

test('replay-equivalent mutation preserves timestamps', async () => {
  const harness = await createHarness()

  try {
    const mutationId = 'mutation-preserve-timestamp-1'
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.timestamp.1',
      mutationId,
      context: baseContext(),
      work: async () => 'ok',
    })

    const first = await harness.connection.get<{ created_at: string }>(
      'SELECT created_at FROM flowmind_sovereign_mutation_attestation WHERE mutation_id = ?',
      mutationId,
    )

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.timestamp.2',
      mutationId,
      context: baseContext(),
      work: async () => 'ok',
    })

    const second = await harness.connection.get<{ created_at: string }>(
      'SELECT created_at FROM flowmind_sovereign_mutation_attestation WHERE mutation_id = ?',
      mutationId,
    )

    assert.equal(second?.created_at, first?.created_at)
  } finally {
    await harness.close()
  }
})

test('replay collision classified correctly', async () => {
  const harness = await createHarness()

  try {
    let writes = 0
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.collision.1',
      mutationId: 'mutation-collision-1',
      context: {
        ...baseContext(),
        traceId: 'trace:collision:original',
      },
      work: async () => {
        writes += 1
        return 'ok'
      },
    })

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.collision.2',
      mutationId: 'mutation-collision-1',
      context: {
        ...baseContext(),
        traceId: 'trace:collision:replay',
      },
      work: async () => {
        writes += 1
        return 'ok'
      },
    })

    assert.equal(writes, 1)
    const metrics = harness.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.sovereign_mutation_replay_collision_total ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})

test('mutation registry persists lineage correctly', async () => {
  const harness = await createHarness()

  try {
    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.registry.lineage',
      mutationId: 'mutation-registry-lineage-1',
      context: {
        ...baseContext(),
        traceId: 'trace:registry:lineage',
      },
      work: async () => ({ ok: true }),
    })

    const row = await harness.connection.get<{
      mutation_id: string
      mutation_lineage_hash: string
      lineage_hash: string
      result_fingerprint: string | null
      replay_result_shape: string | null
      execution_count: number
      last_execution_state: string
    }>(
      `
        SELECT mutation_id, mutation_lineage_hash, lineage_hash, result_fingerprint, replay_result_shape, execution_count, last_execution_state
        FROM flowmind_sovereign_mutation_registry
        WHERE mutation_id = ?
      `,
      'mutation-registry-lineage-1',
    )

    assert.equal(row?.mutation_id, 'mutation-registry-lineage-1')
    assert.ok((row?.mutation_lineage_hash ?? '').length > 0)
    assert.ok((row?.lineage_hash ?? '').length > 0)
    assert.ok((row?.result_fingerprint ?? '').length > 0)
    assert.equal(row?.replay_result_shape, 'object:{ok}')
    assert.equal((row?.execution_count ?? 0) >= 1, true)
    assert.equal(row?.last_execution_state, 'executed')
  } finally {
    await harness.close()
  }
})

test('replay-equivalent metadata remains observable', async () => {
  const harness = await createHarness()

  try {
    const context = {
      ...baseContext(),
      mutationScope: 'queue' as const,
      actor: 'runtime' as const,
      traceId: 'trace:observable:replay-equivalent',
    }

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.observable.replay.1',
      mutationId: 'mutation-observable-1',
      context,
      work: async () => [{ proposalId: 'proposal-observable-1' }],
    })

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.observable.replay.2',
      mutationId: 'mutation-observable-1',
      context,
      replayEquivalentResult: () => [],
      work: async () => [{ proposalId: 'proposal-observable-2' }],
    })

    const metrics = harness.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.sovereign_mutation_replay_equivalent_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounters.sovereign_mutation_deduplicated_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounters.sovereign_mutation_result_contract_preserved_total ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})
