import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { InMemoryEntityCognitiveMemoryStore } from '../flowmind/memory/inMemoryEntityCognitiveMemoryStore.js'
import { createEntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import { createEntityRepository } from '../repositories/entityRepository.js'
import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'
import { createFlowMindApprovalQueue } from './approvalQueue.js'
import { assertScopedEntityMemoryAccess, runEntityRuntimeLoop } from './entityRuntimeLoop.js'
import { createMultiEntityRegistry } from './multiEntityRegistry.js'

async function createHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'entity-runtime-loop-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  return {
    workspace,
    connection,
    database: connection,
    entityRepository: createEntityRepository(connection),
    eventLogRepository: createEntityEventLogRepository(connection),
    registry: createMultiEntityRegistry(connection),
    approvalQueue: createFlowMindApprovalQueue(connection),
    memoryStore: new InMemoryEntityCognitiveMemoryStore(),
  }
}

test('runtime loop emits approval request command instead of mutating when create_entity needs approval', async () => {
  const harness = await createHarness()

  try {
    const source = createTestEntity()
    source.id = 'entity-source'
    source.metadata.confidence = 0.88
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedApprovalCommand',
      viaExecutor: true,
    }, async () => {
      await harness.entityRepository.createEntity({ id: source.id, entityProfile: source })
      await harness.registry.registerEntity({
        entityId: source.id,
        entityType: 'source-brand',
        market: 'legal',
        lifecycleState: 'sandbox',
        autonomyLevel: 'partial',
        riskLevel: 'low',
        memoryStatus: 'stable',
        activeGoals: [{
          type: 'create_entity',
          proposalId: 'proposal-public',
          rationale: 'Public opportunity',
          priority: 0.95,
          impact: 0.92,
          urgency: 0.89,
          historicalSuccess: 0.74,
          blueprint: {
            targetEntityId: 'entity-public-proposed',
            entityType: 'public-brand',
            market: 'legal',
            publicFacing: true,
            identity: { name: 'Public Brand' },
            initialGoals: ['publish_public_content'],
            allowedActions: ['publish_public_content'],
            entityInput: {
              brand: { name: 'Public Brand' },
              context: { styleAnswers: { languageStyle: 'claro' } },
              palette: { primary: '#111111', contrast: 'high' },
            },
          },
        }],
        operatingConstraints: {},
        healthScore: 0.72,
        leadGenerationScore: 0.74,
        memoryConfidence: 0.68,
        autonomyReadiness: 0.78,
        riskScore: 0.2,
        actionQueue: [],
        rollbackState: { active: false },
      })
    })

    const result = await runEntityRuntimeLoop({
      entityId: source.id,
      commandId: 'runtime-proposal-only',
      now: '2026-05-03T10:00:00.000Z',
      dependencies: harness,
    })

    assert.equal(result.proposal?.approvalRequired, true)
    assert.equal(result.blockedReason, 'create-entity-approval-required')
    assert.equal(result.commandRequest.type, 'entity.runtime.request_approval')
    assert.equal(result.activeGoals[0]?.type, 'create_entities')
    assert.equal(result.triggers.opportunityDetected, true)
    assert.equal(result.continuousLoop.phase, 'execute')
    assert.equal(result.valueLoop.autonomousExecutionEligible, true)
    assert.equal(result.valueLoop.selectedAction, 'create_entity')
    assert.equal(await harness.entityRepository.getEntityById('entity-public-proposed'), null)
    assert.equal(await harness.approvalQueue.getByProposal(source.id, 'proposal-public', 'create_entity'), null)
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('runtime loop emits execute command instead of creating entity directly', async () => {
  const harness = await createHarness()

  try {
    const source = createTestEntity()
    source.id = 'entity-source-sandbox'
    source.metadata.confidence = 0.9
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedExecuteCommand',
      viaExecutor: true,
    }, async () => {
      await harness.entityRepository.createEntity({ id: source.id, entityProfile: source })
      await harness.registry.registerEntity({
        entityId: source.id,
        entityType: 'source-brand',
        market: 'legal',
        lifecycleState: 'sandbox',
        autonomyLevel: 'partial',
        riskLevel: 'low',
        memoryStatus: 'stable',
        activeGoals: [{
          type: 'create_entity',
          proposalId: 'proposal-sandbox',
          rationale: 'Internal sandbox opportunity',
          priority: 0.96,
          impact: 0.9,
          urgency: 0.87,
          historicalSuccess: 0.76,
          blueprint: {
            targetEntityId: 'entity-sandbox-created',
            entityType: 'internal-sandbox',
            market: 'legal',
            publicFacing: false,
            identity: { name: 'Sandbox Brand' },
            initialGoals: ['observe_context'],
            allowedActions: ['observe_context'],
            entityInput: {
              brand: { name: 'Sandbox Brand' },
              context: { styleAnswers: { languageStyle: 'tecnico' } },
              palette: { primary: '#222222', contrast: 'medium' },
            },
          },
        }],
        operatingConstraints: {},
        healthScore: 0.76,
        leadGenerationScore: 0.79,
        memoryConfidence: 0.7,
        autonomyReadiness: 0.86,
        riskScore: 0.2,
        actionQueue: [],
        rollbackState: { active: false },
      })
    })

    const result = await runEntityRuntimeLoop({
      entityId: source.id,
      commandId: 'runtime-create-sandbox',
      now: '2026-05-03T10:05:00.000Z',
      dependencies: harness,
    })

    assert.equal(result.blockedReason, undefined)
    assert.equal(result.commandRequest.type, 'entity.runtime.execute')
    assert.ok(result.proposal)
    assert.equal(result.activeGoals[0]?.type, 'create_entities')
    assert.equal(result.continuousLoop.phase, 'execute')
    assert.equal(result.commandRequest.action, 'create_entity')
    assert.equal(await harness.entityRepository.getEntityById('entity-sandbox-created'), null)
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('rollback blocks actions in the entity runtime loop and emits observe command only', async () => {
  const harness = await createHarness()

  try {
    const source = createTestEntity()
    source.id = 'entity-source-rollback'
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedRollbackCommand',
      viaExecutor: true,
    }, async () => {
      await harness.entityRepository.createEntity({ id: source.id, entityProfile: source })
      await harness.registry.registerEntity({
        entityId: source.id,
        entityType: 'source-brand',
        market: 'legal',
        lifecycleState: 'rollback',
        autonomyLevel: 'partial',
        riskLevel: 'low',
        memoryStatus: 'stable',
        activeGoals: [{ type: 'create_entity' }],
        operatingConstraints: {},
        healthScore: 0.5,
        leadGenerationScore: 0.3,
        memoryConfidence: 0.5,
        autonomyReadiness: 0.6,
        riskScore: 0.2,
        actionQueue: [],
        rollbackState: { active: true, reason: 'incident' },
      })
    })

    const result = await runEntityRuntimeLoop({
      entityId: source.id,
      commandId: 'runtime-rollback',
      now: '2026-05-03T10:10:00.000Z',
      dependencies: harness,
    })

    assert.equal(result.blockedReason, 'rollback-active')
    assert.equal(result.commandRequest.type, 'entity.runtime.observe')
    assert.equal(result.continuousLoop.phase, 'cooldown')
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('memory does not leak between entities without policy', async () => {
  const harness = await createHarness()

  try {
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedMemory',
      viaExecutor: true,
    }, async () => {
      await harness.memoryStore.set('entity-a', {
        cognitiveState: { stability: 0.5, adaptationMomentum: 0.4, engagement: 0.3 },
        strategyProfile: {
          dominantStrategy: 'balanced-guidance',
          adaptationConfidence: 0.4,
          strategyBias: { supportBias: 0.5, explorationBias: 0.5, conversionBias: 0.4, cautionBias: 0.5 },
        },
        policyProfile: {
          policyMode: 'balanced',
          policyStability: 0.5,
          policyDrift: 0.1,
          confidenceAdjustmentProfile: { evidenceThreshold: 2 },
        },
        adaptiveDecisionProfile: {
          adaptationConfidence: 0.3,
          decisionDrift: 0.1,
          safetyProfile: { criticalConfidenceThreshold: 0.84, minimumEvidence: 2, killSwitchEnabled: false },
          explorationVsExploitationBalance: { explorationBias: 0.5, exploitationBias: 0.5 },
        },
        historicalSignals: { totalInteractions: 0, reliableEvidenceCount: 0, rollingSuccessRate: 0.5, rollingContinuationRate: 0.5, rollingEngagementDelta: 0 },
        episodicMemory: { entries: [] },
      })
    })

    await assert.rejects(() => assertScopedEntityMemoryAccess({
      memoryStore: harness.memoryStore,
      ownerEntityId: 'entity-b',
      targetEntityId: 'entity-a',
    }))
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('same history produces deterministic decisions across entities', async () => {
  const harness = await createHarness()

  try {
    const entityA = createTestEntity()
    entityA.id = 'entity-a'
    const entityB = createTestEntity()
    entityB.id = 'entity-b'
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedDeterminism',
      viaExecutor: true,
    }, async () => {
      await harness.entityRepository.createEntity({ id: entityA.id, entityProfile: entityA })
      await harness.entityRepository.createEntity({ id: entityB.id, entityProfile: entityB })
      for (const entityId of ['entity-a', 'entity-b']) {
        await harness.registry.registerEntity({
          entityId,
          entityType: 'source-brand',
          market: 'legal',
          lifecycleState: 'sandbox',
          autonomyLevel: 'manual',
          riskLevel: 'low',
          memoryStatus: 'stable',
          activeGoals: [],
          operatingConstraints: {},
          healthScore: 0.5,
          leadGenerationScore: 0.4,
          memoryConfidence: 0.5,
          autonomyReadiness: 0.5,
          riskScore: 0.2,
          actionQueue: [],
          rollbackState: { active: false },
        })
      }
    })

    const first = await runEntityRuntimeLoop({
      entityId: 'entity-a',
      commandId: 'deterministic-a',
      now: '2026-05-03T10:15:00.000Z',
      dependencies: harness,
    })
    const second = await runEntityRuntimeLoop({
      entityId: 'entity-b',
      commandId: 'deterministic-b',
      now: '2026-05-03T10:15:00.000Z',
      dependencies: harness,
    })

    assert.deepEqual(first.decision, second.decision)
    assert.deepEqual(first.commandRequest.type, second.commandRequest.type)
    assert.equal(first.continuousLoop.nextIntervalMs, second.continuousLoop.nextIntervalMs)
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('continuous runtime loop prioritizes internal goals and shortens interval under trigger pressure', async () => {
  const harness = await createHarness()

  try {
    const source = createTestEntity()
    source.id = 'entity-triggered'
    source.metadata.confidence = 0.82
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedTriggeredLoop',
      viaExecutor: true,
    }, async () => {
      await harness.entityRepository.createEntity({ id: source.id, entityProfile: source })
      await harness.registry.registerEntity({
        entityId: source.id,
        entityType: 'source-brand',
        market: 'legal',
        lifecycleState: 'sandbox',
        autonomyLevel: 'autonomous',
        riskLevel: 'low',
        memoryStatus: 'stable',
        activeGoals: [{
          type: 'generate_leads',
          priority: 0.91,
          impact: 0.88,
          urgency: 0.95,
          historicalSuccess: 0.66,
        }],
        operatingConstraints: {},
        healthScore: 0.62,
        leadGenerationScore: 0.2,
        memoryConfidence: 0.64,
        autonomyReadiness: 0.85,
        riskScore: 0.12,
        actionQueue: [],
        lastDecisionSnapshot: {
          leadGenerationScore: 0.62,
          healthScore: 0.63,
        },
        rollbackState: { active: false },
      })
      await harness.memoryStore.set(source.id, {
        cognitiveState: { stability: 0.6, adaptationMomentum: 0.5, engagement: 0.52 },
        strategyProfile: {
          dominantStrategy: 'lead-expansion',
          adaptationConfidence: 0.54,
          strategyBias: { supportBias: 0.4, explorationBias: 0.72, conversionBias: 0.68, cautionBias: 0.34 },
        },
        policyProfile: {
          policyMode: 'balanced',
          policyStability: 0.6,
          policyDrift: 0.08,
          confidenceAdjustmentProfile: { evidenceThreshold: 2 },
        },
        adaptiveDecisionProfile: {
          adaptationConfidence: 0.55,
          decisionDrift: 0.1,
          safetyProfile: { criticalConfidenceThreshold: 0.84, minimumEvidence: 2, killSwitchEnabled: false },
          explorationVsExploitationBalance: { explorationBias: 0.6, exploitationBias: 0.4 },
        },
        historicalSignals: {
          totalInteractions: 4,
          reliableEvidenceCount: 4,
          rollingSuccessRate: 0.72,
          rollingContinuationRate: 0.58,
          rollingEngagementDelta: 0.28,
        },
        episodicMemory: {
          entries: [{
            id: 'episode-success',
            summary: 'lead conversion success for legal outreach',
            tags: ['lead', 'success', 'conversion'],
            relevanceScore: 0.86,
            recordedAt: '2026-05-03T08:00:00.000Z',
            context: {},
          }],
        },
      })
    })

    const result = await runEntityRuntimeLoop({
      entityId: source.id,
      commandId: 'runtime-triggered',
      now: '2026-05-03T10:20:00.000Z',
      dependencies: harness,
    })

    assert.equal(result.activeGoals[0]?.type, 'generate_leads')
    assert.equal(result.triggers.leadScoreDrop, true)
    assert.equal(result.triggers.memoryPatternDetected, true)
    assert.equal(result.continuousLoop.nextIntervalMs <= 60_000, true)
    assert.equal(result.scores.episodicMemoryRelevance >= 0.8, true)
    assert.equal(result.valueLoop.leadSignalStrength >= 0.45, true)
    assert.equal(result.lastOutcomes.length >= 1, true)
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})

test('generate_leads goal emits autonomous execute command with outcome-bound value loop', async () => {
  const harness = await createHarness()

  try {
    const source = createTestEntity()
    source.id = 'entity-lead-autonomous'
    source.metadata.confidence = 0.86
    await runWithMutationAuthority({
      source: 'backend/src/orchestrator/entityRuntimeLoop.test.ts#seedLeadAutonomy',
      viaExecutor: true,
    }, async () => {
      await harness.entityRepository.createEntity({ id: source.id, entityProfile: source })
      await harness.registry.registerEntity({
        entityId: source.id,
        entityType: 'source-brand',
        market: 'legal',
        lifecycleState: 'sandbox',
        autonomyLevel: 'autonomous',
        riskLevel: 'low',
        memoryStatus: 'stable',
        activeGoals: [{
          type: 'generate_leads',
          priority: 0.94,
          impact: 0.9,
          urgency: 0.9,
          historicalSuccess: 0.84,
        }],
        operatingConstraints: {},
        healthScore: 0.7,
        leadGenerationScore: 0.74,
        memoryConfidence: 0.76,
        autonomyReadiness: 0.88,
        riskScore: 0.14,
        actionQueue: [],
        lastActions: [{
          actionId: 'action-prev',
          goalType: 'generate_leads',
          actionType: 'route_lead',
          confidence: 0.78,
          opportunityScore: 0.8,
          executedAt: '2026-05-03T09:40:00.000Z',
        }],
        lastOutcomes: [{
          outcomeId: 'outcome-prev',
          actionId: 'action-prev',
          status: 'success',
          impactScore: 0.88,
          conversionEffect: 0.82,
          observedAt: '2026-05-03T09:45:00.000Z',
          signalType: 'portfolio.lead.converted',
        }],
        lastDecisionSnapshot: {
          leadGenerationScore: 0.66,
          healthScore: 0.67,
        },
        rollbackState: { active: false },
      })
      await harness.memoryStore.set(source.id, {
        cognitiveState: { stability: 0.66, adaptationMomentum: 0.7, engagement: 0.6 },
        strategyProfile: {
          dominantStrategy: 'lead-conversion',
          adaptationConfidence: 0.68,
          strategyBias: { supportBias: 0.34, explorationBias: 0.62, conversionBias: 0.8, cautionBias: 0.28 },
        },
        policyProfile: {
          policyMode: 'balanced',
          policyStability: 0.64,
          policyDrift: 0.08,
          confidenceAdjustmentProfile: { evidenceThreshold: 2 },
        },
        adaptiveDecisionProfile: {
          adaptationConfidence: 0.7,
          decisionDrift: 0.08,
          safetyProfile: { criticalConfidenceThreshold: 0.84, minimumEvidence: 2, killSwitchEnabled: false },
          explorationVsExploitationBalance: { explorationBias: 0.54, exploitationBias: 0.46 },
        },
        historicalSignals: {
          totalInteractions: 8,
          reliableEvidenceCount: 8,
          rollingSuccessRate: 0.76,
          rollingContinuationRate: 0.62,
          rollingEngagementDelta: 0.32,
        },
        episodicMemory: {
          entries: [{
            id: 'episode-lead-success',
            summary: 'qualified legal outreach converted into retained lead',
            tags: ['lead', 'success', 'conversion'],
            relevanceScore: 0.9,
            recordedAt: '2026-05-03T09:30:00.000Z',
            context: {},
          }],
        },
      })
      await harness.eventLogRepository.logEvent({
        entityId: source.id,
        type: 'portfolio.lead.qualified',
        timestamp: '2026-05-03T09:50:00.000Z',
      })
      await harness.eventLogRepository.logEvent({
        entityId: source.id,
        type: 'portfolio.lead.converted',
        timestamp: '2026-05-03T09:55:00.000Z',
      })
    })

    const result = await runEntityRuntimeLoop({
      entityId: source.id,
      commandId: 'runtime-lead-autonomous',
      now: '2026-05-03T10:25:00.000Z',
      dependencies: harness,
    })

    assert.equal(result.commandRequest.type, 'entity.runtime.execute')
    assert.equal(result.commandRequest.proposal, undefined)
    assert.equal(result.commandRequest.action, 'route_lead')
    assert.equal(result.valueLoop.autonomousExecutionEligible, true)
    assert.equal(result.valueLoop.opportunityScore >= 0.7, true)
    assert.equal(result.valueLoop.outcomeSuccessRate >= 0.6, true)
    assert.equal(result.lastActions.length >= 2, true)
    assert.equal(result.lastOutcomes[0]?.status, 'success')
  } finally {
    await harness.connection.close()
    await rm(harness.workspace, { recursive: true, force: true })
  }
})
