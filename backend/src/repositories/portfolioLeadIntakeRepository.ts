import type { BackendDatabase } from '../db/index.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type PortfolioLeadIntakeRecord = {
  intakeId: string
  leadId: string
  entityId: string
  signalId: string
  source: string
  timestamp: string
  attributedCommandId: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SavePortfolioLeadIntakeInput = Omit<PortfolioLeadIntakeRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function mapRow(row?: {
  intake_id: string
  lead_id: string
  entity_id: string
  signal_id: string
  source: string
  timestamp: string
  attributed_command_id: string
  payload_json: string
  created_at: string
  updated_at: string
}): PortfolioLeadIntakeRecord | null {
  if (!row) {
    return null
  }

  return {
    intakeId: row.intake_id,
    leadId: row.lead_id,
    entityId: row.entity_id,
    signalId: row.signal_id,
    source: row.source,
    timestamp: row.timestamp,
    attributedCommandId: row.attributed_command_id,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PortfolioLeadIntakeRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getById(intakeId: string): Promise<PortfolioLeadIntakeRecord | null> {
    const row = await this.db.get<{
      intake_id: string
      lead_id: string
      entity_id: string
      signal_id: string
      source: string
      timestamp: string
      attributed_command_id: string
      payload_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_lead_intake
        WHERE intake_id = ?
        LIMIT 1
      `,
      intakeId,
    )

    return mapRow(row)
  }

  async getByLeadId(leadId: string): Promise<PortfolioLeadIntakeRecord | null> {
    const row = await this.db.get<{
      intake_id: string
      lead_id: string
      entity_id: string
      signal_id: string
      source: string
      timestamp: string
      attributed_command_id: string
      payload_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_lead_intake
        WHERE lead_id = ?
        LIMIT 1
      `,
      leadId,
    )

    return mapRow(row)
  }

  async save(input: SavePortfolioLeadIntakeInput): Promise<{ record: PortfolioLeadIntakeRecord; created: boolean }> {
    traceMutation({
      source: 'backend/src/repositories/portfolioLeadIntakeRepository.ts#save',
      type: 'portfolio',
      targetId: input.intakeId,
      whatChanged: 'persist portfolio lead intake object',
    })

    const existing = await this.getById(input.intakeId)
    const createdAt = existing?.createdAt ?? input.createdAt ?? input.timestamp
    const updatedAt = input.updatedAt ?? input.timestamp

    await this.db.run(
      `
        INSERT INTO entity_portfolio_lead_intake (
          intake_id,
          lead_id,
          entity_id,
          signal_id,
          source,
          timestamp,
          attributed_command_id,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(intake_id) DO UPDATE SET
          lead_id = excluded.lead_id,
          entity_id = excluded.entity_id,
          signal_id = excluded.signal_id,
          source = excluded.source,
          timestamp = excluded.timestamp,
          attributed_command_id = excluded.attributed_command_id,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
      `,
      input.intakeId,
      input.leadId,
      input.entityId,
      input.signalId,
      input.source,
      input.timestamp,
      input.attributedCommandId,
      JSON.stringify(input.payload),
      createdAt,
      updatedAt,
    )

    const record = await this.getById(input.intakeId)
    if (!record) {
      throw new Error(`Failed to save portfolio lead intake ${input.intakeId}.`)
    }

    return {
      record,
      created: !existing,
    }
  }
}

export function createPortfolioLeadIntakeRepository(db: BackendDatabase) {
  return new PortfolioLeadIntakeRepository(db)
}