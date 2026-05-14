import type {
  EconomicMemoryRecord,
  EconomicMemoryRepository,
} from '../../persistence/economic/economicMemoryRepository.js'

type AdaptiveWeightSnapshotRuntimeDependencies = {
  economicMemoryRepository: EconomicMemoryRepository
  refreshIntervalMs?: number
}

export type AdaptiveWeightScope = 'signal' | 'category' | 'entity'

export type AdaptiveWeightRecord = {
  weightId: string
  memoryId: string
  scope: AdaptiveWeightScope
  category: string
  signalKeyword: string
  entityId: string | null
  weight: number
  sampleCount: number
  confidenceLevel: 'low' | 'medium' | 'high'
  decayFactor: number
  lastUpdated: string
}

export type AdaptiveWeightSnapshot = {
  generatedAt: string
  signalWeights: AdaptiveWeightRecord[]
  categoryWeights: AdaptiveWeightRecord[]
  entityWeights: AdaptiveWeightRecord[]
  metadata: {
    recordCount: number
    boundedMin: number
    boundedMax: number
    refreshIntervalMs: number
    lastRefreshDurationMs: number | null
    lastError: string | null
  }
}

export type AdaptiveWeightSnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type AdaptiveWeightRuntimeState = {
  ready: boolean
  warming: boolean
  error: string | null
}

export type AdaptiveWeightSnapshotState = {
  snapshot: AdaptiveWeightSnapshot
  freshness: AdaptiveWeightSnapshotFreshness
  runtimeState: AdaptiveWeightRuntimeState
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const MIN_WEIGHT = 0.75
const MAX_WEIGHT = 1.35

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildWeightId(record: EconomicMemoryRecord) {
  return [
    'adaptive-weight',
    normalizeIdPart(record.memoryScope).slice(0, 16) || 'scope',
    normalizeIdPart(record.category).slice(0, 24) || 'category',
    normalizeIdPart(record.signalKeyword).slice(0, 32) || 'signal',
    normalizeIdPart(record.entityId ?? '*').slice(0, 24) || 'entity',
  ].join(':').slice(0, 128)
}

function classifyConfidenceLevel(record: EconomicMemoryRecord): AdaptiveWeightRecord['confidenceLevel'] {
  if (record.sampleCount >= Math.max(record.minimumSampleCount * 3, 12)) {
    return 'high'
  }

  if (record.sampleCount >= record.minimumSampleCount) {
    return 'medium'
  }

  return 'low'
}

function deriveDecayFactor(record: EconomicMemoryRecord, now: string) {
  const updatedAtMs = Date.parse(record.updatedAt)
  const nowMs = Date.parse(now)

  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(nowMs) || nowMs <= updatedAtMs) {
    return roundMetric(record.timeDecayWeight)
  }

  const ageDays = Math.max(0, (nowMs - updatedAtMs) / 86_400_000)
  const halfLife = Math.max(1, record.decayHalfLifeDays)
  const retention = Math.pow(0.5, ageDays / halfLife)

  return roundMetric(clamp(record.timeDecayWeight * retention, 0.5, 1))
}

function deriveSampleStability(record: EconomicMemoryRecord) {
  if (record.minimumSampleCount <= 0) {
    return 1
  }

  return clamp(record.sampleCount / (record.minimumSampleCount * 2), 0, 1)
}

function deriveRevenueScore(record: EconomicMemoryRecord) {
  if (record.totalRevenue <= 0) {
    return 0
  }

  return clamp(Math.log10(record.totalRevenue + 1) / 4, 0, 1)
}

function deriveCenteredAdjustment(record: EconomicMemoryRecord, now: string) {
  const conversionBias = (record.averageConversion - 0.5) * 0.4
  const revenueBias = deriveRevenueScore(record) * 0.15
  const stability = deriveSampleStability(record)
  const decayFactor = deriveDecayFactor(record, now)

  return roundMetric((conversionBias + revenueBias) * stability * decayFactor)
}

function toAdaptiveWeightRecord(
  record: EconomicMemoryRecord,
  now: string,
): AdaptiveWeightRecord {
  const adjustment = deriveCenteredAdjustment(record, now)
  const weight = roundMetric(clamp(1 + adjustment, MIN_WEIGHT, MAX_WEIGHT))
  const decayFactor = deriveDecayFactor(record, now)

  return {
    weightId: buildWeightId(record),
    memoryId: record.memoryId,
    scope: record.memoryScope,
    category: record.category,
    signalKeyword: record.signalKeyword,
    entityId: record.entityId,
    weight,
    sampleCount: record.sampleCount,
    confidenceLevel: classifyConfidenceLevel(record),
    decayFactor,
    lastUpdated: record.updatedAt,
  }
}

function sortWeightRecords(records: AdaptiveWeightRecord[]) {
  return [...records].sort((left, right) => {
    if (left.weight !== right.weight) {
      return right.weight - left.weight
    }

    if (left.sampleCount !== right.sampleCount) {
      return right.sampleCount - left.sampleCount
    }

    return left.weightId.localeCompare(right.weightId)
  })
}

