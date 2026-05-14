import type { NegativeAttributionEvent } from '../NegativeAttributionEvent.js'

export type NegativeAttributionSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  attributions: NegativeAttributionEvent[]
  metrics: {
    attributionCount: number
    completeCount: number
    partialCount: number
    syntheticCount: number
    missingCount: number
  }
}

export type NegativeAttributionSnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type NegativeAttributionSnapshotState = {
  snapshot: NegativeAttributionSnapshot
  freshness: NegativeAttributionSnapshotFreshness
}

type SetNegativeAttributionSnapshotOptions = {
  refreshStartedAt?: number
  refreshCompletedAt?: number
  lastError?: string | null
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function buildInitialSnapshot(): NegativeAttributionSnapshot {
  return {
    status: 'warming',
    generatedAt: new Date().toISOString(),
    attributions: [],
    metrics: {
      attributionCount: 0,
      completeCount: 0,
      partialCount: 0,
      syntheticCount: 0,
      missingCount: 0,
    },
  }
}

export class NegativeAttributionSnapshotStore {
  private snapshot: NegativeAttributionSnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private refreshing = false

  constructor(private readonly refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {}

  setRefreshing(refreshing: boolean) {
    this.refreshing = refreshing
  }

  setSnapshot(snapshot: NegativeAttributionSnapshot, options: SetNegativeAttributionSnapshotOptions = {}) {
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

  getSnapshot(now = new Date()): NegativeAttributionSnapshotState {
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

export function createNegativeAttributionSnapshotStore(refreshIntervalMs?: number) {
  return new NegativeAttributionSnapshotStore(refreshIntervalMs)
}
