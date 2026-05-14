import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  createShadowDecisionComparison,
  type CreateShadowDecisionComparisonInput,
  type ShadowDecisionComparison,
} from './ShadowDecisionComparison.js'

type ShadowComparisonRow = {
  comparison_id: string
  market_signal_id: string
  live_decision: string
  shadow_decision: string
  divergence_type: ShadowDecisionComparison['divergenceType']
  divergence_score: number
  estimated_economic_delta: number
  generated_at: string
}

export type AppendShadowComparisonInput = CreateShadowDecisionComparisonInput | ShadowDecisionComparison

export type AppendShadowComparisonResult = {
  comparison: ShadowDecisionComparison
  inserted: boolean
}

function mapRow(row?: ShadowComparisonRow): ShadowDecisionComparison | null {
  if (!row) {
    return null
  }

  return Object.freeze({
    comparisonId: row.comparison_id,
    marketSignalId: row.market_signal_id,
    liveDecision: row.live_decision,
    shadowDecision: row.shadow_decision,
    divergenceType: row.divergence_type,
    divergenceScore: Number(row.divergence_score),
    estimatedEconomicDelta: Number(row.estimated_economic_delta),
    generatedAt: row.generated_at,
  })
}

function toComparisonRecord(input: AppendShadowComparisonInput): ShadowDecisionComparison {
  return createShadowDecisionComparison(input)
}

export class ShadowComparisonRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendComparison(input: AppendShadowComparisonInput): Promise<AppendShadowComparisonResult> {
    const comparison = toComparisonRecord(input)

    traceMutation({
      source: 'backend/src/learning/shadow/shadowComparisonRepository.ts#appendComparison',
      type: 'portfolio',
      targetId: comparison.comparisonId,
      whatChanged: 'append immutable shadow decision comparison',
    })

    const insertResult = await this.db.run(
      `
        INSERT INTO flowmind_shadow_comparisons (
          comparison_id,
          market_signal_id,
          live_decision,
          shadow_decision,
          divergence_type,
          divergence_score,
          estimated_economic_delta,
          generated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(comparison_id) DO NOTHING
      `,
      comparison.comparisonId,
      comparison.marketSignalId,
      comparison.liveDecision,
      comparison.shadowDecision,
      comparison.divergenceType,
      comparison.divergenceScore,
      comparison.estimatedEconomicDelta,
      comparison.generatedAt,
    )

    const inserted = (insertResult.changes ?? 0) > 0
    const persisted = await this.getComparisonById(comparison.comparisonId)

    if (!persisted) {
      throw new Error(`Failed to append shadow comparison ${comparison.comparisonId}.`)
    }

    return {
      comparison: persisted,
      inserted,
    }
  }

  async getComparisonById(comparisonId: string): Promise<ShadowDecisionComparison | null> {
    const row = await this.db.get<ShadowComparisonRow>(
      `
        SELECT *
        FROM flowmind_shadow_comparisons
        WHERE comparison_id = ?
        LIMIT 1
      `,
      comparisonId,
    )

    return mapRow(row)
  }

  async listTopDivergences(limit = 100): Promise<ShadowDecisionComparison[]> {
    const boundedLimit = Math.max(1, Math.min(1000, Math.trunc(limit)))
    const rows = await this.db.all<ShadowComparisonRow[]>(
      `
        SELECT *
        FROM flowmind_shadow_comparisons
        WHERE divergence_type <> 'no_divergence'
        ORDER BY divergence_score DESC, generated_at DESC, comparison_id DESC
        LIMIT ?
      `,
      boundedLimit,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is ShadowDecisionComparison => row !== null)
  }
}

export function createShadowComparisonRepository(db: BackendDatabase) {
  return new ShadowComparisonRepository(db)
}
