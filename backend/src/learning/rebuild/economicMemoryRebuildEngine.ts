import { createHash } from 'node:crypto'

import type { BackendDatabase } from '../../db/dbClient.js'
import type { LearningOutcomeType } from '../persistence/LearningLedgerEvent.js'
import type { EconomicMemoryRebuildPlan } from './EconomicMemoryRebuildPlan.js'
import type { EconomicMemoryRebuildResult } from './EconomicMemoryRebuildResult.js'
import {
  buildEconomicMemoryAggregateId,
  type EconomicMemoryRecord,
  type EconomicMemoryScope,
} from '../../persistence/economic/economicMemoryRepository.js'

type LearningLedgerRow = {
  learning_event_id: string
  entity_id: string
  category: string
  signal_keyword: string
  outcome_type: LearningOutcomeType
  attributed_revenue: number
  conversion_success: number
  observed_at: string
}

type AggregateState = {
  scope: EconomicMemoryScope
  category: string
  signalKeyword: string
  entityId: string | null
  successCount: number
  failureCount: number
  sampleCount: number
  totalRevenue: number
  lastSeenAt: string
}

export type EconomicMemoryRebuildEngineOutput = {
  result: EconomicMemoryRebuildResult
  rebuiltRecords: EconomicMemoryRecord[]
}

const DEFAULT_MINIMUM_SAMPLE_COUNT = 3
const DEFAULT_DECAY_HALF_LIFE_DAYS = 30
const DEFAULT_TIME_DECAY_WEIGHT = 1

function toIsoDate(value: string, label: string) {
  const normalized = value.trim()
  const parsed = new Date(normalized)

  if (normalized.length === 0 || Number.isNaN(parsed.getTime())) {
    throw new Error(`Economic memory rebuild requires a valid ${label} ISO timestamp.`)
  }

  return parsed.toISOString()
}

function validatePlan(plan: EconomicMemoryRebuildPlan) {
  if (plan.reason.trim().length === 0) {
    throw new Error('Economic memory rebuild requires reason.')
  }

  const fromObservedAt = plan.fromObservedAt ? toIsoDate(plan.fromObservedAt, 'fromObservedAt') : undefined
  const toObservedAt = plan.toObservedAt ? toIsoDate(plan.toObservedAt, 'toObservedAt') : undefined

  if (fromObservedAt && toObservedAt && fromObservedAt > toObservedAt) {
    throw new Error('Economic memory rebuild requires fromObservedAt <= toObservedAt.')
  }

  return {
    fromObservedAt,
    toObservedAt,
  }
}

function normalizeNonEmpty(value: string) {
  return value.trim()
}

function isSupportedOutcomeType(value: string): value is LearningOutcomeType {
  return (
    value === 'revenue_positive' ||
    value === 'revenue_negative' ||
    value === 'conversion_positive' ||
    value === 'conversion_negative'
  )
}

function parseObservedAt(value: string) {
  const normalized = value.trim()
  const parsed = new Date(normalized)

  if (normalized.length === 0 || Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function isValidRevenue(value: number) {
  return Number.isFinite(value) && value >= 0
}

function deriveAverageConversion(successCount: number, failureCount: number) {
  const total = successCount + failureCount
  if (total <= 0) {
    return 0
  }

  return successCount / total
}

function roundMetric(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeScope(planScope: EconomicMemoryRebuildPlan['scope']): EconomicMemoryScope[] {
  if (planScope === 'all') {
    return ['signal', 'category', 'entity']
  }

  return [planScope]
}

function sortRecordsDeterministically(records: EconomicMemoryRecord[]) {
  const scopeOrder: Record<EconomicMemoryScope, number> = {
    signal: 0,
    category: 1,
    entity: 2,
  }

  return records.slice().sort((a, b) => {
    const byScope = scopeOrder[a.memoryScope] - scopeOrder[b.memoryScope]
    if (byScope !== 0) {
      return byScope
    }

    const byCategory = a.category.localeCompare(b.category)
    if (byCategory !== 0) {
      return byCategory
    }

    const bySignal = a.signalKeyword.localeCompare(b.signalKeyword)
    if (bySignal !== 0) {
      return bySignal
    }

    const byEntity = (a.entityId ?? '').localeCompare(b.entityId ?? '')
    if (byEntity !== 0) {
      return byEntity
    }

    return a.memoryId.localeCompare(b.memoryId)
  })
}

function buildAggregateKey(scope: EconomicMemoryScope, category: string, signalKeyword: string, entityId: string | null) {
  return `${scope}::${category}::${signalKeyword}::${entityId ?? '*'}`
}

function createRebuildId(plan: EconomicMemoryRebuildPlan, startedAt: string) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        dryRun: plan.dryRun,
        scope: plan.scope,
        fromObservedAt: plan.fromObservedAt ?? null,
        toObservedAt: plan.toObservedAt ?? null,
        reason: plan.reason,
        startedAt,
      }),
    )
    .digest('hex')

  return `economic-memory-rebuild:${digest.slice(0, 24)}`
}

export class EconomicMemoryRebuildEngine {
  constructor(private readonly db: BackendDatabase) {}

