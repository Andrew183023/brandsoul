import { createHash } from 'node:crypto'

import type { RevenueAttributionRecord } from '../execution/revenue/revenueAttributionEngine.js'
import type { RevenueAttributionAggregate } from '../persistence/revenue/revenueAttributionRepository.js'
import {
  buildEconomicMemoryId,
  type EconomicMemoryRecord,
  type EconomicMemoryRepository,
} from '../persistence/economic/economicMemoryRepository.js'

export type MarketLearningScope = 'signal' | 'category' | 'action'

export type EconomicFeedbackObservation = {
  marketSignalId: string
  signalKeyword: string
  signalCategory: string
  signalSource: string
  actionType: string
  opportunityId: string
  proposalId: string
  executionId: string
  executionStatus: 'completed' | 'failed' | 'pending'
  attributedRevenue?: number
  currency?: string
  observedAt?: string
  attributionId?: string
  attribution?: RevenueAttributionRecord
}

export type EconomicFeedbackObservationDimension = {
  scope: MarketLearningScope
  scopeKey: string
}

export type EconomicFeedbackOutcome = 'success' | 'failure'

export type EconomicLearningLedgerRecord = {
  learningEventId: string
  observationId: string
  executionId: string
  opportunityId: string
  proposalId: string
  outcome: EconomicFeedbackOutcome
  revenueDelta: number
  currency: string
  dimensions: EconomicFeedbackObservationDimension[]
  explanation: string
  appliedAt: string
}

export type MarketLearningScoreRecord = {
  scoreId: string
  scope: MarketLearningScope
  scopeKey: string
  score: number
  weighting: number
  sampleCount: number
  successCount: number
  failureCount: number
  revenueTotal: number
  averageRevenue: number
  lastObservationId: string
  lastObservedAt: string
  updatedAt: string
  explanation: string
}

export type AdaptiveOpportunityWeighting = {
  weightingId: string
  marketSignalId: string
  signalCategory: string
  actionType: string
  signalWeighting: number
  categoryWeighting: number
  actionWeighting: number
  compositeWeighting: number
  confidenceMultiplier: number
  estimatedValueMultiplier: number
  explanation: string
  derivedFromScoreIds: string[]
  updatedAt: string
}

export type EconomicFeedbackEngineRunResult = {
  scores: MarketLearningScoreRecord[]
  ledgerEntries: EconomicLearningLedgerRecord[]
  adaptiveWeightings: AdaptiveOpportunityWeighting[]
  economicMemory: EconomicMemoryRecord[]
  processedObservationIds: string[]
  idempotentObservationIds: string[]
  skippedObservationIds: string[]
}

type EconomicFeedbackEngineOptions = {
  now?: string
  existingScores?: MarketLearningScoreRecord[]
  existingLedger?: EconomicLearningLedgerRecord[]
  existingEconomicMemory?: EconomicMemoryRecord[]
}

type NormalizedObservation = {
  observationId: string
  marketSignalId: string
  signalKeyword: string
  signalCategory: string
  signalSource: string
  actionType: string
  opportunityId: string
  proposalId: string
  executionId: string
  executionStatus: EconomicFeedbackObservation['executionStatus']
  attributedRevenue: number
  currency: string
  observedAt: string
  outcome: EconomicFeedbackOutcome | null
}

function hashValue(value: string) {
  return createHash('sha256').update(value, 'utf-8').digest('hex')
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function blendRate(current: number, observed: number, samples = 1) {
  const weight = clamp(samples / (samples + 4), 0.1, 0.6)
  return clamp((current * (1 - weight)) + (observed * weight))
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`Economic feedback requires ${label}.`)
  }

  return normalized
}

function normalizeCurrency(value?: string) {
  return value?.trim().toUpperCase() || 'USD'
}

function normalizeRevenue(value?: number) {
  if (typeof value === 'undefined') {
    return 0
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Economic feedback requires a finite non-negative attributedRevenue.')
  }

  return Number(value.toString())
}

function normalizeScopeKey(value: string) {
  return normalizeRequired(value, 'scopeKey').toLowerCase()
}

function normalizeSignalKeyword(value: string) {
  return normalizeRequired(value, 'signalKeyword').toLowerCase()
}

