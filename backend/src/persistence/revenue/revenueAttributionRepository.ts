import type { BackendDatabase } from '../../db/index.js'
import {
  buildRevenueAttributionId,
  type RevenueAttributionRecord,
} from '../../execution/revenue/revenueAttributionEngine.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'

export type RevenueAttributionAggregate = {
  attributionId: string
  marketSignalId: string
  opportunityId: string
  proposalId: string
  executionId: string
  leadId: string
  revenueEventId: string | null
  attributedRevenue: number
  createdAt: string
}

export type PersistRevenueAttributionInput = Omit<RevenueAttributionAggregate, 'attributionId'> & {
  attributionId?: string
}

export type RevenueSignalAttributionSummary = {
  marketSignalId: string
  attributedRevenue: number
  attributionCount: number
  latestCreatedAt: string
}

type RevenueAttributionRow = {
  attribution_id: string
  market_signal_id: string
  opportunity_id: string
  proposal_id: string
  execution_id: string
  lead_id: string
  revenue_event_id: string | null
  attributed_revenue: number
  created_at: string
}

function normalizeRevenue(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Revenue attribution aggregate requires a finite non-negative revenue amount.')
  }

  return Number(value.toString())
}

function mapRow(row?: RevenueAttributionRow): RevenueAttributionAggregate | null {
  if (!row) {
    return null
  }

  return {
    attributionId: row.attribution_id,
    marketSignalId: row.market_signal_id,
    opportunityId: row.opportunity_id,
    proposalId: row.proposal_id,
    executionId: row.execution_id,
    leadId: row.lead_id,
    revenueEventId: row.revenue_event_id,
    attributedRevenue: normalizeRevenue(row.attributed_revenue),
    createdAt: row.created_at,
  }
}

export function toRevenueAttributionAggregate(
  record: RevenueAttributionRecord,
): RevenueAttributionAggregate {
  return {
    attributionId: record.attributionId,
    marketSignalId: record.marketSignalId,
    opportunityId: record.opportunityId,
    proposalId: record.proposalId,
    executionId: record.executionId,
    leadId: record.generatedLeadId,
    revenueEventId: record.revenueEventId ?? null,
    attributedRevenue: normalizeRevenue(record.revenue),
    createdAt: record.attributedAt,
  }
}

export class RevenueAttributionRepository {
  constructor(private readonly db: BackendDatabase) {}

  async persistAttribution(input: PersistRevenueAttributionInput): Promise<RevenueAttributionAggregate> {
    const attributionId = input.attributionId ?? buildRevenueAttributionId({
      marketSignalId: input.marketSignalId,
      opportunityId: input.opportunityId,
      proposalId: input.proposalId,
      executionId: input.executionId,
      generatedLeadId: input.leadId,
      revenue: input.attributedRevenue,
      revenueEventId: input.revenueEventId ?? undefined,
      recognizedAt: input.createdAt,
    })

    traceMutation({
      source: 'backend/src/persistence/revenue/revenueAttributionRepository.ts#persistAttribution',
      type: 'portfolio',
      targetId: attributionId,
      whatChanged: 'persist immutable revenue attribution graph record',
    })

    await this.db.run(
      `
        INSERT INTO flowmind_revenue_attribution (
          attribution_id,
          market_signal_id,
          opportunity_id,
          proposal_id,
          execution_id,
          lead_id,
          revenue_event_id,
          attributed_revenue,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(attribution_id) DO NOTHING
      `,
      attributionId,
      input.marketSignalId,
      input.opportunityId,
      input.proposalId,
      input.executionId,
      input.leadId,
      input.revenueEventId,
      normalizeRevenue(input.attributedRevenue),
      input.createdAt,
    )

    const record = await this.getAttributionById(attributionId)
    if (!record) {
      throw new Error(`Failed to persist revenue attribution ${attributionId}.`)
    }

    return record
  }

  async getAttributionById(attributionId: string): Promise<RevenueAttributionAggregate | null> {
    const row = await this.db.get<RevenueAttributionRow>(
      `
        SELECT *
        FROM flowmind_revenue_attribution
        WHERE attribution_id = ?
        LIMIT 1
      `,
      attributionId,
    )

    return mapRow(row)
  }

  async listAttributionByLead(leadId: string, limit = 100): Promise<RevenueAttributionAggregate[]> {
    const rows = await this.db.all<RevenueAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_revenue_attribution
        WHERE lead_id = ?
        ORDER BY created_at DESC, attribution_id DESC
        LIMIT ?
      `,
      leadId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is RevenueAttributionAggregate => row !== null)
  }

  async listAttributionByOpportunity(opportunityId: string, limit = 100): Promise<RevenueAttributionAggregate[]> {
    const rows = await this.db.all<RevenueAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_revenue_attribution
        WHERE opportunity_id = ?
        ORDER BY created_at DESC, attribution_id DESC
        LIMIT ?
      `,
      opportunityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is RevenueAttributionAggregate => row !== null)
  }

  async listTopRevenueSignals(limit = 50): Promise<RevenueSignalAttributionSummary[]> {
    const rows = await this.db.all<Array<{
      market_signal_id: string
      attributed_revenue: number
      attribution_count: number
      latest_created_at: string
    }>>(
      `
        SELECT
          market_signal_id,
          SUM(attributed_revenue) AS attributed_revenue,
          COUNT(*) AS attribution_count,
          MAX(created_at) AS latest_created_at
        FROM flowmind_revenue_attribution
        GROUP BY market_signal_id
        ORDER BY attributed_revenue DESC, attribution_count DESC, latest_created_at DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => ({
      marketSignalId: row.market_signal_id,
      attributedRevenue: normalizeRevenue(row.attributed_revenue),
      attributionCount: Number(row.attribution_count),
      latestCreatedAt: row.latest_created_at,
    }))
  }
}

export function createRevenueAttributionRepository(db: BackendDatabase) {
  return new RevenueAttributionRepository(db)
}
