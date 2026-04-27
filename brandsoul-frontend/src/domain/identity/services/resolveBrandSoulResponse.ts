import type { BrandSoulCommerceProduct, BrandSoulPolicy, BrandSoulPromotion } from '../contracts/BrandSoulCommerceContext'
import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type {
  BrandSoulActionType,
  BrandSoulDecision,
  BrandSoulDetectedIntent,
  BrandSoulMemoryInfluence,
  BrandSoulMemoryInfluenceSignalCategory,
  BrandSoulResponsePlan,
} from '../contracts/BrandSoulDecision'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import type { BrandSoulState } from '../contracts/BrandSoulState'
import type { BrandSoulMemoryPersistenceOrchestrationContext, BrandSoulMemoryPersistenceOrchestrationResult } from '../persistence/orchestrateBrandSoulMemoryPersistence'
import type { BrandSoulMemoryWriter } from '../persistence/BrandSoulMemoryWriter'
import { orchestrateBrandSoulMemoryPersistence } from '../persistence/orchestrateBrandSoulMemoryPersistence'
import { applyBrandSoulMemoryPolicy, type ApplyBrandSoulMemoryPolicyResult } from './applyBrandSoulMemoryPolicy'
import type { BrandSoulMemoryDispatchOptions } from '../persistence/dispatchBrandSoulMemoryPersistence'
import { extractRelevantMemorySignals, type ExtractRelevantMemorySignalsResult } from './extractRelevantMemorySignals'
import { computeMemoryInfluenceTrend, type BrandSoulMemoryInfluenceTrend } from './computeMemoryInfluenceTrend'
import {
  deriveBrandSoulPreferences,
  type BrandSoulDerivedPreference,
  type BrandSoulDerivedPreferencesResult,
} from './deriveBrandSoulPreferences'
import { validateIdentityDrift } from './validateIdentityDrift'

export type BrandSoulResponse = {
  responseText: string
  detectedIntent: BrandSoulDetectedIntent
  actionType: BrandSoulActionType
  stateUpdate: Partial<BrandSoulState>
  memoryToStore: BrandSoulMemorySnapshot[]
}

export type BrandSoulResponseWithMemoryPersistence = BrandSoulResponse & {
  memoryPersistence: BrandSoulMemoryPersistenceOrchestrationResult
}

type DetectedBrandSoulIntent = {
  intent: BrandSoulDetectedIntent
  suggestedAction: BrandSoulActionType
  confidence: number
}

type GuardrailCheck = {
  blocked: boolean
  matchedGuardrail?: string
}

type ResolvedBrandSoulAction = {
  intent: BrandSoulDetectedIntent
  action: BrandSoulActionType
  blocked: boolean
}

