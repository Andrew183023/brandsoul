import type { BackendDatabase } from '../db/index.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type FlowMindApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type FlowMindApprovalRecord = {
  approvalId: string
  entityId: string
  proposalId: string
  actionType: string
  status: FlowMindApprovalStatus
  rationale: string
  payload: Record<string, unknown>
  proposalHash?: string
  payloadHash?: string
  riskLevel?: string
  requestedAt: string
  expiresAt?: string
  resolvedAt?: string
  resolvedBy?: string
  createdAt: string
  updatedAt: string
}

export type EnqueueApprovalInput = {
  approvalId: string
  entityId: string
  proposalId: string
  actionType: string
  rationale: string
  payload: Record<string, unknown>
  proposalHash?: string
  payloadHash?: string
  riskLevel?: string
  requestedAt: string
  expiresAt?: string
}

export type ResolveApprovalInput = {
  approvalId: string
  status: Extract<FlowMindApprovalStatus, 'approved' | 'rejected' | 'expired'>
  resolvedAt: string
  resolvedBy?: string
}

export type ListApprovalsFilters = {
  status?: FlowMindApprovalStatus
  entityId?: string
  actionType?: string
  limit?: number
}

export type ResolveApprovalResult = {
  record: FlowMindApprovalRecord | null
  changed: boolean
  blockedReason?: 'not_found' | 'terminal_state_locked'
}

