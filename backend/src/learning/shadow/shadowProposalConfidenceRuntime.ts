import { createHash } from 'node:crypto'

import type { AdaptiveWeightRecord, AdaptiveWeightSnapshotRuntime } from '../runtime/adaptiveWeightSnapshotRuntime.js'
import { createShadowDecisionComparison, type ShadowDecisionComparison, type ShadowDecisionDivergenceType } from './ShadowDecisionComparison.js'
import type { OpportunityLead } from '../../market-signals/opportunities/contracts/OpportunityLead.js'
import type { EntityActionSuggestion } from '../../market-signals/opportunities/contracts/EntityActionSuggestion.js'
import type { OpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'

type ShadowProposalConfidenceRuntimeDependencies = {
  opportunitySnapshotStore: OpportunitySnapshotStore
  adaptiveWeightSnapshotRuntime: AdaptiveWeightSnapshotRuntime
  refreshIntervalMs?: number
  divergenceThreshold?: number
  confidenceThreshold?: number
}

type WeightEvidence = {
  memoryId: string
  weightId: string
  weight: number
  sampleCount: number
  confidenceLevel: 'low' | 'medium' | 'high'
  decayFactor: number
}

type ComparisonDetail = {
  comparison: ShadowDecisionComparison
  economicReasoning: {
    baseEconomicRelevance: number
    estimatedEconomicDelta: number
    rationale: string
  }
  supportingMemoryEvidence: {
    signal: WeightEvidence | null
    category: WeightEvidence | null
    entity: WeightEvidence | null
  }
  contribution: {
    signalContribution: number
    categoryContribution: number
    entityContribution: number
    combinedAdaptiveMultiplier: number
  }
}

export type ShadowProposalConfidenceSnapshot = {
  status: 'warming' | 'ready'
  generatedAt: string
  comparisons: ComparisonDetail[]
  metrics: {
    comparisonCount: number
    projectionGenerationCount: number
    divergenceCount: number
    highDivergenceCount: number
    divergenceDistribution: {
      low: number
      medium: number
      high: number
      critical: number
    }
    divergenceRatio: number
    averageDivergenceScore: number
    maxDivergenceScore: number
    estimatedEconomicDeltaTotal: number
    refreshDurationMs: number
    replayConsistencyStatus: 'not_evaluated' | 'consistent' | 'inconsistent' | 'snapshot_changed'
    generatedAt: string
  }
}

export type ShadowProposalConfidenceFreshness = {
  ready: boolean
  updatedAt: string | null
  ageMs: number | null
  refreshIntervalMs: number
  lastRefreshDurationMs: number | null
  refreshing: boolean
  lastError: string | null
}

export type ShadowProposalConfidenceRuntimeState = {
  snapshot: ShadowProposalConfidenceSnapshot
  freshness: ShadowProposalConfidenceFreshness
  runtime: {
    started: boolean
    advisoryOnly: true
    replaySafe: true
    deterministic: true
    mutatesLiveProposalConfidence: false
  }
}

type SuggestionWithOpportunity = {
  suggestion: EntityActionSuggestion
  opportunity: OpportunityLead
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const DEFAULT_DIVERGENCE_THRESHOLD = 0.05
const DEFAULT_CONFIDENCE_THRESHOLD = 0.62

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractKeywordFromReasoning(reasoning: string) {
  const keywordMatch = reasoning.match(/signal "([^"]+)"/i)
  return keywordMatch?.[1]?.trim().toLowerCase() ?? null
}

function resolveGeneratedAt(now: string, opportunityGeneratedAt: string, adaptiveGeneratedAt: string) {
  const parsedOpportunity = Date.parse(opportunityGeneratedAt)
  const parsedAdaptive = Date.parse(adaptiveGeneratedAt)

  if (Number.isFinite(parsedOpportunity) && Number.isFinite(parsedAdaptive)) {
    return new Date(Math.max(parsedOpportunity, parsedAdaptive)).toISOString()
  }

  if (Number.isFinite(parsedOpportunity)) {
    return new Date(parsedOpportunity).toISOString()
  }

  if (Number.isFinite(parsedAdaptive)) {
    return new Date(parsedAdaptive).toISOString()
  }

  const parsedNow = Date.parse(now)
  if (Number.isFinite(parsedNow)) {
    return new Date(parsedNow).toISOString()
  }

  return new Date().toISOString()
}

function mapLiveConfidenceFromLeadProbability(leadProbability: OpportunityLead['leadProbability']) {
  switch (leadProbability) {
    case 'high':
      return 0.72
    case 'medium':
      return 0.56
    default:
      return 0.38
  }
}

function sortSuggestionsDeterministically(suggestions: EntityActionSuggestion[]) {
  return [...suggestions].sort((left, right) => {
    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence
    }

    const byEntity = left.entityId.localeCompare(right.entityId)
    if (byEntity !== 0) {
      return byEntity
    }

    const byAction = left.suggestedAction.localeCompare(right.suggestedAction)
    if (byAction !== 0) {
      return byAction
    }

    return left.reasoning.localeCompare(right.reasoning)
  })
}

