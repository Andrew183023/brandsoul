import type { BackendDatabase } from '../db/index.js'
import type { DeepPartial, EntityProfileDocument, JsonObject, StoredEntityProfile } from '../domain/entityProfile.js'

export type CreateEntityInput<T extends EntityProfileDocument = EntityProfileDocument> = {
  id: string
  ownerId?: string
  ownerUserId?: number
  ownerTenantId?: number
  entityProfile: T
  createdAt?: string
  updatedAt?: string
}

export type UpdateEntityInput<T extends EntityProfileDocument = EntityProfileDocument> = {
  id: string
  entityProfile: T
  updatedAt?: string
}

export type SetEntityOwnershipInput = {
  id: string
  ownerId?: string
  ownerUserId: number
  ownerTenantId: number
  updatedAt?: string
}

export type UpdateRelationalStateInput = {
  entityId: string
  updates: DeepPartial<NonNullable<EntityProfileDocument['relational']>>
  updatedAt?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge<T extends Record<string, unknown>>(base: T, updates: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'undefined') {
      continue
    }

    const currentValue = next[key]

    if (Array.isArray(value)) {
      next[key] = value
      continue
    }

    if (isPlainObject(value) && isPlainObject(currentValue)) {
      next[key] = deepMerge(currentValue, value)
      continue
    }

    next[key] = value
  }

  return next as T
}

function mapRowToStoredEntityProfile<T extends EntityProfileDocument>(row?: {
  id: string
  owner_id: string | null
  owner_user_id: number | null
  owner_tenant_id: number | null
  created_at: string
  updated_at: string
  entity_profile: string
}): StoredEntityProfile<T> | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    ownerUserId: row.owner_user_id ?? undefined,
    ownerTenantId: row.owner_tenant_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entityProfile: JSON.parse(row.entity_profile) as T,
  }
}

export class EntityRepository {
  constructor(private readonly db: BackendDatabase) {}