type BrandSoulDecisionFlow = {
  decision: BrandSoulDecision
  memoryPolicyResult: ApplyBrandSoulMemoryPolicyResult
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase()
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

const MAX_TURN_MEMORY_DECISION_INFLUENCE = 0.3
const MAX_PREFERENCE_DECISION_INFLUENCE = 0.1
const MAX_TREND_MEMORY_DECISION_INFLUENCE = 0.2
const MAX_TOTAL_MEMORY_DECISION_INFLUENCE = 0.5
const CRITICAL_INTENT_CONFIDENCE = 0.84
const MIN_MEMORY_PRIORITY_FOR_INTENT_SHIFT = 0.64
const MIN_MEMORY_PRIORITY_FOR_ACTION_REINFORCEMENT = 0.55
const MIN_TREND_BIAS_FOR_INTENT_SHIFT = 0.95
const MIN_TREND_BIAS_FOR_ACTION_REINFORCEMENT = 0.95

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function hasContinuationCue(userMessage: string) {
  const normalizedMessage = normalizeText(userMessage)
  return includesAny(normalizedMessage, ['continua', 'continuar', 'ainda', 'mesmo', 'novo', 'novamente', 'de novo', 'nisso', 'isso'])
}

function hasPreferenceExploreCue(userMessage: string) {
  const normalizedMessage = normalizeText(userMessage)
  return includesAny(normalizedMessage, ['mostra', 'mostrar', 'algo', 'opcao', 'opcoes', 'recomenda', 'sugere', 'quero ver'])
}

function hasPreferenceSupportCue(userMessage: string) {
  const normalizedMessage = normalizeText(userMessage)
  return includesAny(normalizedMessage, ['entender', 'explica', 'explicar', 'melhor', 'orienta', 'orientar', 'clareza'])
}

function selectDerivedPreference(preferences: BrandSoulDerivedPreference[], kind: BrandSoulDerivedPreference['kind']) {
  return preferences.find((preference) => preference.kind === kind)
}

function detectBrandSoulIntent(userMessage: string, context: BrandSoulContext): DetectedBrandSoulIntent {
  const normalizedMessage = normalizeText(userMessage)
  const hasProducts = context.commerce.products.length > 0
  const hasPromotions = context.commerce.promotions.some((promotion) => promotion.active)

  if (includesAny(normalizedMessage, ['hora', 'horario', 'abre', 'fecha', 'funciona', 'atendimento'])) {
    return { intent: 'business-hours', suggestedAction: 'inform', confidence: 0.92 }
  }

  if (hasPromotions && includesAny(normalizedMessage, ['promocao', 'promo', 'desconto', 'oferta', 'cupom'])) {
    return { intent: 'promotion', suggestedAction: 'sell', confidence: 0.94 }
  }

  if (hasProducts && includesAny(normalizedMessage, ['produto', 'produtos', 'item', 'catalogo', 'colecao', 'opcao'])) {
    return { intent: 'product-discovery', suggestedAction: 'guide', confidence: 0.88 }
  }

  if (includesAny(normalizedMessage, ['comprar', 'pedido', 'quero', 'levar', 'fechar', 'assinar'])) {
    return { intent: 'purchase', suggestedAction: 'sell', confidence: 0.9 }
  }

  if (includesAny(normalizedMessage, ['troca', 'devolucao', 'reembolso', 'entrega', 'prazo', 'garantia', 'politica'])) {
    return { intent: 'policy', suggestedAction: 'support', confidence: 0.9 }
  }

  if (includesAny(normalizedMessage, ['ajuda', 'suporte', 'problema', 'erro', 'nao chegou', 'nao funcionou'])) {
    return { intent: 'support', suggestedAction: 'support', confidence: 0.86 }
  }

  if (includesAny(normalizedMessage, ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'])) {
    return { intent: 'greeting', suggestedAction: 'inform', confidence: 0.82 }
  }

  const previousIntent = context.conversation.detectedIntent
  if (previousIntent === 'promotion' || previousIntent === 'product-discovery') {
    return { intent: 'product-discovery', suggestedAction: 'guide', confidence: 0.68 }
  }

  return {
    intent: 'general',
    suggestedAction: context.state.interactionMode === 'sale' ? 'sell' : 'inform',
    confidence: 0.46,
  }
}

function selectStrongestSignal(signals: ExtractRelevantMemorySignalsResult['repeatedIntentSignals' | 'strongPreferenceSignals' | 'recentContextSignals']) {
  return [...signals].sort((left, right) => right.priorityScore - left.priorityScore)[0]
}

function isCriticalIntent(detectedIntent: DetectedBrandSoulIntent) {
  return detectedIntent.intent === 'guardrail-blocked' || detectedIntent.confidence >= CRITICAL_INTENT_CONFIDENCE
}

function resolveMemoryInfluenceBudget(args: {
  detectedIntent: DetectedBrandSoulIntent
  strongestSignalPriority: number
}) {
  const { detectedIntent, strongestSignalPriority } = args
  if (strongestSignalPriority <= 0) {
    return 0
  }

  if (isCriticalIntent(detectedIntent)) {
    return clamp((1 - detectedIntent.confidence) * strongestSignalPriority, 0, MAX_TURN_MEMORY_DECISION_INFLUENCE * 0.4)
  }

  return clamp((1 - detectedIntent.confidence) * strongestSignalPriority, 0, MAX_TURN_MEMORY_DECISION_INFLUENCE)
}

function resolveTrendInfluenceBudget(args: {
  detectedIntent: DetectedBrandSoulIntent
  memoryTrend: BrandSoulMemoryInfluenceTrend
  usedInfluence: number
}) {
  const { detectedIntent, memoryTrend, usedInfluence } = args
  const strongestTrendScore = Math.max(
    memoryTrend.dominantIntentTrend?.score ?? 0,
    memoryTrend.supportBias,
    memoryTrend.explorationBias,
    memoryTrend.preferenceSignals[0]?.weight ?? 0,
  )

  if (strongestTrendScore <= 0) {
    return 0
  }

  const remainingInfluenceBudget = clamp(MAX_TOTAL_MEMORY_DECISION_INFLUENCE - usedInfluence, 0, MAX_TREND_MEMORY_DECISION_INFLUENCE)
  if (remainingInfluenceBudget <= 0) {
    return 0
  }

  const baseBudget = clamp((1 - detectedIntent.confidence) * strongestTrendScore, 0, MAX_TREND_MEMORY_DECISION_INFLUENCE)
  if (isCriticalIntent(detectedIntent)) {
    return clamp(Math.min(baseBudget * 0.4, remainingInfluenceBudget), 0, MAX_TREND_MEMORY_DECISION_INFLUENCE)
  }

  return clamp(Math.min(baseBudget, remainingInfluenceBudget), 0, MAX_TREND_MEMORY_DECISION_INFLUENCE)
}

function resolvePreferenceInfluenceBudget(args: {
  detectedIntent: DetectedBrandSoulIntent
  derivedPreferences: BrandSoulDerivedPreferencesResult
  usedInfluence: number
}) {
  const { detectedIntent, derivedPreferences, usedInfluence } = args
  const strongestPreferenceStrength = derivedPreferences.preferences.reduce(
    (maxStrength, preference) => Math.max(maxStrength, preference.score * preference.confidence),
    0,
  )

  if (strongestPreferenceStrength <= 0) {
    return 0
  }

  const remainingInfluenceBudget = clamp(MAX_TOTAL_MEMORY_DECISION_INFLUENCE - usedInfluence, 0, MAX_PREFERENCE_DECISION_INFLUENCE)
  if (remainingInfluenceBudget <= 0) {
    return 0
  }

  const baseBudget = clamp((1 - detectedIntent.confidence) * strongestPreferenceStrength, 0, MAX_PREFERENCE_DECISION_INFLUENCE)
  if (isCriticalIntent(detectedIntent)) {
    return clamp(Math.min(baseBudget * 0.4, remainingInfluenceBudget), 0, MAX_PREFERENCE_DECISION_INFLUENCE)
  }

  return clamp(Math.min(baseBudget, remainingInfluenceBudget), 0, MAX_PREFERENCE_DECISION_INFLUENCE)
}

function applyMemoryConfidenceBoost(confidence: number, influenceBudget: number, share: number) {
  if (influenceBudget <= 0 || share <= 0) {
    return confidence
  }

  return clamp(confidence + Math.min(influenceBudget, influenceBudget * share))
}

function collectAppliedMemoryInfluenceSignals(memorySignals: ExtractRelevantMemorySignalsResult) {
  const selectedSignals: Array<{
    category: BrandSoulMemoryInfluenceSignalCategory
    signal: ExtractRelevantMemorySignalsResult['repeatedIntentSignals' | 'strongPreferenceSignals' | 'recentContextSignals'][number]
  }> = []

  const repeatedIntentSignal = selectStrongestSignal(memorySignals.repeatedIntentSignals)
  if (repeatedIntentSignal) {
    selectedSignals.push({
      category: 'repeated-intent',
      signal: repeatedIntentSignal,
    })
  }

  const strongPreferenceSignal = selectStrongestSignal(memorySignals.strongPreferenceSignals)
  if (strongPreferenceSignal) {
    selectedSignals.push({
      category: 'strong-preference',
      signal: strongPreferenceSignal,
    })
  }

  const recentContextSignal = selectStrongestSignal(memorySignals.recentContextSignals)
  if (recentContextSignal) {
    selectedSignals.push({
      category: 'recent-context',
      signal: recentContextSignal,
    })
  }

  return selectedSignals.map(({ category, signal }) => ({
    category,
    memoryId: signal.memoryId,
    subject: signal.subject,
    signal: signal.signal,
    matchedTerms: [...signal.matchedTerms],
    priorityScore: signal.priorityScore,
  }))
}

function collectAppliedTrendInfluenceSignals(memoryTrend: BrandSoulMemoryInfluenceTrend) {
  if (memoryTrend.dominantIntentTrend) {
    return [
      {
        category: 'persistent-trend' as const,
        memoryId: `trend:intent:${memoryTrend.dominantIntentTrend.intent}`,
        subject: 'session-trend',
        signal: memoryTrend.dominantIntentTrend.intent,
        matchedTerms: [],
        priorityScore: memoryTrend.dominantIntentTrend.score,
      },
    ]
  }

  if (memoryTrend.supportBias > 0 || memoryTrend.explorationBias > 0) {
    const dominantBias = memoryTrend.supportBias >= memoryTrend.explorationBias ? 'support-bias' : 'exploration-bias'
    const dominantBiasScore = dominantBias === 'support-bias' ? memoryTrend.supportBias : memoryTrend.explorationBias

    return [
      {
        category: 'persistent-trend' as const,
        memoryId: `trend:bias:${dominantBias}`,
        subject: 'session-trend',
        signal: dominantBias,
        matchedTerms: [],
        priorityScore: dominantBiasScore,
      },
    ]
  }

  return []
}

function collectAppliedPreferenceInfluenceSignals(derivedPreferences: BrandSoulDerivedPreferencesResult) {
  return derivedPreferences.preferences.map((preference) => ({
    category: 'derived-preference' as const,
    memoryId: `preference:${preference.kind}:${normalizeText(preference.value).replace(/\s+/g, '-')}`,
    subject: 'derived-preference',
    signal: preference.kind,
    matchedTerms: [preference.value],
    priorityScore: clamp(preference.score * preference.confidence),
  }))
}

function resolveInfluenceStrength(args: {
  confidenceDelta: number
  intentChanged: boolean
  actionChanged: boolean
  strongestSignalPriority: number
  maxInfluence: number
}) {
  const { confidenceDelta, intentChanged, actionChanged, strongestSignalPriority, maxInfluence } = args

  return clamp(
    Math.abs(confidenceDelta) + (intentChanged ? 0.12 : 0) + (actionChanged ? 0.08 : 0) + strongestSignalPriority * 0.04,
    0,
    maxInfluence,
  )
}

function resolveMemoryInfluence(args: {
  baselineActionResolution: ResolvedBrandSoulAction
  turnActionResolution: ResolvedBrandSoulAction
  preferenceActionResolution: ResolvedBrandSoulAction
  biasedActionResolution: ResolvedBrandSoulAction
  baselineConfidence: number
  turnConfidence: number
  preferenceConfidence: number
  biasedConfidence: number
  memorySignals: ExtractRelevantMemorySignalsResult
  derivedPreferences: BrandSoulDerivedPreferencesResult
  memoryTrend: BrandSoulMemoryInfluenceTrend
}): BrandSoulMemoryInfluence {
  const {
    baselineActionResolution,
    turnActionResolution,
    preferenceActionResolution,
    biasedActionResolution,
    baselineConfidence,
    turnConfidence,
    preferenceConfidence,
    biasedConfidence,
    memorySignals,
    derivedPreferences,
    memoryTrend,
  } = args
  const turnSignalsUsed = collectAppliedMemoryInfluenceSignals(memorySignals)
  const turnIntentChanged = baselineActionResolution.intent !== turnActionResolution.intent
  const turnActionChanged = baselineActionResolution.action !== turnActionResolution.action
  const turnConfidenceDelta = clamp(turnConfidence - baselineConfidence, -1, 1)
  const turnApplied = turnIntentChanged || turnActionChanged || Math.abs(turnConfidenceDelta) > 0.0001
  const preferenceIntentChanged = turnActionResolution.intent !== preferenceActionResolution.intent
  const preferenceActionChanged = turnActionResolution.action !== preferenceActionResolution.action
  const preferenceConfidenceDelta = clamp(preferenceConfidence - turnConfidence, -1, 1)
  const preferenceApplied = preferenceIntentChanged || preferenceActionChanged || Math.abs(preferenceConfidenceDelta) > 0.0001
  const trendIntentChanged = preferenceActionResolution.intent !== biasedActionResolution.intent
  const trendActionChanged = preferenceActionResolution.action !== biasedActionResolution.action
  const trendConfidenceDelta = clamp(biasedConfidence - preferenceConfidence, -1, 1)
  const trendApplied = trendIntentChanged || trendActionChanged || Math.abs(trendConfidenceDelta) > 0.0001
  const signalsUsed = [
    ...(turnApplied ? turnSignalsUsed : []),
    ...(preferenceApplied ? collectAppliedPreferenceInfluenceSignals(derivedPreferences) : []),
    ...(trendApplied ? collectAppliedTrendInfluenceSignals(memoryTrend) : []),
  ]
  const confidenceDelta = clamp(biasedConfidence - baselineConfidence, -1, 1)
  const intentChanged = baselineActionResolution.intent !== biasedActionResolution.intent
  const actionChanged = baselineActionResolution.action !== biasedActionResolution.action
  const applied = intentChanged || actionChanged || Math.abs(confidenceDelta) > 0.0001
  const strongestSignalPriority = signalsUsed.reduce((maxPriority, signal) => Math.max(maxPriority, signal.priorityScore), 0)

  return {
    applied,
    influenceStrength: applied
      ? resolveInfluenceStrength({
          confidenceDelta,
          intentChanged,
          actionChanged,
          strongestSignalPriority,
          maxInfluence: MAX_TOTAL_MEMORY_DECISION_INFLUENCE,
        })
      : 0,
    signalsUsed: applied ? signalsUsed : [],
    impact: {
      confidence: {
        before: baselineConfidence,
        after: biasedConfidence,
        delta: confidenceDelta,
      },
      intent: intentChanged
        ? {
            before: baselineActionResolution.intent,
            after: biasedActionResolution.intent,
          }
        : undefined,
      action: actionChanged
        ? {
            before: baselineActionResolution.action,
            after: biasedActionResolution.action,
          }
        : undefined,
    },
  }
}

function applyMemoryBiasToDetectedIntent(args: {
  context: BrandSoulContext
  userMessage: string
  detectedIntent: DetectedBrandSoulIntent
  memorySignals: ExtractRelevantMemorySignalsResult
}): DetectedBrandSoulIntent {
  const { context, userMessage, detectedIntent, memorySignals } = args
  let nextDetectedIntent: DetectedBrandSoulIntent = { ...detectedIntent }
  const strongestRepeatedIntentSignal = selectStrongestSignal(memorySignals.repeatedIntentSignals)
  const strongestPreferenceSignal = selectStrongestSignal(memorySignals.strongPreferenceSignals)
  const strongestRecentContextSignal = selectStrongestSignal(memorySignals.recentContextSignals)
  const strongestSignalPriority = Math.max(
    strongestRepeatedIntentSignal?.priorityScore ?? 0,
    strongestPreferenceSignal?.priorityScore ?? 0,
    strongestRecentContextSignal?.priorityScore ?? 0,
  )
  const influenceBudget = resolveMemoryInfluenceBudget({
    detectedIntent,
    strongestSignalPriority,
  })
  const canShiftGeneralIntent = nextDetectedIntent.intent === 'general' && !isCriticalIntent(nextDetectedIntent)

  if (
    (strongestRepeatedIntentSignal?.signal === 'support-topic' || strongestRecentContextSignal?.signal === 'support-topic') &&
    canShiftGeneralIntent &&
    influenceBudget >= 0.12 &&
    Math.max(strongestRepeatedIntentSignal?.priorityScore ?? 0, strongestRecentContextSignal?.priorityScore ?? 0) >= MIN_MEMORY_PRIORITY_FOR_INTENT_SHIFT &&
    hasContinuationCue(userMessage)
  ) {
    nextDetectedIntent = {
      intent: 'support',
      suggestedAction: 'support',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, influenceBudget, 0.8),
    }
  }

  if (
    strongestPreferenceSignal &&
    canShiftGeneralIntent &&
    context.commerce.products.length > 0 &&
    strongestPreferenceSignal.priorityScore >= MIN_MEMORY_PRIORITY_FOR_INTENT_SHIFT &&
    influenceBudget >= 0.1 &&
    (strongestPreferenceSignal.subject === 'customer-interest' || strongestPreferenceSignal.subject === 'identity-profile')
  ) {
    nextDetectedIntent = {
      intent: 'product-discovery',
      suggestedAction: 'guide',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, influenceBudget, 0.72),
    }
  }

  if (
    strongestRepeatedIntentSignal?.signal === 'product-interest' &&
    strongestRepeatedIntentSignal.priorityScore >= MIN_MEMORY_PRIORITY_FOR_ACTION_REINFORCEMENT &&
    (nextDetectedIntent.intent === 'product-discovery' || nextDetectedIntent.intent === 'purchase')
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, influenceBudget, 0.24),
    }
  }

  if (
    strongestRepeatedIntentSignal?.signal === 'active-promotion' &&
    strongestRepeatedIntentSignal.priorityScore >= MIN_MEMORY_PRIORITY_FOR_ACTION_REINFORCEMENT &&
    nextDetectedIntent.intent === 'promotion'
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, influenceBudget, 0.2),
    }
  }

  if (
    strongestRecentContextSignal?.signal === 'support-topic' &&
    strongestRecentContextSignal.priorityScore >= MIN_MEMORY_PRIORITY_FOR_ACTION_REINFORCEMENT &&
    nextDetectedIntent.intent === 'policy'
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      suggestedAction: 'support',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, influenceBudget, 0.18),
    }
  }

  return nextDetectedIntent
}

