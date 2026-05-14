import type { MarketCategory } from '../../market-signals/relevance/marketDomainClassifier.js'
import type { LeadProbability } from '../../market-signals/relevance/leadProbability.js'

export type OpportunityAggregate = {
  id: string
  marketSignalId: string
  keyword: string
  category: MarketCategory
  economicRelevance: number
  leadProbability: LeadProbability
  opportunityScore: number
  detectedAt: string
  topEntityId: string | null
  topEntityName: string | null
  confidence: number | null
  suggestedAction: string | null
  createdAt: string
  updatedAt: string
}

export type UpsertOpportunityAggregateInput = Omit<OpportunityAggregate, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildOpportunityAggregateId(input: {
  marketSignalId: string
  keyword: string
  category: MarketCategory
}) {
  const signalPart = normalizeIdentifierPart(input.marketSignalId) || 'signal'
  const keywordPart = normalizeIdentifierPart(input.keyword) || 'keyword'
  return `opportunity:${input.category}:${keywordPart}:${signalPart}`
}

function buildDetectedAtHourBucket(detectedAt: string) {
  const parsedAt = Date.parse(detectedAt)
  if (Number.isNaN(parsedAt)) {
    return 'unknown'
  }

  return new Date(parsedAt).toISOString().slice(0, 13)
}

export function buildOpportunityAggregateRuntimeId(input: {
  keyword: string
  entityId: string | null
  detectedAt: string
  category: MarketCategory
}) {
  const keywordPart = normalizeIdentifierPart(input.keyword) || 'keyword'
  const entityPart = normalizeIdentifierPart(input.entityId ?? 'unassigned') || 'unassigned'
  const bucketPart = normalizeIdentifierPart(buildDetectedAtHourBucket(input.detectedAt)) || 'unknown'
  return `opportunity-runtime:${input.category}:${keywordPart}:${entityPart}:${bucketPart}`
}
