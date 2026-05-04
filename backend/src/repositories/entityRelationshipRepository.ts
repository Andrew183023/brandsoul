export type EntityRelationshipRecord = {
  id: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  strength: number
  lastInteractionAt?: string
  createdAt: string
  updatedAt: string
}

export type CreateEntityRelationshipInput = {
  id?: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  strength?: number
  lastInteractionAt?: string
  createdAt?: string
  updatedAt?: string
}

export type GetEntityRelationshipInput = {
  sourceEntityId: string
  targetEntityId: string
  relationType: string
}

export type UpdateEntityRelationshipInput = {
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  strength?: number
  lastInteractionAt?: string
  updatedAt?: string
}

function createRelationshipId() {
  return `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampStrength(value: number) {
  return Math.min(1, Math.max(0, value))
}

function createLookupKey(input: GetEntityRelationshipInput) {
  return `${input.sourceEntityId}::${input.targetEntityId}::${input.relationType}`
}

export class EntityRelationshipRepository {
  private readonly records = new Map<string, EntityRelationshipRecord>()
  private readonly lookup = new Map<string, string>()

  constructor(_db?: unknown) {}

  async createRelationship(input: CreateEntityRelationshipInput): Promise<EntityRelationshipRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? createdAt
    const record: EntityRelationshipRecord = {
      id: input.id ?? createRelationshipId(),
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      relationType: input.relationType,
      strength: clampStrength(input.strength ?? 0.15),
      lastInteractionAt: input.lastInteractionAt,
      createdAt,
      updatedAt,
    }

    this.records.set(record.id, record)
    this.lookup.set(
      createLookupKey({
        sourceEntityId: record.sourceEntityId,
        targetEntityId: record.targetEntityId,
        relationType: record.relationType,
      }),
      record.id,
    )

    return record
  }

  async getRelationship(input: GetEntityRelationshipInput): Promise<EntityRelationshipRecord | null> {
    const id = this.lookup.get(createLookupKey(input))
    if (!id) {
      return null
    }

    return this.records.get(id) ?? null
  }

  async updateRelationship(input: UpdateEntityRelationshipInput): Promise<EntityRelationshipRecord | null> {
    const existing = await this.getRelationship({
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      relationType: input.relationType,
    })

    if (!existing) {
      return null
    }

    const record: EntityRelationshipRecord = {
      ...existing,
      strength: clampStrength(input.strength ?? existing.strength),
      lastInteractionAt: typeof input.lastInteractionAt === 'undefined' ? existing.lastInteractionAt : input.lastInteractionAt,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    }

    this.records.set(record.id, record)
    return record
  }

  async getConnections(entityId: string): Promise<EntityRelationshipRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => record.sourceEntityId === entityId || record.targetEntityId === entityId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
}

export function createEntityRelationshipRepository(db?: unknown) {
  return new EntityRelationshipRepository(db)
}
