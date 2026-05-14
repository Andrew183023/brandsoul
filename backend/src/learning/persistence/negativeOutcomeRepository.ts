import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  buildNegativeEconomicOutcomeId,
  type AppendNegativeEconomicOutcomeInput,
  type NegativeEconomicOutcome,
  type NegativeEconomicOutcomeMetadata,
} from '../negative-outcomes/NegativeEconomicOutcome.js'
import type { NegativeEconomicOutcomeType } from '../negative-outcomes/negativeOutcomeTypes.js'

type NegativeOutcomeRow = {
  outcome_id: string
  outcome_type: NegativeEconomicOutcomeType
  entity_id: string
  market_signal_id: string
  opportunity_id: string
  proposal_id: string
  execution_id: string
  category: string
  signal_keyword: string
  detected_at: string
  reason: string
  metadata_json: string | null
}

function parseMetadata(value: string | null): NegativeEconomicOutcomeMetadata | undefined {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? parsed as NegativeEconomicOutcomeMetadata : undefined
  } catch {
    return undefined
  }
}

function mapRow(row?: NegativeOutcomeRow): NegativeEconomicOutcome | null {
  if (!row) {
    return null
  }

  return {
    outcomeId: row.outcome_id,
    outcomeType: row.outcome_type,
    entityId: row.entity_id,
    marketSignalId: row.market_signal_id,
    opportunityId: row.opportunity_id,
    proposalId: row.proposal_id,
    executionId: row.execution_id,
    category: row.category,
    signalKeyword: row.signal_keyword,
    detectedAt: row.detected_at,
    reason: row.reason,
    metadata: parseMetadata(row.metadata_json),
  }
}

export class NegativeOutcomeRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendNegativeOutcome(input: AppendNegativeEconomicOutcomeInput): Promise<NegativeEconomicOutcome> {
    const outcomeId = input.outcomeId ?? buildNegativeEconomicOutcomeId({
      outcomeType: input.outcomeType,
      entityId: input.entityId,
      marketSignalId: input.marketSignalId,
      opportunityId: input.opportunityId,
      proposalId: input.proposalId,
      executionId: input.executionId,
      category: input.category,
      signalKeyword: input.signalKeyword,
      detectedAt: input.detectedAt,
      reason: input.reason,
      metadata: input.metadata,
    })

    traceMutation({
      source: 'backend/src/learning/persistence/negativeOutcomeRepository.ts#appendNegativeOutcome',
      type: 'portfolio',
      targetId: outcomeId,
      whatChanged: 'append immutable negative economic outcome',
    })

    await this.db.run(
      `
        INSERT INTO flowmind_negative_outcomes (
          outcome_id,
          outcome_type,
          entity_id,
          market_signal_id,
          opportunity_id,
          proposal_id,
          execution_id,
          category,
          signal_keyword,
          detected_at,
          reason,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(outcome_id) DO NOTHING
      `,
      outcomeId,
      input.outcomeType,
      input.entityId,
      input.marketSignalId,
      input.opportunityId,
      input.proposalId,
      input.executionId,
      input.category,
      input.signalKeyword,
      input.detectedAt,
      input.reason,
      input.metadata ? JSON.stringify(input.metadata) : null,
    )

    const record = await this.getNegativeOutcomeById(outcomeId)
    if (!record) {
      throw new Error(`Failed to append negative economic outcome ${outcomeId}.`)
    }

    return record
  }

  async getNegativeOutcomeById(outcomeId: string): Promise<NegativeEconomicOutcome | null> {
    const row = await this.db.get<NegativeOutcomeRow>(
      `
        SELECT *
        FROM flowmind_negative_outcomes
        WHERE outcome_id = ?
        LIMIT 1
      `,
      outcomeId,
    )

    return mapRow(row)
  }

  async listNegativeOutcomes(limit = 200): Promise<NegativeEconomicOutcome[]> {
    const rows = await this.db.all<NegativeOutcomeRow[]>(
      `
        SELECT *
        FROM flowmind_negative_outcomes
        ORDER BY detected_at DESC, outcome_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeEconomicOutcome => row !== null)
  }

  async listNegativeOutcomesByType(outcomeType: NegativeEconomicOutcomeType, limit = 200): Promise<NegativeEconomicOutcome[]> {
    const rows = await this.db.all<NegativeOutcomeRow[]>(
      `
        SELECT *
        FROM flowmind_negative_outcomes
        WHERE outcome_type = ?
        ORDER BY detected_at DESC, outcome_id DESC
        LIMIT ?
      `,
      outcomeType,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeEconomicOutcome => row !== null)
  }

  async listNegativeOutcomesByEntity(entityId: string, limit = 200): Promise<NegativeEconomicOutcome[]> {
    const rows = await this.db.all<NegativeOutcomeRow[]>(
      `
        SELECT *
        FROM flowmind_negative_outcomes
        WHERE entity_id = ?
        ORDER BY detected_at DESC, outcome_id DESC
        LIMIT ?
      `,
      entityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeEconomicOutcome => row !== null)
  }
}

export function createNegativeOutcomeRepository(db: BackendDatabase) {
  return new NegativeOutcomeRepository(db)
}