function buildEmptySnapshot(refreshIntervalMs: number): AdaptiveWeightSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    signalWeights: [],
    categoryWeights: [],
    entityWeights: [],
    metadata: {
      recordCount: 0,
      boundedMin: MIN_WEIGHT,
      boundedMax: MAX_WEIGHT,
      refreshIntervalMs,
      lastRefreshDurationMs: null,
      lastError: null,
    },
  }
}

export class AdaptiveWeightSnapshotRuntime {
  private readonly refreshIntervalMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<AdaptiveWeightSnapshot> | null = null
  private snapshot: AdaptiveWeightSnapshot
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private lastUpdatedAt: string | null = null

  constructor(private readonly dependencies: AdaptiveWeightSnapshotRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.snapshot = buildEmptySnapshot(this.refreshIntervalMs)
  }

  getSnapshot(now = new Date()): AdaptiveWeightSnapshotState {
    const ageMs = this.lastUpdatedAt
      ? Math.max(0, now.getTime() - Date.parse(this.lastUpdatedAt))
      : null

    return {
      snapshot: this.snapshot,
      freshness: {
        ready: this.lastUpdatedAt !== null,
        updatedAt: this.lastUpdatedAt,
        ageMs,
        refreshIntervalMs: this.refreshIntervalMs,
        lastRefreshDurationMs: this.lastRefreshDurationMs,
        refreshing: this.inFlightRefresh !== null,
        lastError: this.lastError,
      },
      runtimeState: {
        ready: this.lastUpdatedAt !== null,
        warming: this.lastUpdatedAt === null,
        error: this.lastError,
      },
    }
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true
    console.info('[adaptive-weights] runtime.start', {
      refreshIntervalMs: this.refreshIntervalMs,
    })

    try {
      await this.refresh()
    } catch (error) {
      console.warn('[adaptive-weights] snapshot.error', {
        message: error instanceof Error ? error.message : 'unknown_error',
        phase: 'startup',
      })
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[adaptive-weights] snapshot.error', {
          message: error instanceof Error ? error.message : 'unknown_error',
          phase: 'scheduled',
        })
      })
    }, this.refreshIntervalMs)
  }

  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }

    this.started = false
    this.inFlightRefresh = null
    console.info('[adaptive-weights] runtime.stop')
  }

  async refresh(now = new Date().toISOString()): Promise<AdaptiveWeightSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      console.info('[adaptive-weights] snapshot.refresh', {
        phase: 'start',
      })

      try {
        const [signalMemory, categoryMemory, entityMemory] = await Promise.all([
          this.dependencies.economicMemoryRepository.listEconomicMemoryByScope('signal'),
          this.dependencies.economicMemoryRepository.listEconomicMemoryByScope('category'),
          this.dependencies.economicMemoryRepository.listEconomicMemoryByScope('entity'),
        ])

        const signalWeights = sortWeightRecords(signalMemory.map((record) => toAdaptiveWeightRecord(record, now)))
        const categoryWeights = sortWeightRecords(categoryMemory.map((record) => toAdaptiveWeightRecord(record, now)))
        const entityWeights = sortWeightRecords(entityMemory.map((record) => toAdaptiveWeightRecord(record, now)))

        this.lastRefreshDurationMs = Date.now() - refreshStartedAt
        this.lastError = null
        this.snapshot = {
          generatedAt: now,
          signalWeights,
          categoryWeights,
          entityWeights,
          metadata: {
            recordCount: signalWeights.length + categoryWeights.length + entityWeights.length,
            boundedMin: MIN_WEIGHT,
            boundedMax: MAX_WEIGHT,
            refreshIntervalMs: this.refreshIntervalMs,
            lastRefreshDurationMs: this.lastRefreshDurationMs,
            lastError: null,
          },
        }
        this.lastUpdatedAt = now

        console.info('[adaptive-weights] snapshot.refresh', {
          phase: 'done',
          durationMs: this.lastRefreshDurationMs,
          signalWeightCount: signalWeights.length,
          categoryWeightCount: categoryWeights.length,
          entityWeightCount: entityWeights.length,
        })

        return this.snapshot
      } catch (error) {
        this.lastRefreshDurationMs = Date.now() - refreshStartedAt
        this.lastError = error instanceof Error ? error.message : 'Failed to refresh adaptive weight snapshot.'
        this.snapshot = {
          ...this.snapshot,
          generatedAt: now,
          metadata: {
            ...this.snapshot.metadata,
            refreshIntervalMs: this.refreshIntervalMs,
            lastRefreshDurationMs: this.lastRefreshDurationMs,
            lastError: this.lastError,
          },
        }

        console.warn('[adaptive-weights] snapshot.error', {
          durationMs: this.lastRefreshDurationMs,
          error: this.lastError,
        })
        throw error
      } finally {
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createAdaptiveWeightSnapshotRuntime(
  dependencies: AdaptiveWeightSnapshotRuntimeDependencies,
) {
  return new AdaptiveWeightSnapshotRuntime(dependencies)
}
