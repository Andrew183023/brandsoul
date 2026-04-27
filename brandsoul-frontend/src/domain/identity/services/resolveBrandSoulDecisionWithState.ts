import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulAdaptiveDecisionCoreResolution } from '../contracts/BrandSoulAdaptiveDecisionCore'
import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulInteractionOutcome } from '../contracts/BrandSoulInteractionOutcome'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { applyAdaptiveDecisionLearning } from './applyAdaptiveDecisionLearning'
import { applyPolicyAdaptation } from './applyPolicyAdaptation'
import { applyPolicyToDecisionWithMode } from './applyPolicyToDecision'
import { applyStrategyAdaptationToDecision } from './applyStrategyAdaptationToDecision'
import { applyCognitiveStateDecisionBias } from './applyCognitiveStateDecisionBias'
import { applyBehaviorFeedbackToCognitiveStateWithInfluence } from './applyBehaviorFeedbackToCognitiveState'
import { initializeBrandSoulAdaptiveDecisionProfile } from './initializeBrandSoulAdaptiveDecisionProfile'
import { initializeBrandSoulPolicyProfile } from './initializeBrandSoulPolicyProfile'
import { initializeBrandSoulStrategyProfile } from './initializeBrandSoulStrategyProfile'
import {
  qualifyBrandSoulInteractionOutcome,
  type BrandSoulExplicitUserFeedback,
  type BrandSoulObservableInteractionSignals,
} from './qualifyBrandSoulInteractionOutcome'
import { resolveBrandSoulAdaptiveDecisionCore } from './resolveBrandSoulAdaptiveDecisionCore'
import { resolveBrandSoulDecision } from './resolveBrandSoulResponse'
import { initializeBrandSoulHistoricalSignals, updateBrandSoulHistoricalSignals } from './updateBrandSoulHistoricalSignals'
import { updateBrandSoulCognitiveState } from './updateBrandSoulCognitiveState'

export type BrandSoulDecisionWithStateResolution = {
  decision: BrandSoulDecision
  adaptiveDecisionCore: BrandSoulAdaptiveDecisionCoreResolution
  nextCognitiveState: BrandSoulCognitiveState
  nextHistoricalSignals: BrandSoulHistoricalSignals
  nextPolicyProfile: BrandSoulPolicyProfile
  nextAdaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  qualifiedInteractionOutcome?: BrandSoulQualifiedInteractionOutcome
  nextStrategyProfile: BrandSoulStrategyProfile
}

function preserveTerminalSemanticDecision(
  authoritativeDecision: BrandSoulDecision,
  candidateDecision: BrandSoulDecision,
  decisionSource: BrandSoulAdaptiveDecisionCoreResolution['decisionSource'],
): BrandSoulDecision {
  if (decisionSource !== 'adaptive-core') {
    return candidateDecision
  }

  return {
    ...candidateDecision,
    intent: authoritativeDecision.intent,
    action: authoritativeDecision.action,
    responsePlan: {
      ...authoritativeDecision.responsePlan,
      optionalCloseStyle: candidateDecision.responsePlan.optionalCloseStyle ?? authoritativeDecision.responsePlan.optionalCloseStyle,
    },
    statePatch: authoritativeDecision.statePatch,
    memoryCandidates: authoritativeDecision.memoryCandidates,
  }
}

