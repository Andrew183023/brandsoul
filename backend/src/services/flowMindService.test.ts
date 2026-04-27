import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import { createOrchestratorCommand } from '../orchestrator/orchestratorCore.js'
import { createInitialOrchestratorState } from '../orchestrator/orchestratorState.js'
import { loadBrandSoulShadowAdapter } from './brandSoulShadowAdapter.js'
import { createFlowMindService } from './flowMindService.js'

test('flowMindService evaluates orchestrator commands in shadow mode', async () => {
  const entity = createTestEntity()
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
    now: '2026-04-19T16:00:00.000Z',
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    payload: {
      exportFormat: 'story',
      summary: 'Promover export da entidade',
    },
    issuedAt: '2026-04-19T16:01:00.000Z',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'shadow',
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
    now: command.issuedAt,
  })

  assert.ok(result)
  assert.equal(result.mode, 'shadow')
  assert.equal(result.summary.mode, 'shadow')
  assert.equal(result.summary.adapterName, 'backend-base-fallback')
  assert.equal(result.summary.adapterLoadStatus, 'backend-base-only')
  assert.equal(result.summary.fallbackUsed, true)
  assert.equal(result.summary.fallbackReason, 'adaptive-core-not-configured')
  assert.equal(result.summary.invokedAt, '2026-04-19T16:01:00.000Z')
  assert.equal(result.summary.objectiveType, 'convert')
  assert.equal(typeof result.summary.decision.intent, 'string')
  assert.equal(typeof result.summary.decision.action, 'string')
  assert.equal(result.output.updatedMemory.historicalSignals.totalInteractions, 0)
})

test('flowMindService stays disabled safely when mode is disabled', async () => {
  const entity = createTestEntity()
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'start_birth',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'disabled',
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
  })

  assert.equal(result, undefined)
})

test('flowMindService can be disabled per entity while global mode stays in shadow', async () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'disabled',
      updatedAt: '2026-04-19T17:00:00.000Z',
    },
  }
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'shadow',
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
  })

  assert.equal(result, undefined)
})

test('flowMindService can mark an entity as active without changing the global baseline', async () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-19T17:10:00.000Z',
    },
  }
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'shadow',
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
  })

  assert.ok(result)
  assert.equal(result.mode, 'active')
  assert.equal(result.summary.mode, 'active')
})

test('flowMindService global disabled mode still works as a master switch over entity activation', async () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      killSwitchEnabled: false,
      updatedAt: '2026-04-19T17:20:00.000Z',
    },
  }
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'start_birth',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'disabled',
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
  })

  assert.equal(result, undefined)
})

test('flowMindService kill switch disables a specific entity immediately', async () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      killSwitchEnabled: true,
      updatedAt: '2026-04-19T17:30:00.000Z',
    },
  }
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'shadow',
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
  })

  assert.equal(result, undefined)
})

test('flowMindService prefers BrandSoul shadow adapter when real runtime is available', async () => {
  const adapter = await loadBrandSoulShadowAdapter()

  assert.ok(adapter)

  const entity = createTestEntity()
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
    now: '2026-04-19T16:20:00.000Z',
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    payload: {
      exportFormat: 'story',
      summary: 'Mostrar opcoes de export para esta marca',
    },
    issuedAt: '2026-04-19T16:21:00.000Z',
    source: 'user',
  })
  const service = createFlowMindService({
    mode: 'shadow',
    adapter,
  })

  const result = await service.evaluateOrchestratorCommand({
    entityProfile: entity,
    state,
    command,
    now: command.issuedAt,
  })

  assert.ok(result)
  assert.equal(result.summary.adapterName, 'brandsoul-compat-adapter')
  assert.equal(result.summary.adapterLoadStatus, 'loaded')
  assert.equal(result.summary.fallbackUsed, result.output.fallbackConditions.length > 0)
  assert.equal(result.summary.fallbackReason, result.output.fallbackConditions[0])
  assert.equal(result.output.updatedMemory.historicalSignals.totalInteractions >= 0, true)
  assert.equal(typeof result.output.updatedMemory.strategyProfile.dominantStrategy, 'string')
})