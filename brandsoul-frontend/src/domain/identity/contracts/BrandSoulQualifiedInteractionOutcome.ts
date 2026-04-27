import type { BrandSoulInteractionOutcome } from './BrandSoulInteractionOutcome'

export type BrandSoulInteractionOutcomeProvenance = 'observed' | 'inferred' | 'validated'

export type BrandSoulInteractionOutcomeEvidence = {
  userContinuationObserved: boolean
  responseAccepted: boolean
  explicitCorrection: boolean
  engagementObserved: boolean
  sessionContinuation: boolean
  manualValidation: boolean
}

export type BrandSoulQualifiedInteractionOutcome = {
  outcome: BrandSoulInteractionOutcome
  provenance: BrandSoulInteractionOutcomeProvenance
  confidence: number
  evidence: BrandSoulInteractionOutcomeEvidence
  observedAt: string
}