import type { LeadProbability } from '../relevance/leadProbability.js'
import type { MarketCategory } from '../relevance/marketDomainClassifier.js'

export type MarketSignal = {
  keyword: string
  source: 'google_trends'
  category: MarketCategory
  trendScore: number
  momentum: 'rising' | 'stable' | 'falling'
  growthPercentage: number
  opportunityScore: number
  economicRelevance: number
  leadProbability: LeadProbability
  isNoise: boolean
  detectedAt: string
}
