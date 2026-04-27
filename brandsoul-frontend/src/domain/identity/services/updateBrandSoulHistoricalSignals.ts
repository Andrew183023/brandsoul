import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulHistoricalSignalAggregate, BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulInteractionOutcome } from '../contracts/BrandSoulInteractionOutcome'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import { resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'

const HISTORICAL_DECAY_FACTOR = 0.82

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveSuccessScore(interactionSuccess: BrandSoulInteractionOutcome['interactionSuccess']) {
  if (typeof interactionSuccess === 'boolean') {
    return interactionSuccess ? 1 : 0
  }

  return clamp(interactionSuccess)
}

function blendWeightedAverage(previous: number, next: number, weight: number) {
  const normalizedWeight = clamp(weight)
  const effectiveDecay = clamp(HISTORICAL_DECAY_FACTOR + (1 - normalizedWeight) * 0.12, 0.55, 0.96)

  return clamp(previous * effectiveDecay + next * (1 - effectiveDecay), -1, 1)
}

function updateAggregate(
  aggregate: BrandSoulHistoricalSignalAggregate | undefined,
  qualifiedOutcome: BrandSoulQualifiedInteractionOutcome,
): BrandSoulHistoricalSignalAggregate {
  const previous = aggregate ?? {
    sampleSize: 0,
    successRate: 0.5,
    continuationRate: 0.5,
    averageEngagementDelta: 0,
  }
  const weight = resolveQualifiedInteractionOutcomeWeight(qualifiedOutcome)
  const successScore = resolveSuccessScore(qualifiedOutcome.outcome.interactionSuccess)

  return {
    sampleSize: previous.sampleSize + weight,
    successRate: blendWeightedAverage(previous.successRate, successScore, weight),
    continuationRate: blendWeightedAverage(previous.continuationRate, qualifiedOutcome.outcome.userContinuation ? 1 : 0, weight),
    averageEngagementDelta: blendWeightedAverage(previous.averageEngagementDelta, clamp(qualifiedOutcome.outcome.engagementDelta, -1, 1), weight),
  }
}

export function initializeBrandSoulHistoricalSignals(now = new Date().toISOString()): BrandSoulHistoricalSignals {
  return {
    totalInteractions: 0,
    reliableEvidenceCount: 0,
    rollingSuccessRate: 0.5,
    rollingContinuationRate: 0.5,
    rollingEngagementDelta: 0,
    actionOutcomes: {},
    intentOutcomes: {},
    lastUpdatedAt: now,
  }
}

export function updateBrandSoulHistoricalSignals(
  currentSignals: BrandSoulHistoricalSignals,
  decision: BrandSoulDecision,
  qualifiedOutcome: BrandSoulQualifiedInteractionOutcome,
  now = new Date().toISOString(),
): BrandSoulHistoricalSignals {
  const successScore = resolveSuccessScore(qualifiedOutcome.outcome.interactionSuccess)
  const qualityWeight = resolveQualifiedInteractionOutcomeWeight(qualifiedOutcome)
  const reliabilityWeight =
    qualifiedOutcome.provenance === 'validated'
      ? qualityWeight
      : qualifiedOutcome.provenance === 'observed'
        ? qualityWeight * 0.82
        : qualityWeight * 0.35

  return {
    totalInteractions: currentSignals.totalInteractions + 1,
    reliableEvidenceCount: currentSignals.reliableEvidenceCount + reliabilityWeight,
    rollingSuccessRate: blendWeightedAverage(currentSignals.rollingSuccessRate, successScore, qualityWeight),
    rollingContinuationRate: blendWeightedAverage(currentSignals.rollingContinuationRate, qualifiedOutcome.outcome.userContinuation ? 1 : 0, qualityWeight),
    rollingEngagementDelta: blendWeightedAverage(currentSignals.rollingEngagementDelta, clamp(qualifiedOutcome.outcome.engagementDelta, -1, 1), qualityWeight),
    actionOutcomes: {
      ...currentSignals.actionOutcomes,
      [decision.action]: updateAggregate(currentSignals.actionOutcomes[decision.action], qualifiedOutcome),
    },
    intentOutcomes: {
      ...currentSignals.intentOutcomes,
      [decision.intent]: updateAggregate(currentSignals.intentOutcomes[decision.intent], qualifiedOutcome),
    },
    lastUpdatedAt: now,
  }
}