function applyMemoryTrendBiasToDetectedIntent(args: {
  context: BrandSoulContext
  userMessage: string
  detectedIntent: DetectedBrandSoulIntent
  memoryTrend: BrandSoulMemoryInfluenceTrend
  trendInfluenceBudget: number
}): DetectedBrandSoulIntent {
  const { context, userMessage, detectedIntent, memoryTrend, trendInfluenceBudget } = args
  let nextDetectedIntent: DetectedBrandSoulIntent = { ...detectedIntent }
  const canShiftGeneralIntent = nextDetectedIntent.intent === 'general' && !isCriticalIntent(nextDetectedIntent)
  const dominantIntentTrend = memoryTrend.dominantIntentTrend?.intent
  const hasStrongSupportTrend = memoryTrend.supportBias >= MIN_TREND_BIAS_FOR_INTENT_SHIFT
  const hasStrongExplorationTrend = memoryTrend.explorationBias >= MIN_TREND_BIAS_FOR_INTENT_SHIFT

  if (
    canShiftGeneralIntent &&
    trendInfluenceBudget >= 0.08 &&
    dominantIntentTrend === 'support' &&
    hasStrongSupportTrend &&
    hasContinuationCue(userMessage)
  ) {
    nextDetectedIntent = {
      intent: 'support',
      suggestedAction: 'support',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, trendInfluenceBudget, 0.82),
    }
  }

  if (
    canShiftGeneralIntent &&
    trendInfluenceBudget >= 0.08 &&
    context.commerce.products.length > 0 &&
    hasStrongExplorationTrend &&
    (dominantIntentTrend === 'product-discovery' || dominantIntentTrend === 'promotion')
  ) {
    nextDetectedIntent = {
      intent: 'product-discovery',
      suggestedAction: 'guide',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, trendInfluenceBudget, 0.76),
    }
  }

  if (
    nextDetectedIntent.intent === 'policy' &&
    memoryTrend.supportBias >= MIN_TREND_BIAS_FOR_ACTION_REINFORCEMENT &&
    trendInfluenceBudget >= 0.04
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      suggestedAction: 'support',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, trendInfluenceBudget, 0.2),
    }
  }

  if (
    nextDetectedIntent.intent === 'product-discovery' &&
    memoryTrend.explorationBias >= MIN_TREND_BIAS_FOR_ACTION_REINFORCEMENT &&
    trendInfluenceBudget >= 0.04
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      suggestedAction: 'guide',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, trendInfluenceBudget, 0.18),
    }
  }

  if (
    nextDetectedIntent.intent === 'promotion' &&
    memoryTrend.explorationBias >= MIN_TREND_BIAS_FOR_ACTION_REINFORCEMENT &&
    trendInfluenceBudget >= 0.04
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      suggestedAction: 'sell',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, trendInfluenceBudget, 0.18),
    }
  }

  return nextDetectedIntent
}

