import type { BackendDatabase } from '../db/index.js'
import { hydrateEntityCognitiveMemory, type EntityCognitiveMemory } from '../flowmind/memory/entityCognitiveMemory.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type EntityCognitiveMemoryRecord = {
  entityId: string
  memory: EntityCognitiveMemory
  createdAt: string
  updatedAt: string
}

function mapRow(row?: {
  entity_id: string
  memory_json: string
  created_at: string
  updated_at: string
}): EntityCognitiveMemoryRecord | null {
  if (!row) {
    return null
  }

  return {
    entityId: row.entity_id,
    memory: hydrateEntityCognitiveMemory(JSON.parse(row.memory_json) as Partial<EntityCognitiveMemory>),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class EntityCognitiveMemoryRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getByEntityId(entityId: string): Promise<EntityCognitiveMemoryRecord | null> {
    const row = await this.db.get<{
      entity_id: string
      memory_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT entity_id, memory_json, created_at, updated_at
        FROM entity_cognitive_memory
        WHERE entity_id = ?
        LIMIT 1
      `,
      entityId,
    )

    return mapRow(row)
  }

  async save(args: {
    entityId: string
    memory: EntityCognitiveMemory
    createdAt?: string
    updatedAt?: string
  }): Promise<EntityCognitiveMemoryRecord> {
    traceMutation({
      source: 'backend/src/repositories/entityCognitiveMemoryRepository.ts#save',
      type: 'memory',
      targetId: args.entityId,
      whatChanged: 'persist entity cognitive memory',
    })
    const existing = await this.getByEntityId(args.entityId)
    const createdAt = existing?.createdAt ?? args.createdAt ?? new Date().toISOString()
    const updatedAt = args.updatedAt ?? new Date().toISOString()
    const memory = hydrateEntityCognitiveMemory(args.memory)

    await this.db.run(
      `
        INSERT INTO entity_cognitive_memory (entity_id, memory_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(entity_id) DO UPDATE SET
          memory_json = excluded.memory_json,
          updated_at = excluded.updated_at
      `,
      args.entityId,
      JSON.stringify(memory),
      createdAt,
      updatedAt,
    )

    return {
      entityId: args.entityId,
      memory,
      createdAt,
      updatedAt,
    }
  }
}

export function createEntityCognitiveMemoryRepository(db: BackendDatabase) {
  return new EntityCognitiveMemoryRepository(db)
}
