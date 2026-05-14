import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import type { LearningLedgerEvent } from '../../learning/persistence/LearningLedgerEvent.js'

export type EconomicMemoryScope = 'signal' | 'category' | 'entity'

export type EconomicMemoryRecord = {
  memoryId: string
  memoryScope: EconomicMemoryScope
  category: string
  signalKeyword: string
  entityId: string | null
  successCount: number
  failureCount: number
  sampleCount: number
  minimumSampleCount: number
  totalRevenue: number
  averageConversion: number
  timeDecayWeight: number
  decayHalfLifeDays: number
  lastSeenAt: string
  updatedAt: string
}

export type UpdateEconomicMemoryInput = Omit<EconomicMemoryRecord, 'memoryId'> & {
  memoryId?: string
}

type EconomicMemoryRow = {
  memory_id: string
  memory_scope: EconomicMemoryScope
  category: string
  signal_keyword: string
  entity_id: string | null
  success_count: number
  failure_count: number
  sample_count: number
  minimum_sample_count: number
  total_revenue: number
  average_conversion: number
  time_decay_weight: number
  decay_half_life_days: number
  last_seen_at: string
  updated_at: string
}

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function buildEconomicMemoryId(category: string, signalKeyword: string) {
  return buildEconomicMemoryAggregateId({
    memoryScope: 'signal',
    category,
    signalKeyword,
  })
}

export function buildEconomicMemoryAggregateId(args: {
  memoryScope: EconomicMemoryScope
  category: string
  signalKeyword?: string
  entityId?: string | null
}) {
  return [
    'economic-memory',
    normalizeIdentifierPart(args.memoryScope).slice(0, 24) || 'scope',
    normalizeIdentifierPart(args.category).slice(0, 24) || 'category',
    normalizeIdentifierPart(args.signalKeyword ?? '*').slice(0, 48) || 'signal',
    normalizeIdentifierPart(args.entityId ?? '*').slice(0, 32) || 'entity',
  ].join(':').slice(0, 128)
}

function normalizeMinimumSampleCount(value?: number) {
  return Math.max(1, Math.trunc(value ?? 3))
}

function normalizeDecayHalfLifeDays(value?: number) {
  return Math.max(1, Math.trunc(value ?? 30))
}

function normalizeTimeDecayWeight(value?: number) {
  return roundMetric(clamp(Number(value ?? 1), 0, 1))
}

function deriveConversionAverage(successCount: number, failureCount: number) {
  const sampleCount = successCount + failureCount
  if (sampleCount <= 0) {
    return 0
  }

  return roundMetric(successCount / sampleCount)
}

function mapRow(row?: EconomicMemoryRow): EconomicMemoryRecord | null {
  if (!row) {
    return null
  }

  return {
    memoryId: row.memory_id,
    memoryScope: row.memory_scope,
    category: row.category,
    signalKeyword: row.signal_keyword,
    entityId: row.entity_id,
    successCount: Math.max(0, Number(row.success_count)),
    failureCount: Math.max(0, Number(row.failure_count)),
    sampleCount: Math.max(0, Number(row.sample_count)),
    minimumSampleCount: normalizeMinimumSampleCount(row.minimum_sample_count),
    totalRevenue: Math.max(0, Number(row.total_revenue)),
    averageConversion: clamp(Number(row.average_conversion), 0, 1),
    timeDecayWeight: normalizeTimeDecayWeight(row.time_decay_weight),
    decayHalfLifeDays: normalizeDecayHalfLifeDays(row.decay_half_life_days),
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  }
}

function mapRowOrThrow(row: EconomicMemoryRow): EconomicMemoryRecord {
  const mapped = mapRow(row)
  if (!mapped) {
    throw new Error('Expected economic memory row to map successfully.')
  }

  return mapped
}

export class EconomicMemoryRepository {
  constructor(private readonly db: BackendDatabase) {}