function applyPreferenceBiasToDetectedIntent(args: {
  context: BrandSoulContext
  userMessage: string
  detectedIntent: DetectedBrandSoulIntent
  derivedPreferences: BrandSoulDerivedPreferencesResult
  preferenceInfluenceBudget: number
}): DetectedBrandSoulIntent {
  const { context, userMessage, detectedIntent, derivedPreferences, preferenceInfluenceBudget } = args
  let nextDetectedIntent: DetectedBrandSoulIntent = { ...detectedIntent }
  const canShiftGeneralIntent = nextDetectedIntent.intent === 'general' && !isCriticalIntent(nextDetectedIntent)
  const productPreference = selectDerivedPreference(derivedPreferences.preferences, 'most-consulted-product')
  const categoryPreference = selectDerivedPreference(derivedPreferences.preferences, 'preferred-category')
  const interactionPreference = selectDerivedPreference(derivedPreferences.preferences, 'dominant-interaction')
  const hasCommercialPreference = Boolean(productPreference || categoryPreference)

  if (
    canShiftGeneralIntent &&
    preferenceInfluenceBudget >= 0.05 &&
    hasCommercialPreference &&
    context.commerce.products.length > 0 &&
    (hasPreferenceExploreCue(userMessage) || interactionPreference?.value === 'explore')
  ) {
    nextDetectedIntent = {
      intent: 'product-discovery',
      suggestedAction: 'guide',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, preferenceInfluenceBudget, 0.7),
    }
  }

  if (
    canShiftGeneralIntent &&
    preferenceInfluenceBudget >= 0.05 &&
    interactionPreference?.value === 'support' &&
    hasPreferenceSupportCue(userMessage)
  ) {
    nextDetectedIntent = {
      intent: 'support',
      suggestedAction: 'support',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, preferenceInfluenceBudget, 0.68),
    }
  }

  if (
    nextDetectedIntent.intent === 'product-discovery' &&
    hasCommercialPreference &&
    preferenceInfluenceBudget >= 0.03
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      suggestedAction: 'guide',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, preferenceInfluenceBudget, 0.18),
    }
  }

  if (
    nextDetectedIntent.intent === 'general' &&
    interactionPreference?.value === 'support' &&
    preferenceInfluenceBudget >= 0.03
  ) {
    nextDetectedIntent = {
      ...nextDetectedIntent,
      suggestedAction: 'inform',
      confidence: applyMemoryConfidenceBoost(nextDetectedIntent.confidence, preferenceInfluenceBudget, 0.12),
    }
  }

  return nextDetectedIntent
}

