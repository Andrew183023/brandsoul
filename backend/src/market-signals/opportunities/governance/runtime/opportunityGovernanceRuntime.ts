import type { BackendDatabase } from '../../../../db/index.js'
import { FlowMindApprovalQueue, type FlowMindApprovalRecord } from '../../../../orchestrator/approvalQueue.js'
import { ProposalRepository, type OpportunityProposalAggregate } from '../../../../persistence/opportunities/proposalRepository.js'
import { hashFlowMindValue } from '../../../../orchestrator/flowMindHashing.js'
import { getInstitutionalSovereignMutationGate } from '../../../../sovereignty/institutionalSovereignMutationGate.js'
import { buildOpportunityExecutionProposals } from '../opportunityProposalEngine.js'
import type { OpportunityExecutionProposal } from '../contracts/OpportunityExecutionProposal.js'
import type { OpportunitySnapshotStore } from '../../runtime/opportunitySnapshotStore.js'
import type { OpportunityGovernanceSnapshot } from './opportunityGovernanceSnapshotStore.js'
import { OpportunityGovernanceSnapshotStore } from './opportunityGovernanceSnapshotStore.js'

type OpportunityGovernanceRuntimeDependencies = {
  connection: BackendDatabase
  opportunitySnapshotStore: OpportunitySnapshotStore
  opportunityGovernanceSnapshotStore: OpportunityGovernanceSnapshotStore
  proposalRepository: ProposalRepository
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000

function sortProposals(proposals: OpportunityExecutionProposal[]) {
  return [...proposals].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence
    }

    return right.createdAt.localeCompare(left.createdAt)
  })
}

function buildApprovalId(entityId: string, proposalId: string) {
  return `opportunity-approval-${entityId}-${proposalId}`.slice(0, 128)
}

function mergeProposals(
  existingProposals: OpportunityExecutionProposal[],
  nextProposals: OpportunityExecutionProposal[],
) {
  const merged = new Map<string, OpportunityExecutionProposal>()

  for (const proposal of existingProposals) {
    merged.set(proposal.proposalId, proposal)
  }

  for (const proposal of nextProposals) {
    merged.set(proposal.proposalId, proposal)
  }

  return sortProposals(Array.from(merged.values()))
}

function buildProposalMetrics(proposals: OpportunityExecutionProposal[]) {
  const approvedCount = proposals.filter((proposal) => proposal.governanceStatus === 'approved').length
  const rejectedCount = proposals.filter((proposal) => proposal.governanceStatus === 'rejected').length
  const pendingCount = proposals.filter((proposal) => proposal.governanceStatus === 'pending').length

  return {
    proposalCount: proposals.length,
    approvedCount,
    rejectedCount,
    pendingCount,
  }
}

function buildSnapshot(proposals: OpportunityExecutionProposal[], generatedAt: string): OpportunityGovernanceSnapshot {
  const rankedProposals = sortProposals(proposals)

  return {
    status: 'ready',
    generatedAt,
    proposals: rankedProposals,
    topProposal: rankedProposals[0],
    metrics: buildProposalMetrics(rankedProposals),
  }
}

function emitOpportunityProposalLog(args: {
  event: 'opportunity.proposal.created' | 'opportunity.proposal.approved' | 'opportunity.proposal.rejected'
  proposal: OpportunityExecutionProposal
  sourceSignalId: string
}) {
  console.info(args.event, {
    marketSignalId: args.sourceSignalId,
    opportunityId: args.proposal.sourceOpportunityId,
    proposalId: args.proposal.proposalId,
    entityId: args.proposal.entityId,
    actionType: args.proposal.actionType,
    confidence: args.proposal.confidence,
    governanceStatus: args.proposal.governanceStatus,
  })
}

function logProposalPersisted(proposal: OpportunityProposalAggregate) {
  console.info('proposal.persisted', {
    proposalId: proposal.proposalId,
    opportunityId: proposal.sourceOpportunityId,
    entityId: proposal.entityId,
    actionType: proposal.actionType,
    governanceStatus: proposal.governanceStatus,
    confidence: proposal.confidence,
  })
}

function logProposalStatusUpdated(proposal: OpportunityProposalAggregate) {
  console.info('proposal.status.updated', {
    proposalId: proposal.proposalId,
    opportunityId: proposal.sourceOpportunityId,
    entityId: proposal.entityId,
    governanceStatus: proposal.governanceStatus,
    approvedAt: proposal.approvedAt,
    rejectedAt: proposal.rejectedAt,
  })
}

