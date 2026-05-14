import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import type { SovereignExecutionRecord } from '../../execution/contracts/SovereignExecutionRecord.js'
import { createSovereignExecutionSnapshotStore } from '../../execution/runtime/sovereignExecutionSnapshotStore.js'
import type { OpportunityExecutionProposal } from '../../market-signals/opportunities/governance/contracts/OpportunityExecutionProposal.js'
import { createOpportunityGovernanceSnapshotStore } from '../../market-signals/opportunities/governance/runtime/opportunityGovernanceSnapshotStore.js'
import type { OpportunityLead } from '../../market-signals/opportunities/contracts/OpportunityLead.js'
import { createOpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import { createNegativeOutcomeRepository } from '../persistence/negativeOutcomeRepository.js'
import { createTerminalFailureDetectionRuntime } from './terminalFailureDetectionRuntime.js'

async function createTempDatabase() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-terminal-failure-runtime-'))
  const sqliteFile = path.join(workspace, 'runtime.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  return {
    db,
    async close() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function seedOpportunitySnapshot() {
  const store = createOpportunitySnapshotStore()
  const opportunity: OpportunityLead = {
    id: 'opportunity-stale-1',
    keyword: 'labor lawyer',
    category: 'legal',
    economicRelevance: 88,
    leadProbability: 'high',
    sourceSignalId: 'signal-1',
    detectedAt: '2026-05-01T00:00:00.000Z',
    recommendedAction: 'Generate legal intake flow',
  }

  store.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T00:00:00.000Z',
    opportunities: [opportunity],
    suggestions: [],
    topOpportunity: opportunity,
  })

  return store
}

function seedGovernanceSnapshot() {
  const store = createOpportunityGovernanceSnapshotStore()
  const proposal: OpportunityExecutionProposal = {
    proposalId: 'proposal-approved-1',
    sourceOpportunityId: 'different-opportunity',
    entityId: 'entity-1',
    entityName: 'Entity 1',
    actionType: 'portfolio.lead.route',
    confidence: 0.84,
    reasoning: 'seed proposal unrelated to stale opportunity',
    createdAt: '2026-05-08T00:00:00.000Z',
    governanceStatus: 'approved',
  }

  store.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T00:00:00.000Z',
    proposals: [proposal],
    topProposal: proposal,
    metrics: {
      proposalCount: 1,
      approvedCount: 1,
      rejectedCount: 0,
      pendingCount: 0,
    },
  })

  return store
}

function seedRejectedGovernanceSnapshot() {
  const store = createOpportunityGovernanceSnapshotStore()
  const proposal: OpportunityExecutionProposal = {
    proposalId: 'proposal-rejected-1',
    sourceOpportunityId: 'opportunity-stale-1',
    entityId: 'entity-1',
    entityName: 'Entity 1',
    actionType: 'portfolio.lead.route',
    confidence: 0.84,
    reasoning: 'seed proposal rejected by governance',
    createdAt: '2026-05-08T00:00:00.000Z',
    governanceStatus: 'rejected',
  }

  store.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T00:00:00.000Z',
    proposals: [proposal],
    topProposal: proposal,
    metrics: {
      proposalCount: 1,
      approvedCount: 0,
      rejectedCount: 1,
      pendingCount: 0,
    },
  })

  return store
}

function seedExecutionSnapshot() {
  const store = createSovereignExecutionSnapshotStore()
  const execution: SovereignExecutionRecord = {
    executionId: 'execution-completed-1',
    proposalId: 'proposal-approved-1',
    entityId: 'entity-1',
    actionType: 'portfolio.lead.route',
    executionStatus: 'completed',
    startedAt: '2026-05-08T00:00:00.000Z',
    completedAt: '2026-05-08T00:01:00.000Z',
    generatedLeadId: 'lead-1',
    revenueAttributed: 100,
  }

  store.setSnapshot({
    status: 'ready',
    generatedAt: '2026-05-08T00:00:00.000Z',
    executions: [execution],
    metrics: {
      executionCount: 1,
      successCount: 1,
      failedCount: 0,
      revenueAttributed: 100,
    },
  })

  return store
}

