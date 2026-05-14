import type { EntityCognitiveMemoryRepository } from '../../repositories/entityCognitiveMemoryRepository.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import type { InstitutionalContinuityGovernanceService } from '../../services/institutionalContinuityGovernanceService.js'
import { hydrateEntityCognitiveMemory, type EntityCognitiveMemory } from './entityCognitiveMemory.js'
import type { EntityCognitiveMemoryStore } from './entityCognitiveMemoryStore.js'
import { InMemoryEntityCognitiveMemoryStore } from './inMemoryEntityCognitiveMemoryStore.js'

export type CreatePersistentEntityCognitiveMemoryStoreOptions = {
  repository: EntityCognitiveMemoryRepository
  fallbackStore?: EntityCognitiveMemoryStore
  continuityGovernance?: InstitutionalContinuityGovernanceService
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
        return hydrateEntityCognitiveMemory(record.memory)
      }
    } catch {
      await this.options.continuityGovernance?.registerDegradedMemoryFallback({
        entityId,
        reason: 'entity cognitive memory repository read failed',
      })
      return this.fallbackStore.get(entityId)
    }

    return this.fallbackStore.get(entityId)
  }

  async set(entityId: string, memory: EntityCognitiveMemory): Promise<void> {
    traceMutation({
      source: 'backend/src/flowmind/memory/persistentEntityCognitiveMemoryStore.ts#set',
      type: 'memory',
      targetId: entityId,
      whatChanged: 'write persistent cognitive memory store',
    })
    const hydratedMemory = hydrateEntityCognitiveMemory(memory)
    await this.fallbackStore.set(entityId, hydratedMemory)
    try {
      await this.options.repository.save({
        entityId,
        memory: hydratedMemory,
      })
    } catch (error) {
      await this.options.continuityGovernance?.registerPersistenceTruthfulnessFailure({
        entityId,
        reason: 'entity cognitive memory repository write failed',
      })
      throw error
    }
  }
}

export function createPersistentEntityCognitiveMemoryStore(options: CreatePersistentEntityCognitiveMemoryStoreOptions) {
  return new PersistentEntityCognitiveMemoryStore(options)
}