export class OpportunityGovernanceRuntime {
  private readonly refreshIntervalMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<OpportunityGovernanceSnapshot> | null = null

  constructor(private readonly dependencies: OpportunityGovernanceRuntimeDependencies) {
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
        console.warn('[market-opportunity-governance] scheduled snapshot refresh failed', {
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

  async refresh(): Promise<OpportunityGovernanceSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      console.info('[market-opportunity-governance] snapshot refresh start')
      this.dependencies.opportunityGovernanceSnapshotStore.setRefreshing(true)

      try {
        const opportunityState = this.dependencies.opportunitySnapshotStore.getSnapshot()
        const existingSnapshot = this.dependencies.opportunityGovernanceSnapshotStore.getSnapshot().snapshot
        const newProposals = buildOpportunityExecutionProposals(
          opportunityState.snapshot,
          existingSnapshot.proposals,
        )
        const proposals = mergeProposals(existingSnapshot.proposals, newProposals)
        const synchronizedProposals = await this.syncApprovalQueue({
          proposals,
          opportunityStateSnapshot: opportunityState.snapshot,
          previousProposals: existingSnapshot.proposals,
        })
        const generatedAt = new Date().toISOString()
        const snapshot = buildSnapshot(synchronizedProposals, generatedAt)
        const refreshCompletedAt = Date.now()

        this.dependencies.opportunityGovernanceSnapshotStore.setSnapshot(snapshot, {
          refreshStartedAt,
          refreshCompletedAt,
          lastError: null,
        })

        console.info('[market-opportunity-governance] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          proposalCount: snapshot.metrics.proposalCount,
          approvedCount: snapshot.metrics.approvedCount,
          rejectedCount: snapshot.metrics.rejectedCount,
          pendingCount: snapshot.metrics.pendingCount,
          topProposal: snapshot.topProposal?.proposalId ?? null,
        })

        return snapshot
      } catch (error) {
        const refreshCompletedAt = Date.now()
        const message = error instanceof Error ? error.message : 'Failed to refresh opportunity governance snapshot.'

        this.dependencies.opportunityGovernanceSnapshotStore.setLastError(message)
        console.warn('[market-opportunity-governance] snapshot.refresh.durationMs', {
          durationMs: refreshCompletedAt - refreshStartedAt,
          outcome: 'error',
          message,
        })

        throw error
      } finally {
        this.dependencies.opportunityGovernanceSnapshotStore.setRefreshing(false)
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }

  private async syncApprovalQueue(args: {
    proposals: OpportunityExecutionProposal[]
    opportunityStateSnapshot: ReturnType<OpportunitySnapshotStore['getSnapshot']>['snapshot']
    previousProposals: OpportunityExecutionProposal[]
  }) {
    return getInstitutionalSovereignMutationGate().evaluateAndExecute({
      authoritySource: 'backend/src/market-signals/opportunities/governance/runtime/opportunityGovernanceRuntime.ts#syncApprovalQueue',
      context: {
        mutationType: 'opportunity.governance.sync_approval_queue',
        mutationScope: 'queue',
        requestedCapability: 'governance.approval',
        runtimeMode: 'normal',
        continuityMode: 'institutional_safe',
        replayVerificationState: 'verified',
        attestationIntegrity: 'verified',
        recoveryRequired: false,
        actor: 'runtime',
        traceId: `opportunity-governance-sync:${args.proposals.map((proposal) => proposal.proposalId).join(',')}`,
      },
      replayEquivalentResult: () => sortProposals(args.proposals),
      work: async () => this.dependencies.connection.transaction(async (tx) => {
        const approvalQueue = new FlowMindApprovalQueue(tx)
        const proposalRepository = new ProposalRepository(tx)
        const previousProposalById = new Map(
          args.previousProposals.map((proposal) => [proposal.proposalId, proposal]),
        )
        const synchronizedProposals: OpportunityExecutionProposal[] = []

        for (const proposal of args.proposals) {
          const sourceOpportunity = args.opportunityStateSnapshot.opportunities.find(
            (opportunity) => opportunity.id === proposal.sourceOpportunityId,
          )
          if (!sourceOpportunity) {
            continue
          }

          const persistedProposal = await proposalRepository.upsertProposal({
            proposalId: proposal.proposalId,
            sourceOpportunityId: proposal.sourceOpportunityId,
            entityId: proposal.entityId,
            entityName: proposal.entityName,
            actionType: proposal.actionType,
            confidence: proposal.confidence,
            reasoning: proposal.reasoning,
            governanceStatus: proposal.governanceStatus,
            createdAt: proposal.createdAt,
          })

          logProposalPersisted(persistedProposal)

          const payload = {
            source: 'market_opportunity',
            sourceOpportunity: {
              opportunityId: sourceOpportunity.id,
              sourceSignalId: sourceOpportunity.sourceSignalId,
              keyword: sourceOpportunity.keyword,
              detectedAt: sourceOpportunity.detectedAt,
              recommendedAction: sourceOpportunity.recommendedAction,
            },
            attribution: {
              entityId: proposal.entityId,
              entityName: proposal.entityName,
              actionType: proposal.actionType,
              proposalId: proposal.proposalId,
            },
            metadata: {
              economicRelevance: sourceOpportunity.economicRelevance,
              leadProbability: sourceOpportunity.leadProbability,
              marketCategory: sourceOpportunity.category,
              confidence: proposal.confidence,
            },
          }

          const existingApproval = await approvalQueue.getByProposal(
            proposal.entityId,
            proposal.proposalId,
            proposal.actionType,
          )

          let approval: FlowMindApprovalRecord
          if (!existingApproval) {
            approval = await approvalQueue.enqueue({
              approvalId: buildApprovalId(proposal.entityId, proposal.proposalId),
              entityId: proposal.entityId,
              proposalId: proposal.proposalId,
              actionType: proposal.actionType,
              rationale: proposal.reasoning,
              payload,
              proposalHash: hashFlowMindValue(proposal),
              payloadHash: hashFlowMindValue({
                marketSignalId: sourceOpportunity.sourceSignalId,
                sourceOpportunityId: sourceOpportunity.id,
                entityId: proposal.entityId,
                proposalId: proposal.proposalId,
                actionType: proposal.actionType,
                economicRelevance: sourceOpportunity.economicRelevance,
                leadProbability: sourceOpportunity.leadProbability,
                marketCategory: sourceOpportunity.category,
              }),
              riskLevel: sourceOpportunity.economicRelevance >= 85 ? 'high' : 'medium',
              requestedAt: proposal.createdAt,
            })

            emitOpportunityProposalLog({
              event: 'opportunity.proposal.created',
              proposal,
              sourceSignalId: sourceOpportunity.sourceSignalId,
            })
          } else {
            approval = existingApproval
          }

          const synchronizedProposal: OpportunityExecutionProposal = {
            ...proposal,
            governanceStatus: approval.status === 'approved' || approval.status === 'rejected'
              ? approval.status
              : 'pending',
          }

          if (
            synchronizedProposal.governanceStatus === 'approved' ||
            synchronizedProposal.governanceStatus === 'rejected'
          ) {
            const statusUpdate = await proposalRepository.updateGovernanceStatus({
              proposalId: synchronizedProposal.proposalId,
              governanceStatus: synchronizedProposal.governanceStatus,
              changedAt: approval.resolvedAt ?? approval.updatedAt,
            })

            if (statusUpdate.changed && statusUpdate.record) {
              logProposalStatusUpdated(statusUpdate.record)
            }
          }

          const previousProposal = previousProposalById.get(proposal.proposalId)
          if (previousProposal?.governanceStatus !== synchronizedProposal.governanceStatus) {
            if (synchronizedProposal.governanceStatus === 'approved') {
              emitOpportunityProposalLog({
                event: 'opportunity.proposal.approved',
                proposal: synchronizedProposal,
                sourceSignalId: sourceOpportunity.sourceSignalId,
              })
            }

            if (synchronizedProposal.governanceStatus === 'rejected') {
              emitOpportunityProposalLog({
                event: 'opportunity.proposal.rejected',
                proposal: synchronizedProposal,
                sourceSignalId: sourceOpportunity.sourceSignalId,
              })
            }
          }

          synchronizedProposals.push(synchronizedProposal)
        }

        return synchronizedProposals
      }),
    })
  }
}

export function createOpportunityGovernanceRuntime(dependencies: OpportunityGovernanceRuntimeDependencies) {
  return new OpportunityGovernanceRuntime(dependencies)
}