function sortOpportunitiesDeterministically(opportunities: OpportunityLead[]) {
  return [...opportunities].sort((left, right) => {
    if (left.economicRelevance !== right.economicRelevance) {
      return right.economicRelevance - left.economicRelevance
    }

    const byCategory = left.category.localeCompare(right.category)
    if (byCategory !== 0) {
      return byCategory
    }

    const byKeyword = left.keyword.localeCompare(right.keyword)
    if (byKeyword !== 0) {
      return byKeyword
    }

    return left.id.localeCompare(right.id)
  })
}

function pairSuggestionsToOpportunities(
  opportunities: OpportunityLead[],
  suggestions: EntityActionSuggestion[],
): SuggestionWithOpportunity[] {
  const orderedSuggestions = sortSuggestionsDeterministically(suggestions)
  const orderedOpportunities = sortOpportunitiesDeterministically(opportunities)

  const pairs: SuggestionWithOpportunity[] = []

  for (const opportunity of orderedOpportunities) {
    const targetKeyword = normalizeIdPart(opportunity.keyword)

    const matched = orderedSuggestions.filter((suggestion) => {
      const reasoningKeyword = extractKeywordFromReasoning(suggestion.reasoning)
      return reasoningKeyword !== null && normalizeIdPart(reasoningKeyword) === targetKeyword
    })

    if (matched.length > 0) {
      for (const suggestion of matched) {
        pairs.push({ suggestion, opportunity })
      }
      continue
    }

    pairs.push({
      suggestion: {
        entityId: 'portfolio-default',
        entityName: 'Portfolio Default',
        suggestedAction: opportunity.recommendedAction ?? 'Observe and monitor signal momentum.',
        confidence: mapLiveConfidenceFromLeadProbability(opportunity.leadProbability),
        reasoning: `Fallback suggestion for signal "${opportunity.keyword}" in category ${opportunity.category}.`,
      },
      opportunity,
    })
  }

  return pairs
}

function selectBestWeight(weights: AdaptiveWeightRecord[], predicate: (weight: AdaptiveWeightRecord) => boolean) {
  const candidates = weights.filter(predicate)

  if (candidates.length === 0) {
    return null
  }

  const ordered = [...candidates].sort((left, right) => {
    if (left.weight !== right.weight) {
      return right.weight - left.weight
    }

    if (left.sampleCount !== right.sampleCount) {
      return right.sampleCount - left.sampleCount
    }

    return left.weightId.localeCompare(right.weightId)
  })

  return ordered[0] ?? null
}

function toWeightEvidence(weight: AdaptiveWeightRecord | null): WeightEvidence | null {
  if (!weight) {
    return null
  }

  return {
    memoryId: weight.memoryId,
    weightId: weight.weightId,
    weight: roundMetric(weight.weight),
    sampleCount: weight.sampleCount,
    confidenceLevel: weight.confidenceLevel,
    decayFactor: roundMetric(weight.decayFactor),
  }
}

