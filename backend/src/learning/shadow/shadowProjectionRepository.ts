import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  createShadowDecisionProjection,
  type CreateShadowDecisionProjectionInput,
  type ShadowDecisionProjection,
} from './ShadowDecisionProjection.js'

type ShadowProjectionRow = {
  projection_id: string
  market_signal_id: string
  entity_id: string
  base_score: number
  adaptive_score: number
  score_delta: number
  adaptive_multiplier: number
  projection_type: ShadowDecisionProjection['projectionType']
  generated_at: string
}

export type AppendShadowProjectionInput = CreateShadowDecisionProjectionInput | ShadowDecisionProjection

export type AppendShadowProjectionResult = {
  projection: ShadowDecisionProjection
  inserted: boolean
}

function mapRow(row?: ShadowProjectionRow): ShadowDecisionProjection | null {
  if (!row) {
    return null
  }

  return Object.freeze({
    projectionId: row.projection_id,
    marketSignalId: row.market_signal_id,
    entityId: row.entity_id,
    baseScore: Number(row.base_score),
    adaptiveScore: Number(row.adaptive_score),
    scoreDelta: Number(row.score_delta),
    adaptiveMultiplier: Number(row.adaptive_multiplier),
    projectionType: row.projection_type,
    generatedAt: row.generated_at,
  })
}

function toProjectionRecord(input: AppendShadowProjectionInput): ShadowDecisionProjection {
  if ('scoreDelta' in input && 'projectionId' in input) {
    return Object.freeze({ ...input })
  }

  return createShadowDecisionProjection(input)
}

export class ShadowProjectionRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendProjection(input: AppendShadowProjectionInput): Promise<AppendShadowProjectionResult> {
    const projection = toProjectionRecord(input)

    traceMutation({
      source: 'backend/src/learning/shadow/shadowProjectionRepository.ts#appendProjection',
      type: 'portfolio',
      targetId: projection.projectionId,
      whatChanged: 'append immutable shadow decision projection',
    })

    const insertResult = await this.db.run(
      `
        INSERT INTO flowmind_shadow_projections (
          projection_id,
          market_signal_id,
          entity_id,
          base_score,
          adaptive_score,
          score_delta,
          adaptive_multiplier,
          projection_type,
          generated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(projection_id) DO NOTHING
      `,
      projection.projectionId,
      projection.marketSignalId,
      projection.entityId,
      projection.baseScore,
      projection.adaptiveScore,
      projection.scoreDelta,
      projection.adaptiveMultiplier,
      projection.projectionType,
      projection.generatedAt,
    )

    const inserted = (insertResult.changes ?? 0) > 0
    const persisted = await this.getProjectionById(projection.projectionId)

    if (!persisted) {
      throw new Error(`Failed to append shadow projection ${projection.projectionId}.`)
    }

    return {
      projection: persisted,
      inserted,
    }
  }

  async getProjectionById(projectionId: string): Promise<ShadowDecisionProjection | null> {
    const row = await this.db.get<ShadowProjectionRow>(
      `
        SELECT *
        FROM flowmind_shadow_projections
        WHERE projection_id = ?
        LIMIT 1
      `,
      projectionId,
    )

    return mapRow(row)
  }

  async listRecentProjections(limit = 200): Promise<ShadowDecisionProjection[]> {
    const boundedLimit = Math.max(1, Math.min(1000, Math.trunc(limit)))
    const rows = await this.db.all<ShadowProjectionRow[]>(
      `
        SELECT *
        FROM flowmind_shadow_projections
        ORDER BY generated_at DESC, projection_id DESC
        LIMIT ?
      `,
      boundedLimit,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is ShadowDecisionProjection => row !== null)
  }
}

export function createShadowProjectionRepository(db: BackendDatabase) {
  return new ShadowProjectionRepository(db)
}
