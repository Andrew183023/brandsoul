import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulDecision, BrandSoulMemoryInfluence, BrandSoulResponsePlan } from '../contracts/BrandSoulDecision'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulDominantStrategy, BrandSoulStrategyBias, BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'

export type BrandSoulStrategyAdaptationResult = {
  decision: BrandSoulDecision
  updatedStrategyProfile: BrandSoulStrategyProfile
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveSuccessScore(interactionSuccess: BrandSoulQualifiedInteractionOutcome['outcome']['interactionSuccess']) {
  if (typeof interactionSuccess === 'boolean') {
    return interactionSuccess ? 1 : 0
  }

  return clamp(interactionSuccess)
}

function resolveDominantStrategy(strategyBias: BrandSoulStrategyBias): BrandSoulDominantStrategy {
  const entries = [
    ['support', strategyBias.supportBias],
    ['exploration', strategyBias.explorationBias],
    ['conversion', strategyBias.conversionBias],
    ['caution', strategyBias.cautionBias],
  ] as const
  const strongest = [...entries].sort((left, right) => right[1] - left[1])[0]

  if (!strongest || strongest[1] < 0.3) {
    return 'balanced'
  }

  return strongest[0]
}

function withCloseStyle(decision: BrandSoulDecision, optionalCloseStyle: BrandSoulResponsePlan['optionalCloseStyle']) {
  return {
    ...decision,
    responsePlan: {
      ...decision.responsePlan,
      optionalCloseStyle,
    },
  }
}

function isCriticalDecision(decision: BrandSoulDecision) {
  return decision.intent === 'guardrail-blocked' || decision.confidence >= 0.84
}

function resolveWeightedOutcome(outcome: BrandSoulQualifiedInteractionOutcome) {
  const weight = resolveQualifiedInteractionOutcomeWeight(outcome)

  return {
    successScore: resolveSuccessScore(outcome.outcome.interactionSuccess),
    signalStrength: clamp(outcome.outcome.signalStrength * weight),
    engagementDelta: clamp(outcome.outcome.engagementDelta * weight, -1, 1),
    continuityWeight: outcome.outcome.userContinuation ? weight : Math.max(weight * 0.85, 0.1),
    ruptureWeight: outcome.outcome.userContinuation ? 0 : Math.max(weight, 0.12),
    evidenceWeight: weight,
  }
}

function applyCurrentStrategyToDecision(
  currentStrategyProfile: BrandSoulStrategyProfile,
  decision: BrandSoulDecision,
  cognitiveState: BrandSoulCognitiveState,
  memorySignals: BrandSoulMemoryInfluence,
  allowSemanticRewrite = true,
) {
  const { strategyBias, adaptationConfidence } = currentStrategyProfile
  const memoryPressure = clamp(memorySignals.influenceStrength / 0.5)
  const availableFlex = clamp(0.12 + adaptationConfidence * 0.08 - memoryPressure * 0.08, 0.02, 0.14)

  if (isCriticalDecision(decision)) {
    return withCloseStyle(decision, decision.responsePlan.optionalCloseStyle)
  }

  let nextDecision: BrandSoulDecision = {
    ...decision,
    responsePlan: {
      ...decision.responsePlan,
    },
  }

  if (!allowSemanticRewrite) {
    if (strategyBias.supportBias >= 0.5 && (nextDecision.intent === 'support' || nextDecision.intent === 'policy')) {
      nextDecision = withCloseStyle(nextDecision, 'safe-guidance')
      nextDecision.confidence = clamp(nextDecision.confidence + availableFlex * 0.12)
    }

    if (strategyBias.explorationBias >= 0.5 && nextDecision.intent === 'product-discovery') {
      nextDecision = withCloseStyle(nextDecision, 'guide-choice')
      nextDecision.confidence = clamp(nextDecision.confidence + availableFlex * 0.1)
    }

    if (
      strategyBias.conversionBias >= 0.6 &&
      strategyBias.cautionBias < 0.68 &&
      (nextDecision.intent === 'promotion' || nextDecision.intent === 'purchase' || nextDecision.action === 'sell')
    ) {
      nextDecision = withCloseStyle(nextDecision, 'explore-promotion')
      nextDecision.confidence = clamp(nextDecision.confidence + availableFlex * 0.08)
    }

    if (strategyBias.cautionBias >= 0.62 && (nextDecision.intent === 'support' || nextDecision.intent === 'policy' || nextDecision.intent === 'general')) {
      nextDecision = withCloseStyle(nextDecision, 'safe-guidance')
      nextDecision.confidence = clamp(nextDecision.confidence - availableFlex * 0.04)
    }

    return nextDecision
  }

  if (
    strategyBias.supportBias >= 0.58 &&
    nextDecision.intent === 'general' &&
    nextDecision.confidence <= 0.72 &&
    cognitiveState.dominantDrive === 'clarify'
  ) {
    nextDecision = {
      ...nextDecision,
      intent: 'support',
      action: 'support',
      responsePlan: {
        kind: 'policy',
        topic: nextDecision.responsePlan.topic,
        intentGoal: 'support-policy-clarity',
        requiredData: nextDecision.responsePlan.requiredData,
        constraints: nextDecision.responsePlan.constraints,
        optionalCloseStyle: 'safe-guidance',
      },
      confidence: clamp(nextDecision.confidence + availableFlex * 0.28),
    }
  } else if (strategyBias.supportBias >= 0.5 && (nextDecision.intent === 'support' || nextDecision.intent === 'policy')) {
    nextDecision = withCloseStyle(nextDecision, 'safe-guidance')
    nextDecision.confidence = clamp(nextDecision.confidence + availableFlex * 0.12)
  }

  if (
    strategyBias.explorationBias >= 0.58 &&
    nextDecision.intent === 'general' &&
    nextDecision.confidence <= 0.7 &&
    cognitiveState.engagementLevel >= 0.52
  ) {
    nextDecision = {
      ...nextDecision,
      intent: 'product-discovery',
      action: 'guide',
      responsePlan: {
        ...nextDecision.responsePlan,
        kind: nextDecision.responsePlan.kind === 'greeting' ? 'general' : 'product',
        intentGoal: 'guide-product-selection',
        optionalCloseStyle: 'guide-choice',
      },
      confidence: clamp(nextDecision.confidence + availableFlex * 0.24),
    }
  } else if (strategyBias.explorationBias >= 0.5 && nextDecision.intent === 'product-discovery') {
    nextDecision = withCloseStyle(nextDecision, 'guide-choice')
    nextDecision.confidence = clamp(nextDecision.confidence + availableFlex * 0.1)
  }

  if (
    strategyBias.conversionBias >= 0.6 &&
    strategyBias.cautionBias < 0.68 &&
    (nextDecision.intent === 'product-discovery' || nextDecision.intent === 'promotion') &&
    nextDecision.action !== 'support'
  ) {
    nextDecision = {
      ...nextDecision,
      action: 'sell',
      responsePlan: {
        ...nextDecision.responsePlan,
        optionalCloseStyle: 'explore-promotion',
      },
      confidence: clamp(nextDecision.confidence + availableFlex * 0.18),
    }
  }

  if (strategyBias.cautionBias >= 0.62) {
    if (nextDecision.intent === 'general' && nextDecision.action === 'sell') {
      nextDecision = {
        ...nextDecision,
        action: 'inform',
        responsePlan: {
          ...nextDecision.responsePlan,
          optionalCloseStyle: 'safe-guidance',
        },
        confidence: clamp(nextDecision.confidence - availableFlex * 0.12),
      }
    } else if (nextDecision.intent === 'support' || nextDecision.intent === 'policy' || nextDecision.intent === 'general') {
      nextDecision = withCloseStyle(nextDecision, 'safe-guidance')
    }
  }

  return nextDecision
}

function updateStrategyProfile(
  currentStrategyProfile: BrandSoulStrategyProfile,
  decision: BrandSoulDecision,
  memorySignals: BrandSoulMemoryInfluence,
  behaviorFeedback?: BrandSoulQualifiedInteractionOutcome,
): BrandSoulStrategyProfile {
  if (!behaviorFeedback) {
    return currentStrategyProfile
  }

  const { successScore, signalStrength, engagementDelta, continuityWeight, ruptureWeight, evidenceWeight } = resolveWeightedOutcome(behaviorFeedback)
  const failurePressure = 1 - successScore
  const behaviorMagnitude = 0.008 + signalStrength * 0.028 + evidenceWeight * 0.012
  const continuityBoost = behaviorFeedback.outcome.userContinuation ? 0.008 + continuityWeight * 0.022 : 0
  const ruptureBoost = behaviorFeedback.outcome.userContinuation ? 0 : 0.012 + ruptureWeight * 0.024 + Math.abs(engagementDelta) * 0.012
  const memoryAlignmentBoost = memorySignals.applied ? (0.004 + memorySignals.influenceStrength * 0.018) * Math.max(evidenceWeight, 0.3) : 0
  const nextBias: BrandSoulStrategyBias = {
    ...currentStrategyProfile.strategyBias,
  }

  if (decision.action === 'sell' && successScore >= 0.62) {
    nextBias.conversionBias = clamp(nextBias.conversionBias + behaviorMagnitude + memoryAlignmentBoost)
    nextBias.cautionBias = clamp(nextBias.cautionBias - 0.008)
  }

  if (decision.action === 'sell' && successScore < 0.45) {
    nextBias.conversionBias = clamp(nextBias.conversionBias - (behaviorMagnitude + failurePressure * 0.02))
    nextBias.supportBias = clamp(nextBias.supportBias + behaviorMagnitude * 0.8)
    nextBias.cautionBias = clamp(nextBias.cautionBias + behaviorMagnitude * 0.65)
  }

  if (decision.action === 'guide' && successScore >= 0.58) {
    nextBias.explorationBias = clamp(nextBias.explorationBias + behaviorMagnitude * 0.85 + continuityBoost)
  }

  if (decision.action === 'support' && successScore >= 0.52) {
    nextBias.supportBias = clamp(nextBias.supportBias + behaviorMagnitude * 0.7 + continuityBoost * 0.6)
  }

  if (behaviorFeedback.outcome.userContinuation) {
    nextBias.explorationBias = clamp(nextBias.explorationBias + continuityBoost)
  }

  if (!behaviorFeedback.outcome.userContinuation) {
    nextBias.cautionBias = clamp(nextBias.cautionBias + ruptureBoost)
  }

  return {
    strategyBias: nextBias,
    dominantStrategy: resolveDominantStrategy(nextBias),
    adaptationConfidence: clamp(
      currentStrategyProfile.adaptationConfidence + behaviorMagnitude * 0.65 + continuityBoost * 0.45 + memoryAlignmentBoost,
      0,
      1,
    ),
    lastStrategyUpdateAt: new Date().toISOString(),
  }
}

export function applyStrategyAdaptationToDecision(args: {
  currentStrategyProfile: BrandSoulStrategyProfile
  decision: BrandSoulDecision
  cognitiveState: BrandSoulCognitiveState
  memorySignals: BrandSoulMemoryInfluence
  behaviorFeedback?: BrandSoulQualifiedInteractionOutcome
  allowSemanticRewrite?: boolean
}): BrandSoulStrategyAdaptationResult {
  const { currentStrategyProfile, decision, cognitiveState, memorySignals, behaviorFeedback, allowSemanticRewrite = true } = args
  const nextDecision = applyCurrentStrategyToDecision(currentStrategyProfile, decision, cognitiveState, memorySignals, allowSemanticRewrite)

  return {
    decision: nextDecision,
    updatedStrategyProfile: updateStrategyProfile(currentStrategyProfile, nextDecision, memorySignals, behaviorFeedback),
  }
}