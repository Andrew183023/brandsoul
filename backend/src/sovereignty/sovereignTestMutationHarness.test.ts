import assert from 'node:assert/strict'
import test from 'node:test'

import type { EntityCognitiveMemory } from '../flowmind/memory/entityCognitiveMemory.js'
import type { EntityCognitiveMemoryRepository } from '../repositories/entityCognitiveMemoryRepository.js'
import { createDefaultEntityCognitiveMemory } from '../flowmind/memory/entityCognitiveMemory.js'
import { createPersistentEntityCognitiveMemoryStore } from '../flowmind/memory/persistentEntityCognitiveMemoryStore.js'
import { getMutationAuthorityContext } from './authorityBoundary.js'
import { runSeedMutation, runTestMemoryMutation, runTestMutation } from './sovereignTestMutationHarness.js'

function createRepositoryStub(): EntityCognitiveMemoryRepository {
  return {
    async getByEntityId() {
      return null
    },
    async save(args: { entityId: string; memory: EntityCognitiveMemory }) {
      return {
        entityId: args.entityId,
        memory: args.memory,
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:00:00.000Z',
      }
    },
  } as unknown as EntityCognitiveMemoryRepository
}

test('unauthorized protected mutation still fails outside sovereign test helpers', async () => {
  const store = createPersistentEntityCognitiveMemoryStore({
    repository: createRepositoryStub(),
  })

  await assert.rejects(
    store.set('entity-unauthorized', createDefaultEntityCognitiveMemory()),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION')
      return true
    },
  )
})

test('sovereign test helper mutation succeeds and persists fallback memory', async () => {
  const store = createPersistentEntityCognitiveMemoryStore({
    repository: createRepositoryStub(),
  })
  const memory = createDefaultEntityCognitiveMemory()

  await runTestMemoryMutation(
    () => store.set('entity-authorized', memory),
    'backend/src/sovereignty/sovereignTestMutationHarness.test.ts#memory',
  )

  const restored = await store.get('entity-authorized')
  assert.deepEqual(restored, memory)
})

test('authority scope remains isolated to the helper callback', async () => {
  const store = createPersistentEntityCognitiveMemoryStore({
    repository: createRepositoryStub(),
  })

  assert.equal(getMutationAuthorityContext(), undefined)

  await runTestMutation(async () => {
    assert.equal(getMutationAuthorityContext()?.viaExecutor, true)
    await store.set('entity-scoped', createDefaultEntityCognitiveMemory())
  }, 'backend/src/sovereignty/sovereignTestMutationHarness.test.ts#scope')

  assert.equal(getMutationAuthorityContext(), undefined)

  await assert.rejects(
    store.set('entity-scoped-after', createDefaultEntityCognitiveMemory()),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION')
      return true
    },
  )
})

test('production mutation rules remain unchanged after helper-assisted seeding', async () => {
  const store = createPersistentEntityCognitiveMemoryStore({
    repository: createRepositoryStub(),
  })

  await runSeedMutation(
    () => store.set('entity-seeded', createDefaultEntityCognitiveMemory()),
    'backend/src/sovereignty/sovereignTestMutationHarness.test.ts#seed',
  )

  await assert.rejects(
    store.set('entity-seeded-followup', createDefaultEntityCognitiveMemory()),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION')
      return true
    },
  )
})
