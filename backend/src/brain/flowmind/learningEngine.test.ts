import assert from 'node:assert/strict'
import test from 'node:test'

import { registerOutcome } from './learningEngine.js'
import { createTestEntity } from './testUtils.js'

test('registerOutcome handles missing engagementScore without crashing', () => {
  const entity = createTestEntity()

  const result = registerOutcome({
    entity: entity as unknown as Parameters<typeof registerOutcome>[0]['entity'],
    decision: {
      confidence: 0.52,
    },
    success: true,
  })

  assert.equal(typeof result.impact.engagementScore, 'number')
  assert.equal(Number.isFinite(result.impact.engagementScore), true)
})