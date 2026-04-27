import type { BackendDatabase } from '../db/index.js'
import type { JsonObject } from '../domain/entityProfile.js'
import type { SocialSignalRecord, SocialSignalType } from '../domain/socialSignal.js'

export type RegisterSocialSignalInput = {
  id?: string
  entityId: string
  ownerId?: string
  type: SocialSignalType
  timestamp?: string
  weight?: number
  source?: string
  actorId?: string
  metadata?: JsonObject
}

function createSignalId() {
  return `ssig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function mapRow(row?: {
  id: string
  entity_id: string
  owner_id: string | null
  type: string
  timestamp: string
  weight: number
  source: string | null
  actor_id: string | null
  metadata: string
}): SocialSignalRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    entityId: row.entity_id,
    ownerId: row.owner_id ?? undefined,
    type: row.type as SocialSignalType,
    timestamp: row.timestamp,
    weight: row.weight,
    source: row.source ?? undefined,
    actorId: row.actor_id ?? undefined,
    metadata: JSON.parse(row.metadata) as JsonObject,
  }
}

export class SocialSignalRepository {
  constructor(private readonly db: BackendDatabase) {}

  async registerSignal(input: RegisterSocialSignalInput): Promise<SocialSignalRecord> {
    const record: SocialSignalRecord = {
      id: input.id ?? createSignalId(),
      entityId: input.entityId,
      ownerId: input.ownerId,
      type: input.type,
      timestamp: input.timestamp ?? new Date().toISOString(),
      weight: clamp(input.weight ?? 0.4),
      source: input.source,
      actorId: input.actorId,
      metadata: input.metadata ?? {},
    }

    await this.db.run(
      `
        INSERT INTO entity_social_signals (id, entity_id, owner_id, type, timestamp, weight, source, actor_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      record.id,
      record.entityId,
      record.ownerId ?? null,
      record.type,
      record.timestamp,
      record.weight,
      record.source ?? null,
      record.actorId ?? null,
      JSON.stringify(record.metadata),
    )

    return record
  }

  async registerSignalIfActorAbsentSince(input: RegisterSocialSignalInput, since: string): Promise<SocialSignalRecord | null> {
    const record: SocialSignalRecord = {
      id: input.id ?? createSignalId(),
      entityId: input.entityId,
      ownerId: input.ownerId,
      type: input.type,
      timestamp: input.timestamp ?? new Date().toISOString(),
      weight: clamp(input.weight ?? 0.4),
      source: input.source,
      actorId: input.actorId,
      metadata: input.metadata ?? {},
    }

    const result = await this.db.run(
      `
        INSERT INTO entity_social_signals (id, entity_id, owner_id, type, timestamp, weight, source, actor_id, metadata)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM entity_social_signals
          WHERE entity_id = ? AND actor_id = ? AND type = ? AND timestamp >= ?
        )
      `,
      record.id,
      record.entityId,
      record.ownerId ?? null,
      record.type,
      record.timestamp,
      record.weight,
      record.source ?? null,
      record.actorId ?? null,
      JSON.stringify(record.metadata),
      record.entityId,
      record.actorId ?? null,
      record.type,
      since,
    )

    return Number(result.changes ?? 0) > 0 ? record : null
  }

  async getSignals(entityId: string, limit = 200): Promise<SocialSignalRecord[]> {
    const rows = await this.db.all<Array<{
      id: string
      entity_id: string
      owner_id: string | null
      type: string
      timestamp: string
      weight: number
      source: string | null
      actor_id: string | null
      metadata: string
    }>>(
      `
        SELECT id, entity_id, owner_id, type, timestamp, weight, source, actor_id, metadata
        FROM entity_social_signals
        WHERE entity_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      entityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is SocialSignalRecord => Boolean(row))
  }

  async hasSignalByActor(entityId: string, type: SocialSignalType, actorId: string): Promise<boolean> {
    const row = await this.db.get<{ total: number }>(
      `
        SELECT COUNT(1) AS total
        FROM entity_social_signals
        WHERE entity_id = ? AND type = ? AND actor_id = ?
      `,
      entityId,
      type,
      actorId,
    )

    return Number(row?.total ?? 0) > 0
  }

  async countSignalsByActorSince(entityId: string, actorId: string, since: string, type?: SocialSignalType): Promise<number> {
    const row = await this.db.get<{ total: number }>(
      type
        ? `
            SELECT COUNT(1) AS total
            FROM entity_social_signals
            WHERE entity_id = ? AND actor_id = ? AND type = ? AND timestamp >= ?
          `
        : `
            SELECT COUNT(1) AS total
            FROM entity_social_signals
            WHERE entity_id = ? AND actor_id = ? AND timestamp >= ?
          `,
      ...(type
        ? [entityId, actorId, type, since]
        : [entityId, actorId, since]),
    )

    return Number(row?.total ?? 0)
  }
}

export function createSocialSignalRepository(db: BackendDatabase) {
  return new SocialSignalRepository(db)
}
