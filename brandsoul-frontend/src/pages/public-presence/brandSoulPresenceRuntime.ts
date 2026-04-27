import type { BrandSoulState } from '../../domain/identity/contracts/BrandSoulState'
import type { BrandSoulAdaptiveDecisionCoreResolution } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionCore'
import type { BrandSoulAdaptiveDecisionProfile } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionProfile'
import type {
  BrandSoulAdaptiveSemanticProposalEvidence,
  BrandSoulAdaptiveSemanticZone,
} from '../../domain/identity/contracts/BrandSoulAdaptiveSemanticProposal'
import type { BrandSoulCognitiveState } from '../../domain/identity/contracts/BrandSoulCognitiveState'
import type { BrandSoulDecision } from '../../domain/identity/contracts/BrandSoulDecision'
import type { BrandSoulHistoricalSignals } from '../../domain/identity/contracts/BrandSoulHistoricalSignals'
import type { BrandSoulInteractionOutcome } from '../../domain/identity/contracts/BrandSoulInteractionOutcome'
import type { BrandSoulAdaptiveDecisionConfidenceArbitration } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionCore'
import type { BrandSoulAdaptiveCoreFallbackCondition } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionCore'
import type { BrandSoulAdaptiveDecisionSource } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionCore'
import type { BrandSoulPolicyProfile } from '../../domain/identity/contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../../domain/identity/contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../../domain/identity/contracts/BrandSoulStrategyProfile'
import type { BrandSoulMemorySnapshot, BrandSoulMemoryValue } from '../../domain/identity/contracts/BrandSoulMemorySnapshot'
import type { BrandSoulMemoryPersistenceOrchestrationResult } from '../../domain/identity/persistence/orchestrateBrandSoulMemoryPersistence'
import type { BrandSoulMemoryPersistenceRecord } from '../../domain/identity/persistence/BrandSoulMemoryPersistenceRecord'
import type { BrandSoulMemoryWriter } from '../../domain/identity/persistence/BrandSoulMemoryWriter'
import {
  InMemoryBrandSoulMemoryWriter,
  type BrandSoulSemanticMergeAuditEvent,
} from '../../domain/identity/persistence/InMemoryBrandSoulMemoryWriter'
import { buildBrandSoulVisualRuntimePatch } from '../../domain/identity/services/buildBrandSoulVisualRuntimePatch'
import { initializeBrandSoulCognitiveState } from '../../domain/identity/services/initializeBrandSoulCognitiveState'
import { mapCognitiveToVisualState } from '../../domain/identity/services/mapCognitiveToVisualState'
import { resolveBrandSoulDecision } from '../../domain/identity/services/resolveBrandSoulResponse'
import { resolveBrandSoulResponseWithMemoryPersistence } from '../../domain/identity/services/resolveBrandSoulResponse'
import type { BrandSoulVisualPatchResolution } from '../../domain/identity/services/resolveBrandSoulVisualPatch'
import { resolveBrandSoulDecisionWithState } from '../../domain/identity/services/resolveBrandSoulDecisionWithState'
import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'
import {
  deriveCognitivePresenceIndicator,
  type PublicPresenceCognitiveIndicator,
} from './services/deriveCognitivePresenceIndicator'
import { buildBrandSoulContextFromPublicPresence } from './services/buildBrandSoulContextFromPublicPresence'
import { renderPublicPresenceResponseText } from './services/renderPublicPresenceResponseText'

type PublicPresenceFalsePositiveCauseCategory = 'semantic-reversal' | 'safe-zone-loss' | 'authority-reversal' | 'consistency-drop'
type PublicPresenceTemporalCauseRelation = 'simultaneous-causes' | 'sequential-causes'
type PublicPresenceTemporalCauseRole = 'root-cause' | 'derived-causes'

type PublicPresenceTemporalCauseEntry = {
  turn: string
  category: PublicPresenceFalsePositiveCauseCategory
  cause: string
  role: PublicPresenceTemporalCauseRole
  relation: PublicPresenceTemporalCauseRelation
  relevance: number
}

type PublicPresenceTemporalCauseChain = {
  classification: PublicPresenceTemporalCauseRelation
  rootCause?: string
  rootCategory?: PublicPresenceFalsePositiveCauseCategory
  derivedCauses: string[]
  label: string
}

