import type { MarketSignal } from '../contracts/MarketSignal.js'
import type { MarketSignalSnapshot } from '../contracts/MarketSignalSnapshot.js'
import { matchEntitiesToMarketSignal, type MatchableEntity } from './entityMatchEngine.js'
import type { EntityActionSuggestion } from './contracts/EntityActionSuggestion.js'
import type { OpportunityLead } from './contracts/OpportunityLead.js'

export type OpportunityEngineResult = {
  opportunityLeads: OpportunityLead[]
  entityActionSuggestions: EntityActionSuggestion[]
}

const MINIMUM_ECONOMIC_RELEVANCE = 40

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSourceSignalId(signal: MarketSignal) {
  const keywordPart = normalizeIdentifierPart(signal.keyword) || 'signal'
  const timestampPart = normalizeIdentifierPart(signal.detectedAt) || 'unknown'
  return `market-signal:${signal.category}:${keywordPart}:${timestampPart}`
}

function buildOpportunityLeadId(signal: MarketSignal) {
  return `opportunity-lead:${buildSourceSignalId(signal)}`
}

function buildRecommendedAction(signal: MarketSignal) {
  switch (signal.category) {
    case 'legal':
      return 'Generate legal intake flow'
    case 'real_estate':
      return 'Generate property lead capture'
    case 'logistics':
      return 'Generate freight inquiry workflow'
    case 'finance':
      return 'Generate investment opportunity outreach'
    default:
      return undefined
  }
}

function isEligibleSignal(signal: MarketSignal) {
  return !signal.isNoise && signal.economicRelevance >= MINIMUM_ECONOMIC_RELEVANCE
}

function compareSignalsByRelevance(left: MarketSignal, right: MarketSignal) {
  return right.economicRelevance - left.economicRelevance
}

function toOpportunityLead(signal: MarketSignal): OpportunityLead {
  return {
    id: buildOpportunityLeadId(signal),
    keyword: signal.keyword,
    category: signal.category,
    economicRelevance: signal.economicRelevance,
    leadProbability: signal.leadProbability,
    sourceSignalId: buildSourceSignalId(signal),
    detectedAt: signal.detectedAt,
    recommendedAction: buildRecommendedAction(signal),
  }
}

export function buildOpportunityEngineResult(
  snapshot: MarketSignalSnapshot,
  availableEntities: MatchableEntity[],
): OpportunityEngineResult {
  if (snapshot.status !== 'ready') {
    return {
      opportunityLeads: [],
      entityActionSuggestions: [],
    }
  }

  const relevantSignals = [...snapshot.signals]
    .filter(isEligibleSignal)
    .sort(compareSignalsByRelevance)

  const opportunityLeads = relevantSignals.map(toOpportunityLead)
  const entityActionSuggestions = relevantSignals.flatMap((signal) => matchEntitiesToMarketSignal(signal, availableEntities))

  return {
    opportunityLeads,
    entityActionSuggestions,
  }
}
