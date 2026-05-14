import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'
import { createMultiEntityRegistry } from './multiEntityRegistry.js'

test('multiEntityRegistry persists and filters entities by lifecycle, autonomy, and risk', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'multi-entity-registry-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  let connection: Awaited<ReturnType<typeof createDatabaseConnection>> | undefined

  try {
    connection = await createDatabaseConnection({
      provider: 'sqlite',
      sqliteFile,
    })
    await initializeDatabase(connection)
    const registry = createMultiEntityRegistry(connection)

    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/multiEntityRegistry.test.ts#seedRegistry',
      viaExecutor: true,
    }, async () => {
      await registry.registerEntity({
        entityId: 'entity-a',
        entityType: 'internal-sandbox',
        market: 'legal',
        lifecycleState: 'sandbox',
        autonomyLevel: 'partial',
        riskLevel: 'low',
        memoryStatus: 'cold',
        activeGoals: [],
        operatingConstraints: {},
        healthScore: 0.4,
        leadGenerationScore: 0,
        memoryConfidence: 0.2,
        autonomyReadiness: 0.2,
        riskScore: 0.2,
        actionQueue: [],
        lastActions: [{
          actionId: 'action-a',
          goalType: 'generate_leads',
          actionType: 'route_lead',
          confidence: 0.7,
          opportunityScore: 0.72,
          executedAt: '2026-05-03T10:00:00.000Z',
        }],
        lastOutcomes: [{
          outcomeId: 'outcome-a',
          actionId: 'action-a',
          status: 'success',
          impactScore: 0.82,
          conversionEffect: 0.64,
          observedAt: '2026-05-03T10:05:00.000Z',
          signalType: 'portfolio.lead.converted',
        }],
        rollbackState: { active: false },
      })

      await registry.registerEntity({
        entityId: 'entity-b',
        entityType: 'public-brand',
        market: 'consulting',
        lifecycleState: 'public-active',
        autonomyLevel: 'manual',
        riskLevel: 'high',
        memoryStatus: 'stable',
        activeGoals: [{ approvalRequired: true }],
        operatingConstraints: {},
        healthScore: 0.7,
        leadGenerationScore: 0.6,
        memoryConfidence: 0.7,
        autonomyReadiness: 0.5,
        riskScore: 0.8,
        actionQueue: [],
        rollbackState: { active: true, reason: 'test' },
      })
    })

    const sandboxEntities = await registry.listEntities({
      lifecycleState: 'sandbox',
    })
    const highRiskEntities = await registry.listEntities({
      riskLevel: 'high',
    })

    assert.equal(sandboxEntities.length, 1)
    assert.equal(highRiskEntities.length, 1)
    assert.equal((await registry.getMetrics()).entitiesUnderRollback, 1)
    assert.equal(sandboxEntities[0]?.lastActions[0]?.actionType, 'route_lead')
    assert.equal(sandboxEntities[0]?.lastOutcomes[0]?.status, 'success')

  } finally {
    await connection?.close()
    await rm(workspace, { recursive: true, force: true })
  }
})
