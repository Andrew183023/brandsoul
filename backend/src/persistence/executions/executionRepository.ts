import type { BackendDatabase } from '../../db/index.js'
import type { SovereignExecutionRecord } from '../../execution/contracts/SovereignExecutionRecord.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'

export type UpsertExecutionInput = SovereignExecutionRecord

type ExecutionRow = {
  execution_id: string
  proposal_id: string
  entity_id: string
  action_type: string
  execution_status: string
  generated_lead_id: string | null
  revenue_attributed: number | null
  started_at: string
  completed_at: string | null
  result_summary: string | null
}

function clampRevenue(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  return value
}

function mapRow(row?: ExecutionRow): SovereignExecutionRecord | null {
  if (!row) {
    return null
  }

  return {
    executionId: row.execution_id,
    proposalId: row.proposal_id,
    entityId: row.entity_id,
    actionType: row.action_type,
    executionStatus: row.execution_status as SovereignExecutionRecord['executionStatus'],
    generatedLeadId: row.generated_lead_id ?? undefined,
    revenueAttributed: row.revenue_attributed ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    resultSummary: row.result_summary ?? undefined,
  }
}

export class ExecutionRepository {
  constructor(private readonly db: BackendDatabase) {}

  async upsertExecution(input: UpsertExecutionInput): Promise<SovereignExecutionRecord> {
    traceMutation({
      source: 'backend/src/persistence/executions/executionRepository.ts#upsertExecution',
      type: 'portfolio',
      targetId: input.executionId,
      whatChanged: 'upsert sovereign execution aggregate',
    })

    const existing = await this.getExecutionById(input.executionId)

    await this.db.run(
      `
        INSERT INTO flowmind_sovereign_executions (
          execution_id,
          proposal_id,
          entity_id,
          action_type,
          execution_status,
          generated_lead_id,
          revenue_attributed,
          started_at,
          completed_at,
          result_summary
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(execution_id) DO UPDATE SET
          execution_status = excluded.execution_status,
          generated_lead_id = excluded.generated_lead_id,
          revenue_attributed = excluded.revenue_attributed,
          completed_at = excluded.completed_at,
          result_summary = excluded.result_summary
      `,
      input.executionId,
      existing?.proposalId ?? input.proposalId,
      existing?.entityId ?? input.entityId,
      existing?.actionType ?? input.actionType,
      input.executionStatus,
      input.generatedLeadId ?? null,
      clampRevenue(input.revenueAttributed),
      existing?.startedAt ?? input.startedAt,
      input.completedAt ?? null,
      input.resultSummary ?? null,
    )

    const record = await this.getExecutionById(input.executionId)
    if (!record) {
      throw new Error(`Failed to upsert sovereign execution ${input.executionId}.`)
    }

    return record
  }

  async getExecutionById(executionId: string): Promise<SovereignExecutionRecord | null> {
    const row = await this.db.get<ExecutionRow>(
      `
        SELECT *
        FROM flowmind_sovereign_executions
        WHERE execution_id = ?
        LIMIT 1
      `,
      executionId,
    )

    return mapRow(row)
  }

  async listExecutions(limit = 200): Promise<SovereignExecutionRecord[]> {
    const rows = await this.db.all<ExecutionRow[]>(
      `
        SELECT *
        FROM flowmind_sovereign_executions
        ORDER BY started_at DESC, execution_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is SovereignExecutionRecord => row !== null)
  }

  async listSuccessfulExecutions(limit = 200): Promise<SovereignExecutionRecord[]> {
    const rows = await this.db.all<ExecutionRow[]>(
      `
        SELECT *
        FROM flowmind_sovereign_executions
        WHERE execution_status = 'completed'
        ORDER BY completed_at DESC, execution_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is SovereignExecutionRecord => row !== null)
  }
}

export function createExecutionRepository(db: BackendDatabase) {
  return new ExecutionRepository(db)
}
