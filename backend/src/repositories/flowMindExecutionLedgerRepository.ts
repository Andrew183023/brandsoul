import type { BackendDatabase } from '../db/index.js'

export type FlowMindExecutionLedgerStatus = 'pending' | 'committed' | 'rolled_back' | 'failed'

export type FlowMindExecutionLedgerRecord = {
  commandId: string
  entityId: string
  decisionHash: string
  status: FlowMindExecutionLedgerStatus
  committedAt?: string
  snapshotId?: string
  lastEventId?: string
  errorCode?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row?: {
  command_id: string
  entity_id: string
  decision_hash: string
  status: string
  committed_at: string | null
  snapshot_id: string | null
  last_event_id: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}): FlowMindExecutionLedgerRecord | null {
  if (!row) {
    return null
  }

  return {
    commandId: row.command_id,
    entityId: row.entity_id,
    decisionHash: row.decision_hash,
    status: row.status as FlowMindExecutionLedgerStatus,
    committedAt: row.committed_at ?? undefined,
    snapshotId: row.snapshot_id ?? undefined,
    lastEventId: row.last_event_id ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class FlowMindExecutionLedgerRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getByCommandId(commandId: string): Promise<FlowMindExecutionLedgerRecord | null> {
    const row = await this.db.get<{
      command_id: string
      entity_id: string
      decision_hash: string
      status: string
      committed_at: string | null
      snapshot_id: string | null
      last_event_id: string | null
      error_code: string | null
      error_message: string | null
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM flowmind_execution_ledger
        WHERE command_id = ?
        LIMIT 1
      `,
      commandId,
    )

    return mapRow(row)
  }

  async save(record: FlowMindExecutionLedgerRecord): Promise<FlowMindExecutionLedgerRecord> {
    await this.db.run(
      `
        INSERT INTO flowmind_execution_ledger (
          command_id,
          entity_id,
          decision_hash,
          status,
          committed_at,
          snapshot_id,
          last_event_id,
          error_code,
          error_message,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(command_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          decision_hash = excluded.decision_hash,
          status = excluded.status,
          committed_at = excluded.committed_at,
          snapshot_id = excluded.snapshot_id,
          last_event_id = excluded.last_event_id,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at
      `,
      record.commandId,
      record.entityId,
      record.decisionHash,
      record.status,
      record.committedAt ?? null,
      record.snapshotId ?? null,
      record.lastEventId ?? null,
      record.errorCode ?? null,
      record.errorMessage ?? null,
      record.createdAt,
      record.updatedAt,
    )

    return record
  }
}

export function createFlowMindExecutionLedgerRepository(db: BackendDatabase) {
  return new FlowMindExecutionLedgerRepository(db)
}
