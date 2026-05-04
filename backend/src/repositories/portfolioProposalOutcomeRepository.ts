import type { BackendDatabase } from '../db/index.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type PortfolioProposalOutcomeRecord = {
  proposalId: string
  leadsGenerated: number
  conversions: number
  revenue: number
  roiObserved: number
  success: boolean
  evaluatedAt: string
  createdAt: string
  updatedAt: string
}

export type SavePortfolioProposalOutcomeInput = Omit<PortfolioProposalOutcomeRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function mapRow(row?: {
  proposal_id: string
  leads_generated: number
  conversions: number
  revenue: number
  roi_observed: number
  success: number | boolean
  evaluated_at: string
  created_at: string
  updated_at: string
}): PortfolioProposalOutcomeRecord | null {
  if (!row) {
    return null
  }

  return {
    proposalId: row.proposal_id,
    leadsGenerated: Number(row.leads_generated ?? 0),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roiObserved: Number(row.roi_observed ?? 0),
    success: Boolean(row.success),
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PortfolioProposalOutcomeRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getByProposalId(proposalId: string): Promise<PortfolioProposalOutcomeRecord | null> {
    const row = await this.db.get<{
      proposal_id: string
      leads_generated: number
      conversions: number
      revenue: number
      roi_observed: number
      success: number | boolean
      evaluated_at: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_proposal_outcome
        WHERE proposal_id = ?
        LIMIT 1
      `,
      proposalId,
    )

    return mapRow(row)
  }

  async save(input: SavePortfolioProposalOutcomeInput): Promise<PortfolioProposalOutcomeRecord> {
    traceMutation({
      source: 'backend/src/repositories/portfolioProposalOutcomeRepository.ts#save',
      type: 'portfolio',
      targetId: input.proposalId,
      whatChanged: 'persist portfolio proposal outcome',
    })
    const existing = await this.getByProposalId(input.proposalId)
    const createdAt = existing?.createdAt ?? input.createdAt ?? input.evaluatedAt
    const updatedAt = input.updatedAt ?? input.evaluatedAt

    await this.db.run(
      `
        INSERT INTO entity_portfolio_proposal_outcome (
          proposal_id,
          leads_generated,
          conversions,
          revenue,
          roi_observed,
          success,
          evaluated_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
          leads_generated = excluded.leads_generated,
          conversions = excluded.conversions,
          revenue = excluded.revenue,
          roi_observed = excluded.roi_observed,
          success = excluded.success,
          evaluated_at = excluded.evaluated_at,
          updated_at = excluded.updated_at
      `,
      input.proposalId,
      input.leadsGenerated,
      input.conversions,
      input.revenue,
      input.roiObserved,
      input.success ? 1 : 0,
      input.evaluatedAt,
      createdAt,
      updatedAt,
    )

    const record = await this.getByProposalId(input.proposalId)
    if (!record) {
      throw new Error(`Failed to save outcome for proposal ${input.proposalId}.`)
    }

    return record
  }
}

export function createPortfolioProposalOutcomeRepository(db: BackendDatabase) {
  return new PortfolioProposalOutcomeRepository(db)
}
