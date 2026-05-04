import type { EntityCognitiveMemory } from './entityCognitiveMemory.js'

export interface EntityCognitiveMemoryStore {
  get(entityId: string): Promise<EntityCognitiveMemory | undefined>
  set(entityId: string, memory: EntityCognitiveMemory): Promise<void>
}