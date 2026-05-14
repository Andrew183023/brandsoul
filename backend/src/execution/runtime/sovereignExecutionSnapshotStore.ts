import type { SovereignExecutionRecord } from '../contracts/SovereignExecutionRecord.js'

export type SovereignExecutionSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  executions: SovereignExecutionRecord[]
  metrics: {
    executionCount: number
    successCount: number
    failedCount: number
    revenueAttributed: number
  }
}

export type SovereignExecutionSnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type SovereignExecutionSnapshotState = {
  snapshot: SovereignExecutionSnapshot
  freshness: SovereignExecutionSnapshotFreshness
}

type SetSovereignExecutionSnapshotOptions = {
  refreshStartedAt?: number
  refreshCompletedAt?: number
  lastError?: string | null
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function buildInitialSnapshot(): SovereignExecutionSnapshot {
  return {
    status: 'warming',
    generatedAt: new Date().toISOString(),
    executions: [],
    metrics: {
      executionCount: 0,
      successCount: 0,
      failedCount: 0,
      revenueAttributed: 0,
    },
  }
}

export class SovereignExecutionSnapshotStore {
  private snapshot: SovereignExecutionSnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private refreshing = false

  constructor(private readonly refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {}

  setRefreshing(refreshing: boolean) {
    this.refreshing = refreshing
  }

  setSnapshot(snapshot: SovereignExecutionSnapshot, options: SetSovereignExecutionSnapshotOptions = {}) {
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

  getSnapshot(now = new Date()): SovereignExecutionSnapshotState {
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

export function createSovereignExecutionSnapshotStore(refreshIntervalMs?: number) {
  return new SovereignExecutionSnapshotStore(refreshIntervalMs)
}
