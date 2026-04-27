import { createDefaultEntityCognitiveMemory, hydrateEntityCognitiveMemory, type EntityCognitiveMemory } from './entityCognitiveMemory.js'
import type { EntityCognitiveMemoryStore } from './entityCognitiveMemoryStore.js'

export class InMemoryEntityCognitiveMemoryStore implements EntityCognitiveMemoryStore {
  private readonly registry = new Map<string, EntityCognitiveMemory>()

  async get(entityId: string) {
    const memory = this.registry.get(entityId)
    return memory ? hydrateEntityCognitiveMemory(memory, createDefaultEntityCognitiveMemory()) : undefined
  }

  async set(entityId: string, memory: EntityCognitiveMemory) {
    this.registry.set(entityId, hydrateEntityCognitiveMemory(memory, createDefaultEntityCognitiveMemory()))
  }
}