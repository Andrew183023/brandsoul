import type { RevenueAttributionRecord } from '../revenueAttributionEngine.js'

export type RevenueAttributionSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  attributions: RevenueAttributionRecord[]
  metrics: {
    attributionCount: number
    attributedRevenue: number
    unresolvedRevenueEventCount: number
  }
}

export type RevenueAttributionSnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type RevenueAttributionSnapshotState = {
  snapshot: RevenueAttributionSnapshot
  freshness: RevenueAttributionSnapshotFreshness
}

type SetRevenueAttributionSnapshotOptions = {
  refreshStartedAt?: number
  refreshCompletedAt?: number
  lastError?: string | null
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function buildInitialSnapshot(): RevenueAttributionSnapshot {
  return {
    status: 'warming',
    generatedAt: new Date().toISOString(),
    attributions: [],
    metrics: {
      attributionCount: 0,
      attributedRevenue: 0,
      unresolvedRevenueEventCount: 0,
    },
  }
}

export class RevenueAttributionSnapshotStore {
  private snapshot: RevenueAttributionSnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private refreshing = false

  constructor(private readonly refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {}

  setRefreshing(refreshing: boolean) {
    this.refreshing = refreshing
  }

  setSnapshot(snapshot: RevenueAttributionSnapshot, options: SetRevenueAttributionSnapshotOptions = {}) {
    this.snapshot = snapshot
    this.lastUpdatedAt = snapshot.generatedAt
    this.lastError = options.lastError ?? null

    if (
      typeof options.refreshStartedAt === 'number'
      && typeof options.refreshCompletedAt === 'number'
    ) {
      this.lastRefreshDurationMs = Math.max(0, options.refreshCompletedAt - options.refreshStartedAt)
    }
  }

  setLastError(errorMessage: string | null) {
    this.lastError = errorMessage
  }

  getSnapshot(now = new Date()): RevenueAttributionSnapshotState {
    const ageMs = this.lastUpdatedAt
      ? Math.max(0, now.getTime() - Date.parse(this.lastUpdatedAt))
      : null

    return {
      snapshot: this.snapshot,
      freshness: {
        ready: this.snapshot.status === 'ready',
        updatedAt: this.lastUpdatedAt,
        ageMs,
        refreshIntervalMs: this.refreshIntervalMs,
        lastRefreshDurationMs: this.lastRefreshDurationMs,
        refreshing: this.refreshing,
        lastError: this.lastError,
      },
    }
  }
}

export function createRevenueAttributionSnapshotStore(refreshIntervalMs?: number) {
  return new RevenueAttributionSnapshotStore(refreshIntervalMs)
}