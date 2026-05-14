import type { MarketSignal } from '../contracts/MarketSignal.js'
import type { EntityActionSuggestion } from './contracts/EntityActionSuggestion.js'

type JsonRecord = Record<string, unknown>

export type MatchableEntity = {
  entityId: string
  entityName: string
} & JsonRecord

type MatchRule = {
  categories: MarketSignal['category'][]
  terms: Array<{
    pattern: string
    weight: number
  }>
  suggestedAction: string
}

const MATCH_RULES: MatchRule[] = [
  {
    categories: ['legal'],
    terms: [
      { pattern: 'legal', weight: 0.45 },
      { pattern: 'lawyer', weight: 0.35 },
      { pattern: 'attorney', weight: 0.35 },
    ],
    suggestedAction: 'route_legal_lead',
  },
  {
    categories: ['real_estate'],
    terms: [
      { pattern: 'real estate', weight: 0.45 },
      { pattern: 'imobile', weight: 0.3 },
      { pattern: 'property', weight: 0.3 },
    ],
    suggestedAction: 'route_real_estate_lead',
  },
  {
    categories: ['logistics'],
    terms: [
      { pattern: 'freight', weight: 0.35 },
      { pattern: 'cargo', weight: 0.35 },
      { pattern: 'logistics', weight: 0.45 },
      { pattern: 'port', weight: 0.25 },
    ],
    suggestedAction: 'route_logistics_lead',
  },
  {
    categories: ['finance'],
    terms: [
      { pattern: 'equity', weight: 0.35 },
      { pattern: 'finance', weight: 0.45 },
      { pattern: 'investment', weight: 0.35 },
    ],
    suggestedAction: 'route_finance_lead',
  },
]

function normalize(value: string) {
  return ` ${value.trim().toLowerCase().replace(/\s+/g, ' ')} `
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function pickRule(category: MarketSignal['category']) {
  return MATCH_RULES.find((rule) => rule.categories.includes(category))
}

function buildEntityMatchText(entity: MatchableEntity) {
  const parts = [
    entity.entityName,
    typeof entity.market === 'string' ? entity.market : '',
    typeof entity.description === 'string' ? entity.description : '',
    typeof entity.summary === 'string' ? entity.summary : '',
    typeof entity.category === 'string' ? entity.category : '',
  ]

  return normalize(parts.filter(Boolean).join(' '))
}

function scoreEntityMatch(entity: MatchableEntity, rule: MatchRule) {
  const haystack = buildEntityMatchText(entity)
  const matchedTerms = rule.terms.filter((term) => haystack.includes(term.pattern))
  const score = matchedTerms.reduce((total, term) => total + term.weight, 0)

  return {
    confidence: clamp(Number(score.toFixed(4)), 0, 1),
    matchedTerms: matchedTerms.map((term) => term.pattern),
  }
}

export function matchEntitiesToMarketSignal(
  signal: MarketSignal,
  entities: MatchableEntity[],
): EntityActionSuggestion[] {
  const rule = pickRule(signal.category)
  if (!rule) {
    return []
  }

  return entities
    .map((entity) => {
      const { confidence, matchedTerms } = scoreEntityMatch(entity, rule)
      if (confidence <= 0) {
        return undefined
      }

      const reasoning = matchedTerms.length > 0
        ? `Matched ${signal.category} signal "${signal.keyword}" using terms: ${matchedTerms.join(', ')}.`
        : `Matched ${signal.category} signal "${signal.keyword}" by category proximity.`

      const suggestion: EntityActionSuggestion = {
        entityId: entity.entityId,
        entityName: entity.entityName,
        suggestedAction: rule.suggestedAction,
        confidence,
        reasoning,
      }

      return suggestion
    })
    .filter((suggestion): suggestion is EntityActionSuggestion => Boolean(suggestion))
    .sort((left, right) => right.confidence - left.confidence)
}
