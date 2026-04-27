import type { BrandSoulAdaptiveDecisionProfile, BrandSoulActionSelectionBias, BrandSoulIntentSelectionWeights } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildIntentSelectionWeights(strategyProfile?: BrandSoulStrategyProfile, policyProfile?: BrandSoulPolicyProfile): BrandSoulIntentSelectionWeights {
  const weights: BrandSoulIntentSelectionWeights = {
    'business-hours': 0.88,
    promotion: 0.52,
    'product-discovery': 0.58,
    policy: 0.6,
    purchase: 0.5,
    support: 0.62,
    greeting: 0.34,
    general: 0.38,
    'guardrail-blocked': 1,
  }

  if (!strategyProfile && !policyProfile) {
    return weights
  }

  const supportBoost = (strategyProfile?.strategyBias.supportBias ?? 0.25) * 0.08
  const explorationBoost = (strategyProfile?.strategyBias.explorationBias ?? 0.25) * 0.08
  const conversionBoost = (strategyProfile?.strategyBias.conversionBias ?? 0.25) * 0.06
  const cautionPenalty = (strategyProfile?.strategyBias.cautionBias ?? 0.25) * 0.04

  weights.support = clamp((weights.support ?? 0.62) + supportBoost + (policyProfile?.intentPriorityOverrides.support ?? 0.46) * 0.05)
  weights.policy = clamp((weights.policy ?? 0.6) + supportBoost * 0.8 + (policyProfile?.intentPriorityOverrides.policy ?? 0.46) * 0.05)
  weights['product-discovery'] = clamp((weights['product-discovery'] ?? 0.58) + explorationBoost + (policyProfile?.intentPriorityOverrides['product-discovery'] ?? 0.48) * 0.05)
  weights.promotion = clamp((weights.promotion ?? 0.52) + conversionBoost + (policyProfile?.intentPriorityOverrides.promotion ?? 0.45) * 0.04 - cautionPenalty * 0.3)
  weights.purchase = clamp((weights.purchase ?? 0.5) + conversionBoost + (policyProfile?.intentPriorityOverrides.purchase ?? 0.46) * 0.04 - cautionPenalty * 0.25)

  return weights
}

function buildActionSelectionBias(strategyProfile?: BrandSoulStrategyProfile, policyProfile?: BrandSoulPolicyProfile): BrandSoulActionSelectionBias {
  const bias: BrandSoulActionSelectionBias = {
    inform: 0.52,
    guide: 0.48,
    support: 0.46,
    sell: 0.34,
    refuse: 0.02,
  }

  if (!strategyProfile && !policyProfile) {
    return bias
  }

  const matrixEntries = Object.values(policyProfile?.actionPreferenceMatrix ?? {})
  const actionAverages = {
    inform: average(matrixEntries.map((entry) => entry?.inform ?? 0)),
    guide: average(matrixEntries.map((entry) => entry?.guide ?? 0)),
    support: average(matrixEntries.map((entry) => entry?.support ?? 0)),
    sell: average(matrixEntries.map((entry) => entry?.sell ?? 0)),
    refuse: average(matrixEntries.map((entry) => entry?.refuse ?? 0)),
  }

  bias.support = clamp((bias.support ?? 0.46) + (strategyProfile?.strategyBias.supportBias ?? 0.25) * 0.16 + actionAverages.support * 0.08)
  bias.guide = clamp((bias.guide ?? 0.48) + (strategyProfile?.strategyBias.explorationBias ?? 0.25) * 0.16 + actionAverages.guide * 0.08)
  bias.sell = clamp((bias.sell ?? 0.34) + (strategyProfile?.strategyBias.conversionBias ?? 0.25) * 0.16 + actionAverages.sell * 0.08 - (strategyProfile?.strategyBias.cautionBias ?? 0.25) * 0.12)
  bias.inform = clamp((bias.inform ?? 0.52) + actionAverages.inform * 0.08 + (strategyProfile?.strategyBias.cautionBias ?? 0.25) * 0.08)

  return bias
}

export function initializeBrandSoulAdaptiveDecisionProfile(
  strategyProfile?: BrandSoulStrategyProfile,
  policyProfile?: BrandSoulPolicyProfile,
): BrandSoulAdaptiveDecisionProfile {
  const explorationBias = clamp(0.52 + (strategyProfile?.strategyBias.explorationBias ?? 0.25) * 0.18 - (strategyProfile?.strategyBias.cautionBias ?? 0.25) * 0.08)
  const exploitationBias = clamp(0.48 + (strategyProfile?.strategyBias.conversionBias ?? 0.25) * 0.1 + (policyProfile?.policyStability ?? 0.84) * 0.08)

  return {
    intentSelectionWeights: buildIntentSelectionWeights(strategyProfile, policyProfile),
    actionSelectionBias: buildActionSelectionBias(strategyProfile, policyProfile),
    confidenceScalingProfile: {
      baseScale: 1,
      intentScales: {},
      actionScales: {},
      minScale: 0.94,
      maxScale: 1.08,
      evidenceThreshold: 3,
    },
    explorationVsExploitationBalance: {
      explorationBias,
      exploitationBias,
    },
    safetyProfile: {
      killSwitchEnabled: false,
      localRollbackEnabled: true,
      minimumEvidence: 3,
      criticalConfidenceThreshold: 0.88,
      rollbackDriftThreshold: 0.26,
      maxIntentPromotionBudget: 0.18,
      maxActionPromotionBudget: 0.16,
      maxConfidencePromotionBudget: 0.1,
      maxStylePromotionBudget: 0.12,
    },
    adaptationConfidence: clamp(0.16 + (strategyProfile?.adaptationConfidence ?? 0.18) * 0.3 + (policyProfile?.policyStability ?? 0.84) * 0.08, 0, 1),
    decisionDrift: clamp(0.08 + (policyProfile?.policyDrift ?? 0.08) * 0.55, 0, 1),
  }
}