import type { LeadProbability } from '../../relevance/leadProbability.js'
import type { MarketCategory } from '../../relevance/marketDomainClassifier.js'

export type OpportunityLead = {
  id: string
  keyword: string
  category: MarketCategory
  economicRelevance: number
  leadProbability: LeadProbability
  sourceSignalId: string
  detectedAt: string
  recommendedAction?: string
}