test('terminal failure detection runtime boots and duplicate boot does not duplicate outcomes', async () => {
  const harness = await createTempDatabase()

  try {
    const negativeOutcomeRepository = createNegativeOutcomeRepository(harness.db)
    const runtime = createTerminalFailureDetectionRuntime({
      opportunitySnapshotStore: seedOpportunitySnapshot(),
      opportunityGovernanceSnapshotStore: seedGovernanceSnapshot(),
      sovereignExecutionSnapshotStore: seedExecutionSnapshot(),
      negativeOutcomeRepository,
      refreshIntervalMs: 60_000,
      opportunityTimeoutMs: 1,
      proposalTimeoutMs: 60_000,
      executionTimeoutMs: 60_000,
      noResponseTimeoutMs: 60_000,
    })

    await runtime.start()
    await runtime.start()

    const outcomesAfterBoot = await negativeOutcomeRepository.listNegativeOutcomes()
    const status = runtime.getStatus()

    assert.equal(outcomesAfterBoot.length, 1)
    assert.equal(outcomesAfterBoot[0]?.outcomeType, 'opportunity_expired')
    assert.equal(status.started, true)
    assert.equal(status.ready, true)
    assert.equal(status.warming, false)
    assert.equal(status.error, false)
    assert.notEqual(status.lastRunAt, null)
    assert.equal(status.lastError, null)

    await runtime.refresh()
    const outcomesAfterRefresh = await negativeOutcomeRepository.listNegativeOutcomes()
    assert.equal(outcomesAfterRefresh.length, 1)

    await runtime.stop()
  } finally {
    await harness.close()
  }
})

test('same failed proposal detected twice produces only one negative outcome', async () => {
  const harness = await createTempDatabase()

  try {
    const negativeOutcomeRepository = createNegativeOutcomeRepository(harness.db)
    const runtime = createTerminalFailureDetectionRuntime({
      opportunitySnapshotStore: seedOpportunitySnapshot(),
      opportunityGovernanceSnapshotStore: seedRejectedGovernanceSnapshot(),
      sovereignExecutionSnapshotStore: createSovereignExecutionSnapshotStore(),
      negativeOutcomeRepository,
      refreshIntervalMs: 60_000,
      opportunityTimeoutMs: 365 * 24 * 60 * 60 * 1_000,
      proposalTimeoutMs: 60_000,
      executionTimeoutMs: 60_000,
      noResponseTimeoutMs: 60_000,
    })

    await runtime.start()
    await runtime.refresh()

    const outcomes = await negativeOutcomeRepository.listNegativeOutcomes()
    assert.equal(outcomes.length, 1)
    assert.equal(outcomes[0]?.outcomeType, 'proposal_rejected')

    await runtime.stop()
  } finally {
    await harness.close()
  }
})

test('terminal failure detection runtime restart does not duplicate outcomes', async () => {
  const harness = await createTempDatabase()

  try {
    const negativeOutcomeRepository = createNegativeOutcomeRepository(harness.db)
    const opportunitySnapshotStore = seedOpportunitySnapshot()
    const opportunityGovernanceSnapshotStore = seedGovernanceSnapshot()
    const sovereignExecutionSnapshotStore = seedExecutionSnapshot()

    const runtimeA = createTerminalFailureDetectionRuntime({
      opportunitySnapshotStore,
      opportunityGovernanceSnapshotStore,
      sovereignExecutionSnapshotStore,
      negativeOutcomeRepository,
      refreshIntervalMs: 60_000,
      opportunityTimeoutMs: 1,
      proposalTimeoutMs: 60_000,
      executionTimeoutMs: 60_000,
      noResponseTimeoutMs: 60_000,
    })
    await runtimeA.start()
    await runtimeA.stop()

    const runtimeB = createTerminalFailureDetectionRuntime({
      opportunitySnapshotStore,
      opportunityGovernanceSnapshotStore,
      sovereignExecutionSnapshotStore,
      negativeOutcomeRepository,
      refreshIntervalMs: 60_000,
      opportunityTimeoutMs: 1,
      proposalTimeoutMs: 60_000,
      executionTimeoutMs: 60_000,
      noResponseTimeoutMs: 60_000,
    })
    await runtimeB.start()

    const outcomes = await negativeOutcomeRepository.listNegativeOutcomes()
    assert.equal(outcomes.length, 1)
    assert.equal(outcomes[0]?.outcomeType, 'opportunity_expired')

    await runtimeB.stop()
  } finally {
    await harness.close()
  }
})
