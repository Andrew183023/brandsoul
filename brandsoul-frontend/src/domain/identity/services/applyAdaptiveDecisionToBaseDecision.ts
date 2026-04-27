import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulActionType, BrandSoulDecision, BrandSoulResponsePlan } from '../contracts/BrandSoulDecision'

const MIN_ADAPTIVE_PROMOTION_CONFIDENCE = 0.32

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function withResponsePlan(decision: BrandSoulDecision, responsePlan: BrandSoulResponsePlan) {
  return {
    ...decision,
    responsePlan,
  }
}

function isCriticalDecision(decision: BrandSoulDecision) {
  return decision.intent === 'guardrail-blocked'
}

function isProhibitedZone(decision: BrandSoulDecision) {
  return decision.intent === 'guardrail-blocked' || decision.action === 'refuse'
}

function isCriticalZone(decision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile) {
  return decision.confidence >= profile.safetyProfile.criticalConfidenceThreshold || decision.intent === 'business-hours'
}

function isSafeIntentPromotionZone(decision: BrandSoulDecision) {
  return decision.intent === 'general' || decision.intent === 'greeting'
}

function isSafeActionPromotionZone(decision: BrandSoulDecision) {
  return decision.intent === 'general' || decision.intent === 'greeting' || decision.intent === 'product-discovery' || decision.intent === 'support' || decision.intent === 'policy'
}

function resolveAdaptivePromotionStrength(profile: BrandSoulAdaptiveDecisionProfile) {
  return clamp(
    profile.adaptationConfidence * 0.6 +
    profile.explorationVsExploitationBalance.exploitationBias * 0.2 +
    (1 - profile.decisionDrift) * 0.2,
  )
}

function shouldKillSwitch(profile: BrandSoulAdaptiveDecisionProfile) {
  return profile.safetyProfile.killSwitchEnabled || profile.decisionDrift >= 0.42 || profile.adaptationConfidence < MIN_ADAPTIVE_PROMOTION_CONFIDENCE
}

function resolveIntentBudget(profile: BrandSoulAdaptiveDecisionProfile) {
  const { adaptationConfidence, decisionDrift, explorationVsExploitationBalance } = profile
  return clamp(
    profile.safetyProfile.maxIntentPromotionBudget * adaptationConfidence * (1 - decisionDrift * 0.65) * (0.45 + explorationVsExploitationBalance.exploitationBias * 0.55),
    0,
    profile.safetyProfile.maxIntentPromotionBudget,
  )
}

function resolveActionBudget(profile: BrandSoulAdaptiveDecisionProfile) {
  const { adaptationConfidence, decisionDrift, explorationVsExploitationBalance } = profile
  return clamp(
    profile.safetyProfile.maxActionPromotionBudget * adaptationConfidence * (1 - decisionDrift * 0.55) * (0.4 + explorationVsExploitationBalance.exploitationBias * 0.6),
    0,
    profile.safetyProfile.maxActionPromotionBudget,
  )
}

function resolveConfidenceBudget(profile: BrandSoulAdaptiveDecisionProfile) {
  return clamp(
    profile.safetyProfile.maxConfidencePromotionBudget * profile.adaptationConfidence * (1 - profile.decisionDrift * 0.45),
    0,
    profile.safetyProfile.maxConfidencePromotionBudget,
  )
}

function resolveStyleBudget(profile: BrandSoulAdaptiveDecisionProfile) {
  return clamp(
    profile.safetyProfile.maxStylePromotionBudget * resolveAdaptivePromotionStrength(profile) * (1 - profile.decisionDrift * 0.4),
    0,
    profile.safetyProfile.maxStylePromotionBudget,
  )
}

function resolveAdaptiveStyle(decision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile) {
  const styleBudget = resolveStyleBudget(profile)
  if (styleBudget < 0.03 || decision.responsePlan.kind === 'guardrail' || decision.intent === 'business-hours') {
    return decision.responsePlan.optionalCloseStyle
  }

  const supportBias = profile.actionSelectionBias.support ?? 0
  const guideBias = profile.actionSelectionBias.guide ?? 0
  const sellBias = profile.actionSelectionBias.sell ?? 0
  const informBias = profile.actionSelectionBias.inform ?? 0

  if ((decision.intent === 'support' || decision.intent === 'policy' || decision.action === 'support') && supportBias >= 0.52) {
    return 'safe-guidance'
  }

  if ((decision.intent === 'product-discovery' || decision.action === 'guide') && guideBias >= 0.5) {
    return 'guide-choice'
  }

  if ((decision.intent === 'promotion' || decision.intent === 'purchase' || decision.action === 'sell') && sellBias >= 0.48) {
    return 'explore-promotion'
  }

  if ((decision.intent === 'general' || decision.intent === 'greeting') && informBias >= 0.5) {
    return 'contextual-clarity'
  }

  return decision.responsePlan.optionalCloseStyle
}

