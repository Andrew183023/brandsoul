import type { BrandSoulDecision } from './BrandSoulDecision'
import type { BrandSoulAdaptiveSemanticProposal } from './BrandSoulAdaptiveSemanticProposal'

export type BrandSoulAdaptiveCoreDecisionGenerator =
  | 'semantic-proposal'
  | 'intent-generator'
  | 'action-generator'
  | 'style-generator'
  | 'confidence-arbitration'

export type BrandSoulAdaptiveCoreFallbackCondition =
  | 'guardrail-boundary'
  | 'kill-switch'
  | 'critical-heuristic-confidence'
  | 'insufficient-evidence'
  | 'insufficient-learning-confidence'
  | 'insufficient-adaptive-priority'
  | 'excessive-drift'
  | 'unsafe-semantic-zone'
  | 'semantic-fallback-required'
  | 'no-material-adaptive-shift'

export type BrandSoulAdaptiveDecisionConfidenceArbitration = {
  minimumHeuristicConfidenceBypass: number
  minimumLearningConfidence: number
  minimumAdaptivePriority: number
  minimumReliableEvidence: number
}

export type BrandSoulAdaptiveDecisionCore = {
  decisionGenerators: BrandSoulAdaptiveCoreDecisionGenerator[]
  confidenceArbitration: BrandSoulAdaptiveDecisionConfidenceArbitration
  fallbackConditions: BrandSoulAdaptiveCoreFallbackCondition[]
  adaptivePriority: number
  learningConfidence: number
}

export type BrandSoulAdaptiveDecisionSource = 'adaptive-core' | 'heuristic-fallback'

export type BrandSoulAdaptiveDecisionCoreResolution = {
  decision: BrandSoulDecision
  decisionSource: BrandSoulAdaptiveDecisionSource
  lowRiskLaneUsed: boolean
  semanticProposal: BrandSoulAdaptiveSemanticProposal
  core: BrandSoulAdaptiveDecisionCore
}