import type { BrandSoulMemoryAttributeValue } from '../contracts/BrandSoulMemory'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { normalizeBrandSoulMemoryCandidate } from './normalizeBrandSoulMemoryCandidate'

export type BrandSoulDerivedPreferenceKind = 'most-consulted-product' | 'dominant-interaction' | 'preferred-category'

export type BrandSoulDerivedPreference = {
  kind: BrandSoulDerivedPreferenceKind
  value: string
  score: number
  confidence: number
}

export type BrandSoulDerivedPreferencesResult = {
  preferences: BrandSoulDerivedPreference[]
}

type WeightedPreferenceEvidence = {
  label: string
  score: number
  count: number
}

type ClearPreferenceThresholds = {
  minCount?: number
  minScore?: number
  minDominantRatio?: number
  minDominanceGap?: number
}

const PREFERENCE_DECAY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30
const MIN_EFFECTIVE_PREFERENCE_WEIGHT = 0.2
const MIN_CLEAR_PREFERENCE_COUNT = 2
const MIN_CLEAR_PREFERENCE_SCORE = 0.7
const MIN_DOMINANT_RATIO = 0.6
const MIN_INTERACTION_PREFERENCE_SCORE = 1

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveRecencyDecay(createdAt: string, referenceTimeMs: number) {
  const createdAtMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdAtMs)) {
    return 0
  }

  const ageMs = Math.max(0, referenceTimeMs - createdAtMs)
  return clamp(1 - ageMs / PREFERENCE_DECAY_WINDOW_MS)
}

function resolveEffectiveWeight(relevanceScore: number, createdAt: string, referenceTimeMs: number) {
  return clamp(relevanceScore * resolveRecencyDecay(createdAt, referenceTimeMs))
}

function asString(value: BrandSoulMemoryAttributeValue | undefined): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined
  }

  return undefined
}

function asObject(value: BrandSoulMemoryAttributeValue | undefined): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return undefined
}

function resolveObservedObjectCategory(attributes: Record<string, BrandSoulMemoryAttributeValue>) {
  const observedValue = asObject(attributes.observedValue)
  const category = observedValue?.category
  return typeof category === 'string' && category.trim().length > 0 ? category.trim() : undefined
}

function resolveObservedObjectName(attributes: Record<string, BrandSoulMemoryAttributeValue>) {
  const observedValue = asObject(attributes.observedValue)
  const name = observedValue?.name
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : undefined
}

function accumulateEvidence(
  evidenceMap: Map<string, WeightedPreferenceEvidence>,
  label: string | undefined,
  weight: number,
) {
  if (!label || weight < MIN_EFFECTIVE_PREFERENCE_WEIGHT) {
    return
  }

  const normalizedLabel = label.trim()
  if (!normalizedLabel) {
    return
  }

  const existing = evidenceMap.get(normalizedLabel)
  if (existing) {
    existing.score += weight
    existing.count += 1
    return
  }

  evidenceMap.set(normalizedLabel, {
    label: normalizedLabel,
    score: weight,
    count: 1,
  })
}

function selectClearPreference(evidenceMap: Map<string, WeightedPreferenceEvidence>, thresholds: ClearPreferenceThresholds = {}) {
  const candidates = Array.from(evidenceMap.values()).sort((left, right) => right.score - left.score)
  const strongest = candidates[0]
  if (!strongest) {
    return undefined
  }

  const totalScore = candidates.reduce((sum, candidate) => sum + candidate.score, 0)
  const dominantRatio = totalScore > 0 ? strongest.score / totalScore : 0
  const secondStrongest = candidates[1]
  const dominanceGap = secondStrongest ? strongest.score - secondStrongest.score : strongest.score
  const minCount = thresholds.minCount ?? MIN_CLEAR_PREFERENCE_COUNT
  const minScore = thresholds.minScore ?? MIN_CLEAR_PREFERENCE_SCORE
  const minDominantRatio = thresholds.minDominantRatio ?? MIN_DOMINANT_RATIO
  const minDominanceGap = thresholds.minDominanceGap ?? 0.08

  if (
    strongest.count < minCount ||
    strongest.score < minScore ||
    dominantRatio < minDominantRatio ||
    dominanceGap < minDominanceGap
  ) {
    return undefined
  }

  return {
    value: strongest.label,
    score: clamp(strongest.score),
    confidence: clamp(dominantRatio * 0.75 + Math.min(strongest.count, 4) * 0.08),
  }
}

export function deriveBrandSoulPreferences(memory: BrandSoulMemorySnapshot[]): BrandSoulDerivedPreferencesResult {
  if (memory.length === 0) {
    return { preferences: [] }
  }

  const referenceTimeMs = Date.now()
  const productEvidence = new Map<string, WeightedPreferenceEvidence>()
  const interactionEvidence = new Map<string, WeightedPreferenceEvidence>()
  const categoryEvidence = new Map<string, WeightedPreferenceEvidence>()

  for (const snapshot of memory) {
    const normalizedMemory = normalizeBrandSoulMemoryCandidate(snapshot, 'system')
    const { subject, signal, attributes } = normalizedMemory.content
    const weight = resolveEffectiveWeight(normalizedMemory.relevanceScore, normalizedMemory.createdAt, referenceTimeMs)

    if (signal === 'product-interest' || subject === 'customer-interest') {
      accumulateEvidence(
        productEvidence,
        resolveObservedObjectName(attributes) ?? asString(attributes.productLabel),
        weight,
      )

      accumulateEvidence(
        categoryEvidence,
        asString(attributes.category) ?? resolveObservedObjectCategory(attributes),
        weight,
      )
    }

    if (signal === 'support-topic' || subject === 'support-context') {
      accumulateEvidence(interactionEvidence, 'support', weight)
    }

    if (
      signal === 'product-interest' ||
      signal === 'identity-inference' ||
      signal === 'active-promotion' ||
      subject === 'customer-interest' ||
      subject === 'identity-profile' ||
      subject === 'promotion-context'
    ) {
      accumulateEvidence(interactionEvidence, 'explore', weight)
    }
  }

  const preferences: BrandSoulDerivedPreference[] = []
  const strongestProduct = selectClearPreference(productEvidence)
  if (strongestProduct) {
    preferences.push({
      kind: 'most-consulted-product',
      value: strongestProduct.value,
      score: strongestProduct.score,
      confidence: strongestProduct.confidence,
    })
  }

  const dominantInteraction = selectClearPreference(interactionEvidence, {
    minScore: MIN_INTERACTION_PREFERENCE_SCORE,
  })
  if (dominantInteraction) {
    preferences.push({
      kind: 'dominant-interaction',
      value: dominantInteraction.value,
      score: dominantInteraction.score,
      confidence: dominantInteraction.confidence,
    })
  }

  const preferredCategory = selectClearPreference(categoryEvidence)
  if (preferredCategory) {
    preferences.push({
      kind: 'preferred-category',
      value: preferredCategory.value,
      score: preferredCategory.score,
      confidence: preferredCategory.confidence,
    })
  }

  return {
    preferences,
  }
}