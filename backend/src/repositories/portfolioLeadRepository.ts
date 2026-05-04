import type { BackendDatabase } from '../db/index.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type PortfolioLeadRoutingStatus = 'stored' | 'intake_requested' | 'outreach_requested'
export type PortfolioLeadStatus = 'routed' | 'qualified' | 'contacted' | 'converted' | 'lost'

export type PortfolioLeadRecord = {
  leadId: string
  entityId: string
  signalId: string
  source: string
  timestamp: string
  routingStatus: PortfolioLeadRoutingStatus
  status: PortfolioLeadStatus
  qualifiedAt: string | null
  contactedAt: string | null
  convertedAt: string | null
  lostAt: string | null
  revenueAmount: number | null
  lostReason: string | null
  attributedCommandId: string
  attribution: Record<string, unknown>
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SavePortfolioLeadInput = Omit<PortfolioLeadRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function mapRow(row?: {
  lead_id: string
  entity_id: string
  signal_id: string
  source: string
  timestamp: string
  routing_status: string
  status?: string | null
  qualified_at?: string | null
  contacted_at?: string | null
  converted_at?: string | null
  lost_at?: string | null
  revenue_amount?: number | null
  lost_reason?: string | null
  attributed_command_id: string
  attribution_json: string
  payload_json: string
  created_at: string
  updated_at: string
}): PortfolioLeadRecord | null {
  if (!row) {
    return null
  }

  return {
    leadId: row.lead_id,
    entityId: row.entity_id,
    signalId: row.signal_id,
    source: row.source,
    timestamp: row.timestamp,
    routingStatus: row.routing_status as PortfolioLeadRoutingStatus,
    status: (row.status as PortfolioLeadStatus | null | undefined) ?? 'routed',
    qualifiedAt: row.qualified_at ?? null,
    contactedAt: row.contacted_at ?? null,
    convertedAt: row.converted_at ?? null,
    lostAt: row.lost_at ?? null,
    revenueAmount: row.revenue_amount ?? null,
    lostReason: row.lost_reason ?? null,
    attributedCommandId: row.attributed_command_id,
    attribution: JSON.parse(row.attribution_json) as Record<string, unknown>,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PortfolioLeadRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getById(leadId: string): Promise<PortfolioLeadRecord | null> {
    const row = await this.db.get<{
      lead_id: string
      entity_id: string
      signal_id: string
      source: string
      timestamp: string
      routing_status: string
      status?: string | null
      qualified_at?: string | null
      contacted_at?: string | null
      converted_at?: string | null
      lost_at?: string | null
      revenue_amount?: number | null
      lost_reason?: string | null
      attributed_command_id: string
      attribution_json: string
      payload_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_lead
        WHERE lead_id = ?
        LIMIT 1
      `,
      leadId,
    )

    return mapRow(row)
  }

  async getBySignalId(signalId: string): Promise<PortfolioLeadRecord | null> {
    const row = await this.db.get<{
      lead_id: string
      entity_id: string
      signal_id: string
      source: string
      timestamp: string
      routing_status: string
      status?: string | null
      qualified_at?: string | null
      contacted_at?: string | null
      converted_at?: string | null
      lost_at?: string | null
      revenue_amount?: number | null
      lost_reason?: string | null
      attributed_command_id: string
      attribution_json: string
      payload_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_lead
        WHERE signal_id = ?
        LIMIT 1
      `,
      signalId,
    )

    return mapRow(row)
  }

  async save(input: SavePortfolioLeadInput): Promise<{ record: PortfolioLeadRecord; created: boolean }> {
    traceMutation({
      source: 'backend/src/repositories/portfolioLeadRepository.ts#save',
      type: 'portfolio',
      targetId: input.leadId,
      whatChanged: 'persist routed portfolio lead',
    })
    const existing = await this.getById(input.leadId)
    const createdAt = existing?.createdAt ?? input.createdAt ?? input.timestamp
    const updatedAt = input.updatedAt ?? input.timestamp

    await this.db.run(
      `
        INSERT INTO entity_portfolio_lead (
          lead_id,
          entity_id,
          signal_id,
          source,
          timestamp,
          routing_status,
          status,
          qualified_at,
          contacted_at,
          converted_at,
          lost_at,
          revenue_amount,
          lost_reason,
          attributed_command_id,
          attribution_json,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lead_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          signal_id = excluded.signal_id,
          source = excluded.source,
          timestamp = excluded.timestamp,
          routing_status = excluded.routing_status,
          status = excluded.status,
          qualified_at = excluded.qualified_at,
          contacted_at = excluded.contacted_at,
          converted_at = excluded.converted_at,
          lost_at = excluded.lost_at,
          revenue_amount = excluded.revenue_amount,
          lost_reason = excluded.lost_reason,
          attributed_command_id = excluded.attributed_command_id,
          attribution_json = excluded.attribution_json,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
      `,
      input.leadId,
      input.entityId,
      input.signalId,
      input.source,
      input.timestamp,
      input.routingStatus,
      input.status,
      input.qualifiedAt ?? null,
      input.contactedAt ?? null,
      input.convertedAt ?? null,
      input.lostAt ?? null,
      input.revenueAmount ?? null,
      input.lostReason ?? null,
      input.attributedCommandId,
      JSON.stringify(input.attribution),
      JSON.stringify(input.payload),
      createdAt,
      updatedAt,
    )

    const record = await this.getById(input.leadId)
    if (!record) {
      throw new Error(`Failed to save routed lead ${input.leadId}.`)
    }

    return {
      record,
      created: !existing,
    }
  }

  async list(limit = 200): Promise<PortfolioLeadRecord[]> {
    const rows = await this.db.all<Array<{
      lead_id: string
      entity_id: string
      signal_id: string
      source: string
      timestamp: string
      routing_status: string
      status?: string | null
      qualified_at?: string | null
      contacted_at?: string | null
      converted_at?: string | null
      lost_at?: string | null
      revenue_amount?: number | null
      lost_reason?: string | null
      attributed_command_id: string
      attribution_json: string
      payload_json: string
      created_at: string
      updated_at: string
    }>>(
      `
        SELECT *
        FROM entity_portfolio_lead
        ORDER BY timestamp DESC, lead_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is PortfolioLeadRecord => row !== null)
  }
}

export function createPortfolioLeadRepository(db: BackendDatabase) {
  return new PortfolioLeadRepository(db)
}