import type { BrandSoulAdaptiveDecisionProfile, BrandSoulActionSelectionBias, BrandSoulIntentSelectionWeights } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'
import { initializeBrandSoulAdaptiveDecisionProfile } from './initializeBrandSoulAdaptiveDecisionProfile'

const ADAPTIVE_INTENT_HYSTERESIS = 0.03
const ADAPTIVE_ACTION_HYSTERESIS = 0.03
const ADAPTIVE_CONFIDENCE_HYSTERESIS = 0.01
const MAX_INTENT_STEP = 0.05
const MAX_ACTION_STEP = 0.05
const MAX_SCALE_STEP = 0.025
const MAX_BALANCE_STEP = 0.04
const MAX_META_STEP = 0.035

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function clampScale(value: number, min = 0.9, max = 1.12) {
  return Math.min(max, Math.max(min, value))
}

function moveToward(current: number, target: number, maxStep: number, hysteresis: number, min = 0, max = 1) {
  if (Math.abs(target - current) < hysteresis) {
    return current
  }

  if (target > current) {
    return Math.min(max, current + Math.min(maxStep, target - current))
  }

  return Math.max(min, current - Math.min(maxStep, current - target))
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function resolveAggregateSignal(successRate: number, continuationRate: number, averageEngagementDelta: number) {
  return clamp(successRate * 0.5 + continuationRate * 0.3 + ((averageEngagementDelta + 1) / 2) * 0.2)
}

function updateIntentSelectionWeights(
  currentWeights: BrandSoulIntentSelectionWeights,
  targetWeights: BrandSoulIntentSelectionWeights,
  step: number,
) {
  const nextWeights: BrandSoulIntentSelectionWeights = { ...currentWeights }

  for (const [intent, targetValue] of Object.entries(targetWeights)) {
    nextWeights[intent as keyof BrandSoulIntentSelectionWeights] = moveToward(
      currentWeights[intent as keyof BrandSoulIntentSelectionWeights] ?? 0.4,
      targetValue,
      step,
      ADAPTIVE_INTENT_HYSTERESIS,
    )
  }

  return nextWeights
}

function updateActionSelectionBias(
  currentBias: BrandSoulActionSelectionBias,
  targetBias: BrandSoulActionSelectionBias,
  step: number,
) {
  const nextBias: BrandSoulActionSelectionBias = { ...currentBias }

  for (const [action, targetValue] of Object.entries(targetBias)) {
    nextBias[action as keyof BrandSoulActionSelectionBias] = moveToward(
      currentBias[action as keyof BrandSoulActionSelectionBias] ?? 0.3,
      targetValue,
      step,
      ADAPTIVE_ACTION_HYSTERESIS,
    )
  }

  return nextBias
}

export function applyAdaptiveDecisionLearning(args: {
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  historicalSignals: BrandSoulHistoricalSignals
  qualifiedOutcomes: BrandSoulQualifiedInteractionOutcome[]
  strategyProfile: BrandSoulStrategyProfile
  policyProfile: BrandSoulPolicyProfile
}): BrandSoulAdaptiveDecisionProfile {
  const { adaptiveDecisionProfile, historicalSignals, qualifiedOutcomes, strategyProfile, policyProfile } = args
  const baselineProfile = initializeBrandSoulAdaptiveDecisionProfile(strategyProfile, policyProfile)
  const outcomeWeights = qualifiedOutcomes.map((outcome) => resolveQualifiedInteractionOutcomeWeight(outcome))
  const outcomeStrength = average(outcomeWeights)
  const reliableEvidence = historicalSignals.reliableEvidenceCount + outcomeWeights.reduce((sum, value) => sum + value, 0)
  const evidenceThreshold = Math.max(
    adaptiveDecisionProfile.confidenceScalingProfile.evidenceThreshold,
    adaptiveDecisionProfile.safetyProfile.minimumEvidence,
  )
  const hasMinimumEvidence = reliableEvidence >= evidenceThreshold
  const consistency = resolveAggregateSignal(
    historicalSignals.rollingSuccessRate,
    historicalSignals.rollingContinuationRate,
    historicalSignals.rollingEngagementDelta,
  )
  const evidenceStrength = clamp((historicalSignals.reliableEvidenceCount / 6) * 0.65 + outcomeStrength * 0.35)
  const conservativeFactor = clamp(0.42 + adaptiveDecisionProfile.adaptationConfidence * 0.32 + (1 - adaptiveDecisionProfile.decisionDrift) * 0.26)
  const intentStep = MAX_INTENT_STEP * conservativeFactor * Math.max(evidenceStrength, hasMinimumEvidence ? 0.42 : 0.12)
  const actionStep = MAX_ACTION_STEP * conservativeFactor * Math.max(evidenceStrength, hasMinimumEvidence ? 0.42 : 0.12)
  const scaleStep = MAX_SCALE_STEP * conservativeFactor

  const targetIntentWeights: BrandSoulIntentSelectionWeights = {
    ...baselineProfile.intentSelectionWeights,
    support: clamp((baselineProfile.intentSelectionWeights.support ?? 0.62) + (historicalSignals.intentOutcomes.support ? resolveAggregateSignal(
      historicalSignals.intentOutcomes.support.successRate,
      historicalSignals.intentOutcomes.support.continuationRate,
      historicalSignals.intentOutcomes.support.averageEngagementDelta,
    ) - 0.5 : 0) * 0.2),
    policy: clamp((baselineProfile.intentSelectionWeights.policy ?? 0.6) + (historicalSignals.intentOutcomes.policy ? resolveAggregateSignal(
      historicalSignals.intentOutcomes.policy.successRate,
      historicalSignals.intentOutcomes.policy.continuationRate,
      historicalSignals.intentOutcomes.policy.averageEngagementDelta,
    ) - 0.5 : 0) * 0.18),
    'product-discovery': clamp((baselineProfile.intentSelectionWeights['product-discovery'] ?? 0.58) + (historicalSignals.intentOutcomes['product-discovery'] ? resolveAggregateSignal(
      historicalSignals.intentOutcomes['product-discovery'].successRate,
      historicalSignals.intentOutcomes['product-discovery'].continuationRate,
      historicalSignals.intentOutcomes['product-discovery'].averageEngagementDelta,
    ) - 0.5 : 0) * 0.22),
    promotion: clamp((baselineProfile.intentSelectionWeights.promotion ?? 0.52) + (historicalSignals.intentOutcomes.promotion ? resolveAggregateSignal(
      historicalSignals.intentOutcomes.promotion.successRate,
      historicalSignals.intentOutcomes.promotion.continuationRate,
      historicalSignals.intentOutcomes.promotion.averageEngagementDelta,
    ) - 0.5 : 0) * 0.2 - strategyProfile.strategyBias.cautionBias * 0.04),
    purchase: clamp((baselineProfile.intentSelectionWeights.purchase ?? 0.5) + (historicalSignals.intentOutcomes.purchase ? resolveAggregateSignal(
      historicalSignals.intentOutcomes.purchase.successRate,
      historicalSignals.intentOutcomes.purchase.continuationRate,
      historicalSignals.intentOutcomes.purchase.averageEngagementDelta,
    ) - 0.5 : 0) * 0.2 - strategyProfile.strategyBias.cautionBias * 0.03),
  }

  const targetActionBias: BrandSoulActionSelectionBias = {
    ...baselineProfile.actionSelectionBias,
    support: clamp((baselineProfile.actionSelectionBias.support ?? 0.46) + ((historicalSignals.actionOutcomes.support ? resolveAggregateSignal(
      historicalSignals.actionOutcomes.support.successRate,
      historicalSignals.actionOutcomes.support.continuationRate,
      historicalSignals.actionOutcomes.support.averageEngagementDelta,
    ) : 0.5) - 0.5) * 0.22),
    guide: clamp((baselineProfile.actionSelectionBias.guide ?? 0.48) + ((historicalSignals.actionOutcomes.guide ? resolveAggregateSignal(
      historicalSignals.actionOutcomes.guide.successRate,
      historicalSignals.actionOutcomes.guide.continuationRate,
      historicalSignals.actionOutcomes.guide.averageEngagementDelta,
    ) : 0.5) - 0.5) * 0.24),
    sell: clamp((baselineProfile.actionSelectionBias.sell ?? 0.34) + ((historicalSignals.actionOutcomes.sell ? resolveAggregateSignal(
      historicalSignals.actionOutcomes.sell.successRate,
      historicalSignals.actionOutcomes.sell.continuationRate,
      historicalSignals.actionOutcomes.sell.averageEngagementDelta,
    ) : 0.5) - 0.5) * 0.24 - strategyProfile.strategyBias.cautionBias * 0.06),
    inform: clamp((baselineProfile.actionSelectionBias.inform ?? 0.52) + policyProfile.policyStability * 0.04),
  }

  const nextIntentSelectionWeights = updateIntentSelectionWeights(adaptiveDecisionProfile.intentSelectionWeights, targetIntentWeights, intentStep)
  const nextActionSelectionBias = updateActionSelectionBias(adaptiveDecisionProfile.actionSelectionBias, targetActionBias, actionStep)

  const nextConfidenceScalingProfile = {
    ...adaptiveDecisionProfile.confidenceScalingProfile,
    baseScale: clampScale(
      moveToward(
        adaptiveDecisionProfile.confidenceScalingProfile.baseScale,
        clampScale(
          baselineProfile.confidenceScalingProfile.baseScale +
          (consistency - 0.5) * 0.08 +
          policyProfile.confidenceAdjustmentProfile.baseAdjustment * 0.35,
        ),
        scaleStep,
        ADAPTIVE_CONFIDENCE_HYSTERESIS,
        0.9,
        1.12,
      ),
    ),
    intentScales: {
      ...adaptiveDecisionProfile.confidenceScalingProfile.intentScales,
      support: clampScale(
        moveToward(
          adaptiveDecisionProfile.confidenceScalingProfile.intentScales.support ?? 1,
          clampScale(1 + (policyProfile.confidenceAdjustmentProfile.intentAdjustments.support ?? 0) * 0.8, 0.94, 1.08),
          scaleStep,
          ADAPTIVE_CONFIDENCE_HYSTERESIS,
          0.9,
          1.12,
        ),
      ),
      'product-discovery': clampScale(
        moveToward(
          adaptiveDecisionProfile.confidenceScalingProfile.intentScales['product-discovery'] ?? 1,
          clampScale(1 + (policyProfile.confidenceAdjustmentProfile.intentAdjustments['product-discovery'] ?? 0) * 0.8, 0.94, 1.08),
          scaleStep,
          ADAPTIVE_CONFIDENCE_HYSTERESIS,
          0.9,
          1.12,
        ),
      ),
      promotion: clampScale(
        moveToward(
          adaptiveDecisionProfile.confidenceScalingProfile.intentScales.promotion ?? 1,
          clampScale(1 + (policyProfile.confidenceAdjustmentProfile.intentAdjustments.promotion ?? 0) * 0.8, 0.92, 1.08),
          scaleStep,
          ADAPTIVE_CONFIDENCE_HYSTERESIS,
          0.9,
          1.12,
        ),
      ),
    },
    actionScales: {
      ...adaptiveDecisionProfile.confidenceScalingProfile.actionScales,
      support: clampScale(
        moveToward(
          adaptiveDecisionProfile.confidenceScalingProfile.actionScales.support ?? 1,
          clampScale(1 + (policyProfile.confidenceAdjustmentProfile.actionAdjustments.support ?? 0) * 0.8, 0.94, 1.08),
          scaleStep,
          ADAPTIVE_CONFIDENCE_HYSTERESIS,
          0.9,
          1.12,
        ),
      ),
      guide: clampScale(
        moveToward(
          adaptiveDecisionProfile.confidenceScalingProfile.actionScales.guide ?? 1,
          clampScale(1 + (policyProfile.confidenceAdjustmentProfile.actionAdjustments.guide ?? 0) * 0.8, 0.94, 1.08),
          scaleStep,
          ADAPTIVE_CONFIDENCE_HYSTERESIS,
          0.9,
          1.12,
        ),
      ),
      sell: clampScale(
        moveToward(
          adaptiveDecisionProfile.confidenceScalingProfile.actionScales.sell ?? 1,
          clampScale(1 + (policyProfile.confidenceAdjustmentProfile.actionAdjustments.sell ?? 0) * 0.8, 0.92, 1.08),
          scaleStep,
          ADAPTIVE_CONFIDENCE_HYSTERESIS,
          0.9,
          1.12,
        ),
      ),
    },
  }

  const targetExplorationBias = clamp(
    baselineProfile.explorationVsExploitationBalance.explorationBias +
    strategyProfile.strategyBias.explorationBias * 0.1 +
    (hasMinimumEvidence ? 0 : 0.04) -
    consistency * 0.05,
  )
  const targetExploitationBias = clamp(
    baselineProfile.explorationVsExploitationBalance.exploitationBias +
    consistency * 0.08 +
    policyProfile.policyStability * 0.05 -
    (hasMinimumEvidence ? 0 : 0.03),
  )

  const nextExplorationVsExploitationBalance = {
    explorationBias: moveToward(
      adaptiveDecisionProfile.explorationVsExploitationBalance.explorationBias,
      targetExplorationBias,
      MAX_BALANCE_STEP * conservativeFactor,
      0.015,
    ),
    exploitationBias: moveToward(
      adaptiveDecisionProfile.explorationVsExploitationBalance.exploitationBias,
      targetExploitationBias,
      MAX_BALANCE_STEP * conservativeFactor,
      0.015,
    ),
  }

  const nextAdaptationConfidence = moveToward(
    adaptiveDecisionProfile.adaptationConfidence,
    clamp(baselineProfile.adaptationConfidence + evidenceStrength * 0.24 + (hasMinimumEvidence ? 0.06 : -0.03) + consistency * 0.12),
    MAX_META_STEP * conservativeFactor,
    0.012,
  )
  const driftPressure = clamp(
    Math.abs(nextExplorationVsExploitationBalance.explorationBias - baselineProfile.explorationVsExploitationBalance.explorationBias) +
    Math.abs(nextExplorationVsExploitationBalance.exploitationBias - baselineProfile.explorationVsExploitationBalance.exploitationBias) +
    (1 - consistency) * 0.14 +
    (hasMinimumEvidence ? 0.02 : 0.08),
  )
  const nextDecisionDrift = moveToward(
    adaptiveDecisionProfile.decisionDrift,
    clamp(adaptiveDecisionProfile.decisionDrift * (1 - policyProfile.confidenceAdjustmentProfile.decayFactor) + driftPressure * 0.32),
    MAX_META_STEP,
    0.01,
  )

  const shouldRollback =
    adaptiveDecisionProfile.safetyProfile.localRollbackEnabled &&
    Math.max(adaptiveDecisionProfile.decisionDrift, nextDecisionDrift) >= adaptiveDecisionProfile.safetyProfile.rollbackDriftThreshold &&
    consistency < 0.56

  if (shouldRollback) {
    const rollbackTargetDrift = Math.min(
      adaptiveDecisionProfile.decisionDrift,
      Math.max(baselineProfile.decisionDrift, nextDecisionDrift * 0.82),
    )

    return {
      ...adaptiveDecisionProfile,
      intentSelectionWeights: updateIntentSelectionWeights(
        adaptiveDecisionProfile.intentSelectionWeights,
        baselineProfile.intentSelectionWeights,
        MAX_INTENT_STEP * 0.9,
      ),
      actionSelectionBias: updateActionSelectionBias(
        adaptiveDecisionProfile.actionSelectionBias,
        baselineProfile.actionSelectionBias,
        MAX_ACTION_STEP * 0.9,
      ),
      confidenceScalingProfile: {
        ...nextConfidenceScalingProfile,
        baseScale: moveToward(nextConfidenceScalingProfile.baseScale, baselineProfile.confidenceScalingProfile.baseScale, MAX_SCALE_STEP, ADAPTIVE_CONFIDENCE_HYSTERESIS, 0.9, 1.12),
      },
      explorationVsExploitationBalance: {
        explorationBias: moveToward(nextExplorationVsExploitationBalance.explorationBias, baselineProfile.explorationVsExploitationBalance.explorationBias, MAX_BALANCE_STEP, 0.015),
        exploitationBias: moveToward(nextExplorationVsExploitationBalance.exploitationBias, baselineProfile.explorationVsExploitationBalance.exploitationBias, MAX_BALANCE_STEP, 0.015),
      },
      adaptationConfidence: moveToward(adaptiveDecisionProfile.adaptationConfidence, Math.max(baselineProfile.adaptationConfidence, adaptiveDecisionProfile.adaptationConfidence * 0.92), MAX_META_STEP, 0.012),
      decisionDrift: moveToward(adaptiveDecisionProfile.decisionDrift, rollbackTargetDrift, MAX_META_STEP, 0.01),
    }
  }

  if (!hasMinimumEvidence) {
    return {
      ...adaptiveDecisionProfile,
      safetyProfile: adaptiveDecisionProfile.safetyProfile,
      confidenceScalingProfile: nextConfidenceScalingProfile,
      explorationVsExploitationBalance: nextExplorationVsExploitationBalance,
      adaptationConfidence: moveToward(adaptiveDecisionProfile.adaptationConfidence, Math.max(baselineProfile.adaptationConfidence, nextAdaptationConfidence * 0.88), MAX_META_STEP * 0.7, 0.012),
      decisionDrift: moveToward(adaptiveDecisionProfile.decisionDrift, Math.max(adaptiveDecisionProfile.decisionDrift, nextDecisionDrift), MAX_META_STEP, 0.01),
    }
  }

  return {
    intentSelectionWeights: nextIntentSelectionWeights,
    actionSelectionBias: nextActionSelectionBias,
    confidenceScalingProfile: nextConfidenceScalingProfile,
    explorationVsExploitationBalance: nextExplorationVsExploitationBalance,
    safetyProfile: adaptiveDecisionProfile.safetyProfile,
    adaptationConfidence: nextAdaptationConfidence,
    decisionDrift: nextDecisionDrift,
  }
}