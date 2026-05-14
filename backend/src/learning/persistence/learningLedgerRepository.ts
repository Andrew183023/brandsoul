import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  buildLearningLedgerEventId,
  type AppendLearningLedgerEventInput,
  type LearningLedgerEvent,
  type LearningOutcomeType,
} from './LearningLedgerEvent.js'

type LearningLedgerRow = {
  learning_event_id: string
  attribution_id: string
  market_signal_id: string
  opportunity_id: string
  proposal_id: string
  execution_id: string
  entity_id: string
  category: string
  signal_keyword: string
  outcome_type: LearningOutcomeType
  attributed_revenue: number
  conversion_success: number
  observed_at: string
}

export type AppendLearningEventResult = {
  learningEvent: LearningLedgerEvent
  inserted: boolean
}

export type LearningEventsForRebuildArgs = {
  fromObservedAt?: string
  toObservedAt?: string
  limit?: number
  offset?: number
}

export type CountLearningEventsForRebuildArgs = {
  fromObservedAt?: string
  toObservedAt?: string
}

function normalizeRevenue(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Learning ledger requires a finite non-negative attributedRevenue.')
  }

  return Number(value.toString())
}

function mapRow(row?: LearningLedgerRow): LearningLedgerEvent | null {
  if (!row) {
    return null
  }

  return {
    learningEventId: row.learning_event_id,
    attributionId: row.attribution_id,
    marketSignalId: row.market_signal_id,
    opportunityId: row.opportunity_id,
    proposalId: row.proposal_id,
    executionId: row.execution_id,
    entityId: row.entity_id,
    category: row.category,
    signalKeyword: row.signal_keyword,
    outcomeType: row.outcome_type,
    attributedRevenue: normalizeRevenue(row.attributed_revenue),
    conversionSuccess: Boolean(row.conversion_success),
    observedAt: row.observed_at,
  }
}

