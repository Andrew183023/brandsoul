import type {
  BrandSoulCognitiveStateInfluence,
  BrandSoulCognitiveStateInfluenceSignalUse,
  BrandSoulDecision,
  BrandSoulMemoryInfluence,
  BrandSoulResponsePlan,
} from '../contracts/BrandSoulDecision'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'

export type BrandSoulCognitiveStateDecisionBiasResult = {
  decision: BrandSoulDecision
  cognitiveStateInfluence: BrandSoulCognitiveStateInfluence
  influenceStrength: number
  applied: boolean
}

const MAX_COGNITIVE_STATE_DECISION_INFLUENCE = 0.2
const CRITICAL_INTENT_CONFIDENCE = 0.84

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function roundInfluenceScore(value: number) {
  return Number(clamp(value).toFixed(4))
}

function isCriticalDecision(decision: BrandSoulDecision) {
  return decision.intent === 'guardrail-blocked' || decision.confidence >= CRITICAL_INTENT_CONFIDENCE
}

function buildNoCognitiveStateInfluence(baseDecision: BrandSoulDecision): BrandSoulCognitiveStateInfluence {
  return {
    applied: false,
    influenceStrength: 0,
    signalsUsed: [],
    impact: {
      confidence: {
        before: baseDecision.confidence,
        after: baseDecision.confidence,
        delta: 0,
      },
    },
  }
}

function resolveStateBudget(currentState: BrandSoulCognitiveState, memorySignals: BrandSoulMemoryInfluence, decision: BrandSoulDecision) {
  const memoryPressure = clamp(memorySignals.influenceStrength / 0.5)
  const responsiveness = clamp((1 - decision.confidence) * 0.45 + currentState.adaptationMomentum * 0.35 + (1 - currentState.stability) * 0.2)
  const availableShare = 1 - memoryPressure * 0.5
  const cappedBudget = MAX_COGNITIVE_STATE_DECISION_INFLUENCE * availableShare

  if (isCriticalDecision(decision)) {
    return clamp(Math.min(cappedBudget * 0.35, responsiveness * 0.08), 0, MAX_COGNITIVE_STATE_DECISION_INFLUENCE)
  }

  return clamp(Math.min(cappedBudget, responsiveness * MAX_COGNITIVE_STATE_DECISION_INFLUENCE), 0, MAX_COGNITIVE_STATE_DECISION_INFLUENCE)
}

function resolvePreferredStyle(currentState: BrandSoulCognitiveState, fallback: BrandSoulResponsePlan['optionalCloseStyle']) {
  if (currentState.currentMode === 'support' || currentState.dominantDrive === 'clarify') {
    return fallback === 'contextual-clarity' ? 'contextual-clarity' : 'safe-guidance'
  }

  if (currentState.currentMode === 'conversion' || currentState.dominantDrive === 'sell') {
    return 'explore-promotion'
  }

  if (currentState.currentMode === 'exploration' || currentState.dominantDrive === 'explore') {
    return fallback === 'open-dialogue' ? 'open-dialogue' : 'guide-choice'
  }

  return fallback
}

function biasSupportDecision(decision: BrandSoulDecision) {
  const responsePlan: BrandSoulResponsePlan = {
    kind: 'policy',
    topic: decision.responsePlan.topic,
    intentGoal: 'support-policy-clarity',
    requiredData: decision.responsePlan.requiredData,
    constraints: decision.responsePlan.constraints,
    optionalCloseStyle: 'safe-guidance',
  }

  return {
    ...decision,
    intent: 'support' as const,
    action: 'support' as const,
    responsePlan,
  }
}

function biasExplorationDecision(decision: BrandSoulDecision) {
  const responsePlan: BrandSoulResponsePlan = {
    kind: decision.responsePlan.kind === 'greeting' ? 'general' : decision.responsePlan.kind,
    topic: decision.responsePlan.topic,
    intentGoal:
      decision.responsePlan.kind === 'product' ? 'guide-product-selection' : 'continue-contextual-guidance',
    requiredData: decision.responsePlan.requiredData,
    constraints: decision.responsePlan.constraints,
    optionalCloseStyle: 'guide-choice',
  }

  return {
    ...decision,
    intent: 'product-discovery' as const,
    action: 'guide' as const,
    responsePlan,
  }
}