function checkGuardrails(context: BrandSoulContext, userMessage: string): GuardrailCheck {
  const normalizedMessage = normalizeText(userMessage)

  for (const guardrail of context.identity.guardrails) {
    if (guardrail.severity !== 'hard') {
      continue
    }

    const relevantTerms = normalizeText(`${guardrail.key} ${guardrail.description}`)
      .split(/\s+/)
      .filter((term) => term.length >= 4)

    if (relevantTerms.some((term) => normalizedMessage.includes(term))) {
      return {
        blocked: true,
        matchedGuardrail: guardrail.description,
      }
    }
  }

  return { blocked: false }
}

function resolveTonePrefix(context: BrandSoulContext) {
  const tone = context.identity.tone.primary

  if (tone === 'formal') {
    return 'Posso ajudar com objetividade.'
  }

  if (tone === 'welcoming' || tone === 'warm') {
    return `Estou aqui para te receber bem em ${context.identity.brandName}.`
  }

  if (tone === 'direct') {
    return 'Vou direto ao ponto.'
  }

  if (tone === 'consultative') {
    return 'Vou te orientar com clareza.'
  }

  return `${context.identity.brandName} responde a partir da sua identidade central: ${context.identity.essence}.`
}

function resolveBusinessHoursResponse(context: BrandSoulContext) {
  const nextOpenDay = context.commerce.businessHours.find((entry) => !entry.closed && entry.open && entry.close)

  if (!nextOpenDay) {
    return ['horario comercial nao configurado']
  }

  return [`${nextOpenDay.day} de ${nextOpenDay.open} ate ${nextOpenDay.close}`]
}

function resolvePromotionResponse(promotions: BrandSoulPromotion[]) {
  const activePromotion = promotions.find((promotion) => promotion.active)

  if (!activePromotion) {
    return {
      topic: 'promocao ativa indisponivel',
      requiredData: ['nenhuma promocao ativa confirmada'],
    }
  }

  return {
    topic: activePromotion.title,
    requiredData: [activePromotion.discountLabel ? activePromotion.discountLabel : 'promocao em vigor'],
  }
}

function resolveProductResponse(
  products: BrandSoulCommerceProduct[],
  userMessage: string,
  derivedPreferences?: BrandSoulDerivedPreferencesResult,
) {
  const normalizedMessage = normalizeText(userMessage)
  const preferredProduct = selectDerivedPreference(derivedPreferences?.preferences ?? [], 'most-consulted-product')
  const preferredCategory = selectDerivedPreference(derivedPreferences?.preferences ?? [], 'preferred-category')
  const matchedProduct = products.find((product) => includesAny(normalizedMessage, [normalizeText(product.name)]))
  const preferredProductMatch = preferredProduct
    ? products.find((product) => normalizeText(product.name) === normalizeText(preferredProduct.value))
    : undefined
  const preferredCategoryMatch = preferredCategory
    ? products.find((product) => product.category && normalizeText(product.category) === normalizeText(preferredCategory.value))
    : undefined
  const fallbackProduct = products.find((product) => product.available !== false)
  const product = matchedProduct ?? preferredProductMatch ?? preferredCategoryMatch ?? fallbackProduct

  if (!product) {
    return {
      topic: 'produto indisponivel',
      requiredData: ['nenhum produto claro e disponivel para indicar com seguranca'],
    }
  }

  const requiredData = [
    ...(typeof product.price === 'number' ? [`preco ${product.price.toFixed(2)}`] : []),
    ...(product.description ? [product.description] : []),
  ]

  return {
    topic: product.name,
    requiredData,
  }
}

