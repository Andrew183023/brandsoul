import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type {
  BrandSoulBehaviorFeedbackInfluence,
  BrandSoulBehaviorFeedbackInfluenceSignalUse,
  BrandSoulDecision,
} from '../contracts/BrandSoulDecision'
import type { BrandSoulInteractionOutcome } from '../contracts/BrandSoulInteractionOutcome'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import { resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'

export type BrandSoulBehaviorFeedbackToCognitiveStateResult = {
  nextState: BrandSoulCognitiveState
  behaviorFeedbackInfluence: BrandSoulBehaviorFeedbackInfluence
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function applyDelta(value: number, delta: number, limit = 0.08) {
  return clamp(value + clamp(delta, -limit, limit))
}

function resolveSuccessScore(interactionSuccess: BrandSoulInteractionOutcome['interactionSuccess']) {
  if (typeof interactionSuccess === 'boolean') {
    return interactionSuccess ? 1 : 0
  }

  return clamp(interactionSuccess)
}

function roundValue(value: number) {
  return Number(value.toFixed(4))
}

function buildNoBehaviorFeedbackInfluence(state: BrandSoulCognitiveState): BrandSoulBehaviorFeedbackInfluence {
  return {
    applied: false,
    influenceStrength: 0,
    outcomeSignalsUsed: [],
    impact: {
      focusLevel: {
        before: state.focusLevel,
        after: state.focusLevel,
        delta: 0,
      },
      engagementLevel: {
        before: state.engagementLevel,
        after: state.engagementLevel,
        delta: 0,
      },
      stability: {
        before: state.stability,
        after: state.stability,
        delta: 0,
      },
      adaptationMomentum: {
        before: state.adaptationMomentum,
        after: state.adaptationMomentum,
        delta: 0,
      },
    },
  }
}

function buildOutcomeSignals(outcome: BrandSoulInteractionOutcome): BrandSoulBehaviorFeedbackInfluenceSignalUse[] {
  const successScore = resolveSuccessScore(outcome.interactionSuccess)
  const strength = clamp(outcome.signalStrength)
  const engagementMagnitude = Math.abs(clamp(outcome.engagementDelta, -1, 1))

  return [
    {
      signal: 'interaction-success',
      value: typeof outcome.interactionSuccess === 'boolean' ? outcome.interactionSuccess : roundValue(successScore),
      influenceScore: roundValue(Math.max(strength * 0.45, successScore * 0.3)),
    },
    {
      signal: 'user-continuation',
      value: outcome.userContinuation,
      influenceScore: roundValue(outcome.userContinuation ? 0.22 + strength * 0.18 : 0.28 + strength * 0.18),
    },
    {
      signal: 'engagement-delta',
      value: roundValue(clamp(outcome.engagementDelta, -1, 1)),
      influenceScore: roundValue(engagementMagnitude * 0.4 + strength * 0.12),
    },
    {
      signal: 'signal-strength',
      value: roundValue(strength),
      influenceScore: roundValue(strength),
    },
  ]
}

function resolveWeightedOutcome(outcome: BrandSoulQualifiedInteractionOutcome) {
  const weight = resolveQualifiedInteractionOutcomeWeight(outcome)

  return {
    successScore: resolveSuccessScore(outcome.outcome.interactionSuccess),
    signalStrength: clamp(outcome.outcome.signalStrength * weight),
    engagementDelta: clamp(outcome.outcome.engagementDelta * weight, -1, 1),
    continuationWeight: outcome.outcome.userContinuation ? weight : Math.max(weight * 0.9, 0.12),
    ruptureWeight: outcome.outcome.userContinuation ? 0 : Math.max(weight, 0.12),
  }
}

function buildBehaviorFeedbackInfluence(
  previousState: BrandSoulCognitiveState,
  nextState: BrandSoulCognitiveState,
  outcome: BrandSoulInteractionOutcome,
): BrandSoulBehaviorFeedbackInfluence {
  const focusDelta = clamp(nextState.focusLevel - previousState.focusLevel, -1, 1)
  const engagementDelta = clamp(nextState.engagementLevel - previousState.engagementLevel, -1, 1)
  const stabilityDelta = clamp(nextState.stability - previousState.stability, -1, 1)
  const momentumDelta = clamp(nextState.adaptationMomentum - previousState.adaptationMomentum, -1, 1)
  const applied =
    Math.abs(focusDelta) > 0.0001 ||
    Math.abs(engagementDelta) > 0.0001 ||
    Math.abs(stabilityDelta) > 0.0001 ||
    Math.abs(momentumDelta) > 0.0001

  if (!applied) {
    return buildNoBehaviorFeedbackInfluence(previousState)
  }

  return {
    applied: true,
    influenceStrength: clamp(
      Math.abs(focusDelta) + Math.abs(engagementDelta) + Math.abs(stabilityDelta) + Math.abs(momentumDelta),
      0,
      1,
    ),
    outcomeSignalsUsed: buildOutcomeSignals(outcome),
    impact: {
      focusLevel: {
        before: previousState.focusLevel,
        after: nextState.focusLevel,
        delta: focusDelta,
      },
      engagementLevel: {
        before: previousState.engagementLevel,
        after: nextState.engagementLevel,
        delta: engagementDelta,
      },
      stability: {
        before: previousState.stability,
        after: nextState.stability,
        delta: stabilityDelta,
      },
      adaptationMomentum: {
        before: previousState.adaptationMomentum,
        after: nextState.adaptationMomentum,
        delta: momentumDelta,
      },
    },
  }
}

export function applyBehaviorFeedbackToCognitiveStateWithInfluence(
  state: BrandSoulCognitiveState,
  decision: BrandSoulDecision,
  qualifiedOutcome: BrandSoulQualifiedInteractionOutcome,
): BrandSoulBehaviorFeedbackToCognitiveStateResult {
  const { successScore, signalStrength, engagementDelta, continuationWeight, ruptureWeight } = resolveWeightedOutcome(qualifiedOutcome)
  const failurePressure = 1 - successScore
  const continuationBoost = qualifiedOutcome.outcome.userContinuation ? 0.04 * continuationWeight : -0.03 * continuationWeight
  const rupturePenalty = qualifiedOutcome.outcome.userContinuation ? 0 : 0.04 * ruptureWeight
  const clarityBoost =
    decision.responsePlan.kind === 'policy' ||
    decision.responsePlan.kind === 'product' ||
    decision.responsePlan.kind === 'promotion'
      ? 0.015
      : 0

  const nextState: BrandSoulCognitiveState = {
    ...state,
    focusLevel: applyDelta(state.focusLevel, clarityBoost + successScore * 0.02 * signalStrength - failurePressure * 0.015),
    engagementLevel: applyDelta(state.engagementLevel, continuationBoost + engagementDelta * 0.05 + signalStrength * 0.02, 0.07),
    stability: applyDelta(state.stability, successScore * 0.05 * signalStrength - failurePressure * 0.05 - rupturePenalty, 0.08),
    adaptationMomentum: applyDelta(state.adaptationMomentum, failurePressure * 0.06 * signalStrength + (qualifiedOutcome.outcome.userContinuation ? 0.01 : 0.02), 0.08),
    lastStateUpdateAt: new Date().toISOString(),
  }

  return {
    nextState,
    behaviorFeedbackInfluence: buildBehaviorFeedbackInfluence(state, nextState, qualifiedOutcome.outcome),
  }
}

export function applyBehaviorFeedbackToCognitiveState(
  state: BrandSoulCognitiveState,
  decision: BrandSoulDecision,
  qualifiedOutcome: BrandSoulQualifiedInteractionOutcome,
): BrandSoulCognitiveState {
  return applyBehaviorFeedbackToCognitiveStateWithInfluence(state, decision, qualifiedOutcome).nextState
}