function buildObservationId(observation: EconomicFeedbackObservation) {
  if (typeof observation.attributionId === 'string' && observation.attributionId.trim().length > 0) {
    return `economic-feedback:${normalizeIdPart(observation.attributionId).slice(0, 32)}`
  }

  if (observation.attribution?.attributionId) {
    return `economic-feedback:${normalizeIdPart(observation.attribution.attributionId).slice(0, 32)}`
  }

  return [
    'economic-feedback',
    hashValue([
      observation.marketSignalId,
      observation.signalKeyword,
      observation.opportunityId,
      observation.proposalId,
      observation.executionId,
      observation.signalCategory,
      observation.signalSource,
      observation.actionType,
      observation.executionStatus,
      normalizeRevenue(observation.attributedRevenue ?? observation.attribution?.revenue),
      normalizeCurrency(observation.currency ?? observation.attribution?.currency),
    ].join(':')).slice(0, 24),
  ].join(':')
}

function buildScoreId(scope: MarketLearningScope, scopeKey: string) {
  return [
    'market-learning-score',
    scope,
    normalizeIdPart(scopeKey).slice(0, 32),
  ].join(':').slice(0, 128)
}

function buildLearningEventId(observationId: string) {
  return [
    'economic-learning-event',
    normalizeIdPart(observationId).slice(0, 48),
  ].join(':').slice(0, 128)
}

function buildWeightingId(args: {
  marketSignalId: string
  signalCategory: string
  actionType: string
}) {
  return [
    'adaptive-opportunity-weighting',
    hashValue(`${args.marketSignalId}:${args.signalCategory}:${args.actionType}`).slice(0, 24),
  ].join(':')
}

function buildScoreMap(existingScores: MarketLearningScoreRecord[]) {
  const scoreMap = new Map<string, MarketLearningScoreRecord>()

  for (const score of existingScores) {
    scoreMap.set(`${score.scope}:${score.scopeKey}`, { ...score })
  }

  return scoreMap
}

function determineOutcome(args: {
  executionStatus: EconomicFeedbackObservation['executionStatus']
  attributedRevenue: number
}) {
  if (args.attributedRevenue > 0) {
    return 'success' as const
  }

  if (args.executionStatus === 'failed' || args.executionStatus === 'completed') {
    return 'failure' as const
  }

  return null
}

function normalizeObservation(observation: EconomicFeedbackObservation, now: string): NormalizedObservation {
  const marketSignalId = normalizeRequired(observation.marketSignalId, 'marketSignalId')
  const signalKeyword = normalizeSignalKeyword(observation.signalKeyword)
  const opportunityId = normalizeRequired(observation.opportunityId, 'opportunityId')
  const proposalId = normalizeRequired(observation.proposalId, 'proposalId')
  const executionId = normalizeRequired(observation.executionId, 'executionId')
  const signalCategory = normalizeRequired(observation.signalCategory, 'signalCategory')
  const signalSource = normalizeRequired(observation.signalSource, 'signalSource')
  const actionType = normalizeRequired(observation.actionType, 'actionType')
  const attributedRevenue = normalizeRevenue(observation.attributedRevenue ?? observation.attribution?.revenue)
  const currency = normalizeCurrency(observation.currency ?? observation.attribution?.currency)
  const observedAt = observation.observedAt?.trim()
    || observation.attribution?.recognizedAt?.trim()
    || now

  return {
    observationId: buildObservationId(observation),
    marketSignalId,
    signalKeyword,
    signalCategory,
    signalSource,
    actionType,
    opportunityId,
    proposalId,
    executionId,
    executionStatus: observation.executionStatus,
    attributedRevenue,
    currency,
    observedAt,
    outcome: determineOutcome({
      executionStatus: observation.executionStatus,
      attributedRevenue,
    }),
  }
}

function buildDimensions(observation: NormalizedObservation): EconomicFeedbackObservationDimension[] {
  return [
    { scope: 'signal', scopeKey: observation.marketSignalId },
    { scope: 'category', scopeKey: observation.signalCategory },
    { scope: 'action', scopeKey: observation.actionType },
  ]
}

function buildObservedScore(outcome: EconomicFeedbackOutcome, attributedRevenue: number) {
  const revenueSignal = clamp(attributedRevenue / 5000)

  return outcome === 'success'
    ? clamp(0.62 + (revenueSignal * 0.28))
    : 0.18
}

function buildWeighting(score: number) {
  return roundMetric(clamp(0.7 + (score * 0.6), 0.7, 1.3))
}

function buildScoreExplanation(args: {
  scope: MarketLearningScope
  scopeKey: string
  previousScore: number
  nextScore: number
  weighting: number
  outcome: EconomicFeedbackOutcome
  attributedRevenue: number
  currency: string
  signalSource: string
}) {
  const direction = args.nextScore >= args.previousScore ? 'increased' : 'reduced'
  const revenueFragment = args.attributedRevenue > 0
    ? ` after ${args.currency} ${args.attributedRevenue} attributed revenue`
    : ' after a no-revenue execution'

  return [
    `Economic feedback ${direction} ${args.scope} weighting for ${args.scopeKey}`,
    `because ${args.outcome === 'success' ? 'success' : 'failure'} was observed from signal source ${args.signalSource}${revenueFragment}.`,
    `Score moved from ${roundMetric(args.previousScore)} to ${roundMetric(args.nextScore)} and weighting is now ${args.weighting}.`,
  ].join(' ')
}

