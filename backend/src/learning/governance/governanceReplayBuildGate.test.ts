import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyReplayIdentityField,
  detectUnknownReplayIdentityFields,
  getFrozenReplayIdentityFields,
} from './replayIdentityGovernancePolicy.js'

const SURFACES = [
  'adaptive_influence',
  'adaptive_equilibrium',
  'governance_timeline',
] as const

test('governance replay build gate: all frozen identity fields are known and policy-safe', () => {
  for (const surface of SURFACES) {
    const frozenFields = getFrozenReplayIdentityFields(surface)
    const unknownFields = detectUnknownReplayIdentityFields(frozenFields)
    assert.deepEqual(unknownFields, [], `${surface} contains unknown replay identity fields: ${unknownFields.join(', ')}`)

    for (const field of frozenFields) {
      const classification = classifyReplayIdentityField(field)
      assert.notEqual(classification, 'request_metadata', `${surface} leaks request metadata field ${field}`)
      assert.notEqual(classification, 'observability_only', `${surface} leaks observability-only field ${field}`)
      assert.notEqual(classification, 'prohibited_identity', `${surface} leaks prohibited field ${field}`)
    }
  }
})
