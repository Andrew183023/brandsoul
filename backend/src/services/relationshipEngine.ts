type RelationshipRecord = {
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  strength: number
  lastInteractionAt?: string
}

type CreateRelationshipInput = {
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  strength?: number
  lastInteractionAt?: string
}

type UpdateRelationshipInput = {
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  strength?: number
  strengthDelta?: number
  lastInteractionAt?: string
}

type RelationshipLookup = {
  sourceEntityId: string
  targetEntityId: string
  relationType: string
}

type RelationshipRepositoryLike = {
  createRelationship(input: {
    sourceEntityId: string
    targetEntityId: string
    relationType: string
    strength: number
    lastInteractionAt?: string
  }): Promise<RelationshipRecord>
  getRelationship(input: RelationshipLookup): Promise<RelationshipRecord | null | undefined>
  updateRelationship(input: {
    sourceEntityId: string
    targetEntityId: string
    relationType: string
    strength: number
    lastInteractionAt?: string
  }): Promise<RelationshipRecord>
  getConnections(entityId: string): Promise<RelationshipRecord[]>
}

function clampStrength(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export class RelationshipEngine {
  constructor(private readonly repository: RelationshipRepositoryLike) {}

  async createRelationship(args: CreateRelationshipInput): Promise<RelationshipRecord> {
    return this.repository.createRelationship({
      sourceEntityId: args.sourceEntityId,
      targetEntityId: args.targetEntityId,
      relationType: args.relationType,
      strength: clampStrength(args.strength ?? 0.15),
      lastInteractionAt: args.lastInteractionAt,
    })
  }

  async updateRelationship(args: UpdateRelationshipInput): Promise<RelationshipRecord> {
    const existing = await this.repository.getRelationship({
      sourceEntityId: args.sourceEntityId,
      targetEntityId: args.targetEntityId,
      relationType: args.relationType,
    })

    if (!existing) {
      return this.createRelationship({
        sourceEntityId: args.sourceEntityId,
        targetEntityId: args.targetEntityId,
        relationType: args.relationType,
        strength: args.strength ?? clampStrength(args.strengthDelta ?? 0.15),
        lastInteractionAt: args.lastInteractionAt,
      })
    }

    const nextStrength =
      typeof args.strength === 'number'
        ? args.strength
        : existing.strength + (args.strengthDelta ?? 0.08)

    return this.repository.updateRelationship({
      sourceEntityId: args.sourceEntityId,
      targetEntityId: args.targetEntityId,
      relationType: args.relationType,
      strength: clampStrength(nextStrength),
      lastInteractionAt: args.lastInteractionAt ?? new Date().toISOString(),
    })
  }

  async getConnections(entityId: string): Promise<RelationshipRecord[]> {
    return this.repository.getConnections(entityId)
  }
}

export function createRelationshipEngine(repository: RelationshipRepositoryLike) {
  return new RelationshipEngine(repository)
}
