import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../../brain/flowmind/testUtils.js'
import {
  applyLegacySparkCompatibilityWrite,
  readLegacySparkCompatibility,
} from './entityLegacySemanticGateway.js'

test('legacy gateway reads backend canonicalIdentity into legacy spark payload', () => {
  const entity = createTestEntity()
  const response = readLegacySparkCompatibility(entity)

  assert.equal(response.metadata.semanticAuthority, 'backend.canonicalIdentity')
  assert.equal(response.metadata.legacyCompatibility, true)
  assert.equal(response.metadata.deprecatedLegacyAuthority, true)
  assert.equal(response.payload.brandName, entity.canonicalIdentity?.identity.canonicalName)
})

test('legacy gateway write maps payload into canonicalIdentity and increments identityVersion on semantic change', () => {
  const entity = createTestEntity()
  const beforeVersion = entity.canonicalIdentity!.identity.identityVersion

  const result = applyLegacySparkCompatibilityWrite({
    entityProfile: entity,
    tenantId: 1,
    createdAt: '2026-04-19T12:00:00.000Z',
    payload: {
      brandName: 'Aurora Nova',
      tone: 'serio',
      power: 'guidance',
      businessModel: 'professional',
      brandType: 'professional',
      voiceStyle: 'technical',
      businessDescription: 'Orientacao institucional clara.',
    },
  })

  assert.equal(result.changed, true)
  assert.equal(result.entityProfile.id, entity.id)
  assert.equal(result.entityProfile.canonicalIdentity?.identity.entityId, entity.id)
  assert.equal(result.entityProfile.canonicalIdentity?.identity.identityVersion, beforeVersion + 1)
  assert.equal(result.entityProfile.canonicalIdentity?.persona.communicationStyle, 'technical')
})

test('legacy gateway write preserves identityVersion when semantically identical', () => {
  const entity = createTestEntity()
  const payload = readLegacySparkCompatibility(entity).payload

  const result = applyLegacySparkCompatibilityWrite({
    entityProfile: entity,
    tenantId: 1,
    createdAt: '2026-04-19T12:00:00.000Z',
    payload,
  })

  assert.equal(result.changed, false)
  assert.equal(result.entityProfile.canonicalIdentity?.identity.identityVersion, entity.canonicalIdentity?.identity.identityVersion)
})

