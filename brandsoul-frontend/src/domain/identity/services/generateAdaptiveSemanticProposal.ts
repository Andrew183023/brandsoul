import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulAdaptiveSemanticProposal, BrandSoulAdaptiveSemanticZone } from '../contracts/BrandSoulAdaptiveSemanticProposal'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulMemoryInfluence } from '../contracts/BrandSoulDecision'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { resolveQualifiedInteractionOutcomeWeight } from './qualifyBrandSoulInteractionOutcome'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function resolveSemanticZone(args: {
  cognitiveState: BrandSoulCognitiveState
  policyProfile: BrandSoulPolicyProfile
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  historicalSignals: BrandSoulHistoricalSignals
}) {
  const { cognitiveState, policyProfile, adaptiveDecisionProfile, historicalSignals } = args

  if (
    adaptiveDecisionProfile.safetyProfile.killSwitchEnabled ||
    adaptiveDecisionProfile.decisionDrift >= adaptiveDecisionProfile.safetyProfile.rollbackDriftThreshold ||
    cognitiveState.tensionLevel >= 0.82
  ) {
    return 'prohibited' satisfies BrandSoulAdaptiveSemanticZone
  }

  if (
    cognitiveState.tensionLevel >= 0.68 ||
    policyProfile.policyDrift >= 0.16 ||
    adaptiveDecisionProfile.adaptationConfidence < 0.4 ||
    historicalSignals.rollingSuccessRate < 0.48
  ) {
    return 'critical' satisfies BrandSoulAdaptiveSemanticZone
  }

  return 'safe' satisfies BrandSoulAdaptiveSemanticZone
}

function resolveRecentOutcomeWeight(qualifiedOutcomeHistory: BrandSoulQualifiedInteractionOutcome[]) {
  return clamp(average(qualifiedOutcomeHistory.slice(-3).map((outcome) => resolveQualifiedInteractionOutcomeWeight(outcome))))
}