function updateScoreRecord(args: {
  existing: MarketLearningScoreRecord | undefined
  scope: MarketLearningScope
  scopeKey: string
  observation: NormalizedObservation
  observedScore: number
  now: string
}) {
  const existing = args.existing
  const previousScore = existing?.score ?? 0.5
  const previousSampleCount = existing?.sampleCount ?? 0
  const nextSampleCount = previousSampleCount + 1
  const nextScore = roundMetric(blendRate(previousScore, args.observedScore, nextSampleCount))
  const nextRevenueTotal = roundMetric((existing?.revenueTotal ?? 0) + args.observation.attributedRevenue)
  const nextSuccessCount = (existing?.successCount ?? 0) + (args.observation.outcome === 'success' ? 1 : 0)
  const nextFailureCount = (existing?.failureCount ?? 0) + (args.observation.outcome === 'failure' ? 1 : 0)
  const nextAverageRevenue = roundMetric(nextRevenueTotal / nextSampleCount)
  const weighting = buildWeighting(nextScore)
  const explanation = buildScoreExplanation({
    scope: args.scope,
    scopeKey: args.scopeKey,
    previousScore,
    nextScore,
    weighting,
    outcome: args.observation.outcome!,
    attributedRevenue: args.observation.attributedRevenue,
    currency: args.observation.currency,
    signalSource: args.observation.signalSource,
  })

  return {
    scoreId: existing?.scoreId ?? buildScoreId(args.scope, args.scopeKey),
    scope: args.scope,
    scopeKey: args.scopeKey,
    score: nextScore,
    weighting,
    sampleCount: nextSampleCount,
    successCount: nextSuccessCount,
    failureCount: nextFailureCount,
    revenueTotal: nextRevenueTotal,
    averageRevenue: nextAverageRevenue,
    lastObservationId: args.observation.observationId,
    lastObservedAt: args.observation.observedAt,
    updatedAt: args.now,
    explanation,
  } satisfies MarketLearningScoreRecord
}

function buildLedgerExplanation(observation: NormalizedObservation, outcome: EconomicFeedbackOutcome) {
  return outcome === 'success'
    ? `Recorded successful economic feedback for execution ${observation.executionId} with ${observation.currency} ${observation.attributedRevenue} revenue.`
    : `Recorded failed economic feedback for execution ${observation.executionId} because the execution produced no attributed revenue.`
}

function buildAdaptiveWeighting(args: {
  observation: NormalizedObservation
  scoreMap: Map<string, MarketLearningScoreRecord>
  now: string
}) {
  const signalScore = args.scoreMap.get(`signal:${args.observation.marketSignalId}`)
  const categoryScore = args.scoreMap.get(`category:${args.observation.signalCategory}`)
  const actionScore = args.scoreMap.get(`action:${args.observation.actionType}`)
  const signalWeighting = signalScore?.weighting ?? 1
  const categoryWeighting = categoryScore?.weighting ?? 1
  const actionWeighting = actionScore?.weighting ?? 1
  const compositeWeighting = roundMetric(
    (signalWeighting * 0.45) + (categoryWeighting * 0.3) + (actionWeighting * 0.25),
  )
  const confidenceMultiplier = roundMetric(clamp(0.85 + ((compositeWeighting - 1) * 0.75), 0.6, 1.4))
  const estimatedValueMultiplier = roundMetric(clamp(0.82 + ((compositeWeighting - 1) * 0.9), 0.65, 1.5))
  const derivedFromScoreIds = [signalScore?.scoreId, categoryScore?.scoreId, actionScore?.scoreId]
    .filter((value): value is string => Boolean(value))

  return {
    weightingId: buildWeightingId({
      marketSignalId: args.observation.marketSignalId,
      signalCategory: args.observation.signalCategory,
      actionType: args.observation.actionType,
    }),
    marketSignalId: args.observation.marketSignalId,
    signalCategory: args.observation.signalCategory,
    actionType: args.observation.actionType,
    signalWeighting: roundMetric(signalWeighting),
    categoryWeighting: roundMetric(categoryWeighting),
    actionWeighting: roundMetric(actionWeighting),
    compositeWeighting,
    confidenceMultiplier,
    estimatedValueMultiplier,
    explanation: `Adaptive weighting combines signal (${roundMetric(signalWeighting)}), category (${roundMetric(categoryWeighting)}), and action (${roundMetric(actionWeighting)}) to produce composite weighting ${compositeWeighting}.`,
    derivedFromScoreIds,
    updatedAt: args.now,
  } satisfies AdaptiveOpportunityWeighting
}

