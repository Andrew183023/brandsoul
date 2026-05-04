import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createEntityCognitiveMemoryRepository } from '../../repositories/entityCognitiveMemoryRepository.js'
import { withTestMutationAuthority } from '../../test/withTestMutationAuthority.js'
import { createDefaultEntityCognitiveMemory } from './entityCognitiveMemory.js'
import { InMemoryEntityCognitiveMemoryStore } from './inMemoryEntityCognitiveMemoryStore.js'
import { createPersistentEntityCognitiveMemoryStore } from './persistentEntityCognitiveMemoryStore.js'

async function removeDirectoryWithRetry(targetPath: string, attempts = 5) {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)))
    }
  }

  throw lastError
}

test('persistentEntityCognitiveMemoryStore survives restart per entity', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'flowmind-memory-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  let firstConnection: Awaited<ReturnType<typeof createDatabaseConnection>> | undefined
  let secondConnection: Awaited<ReturnType<typeof createDatabaseConnection>> | undefined

  try {
    firstConnection = await createDatabaseConnection({
      provider: 'sqlite',
      sqliteFile,
    })
    await initializeDatabase(firstConnection)
    const firstStore = createPersistentEntityCognitiveMemoryStore({
      repository: createEntityCognitiveMemoryRepository(firstConnection),
    })
    const initialMemory = createDefaultEntityCognitiveMemory()

    await withTestMutationAuthority('test-seed', async () => firstStore.set('entity-1', {
      ...initialMemory,
      historicalSignals: {
        ...initialMemory.historicalSignals,
        totalInteractions: 7,
        reliableEvidenceCount: 5,
      },
    }))
    await firstConnection.close()
    firstConnection = undefined

    secondConnection = await createDatabaseConnection({
      provider: 'sqlite',
      sqliteFile,
    })
    await initializeDatabase(secondConnection)
    const secondStore = createPersistentEntityCognitiveMemoryStore({
      repository: createEntityCognitiveMemoryRepository(secondConnection),
    })
    const restored = await secondStore.get('entity-1')

    assert.equal(restored?.historicalSignals.totalInteractions, 7)
    assert.equal(restored?.historicalSignals.reliableEvidenceCount, 5)
    await secondConnection.close()
    secondConnection = undefined
  } finally {
    await firstConnection?.close()
    await secondConnection?.close()
    await removeDirectoryWithRetry(workspace)
  }
})

test('persistentEntityCognitiveMemoryStore falls back to in-memory reads when persistence lookup fails', async () => {
  const fallbackStore = new InMemoryEntityCognitiveMemoryStore()
  const initialMemory = createDefaultEntityCognitiveMemory()

  await withTestMutationAuthority('test-seed', async () => fallbackStore.set('entity-safe', {
    ...initialMemory,
    historicalSignals: {
      ...initialMemory.historicalSignals,
      totalInteractions: 3,
    },
  }))

  const store = createPersistentEntityCognitiveMemoryStore({
    repository: {
      async getByEntityId() {
        throw new Error('repository unavailable')
      },
      async save() {
        return undefined as never
      },
    } as unknown as ReturnType<typeof createEntityCognitiveMemoryRepository>,
    fallbackStore,
  })

  const restored = await store.get('entity-safe')
  assert.equal(restored?.historicalSignals.totalInteractions, 3)
})