import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'

export type OpportunityProposalGovernanceStatus = 'pending' | 'approved' | 'rejected'

export type OpportunityProposalAggregate = {
  proposalId: string
  sourceOpportunityId: string
  entityId: string
  entityName: string
  actionType: string
  confidence: number
  reasoning: string
  governanceStatus: OpportunityProposalGovernanceStatus
  createdAt: string
  approvedAt: string | null
  rejectedAt: string | null
  updatedAt: string
}

export type UpsertOpportunityProposalInput = Omit<OpportunityProposalAggregate, 'approvedAt' | 'rejectedAt' | 'updatedAt'> & {
  approvedAt?: string | null
  rejectedAt?: string | null
  updatedAt?: string
}

export type UpdateProposalGovernanceStatusInput = {
  proposalId: string
  governanceStatus: Extract<OpportunityProposalGovernanceStatus, 'approved' | 'rejected'>
  changedAt: string
}

export type UpdateProposalGovernanceStatusResult = {
  record: OpportunityProposalAggregate | null
  changed: boolean
  blockedReason?: 'not_found' | 'terminal_state_locked'
}

type ProposalRow = {
  proposal_id: string
  source_opportunity_id: string
  entity_id: string
  entity_name: string
  action_type: string
  confidence: number
  reasoning: string
  governance_status: string
  created_at: string
  approved_at: string | null
  rejected_at: string | null
  updated_at: string
}

function clampConfidence(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

function mapRow(row?: ProposalRow): OpportunityProposalAggregate | null {
  if (!row) {
    return null
  }

  return {
    proposalId: row.proposal_id,
    sourceOpportunityId: row.source_opportunity_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    actionType: row.action_type,
    confidence: clampConfidence(row.confidence),
    reasoning: row.reasoning,
    governanceStatus: row.governance_status as OpportunityProposalGovernanceStatus,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    updatedAt: row.updated_at,
  }
}

export class ProposalRepository {
  constructor(private readonly db: BackendDatabase) {}

  async upsertProposal(input: UpsertOpportunityProposalInput): Promise<OpportunityProposalAggregate> {
    traceMutation({
      source: 'backend/src/persistence/opportunities/proposalRepository.ts#upsertProposal',
      type: 'proposal',
      targetId: input.proposalId,
      whatChanged: 'upsert flowmind opportunity proposal aggregate',
    })

    const existing = await this.getProposalById(input.proposalId)
    const createdAt = existing?.createdAt ?? input.createdAt
    const updatedAt = input.updatedAt ?? new Date().toISOString()

    await this.db.run(
      `
        INSERT INTO flowmind_opportunity_proposals (
          proposal_id,
          source_opportunity_id,
          entity_id,
          entity_name,
          action_type,
          confidence,
          reasoning,
          governance_status,
          created_at,
          approved_at,
          rejected_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
          confidence = excluded.confidence,
          reasoning = excluded.reasoning,
          updated_at = excluded.updated_at
      `,
      input.proposalId,
      existing?.sourceOpportunityId ?? input.sourceOpportunityId,
      existing?.entityId ?? input.entityId,
      existing?.entityName ?? input.entityName,
      existing?.actionType ?? input.actionType,
      clampConfidence(input.confidence),
      input.reasoning,
      existing?.governanceStatus ?? input.governanceStatus,
      createdAt,
      existing?.approvedAt ?? input.approvedAt ?? null,
      existing?.rejectedAt ?? input.rejectedAt ?? null,
      updatedAt,
    )

    const record = await this.getProposalById(input.proposalId)
    if (!record) {
      throw new Error(`Failed to upsert opportunity proposal ${input.proposalId}.`)
    }

    return record
  }

  async updateGovernanceStatus(
    input: UpdateProposalGovernanceStatusInput,
  ): Promise<UpdateProposalGovernanceStatusResult> {
    traceMutation({
      source: 'backend/src/persistence/opportunities/proposalRepository.ts#updateGovernanceStatus',
      type: 'proposal',
      targetId: input.proposalId,
      whatChanged: `set opportunity proposal governance status to ${input.governanceStatus}`,
    })

    const existing = await this.getProposalById(input.proposalId)
    if (!existing) {
      return {
        record: null,
        changed: false,
        blockedReason: 'not_found',
      }
    }

    if (existing.governanceStatus !== 'pending') {
      return {
        record: existing,
        changed: false,
        blockedReason: existing.governanceStatus === input.governanceStatus ? undefined : 'terminal_state_locked',
      }
    }

    await this.db.run(
      `
        UPDATE flowmind_opportunity_proposals
        SET governance_status = ?,
            approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
            rejected_at = CASE WHEN ? = 'rejected' THEN COALESCE(rejected_at, ?) ELSE rejected_at END,
            updated_at = ?
        WHERE proposal_id = ?
      `,
      input.governanceStatus,
      input.governanceStatus,
      input.changedAt,
      input.governanceStatus,
      input.changedAt,
      input.changedAt,
      input.proposalId,
    )

    return {
      record: await this.getProposalById(input.proposalId),
      changed: true,
    }
  }

  async getProposalById(proposalId: string): Promise<OpportunityProposalAggregate | null> {
    const row = await this.db.get<ProposalRow>(
      `
        SELECT *
        FROM flowmind_opportunity_proposals
        WHERE proposal_id = ?
        LIMIT 1
      `,
      proposalId,
    )

    return mapRow(row)
  }

  async listPendingProposals(limit = 200): Promise<OpportunityProposalAggregate[]> {
    const rows = await this.db.all<ProposalRow[]>(
      `
        SELECT *
        FROM flowmind_opportunity_proposals
        WHERE governance_status = 'pending'
        ORDER BY created_at DESC, proposal_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is OpportunityProposalAggregate => row !== null)
  }

  async listApprovedProposals(limit = 200): Promise<OpportunityProposalAggregate[]> {
    const rows = await this.db.all<ProposalRow[]>(
      `
        SELECT *
        FROM flowmind_opportunity_proposals
        WHERE governance_status = 'approved'
        ORDER BY approved_at DESC, proposal_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is OpportunityProposalAggregate => row !== null)
  }
}

export function createProposalRepository(db: BackendDatabase) {
  return new ProposalRepository(db)
}
