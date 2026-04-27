import type { BrandSoulActionType, BrandSoulDetectedIntent } from './BrandSoulDecision'

export type BrandSoulHistoricalSignalAggregate = {
  sampleSize: number
  successRate: number
  continuationRate: number
  averageEngagementDelta: number
}

export type BrandSoulHistoricalSignals = {
  totalInteractions: number
  reliableEvidenceCount: number
  rollingSuccessRate: number
  rollingContinuationRate: number
  rollingEngagementDelta: number
  actionOutcomes: Partial<Record<BrandSoulActionType, BrandSoulHistoricalSignalAggregate>>
  intentOutcomes: Partial<Record<BrandSoulDetectedIntent, BrandSoulHistoricalSignalAggregate>>
  lastUpdatedAt: string
}