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
import { createInstitutionalSovereignMutationGate, InstitutionalSovereignMutationBlockedError } from './institutionalSovereignMutationGate.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'institutional-sovereign-mutation-gate-'))
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

  return {
    connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
    gate,
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

test('institutionalSovereignMutationGate persists attestation for allowed mutation', async () => {
  const harness = await createHarness()

  try {
    const result = await harness.gate.evaluateAndExecute({
      authoritySource: 'test.allowed',
      context: baseContext(),
      work: async () => 'ok',
    })

    assert.equal(result, 'ok')

    const row = await harness.connection.get<{
      count: number
      lineage_hash: string
      governance_decision: string
      executed: number
    }>(
      `
        SELECT COUNT(*) AS count, MAX(lineage_hash) AS lineage_hash, MAX(governance_decision) AS governance_decision, MAX(executed) AS executed
        FROM flowmind_sovereign_mutation_attestation
      `,
    )
    assert.equal(row?.count, 1)
    assert.equal(row?.governance_decision, 'allowed')
    assert.equal(row?.executed, 1)
    assert.ok(row?.lineage_hash)
  } finally {
    await harness.close()
  }
})

test('institutionalSovereignMutationGate blocks mutation globally in degraded runtime', async () => {
  const harness = await createHarness()

  try {
    harness.runtimeGovernance.registerStartupFailure({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      message: 'synthetic degradation',
    })

    await assert.rejects(
      () => harness.gate.evaluateAndExecute({
        authoritySource: 'test.degraded',
        context: baseContext(),
        work: async () => 'blocked',
      }),
      (error: unknown) => {
        assert.ok(error instanceof InstitutionalSovereignMutationBlockedError)
        assert.equal(error.attestation.governanceDecision, 'blocked')
        assert.equal(error.attestation.runtimeMode, 'degraded')
        return true
      },
    )
  } finally {
    await harness.close()
  }
})

test('institutionalSovereignMutationGate blocks mutation on replay verification failure', async () => {
  const harness = await createHarness()

  try {
    ;(harness.runtimeContinuityAttestationService as unknown as {
      getStatus(): Record<string, unknown>
    }).getStatus = () => ({
      attestationIntegrity: 'verified',
      replayVerificationState: 'failed',
      recoveryRequired: true,
      brokenAttestationChains: ['replay failed'],
    })

    await assert.rejects(
      () => harness.gate.evaluateAndExecute({
        authoritySource: 'test.replay-failure',
        context: baseContext(),
        work: async () => 'blocked',
      }),
      (error: unknown) => {
        assert.ok(error instanceof InstitutionalSovereignMutationBlockedError)
        assert.equal(error.attestation.replayVerificationState, 'failed')
        return true
      },
    )
  } finally {
    await harness.close()
  }
})

test('institutionalSovereignMutationGate blocks mutation when recovery is required', async () => {
  const harness = await createHarness()

  try {
    await harness.continuityGovernance.registerPersistenceTruthfulnessFailure({
      reason: 'synthetic continuity failure',
      entityId: 'entity-recovery-required',
      now: '2026-05-12T00:00:00.000Z',
    })

    await assert.rejects(
      () => harness.gate.evaluateAndExecute({
        authoritySource: 'test.recovery-required',
        context: baseContext(),
        work: async () => 'blocked',
      }),
      (error: unknown) => {
        assert.ok(error instanceof InstitutionalSovereignMutationBlockedError)
        assert.equal(error.attestation.continuityMode, 'continuity_untrusted')
        return true
      },
    )
  } finally {
    await harness.close()
  }
})

test('institutionalSovereignMutationGate records bypass attempt when capability is blank', async () => {
  const harness = await createHarness()

  try {
    await assert.rejects(
      () => harness.gate.evaluateAndExecute({
        authoritySource: 'test.bypass-attempt',
        context: {
          ...baseContext(),
          requestedCapability: '',
        },
        work: async () => 'blocked',
      }),
      (error: unknown) => {
        assert.ok(error instanceof InstitutionalSovereignMutationBlockedError)
        return true
      },
    )

    const metrics = harness.observability.getMetricsSnapshot()
    assert.equal(metrics.customCounters.institutional_mutation_bypass_attempt_total, 1)
  } finally {
    await harness.close()
  }
})
