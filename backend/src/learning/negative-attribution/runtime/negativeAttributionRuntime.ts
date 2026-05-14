import { getInstitutionalSovereignMutationGate } from '../../../sovereignty/institutionalSovereignMutationGate.js'
import type {
  AppendNegativeAttributionInput,
  NegativeAttributionEvent,
  NegativeAttributionLineageQuality,
  NegativeAttributionSeverity,
} from '../NegativeAttributionEvent.js'
import { buildNegativeAttributionId } from '../NegativeAttributionEvent.js'
import type { NegativeEconomicOutcome } from '../../negative-outcomes/NegativeEconomicOutcome.js'
import { NegativeOutcomeRepository } from '../../persistence/negativeOutcomeRepository.js'
import { NegativeAttributionRepository } from '../../persistence/negativeAttributionRepository.js'
import {
  NegativeAttributionSnapshotStore,
  type NegativeAttributionSnapshot,
} from './negativeAttributionSnapshotStore.js'

type NegativeAttributionRuntimeDependencies = {
  negativeOutcomeRepository: NegativeOutcomeRepository
  negativeAttributionRepository: NegativeAttributionRepository
  negativeAttributionSnapshotStore: NegativeAttributionSnapshotStore
  refreshIntervalMs?: number
  detectorRuntimeName?: string
  detectorVersion?: string
}