function buildEconomicMemoryMap(existingMemory: EconomicMemoryRecord[]) {
  const memoryMap = new Map<string, EconomicMemoryRecord>()

  for (const memory of existingMemory) {
    memoryMap.set(memory.memoryId, { ...memory })
  }

  return memoryMap
}

function updateEconomicMemoryRecord(args: {
  existing: EconomicMemoryRecord | undefined
  observation: NormalizedObservation
  now: string
}) {
  const successCount = (args.existing?.successCount ?? 0) + (args.observation.outcome === 'success' ? 1 : 0)
  const failureCount = (args.existing?.failureCount ?? 0) + (args.observation.outcome === 'failure' ? 1 : 0)
  const totalCount = successCount + failureCount
  const totalRevenue = roundMetric((args.existing?.totalRevenue ?? 0) + args.observation.attributedRevenue)
  const averageConversion = totalCount > 0
    ? roundMetric(successCount / totalCount)
    : 0

  return {
    memoryId: args.existing?.memoryId ?? buildEconomicMemoryId(args.observation.signalCategory, args.observation.signalKeyword),
    memoryScope: args.existing?.memoryScope ?? 'signal',
    category: args.observation.signalCategory,
    signalKeyword: args.observation.signalKeyword,
    entityId: args.existing?.entityId ?? null,
    successCount,
    failureCount,
    sampleCount: totalCount,
    minimumSampleCount: args.existing?.minimumSampleCount ?? 3,
    totalRevenue,
    averageConversion,
    timeDecayWeight: args.existing?.timeDecayWeight ?? 1,
    decayHalfLifeDays: args.existing?.decayHalfLifeDays ?? 30,
    lastSeenAt: args.observation.observedAt,
    updatedAt: args.now,
  } satisfies EconomicMemoryRecord
}

function sortScores(scores: MarketLearningScoreRecord[]) {
  return [...scores].sort((left, right) => {
    if (left.scope === right.scope) {
      return left.scopeKey.localeCompare(right.scopeKey)
    }

    return left.scope.localeCompare(right.scope)
  })
}

function sortLedgerEntries(entries: EconomicLearningLedgerRecord[]) {
  return [...entries].sort((left, right) => left.observationId.localeCompare(right.observationId))
}

function sortAdaptiveWeightings(weightings: AdaptiveOpportunityWeighting[]) {
  return [...weightings].sort((left, right) => left.weightingId.localeCompare(right.weightingId))
}

export function buildEconomicFeedbackObservation(args: {
  attribution: RevenueAttributionRecord
  signalKeyword: string
  signalCategory: string
  signalSource: string
  actionType: string
  executionStatus?: EconomicFeedbackObservation['executionStatus']
}) {
  return {
    marketSignalId: args.attribution.marketSignalId,
    signalKeyword: args.signalKeyword,
    signalCategory: args.signalCategory,
    signalSource: args.signalSource,
    actionType: args.actionType,
    opportunityId: args.attribution.opportunityId,
    proposalId: args.attribution.proposalId,
    executionId: args.attribution.executionId,
    executionStatus: args.executionStatus ?? 'completed',
    attributedRevenue: args.attribution.revenue,
    currency: args.attribution.currency,
    observedAt: args.attribution.recognizedAt,
    attributionId: args.attribution.attributionId,
    attribution: args.attribution,
  } satisfies EconomicFeedbackObservation
}

export function buildEconomicFeedbackObservationFromPersistedAttribution(args: {
  attribution: RevenueAttributionAggregate
  signalKeyword: string
  signalCategory: string
  signalSource: string
  actionType: string
  executionStatus?: EconomicFeedbackObservation['executionStatus']
}) {
  return {
    marketSignalId: args.attribution.marketSignalId,
    signalKeyword: args.signalKeyword,
    signalCategory: args.signalCategory,
    signalSource: args.signalSource,
    actionType: args.actionType,
    opportunityId: args.attribution.opportunityId,
    proposalId: args.attribution.proposalId,
    executionId: args.attribution.executionId,
    executionStatus: args.executionStatus ?? 'completed',
    attributedRevenue: args.attribution.attributedRevenue,
    observedAt: args.attribution.createdAt,
    attributionId: args.attribution.attributionId,
  } satisfies EconomicFeedbackObservation
}

