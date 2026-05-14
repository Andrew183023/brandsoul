import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../../../db/index.js'
import { createInstitutionalContinuityGovernanceService } from '../../../../services/institutionalContinuityGovernanceService.js'
import { createObservabilityService } from '../../../../services/observabilityService.js'
import { createRuntimeContinuityAttestationService } from '../../../../services/runtimeContinuityAttestationService.js'
import { createRuntimeGovernanceService } from '../../../../services/runtimeGovernanceService.js'
import { createInstitutionalSovereignMutationGate, installInstitutionalSovereignMutationGate } from '../../../../sovereignty/institutionalSovereignMutationGate.js'
import { createProposalRepository } from '../../../../persistence/opportunities/proposalRepository.js'
import { createOpportunitySnapshotStore } from '../../runtime/opportunitySnapshotStore.js'
import { createOpportunityGovernanceSnapshotStore } from './opportunityGovernanceSnapshotStore.js'
import { createOpportunityGovernanceRuntime } from './opportunityGovernanceRuntime.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'opportunity-governance-runtime-'))
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

  const opportunitySnapshotStore = createOpportunitySnapshotStore()
  const opportunityGovernanceSnapshotStore = createOpportunityGovernanceSnapshotStore()

  opportunitySnapshotStore.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-13T00:00:00.000Z',
    opportunities: [{
      id: 'opportunity-1',
      keyword: 'labor lawyer',
      category: 'legal',
      economicRelevance: 90,
      leadProbability: 'high',
      sourceSignalId: 'signal-1',
      detectedAt: '2026-05-13T00:00:00.000Z',
      recommendedAction: 'route to legal team',
    }],
    suggestions: [{
      entityId: 'entity-1',
      entityName: 'Entity One',
      suggestedAction: 'route now',
      confidence: 0.95,
      reasoning: 'Route this signal "labor lawyer" to legal specialists.',
    }],
    topOpportunity: undefined,
  })

  const runtime = createOpportunityGovernanceRuntime({
    connection,
    opportunitySnapshotStore,
    opportunityGovernanceSnapshotStore,
    proposalRepository: createProposalRepository(connection),
    refreshIntervalMs: 60_000,
  })

  return {
    connection,
    observability,
    runtime,
    opportunityGovernanceSnapshotStore,
    async close() {
      await runtime.stop()
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('opportunity governance replay-equivalent returns iterable proposals without duplicate side effects', async () => {
  const harness = await createHarness()

  try {
    const first = await harness.runtime.refresh()
    assert.equal(Array.isArray(first.proposals), true)
    assert.equal(first.proposals.length > 0, true)

    const firstProposalCount = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_opportunity_proposals',
    )
    const firstApprovalCount = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM entity_orchestrator_approval_queue',
    )

    const second = await harness.runtime.refresh()

    assert.equal(Array.isArray(second.proposals), true)
    for (const proposal of second.proposals) {
      assert.ok(proposal.proposalId)
    }

    const secondProposalCount = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM flowmind_opportunity_proposals',
    )
    const secondApprovalCount = await harness.connection.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM entity_orchestrator_approval_queue',
    )

    assert.equal(secondProposalCount?.count, firstProposalCount?.count)
    assert.equal(secondApprovalCount?.count, firstApprovalCount?.count)

    const metrics = harness.observability.getMetricsSnapshot()
    assert.equal((metrics.customCounters.sovereign_mutation_replay_equivalent_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounters.sovereign_mutation_deduplicated_total ?? 0) >= 1, true)
    assert.equal((metrics.customCounters.sovereign_mutation_result_contract_preserved_total ?? 0) >= 1, true)
  } finally {
    await harness.close()
  }
})

test('startup does not fail on deduplicated opportunity governance mutation', async () => {
  const harness = await createHarness()

  try {
    await harness.runtime.refresh()

    await assert.doesNotReject(async () => {
      await harness.runtime.start()
    })

    const snapshotState = harness.opportunityGovernanceSnapshotStore.getSnapshot()
    assert.equal(snapshotState.snapshot.status, 'ready')
    assert.equal(Array.isArray(snapshotState.snapshot.proposals), true)
  } finally {
    await harness.close()
  }
})
