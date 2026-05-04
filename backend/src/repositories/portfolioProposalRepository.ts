import type { BackendDatabase } from '../db/index.js'
import type { MultiEntityRiskLevel } from '../orchestrator/multiEntityRegistry.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type PortfolioProposalStatus =
  | 'proposed'
  | 'acknowledged'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'evaluated'

export type PortfolioProposalRecord = {
  proposalId: string
  entityId: string
  market: string
  proposalType: string
  status: PortfolioProposalStatus
  riskLevel: MultiEntityRiskLevel
  priorityScore: number
  rationale: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SavePortfolioProposalInput = Omit<PortfolioProposalRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

export type UpdatePortfolioProposalInput = {
  proposalId: string
  status?: PortfolioProposalStatus
  rationale?: string
  payload?: Record<string, unknown>
  updatedAt?: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function mapRow(row?: {
  proposal_id: string
  entity_id: string
  market: string
  proposal_type: string
  status: string
  risk_level: string
  priority_score: number
  rationale: string
  payload_json: string
  created_at: string
  updated_at: string
}): PortfolioProposalRecord | null {
  if (!row) {
    return null
  }

  return {
    proposalId: row.proposal_id,
    entityId: row.entity_id,
    market: row.market,
    proposalType: row.proposal_type,
    status: row.status as PortfolioProposalStatus,
    riskLevel: row.risk_level as MultiEntityRiskLevel,
    priorityScore: clamp(row.priority_score),
    rationale: row.rationale,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PortfolioProposalRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getById(proposalId: string): Promise<PortfolioProposalRecord | null> {
    const row = await this.db.get<{
      proposal_id: string
      entity_id: string
      market: string
      proposal_type: string
      status: string
      risk_level: string
      priority_score: number
      rationale: string
      payload_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_proposal
        WHERE proposal_id = ?
        LIMIT 1
      `,
      proposalId,
    )

    return mapRow(row)
  }

  async save(input: SavePortfolioProposalInput): Promise<PortfolioProposalRecord> {
    traceMutation({
      source: 'backend/src/repositories/portfolioProposalRepository.ts#save',
      type: 'proposal',
      targetId: input.proposalId,
      whatChanged: 'upsert portfolio proposal',
    })
    const existing = await this.getById(input.proposalId)
    const createdAt = existing?.createdAt ?? input.createdAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? createdAt

    await this.db.run(
      `
        INSERT INTO entity_portfolio_proposal (
          proposal_id,
          entity_id,
          market,
          proposal_type,
          status,
          risk_level,
          priority_score,
          rationale,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          market = excluded.market,
          proposal_type = excluded.proposal_type,
          status = excluded.status,
          risk_level = excluded.risk_level,
          priority_score = excluded.priority_score,
          rationale = excluded.rationale,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
      `,
      input.proposalId,
      input.entityId,
      input.market,
      input.proposalType,
      input.status,
      input.riskLevel,
      clamp(input.priorityScore),
      input.rationale,
      JSON.stringify(input.payload),
      createdAt,
      updatedAt,
    )

    const record = await this.getById(input.proposalId)
    if (!record) {
      throw new Error(`Failed to save portfolio proposal ${input.proposalId}.`)
    }

    return record
  }

  async update(input: UpdatePortfolioProposalInput): Promise<PortfolioProposalRecord | null> {
    traceMutation({
      source: 'backend/src/repositories/portfolioProposalRepository.ts#update',
      type: 'proposal',
      targetId: input.proposalId,
      whatChanged: 'update portfolio proposal state',
    })
    const existing = await this.getById(input.proposalId)
    if (!existing) {
      return null
    }

    return this.save({
      ...existing,
      status: input.status ?? existing.status,
      rationale: input.rationale ?? existing.rationale,
      payload: input.payload ?? existing.payload,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    })
  }

  async list(limit = 200): Promise<PortfolioProposalRecord[]> {
    const rows = await this.db.all<Array<{
      proposal_id: string
      entity_id: string
      market: string
      proposal_type: string
      status: string
      risk_level: string
      priority_score: number
      rationale: string
      payload_json: string
      created_at: string
      updated_at: string
    }>>(
      `
        SELECT *
        FROM entity_portfolio_proposal
        ORDER BY created_at DESC, proposal_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is PortfolioProposalRecord => row !== null)
  }
}

export function createPortfolioProposalRepository(db: BackendDatabase) {
  return new PortfolioProposalRepository(db)
}