export type NegativeAttributionRuntimeStatus = {
  runtimeName: string
  started: boolean
  refreshing: boolean
  refreshIntervalMs: number
  ready: boolean
  warming: boolean
  error: boolean
  lastRunAt: string | null
  lastRefreshStartedAt: string | null
  lastRefreshCompletedAt: string | null
  lastRefreshDurationMs: number | null
  lastError: string | null
  lastAttributedOutcomeId: string | null
  attributionCount: number
  lastAttributedOutcomeCount: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const NEGATIVE_ATTRIBUTION_RUNTIME_NAME = 'negative-attribution-runtime'
const DEFAULT_DETECTOR_RUNTIME_NAME = 'terminal-failure-detection-runtime'
const DEFAULT_DETECTOR_VERSION = 'v1'
const NEGATIVE_OUTCOME_SCAN_LIMIT = 2_147_483_647

type RuntimeState = 'warming' | 'ready' | 'error'

const TERMINAL_NEGATIVE_OUTCOME_TYPES = new Set([
  'terminal_no_conversion',
  'abandoned_execution',
  'proposal_rejected',
  'opportunity_expired',
  'no_response_timeout',
  'failed_execution',
] as const)

function normalizeOptionalLineage(value: string) {
  const normalized = value.trim()

  if (normalized.length === 0) {
    return null
  }

  if (
    normalized === 'none'
    || normalized === 'unassigned'
    || normalized === 'unknown'
    || normalized.startsWith('unknown-')
  ) {
    return null
  }

  return normalized
}

function isSyntheticValue(value: string) {
  const normalized = value.trim()
  return normalized === 'none'
    || normalized === 'unassigned'
    || normalized === 'unknown'
    || normalized.startsWith('unknown-')
}

function readMetadataString(outcome: NegativeEconomicOutcome, key: string) {
  const value = outcome.metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function classifySeverity(outcomeType: NegativeEconomicOutcome['outcomeType']): NegativeAttributionSeverity {
  switch (outcomeType) {
    case 'failed_execution':
      return 'critical'
    case 'abandoned_execution':
    case 'terminal_no_conversion':
      return 'high'
    case 'proposal_rejected':
    case 'no_response_timeout':
    case 'opportunity_expired':
      return 'medium'
    default:
      return 'low'
  }
}

function classifyLineageQuality(outcome: NegativeEconomicOutcome): NegativeAttributionLineageQuality {
  const signalId = normalizeOptionalLineage(outcome.marketSignalId)
  const opportunityId = normalizeOptionalLineage(outcome.opportunityId)
  const proposalId = normalizeOptionalLineage(outcome.proposalId)
  const executionId = normalizeOptionalLineage(outcome.executionId)
  const entityId = normalizeOptionalLineage(outcome.entityId)

  const signalSynthetic = isSyntheticValue(outcome.marketSignalId)
  const opportunitySynthetic = isSyntheticValue(outcome.opportunityId)
  const proposalSynthetic = isSyntheticValue(outcome.proposalId)
  const executionSynthetic = isSyntheticValue(outcome.executionId)
  const entitySynthetic = isSyntheticValue(outcome.entityId)

  const expectsProposal = outcome.outcomeType !== 'opportunity_expired'
  const expectsExecution = (
    outcome.outcomeType === 'abandoned_execution'
    || outcome.outcomeType === 'failed_execution'
    || outcome.outcomeType === 'terminal_no_conversion'
  )

  const hasCore = Boolean(signalId || opportunityId || entityId)

  if (!hasCore) {
    return 'missing'
  }

  if (
    signalSynthetic
    || opportunitySynthetic
    || entitySynthetic
    || (expectsProposal && proposalSynthetic)
    || (expectsExecution && executionSynthetic)
  ) {
    return 'synthetic'
  }

  switch (outcome.outcomeType) {
    case 'opportunity_expired':
      return signalId && opportunityId ? 'complete' : 'partial'
    case 'proposal_rejected':
    case 'no_response_timeout':
      return signalId && opportunityId && proposalId && entityId ? 'complete' : 'partial'
    case 'abandoned_execution':
    case 'failed_execution':
    case 'terminal_no_conversion':
      return signalId && opportunityId && proposalId && executionId && entityId ? 'complete' : 'partial'
    default:
      return 'partial'
  }
}

function resolveOccurredAt(outcome: NegativeEconomicOutcome) {
  return (
    readMetadataString(outcome, 'completedAt')
    ?? readMetadataString(outcome, 'startedAt')
    ?? readMetadataString(outcome, 'createdAt')
    ?? outcome.detectedAt
  )
}

function buildNegativeAttribution(outcome: NegativeEconomicOutcome, defaults: {
  detectorRuntimeName: string
  detectorVersion: string
}): NegativeAttributionEvent {
  const event: Omit<NegativeAttributionEvent, 'attributionId'> = {
    outcomeId: outcome.outcomeId,
    signalId: normalizeOptionalLineage(outcome.marketSignalId),
    opportunityId: normalizeOptionalLineage(outcome.opportunityId),
    proposalId: normalizeOptionalLineage(outcome.proposalId),
    executionId: normalizeOptionalLineage(outcome.executionId),
    entityId: normalizeOptionalLineage(outcome.entityId),
    category: outcome.category,
    keyword: outcome.signalKeyword,
    outcomeType: outcome.outcomeType,
    severity: classifySeverity(outcome.outcomeType),
    reason: outcome.reason,
    attributedAt: outcome.detectedAt,
    occurredAt: resolveOccurredAt(outcome),
    detectedAt: outcome.detectedAt,
    sourceRuntime: readMetadataString(outcome, 'sourceRuntime') ?? defaults.detectorRuntimeName,
    detectorVersion: readMetadataString(outcome, 'detectorVersion') ?? defaults.detectorVersion,
    lineageQuality: classifyLineageQuality(outcome),
    metadata: outcome.metadata,
    createdAt: outcome.detectedAt,
  }

  return {
    ...event,
    attributionId: buildNegativeAttributionId(event),
  }
}

function buildMetrics(attributions: NegativeAttributionEvent[]) {
  return {
    attributionCount: attributions.length,
    completeCount: attributions.filter((attribution) => attribution.lineageQuality === 'complete').length,
    partialCount: attributions.filter((attribution) => attribution.lineageQuality === 'partial').length,
    syntheticCount: attributions.filter((attribution) => attribution.lineageQuality === 'synthetic').length,
    missingCount: attributions.filter((attribution) => attribution.lineageQuality === 'missing').length,
  }
}

function buildSnapshot(args: {
  attributions: NegativeAttributionEvent[]
  generatedAt: string
}): NegativeAttributionSnapshot {
  const rankedAttributions = [...args.attributions].sort((left, right) => {
    const detectedOrder = right.detectedAt.localeCompare(left.detectedAt)
    if (detectedOrder !== 0) {
      return detectedOrder
    }

    return right.attributionId.localeCompare(left.attributionId)
  })

  return {
    status: 'ready',
    generatedAt: args.generatedAt,
    attributions: rankedAttributions,
    metrics: buildMetrics(rankedAttributions),
  }
}

export class NegativeAttributionRuntime {
  private readonly refreshIntervalMs: number
  private readonly detectorRuntimeName: string
  private readonly detectorVersion: string
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<NegativeAttributionSnapshot> | null = null
  private lastRefreshStartedAt: string | null = null
  private lastRefreshCompletedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private lastAttributedOutcomeId: string | null = null
  private attributionCount = 0
  private lastAttributedOutcomeCount = 0
  private runtimeState: RuntimeState = 'warming'

  constructor(private readonly dependencies: NegativeAttributionRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.detectorRuntimeName = dependencies.detectorRuntimeName ?? DEFAULT_DETECTOR_RUNTIME_NAME
    this.detectorVersion = dependencies.detectorVersion ?? DEFAULT_DETECTOR_VERSION
  }

  getStatus(): NegativeAttributionRuntimeStatus {
    return {
      runtimeName: NEGATIVE_ATTRIBUTION_RUNTIME_NAME,
      started: this.started,
      refreshing: this.inFlightRefresh !== null,
      refreshIntervalMs: this.refreshIntervalMs,
      ready: this.runtimeState === 'ready',
      warming: this.runtimeState === 'warming',
      error: this.runtimeState === 'error',
      lastRunAt: this.lastRefreshCompletedAt,
      lastRefreshStartedAt: this.lastRefreshStartedAt,
      lastRefreshCompletedAt: this.lastRefreshCompletedAt,
      lastRefreshDurationMs: this.lastRefreshDurationMs,
      lastError: this.lastError,
      lastAttributedOutcomeId: this.lastAttributedOutcomeId,
      attributionCount: this.attributionCount,
      lastAttributedOutcomeCount: this.lastAttributedOutcomeCount,
    }
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true
    this.runtimeState = 'warming'

    try {
      await this.refresh()
    } catch (error) {
      console.warn('[negative-attribution] initial snapshot refresh failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
      })
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        console.warn('[negative-attribution] scheduled snapshot refresh failed', {
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

  async refresh(): Promise<NegativeAttributionSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    this.inFlightRefresh = (async () => {
      const refreshStartedAt = Date.now()
      this.lastRefreshStartedAt = new Date(refreshStartedAt).toISOString()
      this.dependencies.negativeAttributionSnapshotStore.setRefreshing(true)
      console.info('[negative-attribution] snapshot refresh start')

      try {
        const negativeOutcomes = (await this.dependencies.negativeOutcomeRepository.listNegativeOutcomes(NEGATIVE_OUTCOME_SCAN_LIMIT))
          .filter((outcome) => TERMINAL_NEGATIVE_OUTCOME_TYPES.has(outcome.outcomeType))
          .sort((left, right) => {
            const detectedOrder = left.detectedAt.localeCompare(right.detectedAt)
            if (detectedOrder !== 0) {
              return detectedOrder
            }

            return left.outcomeId.localeCompare(right.outcomeId)
          })

        const attributions = negativeOutcomes.map((outcome) => buildNegativeAttribution(outcome, {
          detectorRuntimeName: this.detectorRuntimeName,
          detectorVersion: this.detectorVersion,
        }))

        for (const attribution of attributions) {
          await getInstitutionalSovereignMutationGate().evaluateAndExecute({
            authoritySource: 'backend/src/learning/negative-attribution/runtime/negativeAttributionRuntime.ts#refresh',
            context: {
              mutationType: 'negative.attribution.append',
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
            work: async () => this.dependencies.negativeAttributionRepository.appendNegativeAttribution({
              outcomeId: attribution.outcomeId,
              signalId: attribution.signalId,
              opportunityId: attribution.opportunityId,
              proposalId: attribution.proposalId,
              executionId: attribution.executionId,
              entityId: attribution.entityId,
              category: attribution.category,
              keyword: attribution.keyword,
              outcomeType: attribution.outcomeType,
              severity: attribution.severity,
              reason: attribution.reason,
              attributedAt: attribution.attributedAt,
              occurredAt: attribution.occurredAt,
              detectedAt: attribution.detectedAt,
              sourceRuntime: attribution.sourceRuntime,
              detectorVersion: attribution.detectorVersion,
              lineageQuality: attribution.lineageQuality,
              metadata: attribution.metadata,
              createdAt: attribution.createdAt,
              attributionId: attribution.attributionId,
            } satisfies AppendNegativeAttributionInput),
          })
        }

        const snapshot = buildSnapshot({
          attributions,
          generatedAt: new Date().toISOString(),
        })
        const refreshCompletedAt = Date.now()

        this.dependencies.negativeAttributionSnapshotStore.setSnapshot(snapshot, {
          refreshStartedAt,
          refreshCompletedAt,
          lastError: null,
        })
        this.lastAttributedOutcomeId = attributions.length > 0 ? attributions[attributions.length - 1]!.outcomeId : null
        this.attributionCount = snapshot.metrics.attributionCount
        this.lastAttributedOutcomeCount = attributions.length
        this.lastRefreshDurationMs = refreshCompletedAt - refreshStartedAt
        this.lastRefreshCompletedAt = new Date(refreshCompletedAt).toISOString()
        this.lastError = null
        this.runtimeState = 'ready'

        console.info('[negative-attribution] snapshot.refresh.durationMs', {
          durationMs: this.lastRefreshDurationMs,
          attributionCount: snapshot.metrics.attributionCount,
          completeCount: snapshot.metrics.completeCount,
          partialCount: snapshot.metrics.partialCount,
          syntheticCount: snapshot.metrics.syntheticCount,
          missingCount: snapshot.metrics.missingCount,
        })

        return snapshot
      } catch (error) {
        const refreshCompletedAt = Date.now()
        const message = error instanceof Error ? error.message : 'Failed to refresh negative attribution snapshot.'
        this.dependencies.negativeAttributionSnapshotStore.setLastError(message)
        this.lastRefreshDurationMs = refreshCompletedAt - refreshStartedAt
        this.lastRefreshCompletedAt = new Date(refreshCompletedAt).toISOString()
        this.lastError = message
        this.runtimeState = 'error'
        console.warn('[negative-attribution] snapshot.refresh.durationMs', {
          durationMs: this.lastRefreshDurationMs,
          error: message,
        })
        throw error
      } finally {
        this.dependencies.negativeAttributionSnapshotStore.setRefreshing(false)
        this.inFlightRefresh = null
      }
    })()

    return this.inFlightRefresh
  }
}

export function createNegativeAttributionRuntime(dependencies: NegativeAttributionRuntimeDependencies) {
  return new NegativeAttributionRuntime(dependencies)
}
