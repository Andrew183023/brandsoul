import type { MarketSignal } from '../contracts/MarketSignal.js'

const BOOST_TERMS = [
  { pattern: 'lawyer', weight: 16 },
  { pattern: 'stock', weight: 12 },
  { pattern: 'oil', weight: 12 },
  { pattern: 'freight', weight: 14 },
  { pattern: 'mortgage', weight: 14 },
  { pattern: 'attorney', weight: 16 },
  { pattern: 'debt', weight: 12 },
  { pattern: 'insurance', weight: 12 },
  { pattern: 'lawsuit', weight: 16 },
  { pattern: 'cargo', weight: 14 },
  { pattern: 'logistics', weight: 14 },
  { pattern: 'prices', weight: 10 },
] as const

const REDUCE_TERMS = [
  { pattern: 'celebrity', weight: 24 },
  { pattern: 'sports', weight: 18 },
  { pattern: 'entertainment', weight: 18 },
] as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeKeyword(keyword: string) {
  return ` ${keyword.trim().toLowerCase().replace(/\s+/g, ' ')} `
}

export function calculateEconomicRelevance(signal: Pick<MarketSignal, 'keyword' | 'trendScore' | 'opportunityScore'>) {
  const normalizedKeyword = normalizeKeyword(signal.keyword)
  const baseScore = clamp(signal.trendScore * 0.4 + signal.opportunityScore * 30, 0, 55)

  const boostScore = BOOST_TERMS.reduce((score, term) => (
    normalizedKeyword.includes(term.pattern)
      ? score + term.weight
      : score
  ), 0)

  const penaltyScore = REDUCE_TERMS.reduce((score, term) => (
    normalizedKeyword.includes(term.pattern)
      ? score + term.weight
      : score
  ), 0)

  return clamp(Math.round(baseScore + boostScore - penaltyScore), 0, 100)
}
