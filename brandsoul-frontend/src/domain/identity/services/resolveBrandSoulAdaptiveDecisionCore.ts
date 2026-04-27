import type {
  BrandSoulAdaptiveCoreDecisionGenerator,
  BrandSoulAdaptiveCoreFallbackCondition,
  BrandSoulAdaptiveDecisionConfidenceArbitration,
  BrandSoulAdaptiveDecisionCoreResolution,
} from '../contracts/BrandSoulAdaptiveDecisionCore'
import type { BrandSoulAdaptiveDecisionProfile } from '../contracts/BrandSoulAdaptiveDecisionProfile'
import type { BrandSoulAdaptiveSemanticProposal } from '../contracts/BrandSoulAdaptiveSemanticProposal'
import type { BrandSoulCognitiveState } from '../contracts/BrandSoulCognitiveState'
import type { BrandSoulDecision, BrandSoulResponsePlan } from '../contracts/BrandSoulDecision'
import type { BrandSoulHistoricalSignals } from '../contracts/BrandSoulHistoricalSignals'
import type { BrandSoulPolicyProfile } from '../contracts/BrandSoulPolicyProfile'
import type { BrandSoulQualifiedInteractionOutcome } from '../contracts/BrandSoulQualifiedInteractionOutcome'
import type { BrandSoulStrategyProfile } from '../contracts/BrandSoulStrategyProfile'
import { applyAdaptiveDecisionToBaseDecision } from './applyAdaptiveDecisionToBaseDecision'
import { generateAdaptiveSemanticProposal } from './generateAdaptiveSemanticProposal'

const MIN_ADAPTIVE_PRIORITY = 0.34
const MIN_LEARNING_CONFIDENCE = 0.44

