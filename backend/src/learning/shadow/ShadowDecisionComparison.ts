import { createHash } from 'node:crypto'

export type ShadowDecisionDivergenceType =
  | 'score_delta_shift'
  | 'ranking_shift'
  | 'threshold_crossed'
  | 'no_divergence'

export type ShadowDecisionComparison = Readonly<{
  comparisonId: string
  marketSignalId: string
  liveDecision: string
  shadowDecision: string
  divergenceType: ShadowDecisionDivergenceType
  divergenceScore: number
  estimatedEconomicDelta: number
  generatedAt: string
}>

export type CreateShadowDecisionComparisonInput = Omit<ShadowDecisionComparison, 'comparisonId'> & {
  comparisonId?: string
}

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`Shadow decision comparison requires ${label}.`)
  }

  return normalized
}

function normalizeNumeric(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Shadow decision comparison requires finite ${label}.`)
  }

  return value
}

function normalizeGeneratedAt(value: string) {
  const normalized = normalizeRequired(value, 'generatedAt')
  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Shadow decision comparison requires generatedAt as a valid ISO timestamp.')
  }

  return parsed.toISOString()
}

export function buildShadowDecisionComparisonId(input: Omit<ShadowDecisionComparison, 'comparisonId'>) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeRequired(input.marketSignalId, 'marketSignalId'),
      normalizeRequired(input.liveDecision, 'liveDecision'),
      normalizeRequired(input.shadowDecision, 'shadowDecision'),
      input.divergenceType,
      normalizeNumeric(input.divergenceScore, 'divergenceScore').toString(),
      normalizeNumeric(input.estimatedEconomicDelta, 'estimatedEconomicDelta').toString(),
      normalizeGeneratedAt(input.generatedAt),
    ].join(':'))
    .digest('hex')

  return [
    'shadow-comparison',
    normalizeIdentifierPart(input.divergenceType).slice(0, 32),
    fingerprint.slice(0, 24),
  ].join(':').slice(0, 128)
}

export function createShadowDecisionComparison(
  input: CreateShadowDecisionComparisonInput,
): ShadowDecisionComparison {
  const recordWithoutId: Omit<ShadowDecisionComparison, 'comparisonId'> = {
    marketSignalId: normalizeRequired(input.marketSignalId, 'marketSignalId'),
    liveDecision: normalizeRequired(input.liveDecision, 'liveDecision'),
    shadowDecision: normalizeRequired(input.shadowDecision, 'shadowDecision'),
    divergenceType: input.divergenceType,
    divergenceScore: normalizeNumeric(input.divergenceScore, 'divergenceScore'),
    estimatedEconomicDelta: normalizeNumeric(input.estimatedEconomicDelta, 'estimatedEconomicDelta'),
    generatedAt: normalizeGeneratedAt(input.generatedAt),
  }

  return Object.freeze({
    comparisonId: input.comparisonId ?? buildShadowDecisionComparisonId(recordWithoutId),
    ...recordWithoutId,
  })
}

export function toShadowComparisonPersistence(record: ShadowDecisionComparison) {
  return {
    comparison_id: record.comparisonId,
    market_signal_id: record.marketSignalId,
    live_decision: record.liveDecision,
    shadow_decision: record.shadowDecision,
    divergence_type: record.divergenceType,
    divergence_score: record.divergenceScore,
    estimated_economic_delta: record.estimatedEconomicDelta,
    generated_at: record.generatedAt,
  }
}

export const SHADOW_DECISION_COMPARISON_MODE = 'advisory-only' as const
