import type { BrandSoulActionType, BrandSoulDecision, BrandSoulResponsePlan } from '../contracts/BrandSoulDecision'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'

const CRITICAL_INTENT_CONFIDENCE = 0.84
const MAX_POLICY_INTENT_SHIFT = 0.1
const MAX_POLICY_ACTION_SHIFT = 0.12

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function isCriticalDecision(decision: BrandSoulDecision) {
  return decision.intent === 'guardrail-blocked' || decision.confidence >= CRITICAL_INTENT_CONFIDENCE
}

function withResponsePlan(decision: BrandSoulDecision, responsePlan: BrandSoulResponsePlan) {
  return {
    ...decision,
    responsePlan,
  }
}

function resolveIntentBudget(policyProfile: BrandSoulPolicyProfile) {
  return clamp(
    MAX_POLICY_INTENT_SHIFT * policyProfile.decisionWeights.intentShiftWeight * policyProfile.policyStability * (1 - policyProfile.policyDrift * 0.55),
    0,
    MAX_POLICY_INTENT_SHIFT,
  )
}

function resolveActionBudget(policyProfile: BrandSoulPolicyProfile) {
  return clamp(
    MAX_POLICY_ACTION_SHIFT * policyProfile.decisionWeights.actionShiftWeight * policyProfile.policyStability * (1 - policyProfile.policyDrift * 0.45),
    0,
    MAX_POLICY_ACTION_SHIFT,
  )
}

function applyGeneralIntentPolicy(decision: BrandSoulDecision, policyProfile: BrandSoulPolicyProfile) {
  if (decision.intent !== 'general' && decision.intent !== 'greeting') {
    return decision
  }

  const intentBudget = resolveIntentBudget(policyProfile)
  if (intentBudget < 0.015) {
    return decision
  }

  const supportPriority = Math.max(
    policyProfile.intentPriorityOverrides.support ?? 0,
    policyProfile.intentPriorityOverrides.policy ?? 0,
  )
  const discoveryPriority = policyProfile.intentPriorityOverrides['product-discovery'] ?? 0
  const currentPriority = policyProfile.intentPriorityOverrides[decision.intent] ?? 0.38

  if (supportPriority - currentPriority >= 0.12) {
    return {
      ...decision,
      intent: 'support' as const,
      action: 'support' as const,
      responsePlan: {
        kind: 'policy' as const,
        topic: decision.responsePlan.topic,
        intentGoal: 'support-policy-clarity' as const,
        requiredData: decision.responsePlan.requiredData,
        constraints: decision.responsePlan.constraints,
        optionalCloseStyle: 'safe-guidance' as const,
      },
      confidence: clamp(decision.confidence + intentBudget),
    }
  }

  if (discoveryPriority - currentPriority >= 0.12) {
    const responsePlanKind: BrandSoulResponsePlan['kind'] = decision.responsePlan.kind === 'greeting' ? 'general' : 'product'

    return {
      ...decision,
      intent: 'product-discovery' as const,
      action: 'guide' as const,
      responsePlan: {
        kind: responsePlanKind,
        topic: decision.responsePlan.topic,
        intentGoal: 'guide-product-selection' as const,
        requiredData: decision.responsePlan.requiredData,
        constraints: decision.responsePlan.constraints,
        optionalCloseStyle: 'guide-choice' as const,
      },
      confidence: clamp(decision.confidence + intentBudget * 0.9),
    }
  }

  return decision
}

function resolvePreferredAction(decision: BrandSoulDecision, policyProfile: BrandSoulPolicyProfile) {
  const matrix = policyProfile.actionPreferenceMatrix[decision.intent]
  if (!matrix) {
    return undefined
  }

  const entries = Object.entries(matrix) as Array<[BrandSoulActionType, number]>
  const currentPreference = matrix[decision.action] ?? 0
  const preferred = entries.sort((left, right) => right[1] - left[1])[0]

  if (!preferred || preferred[1] - currentPreference < 0.16) {
    return undefined
  }

  return preferred[0]
}

function applyActionPolicy(decision: BrandSoulDecision, policyProfile: BrandSoulPolicyProfile) {
  const actionBudget = resolveActionBudget(policyProfile)
  if (actionBudget < 0.02) {
    return decision
  }

  const preferredAction = resolvePreferredAction(decision, policyProfile)
  if (!preferredAction || preferredAction === decision.action) {
    return decision
  }

  if (decision.intent === 'product-discovery' && preferredAction === 'sell') {
    return withResponsePlan(
      {
        ...decision,
        action: 'sell' as const,
        confidence: clamp(decision.confidence + actionBudget * 0.8),
      },
      {
        ...decision.responsePlan,
        optionalCloseStyle: 'explore-promotion' as const,
      },
    )
  }

  if ((decision.intent === 'promotion' || decision.intent === 'purchase') && preferredAction === 'inform') {
    return withResponsePlan(
      {
        ...decision,
        action: 'inform' as const,
        confidence: clamp(decision.confidence - actionBudget * 0.65),
      },
      {
        ...decision.responsePlan,
        optionalCloseStyle: 'safe-guidance' as const,
      },
    )
  }

  if ((decision.intent === 'support' || decision.intent === 'policy') && preferredAction === 'support') {
    return withResponsePlan(decision, {
      ...decision.responsePlan,
      optionalCloseStyle: 'safe-guidance',
    })
  }

  return decision
}

function applyConfidencePolicy(decision: BrandSoulDecision, policyProfile: BrandSoulPolicyProfile) {
  const confidenceBudget = clamp(
    policyProfile.decisionWeights.confidenceWeight * policyProfile.policyStability * (1 - policyProfile.policyDrift * 0.4),
    0,
    policyProfile.confidenceAdjustmentProfile.maxAdjustment,
  )
  const intentAdjustment = policyProfile.confidenceAdjustmentProfile.intentAdjustments[decision.intent] ?? 0
  const actionAdjustment = policyProfile.confidenceAdjustmentProfile.actionAdjustments[decision.action] ?? 0
  const rawAdjustment = clamp(
    policyProfile.confidenceAdjustmentProfile.baseAdjustment + intentAdjustment + actionAdjustment,
    -policyProfile.confidenceAdjustmentProfile.maxAdjustment,
    policyProfile.confidenceAdjustmentProfile.maxAdjustment,
  )

  if (Math.abs(rawAdjustment) < 0.01 || confidenceBudget <= 0) {
    return decision
  }

  return {
    ...decision,
    confidence: clamp(decision.confidence + clamp(rawAdjustment, -confidenceBudget, confidenceBudget)),
  }
}

export function applyPolicyToDecision(baseDecision: BrandSoulDecision, policyProfile: BrandSoulPolicyProfile): BrandSoulDecision {
  return applyPolicyToDecisionWithMode(baseDecision, policyProfile, { allowSemanticRewrite: true })
}

export function applyPolicyToDecisionWithMode(
  baseDecision: BrandSoulDecision,
  policyProfile: BrandSoulPolicyProfile,
  options: {
    allowSemanticRewrite?: boolean
  } = {},
): BrandSoulDecision {
  const { allowSemanticRewrite = true } = options

  if (isCriticalDecision(baseDecision)) {
    return baseDecision
  }

  if (!allowSemanticRewrite) {
    return applyConfidencePolicy(baseDecision, policyProfile)
  }

  const intentAdjustedDecision = applyGeneralIntentPolicy(baseDecision, policyProfile)
  const actionAdjustedDecision = applyActionPolicy(intentAdjustedDecision, policyProfile)

  return applyConfidencePolicy(actionAdjustedDecision, policyProfile)
}