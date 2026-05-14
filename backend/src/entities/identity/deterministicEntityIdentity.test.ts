import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDeterministicCanonicalSlug,
  buildDeterministicEntityId,
  buildGenesisFingerprint,
} from './deterministicEntityIdentity.js'

test('same input yields the same genesis fingerprint and deterministic slug', () => {
  const input = {
    tenantId: 7,
    canonicalName: 'Aurora Legal',
    entityType: 'legal' as const,
    createdAt: '2026-05-10T12:00:00.000Z',
    stableSeedMaterial: {
      brandCategory: 'law',
      languageStyle: 'technical',
    },
  }

  assert.equal(buildGenesisFingerprint(input), buildGenesisFingerprint(input))
  assert.equal(buildDeterministicCanonicalSlug(input), buildDeterministicCanonicalSlug(input))
  assert.equal(buildDeterministicEntityId(input), buildDeterministicEntityId(input))
})

test('deterministic slug and entity id do not rely on random generation', () => {
  const input = {
    tenantId: 2,
    canonicalName: 'Casa Aurora',
    entityType: 'brand' as const,
    createdAt: '2026-05-10T12:00:00.000Z',
  }

  const slug = buildDeterministicCanonicalSlug(input)
  const entityId = buildDeterministicEntityId(input)

  assert.match(slug, /^casa-aurora-[a-f0-9]{10}$/)
  assert.match(entityId, /^entity-casa-aurora-[a-f0-9]{10}$/)
})

