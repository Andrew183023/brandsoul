import type { OpportunityExecutionProposal } from '../contracts/OpportunityExecutionProposal.js'

export type OpportunityGovernanceSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  proposals: OpportunityExecutionProposal[]
  topProposal?: OpportunityExecutionProposal
  metrics: {
    proposalCount: number
    approvedCount: number
    rejectedCount: number
    pendingCount: number
  }
}

export type OpportunityGovernanceSnapshotFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type OpportunityGovernanceSnapshotState = {
  snapshot: OpportunityGovernanceSnapshot
  freshness: OpportunityGovernanceSnapshotFreshness
}

type SetOpportunityGovernanceSnapshotOptions = {
  refreshStartedAt?: number
  refreshCompletedAt?: number
  lastError?: string | null
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function buildInitialSnapshot(): OpportunityGovernanceSnapshot {
  return {
    status: 'warming',
    generatedAt: new Date().toISOString(),
    proposals: [],
    metrics: {
      proposalCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
    },
  }
}

export class OpportunityGovernanceSnapshotStore {
  private snapshot: OpportunityGovernanceSnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private refreshing = false

  constructor(private readonly refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {}

  setRefreshing(refreshing: boolean) {
    this.refreshing = refreshing
  }

  setSnapshot(snapshot: OpportunityGovernanceSnapshot, options: SetOpportunityGovernanceSnapshotOptions = {}) {
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

  getSnapshot(now = new Date()): OpportunityGovernanceSnapshotState {
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

export function createOpportunityGovernanceSnapshotStore(refreshIntervalMs?: number) {
  return new OpportunityGovernanceSnapshotStore(refreshIntervalMs)
}
