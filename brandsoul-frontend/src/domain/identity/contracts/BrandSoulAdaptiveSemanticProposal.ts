import type {
  BrandSoulActionType,
  BrandSoulDetectedIntent,
  BrandSoulResponseCloseStyle,
  BrandSoulResponseIntentGoal,
  BrandSoulResponsePlanKind,
} from './BrandSoulDecision'

export type BrandSoulAdaptiveSemanticZone = 'safe' | 'critical' | 'prohibited'

export type BrandSoulAdaptiveResponsePlanSkeleton = {
  kind: BrandSoulResponsePlanKind
  topic: string
  intentGoal: BrandSoulResponseIntentGoal
  optionalCloseStyle?: BrandSoulResponseCloseStyle
}

export type BrandSoulAdaptiveSemanticProposalEvidence = {
  memoryStrength: number
  historicalReliability: number
  strategyAlignment: number
  policyStability: number
  adaptiveReadiness: number
  recentOutcomeWeight: number
}

export type BrandSoulAdaptiveSemanticProposal = {
  proposedIntent?: BrandSoulDetectedIntent
  proposedAction?: BrandSoulActionType
  proposedResponsePlanSkeleton?: BrandSoulAdaptiveResponsePlanSkeleton
  proposalConfidence: number
  proposalEvidence: BrandSoulAdaptiveSemanticProposalEvidence
  semanticZone: BrandSoulAdaptiveSemanticZone
  fallbackRequired: boolean
}