function computeAdaptiveMultiplier(args: {
  signalWeight: AdaptiveWeightRecord | null
  categoryWeight: AdaptiveWeightRecord | null
  entityWeight: AdaptiveWeightRecord | null
}) {
  const factors = [args.signalWeight?.weight, args.categoryWeight?.weight, args.entityWeight?.weight]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (factors.length === 0) {
    return 1
  }

  return roundMetric(factors.reduce((acc, value) => acc + value, 0) / factors.length)
}

function computeContribution(args: {
  signalWeight: AdaptiveWeightRecord | null
  categoryWeight: AdaptiveWeightRecord | null
  entityWeight: AdaptiveWeightRecord | null
}) {
  const signalContribution = roundMetric((args.signalWeight?.weight ?? 1) - 1)
  const categoryContribution = roundMetric((args.categoryWeight?.weight ?? 1) - 1)
  const entityContribution = roundMetric((args.entityWeight?.weight ?? 1) - 1)

  return {
    signalContribution,
    categoryContribution,
    entityContribution,
  }
}

function classifyDivergenceType(args: {
  liveConfidence: number
  shadowConfidence: number
  divergenceScore: number
  confidenceThreshold: number
  divergenceThreshold: number
}): ShadowDecisionDivergenceType {
  if (args.divergenceScore < args.divergenceThreshold) {
    return 'no_divergence'
  }

  const liveAbove = args.liveConfidence >= args.confidenceThreshold
  const shadowAbove = args.shadowConfidence >= args.confidenceThreshold

  if (liveAbove !== shadowAbove) {
    return 'threshold_crossed'
  }

  return 'score_delta_shift'
}

function stableJsonString(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonString(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableJsonString(val)}`).join(',')}}`
}

function buildProjectionId(args: {
  marketSignalId: string
  entityId: string
  opportunityId: string
  generatedAt: string
  liveConfidence: number
  shadowConfidence: number
}) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeIdPart(args.marketSignalId),
      normalizeIdPart(args.entityId),
      normalizeIdPart(args.opportunityId),
      args.generatedAt,
      roundMetric(args.liveConfidence).toString(),
      roundMetric(args.shadowConfidence).toString(),
    ].join(':'))
    .digest('hex')

  return `shadow-projection:proposal-confidence:${fingerprint.slice(0, 24)}`
}

function toDivergenceLevel(divergenceScore: number): 'low' | 'medium' | 'high' | 'critical' {
  if (!Number.isFinite(divergenceScore)) {
    return 'low'
  }

  const score = Math.abs(divergenceScore)

  if (score >= 0.2) {
    return 'critical'
  }

  if (score >= 0.1) {
    return 'high'
  }

  if (score >= 0.05) {
    return 'medium'
  }

  return 'low'
}

function buildReplayFingerprint(comparisons: ComparisonDetail[]) {
  const projectionRows = [...comparisons]
    .map((item) => ({
      comparisonId: item.comparison.comparisonId,
      divergenceType: item.comparison.divergenceType,
      divergenceScore: item.comparison.divergenceScore,
      estimatedEconomicDelta: item.comparison.estimatedEconomicDelta,
      liveDecision: item.comparison.liveDecision,
      shadowDecision: item.comparison.shadowDecision,
    }))
    .sort((left, right) => left.comparisonId.localeCompare(right.comparisonId))

  return stableJsonString(projectionRows)
}

function buildInitialSnapshot(): ShadowProposalConfidenceSnapshot {
  const generatedAt = new Date().toISOString()

  return {
    status: 'warming',
    generatedAt,
    comparisons: [],
    metrics: {
      comparisonCount: 0,
      projectionGenerationCount: 0,
      divergenceCount: 0,
      highDivergenceCount: 0,
      divergenceDistribution: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      divergenceRatio: 0,
      averageDivergenceScore: 0,
      maxDivergenceScore: 0,
      estimatedEconomicDeltaTotal: 0,
      refreshDurationMs: 0,
      replayConsistencyStatus: 'not_evaluated',
      generatedAt,
    },
  }
}