export class EconomicFeedbackEngine {
  learn(
    observations: EconomicFeedbackObservation[],
    options: EconomicFeedbackEngineOptions = {},
  ): EconomicFeedbackEngineRunResult {
    const now = options.now ?? new Date().toISOString()
    const normalizedObservations = observations
      .map((observation) => normalizeObservation(observation, now))
      .sort((left, right) => left.observationId.localeCompare(right.observationId))
    const existingLedger = new Map(
      (options.existingLedger ?? []).map((entry) => [entry.observationId, entry]),
    )
    const scoreMap = buildScoreMap(options.existingScores ?? [])
    const economicMemoryMap = buildEconomicMemoryMap(options.existingEconomicMemory ?? [])
    const ledgerEntries: EconomicLearningLedgerRecord[] = []
    const adaptiveWeightingMap = new Map<string, AdaptiveOpportunityWeighting>()
    const processedObservationIds: string[] = []
    const idempotentObservationIds: string[] = []
    const skippedObservationIds: string[] = []

    for (const observation of normalizedObservations) {
      if (existingLedger.has(observation.observationId)) {
        idempotentObservationIds.push(observation.observationId)
        continue
      }

      if (!observation.outcome) {
        skippedObservationIds.push(observation.observationId)
        continue
      }

      const dimensions = buildDimensions(observation)
      const observedScore = buildObservedScore(observation.outcome, observation.attributedRevenue)

      for (const dimension of dimensions) {
        const key = `${dimension.scope}:${dimension.scopeKey}`
        const existingScore = scoreMap.get(key)
        const nextScore = updateScoreRecord({
          existing: existingScore,
          scope: dimension.scope,
          scopeKey: normalizeScopeKey(dimension.scopeKey),
          observation,
          observedScore,
          now,
        })

        scoreMap.set(`${nextScore.scope}:${nextScore.scopeKey}`, nextScore)
      }

      ledgerEntries.push({
        learningEventId: buildLearningEventId(observation.observationId),
        observationId: observation.observationId,
        executionId: observation.executionId,
        opportunityId: observation.opportunityId,
        proposalId: observation.proposalId,
        outcome: observation.outcome,
        revenueDelta: roundMetric(observation.attributedRevenue),
        currency: observation.currency,
        dimensions,
        explanation: buildLedgerExplanation(observation, observation.outcome),
        appliedAt: now,
      })
      processedObservationIds.push(observation.observationId)

      const adaptiveWeighting = buildAdaptiveWeighting({
        observation,
        scoreMap,
        now,
      })
      adaptiveWeightingMap.set(adaptiveWeighting.weightingId, adaptiveWeighting)

      const memoryId = buildEconomicMemoryId(observation.signalCategory, observation.signalKeyword)
      const updatedMemory = updateEconomicMemoryRecord({
        existing: economicMemoryMap.get(memoryId),
        observation,
        now,
      })
      economicMemoryMap.set(updatedMemory.memoryId, updatedMemory)
    }

    return {
      scores: sortScores(Array.from(scoreMap.values())),
      ledgerEntries: sortLedgerEntries(ledgerEntries),
      adaptiveWeightings: sortAdaptiveWeightings(Array.from(adaptiveWeightingMap.values())),
      economicMemory: Array.from(economicMemoryMap.values()).sort((left, right) => left.memoryId.localeCompare(right.memoryId)),
      processedObservationIds,
      idempotentObservationIds,
      skippedObservationIds,
    }
  }

  async learnAndPersist(args: {
    observations: EconomicFeedbackObservation[]
    economicMemoryRepository: EconomicMemoryRepository
    now?: string
    existingScores?: MarketLearningScoreRecord[]
    existingLedger?: EconomicLearningLedgerRecord[]
    existingEconomicMemory?: EconomicMemoryRecord[]
  }): Promise<EconomicFeedbackEngineRunResult> {
    const result = this.learn(args.observations, {
      now: args.now,
      existingScores: args.existingScores,
      existingLedger: args.existingLedger,
      existingEconomicMemory: args.existingEconomicMemory,
    })

    for (const memoryRecord of result.economicMemory) {
      const persisted = await args.economicMemoryRepository.updateEconomicMemory(memoryRecord)
      console.info('economic.memory.updated', {
        memoryId: persisted.memoryId,
        category: persisted.category,
        signalKeyword: persisted.signalKeyword,
        successCount: persisted.successCount,
        failureCount: persisted.failureCount,
        totalRevenue: persisted.totalRevenue,
        averageConversion: persisted.averageConversion,
      })
    }

    return result
  }
}

export function createEconomicFeedbackEngine() {
  return new EconomicFeedbackEngine()
}
