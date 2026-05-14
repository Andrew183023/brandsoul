import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createEntityCognitiveMemoryRepository } from '../../repositories/entityCognitiveMemoryRepository.js'
import { createInstitutionalContinuityGovernanceService } from '../../services/institutionalContinuityGovernanceService.js'
import { runTestMemoryMutation } from '../../sovereignty/sovereignTestMutationHarness.js'
import { createDefaultEntityCognitiveMemory } from './entityCognitiveMemory.js'
import { InMemoryEntityCognitiveMemoryStore } from './inMemoryEntityCognitiveMemoryStore.js'
import { createPersistentEntityCognitiveMemoryStore } from './persistentEntityCognitiveMemoryStore.js'

test('persistentEntityCognitiveMemoryStore survives restart per entity', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'flowmind-memory-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  let firstConnection: Awaited<ReturnType<typeof createDatabaseConnection>> | null = null
  let secondConnection: Awaited<ReturnType<typeof createDatabaseConnection>> | null = null

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

    await runTestMemoryMutation(
      () => firstStore.set('entity-1', {
        ...initialMemory,
        historicalSignals: {
          ...initialMemory.historicalSignals,
          totalInteractions: 7,
          reliableEvidenceCount: 5,
        },
      }),
      'backend/src/flowmind/memory/persistentEntityCognitiveMemoryStore.test.ts#restart',
    )
    await firstConnection.close()
    firstConnection = null

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
    secondConnection = null
  } finally {
    if (secondConnection) {
      await secondConnection.close()
    }
    if (firstConnection) {
      await firstConnection.close()
    }
    await rm(workspace, { recursive: true, force: true })
  }
})

test('persistentEntityCognitiveMemoryStore preserves fallback memory when persistence fails', async () => {
  const fallbackStore = new InMemoryEntityCognitiveMemoryStore()
  const workspace = await mkdtemp(path.join(tmpdir(), 'flowmind-memory-continuity-'))
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile: path.join(workspace, 'continuity.sqlite'),
  })
  await initializeDatabase(connection)
  const continuityGovernance = createInstitutionalContinuityGovernanceService({ db: connection })
  await continuityGovernance.initialize()
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
    continuityGovernance,
  })
  const initialMemory = createDefaultEntityCognitiveMemory()

  try {
    await assert.rejects(
      runTestMemoryMutation(
        () => store.set('entity-safe', {
          ...initialMemory,
          historicalSignals: {
            ...initialMemory.historicalSignals,
            totalInteractions: 3,
          },
        }),
        'backend/src/flowmind/memory/persistentEntityCognitiveMemoryStore.test.ts#fallback',
      ),
      /repository unavailable/,
    )

    const restored = await store.get('entity-safe')
    assert.equal(restored?.historicalSignals.totalInteractions, 3)
    const status = continuityGovernance.getStatus()
    assert.equal(status.continuityMode, 'continuity_untrusted')
    assert.equal(status.persistenceTruthfulness, 'untrusted')
    assert.equal(status.recoveryRequired, true)
  } finally {
    await connection.close()
    await rm(workspace, { recursive: true, force: true })
  }
})

test('persistentEntityCognitiveMemoryStore repository read failure enters degraded memory mode', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'flowmind-memory-read-failure-'))
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile: path.join(workspace, 'continuity.sqlite'),
  })
  await initializeDatabase(connection)
  const continuityGovernance = createInstitutionalContinuityGovernanceService({ db: connection })
  await continuityGovernance.initialize()
  const fallbackStore = new InMemoryEntityCognitiveMemoryStore()
  const initialMemory = createDefaultEntityCognitiveMemory()
  await runTestMemoryMutation(
    () => fallbackStore.set('entity-read-safe', {
      ...initialMemory,
      historicalSignals: {
        ...initialMemory.historicalSignals,
        totalInteractions: 6,
      },
    }),
    'backend/src/flowmind/memory/persistentEntityCognitiveMemoryStore.test.ts#readFailureSeed',
  )

  const store = createPersistentEntityCognitiveMemoryStore({
    repository: {
      async getByEntityId() {
        throw new Error('repository unavailable')
      },
      async save() {
        return undefined
      },
    } as unknown as ReturnType<typeof createEntityCognitiveMemoryRepository>,
    fallbackStore,
    continuityGovernance,
  })

  try {
    const restored = await store.get('entity-read-safe')
    assert.equal(restored?.historicalSignals.totalInteractions, 6)
    const status = continuityGovernance.getStatus()
    assert.equal(status.continuityMode, 'degraded_memory')
    assert.equal(status.persistenceTruthfulness, 'degraded')
    assert.equal(status.degradedMemoryFallbackActive, true)
  } finally {
    await connection.close()
    await rm(workspace, { recursive: true, force: true })
  }
})

test('persistentEntityCognitiveMemoryStore rejects unauthorized direct mutation', async () => {
  const store = createPersistentEntityCognitiveMemoryStore({
    repository: {
      async getByEntityId() {
        return null
      },
      async save() {
        return undefined
      },
    } as unknown as ReturnType<typeof createEntityCognitiveMemoryRepository>,
  })

  await assert.rejects(
    store.set('entity-unauthorized', createDefaultEntityCognitiveMemory()),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION')
      return true
    },
  )
})
