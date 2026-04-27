import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulActionPreferenceMatrix, BrandSoulIntentPriorityOverrides, BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function buildIntentPriorityOverrides(strategyProfile?: BrandSoulStrategyProfile, currentState?: BrandSoulCognitiveState): BrandSoulIntentPriorityOverrides {
  const overrides: BrandSoulIntentPriorityOverrides = {
    'business-hours': 0.42,
    promotion: 0.45,
    'product-discovery': 0.48,
    policy: 0.46,
    purchase: 0.46,
    support: 0.46,
    greeting: 0.32,
    general: 0.38,
    'guardrail-blocked': 1,
  }

  if (!strategyProfile && !currentState) {
    return overrides
  }

  const supportBoost = (strategyProfile?.strategyBias.supportBias ?? 0.25) * 0.12
  const explorationBoost = (strategyProfile?.strategyBias.explorationBias ?? 0.25) * 0.12
  const conversionBoost = (strategyProfile?.strategyBias.conversionBias ?? 0.25) * 0.12
  const cautionBoost = (strategyProfile?.strategyBias.cautionBias ?? 0.25) * 0.1

  overrides.support = clamp((overrides.support ?? 0.46) + supportBoost + (currentState?.currentMode === 'support' ? 0.04 : 0) + (currentState?.dominantDrive === 'clarify' ? 0.03 : 0))
  overrides.policy = clamp((overrides.policy ?? 0.46) + supportBoost * 0.8 + cautionBoost + (currentState?.dominantDrive === 'clarify' ? 0.03 : 0))
  overrides['product-discovery'] = clamp((overrides['product-discovery'] ?? 0.48) + explorationBoost + (currentState?.currentMode === 'exploration' ? 0.04 : 0))
  overrides.promotion = clamp((overrides.promotion ?? 0.45) + conversionBoost - cautionBoost * 0.4)
  overrides.purchase = clamp((overrides.purchase ?? 0.46) + conversionBoost + (currentState?.currentMode === 'conversion' ? 0.04 : 0) - cautionBoost * 0.35)

  return overrides
}

function buildActionPreferenceMatrix(strategyProfile?: BrandSoulStrategyProfile, currentState?: BrandSoulCognitiveState): BrandSoulActionPreferenceMatrix {
  const matrix: BrandSoulActionPreferenceMatrix = {
    general: {
      inform: 0.56,
      guide: 0.34,
      support: 0.28,
      sell: 0.14,
      refuse: 0.02,
    },
    greeting: {
      inform: 0.6,
      guide: 0.22,
      support: 0.2,
      sell: 0.04,
    },
    support: {
      support: 0.82,
      inform: 0.34,
      guide: 0.16,
      sell: 0.04,
    },
    policy: {
      support: 0.78,
      inform: 0.42,
      guide: 0.14,
      sell: 0.02,
    },
    'product-discovery': {
      guide: 0.76,
      sell: 0.42,
      inform: 0.24,
      support: 0.12,
    },
    promotion: {
      sell: 0.74,
      inform: 0.28,
      guide: 0.26,
      support: 0.08,
    },
    purchase: {
      sell: 0.78,
      inform: 0.24,
      support: 0.16,
    },
    'business-hours': {
      inform: 0.84,
      support: 0.16,
    },
    'guardrail-blocked': {
      refuse: 1,
    },
  }

  if (!strategyProfile && !currentState) {
    return matrix
  }

  const supportBias = strategyProfile?.strategyBias.supportBias ?? 0.25
  const explorationBias = strategyProfile?.strategyBias.explorationBias ?? 0.25
  const conversionBias = strategyProfile?.strategyBias.conversionBias ?? 0.25
  const cautionBias = strategyProfile?.strategyBias.cautionBias ?? 0.25

  matrix.general = {
    ...matrix.general,
    support: clamp((matrix.general?.support ?? 0.28) + supportBias * 0.22 + cautionBias * 0.08 + (currentState?.dominantDrive === 'clarify' ? 0.04 : 0)),
    guide: clamp((matrix.general?.guide ?? 0.34) + explorationBias * 0.2 + (currentState?.currentMode === 'exploration' ? 0.03 : 0)),
    sell: clamp((matrix.general?.sell ?? 0.14) + conversionBias * 0.12 - cautionBias * 0.12),
  }

  matrix['product-discovery'] = {
    ...matrix['product-discovery'],
    guide: clamp((matrix['product-discovery']?.guide ?? 0.76) + explorationBias * 0.12),
    sell: clamp((matrix['product-discovery']?.sell ?? 0.42) + conversionBias * 0.2 - cautionBias * 0.14),
  }

  matrix.promotion = {
    ...matrix.promotion,
    sell: clamp((matrix.promotion?.sell ?? 0.74) + conversionBias * 0.14 - cautionBias * 0.12),
    inform: clamp((matrix.promotion?.inform ?? 0.28) + cautionBias * 0.1),
  }

  matrix.support = {
    ...matrix.support,
    support: clamp((matrix.support?.support ?? 0.82) + supportBias * 0.08 + cautionBias * 0.05),
  }

  return matrix
}

export function initializeBrandSoulPolicyProfile(
  strategyProfile?: BrandSoulStrategyProfile,
  currentState?: BrandSoulCognitiveState,
): BrandSoulPolicyProfile {
  return {
    decisionWeights: {
      intentShiftWeight: 0.16,
      actionShiftWeight: 0.18,
      confidenceWeight: 0.12,
      memoryWeight: 0.08,
    },
    intentPriorityOverrides: buildIntentPriorityOverrides(strategyProfile, currentState),
    actionPreferenceMatrix: buildActionPreferenceMatrix(strategyProfile, currentState),
    confidenceAdjustmentProfile: {
      baseAdjustment: 0,
      intentAdjustments: {},
      actionAdjustments: {},
      maxAdjustment: 0.08,
      evidenceThreshold: 3,
      decayFactor: 0.12,
    },
    policyStability: 0.84,
    policyDrift: 0.08,
  }
}