export type PublicPresenceVisualDebug = BrandSoulVisualPatchResolution & {
  currentState: BrandSoulState
  currentCognitiveState: BrandSoulCognitiveState
  currentHistoricalSignals: BrandSoulHistoricalSignals
  adaptiveDecisionCore: BrandSoulAdaptiveDecisionCoreResolution
  previousTerminalAuthority?: BrandSoulAdaptiveDecisionSource
  terminalAuthorityShift: 'initial-turn' | 'no-change' | 'heuristic-fallback -> adaptive-core' | 'adaptive-core -> heuristic-fallback'
  authorityRegimeCorrelation: {
    previousRegime?: 'forming' | 'transitioning' | 'fallback stable' | 'adaptive stabilizing'
    currentRegime: 'forming' | 'transitioning' | 'fallback stable' | 'adaptive stabilizing'
    regimeChanged: boolean
    label: string
  }
  correlationType?: 'isolated-shift' | 'structural-transition'
  structuralTransitionQuality?: {
    previousLabel?: string
    currentLabel: string
    label: string
  }
  structuralTransitionDirection?: 'quality-up' | 'quality-down' | 'neutral'
  structuralTransitionStability?: {
    previousStrength: number
    currentStrength: number
    label: string
  }
  structuralTransitionMaturity?: 'consolidated-gain' | 'transient-gain' | 'neutral' | 'regressive'
  falsePositiveGain: boolean
  falsePositiveCause?: string
  causeCategory?: PublicPresenceFalsePositiveCauseCategory
  secondaryCauses: string[]
  causeRanking: Array<{
    category: PublicPresenceFalsePositiveCauseCategory
    cause: string
    relevance: number
  }>
  temporalCauseChain?: PublicPresenceTemporalCauseChain
  causeTimeline: PublicPresenceTemporalCauseEntry[]
  causeOriginTurn?: string
  falsePositiveReason?: string
  terminalAuthority: BrandSoulAdaptiveDecisionSource
  semanticFrozen: boolean
  terminalReason: string
  proposalEvidence: BrandSoulAdaptiveSemanticProposalEvidence
  dominantEvidence: {
    signal: keyof BrandSoulAdaptiveSemanticProposalEvidence
    weight: number
  }
  dominantReason: string
  confidenceArbitration: BrandSoulAdaptiveDecisionConfidenceArbitration
  adaptiveSovereigntyHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  currentAdaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  currentPolicyProfile: BrandSoulPolicyProfile
  nextCognitiveState: BrandSoulCognitiveState
  nextHistoricalSignals: BrandSoulHistoricalSignals
  nextAdaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  nextPolicyProfile: BrandSoulPolicyProfile
  currentStrategyProfile: BrandSoulStrategyProfile
  nextStrategyProfile: BrandSoulStrategyProfile
  interactionOutcome: BrandSoulInteractionOutcome
  qualifiedInteractionOutcome?: BrandSoulQualifiedInteractionOutcome
  memoryPersistence: BrandSoulMemoryPersistenceOrchestrationResult
  localMemoryAudit?: {
    recentSemanticMerges: BrandSoulSemanticMergeAuditEvent[]
    totalSemanticMergeCount: number
  }
}

export type PublicPresenceAdaptiveSovereigntyTurn = {
  observedAt: string
  decisionSource: BrandSoulAdaptiveDecisionSource
  semanticZone: BrandSoulAdaptiveSemanticZone
  intent: BrandSoulDecision['intent']
  action: BrandSoulDecision['action']
}

export type PublicPresenceVisualFlowResult = {
  responseText: string
  nextState: BrandSoulState
  nextCognitiveState: BrandSoulCognitiveState
  nextHistoricalSignals: BrandSoulHistoricalSignals
  nextAdaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  nextPolicyProfile: BrandSoulPolicyProfile
  nextStrategyProfile: BrandSoulStrategyProfile
  indicator: PublicPresenceCognitiveIndicator
  debug: PublicPresenceVisualDebug
}

export type PublicPresenceDegradedResponse = {
  responseText: string
  source: 'frontend-operational-fallback'
  fallbackReason: string
}

const localPublicPresenceMemoryWriterRegistry = new Map<string, InMemoryBrandSoulMemoryWriter>()
const localAdaptiveSovereigntyHistoryRegistry = new Map<string, PublicPresenceAdaptiveSovereigntyTurn[]>()
const MAX_LOCAL_ADAPTIVE_SOVEREIGNTY_HISTORY = 5

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase()
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function hasContinuationCue(userMessage: string) {
  return includesAny(normalizeText(userMessage), ['continua', 'continuar', 'ainda', 'mesmo', 'novo', 'novamente', 'de novo', 'nisso', 'isso'])
}

function hasAcceptanceCue(userMessage: string) {
  return includesAny(normalizeText(userMessage), ['entendi', 'ok', 'certo', 'faz sentido', 'perfeito', 'boa'])
}

function hasCorrectionCue(userMessage: string) {
  return includesAny(normalizeText(userMessage), ['errado', 'corrige', 'corrigir', 'nao', 'na verdade', 'isso nao'])
}

function buildObservableInteractionSignals(args: {
  userMessage: string
  persistedMemoryCount: number
  historicalSignals?: BrandSoulHistoricalSignals
}) {
  const { userMessage, persistedMemoryCount, historicalSignals } = args
  const normalizedMessage = normalizeText(userMessage)

  return {
    userContinuationObserved: hasContinuationCue(userMessage),
    responseAccepted: hasAcceptanceCue(userMessage),
    explicitCorrection: hasCorrectionCue(userMessage),
    engagementObserved: normalizedMessage.trim().length >= 24,
    sessionContinuation: persistedMemoryCount > 0 || (historicalSignals?.totalInteractions ?? 0) > 0,
    manualValidation: false,
  }
}

