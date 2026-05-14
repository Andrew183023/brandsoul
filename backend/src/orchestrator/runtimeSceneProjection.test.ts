import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import { buildRuntimeSceneProjection } from './runtimeSceneProjection.js'

test('runtime scene projection fails closed when canonical identity is missing', () => {
  const entity = createTestEntity()
  delete entity.canonicalIdentity
  const runtimeControl = entity.runtime?.control
  assert.ok(runtimeControl)

  assert.throws(
    () => buildRuntimeSceneProjection({
      entityProfile: entity,
      runtimeControl,
      stage: 'initial',
    }),
    /ENTITY_CANONICAL_IDENTITY_REQUIRED/,
  )
})

test('runtime scene projection uses canonical identity for origin source', () => {
  const entity = createTestEntity()
  const runtimeControl = entity.runtime?.control
  assert.ok(runtimeControl)
  const scene = buildRuntimeSceneProjection({
    entityProfile: entity,
    runtimeControl,
    stage: 'initial',
  })

  assert.ok(scene)
  assert.ok(scene.composition)
  assert.equal(scene.composition.originSource, entity.canonicalIdentity?.identity.canonicalName)
})
