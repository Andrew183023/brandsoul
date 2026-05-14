export type MarketCategory =
  | 'legal'
  | 'real_estate'
  | 'finance'
  | 'logistics'
  | 'commerce'
  | 'ai'
  | 'agro'
  | 'general'
  | 'noise'

type CategoryRule = {
  category: Exclude<MarketCategory, 'general'>
  terms: Array<{
    pattern: string
    weight: number
  }>
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'legal',
    terms: [
      { pattern: 'lawyer', weight: 3 },
      { pattern: 'attorney', weight: 3 },
      { pattern: 'lawsuit', weight: 3 },
      { pattern: 'accident', weight: 2 },
      { pattern: 'injury', weight: 2 },
      { pattern: 'debt', weight: 2 },
      { pattern: 'legal', weight: 2 },
    ],
  },
  {
    category: 'real_estate',
    terms: [
      { pattern: 'mortgage', weight: 3 },
      { pattern: 'housing', weight: 2 },
      { pattern: 'apartment', weight: 2 },
      { pattern: 'real estate', weight: 3 },
      { pattern: 'rent', weight: 2 },
    ],
  },
  {
    category: 'finance',
    terms: [
      { pattern: 'stock', weight: 2 },
      { pattern: 'shares', weight: 2 },
      { pattern: 'market', weight: 1 },
      { pattern: 'oil prices', weight: 3 },
      { pattern: 'crypto', weight: 3 },
      { pattern: 'interest rates', weight: 3 },
    ],
  },
  {
    category: 'logistics',
    terms: [
      { pattern: 'freight', weight: 3 },
      { pattern: 'diesel', weight: 2 },
      { pattern: 'shipping', weight: 3 },
      { pattern: 'cargo', weight: 2 },
      { pattern: 'supply chain', weight: 3 },
    ],
  },
  {
    category: 'commerce',
    terms: [
      { pattern: 'product recall', weight: 3 },
      { pattern: 'sales', weight: 2 },
      { pattern: 'discount', weight: 2 },
      { pattern: 'ecommerce', weight: 3 },
      { pattern: 'amazon', weight: 2 },
    ],
  },
  {
    category: 'ai',
    terms: [
      { pattern: ' ai ', weight: 2 },
      { pattern: 'llm', weight: 3 },
      { pattern: 'openai', weight: 3 },
      { pattern: 'claude', weight: 2 },
      { pattern: 'chatbot', weight: 2 },
    ],
  },
  {
    category: 'agro',
    terms: [
      { pattern: 'cattle', weight: 3 },
      { pattern: 'grain', weight: 2 },
      { pattern: 'soy', weight: 2 },
      { pattern: 'weather agriculture', weight: 3 },
    ],
  },
  {
    category: 'noise',
    terms: [
      { pattern: 'celebrity', weight: 3 },
      { pattern: 'sports', weight: 2 },
      { pattern: 'entertainment', weight: 2 },
      { pattern: 'meme', weight: 3 },
    ],
  },
]

function normalizeKeyword(keyword: string) {
  return ` ${keyword.trim().toLowerCase().replace(/\s+/g, ' ')} `
}

function scoreCategory(normalizedKeyword: string, rule: CategoryRule) {
  return rule.terms.reduce((score, term) => (
    normalizedKeyword.includes(term.pattern)
      ? score + term.weight
      : score
  ), 0)
}

export function classifyMarketCategory(keyword: string): MarketCategory {
  const normalizedKeyword = normalizeKeyword(keyword)
  if (normalizedKeyword.trim().length === 0) {
    return 'general'
  }

  let bestCategory: MarketCategory = 'general'
  let bestScore = 0

  for (const rule of CATEGORY_RULES) {
    const score = scoreCategory(normalizedKeyword, rule)
    if (score > bestScore) {
      bestCategory = rule.category
      bestScore = score
    }
  }

  return bestScore > 0 ? bestCategory : 'general'
}