function applyAdaptiveIntentShift(baseDecision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile) {
  if (!isSafeIntentPromotionZone(baseDecision) || isCriticalZone(baseDecision, profile)) {
    return baseDecision
  }

  const intentBudget = resolveIntentBudget(profile)
  const promotionStrength = resolveAdaptivePromotionStrength(profile)
  if (intentBudget < 0.018 || promotionStrength < 0.38 || baseDecision.confidence >= 0.8) {
    return baseDecision
  }

  const currentWeight = profile.intentSelectionWeights[baseDecision.intent] ?? 0.38
  const supportWeight = Math.max(
    profile.intentSelectionWeights.support ?? 0,
    profile.intentSelectionWeights.policy ?? 0,
  )
  const discoveryWeight = profile.intentSelectionWeights['product-discovery'] ?? 0
  const promotionWeight = profile.intentSelectionWeights.promotion ?? 0
  const explorationBalance = profile.explorationVsExploitationBalance.explorationBias
  const exploitationBalance = profile.explorationVsExploitationBalance.exploitationBias

  if (supportWeight - currentWeight >= 0.1) {
    return {
      ...baseDecision,
      intent: 'support' as const,
      action: 'support' as const,
      responsePlan: {
        kind: 'policy' as const,
        topic: baseDecision.responsePlan.topic,
        intentGoal: 'support-policy-clarity' as const,
        requiredData: baseDecision.responsePlan.requiredData,
        constraints: baseDecision.responsePlan.constraints,
        optionalCloseStyle: 'safe-guidance' as const,
      },
      confidence: clamp(baseDecision.confidence + intentBudget * 0.8),
    }
  }

  if (discoveryWeight - currentWeight >= 0.1 && explorationBalance >= 0.46) {
    const responsePlanKind: BrandSoulResponsePlan['kind'] = baseDecision.responsePlan.kind === 'greeting' ? 'general' : 'product'

    return {
      ...baseDecision,
      intent: 'product-discovery' as const,
      action: 'guide' as const,
      responsePlan: {
        kind: responsePlanKind,
        topic: baseDecision.responsePlan.topic,
        intentGoal: 'guide-product-selection' as const,
        requiredData: baseDecision.responsePlan.requiredData,
        constraints: baseDecision.responsePlan.constraints,
        optionalCloseStyle: 'guide-choice' as const,
      },
      confidence: clamp(baseDecision.confidence + intentBudget * 0.72),
    }
  }

  if (
    promotionWeight - currentWeight >= 0.13 &&
    exploitationBalance > explorationBalance &&
    profile.actionSelectionBias.sell != null &&
    (profile.actionSelectionBias.sell ?? 0) >= 0.46
  ) {
    return {
      ...baseDecision,
      intent: 'promotion' as const,
      action: 'sell' as const,
      responsePlan: {
        kind: 'promotion' as const,
        topic: baseDecision.responsePlan.topic,
        intentGoal: 'highlight-active-promotion' as const,
        requiredData: baseDecision.responsePlan.requiredData,
        constraints: baseDecision.responsePlan.constraints,
        optionalCloseStyle: 'explore-promotion' as const,
      },
      confidence: clamp(baseDecision.confidence + intentBudget * 0.58),
    }
  }

  return baseDecision
}

function resolvePreferredAction(profile: BrandSoulAdaptiveDecisionProfile) {
  const entries = Object.entries(profile.actionSelectionBias) as Array<[BrandSoulActionType, number]>
  return entries.sort((left, right) => right[1] - left[1])[0]?.[0]
}

