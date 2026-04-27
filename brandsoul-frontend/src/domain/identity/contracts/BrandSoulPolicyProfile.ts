import type { BrandSoulActionType, BrandSoulDetectedIntent } from './BrandSoulDecision'

export type BrandSoulDecisionWeights = {
  intentShiftWeight: number
  actionShiftWeight: number
  confidenceWeight: number
  memoryWeight: number
}

export type BrandSoulIntentPriorityOverrides = Partial<Record<BrandSoulDetectedIntent, number>>

export type BrandSoulActionPreferenceMatrix = Partial<
  Record<BrandSoulDetectedIntent, Partial<Record<BrandSoulActionType, number>>>
>

export type BrandSoulConfidenceAdjustmentProfile = {
  baseAdjustment: number
  intentAdjustments: Partial<Record<BrandSoulDetectedIntent, number>>
  actionAdjustments: Partial<Record<BrandSoulActionType, number>>
  maxAdjustment: number
  evidenceThreshold: number
  decayFactor: number
}

export type BrandSoulPolicyProfile = {
  decisionWeights: BrandSoulDecisionWeights
  intentPriorityOverrides: BrandSoulIntentPriorityOverrides
  actionPreferenceMatrix: BrandSoulActionPreferenceMatrix
  confidenceAdjustmentProfile: BrandSoulConfidenceAdjustmentProfile
  policyStability: number
  policyDrift: number
}