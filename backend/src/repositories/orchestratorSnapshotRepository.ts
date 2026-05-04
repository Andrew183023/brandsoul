import type { BackendDatabase } from '../db/index.js'
import type { JsonObject } from '../domain/entityProfile.js'
import type { OrchestratorSnapshotRecord } from '../domain/orchestratorSnapshot.js'
import type { OrchestratorCommandSource } from '../orchestrator/orchestratorState.js'

export type SaveOrchestratorSnapshotInput = {
  id?: string
  entityId: string
  sessionId?: string
  version?: number
  sequence?: number
  currentStage?: string
  sessionStatus: string
  relationalSnapshot: JsonObject
  renderSnapshot: JsonObject
  lastCommand?: {
    commandId: string
    type: string
    issuedAt: string
    source: OrchestratorCommandSource
  }
  lastEventId?: string
  lastEventType?: string
  createdAt?: string
  updatedAt?: string
}

function createSnapshotId() {
  return `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function mapRow(row?: {
  id: string
  entity_id: string
  session_id: string | null
  version: number
  sequence: number
  current_stage: string | null
  session_status: string
  relational_snapshot: string
  render_snapshot: string
  last_command_id: string | null
  last_command_type: string | null
  last_command_issued_at: string | null
  last_command_source: string | null
  last_event_id: string | null
  last_event_type: string | null
  created_at: string
  updated_at: string
}): OrchestratorSnapshotRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    entityId: row.entity_id,
    sessionId: row.session_id ?? undefined,
    version: row.version,
    sequence: row.sequence,
    currentStage: row.current_stage ?? undefined,
    sessionStatus: row.session_status,
    relationalSnapshot: JSON.parse(row.relational_snapshot) as JsonObject,
    renderSnapshot: JSON.parse(row.render_snapshot) as JsonObject,
    lastCommand: row.last_command_id && row.last_command_type && row.last_command_issued_at && row.last_command_source
      ? {
        commandId: row.last_command_id,
        type: row.last_command_type,
        issuedAt: row.last_command_issued_at,
        source: row.last_command_source as OrchestratorCommandSource,
      }
      : undefined,
    lastEventId: row.last_event_id ?? undefined,
    lastEventType: row.last_event_type ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class OrchestratorSnapshotRepository {
  constructor(private readonly db: BackendDatabase) {}

  async saveSnapshot(input: SaveOrchestratorSnapshotInput): Promise<OrchestratorSnapshotRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? createdAt
    const record: OrchestratorSnapshotRecord = {
      id: input.id ?? createSnapshotId(),
      entityId: input.entityId,
      sessionId: input.sessionId,
      version: input.version ?? 1,
      sequence: input.sequence ?? 0,
      currentStage: input.currentStage,
      sessionStatus: input.sessionStatus,
      relationalSnapshot: input.relationalSnapshot,
      renderSnapshot: input.renderSnapshot,
      lastCommand: input.lastCommand,
      lastEventId: input.lastEventId,
      lastEventType: input.lastEventType,
      createdAt,
      updatedAt,
    }

    await this.db.run(
      `
        INSERT INTO orchestrator_snapshot (
          id, entity_id, session_id, version, sequence, current_stage, session_status,
          relational_snapshot, render_snapshot,
          last_command_id, last_command_type, last_command_issued_at, last_command_source,
          last_event_id, last_event_type, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      record.id,
      record.entityId,
      record.sessionId ?? null,
      record.version,
      record.sequence,
      record.currentStage ?? null,
      record.sessionStatus,
      JSON.stringify(record.relationalSnapshot),
      JSON.stringify(record.renderSnapshot),
      record.lastCommand?.commandId ?? null,
      record.lastCommand?.type ?? null,
      record.lastCommand?.issuedAt ?? null,
      record.lastCommand?.source ?? null,
      record.lastEventId ?? null,
      record.lastEventType ?? null,
      record.createdAt,
      record.updatedAt,
    )

    return record
  }

  async getLatestSnapshot(entityId: string): Promise<OrchestratorSnapshotRecord | null> {
    const row = await this.db.get<{
      id: string
      entity_id: string
      session_id: string | null
      version: number
      sequence: number
      current_stage: string | null
      session_status: string
      relational_snapshot: string
      render_snapshot: string
      last_command_id: string | null
      last_command_type: string | null
      last_command_issued_at: string | null
      last_command_source: string | null
      last_event_id: string | null
      last_event_type: string | null
      created_at: string
      updated_at: string
    }>(
      `
        SELECT id, entity_id, session_id, version, sequence, current_stage, session_status,
           relational_snapshot, render_snapshot,
           last_command_id, last_command_type, last_command_issued_at, last_command_source,
           last_event_id, last_event_type, created_at, updated_at
        FROM orchestrator_snapshot
        WHERE entity_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      entityId,
    )

    return mapRow(row)
  }

  async listSnapshots(entityId: string, limit = 20): Promise<OrchestratorSnapshotRecord[]> {
    const rows = await this.db.all<Array<{
      id: string
      entity_id: string
      session_id: string | null
      version: number
      sequence: number
      current_stage: string | null
      session_status: string
      relational_snapshot: string
      render_snapshot: string
      last_command_id: string | null
      last_command_type: string | null
      last_command_issued_at: string | null
      last_command_source: string | null
      last_event_id: string | null
      last_event_type: string | null
      created_at: string
      updated_at: string
    }>>(
      `
        SELECT id, entity_id, session_id, version, sequence, current_stage, session_status,
           relational_snapshot, render_snapshot,
           last_command_id, last_command_type, last_command_issued_at, last_command_source,
           last_event_id, last_event_type, created_at, updated_at
        FROM orchestrator_snapshot
        WHERE entity_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      entityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is OrchestratorSnapshotRecord => Boolean(row))
  }
}

export function createOrchestratorSnapshotRepository(db: BackendDatabase) {
  return new OrchestratorSnapshotRepository(db)
}