function biasConversionAction(decision: BrandSoulDecision) {
  return {
    ...decision,
    action: 'sell' as const,
    responsePlan: {
      ...decision.responsePlan,
      optionalCloseStyle: 'explore-promotion' as const,
    },
  }
}

function buildCognitiveStateSignals(args: {
  currentState: BrandSoulCognitiveState
  baseDecision: BrandSoulDecision
  nextDecision: BrandSoulDecision
  influenceBudget: number
}): BrandSoulCognitiveStateInfluenceSignalUse[] {
  const { currentState, baseDecision, nextDecision, influenceBudget } = args
  const signals: BrandSoulCognitiveStateInfluenceSignalUse[] = []
  const confidenceChanged = Math.abs(nextDecision.confidence - baseDecision.confidence) > 0.0001
  const intentChanged = nextDecision.intent !== baseDecision.intent
  const actionChanged = nextDecision.action !== baseDecision.action
  const styleChanged = nextDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle

  if (intentChanged || styleChanged || actionChanged) {
    signals.push({
      category: 'mode',
      signal: currentState.currentMode,
      stateValue: currentState.currentMode,
      influenceScore: roundInfluenceScore(influenceBudget * 0.6),
    })
    signals.push({
      category: 'drive',
      signal: currentState.dominantDrive,
      stateValue: currentState.dominantDrive,
      influenceScore: roundInfluenceScore(influenceBudget * 0.5),
    })
  }

  if (currentState.tensionLevel >= 0.54 && intentChanged && currentState.currentMode === 'support') {
    signals.push({
      category: 'tension',
      signal: 'support-escalation',
      stateValue: roundInfluenceScore(currentState.tensionLevel),
      influenceScore: roundInfluenceScore(influenceBudget * 0.42),
    })
  }

  if (confidenceChanged || intentChanged || actionChanged) {
    signals.push({
      category: 'focus',
      signal: 'decision-focus',
      stateValue: roundInfluenceScore(currentState.focusLevel),
      influenceScore: roundInfluenceScore(influenceBudget * 0.4),
    })
    signals.push({
      category: 'engagement',
      signal: 'interaction-continuity',
      stateValue: roundInfluenceScore(currentState.engagementLevel),
      influenceScore: roundInfluenceScore(influenceBudget * 0.36),
    })
    signals.push({
      category: 'adaptation-momentum',
      signal: 'adaptive-readiness',
      stateValue: roundInfluenceScore(currentState.adaptationMomentum),
      influenceScore: roundInfluenceScore(influenceBudget * 0.32),
    })
  }

  if (confidenceChanged) {
    signals.push({
      category: 'stability',
      signal: 'stability-window',
      stateValue: roundInfluenceScore(currentState.stability),
      influenceScore: roundInfluenceScore(influenceBudget * 0.24),
    })
  }

  return signals
}

function buildCognitiveStateInfluence(args: {
  currentState: BrandSoulCognitiveState
  baseDecision: BrandSoulDecision
  nextDecision: BrandSoulDecision
  influenceStrength: number
  influenceBudget: number
  applied: boolean
}): BrandSoulCognitiveStateInfluence {
  const { currentState, baseDecision, nextDecision, influenceStrength, influenceBudget, applied } = args

  if (!applied) {
    return buildNoCognitiveStateInfluence(baseDecision)
  }

  return {
    applied: true,
    influenceStrength,
    signalsUsed: buildCognitiveStateSignals({
      currentState,
      baseDecision,
      nextDecision,
      influenceBudget,
    }),
    impact: {
      confidence: {
        before: baseDecision.confidence,
        after: nextDecision.confidence,
        delta: clamp(nextDecision.confidence - baseDecision.confidence, -1, 1),
      },
      intent:
        nextDecision.intent !== baseDecision.intent
          ? {
              before: baseDecision.intent,
              after: nextDecision.intent,
            }
          : undefined,
      action:
        nextDecision.action !== baseDecision.action
          ? {
              before: baseDecision.action,
              after: nextDecision.action,
            }
          : undefined,
      responsePlanStyle:
        nextDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle
          ? {
              before: baseDecision.responsePlan.optionalCloseStyle,
              after: nextDecision.responsePlan.optionalCloseStyle,
            }
          : undefined,
    },
  }
}