function deriveLocalInteractionOutcome(args: {
  userMessage: string
  decision: BrandSoulDecision
  currentState: BrandSoulState
  persistedMemoryCount: number
}): BrandSoulInteractionOutcome {
  const { userMessage, decision, currentState, persistedMemoryCount } = args
  const userContinuation = hasContinuationCue(userMessage)
  const actionBias =
    decision.action === 'support'
      ? 0.08
      : decision.action === 'guide'
        ? 0.06
        : decision.action === 'sell'
          ? 0.04
          : decision.action === 'refuse'
            ? -0.34
            : 0.01
  const stateResonance =
    (currentState.currentIntent === 'support' && decision.action === 'support') ||
    (currentState.currentIntent === 'recommend' && (decision.action === 'guide' || decision.action === 'sell'))
      ? 0.07
      : 0.02
  const interactionSuccess = clamp(0.24 + decision.confidence * 0.58 + actionBias + stateResonance + (userContinuation ? 0.08 : 0))
  const engagementDelta = clamp(
    (userContinuation ? 0.18 : -0.03) +
      (decision.action === 'guide' ? 0.12 : decision.action === 'sell' ? 0.1 : decision.action === 'support' ? 0.08 : decision.action === 'refuse' ? -0.18 : 0.02) +
      (decision.confidence - 0.5) * 0.2,
    -1,
    1,
  )
  const signalStrength = clamp(0.28 + decision.confidence * 0.46 + Math.min(persistedMemoryCount, 3) * 0.05 + (userContinuation ? 0.08 : 0))

  return {
    interactionSuccess,
    userContinuation,
    engagementDelta,
    signalStrength,
  }
}

