import type { BrandSoulDetectedIntent } from '../contracts/BrandSoulDecision'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import { normalizeBrandSoulMemoryCandidate } from './normalizeBrandSoulMemoryCandidate'

type TrendIntent = Extract<BrandSoulDetectedIntent, 'promotion' | 'product-discovery' | 'purchase' | 'policy' | 'support'>

export type BrandSoulMemoryInfluenceTrendSignal = {
  memoryId: string
  subject: string
  signal: string
  weight: number
  relevanceScore: number
  createdAt: string
}

export type BrandSoulDominantIntentTrend = {
  intent: TrendIntent
  score: number
}

export type BrandSoulMemoryInfluenceTrend = {
  dominantIntentTrend: BrandSoulDominantIntentTrend | null
  preferenceSignals: BrandSoulMemoryInfluenceTrendSignal[]
  supportBias: number
  explorationBias: number
}

const TREND_DECAY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30
const MIN_EFFECTIVE_MEMORY_WEIGHT = 0.2
const MIN_DOMINANT_TREND_SCORE = 0.28

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function resolveRecencyDecay(createdAt: string, referenceTimeMs: number) {
  const createdAtMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdAtMs)) {
    return 0
  }

  const ageMs = Math.max(0, referenceTimeMs - createdAtMs)
  return clamp(1 - ageMs / TREND_DECAY_WINDOW_MS)
}

function resolveEffectiveWeight(relevanceScore: number, createdAt: string, referenceTimeMs: number) {
  return clamp(relevanceScore * resolveRecencyDecay(createdAt, referenceTimeMs))
}

function resolveTrendIntent(subject: string, signal: string): TrendIntent | undefined {
  if (subject === 'support-context' || signal === 'support-topic') {
    return 'support'
  }

  if (subject === 'promotion-context' || signal === 'active-promotion') {
    return 'promotion'
  }

  if (subject === 'customer-interest' || signal === 'product-interest' || subject === 'identity-profile' || signal === 'identity-inference') {
    return 'product-discovery'
  }

  return undefined
}

function isPreferenceSignal(subject: string, signal: string) {
  return subject === 'customer-interest' || subject === 'identity-profile' || signal === 'product-interest' || signal === 'identity-inference'
}

function contributesToSupportBias(subject: string, signal: string) {
  return subject === 'support-context' || signal === 'support-topic'
}

function contributesToExplorationBias(subject: string, signal: string) {
  return (
    subject === 'customer-interest' ||
    subject === 'identity-profile' ||
    subject === 'promotion-context' ||
    signal === 'product-interest' ||
    signal === 'identity-inference' ||
    signal === 'active-promotion'
  )
}

export function computeMemoryInfluenceTrend(memory: BrandSoulMemorySnapshot[]): BrandSoulMemoryInfluenceTrend {
  if (memory.length === 0) {
    return {
      dominantIntentTrend: null,
      preferenceSignals: [],
      supportBias: 0,
      explorationBias: 0,
    }
  }

  const referenceTimeMs = Date.now()
  const intentScores = new Map<TrendIntent, number>()
  const preferenceSignals: BrandSoulMemoryInfluenceTrendSignal[] = []
  let supportBias = 0
  let explorationBias = 0

  for (const snapshot of memory) {
    const normalizedMemory = normalizeBrandSoulMemoryCandidate(snapshot, 'system')
    const { subject, signal } = normalizedMemory.content
    const weight = resolveEffectiveWeight(normalizedMemory.relevanceScore, normalizedMemory.createdAt, referenceTimeMs)

    if (weight < MIN_EFFECTIVE_MEMORY_WEIGHT) {
      continue
    }

    const trendIntent = resolveTrendIntent(subject, signal)
    if (trendIntent) {
      intentScores.set(trendIntent, (intentScores.get(trendIntent) ?? 0) + weight)
    }

    if (isPreferenceSignal(subject, signal)) {
      preferenceSignals.push({
        memoryId: normalizedMemory.id,
        subject,
        signal,
        weight,
        relevanceScore: normalizedMemory.relevanceScore,
        createdAt: normalizedMemory.createdAt,
      })
    }

    if (contributesToSupportBias(subject, signal)) {
      supportBias += weight
    }

    if (contributesToExplorationBias(subject, signal)) {
      explorationBias += weight
    }
  }

  const dominantIntentTrend = Array.from(intentScores.entries())
    .sort((left, right) => right[1] - left[1])[0]

  return {
    dominantIntentTrend:
      dominantIntentTrend && dominantIntentTrend[1] >= MIN_DOMINANT_TREND_SCORE
        ? {
            intent: dominantIntentTrend[0],
            score: clamp(dominantIntentTrend[1]),
          }
        : null,
    preferenceSignals: preferenceSignals.sort((left, right) => right.weight - left.weight),
    supportBias: clamp(supportBias),
    explorationBias: clamp(explorationBias),
  }
}