import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulActionPreferenceMatrix, BrandSoulIntentPriorityOverrides, BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { initializeBrandSoulPolicyProfile } from './initializeBrandSoulPolicyProfile'
import { resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'

const POLICY_PRIORITY_HYSTERESIS = 0.025
const POLICY_MATRIX_HYSTERESIS = 0.03
const MAX_PRIORITY_STEP = 0.06
const MAX_ACTION_STEP = 0.06
const MAX_WEIGHT_STEP = 0.04
const MAX_CONFIDENCE_PROFILE_STEP = 0.025

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveSuccessScore(interactionSuccess: BrandSoulQualifiedInteractionOutcome['outcome']['interactionSuccess']) {
  if (typeof interactionSuccess === 'boolean') {
    return interactionSuccess ? 1 : 0
  }

  return clamp(interactionSuccess)
}

function resolveEvidenceStrength(
  historicalSignals: BrandSoulHistoricalSignals,
  behaviorFeedback: BrandSoulQualifiedInteractionOutcome | undefined,
  memorySignals: BrandSoulMemoryInfluence,
) {
  const historicalStrength = clamp(historicalSignals.reliableEvidenceCount / 6)
  const feedbackStrength = behaviorFeedback
    ? clamp(behaviorFeedback.outcome.signalStrength * resolveQualifiedInteractionOutcomeWeight(behaviorFeedback))
    : 0

  return clamp(historicalStrength * 0.55 + feedbackStrength * 0.3 + memorySignals.influenceStrength * 0.15)
}

function moveToward(current: number, target: number, maxStep: number, hysteresis: number) {
  if (Math.abs(target - current) < hysteresis) {
    return current
  }

  if (target > current) {
    return clamp(current + Math.min(maxStep, target - current))
  }

  return clamp(current - Math.min(maxStep, current - target))
}

function updateIntentOverrides(
  currentOverrides: BrandSoulIntentPriorityOverrides,
  targetOverrides: BrandSoulIntentPriorityOverrides,
  step: number,
) {
  const nextOverrides: BrandSoulIntentPriorityOverrides = { ...currentOverrides }

  for (const [intent, targetValue] of Object.entries(targetOverrides)) {
    nextOverrides[intent as keyof BrandSoulIntentPriorityOverrides] = moveToward(
      currentOverrides[intent as keyof BrandSoulIntentPriorityOverrides] ?? 0.4,
      targetValue,
      step,
      POLICY_PRIORITY_HYSTERESIS,
    )
  }

  return nextOverrides
}

function updateActionMatrix(
  currentMatrix: BrandSoulActionPreferenceMatrix,
  targetMatrix: BrandSoulActionPreferenceMatrix,
  step: number,
) {
  const nextMatrix: BrandSoulActionPreferenceMatrix = { ...currentMatrix }

  for (const [intent, actionScores] of Object.entries(targetMatrix)) {
    const currentActionScores = currentMatrix[intent as keyof BrandSoulActionPreferenceMatrix] ?? {}
    const nextActionScores = { ...currentActionScores }

    for (const [action, targetValue] of Object.entries(actionScores ?? {})) {
      nextActionScores[action as keyof typeof nextActionScores] = moveToward(
        currentActionScores[action as keyof typeof currentActionScores] ?? 0,
        targetValue,
        step,
        POLICY_MATRIX_HYSTERESIS,
      )
    }

    nextMatrix[intent as keyof BrandSoulActionPreferenceMatrix] = nextActionScores
  }

  return nextMatrix
}

export function applyPolicyAdaptation(args: {
  policyProfile: BrandSoulPolicyProfile
  strategyProfile: BrandSoulStrategyProfile
  cognitiveState: BrandSoulCognitiveState
  memorySignals: BrandSoulMemoryInfluence
  behaviorFeedback?: BrandSoulQualifiedInteractionOutcome
  historicalSignals: BrandSoulHistoricalSignals
}): BrandSoulPolicyProfile {
  const { policyProfile, strategyProfile, cognitiveState, memorySignals, behaviorFeedback, historicalSignals } = args
  const baselinePolicy = initializeBrandSoulPolicyProfile(strategyProfile, cognitiveState)
  const evidenceStrength = resolveEvidenceStrength(historicalSignals, behaviorFeedback, memorySignals)
  const evidenceThreshold = policyProfile.confidenceAdjustmentProfile.evidenceThreshold
  const hasMinimumEvidence = historicalSignals.reliableEvidenceCount >= evidenceThreshold
  const behaviorWeight = behaviorFeedback ? resolveQualifiedInteractionOutcomeWeight(behaviorFeedback) : 0
  const successScore = behaviorFeedback ? resolveSuccessScore(behaviorFeedback.outcome.interactionSuccess) : historicalSignals.rollingSuccessRate
  const continuationRate = historicalSignals.rollingContinuationRate
  const consistency = clamp(successScore * (0.35 + behaviorWeight * 0.15) + continuationRate * 0.3 + ((historicalSignals.rollingEngagementDelta + 1) / 2) * 0.2)
  const conservativeFactor = clamp(0.45 + policyProfile.policyStability * 0.35 + (1 - policyProfile.policyDrift) * 0.2)

  const weightStep = MAX_WEIGHT_STEP * conservativeFactor * (hasMinimumEvidence ? 1 : 0.3)
  const priorityStep = MAX_PRIORITY_STEP * conservativeFactor * Math.max(evidenceStrength, hasMinimumEvidence ? 0.45 : 0.16)
  const actionStep = MAX_ACTION_STEP * conservativeFactor * Math.max(evidenceStrength, hasMinimumEvidence ? 0.45 : 0.16)
  const confidenceStep = MAX_CONFIDENCE_PROFILE_STEP * conservativeFactor

  const nextDecisionWeights = {
    intentShiftWeight: moveToward(policyProfile.decisionWeights.intentShiftWeight, baselinePolicy.decisionWeights.intentShiftWeight + strategyProfile.strategyBias.explorationBias * 0.06 + strategyProfile.strategyBias.supportBias * 0.04 - strategyProfile.strategyBias.cautionBias * 0.03, weightStep, 0.02),
    actionShiftWeight: moveToward(policyProfile.decisionWeights.actionShiftWeight, baselinePolicy.decisionWeights.actionShiftWeight + strategyProfile.strategyBias.conversionBias * 0.08 + strategyProfile.strategyBias.explorationBias * 0.04 - strategyProfile.strategyBias.cautionBias * 0.05, weightStep, 0.02),
    confidenceWeight: moveToward(policyProfile.decisionWeights.confidenceWeight, baselinePolicy.decisionWeights.confidenceWeight + strategyProfile.adaptationConfidence * 0.04 + consistency * 0.03, weightStep, 0.02),
    memoryWeight: moveToward(policyProfile.decisionWeights.memoryWeight, baselinePolicy.decisionWeights.memoryWeight + memorySignals.influenceStrength * 0.08, weightStep, 0.02),
  }

  const targetIntentOverrides = initializeBrandSoulPolicyProfile(strategyProfile, cognitiveState).intentPriorityOverrides
  const targetActionMatrix = initializeBrandSoulPolicyProfile(strategyProfile, cognitiveState).actionPreferenceMatrix

  const nextIntentPriorityOverrides = updateIntentOverrides(policyProfile.intentPriorityOverrides, targetIntentOverrides, priorityStep)
  const nextActionPreferenceMatrix = updateActionMatrix(policyProfile.actionPreferenceMatrix, targetActionMatrix, actionStep)

  const sellOutcome = historicalSignals.actionOutcomes.sell
  const supportOutcome = historicalSignals.actionOutcomes.support
  const guideOutcome = historicalSignals.actionOutcomes.guide
  const sellSignal = sellOutcome ? sellOutcome.successRate - 0.5 : 0
  const supportSignal = supportOutcome ? supportOutcome.successRate - 0.5 : 0
  const guideSignal = guideOutcome ? guideOutcome.successRate - 0.5 : 0
  const failurePressure = 1 - successScore

  const nextConfidenceAdjustmentProfile = {
    ...policyProfile.confidenceAdjustmentProfile,
    baseAdjustment: moveToward(
      policyProfile.confidenceAdjustmentProfile.baseAdjustment,
      clamp((consistency - 0.5) * 0.08, -0.04, 0.04),
      confidenceStep,
      0.008,
    ),
    intentAdjustments: {
      ...policyProfile.confidenceAdjustmentProfile.intentAdjustments,
      support: moveToward(policyProfile.confidenceAdjustmentProfile.intentAdjustments.support ?? 0, clamp(supportSignal * 0.08 + strategyProfile.strategyBias.supportBias * 0.03, -0.06, 0.08), confidenceStep, 0.008),
      'product-discovery': moveToward(policyProfile.confidenceAdjustmentProfile.intentAdjustments['product-discovery'] ?? 0, clamp(guideSignal * 0.08 + strategyProfile.strategyBias.explorationBias * 0.03, -0.06, 0.08), confidenceStep, 0.008),
      promotion: moveToward(policyProfile.confidenceAdjustmentProfile.intentAdjustments.promotion ?? 0, clamp(sellSignal * 0.08 - strategyProfile.strategyBias.cautionBias * 0.03, -0.08, 0.08), confidenceStep, 0.008),
    },
    actionAdjustments: {
      ...policyProfile.confidenceAdjustmentProfile.actionAdjustments,
      sell: moveToward(policyProfile.confidenceAdjustmentProfile.actionAdjustments.sell ?? 0, clamp(sellSignal * 0.08 - failurePressure * 0.03, -0.08, 0.08), confidenceStep, 0.008),
      guide: moveToward(policyProfile.confidenceAdjustmentProfile.actionAdjustments.guide ?? 0, clamp(guideSignal * 0.08 + continuationRate * 0.03, -0.06, 0.08), confidenceStep, 0.008),
      support: moveToward(policyProfile.confidenceAdjustmentProfile.actionAdjustments.support ?? 0, clamp(supportSignal * 0.08 + strategyProfile.strategyBias.cautionBias * 0.02, -0.06, 0.08), confidenceStep, 0.008),
    },
    maxAdjustment: moveToward(policyProfile.confidenceAdjustmentProfile.maxAdjustment, clamp(baselinePolicy.confidenceAdjustmentProfile.maxAdjustment + evidenceStrength * 0.02, 0.05, 0.1), confidenceStep, 0.005),
    decayFactor: moveToward(policyProfile.confidenceAdjustmentProfile.decayFactor, clamp(0.08 + (1 - consistency) * 0.12, 0.08, 0.2), confidenceStep, 0.008),
  }

  const averageWeightDelta =
    Math.abs(nextDecisionWeights.intentShiftWeight - baselinePolicy.decisionWeights.intentShiftWeight) +
    Math.abs(nextDecisionWeights.actionShiftWeight - baselinePolicy.decisionWeights.actionShiftWeight) +
    Math.abs(nextDecisionWeights.confidenceWeight - baselinePolicy.decisionWeights.confidenceWeight) +
    Math.abs(nextDecisionWeights.memoryWeight - baselinePolicy.decisionWeights.memoryWeight)
  const driftPressure = clamp(averageWeightDelta + (1 - consistency) * 0.12 + (hasMinimumEvidence ? 0.02 : 0.06))
  const nextPolicyDrift = moveToward(policyProfile.policyDrift, clamp(policyProfile.policyDrift * (1 - nextConfidenceAdjustmentProfile.decayFactor) + driftPressure * 0.35, 0, 1), MAX_CONFIDENCE_PROFILE_STEP, 0.008)
  const nextPolicyStability = moveToward(policyProfile.policyStability, clamp(policyProfile.policyStability + consistency * 0.06 - nextPolicyDrift * 0.08 + (hasMinimumEvidence ? 0.03 : -0.02), 0, 1), MAX_CONFIDENCE_PROFILE_STEP, 0.008)

  return {
    decisionWeights: nextDecisionWeights,
    intentPriorityOverrides: nextIntentPriorityOverrides,
    actionPreferenceMatrix: nextActionPreferenceMatrix,
    confidenceAdjustmentProfile: nextConfidenceAdjustmentProfile,
    policyStability: nextPolicyStability,
    policyDrift: nextPolicyDrift,
  }
}