function isBrandSoulMemoryValue(value: unknown): value is BrandSoulMemoryValue {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((item) => item == null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
  }

  if (typeof value === 'object') {
    return Object.values(value).every(
      (item) =>
        item == null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean' ||
        (Array.isArray(item) && item.every((entry) => entry == null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')),
    )
  }

  return false
}

function resolveSnapshotValue(record: BrandSoulMemoryPersistenceRecord): BrandSoulMemoryValue {
  const candidateValues = [
    record.attributes.observedValue,
    record.attributes.inferredValue,
    record.attributes.productLabel,
    record.attributes.promotionLabel,
    record.attributes.contextLabel,
    record.attributes.topic,
    record.attributes.focus,
    record.attributes.reference,
  ]

  for (const candidateValue of candidateValues) {
    if (isBrandSoulMemoryValue(candidateValue)) {
      return candidateValue
    }
  }

  return record.signal
}

function mapPersistenceRecordToMemorySnapshot(record: BrandSoulMemoryPersistenceRecord): BrandSoulMemorySnapshot {
  return {
    key: record.memoryId,
    value: resolveSnapshotValue(record),
    type: record.memoryType,
    relevanceScore: record.relevanceScore,
    createdAt: record.createdAt,
  }
}

function loadLocalPersistedMemory(writer: BrandSoulMemoryWriter): BrandSoulMemorySnapshot[] {
  if (!(writer instanceof InMemoryBrandSoulMemoryWriter)) {
    return []
  }

  return writer.getAll().map(mapPersistenceRecordToMemorySnapshot)
}

function loadLocalMemoryAudit(writer: BrandSoulMemoryWriter) {
  if (!(writer instanceof InMemoryBrandSoulMemoryWriter)) {
    return undefined
  }

  return {
    recentSemanticMerges: writer.getLastWriteSemanticMergeAuditEvents(),
    totalSemanticMergeCount: writer.getSemanticMergeAuditLog().length,
  }
}

function buildLocalMemorySessionKey(entityId: string, memorySessionId?: string) {
  return memorySessionId ?? `public-presence:${entityId}`
}

function resolveDominantEvidence(proposalEvidence: BrandSoulAdaptiveSemanticProposalEvidence) {
  const entries = Object.entries(proposalEvidence) as Array<[keyof BrandSoulAdaptiveSemanticProposalEvidence, number]>

  return [...entries].sort((left, right) => right[1] - left[1])[0] ?? ['memoryStrength', 0]
}

function resolveDominantReason(args: {
  decisionSource: BrandSoulAdaptiveDecisionSource
  fallbackConditions: string[]
  dominantEvidence: keyof BrandSoulAdaptiveSemanticProposalEvidence
}) {
  const { decisionSource, fallbackConditions, dominantEvidence } = args

  if (decisionSource === 'adaptive-core') {
    return `${dominantEvidence} sustained adaptive-core promotion`
  }

  return `${fallbackConditions[0] ?? 'heuristic-fallback'} held the decision on fallback`
}

function resolveTerminalReason(args: {
  decisionSource: BrandSoulAdaptiveDecisionSource
  fallbackConditions: string[]
}) {
  const { decisionSource, fallbackConditions } = args

  if (decisionSource === 'adaptive-core') {
    return 'adaptive-core approved terminal semantics and froze downstream rewrites'
  }

  return `${fallbackConditions[0] ?? 'heuristic-fallback'} kept heuristic-fallback as terminal authority with structural modulation still open`
}

function resolveTerminalAuthorityShift(
  previousTerminalAuthority: BrandSoulAdaptiveDecisionSource | undefined,
  terminalAuthority: BrandSoulAdaptiveDecisionSource,
): PublicPresenceVisualDebug['terminalAuthorityShift'] {
  if (previousTerminalAuthority == null) {
    return 'initial-turn'
  }

  if (previousTerminalAuthority === terminalAuthority) {
    return 'no-change'
  }

  if (previousTerminalAuthority === 'heuristic-fallback' && terminalAuthority === 'adaptive-core') {
    return 'heuristic-fallback -> adaptive-core'
  }

  return 'adaptive-core -> heuristic-fallback'
}

function resolveAdaptiveSovereigntyStability(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  const recentTurns = history.slice(-3)

  if (recentTurns.length < 3) {
    return 'forming' as const
  }

  if (recentTurns.every((turn) => turn.decisionSource === 'adaptive-core')) {
    return 'adaptive stabilizing' as const
  }

  if (recentTurns.every((turn) => turn.decisionSource === 'heuristic-fallback')) {
    return 'fallback stable' as const
  }

  return 'transitioning' as const
}

function resolveAdaptiveStabilizationQuality(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  const recentTurns = history.slice(-3)

  if (
    recentTurns.length < 3 ||
    !recentTurns.every((turn) => turn.decisionSource === 'adaptive-core')
  ) {
    return undefined
  }

  return recentTurns.every((turn) => turn.semanticZone === 'safe')
    ? 'safe-consolidated' as const
    : 'mixed-zone' as const
}

function resolveAdaptiveStabilizationLabel(
  stabilizationQuality: ReturnType<typeof resolveAdaptiveStabilizationQuality>,
) {
  if (stabilizationQuality === 'safe-consolidated') {
    return 'safe consolidated'
  }

  if (stabilizationQuality === 'mixed-zone') {
    return 'mixed zone'
  }

  return 'n/a'
}

function resolveAdaptiveSovereigntyStateLabel(args: {
  regime: ReturnType<typeof resolveAdaptiveSovereigntyStability>
  quality: ReturnType<typeof resolveAdaptiveStabilizationQuality>
}) {
  const { regime, quality } = args

  if (regime === 'adaptive stabilizing' && quality != null) {
    return `${regime} / ${resolveAdaptiveStabilizationLabel(quality)}`
  }

  return regime
}

function resolveAdaptiveSovereigntyStrength(args: {
  regime: ReturnType<typeof resolveAdaptiveSovereigntyStability>
  quality: ReturnType<typeof resolveAdaptiveStabilizationQuality>
}) {
  const { regime, quality } = args

  if (regime === 'adaptive stabilizing' && quality === 'safe-consolidated') {
    return 4
  }

  if (regime === 'adaptive stabilizing' && quality === 'mixed-zone') {
    return 3
  }

  if (regime === 'transitioning') {
    return 2
  }

  if (regime === 'fallback stable') {
    return 1
  }

  return 0
}

function buildAdaptiveSovereigntySnapshot(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  const regime = resolveAdaptiveSovereigntyStability(history)
  const quality = resolveAdaptiveStabilizationQuality(history)
  const strength = resolveAdaptiveSovereigntyStrength({ regime, quality })

  return {
    regime,
    quality,
    strength,
    label: resolveAdaptiveSovereigntyStateLabel({ regime, quality }),
  }
}

function resolveStructuralTransitionQuality(args: {
  previousHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  currentHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  correlationType: PublicPresenceVisualDebug['correlationType']
}): {
  structuralTransitionQuality: PublicPresenceVisualDebug['structuralTransitionQuality']
  structuralTransitionDirection: PublicPresenceVisualDebug['structuralTransitionDirection']
} {
  const { previousHistory, currentHistory, correlationType } = args

  if (correlationType !== 'structural-transition' || previousHistory.length === 0) {
    return {
      structuralTransitionQuality: undefined,
      structuralTransitionDirection: undefined,
    }
  }

  const previousSnapshot = buildAdaptiveSovereigntySnapshot(previousHistory)
  const currentSnapshot = buildAdaptiveSovereigntySnapshot(currentHistory)
  const direction = currentSnapshot.strength > previousSnapshot.strength
    ? 'quality-up'
    : currentSnapshot.strength < previousSnapshot.strength
      ? 'quality-down'
      : 'neutral'

  return {
    structuralTransitionQuality: {
      previousLabel: previousSnapshot.label,
      currentLabel: currentSnapshot.label,
      label: `${previousSnapshot.label} -> ${currentSnapshot.label}`,
    },
    structuralTransitionDirection: direction,
  }
}

function resolveStructuralTransitionStability(args: {
  previousHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  currentHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  correlationType: PublicPresenceVisualDebug['correlationType']
  structuralTransitionDirection: PublicPresenceVisualDebug['structuralTransitionDirection']
}): {
  structuralTransitionStability: PublicPresenceVisualDebug['structuralTransitionStability']
  structuralTransitionMaturity: PublicPresenceVisualDebug['structuralTransitionMaturity']
} {
  const { previousHistory, currentHistory, correlationType, structuralTransitionDirection } = args

  if (correlationType !== 'structural-transition' || previousHistory.length === 0 || structuralTransitionDirection == null) {
    return {
      structuralTransitionStability: undefined,
      structuralTransitionMaturity: undefined,
    }
  }

  const previousSnapshot = buildAdaptiveSovereigntySnapshot(previousHistory)
  const currentSnapshot = buildAdaptiveSovereigntySnapshot(currentHistory)
  const maturity = structuralTransitionDirection === 'quality-up'
    ? currentSnapshot.regime === 'adaptive stabilizing' && currentSnapshot.quality != null
      ? 'consolidated-gain'
      : 'transient-gain'
    : structuralTransitionDirection === 'quality-down'
      ? 'regressive'
      : 'neutral'

  return {
    structuralTransitionStability: {
      previousStrength: previousSnapshot.strength,
      currentStrength: currentSnapshot.strength,
      label: `${previousSnapshot.strength} -> ${currentSnapshot.strength}`,
    },
    structuralTransitionMaturity: maturity,
  }
}

export function resolveFalsePositiveGain(args: {
  previousHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  currentHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  terminalAuthorityShift: PublicPresenceVisualDebug['terminalAuthorityShift']
  currentFallbackConditions: BrandSoulAdaptiveCoreFallbackCondition[]
}): {
  falsePositiveGain: boolean
  falsePositiveCause?: string
  causeCategory?: PublicPresenceVisualDebug['causeCategory']
  secondaryCauses: string[]
  causeRanking: PublicPresenceVisualDebug['causeRanking']
  temporalCauseChain?: PublicPresenceVisualDebug['temporalCauseChain']
  causeTimeline: PublicPresenceVisualDebug['causeTimeline']
  causeOriginTurn?: string
  falsePositiveReason?: string
} {
  const { previousHistory, currentHistory, terminalAuthorityShift, currentFallbackConditions } = args

  if (previousHistory.length < 2) {
    return {
      falsePositiveGain: false,
      falsePositiveCause: undefined,
      causeCategory: undefined,
      secondaryCauses: [],
      causeRanking: [],
      temporalCauseChain: undefined,
      causeTimeline: [],
      causeOriginTurn: undefined,
      falsePositiveReason: undefined,
    }
  }

  const prePreviousHistory = previousHistory.slice(0, -1)
  const { correlationType: previousCorrelationType } = resolveAuthorityRegimeCorrelation({
    previousHistory: prePreviousHistory,
    currentHistory: previousHistory,
    terminalAuthorityShift: resolveTerminalAuthorityShift(
      prePreviousHistory.at(-1)?.decisionSource,
      previousHistory.at(-1)!.decisionSource,
    ),
  })
  const { structuralTransitionDirection: previousTransitionDirection } = resolveStructuralTransitionQuality({
    previousHistory: prePreviousHistory,
    currentHistory: previousHistory,
    correlationType: previousCorrelationType,
  })
  const { structuralTransitionMaturity: previousTransitionMaturity } = resolveStructuralTransitionStability({
    previousHistory: prePreviousHistory,
    currentHistory: previousHistory,
    correlationType: previousCorrelationType,
    structuralTransitionDirection: previousTransitionDirection,
  })

  if (previousTransitionMaturity !== 'transient-gain') {
    return {
      falsePositiveGain: false,
      falsePositiveCause: undefined,
      causeCategory: undefined,
      secondaryCauses: [],
      causeRanking: [],
      temporalCauseChain: undefined,
      causeTimeline: [],
      causeOriginTurn: undefined,
      falsePositiveReason: undefined,
    }
  }

  const previousTurn = previousHistory.at(-1)
  const currentTurn = currentHistory.at(-1)

  if (!previousTurn || !currentTurn) {
    return {
      falsePositiveGain: false,
      falsePositiveCause: undefined,
      causeCategory: undefined,
      secondaryCauses: [],
      causeRanking: [],
      temporalCauseChain: undefined,
      causeTimeline: [],
      causeOriginTurn: undefined,
      falsePositiveReason: undefined,
    }
  }

  const previousSnapshot = buildAdaptiveSovereigntySnapshot(previousHistory)
  const currentSnapshot = buildAdaptiveSovereigntySnapshot(currentHistory)
  const authorityReversal = terminalAuthorityShift === 'adaptive-core -> heuristic-fallback'
  const regimeDegradation = currentSnapshot.strength < previousSnapshot.strength
  const semanticReversal = previousTurn.intent !== currentTurn.intent || previousTurn.action !== currentTurn.action
  const safeZoneLoss = previousTurn.semanticZone === 'safe' && currentTurn.semanticZone !== 'safe'
  const consistencyDrop = currentFallbackConditions.some((condition) => [
    'insufficient-evidence',
    'insufficient-learning-confidence',
    'insufficient-adaptive-priority',
    'excessive-drift',
    'no-material-adaptive-shift',
  ].includes(condition))

  if (!authorityReversal && !regimeDegradation) {
    return {
      falsePositiveGain: false,
      falsePositiveCause: undefined,
      causeCategory: undefined,
      secondaryCauses: [],
      causeRanking: [],
      temporalCauseChain: undefined,
      causeTimeline: [],
      causeOriginTurn: undefined,
      falsePositiveReason: undefined,
    }
  }

  const rankedCauses: PublicPresenceVisualDebug['causeRanking'] = []

  if (safeZoneLoss) {
    rankedCauses.push({
      category: 'safe-zone-loss',
      cause: 'safe zone was lost after the transient gain',
      relevance: 1,
    })
  }

  if (consistencyDrop) {
    rankedCauses.push({
      category: 'consistency-drop',
      cause: 'adaptive evidence weakened and fallback conditions took control',
      relevance: safeZoneLoss ? 0.8 : 1,
    })
  }

  if (semanticReversal) {
    rankedCauses.push({
      category: 'semantic-reversal',
      cause: 'intent/action coherence shifted away from the transient adaptive gain',
      relevance: safeZoneLoss || consistencyDrop ? 0.7 : 1,
    })
  }

  if (authorityReversal) {
    rankedCauses.push({
      category: 'authority-reversal',
      cause: 'terminal authority reverted from adaptive-core to heuristic-fallback',
      relevance: safeZoneLoss || consistencyDrop || semanticReversal ? 0.6 : 1,
    })
  }

  if (!rankedCauses.some((item) => item.category === 'consistency-drop') && regimeDegradation) {
    rankedCauses.push({
      category: 'consistency-drop',
      cause: 'transient gain degraded before it could stabilize',
      relevance: 0.5,
    })
  }

  rankedCauses.sort((left, right) => right.relevance - left.relevance)

  const primaryCause = rankedCauses[0]
  const secondaryCauses = rankedCauses.slice(1, 3).map((item) => item.cause)
  const originByCategory = new Map<PublicPresenceFalsePositiveCauseCategory, { turn: string; index: number }>()

  for (let index = Math.max(1, currentHistory.length - 3); index < currentHistory.length; index += 1) {
    const previousTurnInWindow = currentHistory[index - 1]
    const nextTurnInWindow = currentHistory[index]

    if (!previousTurnInWindow || !nextTurnInWindow) {
      continue
    }

    const turn = index === currentHistory.length - 1 ? 't' : `t-${currentHistory.length - 1 - index}`

    if (
      !originByCategory.has('safe-zone-loss') &&
      previousTurnInWindow.semanticZone === 'safe' &&
      nextTurnInWindow.semanticZone !== 'safe'
    ) {
      originByCategory.set('safe-zone-loss', { turn, index })
    }

    if (
      !originByCategory.has('semantic-reversal') &&
      (previousTurnInWindow.intent !== nextTurnInWindow.intent || previousTurnInWindow.action !== nextTurnInWindow.action)
    ) {
      originByCategory.set('semantic-reversal', { turn, index })
    }

    if (
      !originByCategory.has('authority-reversal') &&
      previousTurnInWindow.decisionSource === 'adaptive-core' &&
      nextTurnInWindow.decisionSource === 'heuristic-fallback'
    ) {
      originByCategory.set('authority-reversal', { turn, index })
    }
  }

  if (rankedCauses.some((item) => item.category === 'consistency-drop')) {
    originByCategory.set('consistency-drop', { turn: 't', index: currentHistory.length - 1 })
  }

  const distinctOriginIndices = [...new Set(
    rankedCauses.map((item) => originByCategory.get(item.category)?.index ?? currentHistory.length - 1),
  )].sort((left, right) => left - right)
  const relation: PublicPresenceTemporalCauseRelation = distinctOriginIndices.length > 1
    ? 'sequential-causes'
    : 'simultaneous-causes'
  const causeTimelineDraft = rankedCauses.map((item) => {
    const origin = originByCategory.get(item.category) ?? { turn: 't', index: currentHistory.length - 1 }

    return {
      turn: origin.turn,
      turnIndex: origin.index,
      category: item.category,
      cause: item.cause,
      relevance: item.relevance,
    }
  }).sort((left, right) => left.turnIndex - right.turnIndex || right.relevance - left.relevance)
  const rootTimelineEntry = causeTimelineDraft[0]
  const causeTimeline: PublicPresenceVisualDebug['causeTimeline'] = causeTimelineDraft.map((entry) => ({
    turn: entry.turn,
    category: entry.category,
    cause: entry.cause,
    role: entry === rootTimelineEntry ? 'root-cause' : 'derived-causes',
    relation,
    relevance: entry.relevance,
  }))
  const rootCause = causeTimeline.find((entry) => entry.role === 'root-cause')
  const temporalCauseChain = rootCause == null
    ? undefined
    : {
        classification: relation,
        rootCause: rootCause.cause,
        rootCategory: rootCause.category,
        derivedCauses: causeTimeline.filter((entry) => entry.role === 'derived-causes').map((entry) => entry.cause),
        label:
          relation === 'simultaneous-causes'
            ? `${rootCause.turn}: ${causeTimeline.map((entry) => entry.category).join(' + ')}`
            : causeTimeline.map((entry) => `${entry.turn}: ${entry.category}`).join(' -> '),
      }

  return {
    falsePositiveGain: true,
    falsePositiveCause: primaryCause?.cause,
    causeCategory: primaryCause?.category,
    secondaryCauses,
    causeRanking: rankedCauses,
    temporalCauseChain,
    causeTimeline,
    causeOriginTurn: rootCause?.turn,
    falsePositiveReason:
      primaryCause?.category === 'safe-zone-loss'
        ? 'transient gain failed after leaving the safe semantic zone'
        : primaryCause?.category === 'consistency-drop'
          ? 'transient gain failed after a consistency and evidence drop'
          : primaryCause?.category === 'semantic-reversal'
            ? 'transient gain failed after a semantic reversal'
            : primaryCause?.category === 'authority-reversal'
              ? 'transient gain failed after an authority reversal'
              : 'transient gain degraded before stabilizing',
  }
}

function resolveAuthorityRegimeCorrelation(args: {
  previousHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  currentHistory: PublicPresenceAdaptiveSovereigntyTurn[]
  terminalAuthorityShift: PublicPresenceVisualDebug['terminalAuthorityShift']
}): {
  authorityRegimeCorrelation: PublicPresenceVisualDebug['authorityRegimeCorrelation']
  correlationType: PublicPresenceVisualDebug['correlationType']
} {
  const { previousHistory, currentHistory, terminalAuthorityShift } = args
  const previousRegime = previousHistory.length > 0 ? resolveAdaptiveSovereigntyStability(previousHistory) : undefined
  const currentRegime = resolveAdaptiveSovereigntyStability(currentHistory)
  const regimeChanged = previousRegime != null && previousRegime !== currentRegime

  if (terminalAuthorityShift === 'initial-turn') {
    return {
      authorityRegimeCorrelation: {
        previousRegime,
        currentRegime,
        regimeChanged,
        label: `turno inicial em ${currentRegime}`,
      },
      correlationType: undefined,
    }
  }

  if (terminalAuthorityShift === 'no-change') {
    return {
      authorityRegimeCorrelation: {
        previousRegime,
        currentRegime,
        regimeChanged,
        label: regimeChanged
          ? `sem troca de autoridade, mas regime mudou: ${previousRegime} -> ${currentRegime}`
          : `sem troca de autoridade, regime permaneceu em ${currentRegime}`,
      },
      correlationType: undefined,
    }
  }

  return {
    authorityRegimeCorrelation: {
      previousRegime,
      currentRegime,
      regimeChanged,
      label: regimeChanged
        ? `${terminalAuthorityShift} com mudanca de regime: ${previousRegime} -> ${currentRegime}`
        : `${terminalAuthorityShift} sem mudanca de regime: ${currentRegime}`,
    },
    correlationType: regimeChanged ? 'structural-transition' : 'isolated-shift',
  }
}

function appendAdaptiveSovereigntyTurn(sessionId: string, turn: PublicPresenceAdaptiveSovereigntyTurn) {
  const history = localAdaptiveSovereigntyHistoryRegistry.get(sessionId) ?? []
  const nextHistory = [...history, turn].slice(-MAX_LOCAL_ADAPTIVE_SOVEREIGNTY_HISTORY)
  localAdaptiveSovereigntyHistoryRegistry.set(sessionId, nextHistory)
  return nextHistory
}

export function getOrCreateBrandSoulMemoryWriter(sessionId: string) {
  const existingWriter = localPublicPresenceMemoryWriterRegistry.get(sessionId)
  if (existingWriter) {
    return existingWriter
  }

  const nextWriter = new InMemoryBrandSoulMemoryWriter()
  localPublicPresenceMemoryWriterRegistry.set(sessionId, nextWriter)
  return nextWriter
}

export function getLocalPublicPresenceMemoryWriter(sessionId = 'public-presence:default') {
  return getOrCreateBrandSoulMemoryWriter(sessionId)
}

export function resetBrandSoulMemoryWriterRegistry() {
  localPublicPresenceMemoryWriterRegistry.clear()
  localAdaptiveSovereigntyHistoryRegistry.clear()
}

export async function resolvePublicPresenceVisualFlow(args: {
  presence: PublicPresenceResponse
  userMessage: string
  currentState: BrandSoulState
  currentCognitiveState?: BrandSoulCognitiveState
  currentAdaptiveDecisionProfile?: BrandSoulAdaptiveDecisionProfile
  currentPolicyProfile?: BrandSoulPolicyProfile
  currentStrategyProfile?: BrandSoulStrategyProfile
  historicalSignals?: BrandSoulHistoricalSignals
  now?: string
  memoryWriter?: BrandSoulMemoryWriter
  memorySessionId?: string
}): Promise<PublicPresenceVisualFlowResult> {
  const {
    presence,
    userMessage,
    currentState,
    currentCognitiveState,
    currentAdaptiveDecisionProfile,
    currentPolicyProfile,
    currentStrategyProfile,
    historicalSignals,
    now = new Date().toISOString(),
    memoryWriter,
    memorySessionId,
  } = args
  const resolvedSessionId = buildLocalMemorySessionKey(presence.entity.id, memorySessionId)
  const resolvedMemoryWriter = memoryWriter ?? getOrCreateBrandSoulMemoryWriter(resolvedSessionId)
  const context = {
    ...buildBrandSoulContextFromPublicPresence(presence, currentState),
    memory: loadLocalPersistedMemory(resolvedMemoryWriter),
  }
  const resolvedCognitiveState = currentCognitiveState ?? initializeBrandSoulCognitiveState(context.identity)
  const baseDecision = resolveBrandSoulDecision(context, userMessage)
  const interactionOutcome = deriveLocalInteractionOutcome({
    userMessage,
    decision: baseDecision,
    currentState,
    persistedMemoryCount: context.memory.length,
  })
  const observableInteractionSignals = buildObservableInteractionSignals({
    userMessage,
    persistedMemoryCount: context.memory.length,
    historicalSignals,
  })
  const stateResolution = resolveBrandSoulDecisionWithState({
    context,
    userMessage,
    currentState: resolvedCognitiveState,
    currentAdaptiveDecisionProfile,
    currentPolicyProfile,
    currentStrategyProfile,
    historicalSignals,
    interactionOutcome,
    observableInteractionSignals,
  })
  const proposalEvidence = stateResolution.adaptiveDecisionCore.semanticProposal.proposalEvidence
  const [dominantEvidenceSignal, dominantEvidenceWeight] = resolveDominantEvidence(proposalEvidence)
  const previousSovereigntyHistory = localAdaptiveSovereigntyHistoryRegistry.get(resolvedSessionId) ?? []
  const terminalAuthority = stateResolution.adaptiveDecisionCore.decisionSource
  const previousTerminalAuthority = previousSovereigntyHistory.at(-1)?.decisionSource
  const terminalAuthorityShift = resolveTerminalAuthorityShift(previousTerminalAuthority, terminalAuthority)
  const semanticFrozen = terminalAuthority === 'adaptive-core'
  const terminalReason = resolveTerminalReason({
    decisionSource: terminalAuthority,
    fallbackConditions: stateResolution.adaptiveDecisionCore.core.fallbackConditions,
  })
  const adaptiveSovereigntyHistory = appendAdaptiveSovereigntyTurn(resolvedSessionId, {
    observedAt: now,
    decisionSource: stateResolution.adaptiveDecisionCore.decisionSource,
    semanticZone: stateResolution.adaptiveDecisionCore.semanticProposal.semanticZone,
    intent: stateResolution.decision.intent,
    action: stateResolution.decision.action,
  })
  const { authorityRegimeCorrelation, correlationType } = resolveAuthorityRegimeCorrelation({
    previousHistory: previousSovereigntyHistory,
    currentHistory: adaptiveSovereigntyHistory,
    terminalAuthorityShift,
  })
  const { structuralTransitionQuality, structuralTransitionDirection } = resolveStructuralTransitionQuality({
    previousHistory: previousSovereigntyHistory,
    currentHistory: adaptiveSovereigntyHistory,
    correlationType,
  })
  const { structuralTransitionStability, structuralTransitionMaturity } = resolveStructuralTransitionStability({
    previousHistory: previousSovereigntyHistory,
    currentHistory: adaptiveSovereigntyHistory,
    correlationType,
    structuralTransitionDirection,
  })
  const falsePositiveDetails = resolveFalsePositiveGain({
    previousHistory: previousSovereigntyHistory,
    currentHistory: adaptiveSovereigntyHistory,
    terminalAuthorityShift,
    currentFallbackConditions: stateResolution.adaptiveDecisionCore.core.fallbackConditions,
  })
  const visualState = mapCognitiveToVisualState(currentState, stateResolution.decision.intent, stateResolution.decision.action)
  const runtimePatch = buildBrandSoulVisualRuntimePatch({
    decision: stateResolution.decision,
    visualState,
    currentState,
  })
  const responseWithMemoryPersistence = await resolveBrandSoulResponseWithMemoryPersistence({
    context,
    userMessage,
    memoryWriter: resolvedMemoryWriter,
    orchestrationContext: {
      interactionLabel: 'public-presence-local',
    },
  })

  return {
    responseText: renderPublicPresenceResponseText(presence.entity.name, stateResolution.decision),
    nextState: {
      ...currentState,
      ...stateResolution.decision.statePatch,
      lastUpdatedAt: now,
    },
    nextCognitiveState: stateResolution.nextCognitiveState,
    nextHistoricalSignals: stateResolution.nextHistoricalSignals,
    nextAdaptiveDecisionProfile: stateResolution.nextAdaptiveDecisionProfile,
    nextPolicyProfile: stateResolution.nextPolicyProfile,
    nextStrategyProfile: stateResolution.nextStrategyProfile,
    indicator: deriveCognitivePresenceIndicator({
      decision: stateResolution.decision,
      visualState,
    }),
    debug: {
      currentState,
      currentCognitiveState: resolvedCognitiveState,
      currentHistoricalSignals: historicalSignals ?? stateResolution.nextHistoricalSignals,
      adaptiveDecisionCore: stateResolution.adaptiveDecisionCore,
      previousTerminalAuthority,
      terminalAuthorityShift,
      authorityRegimeCorrelation,
      correlationType,
      structuralTransitionQuality,
      structuralTransitionDirection,
      structuralTransitionStability,
      structuralTransitionMaturity,
      falsePositiveGain: falsePositiveDetails.falsePositiveGain,
      falsePositiveCause: falsePositiveDetails.falsePositiveCause,
      causeCategory: falsePositiveDetails.causeCategory,
      secondaryCauses: falsePositiveDetails.secondaryCauses,
      causeRanking: falsePositiveDetails.causeRanking,
      temporalCauseChain: falsePositiveDetails.temporalCauseChain,
      causeTimeline: falsePositiveDetails.causeTimeline,
      causeOriginTurn: falsePositiveDetails.causeOriginTurn,
      falsePositiveReason: falsePositiveDetails.falsePositiveReason,
      terminalAuthority,
      semanticFrozen,
      terminalReason,
      proposalEvidence,
      dominantEvidence: {
        signal: dominantEvidenceSignal,
        weight: dominantEvidenceWeight,
      },
      dominantReason: resolveDominantReason({
        decisionSource: stateResolution.adaptiveDecisionCore.decisionSource,
        fallbackConditions: stateResolution.adaptiveDecisionCore.core.fallbackConditions,
        dominantEvidence: dominantEvidenceSignal,
      }),
      confidenceArbitration: stateResolution.adaptiveDecisionCore.core.confidenceArbitration,
      adaptiveSovereigntyHistory,
      currentAdaptiveDecisionProfile: currentAdaptiveDecisionProfile ?? stateResolution.nextAdaptiveDecisionProfile,
      currentPolicyProfile: currentPolicyProfile ?? stateResolution.nextPolicyProfile,
      nextCognitiveState: stateResolution.nextCognitiveState,
      nextHistoricalSignals: stateResolution.nextHistoricalSignals,
      nextAdaptiveDecisionProfile: stateResolution.nextAdaptiveDecisionProfile,
      nextPolicyProfile: stateResolution.nextPolicyProfile,
      currentStrategyProfile: currentStrategyProfile ?? stateResolution.nextStrategyProfile,
      nextStrategyProfile: stateResolution.nextStrategyProfile,
      interactionOutcome,
      qualifiedInteractionOutcome: stateResolution.qualifiedInteractionOutcome,
      memoryPersistence: responseWithMemoryPersistence.memoryPersistence,
      localMemoryAudit: loadLocalMemoryAudit(resolvedMemoryWriter),
      decision: stateResolution.decision,
      visualState,
      runtimePatch,
    },
  }
}

export function resolveDegradedResponse(args?: {
  fallbackReason?: string
}) {
  return {
    responseText: 'Estou com uma instabilidade no momento. Pode tentar novamente?',
    source: 'frontend-operational-fallback' as const,
    fallbackReason: args?.fallbackReason ?? 'operational-fallback',
  }
}