function resolvePreferredCloseStyle(args: {
  context: BrandSoulContext
  detectedIntent: DetectedBrandSoulIntent
  actionResolution: ResolvedBrandSoulAction
  fallback: BrandSoulResponsePlan['optionalCloseStyle']
  derivedPreferences: BrandSoulDerivedPreferencesResult
}) {
  const { context, detectedIntent, actionResolution, fallback, derivedPreferences } = args
  const productPreference = selectDerivedPreference(derivedPreferences.preferences, 'most-consulted-product')
  const categoryPreference = selectDerivedPreference(derivedPreferences.preferences, 'preferred-category')
  const interactionPreference = selectDerivedPreference(derivedPreferences.preferences, 'dominant-interaction')
  const hasCommercialPreference = Boolean(productPreference || categoryPreference)

  if (interactionPreference?.value === 'support' && (detectedIntent.intent === 'general' || detectedIntent.intent === 'support' || detectedIntent.intent === 'policy')) {
    return detectedIntent.intent === 'general' ? 'contextual-clarity' : 'safe-guidance'
  }

  if (
    hasCommercialPreference &&
    (detectedIntent.intent === 'general' || detectedIntent.intent === 'product-discovery' || detectedIntent.intent === 'purchase' || detectedIntent.intent === 'greeting')
  ) {
    if (actionResolution.action === 'sell' || context.commerce.promotions.some((promotion) => promotion.active)) {
      return 'explore-promotion'
    }

    return 'guide-choice'
  }

  return fallback
}

function resolvePolicyResponse(policies: BrandSoulPolicy[], userMessage: string) {
  const normalizedMessage = normalizeText(userMessage)
  const matchedPolicy = policies.find((policy) => includesAny(normalizedMessage, [normalizeText(policy.key), normalizeText(policy.title)]))
  const policy = matchedPolicy ?? policies[0]

  if (!policy) {
    return {
      topic: 'politica indisponivel',
      requiredData: ['ainda nao existe politica estruturada para responder isso com seguranca'],
    }
  }

  return {
    topic: policy.title,
    requiredData: [policy.description],
  }
}

function resolveBrandSoulAction(
  detectedIntent: DetectedBrandSoulIntent,
  guardrailCheck: GuardrailCheck,
): ResolvedBrandSoulAction {
  if (guardrailCheck.blocked) {
    return {
      intent: 'guardrail-blocked',
      action: 'refuse',
      blocked: true,
    }
  }

  return {
    intent: detectedIntent.intent,
    action: detectedIntent.suggestedAction,
    blocked: false,
  }
}

function buildBrandSoulDecisionPlan(
  context: BrandSoulContext,
  userMessage: string,
  detectedIntent: DetectedBrandSoulIntent,
  actionResolution: ResolvedBrandSoulAction,
  guardrailCheck: GuardrailCheck,
  derivedPreferences: BrandSoulDerivedPreferencesResult,
): BrandSoulResponsePlan {
  if (actionResolution.blocked) {
    return {
      kind: 'guardrail',
      topic: 'limite de identidade ativo',
      intentGoal: 'respect-guardrail-boundary',
      requiredData: [],
      constraints: [guardrailCheck.matchedGuardrail ?? 'manter resposta dentro dos limites seguros'],
      optionalCloseStyle: 'safe-guidance',
    }
  }

  if (detectedIntent.intent === 'business-hours') {
    return {
      kind: 'business-hours',
      topic: 'horario comercial',
      intentGoal: 'inform-operating-window',
      requiredData: resolveBusinessHoursResponse(context),
      optionalCloseStyle: resolvePreferredCloseStyle({
        context,
        detectedIntent,
        actionResolution,
        fallback: 'offer-assistance',
        derivedPreferences,
      }),
    }
  }

  if (detectedIntent.intent === 'promotion') {
    const promotion = resolvePromotionResponse(context.commerce.promotions)
    return {
      kind: 'promotion',
      topic: promotion.topic,
      intentGoal: 'highlight-active-promotion',
      requiredData: promotion.requiredData,
      optionalCloseStyle: resolvePreferredCloseStyle({
        context,
        detectedIntent,
        actionResolution,
        fallback: 'explore-promotion',
        derivedPreferences,
      }),
    }
  }

  if (detectedIntent.intent === 'product-discovery' || detectedIntent.intent === 'purchase') {
    const product = resolveProductResponse(context.commerce.products, userMessage, derivedPreferences)
    return {
      kind: 'product',
      topic: product.topic,
      intentGoal: 'guide-product-selection',
      requiredData: product.requiredData,
      optionalCloseStyle: resolvePreferredCloseStyle({
        context,
        detectedIntent,
        actionResolution,
        fallback: actionResolution.action === 'sell' ? 'explore-promotion' : 'guide-choice',
        derivedPreferences,
      }),
    }
  }

  if (detectedIntent.intent === 'policy' || detectedIntent.intent === 'support') {
    const policy = resolvePolicyResponse(context.commerce.policies, userMessage)
    return {
      kind: 'policy',
      topic: policy.topic,
      intentGoal: 'support-policy-clarity',
      requiredData: policy.requiredData,
      optionalCloseStyle: resolvePreferredCloseStyle({
        context,
        detectedIntent,
        actionResolution,
        fallback: 'safe-guidance',
        derivedPreferences,
      }),
    }
  }

  if (detectedIntent.intent === 'greeting') {
    return {
      kind: 'greeting',
      topic: 'acolhimento inicial',
      intentGoal: 'open-conversation',
      requiredData: ['produtos, horarios, promocoes ou politicas da marca'],
      optionalCloseStyle: resolvePreferredCloseStyle({
        context,
        detectedIntent,
        actionResolution,
        fallback: 'open-dialogue',
        derivedPreferences,
      }),
    }
  }

  return {
    kind: 'general',
    topic: context.state.currentFocus,
    intentGoal: 'continue-contextual-guidance',
    requiredData: [
      `funcao atual ${context.identity.commercialRole}`,
      `estilo relacional ${context.identity.relationalStyle.connectionIntent}`,
    ],
    optionalCloseStyle: resolvePreferredCloseStyle({
      context,
      detectedIntent,
      actionResolution,
      fallback: 'contextual-clarity',
      derivedPreferences,
    }),
  }
}