export function applyCognitiveStateDecisionBias(
  currentState: BrandSoulCognitiveState,
  baseDecision: BrandSoulDecision,
  memorySignals: BrandSoulMemoryInfluence,
  options: {
    allowSemanticRewrite?: boolean
  } = {},
): BrandSoulCognitiveStateDecisionBiasResult {
  const { allowSemanticRewrite = true } = options
  const influenceBudget = resolveStateBudget(currentState, memorySignals, baseDecision)

  if (influenceBudget <= 0 || baseDecision.intent === 'guardrail-blocked') {
    return {
      decision: baseDecision,
      cognitiveStateInfluence: buildNoCognitiveStateInfluence(baseDecision),
      influenceStrength: 0,
      applied: false,
    }
  }

  let nextDecision: BrandSoulDecision = {
    ...baseDecision,
    responsePlan: {
      ...baseDecision.responsePlan,
      optionalCloseStyle: resolvePreferredStyle(currentState, baseDecision.responsePlan.optionalCloseStyle),
    },
    confidence: clamp(baseDecision.confidence + influenceBudget * (0.16 + currentState.focusLevel * 0.1 + currentState.engagementLevel * 0.06)),
  }

  const canShiftIntent = allowSemanticRewrite && !isCriticalDecision(baseDecision) && baseDecision.intent === 'general'

  if (
    canShiftIntent &&
    currentState.currentMode === 'support' &&
    currentState.dominantDrive === 'clarify' &&
    currentState.tensionLevel >= 0.54 &&
    currentState.focusLevel >= 0.52 &&
    influenceBudget >= 0.08
  ) {
    nextDecision = biasSupportDecision(nextDecision)
  } else if (
    canShiftIntent &&
    currentState.currentMode === 'exploration' &&
    currentState.dominantDrive === 'explore' &&
    currentState.focusLevel >= 0.58 &&
    currentState.engagementLevel >= 0.52 &&
    influenceBudget >= 0.08
  ) {
    nextDecision = biasExplorationDecision(nextDecision)
  } else if (
    allowSemanticRewrite &&
    !isCriticalDecision(baseDecision) &&
    baseDecision.intent === 'product-discovery' &&
    currentState.currentMode === 'conversion' &&
    currentState.dominantDrive === 'sell' &&
    currentState.engagementLevel >= 0.58 &&
    influenceBudget >= 0.06
  ) {
    nextDecision = biasConversionAction(nextDecision)
  }

  const intentChanged = nextDecision.intent !== baseDecision.intent
  const actionChanged = nextDecision.action !== baseDecision.action
  const styleChanged = nextDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle
  const confidenceChanged = Math.abs(nextDecision.confidence - baseDecision.confidence) > 0.0001
  const applied = intentChanged || actionChanged || styleChanged || confidenceChanged
  const influenceStrength = applied
    ? clamp(
        Math.abs(nextDecision.confidence - baseDecision.confidence) +
          (intentChanged ? 0.08 : 0) +
          (actionChanged ? 0.06 : 0) +
          (styleChanged ? 0.04 : 0),
        0,
        MAX_COGNITIVE_STATE_DECISION_INFLUENCE,
      )
    : 0

  return {
    decision: nextDecision,
    cognitiveStateInfluence: buildCognitiveStateInfluence({
      currentState,
      baseDecision,
      nextDecision,
      influenceStrength,
      influenceBudget,
      applied,
    }),
    influenceStrength,
    applied,
  }
}