  async updateEconomicMemory(input: UpdateEconomicMemoryInput): Promise<EconomicMemoryRecord> {
    const memoryId = input.memoryId ?? buildEconomicMemoryAggregateId({
      memoryScope: input.memoryScope,
      category: input.category,
      signalKeyword: input.signalKeyword,
      entityId: input.entityId,
    })

    traceMutation({
      source: 'backend/src/persistence/economic/economicMemoryRepository.ts#updateEconomicMemory',
      type: 'portfolio',
      targetId: memoryId,
      whatChanged: 'upsert economic memory aggregate',
    })

    await this.db.run(
      `
        INSERT INTO flowmind_economic_memory (
          memory_id,
          memory_scope,
          category,
          signal_keyword,
          entity_id,
          success_count,
          failure_count,
          sample_count,
          minimum_sample_count,
          total_revenue,
          average_conversion,
          time_decay_weight,
          decay_half_life_days,
          last_seen_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          memory_scope = excluded.memory_scope,
          category = excluded.category,
          signal_keyword = excluded.signal_keyword,
          entity_id = excluded.entity_id,
          success_count = excluded.success_count,
          failure_count = excluded.failure_count,
          sample_count = excluded.sample_count,
          minimum_sample_count = excluded.minimum_sample_count,
          total_revenue = excluded.total_revenue,
          average_conversion = excluded.average_conversion,
          time_decay_weight = excluded.time_decay_weight,
          decay_half_life_days = excluded.decay_half_life_days,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at
      `,
      memoryId,
      input.memoryScope,
      input.category,
      input.signalKeyword,
      input.entityId,
      Math.max(0, Math.trunc(input.successCount)),
      Math.max(0, Math.trunc(input.failureCount)),
      Math.max(0, Math.trunc(input.sampleCount)),
      normalizeMinimumSampleCount(input.minimumSampleCount),
      Math.max(0, Number(input.totalRevenue)),
      roundMetric(clamp(Number(input.averageConversion), 0, 1)),
      normalizeTimeDecayWeight(input.timeDecayWeight),
      normalizeDecayHalfLifeDays(input.decayHalfLifeDays),
      input.lastSeenAt,
      input.updatedAt,
    )

    const record = await this.getEconomicMemory(memoryId)
    if (!record) {
      throw new Error(`Failed to update economic memory ${memoryId}.`)
    }

    return record
  }

  async getEconomicMemory(memoryId: string): Promise<EconomicMemoryRecord | null> {
    const row = await this.db.get<EconomicMemoryRow>(
      `
        SELECT *
        FROM flowmind_economic_memory
        WHERE memory_id = ?
        LIMIT 1
      `,
      memoryId,
    )

    return mapRow(row)
  }

  async aggregateLearningEvent(
    event: LearningLedgerEvent,
    options: {
      minimumSampleCount?: number
      decayHalfLifeDays?: number
    } = {},
  ): Promise<EconomicMemoryRecord[]> {
    const minimumSampleCount = normalizeMinimumSampleCount(options.minimumSampleCount)
    const decayHalfLifeDays = normalizeDecayHalfLifeDays(options.decayHalfLifeDays)
    const targets: Array<{
      memoryScope: EconomicMemoryScope
      category: string
      signalKeyword: string
      entityId: string | null
    }> = [
      {
        memoryScope: 'signal',
        category: event.category,
        signalKeyword: event.signalKeyword,
        entityId: null,
      },
      {
        memoryScope: 'category',
        category: event.category,
        signalKeyword: '*',
        entityId: null,
      },
      {
        memoryScope: 'entity',
        category: event.category,
        signalKeyword: '*',
        entityId: event.entityId,
      },
    ]

    const updatedRecords: EconomicMemoryRecord[] = []

    for (const target of targets) {
      const memoryId = buildEconomicMemoryAggregateId(target)
      const existing = await this.getEconomicMemory(memoryId)

      const nextSuccessCount = existing?.successCount ?? 0
      const nextFailureCount = existing?.failureCount ?? 0
      const nextSampleCount = existing?.sampleCount ?? 0
      let successCount = nextSuccessCount
      let failureCount = nextFailureCount
      let sampleCount = nextSampleCount
      let totalRevenue = existing?.totalRevenue ?? 0

      if (event.outcomeType === 'conversion_positive') {
        successCount += 1
        sampleCount += 1
      } else if (event.outcomeType === 'conversion_negative') {
        failureCount += 1
        sampleCount += 1
      } else if (event.outcomeType === 'revenue_positive') {
        totalRevenue += event.attributedRevenue
      }

      const record = await this.updateEconomicMemory({
        memoryId,
        memoryScope: target.memoryScope,
        category: target.category,
        signalKeyword: target.signalKeyword,
        entityId: target.entityId,
        successCount,
        failureCount,
        sampleCount,
        minimumSampleCount,
        totalRevenue,
        averageConversion: deriveConversionAverage(successCount, failureCount),
        timeDecayWeight: existing?.timeDecayWeight ?? 1,
        decayHalfLifeDays: existing?.decayHalfLifeDays ?? decayHalfLifeDays,
        lastSeenAt: event.observedAt,
        updatedAt: event.observedAt,
      })

      updatedRecords.push(record)
    }

    return updatedRecords
  }