  async createEntity<T extends EntityProfileDocument>(input: CreateEntityInput<T>): Promise<StoredEntityProfile<T>> {
    const createdAt = input.createdAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? createdAt

    await this.db.run(
      `
        INSERT INTO entity_profile (id, owner_id, owner_user_id, owner_tenant_id, created_at, updated_at, entity_profile)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      input.id,
      input.ownerId ?? null,
      input.ownerUserId ?? null,
      input.ownerTenantId ?? null,
      createdAt,
      updatedAt,
      JSON.stringify(input.entityProfile),
    )

    return {
      id: input.id,
      ownerId: input.ownerId,
      ownerUserId: input.ownerUserId,
      ownerTenantId: input.ownerTenantId,
      createdAt,
      updatedAt,
      entityProfile: input.entityProfile,
    }
  }

  async getEntityById<T extends EntityProfileDocument>(id: string): Promise<StoredEntityProfile<T> | null> {
    const row = await this.db.get<{
      id: string
      owner_id: string | null
      owner_user_id: number | null
      owner_tenant_id: number | null
      created_at: string
      updated_at: string
      entity_profile: string
    }>(
      `
        SELECT id, owner_id, owner_user_id, owner_tenant_id, created_at, updated_at, entity_profile
        FROM entity_profile
        WHERE id = ?
      `,
      id,
    )

    return mapRowToStoredEntityProfile<T>(row)
  }

  async getEntitiesByOwnerId<T extends EntityProfileDocument>(ownerId: string): Promise<Array<StoredEntityProfile<T>>> {
    const rows = await this.db.all<Array<{
      id: string
      owner_id: string | null
      owner_user_id: number | null
      owner_tenant_id: number | null
      created_at: string
      updated_at: string
      entity_profile: string
    }>>(
      `
        SELECT id, owner_id, owner_user_id, owner_tenant_id, created_at, updated_at, entity_profile
        FROM entity_profile
        WHERE owner_id = ?
        ORDER BY updated_at DESC
      `,
      ownerId,
    )

    return rows
      .map((row) => mapRowToStoredEntityProfile<T>(row))
      .filter((row): row is StoredEntityProfile<T> => Boolean(row))
  }

  async listEntities<T extends EntityProfileDocument>(limit = 200): Promise<Array<StoredEntityProfile<T>>> {
    const rows = await this.db.all<Array<{
      id: string
      owner_id: string | null
      owner_user_id: number | null
      owner_tenant_id: number | null
      created_at: string
      updated_at: string
      entity_profile: string
    }>>(
      `
        SELECT id, owner_id, owner_user_id, owner_tenant_id, created_at, updated_at, entity_profile
        FROM entity_profile
        ORDER BY updated_at DESC
        LIMIT ?
      `,
      limit,
    )

    return rows
      .map((row) => mapRowToStoredEntityProfile<T>(row))
      .filter((row): row is StoredEntityProfile<T> => Boolean(row))
  }

  async getEntitiesByOwnerUserId<T extends EntityProfileDocument>(ownerUserId: number, ownerTenantId?: number): Promise<Array<StoredEntityProfile<T>>> {
    const rows = await this.db.all<Array<{
      id: string
      owner_id: string | null
      owner_user_id: number | null
      owner_tenant_id: number | null
      created_at: string
      updated_at: string
      entity_profile: string
    }>>(
      `
        SELECT id, owner_id, owner_user_id, owner_tenant_id, created_at, updated_at, entity_profile
        FROM entity_profile
        WHERE owner_user_id = ?
          AND (? IS NULL OR owner_tenant_id = ?)
        ORDER BY updated_at DESC
      `,
      ownerUserId,
      ownerTenantId ?? null,
      ownerTenantId ?? null,
    )

    return rows
      .map((row) => mapRowToStoredEntityProfile<T>(row))
      .filter((row): row is StoredEntityProfile<T> => Boolean(row))
  }

  async updateEntity<T extends EntityProfileDocument>(input: UpdateEntityInput<T>): Promise<StoredEntityProfile<T> | null> {
    const updatedAt = input.updatedAt ?? new Date().toISOString()
    const existing = await this.getEntityById<T>(input.id)

    if (!existing) {
      return null
    }

    await this.db.run(
      `
        UPDATE entity_profile
        SET owner_id = ?, owner_user_id = ?, owner_tenant_id = ?, updated_at = ?, entity_profile = ?
        WHERE id = ?
      `,
      existing.ownerId ?? null,
      existing.ownerUserId ?? null,
      existing.ownerTenantId ?? null,
      updatedAt,
      JSON.stringify(input.entityProfile),
      input.id,
    )

    return this.getEntityById<T>(input.id)
  }

  async setEntityOwnership<T extends EntityProfileDocument>(input: SetEntityOwnershipInput): Promise<StoredEntityProfile<T> | null> {
    const updatedAt = input.updatedAt ?? new Date().toISOString()
    const existing = await this.getEntityById<T>(input.id)

    if (!existing) {
      return null
    }

    await this.db.run(
      `
        UPDATE entity_profile
        SET owner_id = ?, owner_user_id = ?, owner_tenant_id = ?, updated_at = ?
        WHERE id = ?
      `,
      input.ownerId ?? existing.ownerId ?? null,
      input.ownerUserId,
      input.ownerTenantId,
      updatedAt,
      input.id,
    )

    return this.getEntityById<T>(input.id)
  }

  async updateRelationalState<T extends EntityProfileDocument = EntityProfileDocument>(
    input: UpdateRelationalStateInput,
  ): Promise<StoredEntityProfile<T> | null> {
    const existing = await this.getEntityById<T>(input.entityId)

    if (!existing) {
      return null
    }

    const updatedAt = input.updatedAt ?? new Date().toISOString()
    const currentProfile = existing.entityProfile
    const currentRelational = isPlainObject(currentProfile.relational) ? currentProfile.relational : {}
    const nextRelational = deepMerge(currentRelational, input.updates as Record<string, unknown>) as JsonObject
    const currentMetadata = isPlainObject(currentProfile.metadata) ? currentProfile.metadata : {}

    const nextProfile = {
      ...currentProfile,
      relational: nextRelational,
      metadata: {
        ...currentMetadata,
        updatedAt,
      },
    } as T

    return this.updateEntity<T>({
      id: input.entityId,
      entityProfile: nextProfile,
      updatedAt,
    })
  }

  async deleteEntity(id: string): Promise<boolean> {
    const result = await this.db.run(
      `
        DELETE FROM entity_profile
        WHERE id = ?
      `,
      id,
    )

    return (result.changes ?? 0) > 0
  }
}

export function createEntityRepository(db: BackendDatabase) {
  return new EntityRepository(db)
}
