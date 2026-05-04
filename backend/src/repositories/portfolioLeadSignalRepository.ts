import type { BackendDatabase } from '../db/index.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type PortfolioLeadSignalUrgency = 'low' | 'medium' | 'high' | 'critical'

export type PortfolioLeadSignalRecord = {
  signalId: string
  entityId: string
  market: string
  source: string
  intent: string
  urgency: PortfolioLeadSignalUrgency
  estimatedValue: number
  confidence: number
  recommendedAction: string
  payload: Record<string, unknown>
  detectedAt: string
  createdAt: string
  updatedAt: string
}

export type SavePortfolioLeadSignalInput = Omit<PortfolioLeadSignalRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function mapRow(row?: {
  signal_id: string
  entity_id: string
  market: string
  source: string
  intent: string
  urgency: string
  estimated_value: number
  confidence: number
  recommended_action: string
  payload_json: string
  detected_at: string
  created_at: string
  updated_at: string
}): PortfolioLeadSignalRecord | null {
  if (!row) {
    return null
  }

  return {
    signalId: row.signal_id,
    entityId: row.entity_id,
    market: row.market,
    source: row.source,
    intent: row.intent,
    urgency: row.urgency as PortfolioLeadSignalUrgency,
    estimatedValue: clamp(row.estimated_value),
    confidence: clamp(row.confidence),
    recommendedAction: row.recommended_action,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    detectedAt: row.detected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PortfolioLeadSignalRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getById(signalId: string): Promise<PortfolioLeadSignalRecord | null> {
    const row = await this.db.get<{
      signal_id: string
      entity_id: string
      market: string
      source: string
      intent: string
      urgency: string
      estimated_value: number
      confidence: number
      recommended_action: string
      payload_json: string
      detected_at: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_portfolio_lead_signal
        WHERE signal_id = ?
        LIMIT 1
      `,
      signalId,
    )

    return mapRow(row)
  }

  async save(input: SavePortfolioLeadSignalInput): Promise<{ record: PortfolioLeadSignalRecord; created: boolean }> {
    traceMutation({
      source: 'backend/src/repositories/portfolioLeadSignalRepository.ts#save',
      type: 'portfolio',
      targetId: input.signalId,
      whatChanged: 'persist portfolio lead signal',
    })
    const existing = await this.getById(input.signalId)
    const createdAt = existing?.createdAt ?? input.createdAt ?? input.detectedAt
    const updatedAt = input.updatedAt ?? input.detectedAt

    await this.db.run(
      `
        INSERT INTO entity_portfolio_lead_signal (
          signal_id,
          entity_id,
          market,
          source,
          intent,
          urgency,
          estimated_value,
          confidence,
          recommended_action,
          payload_json,
          detected_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(signal_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          market = excluded.market,
          source = excluded.source,
          intent = excluded.intent,
          urgency = excluded.urgency,
          estimated_value = excluded.estimated_value,
          confidence = excluded.confidence,
          recommended_action = excluded.recommended_action,
          payload_json = excluded.payload_json,
          detected_at = excluded.detected_at,
          updated_at = excluded.updated_at
      `,
      input.signalId,
      input.entityId,
      input.market,
      input.source,
      input.intent,
      input.urgency,
      clamp(input.estimatedValue),
      clamp(input.confidence),
      input.recommendedAction,
      JSON.stringify(input.payload),
      input.detectedAt,
      createdAt,
      updatedAt,
    )

    const record = await this.getById(input.signalId)
    if (!record) {
      throw new Error(`Failed to save lead signal ${input.signalId}.`)
    }

    return {
      record,
      created: !existing,
    }
  }

  async list(limit = 200): Promise<PortfolioLeadSignalRecord[]> {
    const rows = await this.db.all<Array<{
      signal_id: string
      entity_id: string
      market: string
      source: string
      intent: string
      urgency: string
      estimated_value: number
      confidence: number
      recommended_action: string
      payload_json: string
      detected_at: string
      created_at: string
      updated_at: string
    }>>(
      `
        SELECT *
        FROM entity_portfolio_lead_signal
        ORDER BY detected_at DESC, signal_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is PortfolioLeadSignalRecord => row !== null)
  }
}

export function createPortfolioLeadSignalRepository(db: BackendDatabase) {
  return new PortfolioLeadSignalRepository(db)
}
