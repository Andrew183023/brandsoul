import assert from 'node:assert/strict'
import test from 'node:test'

import { decide } from './flowMindEngine.js'
import { createTestEntity } from './testUtils.js'

test('decide is deterministic for the same input without explicit now', () => {
  const entity = createTestEntity()

  const input = {
    entity,
    behaviorState: entity.relational.behaviorState,
    progression: entity.relational.progression,
    userMemory: entity.relational.userMemory,
    hookLoop: entity.relational.hookLoop,
    contextSnapshot: {
      userIntent: 'export',
      journeyMoment: 'export',
      socialContext: {
        engagementScore: 0,
      },
    },
    journeyMoment: 'export',
  }

  const first = decide(input)
  const second = decide(input)

  assert.deepEqual(first, second)
})