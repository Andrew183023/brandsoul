import type { EntityCognitiveMemoryRepository } from '../../repositories/entityCognitiveMemoryRepository.js'
import { hydrateEntityCognitiveMemory, type EntityCognitiveMemory } from './entityCognitiveMemory.js'
import type { EntityCognitiveMemoryStore } from './entityCognitiveMemoryStore.js'
import { InMemoryEntityCognitiveMemoryStore } from './inMemoryEntityCognitiveMemoryStore.js'

export type CreatePersistentEntityCognitiveMemoryStoreOptions = {
  repository: EntityCognitiveMemoryRepository
  fallbackStore?: EntityCognitiveMemoryStore
}

export class PersistentEntityCognitiveMemoryStore implements EntityCognitiveMemoryStore {
  private readonly fallbackStore: EntityCognitiveMemoryStore

  constructor(private readonly options: CreatePersistentEntityCognitiveMemoryStoreOptions) {
    this.fallbackStore = options.fallbackStore ?? new InMemoryEntityCognitiveMemoryStore()
  }

  async get(entityId: string): Promise<EntityCognitiveMemory | undefined> {
    try {
      const record = await this.options.repository.getByEntityId(entityId)
      if (record) {
        await this.fallbackStore.set(entityId, record.memory)
        return hydrateEntityCognitiveMemory(record.memory)
      }
    } catch {
      return this.fallbackStore.get(entityId)
    }

    return this.fallbackStore.get(entityId)
  }

  async set(entityId: string, memory: EntityCognitiveMemory): Promise<void> {
    const hydratedMemory = hydrateEntityCognitiveMemory(memory)
    await this.fallbackStore.set(entityId, hydratedMemory)

    try {
      await this.options.repository.save({
        entityId,
        memory: hydratedMemory,
      })
    } catch {
      return
    }
  }
}

export function createPersistentEntityCognitiveMemoryStore(options: CreatePersistentEntityCognitiveMemoryStoreOptions) {
  return new PersistentEntityCognitiveMemoryStore(options)
}