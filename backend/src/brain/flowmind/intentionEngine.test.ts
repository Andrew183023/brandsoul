import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCognitiveInput } from './cognitiveInput.js'
import { decide } from './flowMindEngine.js'
import { createTestEntity } from './testUtils.js'

test('normalizeCognitiveInput defaults missing engagementScore to zero', () => {
  const normalized = normalizeCognitiveInput({
    engagementScore: undefined as unknown,
    confidence: undefined as unknown,
    context: undefined as unknown,
  })

  assert.equal(normalized.engagementScore, 0)
  assert.equal(normalized.confidence, 0)
  assert.deepEqual(normalized.context, {})
})

test('decide remains deterministic when engagementScore is omitted from the input context', () => {
  const entity = createTestEntity()
  const input = {
    entity,
    behaviorState: entity.relational.behaviorState,
    progression: entity.relational.progression,
    userMemory: entity.relational.userMemory,
    hookLoop: entity.relational.hookLoop,
    contextSnapshot: {
      userIntent: 'share',
      journeyMoment: 'birth',
      socialContext: {},
    },
    journeyMoment: 'birth',
    now: '2026-04-19T16:00:00.000Z',
  }

  const first = decide(input)
  const second = decide(input)

  assert.deepEqual(first, second)
})