import type { SovereignExecutionRecord } from '../../execution/contracts/SovereignExecutionRecord.js'
import type { SovereignExecutionSnapshotStore } from '../../execution/runtime/sovereignExecutionSnapshotStore.js'
import type { OpportunityExecutionProposal } from '../../market-signals/opportunities/governance/contracts/OpportunityExecutionProposal.js'
import type { OpportunityGovernanceSnapshotStore } from '../../market-signals/opportunities/governance/runtime/opportunityGovernanceSnapshotStore.js'
import type { OpportunityLead } from '../../market-signals/opportunities/contracts/OpportunityLead.js'
import type { OpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import { getInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { NegativeOutcomeRepository } from '../persistence/negativeOutcomeRepository.js'
import type { AppendNegativeEconomicOutcomeInput } from '../negative-outcomes/NegativeEconomicOutcome.js'

type TerminalFailureDetectionRuntimeDependencies = {
  opportunitySnapshotStore: OpportunitySnapshotStore
  opportunityGovernanceSnapshotStore: OpportunityGovernanceSnapshotStore
  sovereignExecutionSnapshotStore: SovereignExecutionSnapshotStore
  negativeOutcomeRepository: NegativeOutcomeRepository
  refreshIntervalMs?: number
  opportunityTimeoutMs?: number
  proposalTimeoutMs?: number
  executionTimeoutMs?: number
  noResponseTimeoutMs?: number
}

export type TerminalFailureDetectionRuntimeStatus = {
  runtimeName: string
  started: boolean
  refreshing: boolean
  ready: boolean
  warming: boolean
  error: boolean
  refreshIntervalMs: number
  opportunityTimeoutMs: number
  proposalTimeoutMs: number
  executionTimeoutMs: number
  noResponseTimeoutMs: number
  lastRunAt: string | null
  lastRefreshStartedAt: string | null
  lastRefreshCompletedAt: string | null
  lastRefreshDurationMs: number | null
  lastError: string | null
  lastDetectedOutcomeCount: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const DEFAULT_OPPORTUNITY_TIMEOUT_MS = 24 * 60 * 60 * 1_000
const DEFAULT_PROPOSAL_TIMEOUT_MS = 12 * 60 * 60 * 1_000
const DEFAULT_EXECUTION_TIMEOUT_MS = 6 * 60 * 60 * 1_000
const DEFAULT_NO_RESPONSE_TIMEOUT_MS = 48 * 60 * 60 * 1_000
const TERMINAL_FAILURE_RUNTIME_NAME = 'terminal-failure-detection-runtime'

type RuntimeState = 'warming' | 'ready' | 'error'

function isExpired(nowMs: number, targetIsoAt: string) {
  const targetMs = Date.parse(targetIsoAt)
  if (Number.isNaN(targetMs)) {
    return false
  }

  return nowMs >= targetMs
}

function addMilliseconds(isoAt: string, durationMs: number) {
  const parsedAt = Date.parse(isoAt)
  if (Number.isNaN(parsedAt)) {
    return isoAt
  }

  return new Date(parsedAt + durationMs).toISOString()
}

function toMetadataRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined),
  )
}

function buildStaleOpportunityOutcome(
  opportunity: OpportunityLead,
  opportunityTimeoutMs: number,
): AppendNegativeEconomicOutcomeInput {
  const detectedAt = addMilliseconds(opportunity.detectedAt, opportunityTimeoutMs)

  return {
    outcomeType: 'opportunity_expired',
    entityId: 'unassigned',
    marketSignalId: opportunity.sourceSignalId,
    opportunityId: opportunity.id,
    proposalId: 'none',
    executionId: 'none',
    category: opportunity.category,
    signalKeyword: opportunity.keyword,
    detectedAt,
    reason: `Opportunity exceeded timeout window of ${opportunityTimeoutMs}ms without progressing to an active governed path.`,
    metadata: toMetadataRecord({
      source: 'opportunity',
      timeoutMs: opportunityTimeoutMs,
      recommendedAction: opportunity.recommendedAction,
      leadProbability: opportunity.leadProbability,
      economicRelevance: opportunity.economicRelevance,
    }),
  }
}

function buildRejectedProposalOutcome(
  proposal: OpportunityExecutionProposal,
  opportunity: OpportunityLead | null,
): AppendNegativeEconomicOutcomeInput {
  return {
    outcomeType: 'proposal_rejected',
    entityId: proposal.entityId,
    marketSignalId: opportunity?.sourceSignalId ?? 'unknown-signal',
    opportunityId: proposal.sourceOpportunityId,
    proposalId: proposal.proposalId,
    executionId: 'none',
    category: opportunity?.category ?? 'general',
    signalKeyword: opportunity?.keyword ?? proposal.entityName,
    detectedAt: proposal.createdAt,
    reason: 'Governance rejected the proposal before execution.',
    metadata: toMetadataRecord({
      source: 'proposal',
      actionType: proposal.actionType,
      confidence: proposal.confidence,
      governanceStatus: proposal.governanceStatus,
    }),
  }
}

