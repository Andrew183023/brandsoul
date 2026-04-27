import type { BackendDatabase } from '../db/index.js'
import type { JsonObject } from '../domain/entityProfile.js'
import type { EntityRelationalTraceRecord } from '../domain/entityRelationalTrace.js'

function createTraceId() {
  return `reltrace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function mapRow(row?: {
  id: string
  entity_id: string
  command_id: string | null
  event_type: string
  event_id: string
  actor_id: string | null
  occurred_at: string
  topic: string | null
  intent: string | null
  interaction_type: string | null
  delta_binding_strength: number
  delta_xp: number
  delta_continuity_confidence: number
  delta_return_count: number
  delta_share_count: number
  metadata_json: string
  created_at: string
}): EntityRelationalTraceRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    entityId: row.entity_id,
    commandId: row.command_id ?? undefined,
    eventType: row.event_type,
    eventId: row.event_id,
    actorId: row.actor_id ?? undefined,
    occurredAt: row.occurred_at,
    topic: row.topic ?? undefined,
    intent: row.intent ?? undefined,
    interactionType: row.interaction_type ?? undefined,
    deltaBindingStrength: row.delta_binding_strength,
    deltaXp: row.delta_xp,
    deltaContinuityConfidence: row.delta_continuity_confidence,
    deltaReturnCount: row.delta_return_count,
    deltaShareCount: row.delta_share_count,
    metadataJson: JSON.parse(row.metadata_json) as JsonObject,
    createdAt: row.created_at,
  }
}

export class RelationalTraceRepository {
  constructor(private readonly db: BackendDatabase) {}

  async logTrace(input: {
    id?: string
    entityId: string
    commandId?: string
    eventType: string
    eventId: string
    actorId?: string
    occurredAt: string
    topic?: string
    intent?: string
    interactionType?: string
    deltaBindingStrength: number
    deltaXp: number
    deltaContinuityConfidence: number
    deltaReturnCount: number
    deltaShareCount: number
    metadataJson?: JsonObject
    createdAt?: string
  }): Promise<EntityRelationalTraceRecord> {
    const record: EntityRelationalTraceRecord = {
      id: input.id ?? createTraceId(),
      entityId: input.entityId,
      commandId: input.commandId,
      eventType: input.eventType,
      eventId: input.eventId,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      topic: input.topic,
      intent: input.intent,
      interactionType: input.interactionType,
      deltaBindingStrength: input.deltaBindingStrength,
      deltaXp: input.deltaXp,
      deltaContinuityConfidence: input.deltaContinuityConfidence,
      deltaReturnCount: input.deltaReturnCount,
      deltaShareCount: input.deltaShareCount,
      metadataJson: input.metadataJson ?? {},
      createdAt: input.createdAt ?? new Date().toISOString(),
    }

    await this.db.run(
      `
        INSERT INTO entity_relational_trace (
          id, entity_id, command_id, event_type, event_id, actor_id, occurred_at,
          topic, intent, interaction_type, delta_binding_strength, delta_xp,
          delta_continuity_confidence, delta_return_count, delta_share_count, metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      record.id,
      record.entityId,
      record.commandId ?? null,
      record.eventType,
      record.eventId,
      record.actorId ?? null,
      record.occurredAt,
      record.topic ?? null,
      record.intent ?? null,
      record.interactionType ?? null,
      record.deltaBindingStrength,
      record.deltaXp,
      record.deltaContinuityConfidence,
      record.deltaReturnCount,
      record.deltaShareCount,
      JSON.stringify(record.metadataJson),
      record.createdAt,
    )

    return record
  }

  async getEntityTraces(entityId: string, limit = 200): Promise<EntityRelationalTraceRecord[]> {
    const rows = await this.db.all<Array<{
      id: string
      entity_id: string
      command_id: string | null
      event_type: string
      event_id: string
      actor_id: string | null
      occurred_at: string
      topic: string | null
      intent: string | null
      interaction_type: string | null
      delta_binding_strength: number
      delta_xp: number
      delta_continuity_confidence: number
      delta_return_count: number
      delta_share_count: number
      metadata_json: string
      created_at: string
    }>>(
      `
        SELECT id, entity_id, command_id, event_type, event_id, actor_id, occurred_at,
               topic, intent, interaction_type, delta_binding_strength, delta_xp,
               delta_continuity_confidence, delta_return_count, delta_share_count, metadata_json, created_at
        FROM entity_relational_trace
        WHERE entity_id = ?
        ORDER BY occurred_at DESC, created_at DESC
        LIMIT ?
      `,
      entityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is EntityRelationalTraceRecord => Boolean(row))
  }
}

export function createRelationalTraceRepository(db: BackendDatabase) {
  return new RelationalTraceRepository(db)
}