function applyAdaptiveActionShift(baseDecision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile) {
  if (!isSafeActionPromotionZone(baseDecision) || isCriticalZone(baseDecision, profile)) {
    return baseDecision
  }

  const actionBudget = resolveActionBudget(profile)
  const promotionStrength = resolveAdaptivePromotionStrength(profile)
  if (actionBudget < 0.02 || promotionStrength < 0.4 || baseDecision.confidence >= 0.84) {
    return baseDecision
  }

  const preferredAction = resolvePreferredAction(profile)
  if (!preferredAction || preferredAction === baseDecision.action) {
    return baseDecision
  }

  const currentBias = profile.actionSelectionBias[baseDecision.action] ?? 0.3
  const preferredBias = profile.actionSelectionBias[preferredAction] ?? 0
  if (preferredBias - currentBias < 0.1) {
    return baseDecision
  }

  if (preferredAction === 'guide' && (baseDecision.intent === 'general' || baseDecision.intent === 'greeting' || baseDecision.intent === 'product-discovery')) {
    return withResponsePlan(
      {
        ...baseDecision,
        action: 'guide',
        confidence: clamp(baseDecision.confidence + actionBudget * 0.42),
      },
      {
        ...baseDecision.responsePlan,
        optionalCloseStyle: 'guide-choice',
      },
    )
  }

  if (
    preferredAction === 'sell' &&
    profile.explorationVsExploitationBalance.exploitationBias >= profile.explorationVsExploitationBalance.explorationBias &&
    (baseDecision.intent === 'product-discovery' || baseDecision.intent === 'promotion' || baseDecision.intent === 'purchase')
  ) {
    return withResponsePlan(
      {
        ...baseDecision,
        action: 'sell',
        confidence: clamp(baseDecision.confidence + actionBudget * 0.48),
      },
      {
        ...baseDecision.responsePlan,
        optionalCloseStyle: 'explore-promotion',
      },
    )
  }

  if (preferredAction === 'support' && (baseDecision.intent === 'general' || baseDecision.intent === 'greeting' || baseDecision.intent === 'support' || baseDecision.intent === 'policy')) {
    return withResponsePlan(
      {
        ...baseDecision,
        action: 'support',
        confidence: clamp(baseDecision.confidence + actionBudget * 0.36),
      },
      {
        ...baseDecision.responsePlan,
        optionalCloseStyle: 'safe-guidance',
      },
    )
  }

  if (preferredAction === 'inform' && baseDecision.action === 'sell') {
    return withResponsePlan(
      {
        ...baseDecision,
        action: 'inform',
        confidence: clamp(baseDecision.confidence - actionBudget * 0.28),
      },
      {
        ...baseDecision.responsePlan,
        optionalCloseStyle: 'safe-guidance',
      },
    )
  }

  return baseDecision
}

function applyAdaptiveConfidenceScaling(baseDecision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile) {
  if (isCriticalZone(baseDecision, profile)) {
    return baseDecision
  }

  const confidenceBudget = resolveConfidenceBudget(profile)
  if (confidenceBudget <= 0) {
    return baseDecision
  }

  const intentScale = profile.confidenceScalingProfile.intentScales[baseDecision.intent] ?? 1
  const actionScale = profile.confidenceScalingProfile.actionScales[baseDecision.action] ?? 1
  const explorationEffect = profile.explorationVsExploitationBalance.explorationBias > profile.explorationVsExploitationBalance.exploitationBias
    ? -0.015
    : 0.015
  const rawScaledConfidence = clamp(
    baseDecision.confidence * clamp(
      profile.confidenceScalingProfile.baseScale * intentScale * actionScale,
      profile.confidenceScalingProfile.minScale,
      profile.confidenceScalingProfile.maxScale,
    ) + explorationEffect,
  )
  const delta = clamp(rawScaledConfidence - baseDecision.confidence, -confidenceBudget, confidenceBudget)

  if (Math.abs(delta) < 0.01) {
    return baseDecision
  }

  return {
    ...baseDecision,
    confidence: clamp(baseDecision.confidence + delta),
  }
}

function applyAdaptiveStylePromotion(baseDecision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile) {
  const nextStyle = resolveAdaptiveStyle(baseDecision, profile)
  if (nextStyle === baseDecision.responsePlan.optionalCloseStyle) {
    return baseDecision
  }

  return withResponsePlan(baseDecision, {
    ...baseDecision.responsePlan,
    optionalCloseStyle: nextStyle,
  })
}

export function applyAdaptiveDecisionToBaseDecision(
  baseDecision: BrandSoulDecision,
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile,
): BrandSoulDecision {
  if (isProhibitedZone(baseDecision) || isCriticalDecision(baseDecision) || shouldKillSwitch(adaptiveDecisionProfile)) {
    return baseDecision
  }

  const intentShiftedDecision = applyAdaptiveIntentShift(baseDecision, adaptiveDecisionProfile)
  const actionShiftedDecision = applyAdaptiveActionShift(intentShiftedDecision, adaptiveDecisionProfile)
  const stylePromotedDecision = applyAdaptiveStylePromotion(actionShiftedDecision, adaptiveDecisionProfile)

  return applyAdaptiveConfidenceScaling(stylePromotedDecision, adaptiveDecisionProfile)
}