function normalizeObservedAtFilter(value: string | undefined, label: string) {
  if (!value) {
    return undefined
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return undefined
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Learning ledger rebuild filter requires a valid ${label} ISO timestamp.`)
  }

  return parsed.toISOString()
}

export class LearningLedgerRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendLearningEvent(input: AppendLearningLedgerEventInput): Promise<AppendLearningEventResult> {
    const learningEventId = input.learningEventId ?? buildLearningLedgerEventId({
      attributionId: input.attributionId,
      marketSignalId: input.marketSignalId,
      opportunityId: input.opportunityId,
      proposalId: input.proposalId,
      executionId: input.executionId,
      entityId: input.entityId,
      category: input.category,
      signalKeyword: input.signalKeyword,
      outcomeType: input.outcomeType,
      attributedRevenue: input.attributedRevenue,
      conversionSuccess: input.conversionSuccess,
      observedAt: input.observedAt,
    })

    traceMutation({
      source: 'backend/src/learning/persistence/learningLedgerRepository.ts#appendLearningEvent',
      type: 'portfolio',
      targetId: learningEventId,
      whatChanged: 'append immutable economic learning ledger event',
    })

    const insertResult = await this.db.run(
      `
        INSERT INTO flowmind_learning_ledger (
          learning_event_id,
          attribution_id,
          market_signal_id,
          opportunity_id,
          proposal_id,
          execution_id,
          entity_id,
          category,
          signal_keyword,
          outcome_type,
          attributed_revenue,
          conversion_success,
          observed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(learning_event_id) DO NOTHING
      `,
      learningEventId,
      input.attributionId,
      input.marketSignalId,
      input.opportunityId,
      input.proposalId,
      input.executionId,
      input.entityId,
      input.category,
      input.signalKeyword,
      input.outcomeType,
      normalizeRevenue(input.attributedRevenue),
      input.conversionSuccess ? 1 : 0,
      input.observedAt,
    )
    const inserted = (insertResult.changes ?? 0) > 0

    const record = await this.getLearningEventById(learningEventId)
    if (!record) {
      throw new Error(`Failed to append learning ledger event ${learningEventId}.`)
    }

    console.info('[learning-ledger] append.result', {
      learningEventId,
      inserted,
      replaySafe: true,
      conflictIgnored: !inserted,
    })

    return {
      learningEvent: record,
      inserted,
    }
  }

  async getLearningEventById(learningEventId: string): Promise<LearningLedgerEvent | null> {
    const row = await this.db.get<LearningLedgerRow>(
      `
        SELECT *
        FROM flowmind_learning_ledger
        WHERE learning_event_id = ?
        LIMIT 1
      `,
      learningEventId,
    )

    return mapRow(row)
  }

  async listLearningEvents(limit = 200): Promise<LearningLedgerEvent[]> {
    const rows = await this.db.all<LearningLedgerRow[]>(
      `
        SELECT *
        FROM flowmind_learning_ledger
        ORDER BY observed_at DESC, learning_event_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is LearningLedgerEvent => row !== null)
  }

  async countLearningEvents(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM flowmind_learning_ledger
      `,
    )

    return Math.max(0, Number(row?.count ?? 0))
  }

  async listLearningEventsPaginated(args: {
    limit?: number
    offset?: number
  } = {}): Promise<LearningLedgerEvent[]> {
    const limit = Math.max(1, Math.min(500, Math.trunc(args.limit ?? 50)))
    const offset = Math.max(0, Math.trunc(args.offset ?? 0))
    const rows = await this.db.all<LearningLedgerRow[]>(
      `
        SELECT *
        FROM flowmind_learning_ledger
        ORDER BY observed_at DESC, learning_event_id DESC
        LIMIT ?
        OFFSET ?
      `,
      limit,
      offset,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is LearningLedgerEvent => row !== null)
  }

  async listLearningEventsByCategory(category: string, limit = 200): Promise<LearningLedgerEvent[]> {
    const rows = await this.db.all<LearningLedgerRow[]>(
      `
        SELECT *
        FROM flowmind_learning_ledger
        WHERE category = ?
        ORDER BY observed_at DESC, learning_event_id DESC
        LIMIT ?
      `,
      category,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is LearningLedgerEvent => row !== null)
  }

  async listLearningEventsBySignal(signalKeyword: string, limit = 200): Promise<LearningLedgerEvent[]> {
    const rows = await this.db.all<LearningLedgerRow[]>(
      `
        SELECT *
        FROM flowmind_learning_ledger
        WHERE signal_keyword = ?
        ORDER BY observed_at DESC, learning_event_id DESC
        LIMIT ?
      `,
      signalKeyword,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is LearningLedgerEvent => row !== null)
  }

  async listLearningEventsForRebuild(args: LearningEventsForRebuildArgs = {}): Promise<LearningLedgerEvent[]> {
    const limit = Math.max(1, Math.min(5000, Math.trunc(args.limit ?? 1000)))
    const offset = Math.max(0, Math.trunc(args.offset ?? 0))
    const fromObservedAt = normalizeObservedAtFilter(args.fromObservedAt, 'fromObservedAt')
    const toObservedAt = normalizeObservedAtFilter(args.toObservedAt, 'toObservedAt')

    if (fromObservedAt && toObservedAt && fromObservedAt > toObservedAt) {
      throw new Error('Learning ledger rebuild filter requires fromObservedAt <= toObservedAt.')
    }

    const whereClauses: string[] = []
    const queryArgs: unknown[] = []

    if (fromObservedAt) {
      whereClauses.push('observed_at >= ?')
      queryArgs.push(fromObservedAt)
    }

    if (toObservedAt) {
      whereClauses.push('observed_at <= ?')
      queryArgs.push(toObservedAt)
    }

    let sql = `
      SELECT *
      FROM flowmind_learning_ledger
    `

    if (whereClauses.length > 0) {
      sql += `
      WHERE ${whereClauses.join(' AND ')}
      `
    }

    sql += `
      ORDER BY observed_at ASC, learning_event_id ASC
      LIMIT ?
      OFFSET ?
    `

    queryArgs.push(limit, offset)

    const rows = await this.db.all<LearningLedgerRow[]>(sql, ...queryArgs)

    return rows.map((row) => mapRow(row)).filter((row): row is LearningLedgerEvent => row !== null)
  }

  async countLearningEventsForRebuild(args: CountLearningEventsForRebuildArgs = {}): Promise<number> {
    const fromObservedAt = normalizeObservedAtFilter(args.fromObservedAt, 'fromObservedAt')
    const toObservedAt = normalizeObservedAtFilter(args.toObservedAt, 'toObservedAt')

    if (fromObservedAt && toObservedAt && fromObservedAt > toObservedAt) {
      throw new Error('Learning ledger rebuild filter requires fromObservedAt <= toObservedAt.')
    }

    const whereClauses: string[] = []
    const queryArgs: unknown[] = []

    if (fromObservedAt) {
      whereClauses.push('observed_at >= ?')
      queryArgs.push(fromObservedAt)
    }

    if (toObservedAt) {
      whereClauses.push('observed_at <= ?')
      queryArgs.push(toObservedAt)
    }

    let sql = `
      SELECT COUNT(*) AS count
      FROM flowmind_learning_ledger
    `

    if (whereClauses.length > 0) {
      sql += `
      WHERE ${whereClauses.join(' AND ')}
      `
    }

    const row = await this.db.get<{ count: number }>(sql, ...queryArgs)
    return Math.max(0, Number(row?.count ?? 0))
  }
}

export function createLearningLedgerRepository(db: BackendDatabase) {
  return new LearningLedgerRepository(db)
}
