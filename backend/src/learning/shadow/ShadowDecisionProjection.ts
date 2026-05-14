import { createHash } from 'node:crypto'

export type ShadowProjectionType = 'opportunity_ranking' | 'proposal_confidence' | 'entity_priority'

export type ShadowDecisionProjection = Readonly<{
  projectionId: string
  marketSignalId: string
  entityId: string
  baseScore: number
  adaptiveScore: number
  scoreDelta: number
  adaptiveMultiplier: number
  projectionType: ShadowProjectionType
  generatedAt: string
}>

export type CreateShadowDecisionProjectionInput = Omit<ShadowDecisionProjection, 'projectionId' | 'scoreDelta'> & {
  projectionId?: string
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
    throw new Error(`Shadow decision projection requires ${label}.`)
  }

  return normalized
}

function normalizeNumeric(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Shadow decision projection requires finite ${label}.`)
  }

  return value
}

function normalizeGeneratedAt(value: string) {
  const normalized = normalizeRequired(value, 'generatedAt')
  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Shadow decision projection requires generatedAt as a valid ISO timestamp.')
  }

  return parsed.toISOString()
}

export function buildShadowDecisionProjectionId(input: Omit<ShadowDecisionProjection, 'projectionId'>) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeRequired(input.marketSignalId, 'marketSignalId'),
      normalizeRequired(input.entityId, 'entityId'),
      normalizeNumeric(input.baseScore, 'baseScore').toString(),
      normalizeNumeric(input.adaptiveScore, 'adaptiveScore').toString(),
      normalizeNumeric(input.scoreDelta, 'scoreDelta').toString(),
      normalizeNumeric(input.adaptiveMultiplier, 'adaptiveMultiplier').toString(),
      input.projectionType,
      normalizeGeneratedAt(input.generatedAt),
    ].join(':'))
    .digest('hex')

  return [
    'shadow-projection',
    normalizeIdentifierPart(input.projectionType).slice(0, 32),
    fingerprint.slice(0, 24),
  ].join(':').slice(0, 128)
}

export function createShadowDecisionProjection(input: CreateShadowDecisionProjectionInput): ShadowDecisionProjection {
  const generatedAt = normalizeGeneratedAt(input.generatedAt)
  const baseScore = normalizeNumeric(input.baseScore, 'baseScore')
  const adaptiveScore = normalizeNumeric(input.adaptiveScore, 'adaptiveScore')
  const adaptiveMultiplier = normalizeNumeric(input.adaptiveMultiplier, 'adaptiveMultiplier')
  const scoreDelta = adaptiveScore - baseScore

  const recordWithoutId: Omit<ShadowDecisionProjection, 'projectionId'> = {
    marketSignalId: normalizeRequired(input.marketSignalId, 'marketSignalId'),
    entityId: normalizeRequired(input.entityId, 'entityId'),
    baseScore,
    adaptiveScore,
    scoreDelta,
    adaptiveMultiplier,
    projectionType: input.projectionType,
    generatedAt,
  }

  return Object.freeze({
    projectionId: input.projectionId ?? buildShadowDecisionProjectionId(recordWithoutId),
    ...recordWithoutId,
  })
}

export function toShadowProjectionPersistence(record: ShadowDecisionProjection) {
  return {
    projection_id: record.projectionId,
    market_signal_id: record.marketSignalId,
    entity_id: record.entityId,
    base_score: record.baseScore,
    adaptive_score: record.adaptiveScore,
    score_delta: record.scoreDelta,
    adaptive_multiplier: record.adaptiveMultiplier,
    projection_type: record.projectionType,
    generated_at: record.generatedAt,
  }
}

export const SHADOW_DECISION_PROJECTION_MODE = 'advisory-only' as const