function buildTimedOutProposalOutcome(
  proposal: OpportunityExecutionProposal,
  opportunity: OpportunityLead | null,
  proposalTimeoutMs: number,
): AppendNegativeEconomicOutcomeInput {
  const detectedAt = addMilliseconds(proposal.createdAt, proposalTimeoutMs)

  return {
    outcomeType: 'no_response_timeout',
    entityId: proposal.entityId,
    marketSignalId: opportunity?.sourceSignalId ?? 'unknown-signal',
    opportunityId: proposal.sourceOpportunityId,
    proposalId: proposal.proposalId,
    executionId: 'none',
    category: opportunity?.category ?? 'general',
    signalKeyword: opportunity?.keyword ?? proposal.entityName,
    detectedAt,
    reason: `Proposal remained pending beyond ${proposalTimeoutMs}ms without governance resolution.`,
    metadata: toMetadataRecord({
      source: 'proposal',
      actionType: proposal.actionType,
      timeoutMs: proposalTimeoutMs,
      confidence: proposal.confidence,
      governanceStatus: proposal.governanceStatus,
    }),
  }
}

function buildAbandonedExecutionOutcome(
  execution: SovereignExecutionRecord,
  proposal: OpportunityExecutionProposal | null,
  opportunity: OpportunityLead | null,
  executionTimeoutMs: number,
): AppendNegativeEconomicOutcomeInput {
  const detectedAt = addMilliseconds(execution.startedAt, executionTimeoutMs)

  return {
    outcomeType: 'abandoned_execution',
    entityId: execution.entityId,
    marketSignalId: opportunity?.sourceSignalId ?? 'unknown-signal',
    opportunityId: proposal?.sourceOpportunityId ?? 'unknown-opportunity',
    proposalId: execution.proposalId,
    executionId: execution.executionId,
    category: opportunity?.category ?? 'general',
    signalKeyword: opportunity?.keyword ?? execution.actionType,
    detectedAt,
    reason: `Execution remained ${execution.executionStatus} beyond ${executionTimeoutMs}ms.`,
    metadata: toMetadataRecord({
      source: 'execution',
      actionType: execution.actionType,
      timeoutMs: executionTimeoutMs,
      executionStatus: execution.executionStatus,
      startedAt: execution.startedAt,
    }),
  }
}

function buildFailedExecutionOutcome(
  execution: SovereignExecutionRecord,
  proposal: OpportunityExecutionProposal | null,
  opportunity: OpportunityLead | null,
): AppendNegativeEconomicOutcomeInput {
  return {
    outcomeType: 'failed_execution',
    entityId: execution.entityId,
    marketSignalId: opportunity?.sourceSignalId ?? 'unknown-signal',
    opportunityId: proposal?.sourceOpportunityId ?? 'unknown-opportunity',
    proposalId: execution.proposalId,
    executionId: execution.executionId,
    category: opportunity?.category ?? 'general',
    signalKeyword: opportunity?.keyword ?? execution.actionType,
    detectedAt: execution.completedAt ?? execution.startedAt,
    reason: execution.resultSummary?.trim() || 'Execution failed before producing a successful outcome.',
    metadata: toMetadataRecord({
      source: 'execution',
      actionType: execution.actionType,
      executionStatus: execution.executionStatus,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
    }),
  }
}

function buildTerminalNoConversionOutcome(
  execution: SovereignExecutionRecord,
  proposal: OpportunityExecutionProposal | null,
  opportunity: OpportunityLead | null,
  noResponseTimeoutMs: number,
): AppendNegativeEconomicOutcomeInput {
  const referenceAt = execution.completedAt ?? execution.startedAt
  const detectedAt = addMilliseconds(referenceAt, noResponseTimeoutMs)

  return {
    outcomeType: 'terminal_no_conversion',
    entityId: execution.entityId,
    marketSignalId: opportunity?.sourceSignalId ?? 'unknown-signal',
    opportunityId: proposal?.sourceOpportunityId ?? 'unknown-opportunity',
    proposalId: execution.proposalId,
    executionId: execution.executionId,
    category: opportunity?.category ?? 'general',
    signalKeyword: opportunity?.keyword ?? execution.actionType,
    detectedAt,
    reason: `Execution completed without lead conversion or attributed revenue after ${noResponseTimeoutMs}ms.`,
    metadata: toMetadataRecord({
      source: 'execution',
      actionType: execution.actionType,
      timeoutMs: noResponseTimeoutMs,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      generatedLeadId: execution.generatedLeadId,
      revenueAttributed: execution.revenueAttributed ?? 0,
    }),
  }
}

