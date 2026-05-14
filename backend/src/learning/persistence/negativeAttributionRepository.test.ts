import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { runWithMutationAuthority } from '../../sovereignty/authorityBoundary.js'
import { createNegativeAttributionRepository } from './negativeAttributionRepository.js'

async function createTempDatabase() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-negative-attribution-repository-'))
  const sqliteFile = path.join(workspace, 'repository.sqlite')
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

async function appendUnderAuthority(
  repository: ReturnType<typeof createNegativeAttributionRepository>,
  input: Parameters<typeof repository.appendNegativeAttribution>[0],
) {
  return runWithMutationAuthority({
    source: 'backend/src/learning/persistence/negativeAttributionRepository.test.ts#appendUnderAuthority',
    viaExecutor: true,
  }, async () => repository.appendNegativeAttribution(input))
}

test('negative attribution repository is append-only and dedupes deterministic IDs', async () => {
  const harness = await createTempDatabase()

  try {
    const repository = createNegativeAttributionRepository(harness.db)

    const first = await appendUnderAuthority(repository, {
      outcomeId: 'negative-outcome:1',
      signalId: 'signal-1',
      opportunityId: 'opportunity-1',
      proposalId: 'proposal-1',
      executionId: 'execution-1',
      entityId: 'entity-1',
      category: 'legal',
      keyword: 'labor lawyer',
      outcomeType: 'failed_execution',
      severity: 'critical',
      reason: 'terminal failure',
      lineageQuality: 'complete',
      occurredAt: '2026-05-08T10:00:00.000Z',
      detectedAt: '2026-05-08T10:05:00.000Z',
      attributedAt: '2026-05-08T10:05:00.000Z',
      sourceRuntime: 'terminal-failure-detection-runtime',
      detectorVersion: 'v1',
      metadata: { code: 'terminal_failure' },
      createdAt: '2026-05-08T10:05:00.000Z',
    })

    const second = await appendUnderAuthority(repository, {
      outcomeId: 'negative-outcome:1',
      signalId: 'signal-1',
      opportunityId: 'opportunity-1',
      proposalId: 'proposal-1',
      executionId: 'execution-1',
      entityId: 'entity-1',
      category: 'legal',
      keyword: 'labor lawyer',
      outcomeType: 'failed_execution',
      severity: 'critical',
      reason: 'terminal failure',
      lineageQuality: 'complete',
      occurredAt: '2026-05-08T10:00:00.000Z',
      detectedAt: '2026-05-08T10:05:00.000Z',
      attributedAt: '2026-05-08T10:05:00.000Z',
      sourceRuntime: 'terminal-failure-detection-runtime',
      detectorVersion: 'v1',
      metadata: { code: 'terminal_failure' },
      createdAt: '2026-05-08T10:05:00.000Z',
    })

    assert.equal(first.attributionId, second.attributionId)

    const all = await repository.listNegativeAttributions()
    assert.equal(all.length, 1)
    assert.equal(all[0]?.metadata?.code, 'terminal_failure')
    assert.equal(all[0]?.attributedAt, '2026-05-08T10:05:00.000Z')
    assert.equal(all[0]?.createdAt, '2026-05-08T10:05:00.000Z')
  } finally {
    await harness.close()
  }
})

test('negative attribution repository supports lineage queries without mutating history', async () => {
  const harness = await createTempDatabase()

  try {
    const repository = createNegativeAttributionRepository(harness.db)

    await appendUnderAuthority(repository, {
      outcomeId: 'negative-outcome:proposal',
      signalId: 'signal-2',
      opportunityId: 'opportunity-2',
      proposalId: 'proposal-2',
      executionId: null,
      entityId: 'entity-2',
      category: 'finance',
      keyword: 'mortgage quote',
      outcomeType: 'proposal_rejected',
      severity: 'medium',
      reason: 'governance rejected',
      lineageQuality: 'complete',
      occurredAt: '2026-05-08T11:00:00.000Z',
      detectedAt: '2026-05-08T11:01:00.000Z',
      attributedAt: '2026-05-08T11:01:00.000Z',
      sourceRuntime: 'terminal-failure-detection-runtime',
      detectorVersion: 'v1',
      createdAt: '2026-05-08T11:01:00.000Z',
    })

    const [byOpportunity, byProposal, byEntity, byType] = await Promise.all([
      repository.listNegativeAttributionsByOpportunity('opportunity-2'),
      repository.listNegativeAttributionsByProposal('proposal-2'),
      repository.listNegativeAttributionsByEntity('entity-2'),
      repository.listNegativeAttributionsByOutcomeType('proposal_rejected'),
    ])

    assert.equal(byOpportunity.length, 1)
    assert.equal(byProposal.length, 1)
    assert.equal(byEntity.length, 1)
    assert.equal(byType.length, 1)
    assert.equal(byProposal[0]?.reason, 'governance rejected')
  } finally {
    await harness.close()
  }
})
