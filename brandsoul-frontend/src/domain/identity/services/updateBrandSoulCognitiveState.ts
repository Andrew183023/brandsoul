import type { BrandSoulActionType, BrandSoulDecision, BrandSoulDetectedIntent, BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulCognitiveDrive, BrandSoulCognitiveMode, BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function applyDelta(value: number, delta: number, limit = 0.08) {
  return clamp(value + clamp(delta, -limit, limit))
}

function resolveTargetMode(decision: BrandSoulDecision): BrandSoulCognitiveMode {
  if (decision.intent === 'support' || decision.intent === 'policy' || decision.action === 'support') {
    return 'support'
  }

  if (decision.intent === 'promotion' || decision.intent === 'purchase' || decision.action === 'sell') {
    return 'conversion'
  }

  if (decision.intent === 'product-discovery' || decision.action === 'guide') {
    return 'exploration'
  }

  return 'neutral'
}

function resolveNextMode(previousMode: BrandSoulCognitiveMode, targetMode: BrandSoulCognitiveMode, adaptationMomentum: number) {
  if (targetMode === previousMode) {
    return previousMode
  }

  if (adaptationMomentum >= 0.36 || targetMode === 'neutral') {
    return targetMode
  }

  return previousMode
}

function resolveTargetDrive(action: BrandSoulActionType): BrandSoulCognitiveDrive {
  if (action === 'sell') {
    return 'sell'
  }

  if (action === 'guide') {
    return 'explore'
  }

  if (action === 'support' || action === 'refuse') {
    return 'clarify'
  }

  return 'assist'
}

function resolveContinuityBoost(memorySignals: BrandSoulMemoryInfluence) {
  return memorySignals.signalsUsed.reduce((boost, signal) => {
    if (signal.category === 'recent-context') {
      return boost + 0.05
    }

    if (signal.category === 'persistent-trend' || signal.category === 'derived-preference') {
      return boost + 0.04
    }

    return boost + 0.02
  }, 0)
}

function resolveOscillationPenalty(previousState: BrandSoulCognitiveState, nextMode: BrandSoulCognitiveMode, nextDrive: BrandSoulCognitiveDrive) {
  let penalty = 0

  if (previousState.currentMode !== nextMode) {
    penalty += 0.06
  }

  if (previousState.dominantDrive !== nextDrive) {
    penalty += 0.04
  }

  if (
    (previousState.currentMode === 'support' && nextMode === 'conversion') ||
    (previousState.currentMode === 'conversion' && nextMode === 'support')
  ) {
    penalty += 0.03
  }

  return penalty
}

function resolveFocusDelta(decision: BrandSoulDecision, memorySignals: BrandSoulMemoryInfluence) {
  const structuredPlanBoost =
    decision.responsePlan.kind === 'product' ||
    decision.responsePlan.kind === 'policy' ||
    decision.responsePlan.kind === 'promotion'
      ? 0.03
      : 0

  const confidenceCentering = (decision.confidence - 0.5) * 0.08
  const ambiguityPenalty = decision.responsePlan.kind === 'general' ? -0.03 : 0
  const memoryDelta = memorySignals.applied ? 0.02 : -0.01

  return structuredPlanBoost + confidenceCentering + ambiguityPenalty + memoryDelta
}

function resolveTensionDelta(intent: BrandSoulDetectedIntent, action: BrandSoulActionType) {
  if (intent === 'support' || intent === 'policy') {
    return 0.06
  }

  if (intent === 'product-discovery') {
    return -0.04
  }

  if (intent === 'promotion' || intent === 'purchase' || action === 'sell') {
    return 0.03
  }

  if (action === 'refuse') {
    return 0.05
  }

  return -0.01
}

export function updateBrandSoulCognitiveState(
  previousState: BrandSoulCognitiveState,
  decision: BrandSoulDecision,
  memorySignals: BrandSoulMemoryInfluence,
): BrandSoulCognitiveState {
  const patternShift = Boolean(memorySignals.impact.intent || memorySignals.impact.action)
  const continuityBoost = resolveContinuityBoost(memorySignals)
  const targetDrive = resolveTargetDrive(decision.action)
  const provisionalMomentum = applyDelta(
    previousState.adaptationMomentum,
    (patternShift ? 0.08 : 0) + (memorySignals.applied ? 0.04 : -0.02) + continuityBoost * 0.3,
    0.08,
  )
  const nextMode = resolveNextMode(previousState.currentMode, resolveTargetMode(decision), provisionalMomentum)
  const oscillationPenalty = resolveOscillationPenalty(previousState, nextMode, targetDrive)
  const nextTension = applyDelta(previousState.tensionLevel, resolveTensionDelta(decision.intent, decision.action))
  const nextFocus = applyDelta(previousState.focusLevel, resolveFocusDelta(decision, memorySignals))
  const nextEngagement = applyDelta(
    previousState.engagementLevel,
    continuityBoost + (decision.action === 'guide' || decision.action === 'sell' ? 0.02 : 0) + (decision.intent === 'greeting' ? -0.02 : 0),
    0.07,
  )
  const nextStability = applyDelta(
    previousState.stability,
    -oscillationPenalty + (memorySignals.applied ? -0.01 : 0.015) + (decision.responsePlan.kind === 'general' ? -0.01 : 0.01),
    0.08,
  )

  return {
    currentMode: nextMode,
    tensionLevel: nextTension,
    focusLevel: nextFocus,
    engagementLevel: nextEngagement,
    dominantDrive: targetDrive,
    stability: nextStability,
    adaptationMomentum: provisionalMomentum,
    lastStateUpdateAt: new Date().toISOString(),
  }
}