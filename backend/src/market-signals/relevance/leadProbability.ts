export type LeadProbability = 'low' | 'medium' | 'high'

const HIGH_PATTERNS = [
  'lawyer',
  'attorney',
  'accident lawyer',
  'debt relief',
  'mortgage',
  'freight quote',
  'cargo shipping',
] as const

const MEDIUM_PATTERNS = [
  'oil prices',
  'stock',
  'insurance',
  'logistics',
] as const

const LOW_PATTERNS = [
  'celebrity',
  'sports',
  'entertainment',
] as const

function normalizeKeyword(keyword: string) {
  return ` ${keyword.trim().toLowerCase().replace(/\s+/g, ' ')} `
}

function matchesAny(normalizedKeyword: string, patterns: readonly string[]) {
  return patterns.some((pattern) => normalizedKeyword.includes(pattern))
}

export function calculateLeadProbability(keyword: string): LeadProbability {
  const normalizedKeyword = normalizeKeyword(keyword)

  if (matchesAny(normalizedKeyword, HIGH_PATTERNS)) {
    return 'high'
  }

  if (matchesAny(normalizedKeyword, LOW_PATTERNS)) {
    return 'low'
  }

  if (matchesAny(normalizedKeyword, MEDIUM_PATTERNS)) {
    return 'medium'
  }

  return 'low'
}
