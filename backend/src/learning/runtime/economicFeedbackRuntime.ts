import type { RevenueAttributionSnapshotStore } from '../../execution/revenue/runtime/revenueAttributionSnapshotStore.js'
import type { SovereignExecutionSnapshotStore } from '../../execution/runtime/sovereignExecutionSnapshotStore.js'
import type { OpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import { EconomicMemoryRepository } from '../../persistence/economic/economicMemoryRepository.js'
import { getInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { buildSemanticFingerprint, getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'
import { NegativeOutcomeRepository } from '../persistence/negativeOutcomeRepository.js'
import { LearningCheckpointRepository } from '../persistence/learningCheckpointRepository.js'
import { buildLearningLedgerEventId, type LearningOutcomeType } from '../persistence/LearningLedgerEvent.js'
import { LearningLedgerRepository } from '../persistence/learningLedgerRepository.js'
import type { NegativeEconomicOutcome } from '../negative-outcomes/NegativeEconomicOutcome.js'
import type { NegativeEconomicOutcomeType } from '../negative-outcomes/negativeOutcomeTypes.js'

type EconomicFeedbackRuntimeDependencies = {
  revenueAttributionSnapshotStore: RevenueAttributionSnapshotStore
  opportunitySnapshotStore: OpportunitySnapshotStore
  sovereignExecutionSnapshotStore: SovereignExecutionSnapshotStore
  negativeOutcomeRepository: NegativeOutcomeRepository
  learningLedgerRepository: LearningLedgerRepository
  economicMemoryRepository: EconomicMemoryRepository
  learningCheckpointRepository: LearningCheckpointRepository
  refreshIntervalMs?: number
}

type AttributionWatermark = {
  attributedAt: string
  attributionId: string
}

export type EconomicFeedbackRuntimeStatus = {
  runtimeName: string
  started: boolean
  refreshing: boolean
  refreshIntervalMs: number
  lastProcessedAttributionWatermark: AttributionWatermark | null
  lastDurableAttributionWatermark: AttributionWatermark | null
  lastProcessedNegativeOutcomeWatermark: AttributionWatermark | null
  lastDurableNegativeOutcomeWatermark: AttributionWatermark | null
  lastDurableLearningEventId: string | null
  replayLag: number
  negativeProcessedCount: number
  negativePendingCount: number
  negativeReplayLag: number
  lastRefreshStartedAt: string | null
  lastRefreshCompletedAt: string | null
  lastRefreshDurationMs: number | null
  lastError: string | null
  lastProcessedAttributionCount: number
  lastAppendedEventCount: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const ECONOMIC_FEEDBACK_RUNTIME_NAME = 'economic-feedback-runtime'
const ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME = 'economic-feedback-negative-outcome-runtime'
const NEGATIVE_OUTCOME_SCAN_LIMIT = 2_147_483_647

function compareWatermark(
  left: AttributionWatermark,
  right: AttributionWatermark,
) {
  const attributedAtOrder = left.attributedAt.localeCompare(right.attributedAt)
  if (attributedAtOrder !== 0) {
    return attributedAtOrder
  }

  return left.attributionId.localeCompare(right.attributionId)
}

function isAfterWatermark(
  watermark: AttributionWatermark | null,
  candidate: AttributionWatermark,
) {
  if (!watermark) {
    return true
  }

  return compareWatermark(candidate, watermark) > 0
}

function classifyOutcomeTypes(attributedRevenue: number): LearningOutcomeType[] {
  if (attributedRevenue > 0) {
    return ['revenue_positive', 'conversion_positive']
  }

  return ['revenue_negative', 'conversion_negative']
}

function classifyNegativeOutcomeTypes(outcomeType: NegativeEconomicOutcomeType): LearningOutcomeType[] {
  switch (outcomeType) {
    case 'proposal_rejected':
      return ['conversion_negative']
    case 'terminal_no_conversion':
    case 'abandoned_execution':
    case 'opportunity_expired':
    case 'no_response_timeout':
    case 'failed_execution':
      return ['revenue_negative', 'conversion_negative']
    default:
      return ['conversion_negative']
  }
}

function buildNegativeOutcomeAttributionId(outcome: NegativeEconomicOutcome) {
  return `negative-outcome:${outcome.outcomeId}`
}

export class EconomicFeedbackRuntime {
  private readonly refreshIntervalMs: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<void> | null = null
  private lastProcessedAttributionWatermark: AttributionWatermark | null = null
  private lastProcessedNegativeOutcomeWatermark: AttributionWatermark | null = null
  private lastRefreshStartedAt: string | null = null
  private lastRefreshCompletedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private lastProcessedAttributionCount = 0
  private lastAppendedEventCount = 0
  private lastDurableLearningEventId: string | null = null
  private replayLag = 0
  private negativeProcessedCount = 0
  private negativePendingCount = 0
  private negativeReplayLag = 0

  constructor(private readonly dependencies: EconomicFeedbackRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
  }

  getLastProcessedAttributionWatermark() {
    return this.lastProcessedAttributionWatermark
  }

  getStatus(): EconomicFeedbackRuntimeStatus {
    return {
      runtimeName: ECONOMIC_FEEDBACK_RUNTIME_NAME,
      started: this.started,
      refreshing: this.inFlightRefresh !== null,
      refreshIntervalMs: this.refreshIntervalMs,
      lastProcessedAttributionWatermark: this.lastProcessedAttributionWatermark,
      lastDurableAttributionWatermark: this.lastProcessedAttributionWatermark,
      lastProcessedNegativeOutcomeWatermark: this.lastProcessedNegativeOutcomeWatermark,
      lastDurableNegativeOutcomeWatermark: this.lastProcessedNegativeOutcomeWatermark,
      lastDurableLearningEventId: this.lastDurableLearningEventId,
      replayLag: this.replayLag,
      negativeProcessedCount: this.negativeProcessedCount,
      negativePendingCount: this.negativePendingCount,
      negativeReplayLag: this.negativeReplayLag,
      lastRefreshStartedAt: this.lastRefreshStartedAt,
      lastRefreshCompletedAt: this.lastRefreshCompletedAt,
      lastRefreshDurationMs: this.lastRefreshDurationMs,
      lastError: this.lastError,
      lastProcessedAttributionCount: this.lastProcessedAttributionCount,
      lastAppendedEventCount: this.lastAppendedEventCount,
    }
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true

    try {
      const checkpoint = await this.dependencies.learningCheckpointRepository.getCheckpointByRuntimeName(
        ECONOMIC_FEEDBACK_RUNTIME_NAME,
      )

      if (
        checkpoint?.lastProcessedAttributionId
        && checkpoint.lastProcessedAttributedAt
      ) {
        this.lastProcessedAttributionWatermark = {
          attributionId: checkpoint.lastProcessedAttributionId,
          attributedAt: checkpoint.lastProcessedAttributedAt,
        }

        console.info('[economic-feedback] checkpoint.restored', {
          runtimeName: ECONOMIC_FEEDBACK_RUNTIME_NAME,
          lastProcessedAttributionWatermark: this.lastProcessedAttributionWatermark,
          updatedAt: checkpoint.updatedAt,
        })
      } else {
        console.info('[economic-feedback] checkpoint.restore_skipped', {
          runtimeName: ECONOMIC_FEEDBACK_RUNTIME_NAME,
          reason: 'checkpoint_not_found_or_empty',
        })
      }
    } catch (error) {
      console.warn('[economic-feedback] checkpoint.restore_failed', {
        runtimeName: ECONOMIC_FEEDBACK_RUNTIME_NAME,
        message: error instanceof Error ? error.message : 'unknown_error',
      })
      this.lastProcessedAttributionWatermark = null
    }

    try {
      const negativeCheckpoint = await this.dependencies.learningCheckpointRepository.getCheckpointByRuntimeName(
        ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
      )

      if (
        negativeCheckpoint?.lastProcessedAttributionId
        && negativeCheckpoint.lastProcessedAttributedAt
      ) {
        this.lastProcessedNegativeOutcomeWatermark = {
          attributionId: negativeCheckpoint.lastProcessedAttributionId,
          attributedAt: negativeCheckpoint.lastProcessedAttributedAt,
        }

        console.info('[economic-feedback] negative.checkpoint.restored', {
          runtimeName: ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
          lastProcessedNegativeOutcomeWatermark: this.lastProcessedNegativeOutcomeWatermark,
          updatedAt: negativeCheckpoint.updatedAt,
        })
      } else {
        console.info('[economic-feedback] negative.checkpoint.restore_skipped', {
          runtimeName: ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
          reason: 'checkpoint_not_found_or_empty',
        })
      }
    } catch (error) {
      console.warn('[economic-feedback] negative.checkpoint.restore_failed', {
        runtimeName: ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
        message: error instanceof Error ? error.message : 'unknown_error',
      })
      this.lastProcessedNegativeOutcomeWatermark = null
    }

    try {
      await this.refresh()
    } catch (error) {
      this.started = false
      throw error
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[economic-feedback] scheduled refresh failed', {
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
      this.lastRefreshStartedAt = new Date(refreshStartedAt).toISOString()
      console.info('[economic-feedback] refresh start')

      try {
        const attributionState = this.dependencies.revenueAttributionSnapshotStore.getSnapshot()
        const opportunityState = this.dependencies.opportunitySnapshotStore.getSnapshot()
        const executionState = this.dependencies.sovereignExecutionSnapshotStore.getSnapshot()

        if (!attributionState.freshness.ready) {
          console.info('[economic-feedback] refresh skipped', {
            reason: 'revenue_attribution_not_ready',
          })
          return
        }

        const opportunityById = new Map(
          opportunityState.snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity]),
        )
        const executionById = new Map(
          executionState.snapshot.executions.map((execution) => [execution.executionId, execution]),
        )

        const candidateAttributions = [...attributionState.snapshot.attributions]
          .sort((left, right) => {
            const observedOrder = left.attributedAt.localeCompare(right.attributedAt)
            if (observedOrder !== 0) {
              return observedOrder
            }

            return left.attributionId.localeCompare(right.attributionId)
          })
          .filter((attribution) => isAfterWatermark(this.lastProcessedAttributionWatermark, {
            attributedAt: attribution.attributedAt,
            attributionId: attribution.attributionId,
          }))
        const negativeOutcomes = (await this.dependencies.negativeOutcomeRepository.listNegativeOutcomes(NEGATIVE_OUTCOME_SCAN_LIMIT))
          .sort((left, right) => {
            const observedOrder = left.detectedAt.localeCompare(right.detectedAt)
            if (observedOrder !== 0) {
              return observedOrder
            }

            return left.outcomeId.localeCompare(right.outcomeId)
          })

        let appendedEventCount = 0
        let processedAttributionCount = 0
        let watermark = this.lastProcessedAttributionWatermark
        let negativeWatermark = this.lastProcessedNegativeOutcomeWatermark
        let lastDurableLearningEventId = this.lastDurableLearningEventId

        for (const attribution of candidateAttributions) {
          const opportunity = opportunityById.get(attribution.opportunityId)
          const execution = executionById.get(attribution.executionId)

          if (!opportunity || !execution) {
            console.warn('[economic-feedback] attribution skipped', {
              reason: !opportunity ? 'missing_opportunity' : 'missing_execution',
              attributionId: attribution.attributionId,
              opportunityId: attribution.opportunityId,
              executionId: attribution.executionId,
            })
            continue
          }

          const outcomeTypes = classifyOutcomeTypes(attribution.revenue)

          for (const outcomeType of outcomeTypes) {
            const { learningEvent, inserted, updatedMemory } = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
              authoritySource: 'backend/src/learning/runtime/economicFeedbackRuntime.ts#refresh:positive_revenue_ingestion',
              context: {
                mutationType: 'economic.feedback.learning_event.append',
                mutationScope: 'runtime',
                requestedCapability: 'adaptive.runtime.mutation',
                runtimeMode: 'normal',
                continuityMode: 'institutional_safe',
                replayVerificationState: 'verified',
                attestationIntegrity: 'verified',
                recoveryRequired: false,
                actor: 'runtime',
                traceId: attribution.attributionId,
              },
              work: async () => {
              const appendResult = await this.dependencies.learningLedgerRepository.appendLearningEvent({
                attributionId: attribution.attributionId,
                marketSignalId: attribution.marketSignalId,
                opportunityId: attribution.opportunityId,
                proposalId: attribution.proposalId,
                executionId: attribution.executionId,
                entityId: execution.entityId,
                category: opportunity.category,
                signalKeyword: opportunity.keyword,
                outcomeType,
                attributedRevenue: attribution.revenue,
                conversionSuccess: outcomeType === 'conversion_positive' || outcomeType === 'revenue_positive',
                observedAt: attribution.attributedAt,
              })

              if (!appendResult.inserted) {
                return {
                  learningEvent: appendResult.learningEvent,
                  inserted: appendResult.inserted,
                  updatedMemory: null,
                }
              }

              return {
                learningEvent: appendResult.learningEvent,
                inserted: appendResult.inserted,
                updatedMemory: await this.dependencies.economicMemoryRepository.aggregateLearningEvent(
                  appendResult.learningEvent,
                ),
              }
              },
            })

            if (!inserted) {
              console.info('[economic-feedback] memory.aggregate.skipped_existing', {
                learningEventId: learningEvent.learningEventId,
                reason: 'learning_event_conflict_ignored',
                phase: 'positive_attribution',
              })
              continue
            }

            appendedEventCount += 1
            lastDurableLearningEventId = learningEvent.learningEventId
            console.info('[economic-feedback] memory.aggregate.inserted', {
              learningEventId: learningEvent.learningEventId,
              phase: 'positive_attribution',
            })
            console.info('economic.memory.updated', {
              learningEventId: learningEvent.learningEventId,
              memoryIds: updatedMemory.map((record) => record.memoryId),
              category: opportunity.category,
              signalKeyword: opportunity.keyword,
              entityId: execution.entityId,
            })
          }

          processedAttributionCount += 1
          watermark = {
            attributedAt: attribution.attributedAt,
            attributionId: attribution.attributionId,
          }
        }

        const candidateNegativeOutcomes = negativeOutcomes.filter((negativeOutcome) => isAfterWatermark(
          this.lastProcessedNegativeOutcomeWatermark,
          {
            attributedAt: negativeOutcome.detectedAt,
            attributionId: negativeOutcome.outcomeId,
          },
        ))
        let processedNegativeOutcomeCount = 0

        for (const negativeOutcome of candidateNegativeOutcomes) {
          const negativeOutcomeAttributionId = buildNegativeOutcomeAttributionId(negativeOutcome)
          const outcomeTypes = classifyNegativeOutcomeTypes(negativeOutcome.outcomeType)

          for (const outcomeType of outcomeTypes) {
            const learningEventId = buildLearningLedgerEventId({
              attributionId: negativeOutcomeAttributionId,
              marketSignalId: negativeOutcome.marketSignalId,
              opportunityId: negativeOutcome.opportunityId,
              proposalId: negativeOutcome.proposalId,
              executionId: negativeOutcome.executionId,
              entityId: negativeOutcome.entityId,
              category: negativeOutcome.category,
              signalKeyword: negativeOutcome.signalKeyword,
              outcomeType,
              attributedRevenue: 0,
              conversionSuccess: false,
              observedAt: negativeOutcome.detectedAt,
            })
            const { learningEvent, inserted, updatedMemory } = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
              authoritySource: 'backend/src/learning/runtime/economicFeedbackRuntime.ts#refresh:negative_outcome_ingestion',
              context: {
                mutationType: 'economic.feedback.negative_learning_event.append',
                mutationScope: 'runtime',
                requestedCapability: 'adaptive.runtime.mutation',
                runtimeMode: 'normal',
                continuityMode: 'institutional_safe',
                replayVerificationState: 'verified',
                attestationIntegrity: 'verified',
                recoveryRequired: false,
                actor: 'runtime',
                traceId: learningEventId,
              },
              work: async () => {
              const appendResult = await this.dependencies.learningLedgerRepository.appendLearningEvent({
                learningEventId,
                attributionId: negativeOutcomeAttributionId,
                marketSignalId: negativeOutcome.marketSignalId,
                opportunityId: negativeOutcome.opportunityId,
                proposalId: negativeOutcome.proposalId,
                executionId: negativeOutcome.executionId,
                entityId: negativeOutcome.entityId,
                category: negativeOutcome.category,
                signalKeyword: negativeOutcome.signalKeyword,
                outcomeType,
                attributedRevenue: 0,
                conversionSuccess: false,
                observedAt: negativeOutcome.detectedAt,
              })

              if (!appendResult.inserted) {
                return {
                  learningEvent: appendResult.learningEvent,
                  inserted: appendResult.inserted,
                  updatedMemory: null,
                }
              }

              return {
                learningEvent: appendResult.learningEvent,
                inserted: appendResult.inserted,
                updatedMemory: await this.dependencies.economicMemoryRepository.aggregateLearningEvent(
                  appendResult.learningEvent,
                ),
              }
              },
            })

            if (!inserted) {
              console.info('[economic-feedback] memory.aggregate.skipped_existing', {
                learningEventId,
                reason: 'learning_event_conflict_ignored',
                phase: 'negative_outcome',
              })
              continue
            }

            appendedEventCount += 1
            lastDurableLearningEventId = learningEvent.learningEventId
            console.info('[economic-feedback] memory.aggregate.inserted', {
              learningEventId: learningEvent.learningEventId,
              phase: 'negative_outcome',
            })
            console.info('economic.memory.updated', {
              learningEventId: learningEvent.learningEventId,
              memoryIds: (updatedMemory ?? []).map((record) => record.memoryId),
              category: negativeOutcome.category,
              signalKeyword: negativeOutcome.signalKeyword,
              entityId: negativeOutcome.entityId,
              negativeOutcomeId: negativeOutcome.outcomeId,
              negativeOutcomeType: negativeOutcome.outcomeType,
            })
          }

          processedNegativeOutcomeCount += 1
          negativeWatermark = {
            attributedAt: negativeOutcome.detectedAt,
            attributionId: negativeOutcome.outcomeId,
          }
        }

        const replayLag = Math.max(0, candidateAttributions.length - processedAttributionCount)

        if (watermark && isAfterWatermark(this.lastProcessedAttributionWatermark, watermark)) {
          console.info('[economic-feedback] checkpoint.progression.begin', {
            runtimeName: ECONOMIC_FEEDBACK_RUNTIME_NAME,
            fromAttribution: this.lastProcessedAttributionWatermark,
            toAttribution: watermark,
            replayLag,
            lastDurableLearningEventId,
          })

          const { result: checkpoint } = await getSemanticMutationExecutor().executeSemanticMutation({
            authoritySource: 'backend/src/learning/runtime/economicFeedbackRuntime.ts#refresh:positive_revenue_checkpoint',
            intent: {
              intentId: `checkpoint:${ECONOMIC_FEEDBACK_RUNTIME_NAME}:${watermark.attributionId}`,
              intentType: 'runtime.checkpoint.update',
              domain: 'checkpoint',
              actor: 'runtime',
              targetRef: {
                runtimeId: ECONOMIC_FEEDBACK_RUNTIME_NAME,
              },
              semanticPurpose: 'advance the durable economic feedback positive revenue checkpoint',
              expectedInstitutionalEffect: ['runtime_checkpoint_advanced'],
              riskLevel: 'high',
              replayRelevant: true,
              continuityRelevant: true,
              authRelevant: false,
              createdAt: new Date().toISOString(),
            },
            captureBeforeState: () => this.lastProcessedAttributionWatermark,
            executePersistence: async () => this.dependencies.learningCheckpointRepository.upsertCheckpoint({
              runtimeName: ECONOMIC_FEEDBACK_RUNTIME_NAME,
              lastProcessedAttributionId: watermark.attributionId,
              lastProcessedAttributedAt: watermark.attributedAt,
              updatedAt: new Date().toISOString(),
            }),
            captureAfterState: (persisted) => persisted,
            deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
              effectId: `${intent.intentId}:effect`,
              intentId: intent.intentId,
              effectType: 'runtime.checkpoint.updated',
              domain: intent.domain,
              beforeFingerprint: buildSemanticFingerprint(beforeState),
              afterFingerprint: buildSemanticFingerprint(afterState),
              changedFields: ['learningCheckpoint'],
              institutionalMeaning: 'positive revenue replay continuity moved to a new durable checkpoint',
              replayFingerprint: buildSemanticFingerprint(afterState),
              continuityLineageHash: sovereignAttestation.lineageHash,
              mutationLineageHash: '',
              verified: false,
            }),
          })

          this.lastProcessedAttributionWatermark = watermark

          console.info('[economic-feedback] checkpoint.progression.committed', {
            runtimeName: checkpoint.runtimeName,
            checkpointId: checkpoint.checkpointId,
            lastDurableAttribution: this.lastProcessedAttributionWatermark,
            lastDurableLearningEventId,
            replayLag,
            updatedAt: checkpoint.updatedAt,
          })
        }

        const negativeReplayLag = Math.max(0, candidateNegativeOutcomes.length - processedNegativeOutcomeCount)

        if (negativeWatermark && isAfterWatermark(this.lastProcessedNegativeOutcomeWatermark, negativeWatermark)) {
          console.info('[economic-feedback] negative.checkpoint.progression.begin', {
            runtimeName: ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
            fromNegativeOutcome: this.lastProcessedNegativeOutcomeWatermark,
            toNegativeOutcome: negativeWatermark,
            processedCount: processedNegativeOutcomeCount,
            pendingCount: negativeReplayLag,
            replayLag: negativeReplayLag,
          })

          const { result: negativeCheckpoint } = await getSemanticMutationExecutor().executeSemanticMutation({
            authoritySource: 'backend/src/learning/runtime/economicFeedbackRuntime.ts#refresh:negative_outcome_checkpoint',
            intent: {
              intentId: `checkpoint:${ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME}:${negativeWatermark.attributionId}`,
              intentType: 'runtime.checkpoint.update',
              domain: 'checkpoint',
              actor: 'runtime',
              targetRef: {
                runtimeId: ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
              },
              semanticPurpose: 'advance the durable economic feedback negative outcome checkpoint',
              expectedInstitutionalEffect: ['runtime_checkpoint_advanced'],
              riskLevel: 'high',
              replayRelevant: true,
              continuityRelevant: true,
              authRelevant: false,
              createdAt: new Date().toISOString(),
            },
            captureBeforeState: () => this.lastProcessedNegativeOutcomeWatermark,
            executePersistence: async () => this.dependencies.learningCheckpointRepository.upsertCheckpoint({
              runtimeName: ECONOMIC_FEEDBACK_NEGATIVE_RUNTIME_NAME,
              lastProcessedAttributionId: negativeWatermark.attributionId,
              lastProcessedAttributedAt: negativeWatermark.attributedAt,
              updatedAt: new Date().toISOString(),
            }),
            captureAfterState: (persisted) => persisted,
            deriveEffect: ({ intent, beforeState, afterState, sovereignAttestation }) => ({
              effectId: `${intent.intentId}:effect`,
              intentId: intent.intentId,
              effectType: 'runtime.checkpoint.updated',
              domain: intent.domain,
              beforeFingerprint: buildSemanticFingerprint(beforeState),
              afterFingerprint: buildSemanticFingerprint(afterState),
              changedFields: ['learningCheckpoint'],
              institutionalMeaning: 'negative outcome replay continuity moved to a new durable checkpoint',
              replayFingerprint: buildSemanticFingerprint(afterState),
              continuityLineageHash: sovereignAttestation.lineageHash,
              mutationLineageHash: '',
              verified: false,
            }),
          })

          this.lastProcessedNegativeOutcomeWatermark = negativeWatermark

          console.info('[economic-feedback] negative.checkpoint.progression.committed', {
            runtimeName: negativeCheckpoint.runtimeName,
            checkpointId: negativeCheckpoint.checkpointId,
            lastDurableNegativeOutcome: this.lastProcessedNegativeOutcomeWatermark,
            processedCount: processedNegativeOutcomeCount,
            pendingCount: negativeReplayLag,
            replayLag: negativeReplayLag,
            updatedAt: negativeCheckpoint.updatedAt,
          })
        }

        this.lastProcessedAttributionCount = processedAttributionCount
        this.lastAppendedEventCount = appendedEventCount
        this.lastDurableLearningEventId = lastDurableLearningEventId
        this.replayLag = replayLag
        this.negativeProcessedCount = processedNegativeOutcomeCount
        this.negativePendingCount = negativeReplayLag
        this.negativeReplayLag = negativeReplayLag
        this.lastRefreshDurationMs = Date.now() - refreshStartedAt
        this.lastRefreshCompletedAt = new Date().toISOString()
        this.lastError = null

        console.info('[economic-feedback] refresh.durationMs', {
          durationMs: this.lastRefreshDurationMs,
          candidateAttributionCount: candidateAttributions.length,
          processedAttributionCount,
          appendedEventCount,
          replayLag,
          negativeProcessedCount: processedNegativeOutcomeCount,
          negativePendingCount: negativeReplayLag,
          negativeReplayLag,
          lastDurableLearningEventId,
          lastProcessedAttributionWatermark: this.lastProcessedAttributionWatermark,
          lastProcessedNegativeOutcomeWatermark: this.lastProcessedNegativeOutcomeWatermark,
        })
      } catch (error) {
        this.lastRefreshDurationMs = Date.now() - refreshStartedAt
        this.lastRefreshCompletedAt = new Date().toISOString()
        this.lastError = error instanceof Error ? error.message : 'unknown_error'
        console.warn('[economic-feedback] refresh.durationMs', {
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

export function createEconomicFeedbackRuntime(dependencies: EconomicFeedbackRuntimeDependencies) {
  return new EconomicFeedbackRuntime(dependencies)
}