function parseJsonRecord<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapRow(row?: {
  approval_id: string
  entity_id: string
  proposal_id: string
  action_type: string
  status: string
  rationale: string
  payload_json: string
  proposal_hash: string | null
  payload_hash: string | null
  risk_level: string | null
  requested_at: string
  expires_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}): FlowMindApprovalRecord | null {
  if (!row) {
    return null
  }

  return {
    approvalId: row.approval_id,
    entityId: row.entity_id,
    proposalId: row.proposal_id,
    actionType: row.action_type,
    status: row.status as FlowMindApprovalStatus,
    rationale: row.rationale,
    payload: parseJsonRecord(row.payload_json, {}),
    proposalHash: row.proposal_hash ?? undefined,
    payloadHash: row.payload_hash ?? undefined,
    riskLevel: row.risk_level ?? undefined,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class FlowMindApprovalQueue {
  constructor(private readonly db: BackendDatabase) {}

  async enqueue(input: EnqueueApprovalInput): Promise<FlowMindApprovalRecord> {
    traceMutation({
      source: 'backend/src/orchestrator/approvalQueue.ts#enqueue',
      type: 'approval',
      targetId: input.approvalId,
      whatChanged: 'create or refresh approval queue record',
    })
    const existing = await this.getById(input.approvalId)
    if (existing && existing.status !== 'pending') {
      return existing
    }

    const createdAt = input.requestedAt
    const updatedAt = input.requestedAt

    await this.db.run(
      `
        INSERT INTO entity_orchestrator_approval_queue (
          approval_id,
          entity_id,
          proposal_id,
          action_type,
          status,
          rationale,
          payload_json,
          proposal_hash,
          payload_hash,
          risk_level,
          requested_at,
          expires_at,
          resolved_at,
          resolved_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        ON CONFLICT(approval_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          proposal_id = excluded.proposal_id,
          action_type = excluded.action_type,
          rationale = excluded.rationale,
          payload_json = excluded.payload_json,
          proposal_hash = excluded.proposal_hash,
          payload_hash = excluded.payload_hash,
          risk_level = excluded.risk_level,
          requested_at = excluded.requested_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `,
      input.approvalId,
      input.entityId,
      input.proposalId,
      input.actionType,
      input.rationale,
      JSON.stringify(input.payload),
      input.proposalHash ?? null,
      input.payloadHash ?? null,
      input.riskLevel ?? null,
        input.requestedAt,
        input.expiresAt ?? null,
        createdAt,
        updatedAt,
    )

    const record = await this.getById(input.approvalId)
    if (!record) {
      throw new Error(`Failed to enqueue approval ${input.approvalId}.`)
    }

    return record
  }

  async getById(approvalId: string): Promise<FlowMindApprovalRecord | null> {
    const row = await this.db.get<{
      approval_id: string
      entity_id: string
      proposal_id: string
      action_type: string
      status: string
      rationale: string
      payload_json: string
      proposal_hash: string | null
      payload_hash: string | null
      risk_level: string | null
      requested_at: string
      expires_at: string | null
      resolved_at: string | null
      resolved_by: string | null
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_orchestrator_approval_queue
        WHERE approval_id = ?
        LIMIT 1
      `,
      approvalId,
    )

    return mapRow(row)
  }

  async getByProposal(entityId: string, proposalId: string, actionType: string): Promise<FlowMindApprovalRecord | null> {
    const row = await this.db.get<{
      approval_id: string
      entity_id: string
      proposal_id: string
      action_type: string
      status: string
      rationale: string
      payload_json: string
      proposal_hash: string | null
      payload_hash: string | null
      risk_level: string | null
      requested_at: string
      expires_at: string | null
      resolved_at: string | null
      resolved_by: string | null
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_orchestrator_approval_queue
        WHERE entity_id = ?
          AND proposal_id = ?
          AND action_type = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      entityId,
      proposalId,
      actionType,
    )

    return mapRow(row)
  }

  async list(filters: ListApprovalsFilters = {}): Promise<FlowMindApprovalRecord[]> {
    const clauses: string[] = []
    const params: Array<string | number> = []

    if (filters.status) {
      clauses.push('status = ?')
      params.push(filters.status)
    }

    if (filters.entityId) {
      clauses.push('entity_id = ?')
      params.push(filters.entityId)
    }

    if (filters.actionType) {
      clauses.push('action_type = ?')
      params.push(filters.actionType)
    }

    const whereClause = clauses.length > 0
      ? `WHERE ${clauses.join(' AND ')}`
      : ''
    const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(filters.limit ?? 100, 200)) : 100

    const rows = await this.db.all<Array<{
      approval_id: string
      entity_id: string
      proposal_id: string
      action_type: string
      status: string
      rationale: string
      payload_json: string
      proposal_hash: string | null
      payload_hash: string | null
      risk_level: string | null
      requested_at: string
      expires_at: string | null
      resolved_at: string | null
      resolved_by: string | null
      created_at: string
      updated_at: string
    }>>(
      `
        SELECT *
        FROM entity_orchestrator_approval_queue
        ${whereClause}
        ORDER BY created_at DESC, approval_id DESC
        LIMIT ?
      `,
      ...params,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is FlowMindApprovalRecord => row !== null)
  }

  async resolve(input: ResolveApprovalInput): Promise<ResolveApprovalResult> {
    traceMutation({
      source: 'backend/src/orchestrator/approvalQueue.ts#resolve',
      type: 'approval',
      targetId: input.approvalId,
      whatChanged: `resolve approval to ${input.status}`,
    })
    const existing = await this.getById(input.approvalId)
    if (!existing) {
      return {
        record: null,
        changed: false,
        blockedReason: 'not_found',
      }
    }

    if (existing.status === input.status) {
      return {
        record: existing,
        changed: false,
      }
    }

    if (existing.status === 'rejected' || existing.status === 'expired' || existing.status === 'approved') {
      return {
        record: existing,
        changed: false,
        blockedReason: 'terminal_state_locked',
      }
    }

    await this.db.run(
      `
        UPDATE entity_orchestrator_approval_queue
        SET status = ?,
            resolved_at = ?,
            resolved_by = ?,
            updated_at = ?
        WHERE approval_id = ?
      `,
      input.status,
      input.resolvedAt,
      input.resolvedBy ?? null,
      input.resolvedAt,
      input.approvalId,
    )

    return {
      record: await this.getById(input.approvalId),
      changed: true,
    }
  }

  async expirePending(now: string): Promise<number> {
    traceMutation({
      source: 'backend/src/orchestrator/approvalQueue.ts#expirePending',
      type: 'approval',
      targetId: 'batch',
      whatChanged: 'expire pending approvals',
    })
    const result = await this.db.run(
      `
        UPDATE entity_orchestrator_approval_queue
        SET status = 'expired',
            resolved_at = ?,
            updated_at = ?
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
      `,
      now,
      now,
      now,
    )

    return result.changes ?? 0
  }
}

export function createFlowMindApprovalQueue(db: BackendDatabase) {
  return new FlowMindApprovalQueue(db)
}
