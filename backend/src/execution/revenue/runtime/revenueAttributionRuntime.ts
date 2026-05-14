import type { OpportunitySnapshotStore } from '../../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import type { OpportunityGovernanceSnapshotStore } from '../../../market-signals/opportunities/governance/runtime/opportunityGovernanceSnapshotStore.js'
import { toRevenueAttributionAggregate, type RevenueAttributionRepository } from '../../../persistence/revenue/revenueAttributionRepository.js'
import type { PortfolioLeadRevenueEventRepository } from '../../../repositories/portfolioLeadRevenueEventRepository.js'
import { createRevenueAttributionEngine, type RevenueAttributionRecord } from '../revenueAttributionEngine.js'
import type { SovereignExecutionRecord } from '../../contracts/SovereignExecutionRecord.js'
import type { SovereignExecutionSnapshotStore } from '../../runtime/sovereignExecutionSnapshotStore.js'
import type { RevenueAttributionSnapshot } from './revenueAttributionSnapshotStore.js'
import { RevenueAttributionSnapshotStore } from './revenueAttributionSnapshotStore.js'

type RevenueAttributionRuntimeDependencies = {
  opportunitySnapshotStore: OpportunitySnapshotStore
  opportunityGovernanceSnapshotStore: OpportunityGovernanceSnapshotStore
  sovereignExecutionSnapshotStore: SovereignExecutionSnapshotStore
  revenueEventRepository: PortfolioLeadRevenueEventRepository
  revenueAttributionRepository: RevenueAttributionRepository
  revenueAttributionSnapshotStore: RevenueAttributionSnapshotStore
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function sortAttributions(attributions: RevenueAttributionRecord[]) {
  return [...attributions].sort((left, right) => {
    const recognizedOrder = right.recognizedAt?.localeCompare(left.recognizedAt ?? '') ?? 0
    if (recognizedOrder !== 0) {
      return recognizedOrder
    }

    return right.attributionId.localeCompare(left.attributionId)
  })
}

function buildMetrics(attributions: RevenueAttributionRecord[], unresolvedRevenueEventCount: number) {
  return {
    attributionCount: attributions.length,
    attributedRevenue: attributions.reduce((sum, attribution) => sum + attribution.revenue, 0),
    unresolvedRevenueEventCount,
  }
}

function buildSnapshot(args: {
  attributions: RevenueAttributionRecord[]
  unresolvedRevenueEventCount: number
  generatedAt: string
  sourceSnapshotsReady: boolean
}): RevenueAttributionSnapshot {
  const rankedAttributions = sortAttributions(args.attributions)

  return {
    status: args.sourceSnapshotsReady ? 'ready' : 'warming',
    generatedAt: args.generatedAt,
    attributions: rankedAttributions,
    metrics: buildMetrics(rankedAttributions, args.unresolvedRevenueEventCount),
  }
}

function buildExecutionByProposalId(executions: SovereignExecutionRecord[]) {
  const executionByProposalId = new Map<string, SovereignExecutionRecord>()

  for (const execution of executions) {
    if (!execution.generatedLeadId) {
      continue
    }

    const existingExecution = executionByProposalId.get(execution.proposalId)
    if (!existingExecution || execution.startedAt > existingExecution.startedAt) {
      executionByProposalId.set(execution.proposalId, execution)
    }
  }

  return executionByProposalId
}

async function persistAttributions(
  repository: RevenueAttributionRepository,
  attributions: RevenueAttributionRecord[],
) {
  for (const attribution of attributions) {
    const persisted = await repository.persistAttribution(toRevenueAttributionAggregate(attribution))
    console.info('attribution.persisted', {
      attributionId: persisted.attributionId,
      marketSignalId: persisted.marketSignalId,
      opportunityId: persisted.opportunityId,
      proposalId: persisted.proposalId,
      executionId: persisted.executionId,
      leadId: persisted.leadId,
      revenueEventId: persisted.revenueEventId,
      attributedRevenue: persisted.attributedRevenue,
    })
  }
}

export class RevenueAttributionRuntime {
  private readonly refreshIntervalMs: number
  private readonly engine = createRevenueAttributionEngine()
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<RevenueAttributionSnapshot> | null = null

  constructor(private readonly dependencies: RevenueAttributionRuntimeDependencies) {
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
        console.warn('[revenue-attribution] scheduled snapshot refresh failed', {
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

  async refresh(): Promise<RevenueAttributionSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      console.info('[revenue-attribution] snapshot refresh start')
      this.dependencies.revenueAttributionSnapshotStore.setRefreshing(true)

      try {
        const opportunityState = this.dependencies.opportunitySnapshotStore.getSnapshot()
        const governanceState = this.dependencies.opportunityGovernanceSnapshotStore.getSnapshot()
        const executionState = this.dependencies.sovereignExecutionSnapshotStore.getSnapshot()
        const revenueEvents = await this.dependencies.revenueEventRepository.list(500)
        const opportunityById = new Map(
          opportunityState.snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity]),
        )
        const executionByProposalId = buildExecutionByProposalId(executionState.snapshot.executions)
        const attributions: RevenueAttributionRecord[] = []
        const matchedRevenueEventIds = new Set<string>()

        for (const proposal of governanceState.snapshot.proposals) {
          const execution = executionByProposalId.get(proposal.proposalId)
          if (!execution?.generatedLeadId) {
            continue
          }

          const opportunity = opportunityById.get(proposal.sourceOpportunityId)
          if (!opportunity) {
            continue
          }

          const revenueEvent = revenueEvents.find((event) => event.leadId === execution.generatedLeadId)
          if (!revenueEvent) {
            continue
          }

          const attributionResult = this.engine.attribute({
            marketSignalId: opportunity.sourceSignalId,
            opportunityId: opportunity.id,
            proposalId: proposal.proposalId,
            executionId: execution.executionId,
            generatedLeadId: execution.generatedLeadId,
            revenue: revenueEvent.amount,
            currency: revenueEvent.currency,
            recognizedAt: revenueEvent.reconciledAt,
            revenueEventId: revenueEvent.revenueEventId,
            invoiceId: revenueEvent.invoiceId,
            paymentId: revenueEvent.paymentId,
            contractId: revenueEvent.contractId,
            sourceSystem: revenueEvent.externalSystem,
          }, {
            now: revenueEvent.reconciledAt,
            existingAttributions: attributions,
          })

          attributions.push(attributionResult.record)
          matchedRevenueEventIds.add(revenueEvent.revenueEventId)
        }

        await persistAttributions(this.dependencies.revenueAttributionRepository, attributions)

        const generatedAt = new Date().toISOString()
        const snapshot = buildSnapshot({
          attributions,
          unresolvedRevenueEventCount: revenueEvents.length - matchedRevenueEventIds.size,
          generatedAt,
          sourceSnapshotsReady: opportunityState.freshness.ready
            && governanceState.freshness.ready
            && executionState.freshness.ready,
        })
        const refreshCompletedAt = Date.now()

        this.dependencies.revenueAttributionSnapshotStore.setSnapshot(snapshot, {
          refreshStartedAt,
          refreshCompletedAt,
          lastError: null,
        })

        console.info('[revenue-attribution] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          attributionCount: snapshot.metrics.attributionCount,
          attributedRevenue: snapshot.metrics.attributedRevenue,
          unresolvedRevenueEventCount: snapshot.metrics.unresolvedRevenueEventCount,
        })

        return snapshot
      } catch (error) {
        const refreshCompletedAt = Date.now()
        const message = error instanceof Error ? error.message : 'Failed to refresh revenue attribution snapshot.'

        this.dependencies.revenueAttributionSnapshotStore.setLastError(message)
        console.warn('[revenue-attribution] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          error: message,
        })
        throw error
      } finally {
        this.dependencies.revenueAttributionSnapshotStore.setRefreshing(false)
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createRevenueAttributionRuntime(dependencies: RevenueAttributionRuntimeDependencies) {
  return new RevenueAttributionRuntime(dependencies)
}
