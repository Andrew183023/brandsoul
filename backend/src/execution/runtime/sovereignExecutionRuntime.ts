import { createSovereignExecutionEngine, type SovereignExecutionEngineRunResult } from '../sovereignExecutionEngine.js'
import type { SovereignExecutionRecord } from '../contracts/SovereignExecutionRecord.js'
import type { ExecutionRepository } from '../../persistence/executions/executionRepository.js'
import type { OpportunityGovernanceSnapshotStore } from '../../market-signals/opportunities/governance/runtime/opportunityGovernanceSnapshotStore.js'
import type { SovereignExecutionSnapshot } from './sovereignExecutionSnapshotStore.js'
import { SovereignExecutionSnapshotStore } from './sovereignExecutionSnapshotStore.js'

type SovereignExecutionRuntimeDependencies = {
  opportunityGovernanceSnapshotStore: OpportunityGovernanceSnapshotStore
  sovereignExecutionSnapshotStore: SovereignExecutionSnapshotStore
  executionRepository: ExecutionRepository
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function sortExecutions(executions: SovereignExecutionRecord[]) {
  return [...executions].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

function mergeExecutions(
  existingExecutions: SovereignExecutionRecord[],
  nextExecutions: SovereignExecutionRecord[],
) {
  const merged = new Map<string, SovereignExecutionRecord>()

  for (const execution of existingExecutions) {
    merged.set(execution.executionId, execution)
  }

  for (const execution of nextExecutions) {
    merged.set(execution.executionId, execution)
  }

  return sortExecutions(Array.from(merged.values()))
}

function buildMetrics(executions: SovereignExecutionRecord[]) {
  return executions.reduce((metrics, execution) => {
    metrics.executionCount += 1

    if (execution.executionStatus === 'completed') {
      metrics.successCount += 1
    }

    if (execution.executionStatus === 'failed') {
      metrics.failedCount += 1
    }

    metrics.revenueAttributed += execution.revenueAttributed ?? 0
    return metrics
  }, {
    executionCount: 0,
    successCount: 0,
    failedCount: 0,
    revenueAttributed: 0,
  })
}

function buildSnapshot(executions: SovereignExecutionRecord[], generatedAt: string): SovereignExecutionSnapshot {
  const rankedExecutions = sortExecutions(executions)

  return {
    status: 'ready',
    generatedAt,
    executions: rankedExecutions,
    metrics: buildMetrics(rankedExecutions),
  }
}

async function persistExecutions(
  repository: ExecutionRepository,
  executions: SovereignExecutionRecord[],
) {
  for (const execution of executions) {
    const persisted = await repository.upsertExecution(execution)
    console.info('execution.persisted', {
      executionId: persisted.executionId,
      proposalId: persisted.proposalId,
      entityId: persisted.entityId,
      actionType: persisted.actionType,
      executionStatus: persisted.executionStatus,
      generatedLeadId: persisted.generatedLeadId ?? null,
      revenueAttributed: persisted.revenueAttributed ?? null,
    })
  }
}

export class SovereignExecutionRuntime {
  private readonly refreshIntervalMs: number
  private readonly engine = createSovereignExecutionEngine()
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<SovereignExecutionSnapshot> | null = null

  constructor(private readonly dependencies: SovereignExecutionRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true

    try {
      await this.refresh()
    } catch (error) {
      this.started = false
      throw error
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[sovereign-execution] scheduled snapshot refresh failed', {
          message: error instanceof Error ? error.message : 'unknown_error',
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
  }

  async refresh(): Promise<SovereignExecutionSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      console.info('[sovereign-execution] snapshot refresh start')
      this.dependencies.sovereignExecutionSnapshotStore.setRefreshing(true)

      try {
        const governanceState = this.dependencies.opportunityGovernanceSnapshotStore.getSnapshot()
        const existingSnapshot = this.dependencies.sovereignExecutionSnapshotStore.getSnapshot().snapshot
        const nextExecutionResults = governanceState.snapshot.proposals
          .filter((proposal) => proposal.governanceStatus === 'approved')
          .map((proposal): SovereignExecutionEngineRunResult => this.engine.execute(proposal, {
            now: governanceState.snapshot.generatedAt,
            existingExecutions: existingSnapshot.executions,
          }))
        const nextExecutions = nextExecutionResults.map((result) => result.record)
        const executions = mergeExecutions(existingSnapshot.executions, nextExecutions)
        await persistExecutions(this.dependencies.executionRepository, executions)
        const generatedAt = new Date().toISOString()
        const snapshot = buildSnapshot(executions, generatedAt)
        const refreshCompletedAt = Date.now()

        this.dependencies.sovereignExecutionSnapshotStore.setSnapshot(snapshot, {
          refreshStartedAt,
          refreshCompletedAt,
          lastError: null,
        })

        console.info('[sovereign-execution] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          executionCount: snapshot.metrics.executionCount,
          successCount: snapshot.metrics.successCount,
          failedCount: snapshot.metrics.failedCount,
          revenueAttributed: snapshot.metrics.revenueAttributed,
        })

        return snapshot
      } catch (error) {
        const refreshCompletedAt = Date.now()
        const message = error instanceof Error ? error.message : 'Failed to refresh sovereign execution snapshot.'

        this.dependencies.sovereignExecutionSnapshotStore.setLastError(message)
        console.warn('[sovereign-execution] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          outcome: 'error',
          message,
        })

        throw error
      } finally {
        this.dependencies.sovereignExecutionSnapshotStore.setRefreshing(false)
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createSovereignExecutionRuntime(dependencies: SovereignExecutionRuntimeDependencies) {
  return new SovereignExecutionRuntime(dependencies)
}
