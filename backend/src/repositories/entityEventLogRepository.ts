import type { BackendDatabase } from '../db/index.js'
import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { JsonObject } from '../domain/entityProfile.js'

export type LogEventInput = {
  id?: string
  entityId: string
  type: string
  payload?: JsonObject
  timestamp?: string
  causedByCommandId?: string
}

function createEventId() {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function mapRow(row?: {
  id: string
  entity_id: string
  type: string
  payload: string
  timestamp: string
  caused_by_command_id: string | null
}): EntityEventLogRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    entityId: row.entity_id,
    type: row.type,
    payload: JSON.parse(row.payload) as JsonObject,
    timestamp: row.timestamp,
    causedByCommandId: row.caused_by_command_id ?? undefined,
  }
}

export class EntityEventLogRepository {
  constructor(private readonly db: BackendDatabase) {}

  async logEvent(input: LogEventInput): Promise<EntityEventLogRecord> {
    const event: EntityEventLogRecord = {
      id: input.id ?? createEventId(),
      entityId: input.entityId,
      type: input.type,
      payload: input.payload ?? {},
      timestamp: input.timestamp ?? new Date().toISOString(),
      causedByCommandId: input.causedByCommandId,
    }

    await this.db.run(
      `
        INSERT INTO entity_event_log (id, entity_id, type, payload, timestamp, caused_by_command_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      event.id,
      event.entityId,
      event.type,
      JSON.stringify(event.payload),
      event.timestamp,
      event.causedByCommandId ?? null,
    )

    return event
  }

  async getEvents(entityId: string): Promise<EntityEventLogRecord[]> {
    const rows = await this.db.all<Array<{
      id: string
      entity_id: string
      type: string
      payload: string
      timestamp: string
      caused_by_command_id: string | null
    }>>(
      `
        SELECT id, entity_id, type, payload, timestamp, caused_by_command_id
        FROM entity_event_log
        WHERE entity_id = ?
        ORDER BY timestamp ASC
      `,
      entityId,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is EntityEventLogRecord => Boolean(row))
  }

  async getRecentEvents(entityId: string, limit = 20): Promise<EntityEventLogRecord[]> {
    const rows = await this.db.all<Array<{
      id: string
      entity_id: string
      type: string
      payload: string
      timestamp: string
      caused_by_command_id: string | null
    }>>(
      `
        SELECT id, entity_id, type, payload, timestamp, caused_by_command_id
        FROM entity_event_log
        WHERE entity_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      entityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is EntityEventLogRecord => Boolean(row))
  }

  async getEventByCommandId(entityId: string, commandId: string): Promise<EntityEventLogRecord | null> {
    const row = await this.db.get<{
      id: string
      entity_id: string
      type: string
      payload: string
      timestamp: string
      caused_by_command_id: string | null
    }>(
      `
        SELECT id, entity_id, type, payload, timestamp, caused_by_command_id
        FROM entity_event_log
        WHERE entity_id = ? AND caused_by_command_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      entityId,
      commandId,
    )

    return mapRow(row)
  }
}

export function createEntityEventLogRepository(db: BackendDatabase) {
  return new EntityEventLogRepository(db)
}