function computeMetrics(args: {
  comparisons: ComparisonDetail[]
  generatedAt: string
  refreshDurationMs: number
  replayConsistencyStatus: ShadowProposalConfidenceSnapshot['metrics']['replayConsistencyStatus']
}): ShadowProposalConfidenceSnapshot['metrics'] {
  const { comparisons, generatedAt, refreshDurationMs, replayConsistencyStatus } = args
  const comparisonCount = comparisons.length
  const divergenceCount = comparisons.filter((item) => item.comparison.divergenceType !== 'no_divergence').length
  const totalDivergence = comparisons.reduce((acc, item) => acc + item.comparison.divergenceScore, 0)
  const maxDivergence = comparisons.reduce((acc, item) => Math.max(acc, item.comparison.divergenceScore), 0)
  const estimatedEconomicDeltaTotal = comparisons.reduce(
    (acc, item) => acc + item.comparison.estimatedEconomicDelta,
    0,
  )
  const divergenceDistribution = comparisons.reduce(
    (acc, item) => {
      const level = toDivergenceLevel(item.comparison.divergenceScore)
      if (level === 'low') {
        acc.low += 1
      } else if (level === 'medium') {
        acc.medium += 1
      } else if (level === 'high') {
        acc.high += 1
      } else {
        acc.critical += 1
      }
      return acc
    },
    { low: 0, medium: 0, high: 0, critical: 0 },
  )
  const highDivergenceCount = divergenceDistribution.high + divergenceDistribution.critical

  return {
    comparisonCount,
    projectionGenerationCount: comparisonCount,
    divergenceCount,
    highDivergenceCount,
    divergenceDistribution,
    divergenceRatio: comparisonCount > 0 ? roundMetric(divergenceCount / comparisonCount) : 0,
    averageDivergenceScore: comparisonCount > 0 ? roundMetric(totalDivergence / comparisonCount) : 0,
    maxDivergenceScore: roundMetric(maxDivergence),
    estimatedEconomicDeltaTotal: roundMetric(estimatedEconomicDeltaTotal),
    refreshDurationMs: Math.max(0, Math.trunc(refreshDurationMs)),
    replayConsistencyStatus,
    generatedAt,
  }
}

export class ShadowProposalConfidenceRuntime {
  private readonly refreshIntervalMs: number
  private readonly divergenceThreshold: number
  private readonly confidenceThreshold: number
  private intervalHandle: NodeJS.Timeout | null = null
  private started = false
  private inFlightRefresh: Promise<ShadowProposalConfidenceSnapshot> | null = null
  private snapshot: ShadowProposalConfidenceSnapshot = buildInitialSnapshot()
  private lastUpdatedAt: string | null = null
  private lastRefreshDurationMs: number | null = null
  private lastError: string | null = null
  private lastLoggedReplayConsistencyStatus: Exclude<ShadowProposalConfidenceSnapshot['metrics']['replayConsistencyStatus'], 'not_evaluated'> | null = null
  private previousReplayFingerprint: string | null = null
  private previousSourceSnapshotSignature: string | null = null

  constructor(private readonly dependencies: ShadowProposalConfidenceRuntimeDependencies) {
    this.refreshIntervalMs = dependencies.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.divergenceThreshold = dependencies.divergenceThreshold ?? DEFAULT_DIVERGENCE_THRESHOLD
    this.confidenceThreshold = dependencies.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  }

  getSnapshot(now = new Date()): ShadowProposalConfidenceRuntimeState {
    const ageMs = this.lastUpdatedAt ? Math.max(0, now.getTime() - Date.parse(this.lastUpdatedAt)) : null

    return {
      snapshot: this.snapshot,
      freshness: {
        ready: this.snapshot.status === 'ready',
        updatedAt: this.lastUpdatedAt,
        ageMs,
        refreshIntervalMs: this.refreshIntervalMs,
        lastRefreshDurationMs: this.lastRefreshDurationMs,
        refreshing: this.inFlightRefresh !== null,
        lastError: this.lastError,
      },
      runtime: {
        started: this.started,
        advisoryOnly: true,
        replaySafe: true,
        deterministic: true,
        mutatesLiveProposalConfidence: false,
      },
    }
  }

