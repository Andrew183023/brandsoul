import type { BrandSoulActionType, BrandSoulDetectedIntent } from './BrandSoulDecision'

export type BrandSoulIntentSelectionWeights = Partial<Record<BrandSoulDetectedIntent, number>>

export type BrandSoulActionSelectionBias = Partial<Record<BrandSoulActionType, number>>

export type BrandSoulConfidenceScalingProfile = {
  baseScale: number
  intentScales: Partial<Record<BrandSoulDetectedIntent, number>>
  actionScales: Partial<Record<BrandSoulActionType, number>>
  minScale: number
  maxScale: number
  evidenceThreshold: number
}

export type BrandSoulExplorationVsExploitationBalance = {
  explorationBias: number
  exploitationBias: number
}

export type BrandSoulAdaptiveDecisionSafetyProfile = {
  killSwitchEnabled: boolean
  localRollbackEnabled: boolean
  minimumEvidence: number
  criticalConfidenceThreshold: number
  rollbackDriftThreshold: number
  maxIntentPromotionBudget: number
  maxActionPromotionBudget: number
  maxConfidencePromotionBudget: number
  maxStylePromotionBudget: number
}

export type BrandSoulAdaptiveDecisionProfile = {
  intentSelectionWeights: BrandSoulIntentSelectionWeights
  actionSelectionBias: BrandSoulActionSelectionBias
  confidenceScalingProfile: BrandSoulConfidenceScalingProfile
  explorationVsExploitationBalance: BrandSoulExplorationVsExploitationBalance
  safetyProfile: BrandSoulAdaptiveDecisionSafetyProfile
  adaptationConfidence: number
  decisionDrift: number
}