export function generateAdaptiveSemanticProposal(args: {
  memorySignals: BrandSoulMemoryInfluence
  cognitiveState: BrandSoulCognitiveState
  strategyProfile: BrandSoulStrategyProfile
  policyProfile: BrandSoulPolicyProfile
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  historicalSignals: BrandSoulHistoricalSignals
  qualifiedOutcomeHistory?: BrandSoulQualifiedInteractionOutcome[]
}): BrandSoulAdaptiveSemanticProposal {
  const {
    memorySignals,
    cognitiveState,
    strategyProfile,
    policyProfile,
    adaptiveDecisionProfile,
    historicalSignals,
    qualifiedOutcomeHistory = [],
  } = args
  const semanticZone = resolveSemanticZone({
    cognitiveState,
    policyProfile,
    adaptiveDecisionProfile,
    historicalSignals,
  })
  const recentOutcomeWeight = resolveRecentOutcomeWeight(qualifiedOutcomeHistory)
  const proposalEvidence = {
    memoryStrength: memorySignals.influenceStrength,
    historicalReliability: clamp(
      historicalSignals.reliableEvidenceCount /
        Math.max(adaptiveDecisionProfile.safetyProfile.minimumEvidence, adaptiveDecisionProfile.confidenceScalingProfile.evidenceThreshold),
    ),
    strategyAlignment: clamp(
      Math.max(
        strategyProfile.strategyBias.supportBias,
        strategyProfile.strategyBias.explorationBias,
        strategyProfile.strategyBias.cautionBias * 0.8,
      ),
    ),
    policyStability: policyProfile.policyStability,
    adaptiveReadiness: clamp(
      adaptiveDecisionProfile.adaptationConfidence * 0.58 +
        cognitiveState.adaptationMomentum * 0.22 +
        cognitiveState.stability * 0.12 -
        adaptiveDecisionProfile.decisionDrift * 0.18,
    ),
    recentOutcomeWeight,
  }

  if (semanticZone !== 'safe') {
    return {
      proposalConfidence: clamp(
        proposalEvidence.historicalReliability * 0.32 +
          proposalEvidence.adaptiveReadiness * 0.28 +
          proposalEvidence.policyStability * 0.16,
      ),
      proposalEvidence,
      semanticZone,
      fallbackRequired: true,
    }
  }

  const supportReadiness = clamp(
    strategyProfile.strategyBias.supportBias * 0.28 +
      Math.max(policyProfile.intentPriorityOverrides.support ?? 0, policyProfile.intentPriorityOverrides.policy ?? 0) * 0.22 +
      (historicalSignals.intentOutcomes.support?.successRate ?? historicalSignals.intentOutcomes.policy?.successRate ?? historicalSignals.rollingSuccessRate) * 0.18 +
      cognitiveState.currentMode === 'support' ? 0.12 : 0 +
      cognitiveState.dominantDrive === 'clarify' ? 0.1 : 0 +
      memorySignals.influenceStrength * 0.08,
  )
  const explorationReadiness = clamp(
    strategyProfile.strategyBias.explorationBias * 0.28 +
      (policyProfile.intentPriorityOverrides['product-discovery'] ?? 0.48) * 0.22 +
      (historicalSignals.intentOutcomes['product-discovery']?.successRate ?? historicalSignals.rollingContinuationRate) * 0.18 +
      (historicalSignals.actionOutcomes.guide?.successRate ?? 0.5) * 0.08 +
      (cognitiveState.currentMode === 'exploration' ? 0.12 : 0) +
      (cognitiveState.dominantDrive === 'explore' ? 0.1 : 0) +
      memorySignals.influenceStrength * 0.08,
  )
  const generalReadiness = clamp(
    proposalEvidence.policyStability * 0.28 +
      proposalEvidence.adaptiveReadiness * 0.24 +
      cognitiveState.stability * 0.18 +
      (1 - cognitiveState.tensionLevel) * 0.14 +
      (1 - adaptiveDecisionProfile.decisionDrift) * 0.16,
  )

  if (supportReadiness >= explorationReadiness && supportReadiness >= 0.58) {
    return {
      proposedIntent: 'support',
      proposedAction: 'support',
      proposedResponsePlanSkeleton: {
        kind: 'policy',
        topic: cognitiveState.currentMode === 'support' ? 'suporte contextual' : 'clareza segura',
        intentGoal: 'support-policy-clarity',
        optionalCloseStyle: 'safe-guidance',
      },
      proposalConfidence: clamp(supportReadiness * 0.62 + proposalEvidence.historicalReliability * 0.2 + recentOutcomeWeight * 0.08 + proposalEvidence.memoryStrength * 0.1),
      proposalEvidence,
      semanticZone,
      fallbackRequired: false,
    }
  }

  if (explorationReadiness >= 0.58) {
    return {
      proposedIntent: 'product-discovery',
      proposedAction: 'guide',
      proposedResponsePlanSkeleton: {
        kind: 'product',
        topic: cognitiveState.currentMode === 'exploration' ? 'exploracao orientada' : 'descoberta contextual',
        intentGoal: 'guide-product-selection',
        optionalCloseStyle: 'guide-choice',
      },
      proposalConfidence: clamp(explorationReadiness * 0.62 + proposalEvidence.historicalReliability * 0.2 + recentOutcomeWeight * 0.08 + proposalEvidence.memoryStrength * 0.1),
      proposalEvidence,
      semanticZone,
      fallbackRequired: false,
    }
  }

  if (generalReadiness >= 0.62) {
    return {
      proposedIntent: 'general',
      proposedAction: 'inform',
      proposedResponsePlanSkeleton: {
        kind: 'general',
        topic: 'continuidade contextual',
        intentGoal: 'continue-contextual-guidance',
        optionalCloseStyle: 'contextual-clarity',
      },
      proposalConfidence: clamp(generalReadiness * 0.64 + proposalEvidence.historicalReliability * 0.18 + proposalEvidence.policyStability * 0.12 + recentOutcomeWeight * 0.06),
      proposalEvidence,
      semanticZone,
      fallbackRequired: false,
    }
  }

  return {
    proposalConfidence: clamp(generalReadiness * 0.42 + proposalEvidence.historicalReliability * 0.2),
    proposalEvidence,
    semanticZone,
    fallbackRequired: true,
  }
}