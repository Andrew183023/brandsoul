import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAction } from './flowMindGuard.js'

test('validateAction tolerates missing confidence without undefined access', () => {
  const result = validateAction({
    schemaVersion: 1,
    entityId: 'entity-test',
    type: 'sendMessage',
    payload: undefined as never,
    priority: 'high',
    confidence: undefined as never,
    source: {
      intent: 'assist',
    },
    createdAt: '2026-04-19T16:00:00.000Z',
  })

  assert.equal(result.allowed, false)
  assert.equal(result.action.confidence, 0)
  assert.equal(result.action.type, 'observeContext')
})

test('validateAction is deterministic for the same normalized input', () => {
  const input = {
    schemaVersion: 1 as const,
    entityId: 'entity-test',
    type: 'sendMessage',
    payload: undefined as never,
    priority: 'high' as const,
    confidence: undefined as never,
    source: {
      intent: 'assist',
    },
    createdAt: '2026-04-19T16:00:00.000Z',
  } as const

  const first = validateAction(input, {
    now: '2026-04-19T16:00:00.000Z',
  })
  const second = validateAction(input, {
    now: '2026-04-19T16:00:00.000Z',
  })

  assert.deepEqual(first, second)
})

test('validateAction blocks triggerExport outside export or final context', () => {
  const result = validateAction({
    schemaVersion: 1,
    entityId: 'entity-test',
    type: 'triggerExport',
    payload: {},
    priority: 'medium',
    confidence: 0.7,
    source: {
      intent: 'convert',
    },
    createdAt: '2026-04-19T16:00:00.000Z',
  }, {
    now: '2026-04-19T16:00:00.000Z',
    policyContext: 'creation',
  })

  assert.equal(result.allowed, false)
  assert.equal(result.failureKind, 'policy')
  assert.equal(result.safeDecision?.intent, 'observe')
  assert.equal(result.safeDecision?.action, 'none')
  assert.equal(result.action.type, 'observeContext')
})

test('validateAction blocks unsafe payload combinations', () => {
  const result = validateAction({
    schemaVersion: 1,
    entityId: 'entity-test',
    type: 'updateMemory',
    payload: {
      memoryKey: 'tone',
      memoryValue: 'calmo',
      suggestion: 'unsafe-combo',
    },
    priority: 'medium',
    confidence: 0.7,
    source: {
      intent: 'assist',
    },
    createdAt: '2026-04-19T16:00:00.000Z',
  }, {
    now: '2026-04-19T16:00:00.000Z',
    policyContext: 'interaction',
  })

  assert.equal(result.allowed, false)
  assert.equal(result.failureCode, 'FLOWMIND_ACTION_UNSAFE_COMBINATION')
  assert.equal(result.safeDecision?.action, 'none')
})