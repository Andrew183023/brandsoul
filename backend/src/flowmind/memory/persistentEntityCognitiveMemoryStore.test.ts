import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createEntityCognitiveMemoryRepository } from '../../repositories/entityCognitiveMemoryRepository.js'
import { createDefaultEntityCognitiveMemory } from './entityCognitiveMemory.js'
import { InMemoryEntityCognitiveMemoryStore } from './inMemoryEntityCognitiveMemoryStore.js'
import { createPersistentEntityCognitiveMemoryStore } from './persistentEntityCognitiveMemoryStore.js'

test('persistentEntityCognitiveMemoryStore survives restart per entity', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'flowmind-memory-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')

  try {
    const firstConnection = await createDatabaseConnection({
      provider: 'sqlite',
      sqliteFile,
    })
    await initializeDatabase(firstConnection)
    const firstStore = createPersistentEntityCognitiveMemoryStore({
      repository: createEntityCognitiveMemoryRepository(firstConnection),
    })
    const initialMemory = createDefaultEntityCognitiveMemory()

    await firstStore.set('entity-1', {
      ...initialMemory,
      historicalSignals: {
        ...initialMemory.historicalSignals,
        totalInteractions: 7,
        reliableEvidenceCount: 5,
      },
    })
    await firstConnection.close()

    const secondConnection = await createDatabaseConnection({
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
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('persistentEntityCognitiveMemoryStore keeps working when persistence fails', async () => {
  const fallbackStore = new InMemoryEntityCognitiveMemoryStore()
  const store = createPersistentEntityCognitiveMemoryStore({
    repository: {
      async getByEntityId() {
        throw new Error('repository unavailable')
      },
      async save() {
        throw new Error('repository unavailable')
      },
    } as unknown as ReturnType<typeof createEntityCognitiveMemoryRepository>,
    fallbackStore,
  })
  const initialMemory = createDefaultEntityCognitiveMemory()

  await store.set('entity-safe', {
    ...initialMemory,
    historicalSignals: {
      ...initialMemory.historicalSignals,
      totalInteractions: 3,
    },
  })

  const restored = await store.get('entity-safe')
  assert.equal(restored?.historicalSignals.totalInteractions, 3)
})