  async listTopPerformingSignals(limit = 50): Promise<EconomicMemoryRecord[]> {
    const rows = await this.db.all<EconomicMemoryRow[]>(
      `
        SELECT *
        FROM flowmind_economic_memory
        WHERE memory_scope = 'signal'
        ORDER BY total_revenue DESC, average_conversion DESC, success_count DESC, updated_at DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is EconomicMemoryRecord => row !== null)
  }

  async listEconomicMemoryByScope(
    memoryScope: EconomicMemoryScope,
    limit = 500,
  ): Promise<EconomicMemoryRecord[]> {
    const rows = await this.db.all<EconomicMemoryRow[]>(
      `
        SELECT *
        FROM flowmind_economic_memory
        WHERE memory_scope = ?
        ORDER BY total_revenue DESC, average_conversion DESC, success_count DESC, updated_at DESC
        LIMIT ?
      `,
      memoryScope,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is EconomicMemoryRecord => row !== null)
  }

  async clearEconomicMemory(): Promise<void> {
    traceMutation({
      source: 'backend/src/persistence/economic/economicMemoryRepository.ts#clearEconomicMemory',
      type: 'portfolio',
      targetId: 'flowmind_economic_memory',
      whatChanged: 'clear all economic memory records',
    })

    await this.db.run('DELETE FROM flowmind_economic_memory')
  }

  async replaceEconomicMemoryRecords(records: EconomicMemoryRecord[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      traceMutation({
        source: 'backend/src/persistence/economic/economicMemoryRepository.ts#replaceEconomicMemoryRecords',
        type: 'portfolio',
        targetId: 'flowmind_economic_memory',
        whatChanged: 'replace economic memory records via rebuild batch',
      })

      await tx.run('DELETE FROM flowmind_economic_memory')

      for (const row of records) {
        const record = mapRowOrThrow({
          memory_id: row.memoryId,
          memory_scope: row.memoryScope,
          category: row.category,
          signal_keyword: row.signalKeyword,
          entity_id: row.entityId,
          success_count: row.successCount,
          failure_count: row.failureCount,
          sample_count: row.sampleCount,
          minimum_sample_count: row.minimumSampleCount,
          total_revenue: row.totalRevenue,
          average_conversion: row.averageConversion,
          time_decay_weight: row.timeDecayWeight,
          decay_half_life_days: row.decayHalfLifeDays,
          last_seen_at: row.lastSeenAt,
          updated_at: row.updatedAt,
        })

        await tx.run(
          `
            INSERT INTO flowmind_economic_memory (
              memory_id,
              memory_scope,
              category,
              signal_keyword,
              entity_id,
              success_count,
              failure_count,
              sample_count,
              minimum_sample_count,
              total_revenue,
              average_conversion,
              time_decay_weight,
              decay_half_life_days,
              last_seen_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          record.memoryId,
          record.memoryScope,
          record.category,
          record.signalKeyword,
          record.entityId,
          Math.max(0, Math.trunc(record.successCount)),
          Math.max(0, Math.trunc(record.failureCount)),
          Math.max(0, Math.trunc(record.sampleCount)),
          normalizeMinimumSampleCount(record.minimumSampleCount),
          Math.max(0, Number(record.totalRevenue)),
          roundMetric(clamp(Number(record.averageConversion), 0, 1)),
          normalizeTimeDecayWeight(record.timeDecayWeight),
          normalizeDecayHalfLifeDays(record.decayHalfLifeDays),
          record.lastSeenAt,
          record.updatedAt,
        )
      }
    })
  }

  async listAllEconomicMemory(): Promise<EconomicMemoryRecord[]> {
    const rows = await this.db.all<EconomicMemoryRow[]>(
      `
        SELECT *
        FROM flowmind_economic_memory
        ORDER BY memory_scope ASC, category ASC, signal_keyword ASC, entity_id ASC, memory_id ASC
      `,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is EconomicMemoryRecord => row !== null)
  }
}

export function createEconomicMemoryRepository(db: BackendDatabase) {
  return new EconomicMemoryRepository(db)
}