  async start() {
    if (this.started) {
      return
    }

    this.started = true

    try {
      await this.refresh()
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'unknown_error'
    }

    this.intervalHandle = setInterval(() => {
      void this.refresh().catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : 'unknown_error'
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

  async refresh(now = new Date().toISOString()): Promise<ShadowProposalConfidenceSnapshot> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh
    }

    const refreshPromise = (async () => {
      const refreshStartedAt = Date.now()

      try {
        const opportunityState = this.dependencies.opportunitySnapshotStore.getSnapshot()
        const adaptiveState = this.dependencies.adaptiveWeightSnapshotRuntime.getSnapshot()
        const generatedAt = resolveGeneratedAt(
          now,
          opportunityState.snapshot.generatedAt,
          adaptiveState.snapshot.generatedAt,
        )
        const sourceSnapshotSignature = stableJsonString({
          adaptiveGeneratedAt: adaptiveState.snapshot.generatedAt,
          opportunityGeneratedAt: opportunityState.snapshot.generatedAt,
        })

        const suggestionPairs = pairSuggestionsToOpportunities(
          opportunityState.snapshot.opportunities,
          opportunityState.snapshot.suggestions,
        )

        const comparisons = suggestionPairs.map((pair) => {
          const keywordKey = normalizeIdPart(pair.opportunity.keyword)
          const categoryKey = normalizeIdPart(pair.opportunity.category)
          const entityKey = normalizeIdPart(pair.suggestion.entityId)

          const signalWeight = selectBestWeight(
            adaptiveState.snapshot.signalWeights,
            (weight) => normalizeIdPart(weight.signalKeyword) === keywordKey,
          )

          const categoryWeight = selectBestWeight(
            adaptiveState.snapshot.categoryWeights,
            (weight) => normalizeIdPart(weight.category) === categoryKey,
          )

          const entityWeight = selectBestWeight(
            adaptiveState.snapshot.entityWeights,
            (weight) => normalizeIdPart(weight.entityId ?? '') === entityKey,
          )

          const combinedAdaptiveMultiplier = computeAdaptiveMultiplier({
            signalWeight,
            categoryWeight,
            entityWeight,
          })

          const liveConfidence = roundMetric(clamp(pair.suggestion.confidence, 0, 1))
          const shadowConfidence = roundMetric(clamp(liveConfidence * combinedAdaptiveMultiplier, 0, 1))
          const divergenceScore = roundMetric(Math.abs(shadowConfidence - liveConfidence))
          const estimatedEconomicDelta = roundMetric(
            (shadowConfidence - liveConfidence) * clamp(pair.opportunity.economicRelevance, 0, 1),
          )

          const divergenceType = classifyDivergenceType({
            liveConfidence,
            shadowConfidence,
            divergenceScore,
            confidenceThreshold: this.confidenceThreshold,
            divergenceThreshold: this.divergenceThreshold,
          })

          const contribution = computeContribution({
            signalWeight,
            categoryWeight,
            entityWeight,
          })

          const supportingMemoryEvidence = {
            signal: toWeightEvidence(signalWeight),
            category: toWeightEvidence(categoryWeight),
            entity: toWeightEvidence(entityWeight),
          }

          const economicReasoning = {
            baseEconomicRelevance: roundMetric(pair.opportunity.economicRelevance),
            estimatedEconomicDelta,
            rationale: estimatedEconomicDelta >= 0
              ? 'Adaptive confidence uplift increases expected proposal conversion value.'
              : 'Adaptive confidence contraction decreases expected proposal conversion value.',
          }

          const liveDecision = stableJsonString({
            mode: 'live',
            proposalConfidence: liveConfidence,
            suggestedAction: pair.suggestion.suggestedAction,
            entityId: pair.suggestion.entityId,
            opportunityId: pair.opportunity.id,
          })

          const shadowDecision = stableJsonString({
            mode: 'shadow',
            projectionId: buildProjectionId({
              marketSignalId: pair.opportunity.sourceSignalId,
              entityId: pair.suggestion.entityId,
              opportunityId: pair.opportunity.id,
              generatedAt,
              liveConfidence,
              shadowConfidence,
            }),
            shadowProposalConfidence: shadowConfidence,
            adaptiveMultiplier: combinedAdaptiveMultiplier,
            supportingMemoryEvidence,
            contribution,
            economicReasoning,
          })

          const comparison = createShadowDecisionComparison({
            marketSignalId: pair.opportunity.sourceSignalId,
            liveDecision,
            shadowDecision,
            divergenceType,
            divergenceScore,
            estimatedEconomicDelta,
            generatedAt,
          })

          return {
            comparison,
            economicReasoning,
            supportingMemoryEvidence,
            contribution: {
              ...contribution,
              combinedAdaptiveMultiplier,
            },
          } satisfies ComparisonDetail
        }).sort((left, right) => {
          if (left.comparison.divergenceScore !== right.comparison.divergenceScore) {
            return right.comparison.divergenceScore - left.comparison.divergenceScore
          }

          return left.comparison.comparisonId.localeCompare(right.comparison.comparisonId)
        })

        const replayFingerprint = buildReplayFingerprint(comparisons)
        const hadPreviousReadySnapshot = this.snapshot.status === 'ready'
        const previousReplayFingerprint = hadPreviousReadySnapshot
          ? (this.previousReplayFingerprint ?? buildReplayFingerprint(this.snapshot.comparisons))
          : null
        const hasSameSourceSnapshot = this.previousSourceSnapshotSignature === sourceSnapshotSignature
        const replayConsistencyStatus: ShadowProposalConfidenceSnapshot['metrics']['replayConsistencyStatus'] =
          !hadPreviousReadySnapshot || previousReplayFingerprint === null
            ? 'not_evaluated'
            : hasSameSourceSnapshot
              ? (previousReplayFingerprint === replayFingerprint ? 'consistent' : 'inconsistent')
              : 'snapshot_changed'

        const refreshDurationMs = Math.max(0, Date.now() - refreshStartedAt)
        const metrics = computeMetrics({
          comparisons,
          generatedAt,
          refreshDurationMs,
          replayConsistencyStatus,
        })

        this.snapshot = {
          status: 'ready',
          generatedAt,
          comparisons,
          metrics,
        }
        this.lastUpdatedAt = generatedAt
        this.lastRefreshDurationMs = refreshDurationMs
        this.lastError = null

        this.previousReplayFingerprint = replayFingerprint
        this.previousSourceSnapshotSignature = sourceSnapshotSignature

        console.info('shadow.projection.generated', {
          advisoryOnly: true,
          comparisonCount: metrics.comparisonCount,
          generatedAt,
          projectionGenerationCount: metrics.projectionGenerationCount,
          refreshDurationMs: metrics.refreshDurationMs,
        })

        if (metrics.divergenceCount > 0) {
          console.info('shadow.divergence.detected', {
            advisoryOnly: true,
            divergenceCount: metrics.divergenceCount,
            divergenceDistribution: metrics.divergenceDistribution,
            generatedAt,
            highDivergenceCount: metrics.highDivergenceCount,
            maxDivergenceScore: metrics.maxDivergenceScore,
          })
        }

        if (
          metrics.replayConsistencyStatus !== 'not_evaluated'
          && metrics.replayConsistencyStatus !== this.lastLoggedReplayConsistencyStatus
        ) {
          this.lastLoggedReplayConsistencyStatus = metrics.replayConsistencyStatus
          console.info('shadow.replay.verified', {
            advisoryOnly: true,
            generatedAt,
            replayConsistencyStatus: metrics.replayConsistencyStatus,
          })
        }

        return this.snapshot
      } catch (error) {
        this.lastRefreshDurationMs = Math.max(0, Date.now() - refreshStartedAt)
        this.lastError = error instanceof Error ? error.message : 'Failed to refresh shadow proposal confidence runtime.'
        throw error
      }
    })()

    this.inFlightRefresh = refreshPromise

    try {
      return await refreshPromise
    } finally {
      if (this.inFlightRefresh === refreshPromise) {
        this.inFlightRefresh = null
      }
    }
  }
}

export function createShadowProposalConfidenceRuntime(dependencies: ShadowProposalConfidenceRuntimeDependencies) {
  return new ShadowProposalConfidenceRuntime(dependencies)
}
