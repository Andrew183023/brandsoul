import type { EntityActionSuggestion } from '../contracts/EntityActionSuggestion.js'
import type { OpportunityLead } from '../contracts/OpportunityLead.js'

export type OpportunitySnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  opportunities: OpportunityLead[]
  suggestions: EntityActionSuggestion[]
  topOpportunity?: OpportunityLead
}

export type OpportunitySnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type OpportunitySnapshotState = {
  snapshot: OpportunitySnapshot
  freshness: OpportunitySnapshotFreshness
}

type SetOpportunitySnapshotOptions = {
  refreshStartedAt?: number
  refreshCompletedAt?: number
  lastError?: string | null
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function buildInitialSnapshot(): OpportunitySnapshot {
  return {
    status: 'warming',
    generatedAt: new Date().toISOString(),
    opportunities: [],
    suggestions: [],
  }
}

export class OpportunitySnapshotStore {
  private snapshot: OpportunitySnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private refreshing = false

  constructor(private readonly refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {}

  setRefreshing(refreshing: boolean) {
    this.refreshing = refreshing
  }

  setSnapshot(snapshot: OpportunitySnapshot, options: SetOpportunitySnapshotOptions = {}) {
    this.snapshot = snapshot
    this.lastUpdatedAt = snapshot.generatedAt
    this.lastError = options.lastError ?? null

    if (
      typeof options.refreshStartedAt === 'number' &&
      typeof options.refreshCompletedAt === 'number'
    ) {
      this.lastRefreshDurationMs = Math.max(0, options.refreshCompletedAt - options.refreshStartedAt)
    }
  }

  setLastError(errorMessage: string | null) {
    this.lastError = errorMessage
  }

  getSnapshot(now = new Date()): OpportunitySnapshotState {
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

export function createOpportunitySnapshotStore(refreshIntervalMs?: number) {
  return new OpportunitySnapshotStore(refreshIntervalMs)
}