export class TerminalFailureDetectionRuntime {
  private readonly refreshIntervalMs: number
  private readonly opportunityTimeoutMs: number
  private readonly proposalTimeoutMs: number
  private readonly executionTimeoutMs: number
  private readonly noResponseTimeoutMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<void> | null = null
  private lastRefreshStartedAt: string | null = null
  private lastRefreshCompletedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private lastDetectedOutcomeCount = 0
  private runtimeState: RuntimeState = 'warming'

  constructor(private readonly dependencies: TerminalFailureDetectionRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.opportunityTimeoutMs = dependencies.opportunityTimeoutMs ?? DEFAULT_OPPORTUNITY_TIMEOUT_MS
    this.proposalTimeoutMs = dependencies.proposalTimeoutMs ?? DEFAULT_PROPOSAL_TIMEOUT_MS
    this.executionTimeoutMs = dependencies.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS
    this.noResponseTimeoutMs = dependencies.noResponseTimeoutMs ?? DEFAULT_NO_RESPONSE_TIMEOUT_MS
  }

  getStatus(): TerminalFailureDetectionRuntimeStatus {
    return {
      runtimeName: TERMINAL_FAILURE_RUNTIME_NAME,
      started: this.started,
      refreshing: this.inFlightRefresh !== null,
      ready: this.runtimeState === 'ready',
      warming: this.runtimeState === 'warming',
      error: this.runtimeState === 'error',
      refreshIntervalMs: this.refreshIntervalMs,
      opportunityTimeoutMs: this.opportunityTimeoutMs,
      proposalTimeoutMs: this.proposalTimeoutMs,
      executionTimeoutMs: this.executionTimeoutMs,
      noResponseTimeoutMs: this.noResponseTimeoutMs,
      lastRunAt: this.lastRefreshCompletedAt,
      lastRefreshStartedAt: this.lastRefreshStartedAt,
      lastRefreshCompletedAt: this.lastRefreshCompletedAt,
      lastRefreshDurationMs: this.lastRefreshDurationMs,
      lastError: this.lastError,
      lastDetectedOutcomeCount: this.lastDetectedOutcomeCount,
    }
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true
    this.runtimeState = 'warming'
    console.info('[negative-outcomes] runtime.start', {
      runtimeName: TERMINAL_FAILURE_RUNTIME_NAME,
      refreshIntervalMs: this.refreshIntervalMs,
    })

    try {
      await this.refresh()
    } catch (error) {
      console.warn('[negative-outcomes] runtime.error', {
        phase: 'initial_refresh',
        message: error instanceof Error ? error.message : 'unknown_error',
      })
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[negative-outcomes] runtime.error', {
          phase: 'scheduled_refresh',
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

  async refresh(): Promise<void> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      const now = new Date(refreshStartedAt)
      this.lastRefreshStartedAt = now.toISOString()
      console.info('[negative-outcomes] detection.run', {
        runtimeName: TERMINAL_FAILURE_RUNTIME_NAME,
        startedAt: this.lastRefreshStartedAt,
      })

      try {
        const opportunityState = this.dependencies.opportunitySnapshotStore.getSnapshot(now)
        const governanceState = this.dependencies.opportunityGovernanceSnapshotStore.getSnapshot(now)
        const executionState = this.dependencies.sovereignExecutionSnapshotStore.getSnapshot(now)

        if (
          !opportunityState.freshness.ready
          && !governanceState.freshness.ready
          && !executionState.freshness.ready
        ) {
          this.lastDetectedOutcomeCount = 0
          this.lastRefreshDurationMs = Date.now() - refreshStartedAt
          this.lastRefreshCompletedAt = new Date().toISOString()
          this.lastError = null
          this.runtimeState = 'warming'
          return
        }

        const opportunityById = new Map(
          opportunityState.snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity] as const),
        )
        const proposalById = new Map(
          governanceState.snapshot.proposals.map((proposal) => [proposal.proposalId, proposal] as const),
        )
        const detectedOutcomes: AppendNegativeEconomicOutcomeInput[] = []

        for (const opportunity of opportunityState.snapshot.opportunities) {
          const hasProposal = governanceState.snapshot.proposals.some(
            (proposal) => proposal.sourceOpportunityId === opportunity.id,
          )

          if (!hasProposal && isExpired(refreshStartedAt, addMilliseconds(opportunity.detectedAt, this.opportunityTimeoutMs))) {
            detectedOutcomes.push(buildStaleOpportunityOutcome(opportunity, this.opportunityTimeoutMs))
          }
        }

        for (const proposal of governanceState.snapshot.proposals) {
          const opportunity = opportunityById.get(proposal.sourceOpportunityId) ?? null

          if (proposal.governanceStatus === 'rejected') {
            detectedOutcomes.push(buildRejectedProposalOutcome(proposal, opportunity))
            continue
          }

          if (
            proposal.governanceStatus === 'pending'
            && isExpired(refreshStartedAt, addMilliseconds(proposal.createdAt, this.proposalTimeoutMs))
          ) {
            detectedOutcomes.push(buildTimedOutProposalOutcome(proposal, opportunity, this.proposalTimeoutMs))
          }
        }

        for (const execution of executionState.snapshot.executions) {
          const proposal = proposalById.get(execution.proposalId) ?? null
          const opportunity = proposal ? opportunityById.get(proposal.sourceOpportunityId) ?? null : null

          if (
            (execution.executionStatus === 'pending' || execution.executionStatus === 'running')
            && isExpired(refreshStartedAt, addMilliseconds(execution.startedAt, this.executionTimeoutMs))
          ) {
            detectedOutcomes.push(buildAbandonedExecutionOutcome(
              execution,
              proposal,
              opportunity,
              this.executionTimeoutMs,
            ))
            continue
          }

          if (execution.executionStatus === 'failed') {
            detectedOutcomes.push(buildFailedExecutionOutcome(execution, proposal, opportunity))
            continue
          }

          if (execution.executionStatus === 'completed') {
            const hasRevenue = (execution.revenueAttributed ?? 0) > 0
            const hasLead = typeof execution.generatedLeadId === 'string' && execution.generatedLeadId.trim().length > 0

            if (
              !hasRevenue
              && !hasLead
              && isExpired(refreshStartedAt, addMilliseconds(execution.completedAt ?? execution.startedAt, this.noResponseTimeoutMs))
            ) {
              detectedOutcomes.push(buildTerminalNoConversionOutcome(
                execution,
                proposal,
                opportunity,
                this.noResponseTimeoutMs,
              ))
            }
          }
        }

        let detectedCount = 0
        for (const outcome of detectedOutcomes) {
          const record = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
            authoritySource: 'backend/src/learning/runtime/terminalFailureDetectionRuntime.ts#refresh',
            context: {
              mutationType: 'negative.outcome.append',
              mutationScope: 'runtime',
              requestedCapability: 'adaptive.runtime.mutation',
              runtimeMode: 'normal',
              continuityMode: 'institutional_safe',
              replayVerificationState: 'verified',
              attestationIntegrity: 'verified',
              recoveryRequired: false,
              actor: 'runtime',
              traceId: outcome.outcomeId ?? `negative-outcome:${outcome.entityId}:${outcome.outcomeType}`,
            },
            work: async () => this.dependencies.negativeOutcomeRepository.appendNegativeOutcome(outcome),
          })
          detectedCount += 1
          console.info('[negative-outcomes] outcome.detected', {
            outcomeId: record.outcomeId,
            outcomeType: record.outcomeType,
            entityId: record.entityId,
            opportunityId: record.opportunityId,
            proposalId: record.proposalId,
            executionId: record.executionId,
          })
        }

        this.lastDetectedOutcomeCount = detectedCount
        this.lastRefreshDurationMs = Date.now() - refreshStartedAt
        this.lastRefreshCompletedAt = new Date().toISOString()
        this.lastError = null
        this.runtimeState = 'ready'

        if (detectedCount === 0) {
          console.info('[negative-outcomes] detection.run', {
            runtimeName: TERMINAL_FAILURE_RUNTIME_NAME,
            outcome: 'empty',
            detectedCount,
            durationMs: this.lastRefreshDurationMs,
          })
        }
      } catch (error) {
        this.lastRefreshDurationMs = Date.now() - refreshStartedAt
        this.lastRefreshCompletedAt = new Date().toISOString()
        this.lastError = error instanceof Error ? error.message : 'unknown_error'
        this.runtimeState = 'error'
        console.warn('[negative-outcomes] runtime.error', {
          runtimeName: TERMINAL_FAILURE_RUNTIME_NAME,
          durationMs: this.lastRefreshDurationMs,
          message: this.lastError,
        })
        throw error
      } finally {
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createTerminalFailureDetectionRuntime(
  dependencies: TerminalFailureDetectionRuntimeDependencies,
) {
  return new TerminalFailureDetectionRuntime(dependencies)
}