type LowRiskLaneIntent = 'greeting' | 'simple-inform' | 'acknowledgment' | 'light-follow-up'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function normalizeInput(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase()
    .trim()
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function hasMaterialAdaptiveShift(baseDecision: BrandSoulDecision, adaptiveDecision: BrandSoulDecision) {
  return (
    adaptiveDecision.intent !== baseDecision.intent ||
    adaptiveDecision.action !== baseDecision.action ||
    adaptiveDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle ||
    Math.abs(adaptiveDecision.confidence - baseDecision.confidence) >= 0.012
  )
}

function hasSameValues(left: string[] | undefined, right: string[] | undefined) {
  if (!left && !right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function resolveLowRiskLaneIntent(input: string, decision: BrandSoulDecision): LowRiskLaneIntent | null {
  if (decision.action !== 'inform') {
    return null
  }

  const normalizedInput = normalizeInput(input)
  if (!normalizedInput) {
    return null
  }

  const hasCommercialCue = includesAny(normalizedInput, [
    'promocao',
    'promo',
    'desconto',
    'oferta',
    'cupom',
    'comprar',
    'pedido',
    'levar',
    'fechar',
    'assinar',
    'produto',
    'produtos',
    'catalogo',
    'colecao',
  ])
  const hasAggressiveGuideCue = includesAny(normalizedInput, [
    'mostra',
    'mostrar',
    'opcao',
    'opcoes',
    'recomenda',
    'sugere',
    'quero ver',
  ])

  if (hasCommercialCue || hasAggressiveGuideCue) {
    return null
  }

  if (
    decision.intent === 'greeting' &&
    includesAny(normalizedInput, ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'])
  ) {
    return 'greeting'
  }

  if (
    decision.intent === 'general' &&
    includesAny(normalizedInput, ['ok', 'okay', 'certo', 'beleza', 'entendi', 'valeu', 'obrigado', 'obrigada'])
  ) {
    return 'acknowledgment'
  }

  if (
    decision.intent === 'general' &&
    includesAny(normalizedInput, ['como assim', 'mais detalhes', 'detalha', 'detalhar', 'explica isso', 'e isso', 'sobre isso', 'pode repetir'])
  ) {
    return 'light-follow-up'
  }

  if (decision.intent === 'general') {
    return 'simple-inform'
  }

  return null
}

function isLowRiskLane(input: string, decision: BrandSoulDecision) {
  return resolveLowRiskLaneIntent(input, decision) != null
}

function resolveAdaptivePromotionStrength(profile: BrandSoulAdaptiveDecisionProfile) {
  return clamp(
    profile.adaptationConfidence * 0.6 +
      profile.explorationVsExploitationBalance.exploitationBias * 0.2 +
      (1 - profile.decisionDrift) * 0.2,
  )
}

function resolveLowRiskAdaptiveStyleDecision(baseDecision: BrandSoulDecision, profile: BrandSoulAdaptiveDecisionProfile): BrandSoulDecision {
  if ((baseDecision.intent !== 'general' && baseDecision.intent !== 'greeting') || baseDecision.action !== 'inform') {
    return baseDecision
  }

  const styleBudget = clamp(
    profile.safetyProfile.maxStylePromotionBudget *
      resolveAdaptivePromotionStrength(profile) *
      (1 - profile.decisionDrift * 0.4),
    0,
    profile.safetyProfile.maxStylePromotionBudget,
  )

  if (styleBudget < 0.03 || (profile.actionSelectionBias.inform ?? 0) < 0.5) {
    return baseDecision
  }

  return {
    ...baseDecision,
    responsePlan: {
      ...baseDecision.responsePlan,
      optionalCloseStyle: 'contextual-clarity',
    },
  }
}

function canUseLowRiskAdaptiveLane(args: {
  userMessage: string
  baseDecision: BrandSoulDecision
  structuralAdaptiveDecision: BrandSoulDecision
  adaptiveDecision: BrandSoulDecision
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  semanticProposal: BrandSoulAdaptiveSemanticProposal
}) {
  const {
    userMessage,
    baseDecision,
    structuralAdaptiveDecision,
    adaptiveDecision,
    adaptiveDecisionProfile,
    semanticProposal,
  } = args

  if (adaptiveDecisionProfile.safetyProfile.killSwitchEnabled || semanticProposal.semanticZone === 'prohibited') {
    return false
  }

  if (!isLowRiskLane(userMessage, baseDecision)) {
    return false
  }

  if (
    structuralAdaptiveDecision.intent !== baseDecision.intent ||
    structuralAdaptiveDecision.action !== baseDecision.action
  ) {
    return false
  }

  if (adaptiveDecision.intent !== baseDecision.intent || adaptiveDecision.action !== baseDecision.action) {
    return false
  }

  if (
    adaptiveDecision.responsePlan.kind !== baseDecision.responsePlan.kind ||
    adaptiveDecision.responsePlan.topic !== baseDecision.responsePlan.topic ||
    adaptiveDecision.responsePlan.intentGoal !== baseDecision.responsePlan.intentGoal ||
    !hasSameValues(adaptiveDecision.responsePlan.requiredData, baseDecision.responsePlan.requiredData) ||
    !hasSameValues(adaptiveDecision.responsePlan.constraints, baseDecision.responsePlan.constraints)
  ) {
    return false
  }

  return adaptiveDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle
}

function sanitizeLowRiskAdaptiveDecision(baseDecision: BrandSoulDecision, adaptiveDecision: BrandSoulDecision): BrandSoulDecision {
  const optionalCloseStyle: BrandSoulResponsePlan['optionalCloseStyle'] = adaptiveDecision.responsePlan.optionalCloseStyle

  return {
    ...baseDecision,
    responsePlan: {
      ...baseDecision.responsePlan,
      optionalCloseStyle,
    },
    confidence: baseDecision.confidence,
  }
}

function applyAdaptiveSemanticProposal(
  baseDecision: BrandSoulDecision,
  semanticProposal: BrandSoulAdaptiveSemanticProposal,
): BrandSoulDecision {
  if (
    semanticProposal.fallbackRequired ||
    !semanticProposal.proposedIntent ||
    !semanticProposal.proposedAction ||
    !semanticProposal.proposedResponsePlanSkeleton
  ) {
    return baseDecision
  }

  const skeleton = semanticProposal.proposedResponsePlanSkeleton
  const optionalCloseStyle: BrandSoulResponsePlan['optionalCloseStyle'] = skeleton.optionalCloseStyle
  const responsePlan: BrandSoulResponsePlan = {
    kind: skeleton.kind,
    topic: skeleton.topic,
    intentGoal: skeleton.intentGoal,
    requiredData: baseDecision.responsePlan.requiredData,
    constraints: baseDecision.responsePlan.constraints,
    optionalCloseStyle,
  }

  return {
    ...baseDecision,
    intent: semanticProposal.proposedIntent,
    action: semanticProposal.proposedAction,
    responsePlan,
    confidence: clamp(Math.max(baseDecision.confidence, semanticProposal.proposalConfidence)),
  }
}

function resolveDecisionGenerators(baseDecision: BrandSoulDecision, adaptiveDecision: BrandSoulDecision): BrandSoulAdaptiveCoreDecisionGenerator[] {
  const generators: BrandSoulAdaptiveCoreDecisionGenerator[] = []

  if (adaptiveDecision.responsePlan.kind !== baseDecision.responsePlan.kind || adaptiveDecision.intent !== baseDecision.intent) {
    generators.push('semantic-proposal')
  }

  if (adaptiveDecision.intent !== baseDecision.intent) {
    generators.push('intent-generator')
  }

  if (adaptiveDecision.action !== baseDecision.action) {
    generators.push('action-generator')
  }

  if (adaptiveDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle) {
    generators.push('style-generator')
  }

  if (Math.abs(adaptiveDecision.confidence - baseDecision.confidence) >= 0.012) {
    generators.push('confidence-arbitration')
  }

  return generators
}

function resolveConfidenceArbitration(
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile,
  policyProfile: BrandSoulPolicyProfile,
): BrandSoulAdaptiveDecisionConfidenceArbitration {
  return {
    minimumHeuristicConfidenceBypass: adaptiveDecisionProfile.safetyProfile.criticalConfidenceThreshold,
    minimumLearningConfidence: MIN_LEARNING_CONFIDENCE,
    minimumAdaptivePriority: MIN_ADAPTIVE_PRIORITY,
    minimumReliableEvidence: Math.max(
      adaptiveDecisionProfile.safetyProfile.minimumEvidence,
      adaptiveDecisionProfile.confidenceScalingProfile.evidenceThreshold,
      policyProfile.confidenceAdjustmentProfile.evidenceThreshold,
    ),
  }
}

function resolveLearningConfidence(args: {
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  strategyProfile: BrandSoulStrategyProfile
  policyProfile: BrandSoulPolicyProfile
  historicalSignals: BrandSoulHistoricalSignals
  currentState: BrandSoulCognitiveState
  confidenceArbitration: BrandSoulAdaptiveDecisionConfidenceArbitration
}) {
  const {
    adaptiveDecisionProfile,
    strategyProfile,
    policyProfile,
    historicalSignals,
    currentState,
    confidenceArbitration,
  } = args
  const evidenceStrength = clamp(
    historicalSignals.reliableEvidenceCount / confidenceArbitration.minimumReliableEvidence,
  )

  return clamp(
    adaptiveDecisionProfile.adaptationConfidence * 0.34 +
      strategyProfile.adaptationConfidence * 0.16 +
      policyProfile.policyStability * 0.14 +
      evidenceStrength * 0.16 +
      historicalSignals.rollingSuccessRate * 0.08 +
      historicalSignals.rollingContinuationRate * 0.05 +
      currentState.adaptationMomentum * 0.09 +
      currentState.stability * 0.06 -
      adaptiveDecisionProfile.decisionDrift * 0.08,
  )
}

function resolveAdaptivePriority(args: {
  baseDecision: BrandSoulDecision
  adaptiveDecision: BrandSoulDecision
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  strategyProfile: BrandSoulStrategyProfile
  policyProfile: BrandSoulPolicyProfile
  historicalSignals: BrandSoulHistoricalSignals
  currentState: BrandSoulCognitiveState
  confidenceArbitration: BrandSoulAdaptiveDecisionConfidenceArbitration
}) {
  const {
    baseDecision,
    adaptiveDecision,
    adaptiveDecisionProfile,
    strategyProfile,
    policyProfile,
    historicalSignals,
    currentState,
    confidenceArbitration,
  } = args
  const evidenceStrength = clamp(
    historicalSignals.reliableEvidenceCount / confidenceArbitration.minimumReliableEvidence,
  )
  const structuralShiftScore =
    (adaptiveDecision.intent !== baseDecision.intent ? 0.38 : 0) +
    (adaptiveDecision.action !== baseDecision.action ? 0.28 : 0) +
    (adaptiveDecision.responsePlan.optionalCloseStyle !== baseDecision.responsePlan.optionalCloseStyle ? 0.12 : 0) +
    clamp(Math.abs(adaptiveDecision.confidence - baseDecision.confidence) / 0.12, 0, 0.12)

  return clamp(
    structuralShiftScore +
      adaptiveDecisionProfile.explorationVsExploitationBalance.exploitationBias * 0.08 +
      adaptiveDecisionProfile.adaptationConfidence * 0.12 +
      strategyProfile.adaptationConfidence * 0.06 +
      policyProfile.policyStability * 0.05 +
      evidenceStrength * 0.09 +
      currentState.adaptationMomentum * 0.05 -
      adaptiveDecisionProfile.decisionDrift * 0.08,
  )
}

function resolveFallbackConditions(args: {
  baseDecision: BrandSoulDecision
  adaptiveDecision: BrandSoulDecision
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  policyProfile: BrandSoulPolicyProfile
  historicalSignals: BrandSoulHistoricalSignals
  confidenceArbitration: BrandSoulAdaptiveDecisionConfidenceArbitration
  learningConfidence: number
  adaptivePriority: number
  semanticProposal: BrandSoulAdaptiveSemanticProposal
  lowRiskAdaptiveLaneActive: boolean
}) {
  const {
    baseDecision,
    adaptiveDecision,
    adaptiveDecisionProfile,
    policyProfile,
    historicalSignals,
    confidenceArbitration,
    learningConfidence,
    adaptivePriority,
    semanticProposal,
    lowRiskAdaptiveLaneActive,
  } = args
  const fallbackConditions: BrandSoulAdaptiveCoreFallbackCondition[] = []
  const hasStructuralShift =
    adaptiveDecision.intent !== baseDecision.intent || adaptiveDecision.action !== baseDecision.action

  if (baseDecision.intent === 'guardrail-blocked' || baseDecision.action === 'refuse') {
    fallbackConditions.push('guardrail-boundary')
  }

  if (adaptiveDecisionProfile.safetyProfile.killSwitchEnabled) {
    fallbackConditions.push('kill-switch')
  }

  if (!lowRiskAdaptiveLaneActive && semanticProposal.semanticZone !== 'safe') {
    fallbackConditions.push('unsafe-semantic-zone')
  }

  if (!lowRiskAdaptiveLaneActive && semanticProposal.fallbackRequired) {
    fallbackConditions.push('semantic-fallback-required')
  }

  if (baseDecision.confidence >= confidenceArbitration.minimumHeuristicConfidenceBypass) {
    fallbackConditions.push('critical-heuristic-confidence')
  }

  if (
    adaptiveDecisionProfile.safetyProfile.localRollbackEnabled &&
    adaptiveDecisionProfile.decisionDrift >= adaptiveDecisionProfile.safetyProfile.rollbackDriftThreshold &&
    policyProfile.policyDrift >= 0.18
  ) {
    fallbackConditions.push('excessive-drift')
  }

  if (hasStructuralShift && historicalSignals.reliableEvidenceCount < confidenceArbitration.minimumReliableEvidence) {
    fallbackConditions.push('insufficient-evidence')
  }

  if (!lowRiskAdaptiveLaneActive && learningConfidence < confidenceArbitration.minimumLearningConfidence) {
    fallbackConditions.push('insufficient-learning-confidence')
  }

  if (!lowRiskAdaptiveLaneActive && adaptivePriority < confidenceArbitration.minimumAdaptivePriority) {
    fallbackConditions.push('insufficient-adaptive-priority')
  }

  if (!hasMaterialAdaptiveShift(baseDecision, adaptiveDecision)) {
    fallbackConditions.push('no-material-adaptive-shift')
  }

  return fallbackConditions
}

export function resolveBrandSoulAdaptiveDecisionCore(args: {
  userMessage?: string
  baseDecision: BrandSoulDecision
  currentState: BrandSoulCognitiveState
  adaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile
  strategyProfile: BrandSoulStrategyProfile
  policyProfile: BrandSoulPolicyProfile
  historicalSignals: BrandSoulHistoricalSignals
  memorySignals: BrandSoulDecision['memoryInfluence']
  qualifiedOutcomeHistory?: BrandSoulQualifiedInteractionOutcome[]
}): BrandSoulAdaptiveDecisionCoreResolution {
  const {
    userMessage = '',
    baseDecision,
    currentState,
    adaptiveDecisionProfile,
    strategyProfile,
    policyProfile,
    historicalSignals,
    memorySignals,
    qualifiedOutcomeHistory = [],
  } = args
  const semanticProposal = generateAdaptiveSemanticProposal({
    memorySignals,
    cognitiveState: currentState,
    strategyProfile,
    policyProfile,
    adaptiveDecisionProfile,
    historicalSignals,
    qualifiedOutcomeHistory,
  })
  const semanticSeedDecision = applyAdaptiveSemanticProposal(baseDecision, semanticProposal)
  const structuralAdaptiveDecision: BrandSoulDecision = applyAdaptiveDecisionToBaseDecision(
    semanticSeedDecision,
    adaptiveDecisionProfile,
  )
  const lowRiskAdaptiveLaneDecision: BrandSoulDecision = resolveLowRiskAdaptiveStyleDecision(
    baseDecision,
    adaptiveDecisionProfile,
  )
  const lowRiskAdaptiveLaneActive = canUseLowRiskAdaptiveLane({
    userMessage,
    baseDecision,
    structuralAdaptiveDecision,
    adaptiveDecision: lowRiskAdaptiveLaneDecision,
    adaptiveDecisionProfile,
    semanticProposal,
  })
  const adaptiveDecision: BrandSoulDecision = lowRiskAdaptiveLaneActive
    ? sanitizeLowRiskAdaptiveDecision(baseDecision, lowRiskAdaptiveLaneDecision)
    : structuralAdaptiveDecision
  const confidenceArbitration = resolveConfidenceArbitration(adaptiveDecisionProfile, policyProfile)
  const learningConfidence = resolveLearningConfidence({
    adaptiveDecisionProfile,
    strategyProfile,
    policyProfile,
    historicalSignals,
    currentState,
    confidenceArbitration,
  })
  const adaptivePriority = resolveAdaptivePriority({
    baseDecision,
    adaptiveDecision,
    adaptiveDecisionProfile,
    strategyProfile,
    policyProfile,
    historicalSignals,
    currentState,
    confidenceArbitration,
  })
  const fallbackConditions = resolveFallbackConditions({
    baseDecision,
    adaptiveDecision,
    adaptiveDecisionProfile,
    policyProfile,
    historicalSignals,
    confidenceArbitration,
    learningConfidence,
    adaptivePriority,
    semanticProposal,
    lowRiskAdaptiveLaneActive,
  })

  return {
    decision: fallbackConditions.length === 0 ? adaptiveDecision : baseDecision,
    decisionSource: fallbackConditions.length === 0 ? 'adaptive-core' : 'heuristic-fallback',
    lowRiskLaneUsed: fallbackConditions.length === 0 && lowRiskAdaptiveLaneActive,
    semanticProposal,
    core: {
      decisionGenerators: resolveDecisionGenerators(baseDecision, adaptiveDecision),
      confidenceArbitration,
      fallbackConditions,
      adaptivePriority,
      learningConfidence,
    },
  }
}