export function resolveBrandSoulDecisionWithState(args: {
  context: BrandSoulContext
  userMessage: string
  currentState: BrandSoulCognitiveState
  currentAdaptiveDecisionProfile?: BrandSoulAdaptiveDecisionProfile
  currentPolicyProfile?: BrandSoulPolicyProfile
  currentStrategyProfile?: BrandSoulStrategyProfile
  explicitUserFeedback?: BrandSoulExplicitUserFeedback
  historicalSignals?: BrandSoulHistoricalSignals
  interactionOutcome?: BrandSoulInteractionOutcome
  observableInteractionSignals?: BrandSoulObservableInteractionSignals
  qualifiedOutcomeHistory?: BrandSoulQualifiedInteractionOutcome[]
}): BrandSoulDecisionWithStateResolution {
  const {
    context,
    userMessage,
    currentState,
    currentAdaptiveDecisionProfile,
    currentPolicyProfile,
    currentStrategyProfile,
    explicitUserFeedback,
    historicalSignals,
    interactionOutcome,
    observableInteractionSignals,
    qualifiedOutcomeHistory,
  } = args
  const baseDecision = resolveBrandSoulDecision(context, userMessage)
  const resolvedStrategyProfile = currentStrategyProfile ?? initializeBrandSoulStrategyProfile(currentState)
  const resolvedPolicyProfile = currentPolicyProfile ?? initializeBrandSoulPolicyProfile(resolvedStrategyProfile, currentState)
  const resolvedAdaptiveDecisionProfile = currentAdaptiveDecisionProfile ?? initializeBrandSoulAdaptiveDecisionProfile(resolvedStrategyProfile, resolvedPolicyProfile)
  const resolvedHistoricalSignals = historicalSignals ?? initializeBrandSoulHistoricalSignals()
  const qualifiedInteractionOutcome = interactionOutcome
    ? qualifyBrandSoulInteractionOutcome({
        rawInteractionOutcome: interactionOutcome,
        userMessage,
        context,
        historicalSignals: resolvedHistoricalSignals,
        observableSignals: observableInteractionSignals,
        explicitFeedback: explicitUserFeedback,
      })
    : undefined
  const adaptiveDecisionCore = resolveBrandSoulAdaptiveDecisionCore({
    userMessage,
    baseDecision,
    currentState,
    adaptiveDecisionProfile: resolvedAdaptiveDecisionProfile,
    strategyProfile: resolvedStrategyProfile,
    policyProfile: resolvedPolicyProfile,
    historicalSignals: resolvedHistoricalSignals,
    memorySignals: baseDecision.memoryInfluence,
    qualifiedOutcomeHistory,
  })
  const allowSemanticRewrite = adaptiveDecisionCore.decisionSource !== 'adaptive-core'
  const authoritativeDecision = adaptiveDecisionCore.decision
  const policyAdjustedDecision = preserveTerminalSemanticDecision(
    authoritativeDecision,
    applyPolicyToDecisionWithMode(adaptiveDecisionCore.decision, resolvedPolicyProfile, {
      allowSemanticRewrite,
    }),
    adaptiveDecisionCore.decisionSource,
  )
  const cognitiveStateBiasResult = applyCognitiveStateDecisionBias(
    currentState,
    policyAdjustedDecision,
    baseDecision.memoryInfluence,
    {
      allowSemanticRewrite,
    },
  )
  const biasedDecision: BrandSoulDecision = {
    ...preserveTerminalSemanticDecision(
      authoritativeDecision,
      cognitiveStateBiasResult.decision,
      adaptiveDecisionCore.decisionSource,
    ),
    cognitiveStateInfluence: cognitiveStateBiasResult.cognitiveStateInfluence,
  }
  const strategyAdaptationResult = applyStrategyAdaptationToDecision({
    currentStrategyProfile: resolvedStrategyProfile,
    decision: biasedDecision,
    cognitiveState: currentState,
    memorySignals: baseDecision.memoryInfluence,
    behaviorFeedback: qualifiedInteractionOutcome,
    allowSemanticRewrite,
  })
  const semanticallyFinalDecision = preserveTerminalSemanticDecision(
    authoritativeDecision,
    strategyAdaptationResult.decision,
    adaptiveDecisionCore.decisionSource,
  )
  const evolvedState = updateBrandSoulCognitiveState(currentState, semanticallyFinalDecision, baseDecision.memoryInfluence)
  const behaviorFeedbackResult = qualifiedInteractionOutcome
    ? applyBehaviorFeedbackToCognitiveStateWithInfluence(evolvedState, semanticallyFinalDecision, qualifiedInteractionOutcome)
    : undefined
  const nextHistoricalSignals = qualifiedInteractionOutcome
    ? updateBrandSoulHistoricalSignals(resolvedHistoricalSignals, semanticallyFinalDecision, qualifiedInteractionOutcome)
    : resolvedHistoricalSignals
  const nextCognitiveState = behaviorFeedbackResult?.nextState ?? evolvedState
  const nextPolicyProfile = applyPolicyAdaptation({
    policyProfile: resolvedPolicyProfile,
    strategyProfile: strategyAdaptationResult.updatedStrategyProfile,
    cognitiveState: nextCognitiveState,
    memorySignals: baseDecision.memoryInfluence,
    behaviorFeedback: qualifiedInteractionOutcome,
    historicalSignals: nextHistoricalSignals,
  })
  const nextAdaptiveDecisionProfile = applyAdaptiveDecisionLearning({
    adaptiveDecisionProfile: resolvedAdaptiveDecisionProfile,
    historicalSignals: nextHistoricalSignals,
    qualifiedOutcomes: qualifiedInteractionOutcome ? [qualifiedInteractionOutcome] : [],
    strategyProfile: strategyAdaptationResult.updatedStrategyProfile,
    policyProfile: nextPolicyProfile,
  })

  return {
    decision: {
      ...semanticallyFinalDecision,
      behaviorFeedbackInfluence: behaviorFeedbackResult?.behaviorFeedbackInfluence,
    },
    adaptiveDecisionCore,
    nextCognitiveState,
    nextHistoricalSignals,
    nextPolicyProfile,
    nextAdaptiveDecisionProfile,
    qualifiedInteractionOutcome,
    nextStrategyProfile: strategyAdaptationResult.updatedStrategyProfile,
  }
}