import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  buildNegativeAttributionId,
  type AppendNegativeAttributionInput,
  type NegativeAttributionEvent,
  type NegativeAttributionLineageQuality,
  type NegativeAttributionSeverity,
} from '../negative-attribution/NegativeAttributionEvent.js'
import type { NegativeEconomicOutcomeType } from '../negative-outcomes/negativeOutcomeTypes.js'

type NegativeAttributionRow = {
  attribution_id: string
  outcome_id: string
  signal_id: string | null
  opportunity_id: string | null
  proposal_id: string | null
  execution_id: string | null
  entity_id: string | null
  category: string | null
  keyword: string | null
  outcome_type: NegativeEconomicOutcomeType
  severity: NegativeAttributionSeverity
  reason: string | null
  attributed_at: string
  occurred_at: string
  detected_at: string
  source_runtime: string
  detector_version: string
  lineage_quality: NegativeAttributionLineageQuality
  metadata_json: string | null
  created_at: string
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function mapRow(row?: NegativeAttributionRow): NegativeAttributionEvent | null {
  if (!row) {
    return null
  }

  return {
    attributionId: row.attribution_id,
    outcomeId: row.outcome_id,
    signalId: row.signal_id,
    opportunityId: row.opportunity_id,
    proposalId: row.proposal_id,
    executionId: row.execution_id,
    entityId: row.entity_id,
    category: row.category,
    keyword: row.keyword,
    outcomeType: row.outcome_type,
    severity: row.severity,
    reason: row.reason,
    attributedAt: row.attributed_at,
    occurredAt: row.occurred_at,
    detectedAt: row.detected_at,
    sourceRuntime: row.source_runtime,
    detectorVersion: row.detector_version,
    lineageQuality: row.lineage_quality,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
  }
}

export class NegativeAttributionRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendNegativeAttribution(input: AppendNegativeAttributionInput): Promise<NegativeAttributionEvent> {
    const attributionId = input.attributionId ?? buildNegativeAttributionId({
      outcomeId: input.outcomeId,
      signalId: input.signalId,
      opportunityId: input.opportunityId,
      proposalId: input.proposalId,
      executionId: input.executionId,
      entityId: input.entityId,
      category: input.category,
      keyword: input.keyword,
      outcomeType: input.outcomeType,
      severity: input.severity,
      reason: input.reason,
      attributedAt: input.attributedAt,
      occurredAt: input.occurredAt,
      detectedAt: input.detectedAt,
      sourceRuntime: input.sourceRuntime,
      detectorVersion: input.detectorVersion,
      lineageQuality: input.lineageQuality,
      metadata: input.metadata,
      createdAt: input.createdAt,
    })

    traceMutation({
      source: 'backend/src/learning/persistence/negativeAttributionRepository.ts#appendNegativeAttribution',
      type: 'portfolio',
      targetId: attributionId,
      whatChanged: 'append immutable negative attribution event',
    })

    await this.db.run(
      `
        INSERT INTO flowmind_negative_attribution (
          attribution_id,
          outcome_id,
          signal_id,
          opportunity_id,
          proposal_id,
          execution_id,
          entity_id,
          category,
          keyword,
          outcome_type,
          severity,
          reason,
          attributed_at,
          occurred_at,
          detected_at,
          source_runtime,
          detector_version,
          lineage_quality,
          metadata_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(attribution_id) DO NOTHING
      `,
      attributionId,
      input.outcomeId,
      input.signalId,
      input.opportunityId,
      input.proposalId,
      input.executionId,
      input.entityId,
      input.category,
      input.keyword,
      input.outcomeType,
      input.severity,
      input.reason,
      input.attributedAt,
      input.occurredAt,
      input.detectedAt,
      input.sourceRuntime,
      input.detectorVersion,
      input.lineageQuality,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.createdAt,
    )

    const record = await this.getNegativeAttributionById(attributionId)
    if (!record) {
      throw new Error(`Failed to append negative attribution ${attributionId}.`)
    }

    return record
  }

  async getNegativeAttributionById(attributionId: string): Promise<NegativeAttributionEvent | null> {
    const row = await this.db.get<NegativeAttributionRow>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        WHERE attribution_id = ?
        LIMIT 1
      `,
      attributionId,
    )

    return mapRow(row)
  }

  async listNegativeAttributions(limit = 200): Promise<NegativeAttributionEvent[]> {
    const rows = await this.db.all<NegativeAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        ORDER BY detected_at DESC, attribution_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeAttributionEvent => row !== null)
  }

  async listNegativeAttributionsByOutcomeType(
    outcomeType: NegativeEconomicOutcomeType,
    limit = 200,
  ): Promise<NegativeAttributionEvent[]> {
    const rows = await this.db.all<NegativeAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        WHERE outcome_type = ?
        ORDER BY detected_at DESC, attribution_id DESC
        LIMIT ?
      `,
      outcomeType,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeAttributionEvent => row !== null)
  }

  async listNegativeAttributionsByOpportunity(
    opportunityId: string,
    limit = 200,
  ): Promise<NegativeAttributionEvent[]> {
    const rows = await this.db.all<NegativeAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        WHERE opportunity_id = ?
        ORDER BY occurred_at DESC, attribution_id DESC
        LIMIT ?
      `,
      opportunityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeAttributionEvent => row !== null)
  }

  async listNegativeAttributionsByProposal(
    proposalId: string,
    limit = 200,
  ): Promise<NegativeAttributionEvent[]> {
    const rows = await this.db.all<NegativeAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        WHERE proposal_id = ?
        ORDER BY occurred_at DESC, attribution_id DESC
        LIMIT ?
      `,
      proposalId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeAttributionEvent => row !== null)
  }

  async listNegativeAttributionsByExecution(
    executionId: string,
    limit = 200,
  ): Promise<NegativeAttributionEvent[]> {
    const rows = await this.db.all<NegativeAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        WHERE execution_id = ?
        ORDER BY occurred_at DESC, attribution_id DESC
        LIMIT ?
      `,
      executionId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeAttributionEvent => row !== null)
  }

  async listNegativeAttributionsByEntity(
    entityId: string,
    limit = 200,
  ): Promise<NegativeAttributionEvent[]> {
    const rows = await this.db.all<NegativeAttributionRow[]>(
      `
        SELECT *
        FROM flowmind_negative_attribution
        WHERE entity_id = ?
        ORDER BY occurred_at DESC, attribution_id DESC
        LIMIT ?
      `,
      entityId,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is NegativeAttributionEvent => row !== null)
  }
}

export function createNegativeAttributionRepository(db: BackendDatabase) {
  return new NegativeAttributionRepository(db)
}