function renderBrandSoulResponseText(context: BrandSoulContext, decision: BrandSoulDecision) {
  const plan = decision.responsePlan
  const prefix = resolveTonePrefix(context)

  if (plan.kind === 'guardrail') {
    return `${prefix} Nao posso orientar alem do limite definido pela identidade desta centelha. ${plan.constraints?.[0] ?? 'Vou manter a resposta dentro dos limites seguros.'}`
  }

  if (plan.kind === 'greeting') {
    return `${prefix} Posso te orientar sobre ${plan.requiredData[0]}.`
  }

  const supportingCopy = plan.requiredData.join('. ')
  const closeCopy =
    plan.optionalCloseStyle === 'safe-guidance'
      ? ' Vou manter a orientacao em um limite seguro.'
      : plan.optionalCloseStyle === 'offer-assistance'
        ? ' Vou oferecer ajuda sobre produtos, promocoes ou politicas.'
        : plan.optionalCloseStyle === 'explore-promotion'
          ? ' Vou aproximar a conversa da proxima acao.'
          : plan.optionalCloseStyle === 'guide-choice'
            ? ' Vou orientar para a melhor opcao.'
            : plan.optionalCloseStyle === 'open-dialogue'
              ? ' Vou abrir caminho para a conversa.'
              : plan.optionalCloseStyle === 'contextual-clarity'
                ? ' Vou continuar com clareza contextual.'
                : ''

  return `${prefix} ${plan.topic}${supportingCopy ? `: ${supportingCopy}.` : '.'}${closeCopy}`
}

function resolveInteractionMode(actionType: BrandSoulActionType): BrandSoulState['interactionMode'] {
  if (actionType === 'sell') {
    return 'sale'
  }
  if (actionType === 'support') {
    return 'support'
  }
  if (actionType === 'guide') {
    return 'guidance'
  }
  return 'response'
}

function resolveMood(intent: BrandSoulDetectedIntent, actionType: BrandSoulActionType): BrandSoulState['currentMood'] {
  if (actionType === 'refuse') {
    return 'protective'
  }
  if (intent === 'promotion' || intent === 'purchase') {
    return 'focused'
  }
  if (intent === 'support' || intent === 'policy') {
    return 'calm'
  }
  if (intent === 'greeting') {
    return 'welcoming'
  }
  return 'curious'
}

function resolveFocus(context: BrandSoulContext, intent: BrandSoulDetectedIntent) {
  if (intent === 'promotion') {
    const promotion = context.commerce.promotions.find((item) => item.active)
    return promotion?.title ?? 'promocao ativa'
  }
  if (intent === 'product-discovery' || intent === 'purchase') {
    return context.commerce.products.find((item) => item.available !== false)?.name ?? 'catalogo ativo'
  }
  if (intent === 'business-hours') {
    return 'horario comercial'
  }
  if (intent === 'policy' || intent === 'support') {
    return context.commerce.policies[0]?.title ?? 'politicas ativas'
  }
  return context.state.currentFocus
}

function buildBrandSoulStatePatch(
  context: BrandSoulContext,
  detectedIntent: DetectedBrandSoulIntent,
  actionResolution: ResolvedBrandSoulAction,
): Partial<BrandSoulState> {
  const energyShift =
    actionResolution.action === 'sell' ? 0.06 : actionResolution.action === 'support' ? -0.04 : 0.02

  return {
    currentMood: resolveMood(detectedIntent.intent, actionResolution.action),
    currentIntent: actionResolution.blocked
      ? 'observe'
      : actionResolution.action === 'sell'
        ? 'convert'
        : actionResolution.action === 'support'
          ? 'support'
          : actionResolution.action === 'guide'
            ? 'recommend'
            : 'assist',
    currentFocus: resolveFocus(context, detectedIntent.intent),
    interactionMode: actionResolution.blocked ? 'response' : resolveInteractionMode(actionResolution.action),
    energyLevel: clamp(context.state.energyLevel + energyShift),
    lastUpdatedAt: new Date().toISOString(),
  }
}

function buildRawBrandSoulMemoryCandidates(
  context: BrandSoulContext,
  userMessage: string,
  detectedIntent: DetectedBrandSoulIntent,
  actionResolution: ResolvedBrandSoulAction,
): BrandSoulMemorySnapshot[] {
  const now = new Date().toISOString()
  const rawCandidates: BrandSoulMemorySnapshot[] = []
  const normalizedMessage = normalizeText(userMessage)

  if (detectedIntent.intent === 'product-discovery' || detectedIntent.intent === 'purchase') {
    const matchedProduct = context.commerce.products.find((product) => includesAny(normalizedMessage, [normalizeText(product.name)]))
    if (matchedProduct) {
      rawCandidates.push({
        key: `product-interest:${matchedProduct.id}`,
        value: matchedProduct.name,
        type: 'relational',
        relevanceScore: 0.78,
        createdAt: now,
      })
    }
  }

  if (detectedIntent.intent === 'promotion') {
    const activePromotion = context.commerce.promotions.find((promotion) => promotion.active)
    if (activePromotion) {
      rawCandidates.push({
        key: `promotion-context:${activePromotion.id}`,
        value: activePromotion.title,
        type: 'operational',
        relevanceScore: 0.72,
        createdAt: now,
      })
    }
  }

  if (detectedIntent.intent === 'support' || detectedIntent.intent === 'policy') {
    rawCandidates.push({
      key: `support-topic:${now}`,
      value: detectedIntent.intent,
      type: 'relational',
      relevanceScore: 0.64,
      createdAt: now,
    })
  }

  if (actionResolution.action === 'inform' && rawCandidates.length === 0 && userMessage.trim().length > 0) {
    rawCandidates.push({
      key: `conversation-focus:${now}`,
      value: userMessage.trim().slice(0, 120),
      type: 'relational',
      relevanceScore: 0.42,
      createdAt: now,
    })
  }

  return rawCandidates
}

function resolveBrandSoulMemoryPolicyResult(
  context: BrandSoulContext,
  userMessage: string,
  detectedIntent: DetectedBrandSoulIntent,
  actionResolution: ResolvedBrandSoulAction,
) {
  return applyBrandSoulMemoryPolicy(
    context,
    buildRawBrandSoulMemoryCandidates(context, userMessage, detectedIntent, actionResolution),
  )
}

function resolveDecisionConfidence(
  detectedIntent: DetectedBrandSoulIntent,
  actionResolution: ResolvedBrandSoulAction,
  context: BrandSoulContext,
) {
  if (actionResolution.blocked) {
    return 0.98
  }

  const contextBoost = context.conversation.relevantMemoryKeys.length > 0 ? 0.04 : 0
  return clamp(detectedIntent.confidence + contextBoost, 0, 1)
}