  async rebuild(plan: EconomicMemoryRebuildPlan): Promise<EconomicMemoryRebuildEngineOutput> {
    const startedAt = new Date().toISOString()

    try {
      const validated = validatePlan(plan)
      const scopes = normalizeScope(plan.scope)
      const warnings: string[] = []
      let skippedEvents = 0

      const queryParts = [
        'SELECT learning_event_id, entity_id, category, signal_keyword, outcome_type, attributed_revenue, conversion_success, observed_at',
        'FROM flowmind_learning_ledger',
      ]
      const params: unknown[] = []
      const whereClauses: string[] = []

      if (validated.fromObservedAt) {
        whereClauses.push('observed_at >= ?')
        params.push(validated.fromObservedAt)
      }

      if (validated.toObservedAt) {
        whereClauses.push('observed_at <= ?')
        params.push(validated.toObservedAt)
      }

      if (whereClauses.length > 0) {
        queryParts.push(`WHERE ${whereClauses.join(' AND ')}`)
      }

      queryParts.push('ORDER BY observed_at ASC, learning_event_id ASC')

      const rows = await this.db.all<LearningLedgerRow[]>(queryParts.join('\n'), ...params)

      const aggregates = new Map<string, AggregateState>()
      let processedLedgerEvents = 0

      for (const row of rows) {
        const category = normalizeNonEmpty(row.category)
        const signalKeyword = normalizeNonEmpty(row.signal_keyword)
        const entityId = normalizeNonEmpty(row.entity_id)
        const observedAt = parseObservedAt(row.observed_at)

        if (!isSupportedOutcomeType(row.outcome_type)) {
          skippedEvents += 1
          warnings.push(`Skipped ${row.learning_event_id}: unsupported outcome_type ${String(row.outcome_type)}.`)
          continue
        }

        if (!isValidRevenue(Number(row.attributed_revenue))) {
          skippedEvents += 1
          warnings.push(`Skipped ${row.learning_event_id}: invalid attributed_revenue ${String(row.attributed_revenue)}.`)
          continue
        }

        if (category.length === 0 || signalKeyword.length === 0 || entityId.length === 0 || !observedAt) {
          skippedEvents += 1
          warnings.push(`Skipped ${row.learning_event_id}: malformed identifiers or observed_at.`)
          continue
        }

        processedLedgerEvents += 1

        for (const scope of scopes) {
          const targetSignalKeyword = scope === 'signal' ? signalKeyword : '*'
          const targetEntityId = scope === 'entity' ? entityId : null
          const aggregateKey = buildAggregateKey(scope, category, targetSignalKeyword, targetEntityId)
          const existing = aggregates.get(aggregateKey)

          if (!existing) {
            aggregates.set(aggregateKey, {
              scope,
              category,
              signalKeyword: targetSignalKeyword,
              entityId: targetEntityId,
              successCount: 0,
              failureCount: 0,
              sampleCount: 0,
              totalRevenue: 0,
              lastSeenAt: observedAt,
            })
          }

          const aggregate = aggregates.get(aggregateKey)
          if (!aggregate) {
            continue
          }

          if (row.outcome_type === 'conversion_positive') {
            aggregate.successCount += 1
            aggregate.sampleCount += 1
          } else if (row.outcome_type === 'conversion_negative') {
            aggregate.failureCount += 1
            aggregate.sampleCount += 1
          } else if (row.outcome_type === 'revenue_positive') {
            aggregate.totalRevenue += Number(row.attributed_revenue)
          }

          if (observedAt > aggregate.lastSeenAt) {
            aggregate.lastSeenAt = observedAt
          }
        }
      }

      const rebuiltRecords = sortRecordsDeterministically(
        Array.from(aggregates.values()).map((aggregate) => {
          const memoryId = buildEconomicMemoryAggregateId({
            memoryScope: aggregate.scope,
            category: aggregate.category,
            signalKeyword: aggregate.signalKeyword,
            entityId: aggregate.entityId,
          })

          return {
            memoryId,
            memoryScope: aggregate.scope,
            category: aggregate.category,
            signalKeyword: aggregate.signalKeyword,
            entityId: aggregate.entityId,
            successCount: aggregate.successCount,
            failureCount: aggregate.failureCount,
            sampleCount: aggregate.sampleCount,
            minimumSampleCount: DEFAULT_MINIMUM_SAMPLE_COUNT,
            totalRevenue: roundMetric(aggregate.totalRevenue, 4),
            averageConversion: roundMetric(deriveAverageConversion(aggregate.successCount, aggregate.failureCount), 4),
            timeDecayWeight: DEFAULT_TIME_DECAY_WEIGHT,
            decayHalfLifeDays: DEFAULT_DECAY_HALF_LIFE_DAYS,
            lastSeenAt: aggregate.lastSeenAt,
            updatedAt: aggregate.lastSeenAt,
          } satisfies EconomicMemoryRecord
        }),
      )

      const completedAt = new Date().toISOString()
      const result: EconomicMemoryRebuildResult = {
        rebuildId: createRebuildId(plan, startedAt),
        dryRun: plan.dryRun,
        startedAt,
        completedAt,
        processedLedgerEvents,
        rebuiltMemoryRecords: rebuiltRecords.length,
        skippedEvents,
        warnings,
        status: 'completed',
      }

      return {
        result,
        rebuiltRecords,
      }
    } catch (error) {
      const completedAt = new Date().toISOString()
      const result: EconomicMemoryRebuildResult = {
        rebuildId: createRebuildId(plan, startedAt),
        dryRun: plan.dryRun,
        startedAt,
        completedAt,
        processedLedgerEvents: 0,
        rebuiltMemoryRecords: 0,
        skippedEvents: 0,
        warnings: [error instanceof Error ? error.message : 'Unknown rebuild failure.'],
        status: 'failed',
      }

      return {
        result,
        rebuiltRecords: [],
      }
    }
  }
}

export function createEconomicMemoryRebuildEngine(db: BackendDatabase) {
  return new EconomicMemoryRebuildEngine(db)
}
