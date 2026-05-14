import type { BackendDatabase } from '../../db/index.js'
import type { LeadProbability } from '../../market-signals/relevance/leadProbability.js'
import type { MarketCategory } from '../../market-signals/relevance/marketDomainClassifier.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import type { OpportunityAggregate, UpsertOpportunityAggregateInput } from './OpportunityAggregate.js'

type OpportunityRow = {
  id: string
  market_signal_id: string
  keyword: string
  category: string
  economic_relevance: number
  lead_probability: string
  opportunity_score: number
  detected_at: string
  top_entity_id: string | null
  top_entity_name: string | null
  confidence: number | null
  suggested_action: string | null
  created_at: string
  updated_at: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function mapRow(row?: OpportunityRow): OpportunityAggregate | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    marketSignalId: row.market_signal_id,
    keyword: row.keyword,
    category: row.category as MarketCategory,
    economicRelevance: clamp(row.economic_relevance, 0, 100),
    leadProbability: row.lead_probability as LeadProbability,
    opportunityScore: Math.max(0, row.opportunity_score),
    detectedAt: row.detected_at,
    topEntityId: row.top_entity_id,
    topEntityName: row.top_entity_name,
    confidence: typeof row.confidence === 'number' ? clamp(row.confidence, 0, 1) : null,
    suggestedAction: row.suggested_action,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class OpportunityRepository {
  constructor(private readonly db: BackendDatabase) {}

  async upsertOpportunity(input: UpsertOpportunityAggregateInput): Promise<OpportunityAggregate> {
    traceMutation({
      source: 'backend/src/persistence/opportunities/opportunityRepository.ts#upsertOpportunity',
      type: 'portfolio',
      targetId: input.id,
      whatChanged: 'upsert flowmind opportunity aggregate',
    })

    const existing = await this.getOpportunityById(input.id)
    const createdAt = existing?.createdAt ?? input.createdAt ?? input.detectedAt
    const updatedAt = input.updatedAt ?? new Date().toISOString()

    await this.db.run(
      `
        INSERT INTO flowmind_opportunities (
          id,
          market_signal_id,
          keyword,
          category,
          economic_relevance,
          lead_probability,
          opportunity_score,
          detected_at,
          top_entity_id,
          top_entity_name,
          confidence,
          suggested_action,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          market_signal_id = excluded.market_signal_id,
          keyword = excluded.keyword,
          category = excluded.category,
          economic_relevance = excluded.economic_relevance,
          lead_probability = excluded.lead_probability,
          opportunity_score = excluded.opportunity_score,
          detected_at = excluded.detected_at,
          top_entity_id = excluded.top_entity_id,
          top_entity_name = excluded.top_entity_name,
          confidence = excluded.confidence,
          suggested_action = excluded.suggested_action,
          updated_at = excluded.updated_at
      `,
      input.id,
      input.marketSignalId,
      input.keyword,
      input.category,
      clamp(input.economicRelevance, 0, 100),
      input.leadProbability,
      Math.max(0, input.opportunityScore),
      input.detectedAt,
      input.topEntityId,
      input.topEntityName,
      typeof input.confidence === 'number' ? clamp(input.confidence, 0, 1) : null,
      input.suggestedAction,
      createdAt,
      updatedAt,
    )

    const record = await this.getOpportunityById(input.id)
    if (!record) {
      throw new Error(`Failed to upsert opportunity aggregate ${input.id}.`)
    }

    return record
  }

  async getOpportunityById(id: string): Promise<OpportunityAggregate | null> {
    const row = await this.db.get<OpportunityRow>(
      `
        SELECT *
        FROM flowmind_opportunities
        WHERE id = ?
        LIMIT 1
      `,
      id,
    )

    return mapRow(row)
  }

  async listRecentOpportunities(limit = 100): Promise<OpportunityAggregate[]> {
    const rows = await this.db.all<OpportunityRow[]>(
      `
        SELECT *
        FROM flowmind_opportunities
        ORDER BY detected_at DESC, id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is OpportunityAggregate => row !== null)
  }

  async listTopOpportunities(limit = 50): Promise<OpportunityAggregate[]> {
    const rows = await this.db.all<OpportunityRow[]>(
      `
        SELECT *
        FROM flowmind_opportunities
        ORDER BY opportunity_score DESC, economic_relevance DESC, detected_at DESC, id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is OpportunityAggregate => row !== null)
  }
}

export function createOpportunityRepository(db: BackendDatabase) {
  return new OpportunityRepository(db)
}