function resolveBrandSoulDecisionFlow(context: BrandSoulContext, userMessage: string): BrandSoulDecisionFlow {
  const extractedMemorySignals = extractRelevantMemorySignals(context.memory, userMessage)
  const identityDriftValidation = validateIdentityDrift(
    context.identity,
    deriveBrandSoulPreferences(context.memory),
    computeMemoryInfluenceTrend(context.memory),
  )
  const derivedPreferences = identityDriftValidation.preferences
  const memoryTrend = identityDriftValidation.trend
  const baselineDetectedIntent = detectBrandSoulIntent(userMessage, context)
  const turnBiasedDetectedIntent = applyMemoryBiasToDetectedIntent({
    context,
    userMessage,
    detectedIntent: baselineDetectedIntent,
    memorySignals: extractedMemorySignals,
  })
  const guardrailCheck = checkGuardrails(context, userMessage)
  const baselineActionResolution = resolveBrandSoulAction(baselineDetectedIntent, guardrailCheck)
  const turnActionResolution = resolveBrandSoulAction(turnBiasedDetectedIntent, guardrailCheck)
  const baselineConfidence = resolveDecisionConfidence(baselineDetectedIntent, baselineActionResolution, context)
  const turnConfidence = resolveDecisionConfidence(turnBiasedDetectedIntent, turnActionResolution, context)
  const turnSignalPriority = collectAppliedMemoryInfluenceSignals(extractedMemorySignals).reduce(
    (maxPriority, signal) => Math.max(maxPriority, signal.priorityScore),
    0,
  )
  const turnInfluenceStrength = resolveInfluenceStrength({
    confidenceDelta: clamp(turnConfidence - baselineConfidence, -1, 1),
    intentChanged: baselineActionResolution.intent !== turnActionResolution.intent,
    actionChanged: baselineActionResolution.action !== turnActionResolution.action,
    strongestSignalPriority: turnSignalPriority,
    maxInfluence: MAX_TURN_MEMORY_DECISION_INFLUENCE,
  })
  const preferenceBiasedDetectedIntent = applyPreferenceBiasToDetectedIntent({
    context,
    userMessage,
    detectedIntent: turnBiasedDetectedIntent,
    derivedPreferences,
    preferenceInfluenceBudget: resolvePreferenceInfluenceBudget({
      detectedIntent: turnBiasedDetectedIntent,
      derivedPreferences,
      usedInfluence: turnInfluenceStrength,
    }),
  })
  const preferenceActionResolution = resolveBrandSoulAction(preferenceBiasedDetectedIntent, guardrailCheck)
  const preferenceConfidence = resolveDecisionConfidence(preferenceBiasedDetectedIntent, preferenceActionResolution, context)
  const preferenceSignalPriority = collectAppliedPreferenceInfluenceSignals(derivedPreferences).reduce(
    (maxPriority, signal) => Math.max(maxPriority, signal.priorityScore),
    0,
  )
  const preferenceInfluenceStrength = resolveInfluenceStrength({
    confidenceDelta: clamp(preferenceConfidence - turnConfidence, -1, 1),
    intentChanged: turnActionResolution.intent !== preferenceActionResolution.intent,
    actionChanged: turnActionResolution.action !== preferenceActionResolution.action,
    strongestSignalPriority: preferenceSignalPriority,
    maxInfluence: MAX_PREFERENCE_DECISION_INFLUENCE,
  })
  const detectedIntent = applyMemoryTrendBiasToDetectedIntent({
    context,
    userMessage,
    detectedIntent: preferenceBiasedDetectedIntent,
    memoryTrend,
    trendInfluenceBudget: resolveTrendInfluenceBudget({
      detectedIntent: preferenceBiasedDetectedIntent,
      memoryTrend,
      usedInfluence: turnInfluenceStrength + preferenceInfluenceStrength,
    }),
  })
  const actionResolution = resolveBrandSoulAction(detectedIntent, guardrailCheck)
  const biasedConfidence = resolveDecisionConfidence(detectedIntent, actionResolution, context)
  const memoryPolicyResult = resolveBrandSoulMemoryPolicyResult(context, userMessage, detectedIntent, actionResolution)

  return {
    decision: {
      intent: actionResolution.intent,
      action: actionResolution.action,
      responsePlan: buildBrandSoulDecisionPlan(context, userMessage, detectedIntent, actionResolution, guardrailCheck, derivedPreferences),
      statePatch: buildBrandSoulStatePatch(context, detectedIntent, actionResolution),
      memoryCandidates: memoryPolicyResult.legacySnapshots.slice(0, 2),
      confidence: biasedConfidence,
      memoryInfluence: resolveMemoryInfluence({
        baselineActionResolution,
        turnActionResolution,
        preferenceActionResolution,
        biasedActionResolution: actionResolution,
        baselineConfidence,
        turnConfidence,
        preferenceConfidence,
        biasedConfidence,
        memorySignals: extractedMemorySignals,
        derivedPreferences,
        memoryTrend,
      }),
    },
    memoryPolicyResult,
  }
}

export function resolveBrandSoulDecision(context: BrandSoulContext, userMessage: string): BrandSoulDecision {
  return resolveBrandSoulDecisionFlow(context, userMessage).decision
}

export function resolveBrandSoulResponse(context: BrandSoulContext, userMessage: string): BrandSoulResponse {
  const { decision } = resolveBrandSoulDecisionFlow(context, userMessage)

  return {
    responseText: renderBrandSoulResponseText(context, decision),
    detectedIntent: decision.intent,
    actionType: decision.action,
    stateUpdate: decision.statePatch,
    memoryToStore: decision.memoryCandidates,
  }
}

export async function resolveBrandSoulResponseWithMemoryPersistence(args: {
  context: BrandSoulContext
  userMessage: string
  memoryWriter: BrandSoulMemoryWriter
  dispatchOptions?: BrandSoulMemoryDispatchOptions
  orchestrationContext?: BrandSoulMemoryPersistenceOrchestrationContext
}): Promise<BrandSoulResponseWithMemoryPersistence> {
  const { context, userMessage, memoryWriter, dispatchOptions, orchestrationContext } = args
  const { decision, memoryPolicyResult } = resolveBrandSoulDecisionFlow(context, userMessage)

  return {
    responseText: renderBrandSoulResponseText(context, decision),
    detectedIntent: decision.intent,
    actionType: decision.action,
    stateUpdate: decision.statePatch,
    memoryToStore: decision.memoryCandidates,
    memoryPersistence: await orchestrateBrandSoulMemoryPersistence(
      memoryWriter,
      {
        persistenceRecords: memoryPolicyResult.persistenceRecords,
      },
      dispatchOptions,
      orchestrationContext,
    ),
  }
}