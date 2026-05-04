import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from './testUtils.js'
import { executeFlowMindAction } from './flowMindActionExecutor.js'

test('executeFlowMindAction is deterministic for the same input', async () => {
  const entity = createTestEntity()
  const state = {
    entityId: entity.id,
    sessionId: 'session-1',
    sessionStatus: 'running',
  }
  const command = {
    commandId: 'command-1',
    issuedAt: '2026-04-19T18:11:00.000Z',
  }
  const action = {
    schemaVersion: 1,
    entityId: entity.id,
    type: 'sendMessage',
    payload: {
      message: 'Mensagem deterministica.',
    },
    priority: 'medium',
    confidence: 0.7,
    source: {
      intent: 'engage',
    },
    createdAt: '2026-04-19T18:11:00.000Z',
  }

  const first = await executeFlowMindAction({
    action: action as never,
    entityProfile: entity,
    state: state as never,
    command: command as never,
    now: '2026-04-19T18:11:00.000Z',
  })
  const second = await executeFlowMindAction({
    action: action as never,
    entityProfile: entity,
    state: state as never,
    command: command as never,
    now: '2026-04-19T18:11:00.000Z',
  })

  assert.deepEqual(first, second)
})

test('executeFlowMindAction rolls back with validation failure when idempotency is missing', async () => {
  const entity = createTestEntity()

  const result = await executeFlowMindAction({
    action: {
      schemaVersion: 1,
      entityId: entity.id,
      type: 'sendMessage',
      payload: {
        message: 'Mensagem sem idempotencia.',
      },
      priority: 'medium',
      confidence: 0.7,
      source: {
        intent: 'engage',
      },
      createdAt: '2026-04-19T18:11:00.000Z',
    } as never,
    entityProfile: entity,
    state: {
      entityId: entity.id,
      sessionStatus: 'running',
    } as never,
    command: {
      commandId: '',
      issuedAt: '2026-04-19T18:11:00.000Z',
    } as never,
  })

  assert.equal(result.transaction.rolledBack, true)
  assert.equal(result.transaction.failure?.statusCode, 400)
  assert.equal(result.transaction.failure?.code, 'IDEMPOTENCY_KEY_REQUIRED')
})

test('executeFlowMindAction maps policy denial to 403 and rolls back', async () => {
  const entity = createTestEntity()

  const result = await executeFlowMindAction({
    action: {
      schemaVersion: 1,
      entityId: entity.id,
      type: 'unsupported_action',
      payload: {},
      priority: 'medium',
      confidence: 0.7,
      source: {
        intent: 'engage',
      },
      createdAt: '2026-04-19T18:11:00.000Z',
    } as never,
    entityProfile: entity,
    state: {
      entityId: entity.id,
      sessionStatus: 'running',
    } as never,
    command: {
      commandId: 'idem-policy',
      issuedAt: '2026-04-19T18:11:00.000Z',
    } as never,
  })

  assert.equal(result.transaction.rolledBack, true)
  assert.equal(result.transaction.failure?.statusCode, 403)
  assert.equal(result.transaction.failure?.kind, 'policy')
})

test('executeFlowMindAction maps action interval conflicts to 409 and rolls back', async () => {
  const entity = createTestEntity()
  entity.metadata.updatedAt = '2026-04-19T18:11:00.000Z'
  entity.metadata.notes = [
    'flowmind:decision:2026-04-19T18:11:00.000Z:engage:sendMessage:0.700',
  ]

  const result = await executeFlowMindAction({
    action: {
      schemaVersion: 1,
      entityId: entity.id,
      type: 'sendMessage',
      payload: {
        message: 'Mensagem em conflito.',
      },
      priority: 'medium',
      confidence: 0.7,
      source: {
        intent: 'engage',
      },
      createdAt: '2026-04-19T18:11:00.000Z',
    } as never,
    entityProfile: entity,
    state: {
      entityId: entity.id,
      sessionStatus: 'running',
    } as never,
    command: {
      commandId: 'idem-conflict',
      issuedAt: '2026-04-19T18:11:00.000Z',
    } as never,
  })

  assert.equal(result.transaction.rolledBack, true)
  assert.equal(result.transaction.failure?.statusCode, 409)
  assert.equal(result.transaction.failure?.kind, 'conflict')
})

test('executeFlowMindAction blocks unsafe context combinations via policy guardrails', async () => {
  const entity = createTestEntity()

  const result = await executeFlowMindAction({
    action: {
      schemaVersion: 1,
      entityId: entity.id,
      type: 'triggerExport',
      payload: {},
      priority: 'medium',
      confidence: 0.7,
      source: {
        intent: 'convert',
      },
      createdAt: '2026-04-19T18:11:00.000Z',
    } as never,
    entityProfile: entity,
    state: {
      entityId: entity.id,
      sessionStatus: 'running',
      currentStage: 'birth',
    } as never,
    command: {
      commandId: 'idem-export-policy',
      issuedAt: '2026-04-19T18:11:00.000Z',
      name: 'start_birth',
    } as never,
  })

  assert.equal(result.transaction.rolledBack, true)
  assert.equal(result.transaction.failure?.statusCode, 403)
  assert.equal(result.transaction.failure?.code, 'FLOWMIND_ACTION_POLICY_DENIED')
})