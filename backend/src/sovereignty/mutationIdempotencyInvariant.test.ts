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
import { createInstitutionalSovereignMutationGate } from './institutionalSovereignMutationGate.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'mutation-idempotency-invariant-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({ provider: 'sqlite', sqliteFile })
  await initializeDatabase(connection)

  const observability = createObservabilityService()
  const runtimeGovernance = createRuntimeGovernanceService({ observability })
  const continuityGovernance = createInstitutionalContinuityGovernanceService({ db: connection, observability })
  await continuityGovernance.initialize()
  const runtimeContinuityAttestationService = createRuntimeContinuityAttestationService({ db: connection, observability })
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

  return {
    connection,
    gate,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('mutationIdempotencyInvariant prevents duplicate persistence and preserves replay-equivalent side effects', async () => {
  const harness = await createHarness()

  try {
    let sideEffects = 0
    const context = {
      mutationType: 'invariant.mutation',
      mutationScope: 'entity' as const,
      requestedCapability: 'orchestrator.command.execute',
      runtimeMode: 'normal',
      continuityMode: 'institutional_safe',
      replayVerificationState: 'verified',
      attestationIntegrity: 'verified',
      recoveryRequired: false,
      actor: 'admin' as const,
      traceId: 'trace:invariant:1',
    }

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.invariant.1',
      mutationId: 'invariant-mutation-1',
      context,
      work: async () => {
        sideEffects += 1
        return { ok: true }
      },
    })

    await harness.gate.evaluateAndExecute({
      authoritySource: 'test.invariant.2',
      mutationId: 'invariant-mutation-1',
      context,
      work: async () => {
        sideEffects += 1
        return { ok: true }
      },
    })

    assert.equal(sideEffects, 1)

    const attestationCount = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_sovereign_mutation_attestation WHERE mutation_id = ?',
      'invariant-mutation-1',
    )
    assert.equal(attestationCount?.count, 1)

    const registryRow = await harness.connection.get<{ deduplicated_count: number }>(
      'SELECT deduplicated_count FROM flowmind_sovereign_mutation_registry WHERE mutation_id = ?',
      'invariant-mutation-1',
    )
    assert.equal((registryRow?.deduplicated_count ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})
