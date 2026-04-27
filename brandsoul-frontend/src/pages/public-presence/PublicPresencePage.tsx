import type { PublicEntitySocialState } from '../../backend-bridge/api/publicSocialApi'
import type {
  PublicEntityDecisionDebugSummary,
  PublicEntityDecisionResponse,
} from '../../backend-bridge/contracts/PublicEntityDecisionResponse'
import type {
  BrandSoulAdaptiveCoreFallbackCondition,
  BrandSoulAdaptiveDecisionConfidenceArbitration,
  BrandSoulAdaptiveDecisionSource,
} from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionCore'
import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'
import type { BrandSoulAdaptiveDecisionProfile } from '../../domain/identity/contracts/BrandSoulAdaptiveDecisionProfile'
import type {
  BrandSoulAdaptiveSemanticProposalEvidence,
  BrandSoulAdaptiveSemanticZone,
} from '../../domain/identity/contracts/BrandSoulAdaptiveSemanticProposal'
import type {
  BrandSoulHistoricalSignalAggregate,
  BrandSoulHistoricalSignals,
} from '../../domain/identity/contracts/BrandSoulHistoricalSignals'
import type { BrandSoulPolicyProfile } from '../../domain/identity/contracts/BrandSoulPolicyProfile'
import type { BrandSoulVisualRuntimePatch } from '../../domain/rendering/contracts/BrandSoulVisualRuntimePatch'
import type {
  PublicPresenceAdaptiveSovereigntyTurn,
  PublicPresenceVisualDebug,
} from './brandSoulPresenceRuntime'
import type { PublicPresenceCognitiveIndicator } from './services/deriveCognitivePresenceIndicator'
import DynamicCTA from './DynamicCTA'
import LiveExportCard from './LiveExportCard'
import PresenceVisual from './PresenceVisual'
import RelationshipStateBanner from './RelationshipStateBanner'
import TrajectoryTimeline from './TrajectoryTimeline'

function formatBoolean(value: boolean) {
  return value ? 'sim' : 'nao'
}

function formatStrength(value?: number) {
  return typeof value === 'number' ? value.toFixed(2) : '0.00'
}

function formatSignalValue(value: boolean | number) {
  return typeof value === 'boolean' ? formatBoolean(value) : value.toFixed(2)
}

function formatDelta(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function formatModeShift(before: string, after: string) {
  return before === after ? after : `${before} -> ${after}`
}

const STRATEGY_CONFIDENCE_MATERIAL_DELTA = 0.06
const STRATEGY_BIAS_MATERIAL_DELTA = 0.08
const POLICY_MATERIAL_DELTA = 0.015
const POLICY_MAX_VISIBLE_CHANGES = 4
const ADAPTIVE_MATERIAL_DELTA = 0.015
const ADAPTIVE_MAX_VISIBLE_CHANGES = 4
const HISTORICAL_RATE_MATERIAL_DELTA = 0.015
const HISTORICAL_COUNT_MATERIAL_DELTA = 1
const HISTORICAL_MAX_VISIBLE_CHANGES = 4

type NumericPolicyChange = {
  label: string
  before: number
  after: number
  delta: number
  direction: 'gain' | 'loss'
}

function isMaterialNumericChange(before: number, after: number, threshold: number) {
  return Math.abs(after - before) >= threshold
}

function buildNumericPolicyChange(label: string, before: number, after: number): NumericPolicyChange {
  return {
    label,
    before,
    after,
    delta: after - before,
    direction: resolveDirectionalChange(before, after),
  }
}

function resolveNumericPolicyChanges(
  before: Partial<Record<string, number>>,
  after: Partial<Record<string, number>>,
) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort().map((key) =>
    buildNumericPolicyChange(key, before[key] ?? 0, after[key] ?? 0),
  )
}

function resolveMaterialPolicyChanges(changes: NumericPolicyChange[], threshold = POLICY_MATERIAL_DELTA) {
  return changes.filter((change) => isMaterialNumericChange(change.before, change.after, threshold))
}

function flattenActionPreferenceMatrix(matrix: BrandSoulPolicyProfile['actionPreferenceMatrix']) {
  return Object.entries(matrix).reduce<Record<string, number>>((accumulator, [intent, actions]) => {
    for (const [action, value] of Object.entries(actions ?? {})) {
      accumulator[`${intent}.${action}`] = value
    }

    return accumulator
  }, {})
}

function formatPolicyChange(change: NumericPolicyChange) {
  return `${formatStrength(change.before)} -> ${formatStrength(change.after)} · ${formatDelta(change.delta)}`
}

function resolveHistoricalThreshold(label: string) {
  return label === 'totalInteractions' ||
    label === 'reliableEvidenceCount' ||
    label.endsWith('.sampleSize')
    ? HISTORICAL_COUNT_MATERIAL_DELTA
    : HISTORICAL_RATE_MATERIAL_DELTA
}

function resolveMaterialHistoricalChanges(changes: NumericPolicyChange[]) {
  return changes.filter((change) => isMaterialNumericChange(change.before, change.after, resolveHistoricalThreshold(change.label)))
}

function flattenHistoricalSignalAggregates(
  aggregates: Partial<Record<string, BrandSoulHistoricalSignalAggregate>>,
) {
  return Object.entries(aggregates).reduce<Record<string, number>>((accumulator, [key, aggregate]) => {
    if (aggregate == null) {
      return accumulator
    }

    accumulator[`${key}.sampleSize`] = aggregate.sampleSize
    accumulator[`${key}.successRate`] = aggregate.successRate
    accumulator[`${key}.continuationRate`] = aggregate.continuationRate
    accumulator[`${key}.averageEngagementDelta`] = aggregate.averageEngagementDelta

    return accumulator
  }, {})
}

function resolveHistoricalComparison(
  currentHistoricalSignals: BrandSoulHistoricalSignals,
  nextHistoricalSignals: BrandSoulHistoricalSignals,
) {
  const coreChanges = [
    buildNumericPolicyChange(
      'totalInteractions',
      currentHistoricalSignals.totalInteractions,
      nextHistoricalSignals.totalInteractions,
    ),
    buildNumericPolicyChange(
      'reliableEvidenceCount',
      currentHistoricalSignals.reliableEvidenceCount,
      nextHistoricalSignals.reliableEvidenceCount,
    ),
    buildNumericPolicyChange(
      'rollingSuccessRate',
      currentHistoricalSignals.rollingSuccessRate,
      nextHistoricalSignals.rollingSuccessRate,
    ),
    buildNumericPolicyChange(
      'rollingContinuationRate',
      currentHistoricalSignals.rollingContinuationRate,
      nextHistoricalSignals.rollingContinuationRate,
    ),
    buildNumericPolicyChange(
      'rollingEngagementDelta',
      currentHistoricalSignals.rollingEngagementDelta,
      nextHistoricalSignals.rollingEngagementDelta,
    ),
  ]
  const actionOutcomeChanges = resolveMaterialHistoricalChanges(
    resolveNumericPolicyChanges(
      flattenHistoricalSignalAggregates(currentHistoricalSignals.actionOutcomes),
      flattenHistoricalSignalAggregates(nextHistoricalSignals.actionOutcomes),
    ),
  )
  const intentOutcomeChanges = resolveMaterialHistoricalChanges(
    resolveNumericPolicyChanges(
      flattenHistoricalSignalAggregates(currentHistoricalSignals.intentOutcomes),
      flattenHistoricalSignalAggregates(nextHistoricalSignals.intentOutcomes),
    ),
  )
  const materialCoreChanges = resolveMaterialHistoricalChanges(coreChanges)

  return {
    coreChanges,
    materialCoreChanges,
    actionOutcomeChanges,
    intentOutcomeChanges,
    materialDimensions: [
      materialCoreChanges.some((change) => change.label === 'totalInteractions' || change.label === 'reliableEvidenceCount')
        ? 'evidenceVolume'
        : null,
      materialCoreChanges.some(
        (change) => change.label === 'rollingSuccessRate' || change.label === 'rollingContinuationRate' || change.label === 'rollingEngagementDelta',
      )
        ? 'rollingSignals'
        : null,
      actionOutcomeChanges.length > 0 ? 'actionOutcomes' : null,
      intentOutcomeChanges.length > 0 ? 'intentOutcomes' : null,
    ].filter((value): value is string => value !== null),
  }
}

function flattenConfidenceScalingProfile(profile: BrandSoulAdaptiveDecisionProfile['confidenceScalingProfile']) {
  return {
    baseScale: profile.baseScale,
    minScale: profile.minScale,
    maxScale: profile.maxScale,
    evidenceThreshold: profile.evidenceThreshold,
  }
}

function resolveAdaptiveComparison(
  currentAdaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile,
  nextAdaptiveDecisionProfile: BrandSoulAdaptiveDecisionProfile,
) {
  const intentSelectionChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      currentAdaptiveDecisionProfile.intentSelectionWeights,
      nextAdaptiveDecisionProfile.intentSelectionWeights,
    ),
    ADAPTIVE_MATERIAL_DELTA,
  )
  const actionSelectionChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      currentAdaptiveDecisionProfile.actionSelectionBias,
      nextAdaptiveDecisionProfile.actionSelectionBias,
    ),
    ADAPTIVE_MATERIAL_DELTA,
  )
  const confidenceScalingCoreChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      flattenConfidenceScalingProfile(currentAdaptiveDecisionProfile.confidenceScalingProfile),
      flattenConfidenceScalingProfile(nextAdaptiveDecisionProfile.confidenceScalingProfile),
    ),
    ADAPTIVE_MATERIAL_DELTA,
  )
  const confidenceIntentScaleChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      currentAdaptiveDecisionProfile.confidenceScalingProfile.intentScales,
      nextAdaptiveDecisionProfile.confidenceScalingProfile.intentScales,
    ),
    ADAPTIVE_MATERIAL_DELTA,
  )
  const confidenceActionScaleChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      currentAdaptiveDecisionProfile.confidenceScalingProfile.actionScales,
      nextAdaptiveDecisionProfile.confidenceScalingProfile.actionScales,
    ),
    ADAPTIVE_MATERIAL_DELTA,
  )
  const explorationVsExploitationChanges = [
    buildNumericPolicyChange(
      'explorationBias',
      currentAdaptiveDecisionProfile.explorationVsExploitationBalance.explorationBias,
      nextAdaptiveDecisionProfile.explorationVsExploitationBalance.explorationBias,
    ),
    buildNumericPolicyChange(
      'exploitationBias',
      currentAdaptiveDecisionProfile.explorationVsExploitationBalance.exploitationBias,
      nextAdaptiveDecisionProfile.explorationVsExploitationBalance.exploitationBias,
    ),
  ]
  const adaptationConfidenceChanged = isMaterialNumericChange(
    currentAdaptiveDecisionProfile.adaptationConfidence,
    nextAdaptiveDecisionProfile.adaptationConfidence,
    ADAPTIVE_MATERIAL_DELTA,
  )
  const decisionDriftChanged = isMaterialNumericChange(
    currentAdaptiveDecisionProfile.decisionDrift,
    nextAdaptiveDecisionProfile.decisionDrift,
    ADAPTIVE_MATERIAL_DELTA,
  )

  return {
    intentSelectionChanges,
    actionSelectionChanges,
    confidenceScalingCoreChanges,
    confidenceIntentScaleChanges,
    confidenceActionScaleChanges,
    explorationVsExploitationChanges,
    explorationVsExploitationChanged: resolveMaterialPolicyChanges(explorationVsExploitationChanges, ADAPTIVE_MATERIAL_DELTA).length > 0,
    adaptationConfidenceChanged,
    decisionDriftChanged,
    confidenceScalingChanged:
      confidenceScalingCoreChanges.length > 0 ||
      confidenceIntentScaleChanges.length > 0 ||
      confidenceActionScaleChanges.length > 0,
    materialDimensions: [
      intentSelectionChanges.length > 0 ? 'intentSelectionWeights' : null,
      actionSelectionChanges.length > 0 ? 'actionSelectionBias' : null,
      confidenceScalingCoreChanges.length > 0 || confidenceIntentScaleChanges.length > 0 || confidenceActionScaleChanges.length > 0
        ? 'confidenceScalingProfile'
        : null,
      resolveMaterialPolicyChanges(explorationVsExploitationChanges, ADAPTIVE_MATERIAL_DELTA).length > 0 ? 'explorationVsExploitationBalance' : null,
      adaptationConfidenceChanged ? 'adaptationConfidence' : null,
      decisionDriftChanged ? 'decisionDrift' : null,
    ].filter((value): value is string => value !== null),
  }
}

function resolvePolicyComparison(currentPolicyProfile: BrandSoulPolicyProfile, nextPolicyProfile: BrandSoulPolicyProfile) {
  const decisionWeightChanges = [
    buildNumericPolicyChange(
      'intentShiftWeight',
      currentPolicyProfile.decisionWeights.intentShiftWeight,
      nextPolicyProfile.decisionWeights.intentShiftWeight,
    ),
    buildNumericPolicyChange(
      'actionShiftWeight',
      currentPolicyProfile.decisionWeights.actionShiftWeight,
      nextPolicyProfile.decisionWeights.actionShiftWeight,
    ),
    buildNumericPolicyChange(
      'confidenceWeight',
      currentPolicyProfile.decisionWeights.confidenceWeight,
      nextPolicyProfile.decisionWeights.confidenceWeight,
    ),
    buildNumericPolicyChange(
      'memoryWeight',
      currentPolicyProfile.decisionWeights.memoryWeight,
      nextPolicyProfile.decisionWeights.memoryWeight,
    ),
  ]
  const intentPriorityChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(currentPolicyProfile.intentPriorityOverrides, nextPolicyProfile.intentPriorityOverrides),
  )
  const actionPreferenceChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      flattenActionPreferenceMatrix(currentPolicyProfile.actionPreferenceMatrix),
      flattenActionPreferenceMatrix(nextPolicyProfile.actionPreferenceMatrix),
    ),
  )
  const confidenceCoreChanges = [
    buildNumericPolicyChange(
      'baseAdjustment',
      currentPolicyProfile.confidenceAdjustmentProfile.baseAdjustment,
      nextPolicyProfile.confidenceAdjustmentProfile.baseAdjustment,
    ),
    buildNumericPolicyChange(
      'maxAdjustment',
      currentPolicyProfile.confidenceAdjustmentProfile.maxAdjustment,
      nextPolicyProfile.confidenceAdjustmentProfile.maxAdjustment,
    ),
    buildNumericPolicyChange(
      'evidenceThreshold',
      currentPolicyProfile.confidenceAdjustmentProfile.evidenceThreshold,
      nextPolicyProfile.confidenceAdjustmentProfile.evidenceThreshold,
    ),
    buildNumericPolicyChange(
      'decayFactor',
      currentPolicyProfile.confidenceAdjustmentProfile.decayFactor,
      nextPolicyProfile.confidenceAdjustmentProfile.decayFactor,
    ),
  ]
  const confidenceIntentAdjustmentChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      currentPolicyProfile.confidenceAdjustmentProfile.intentAdjustments,
      nextPolicyProfile.confidenceAdjustmentProfile.intentAdjustments,
    ),
  )
  const confidenceActionAdjustmentChanges = resolveMaterialPolicyChanges(
    resolveNumericPolicyChanges(
      currentPolicyProfile.confidenceAdjustmentProfile.actionAdjustments,
      nextPolicyProfile.confidenceAdjustmentProfile.actionAdjustments,
    ),
  )
  const policyStabilityChanged = isMaterialNumericChange(
    currentPolicyProfile.policyStability,
    nextPolicyProfile.policyStability,
    POLICY_MATERIAL_DELTA,
  )
  const policyDriftChanged = isMaterialNumericChange(
    currentPolicyProfile.policyDrift,
    nextPolicyProfile.policyDrift,
    POLICY_MATERIAL_DELTA,
  )

  return {
    decisionWeightChanges,
    decisionWeightsChanged: resolveMaterialPolicyChanges(decisionWeightChanges).length > 0,
    intentPriorityChanges,
    actionPreferenceChanges,
    confidenceCoreChanges,
    confidenceIntentAdjustmentChanges,
    confidenceActionAdjustmentChanges,
    confidenceProfileChanged:
      resolveMaterialPolicyChanges(confidenceCoreChanges).length > 0 ||
      confidenceIntentAdjustmentChanges.length > 0 ||
      confidenceActionAdjustmentChanges.length > 0,
    policyStabilityChanged,
    policyDriftChanged,
    materialDimensions: [
      resolveMaterialPolicyChanges(decisionWeightChanges).length > 0 ? 'decisionWeights' : null,
      intentPriorityChanges.length > 0 ? 'intentPriorityOverrides' : null,
      actionPreferenceChanges.length > 0 ? 'actionPreferenceMatrix' : null,
      resolveMaterialPolicyChanges(confidenceCoreChanges).length > 0 ||
      confidenceIntentAdjustmentChanges.length > 0 ||
      confidenceActionAdjustmentChanges.length > 0
        ? 'confidenceAdjustmentProfile'
        : null,
      policyStabilityChanged ? 'policyStability' : null,
      policyDriftChanged ? 'policyDrift' : null,
    ].filter((value): value is string => value !== null),
  }
}

function resolveDebugCardClassName(isMaterial: boolean, span = false) {
  return [
    'entity-public-debug-card',
    span ? 'entity-public-debug-card--state-span' : '',
    isMaterial ? 'entity-public-debug-card--material' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function resolveDirectionBadgeClassName(direction?: 'gain' | 'loss' | 'shift') {
  return [
    'entity-public-debug-direction-badge',
    direction ? `entity-public-debug-direction-badge--${direction}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function resolveDirectionalChange(before: number, after: number): 'gain' | 'loss' {
  return after >= before ? 'gain' : 'loss'
}

function renderDirectionBadge(direction: 'gain' | 'loss' | 'shift', label: string) {
  return <span className={resolveDirectionBadgeClassName(direction)}>{label}</span>
}

function resolveDecisionSourceLabel(decisionSource: BrandSoulAdaptiveDecisionSource) {
  return decisionSource === 'adaptive-core' ? 'adaptive-core' : 'heuristic-fallback'
}

function resolveSemanticZoneLabel(semanticZone: BrandSoulAdaptiveSemanticZone) {
  if (semanticZone === 'safe') {
    return 'safe'
  }

  if (semanticZone === 'critical') {
    return 'critical'
  }

  return 'prohibited'
}

function resolveSemanticZoneBadgeClassName(semanticZone: BrandSoulAdaptiveSemanticZone) {
  return [
    'entity-public-debug-direction-badge',
    `entity-public-debug-direction-badge--semantic-${semanticZone}`,
  ].join(' ')
}

function resolveFallbackConditionLabel(fallbackCondition: BrandSoulAdaptiveCoreFallbackCondition) {
  return fallbackCondition
}

function resolvePrimaryAdaptiveReasonLabel(
  fallbackConditions: BrandSoulAdaptiveCoreFallbackCondition[],
  decisionSource: BrandSoulAdaptiveDecisionSource,
) {
  return fallbackConditions[0] ?? (decisionSource === 'adaptive-core' ? 'accepted-by-arbitration' : 'heuristic-fallback')
}

function resolveProposalEvidenceLabel(signal: keyof BrandSoulAdaptiveSemanticProposalEvidence) {
  switch (signal) {
    case 'memoryStrength':
      return 'memory'
    case 'historicalReliability':
      return 'history'
    case 'strategyAlignment':
      return 'strategy'
    case 'policyStability':
      return 'policy'
    case 'adaptiveReadiness':
      return 'readiness'
    case 'recentOutcomeWeight':
      return 'recent outcome'
    default:
      return signal
  }
}

function resolveAdaptiveExplanationTone(decisionSource: BrandSoulAdaptiveDecisionSource) {
  return decisionSource === 'adaptive-core' ? 'promoted' : 'fallback'
}

function resolveConfidenceArbitrationSummary(
  confidenceArbitration: BrandSoulAdaptiveDecisionConfidenceArbitration,
) {
  return [
    `heuristic bypass ${formatStrength(confidenceArbitration.minimumHeuristicConfidenceBypass)}`,
    `learning ${formatStrength(confidenceArbitration.minimumLearningConfidence)}`,
    `priority ${formatStrength(confidenceArbitration.minimumAdaptivePriority)}`,
    `evidence ${formatStrength(confidenceArbitration.minimumReliableEvidence)}`,
  ].join(' · ')
}

function resolveDecisionSourceCompactLabel(decisionSource: BrandSoulAdaptiveDecisionSource) {
  return decisionSource === 'adaptive-core' ? 'adaptive' : 'fallback'
}

function resolveTerminalAuthorityLabel(decisionSource: BrandSoulAdaptiveDecisionSource) {
  return decisionSource === 'adaptive-core' ? 'adaptive-core terminal' : 'heuristic-fallback terminal'
}

function resolveSemanticFrozenLabel(value: boolean) {
  return value ? 'frozen' : 'open'
}

function resolveSemanticFrozenTone(value: boolean) {
  return value ? 'gain' : 'shift'
}

function formatMissingLegalField(field: 'descricao' | 'cidade' | 'contato') {
  if (field === 'cidade') {
    return 'cidade'
  }

  if (field === 'contato') {
    return 'contato'
  }

  return 'descricao do caso'
}

function resolveTerminalAuthorityShiftLabel(
  shift: PublicPresenceVisualDebug['terminalAuthorityShift'],
) {
  switch (shift) {
    case 'heuristic-fallback -> adaptive-core':
      return 'heuristic-fallback -> adaptive-core'
    case 'adaptive-core -> heuristic-fallback':
      return 'adaptive-core -> heuristic-fallback'
    case 'no-change':
      return 'sem mudanca'
    default:
      return 'turno inicial'
  }
}

function resolveTerminalAuthorityShiftTone(
  shift: PublicPresenceVisualDebug['terminalAuthorityShift'],
) {
  if (shift === 'heuristic-fallback -> adaptive-core') {
    return 'gain' satisfies 'gain' | 'loss' | 'shift'
  }

  if (shift === 'adaptive-core -> heuristic-fallback') {
    return 'loss' satisfies 'gain' | 'loss' | 'shift'
  }

  return 'shift' satisfies 'gain' | 'loss' | 'shift'
}

function resolveAuthorityRegimeCorrelationLabel(
  correlationType: PublicPresenceVisualDebug['correlationType'],
) {
  if (correlationType === 'structural-transition') {
    return 'transicao estrutural'
  }

  if (correlationType === 'isolated-shift') {
    return 'shift isolado'
  }

  return 'sem correlacao estrutural'
}

function resolveAuthorityRegimeCorrelationTone(args: {
  correlationType: PublicPresenceVisualDebug['correlationType']
  terminalAuthority: BrandSoulAdaptiveDecisionSource
}) {
  const { correlationType, terminalAuthority } = args

  if (correlationType === 'structural-transition') {
    return (terminalAuthority === 'adaptive-core' ? 'gain' : 'loss') satisfies 'gain' | 'loss' | 'shift'
  }

  return 'shift' satisfies 'gain' | 'loss' | 'shift'
}

function resolveStructuralTransitionDirectionLabel(
  direction: PublicPresenceVisualDebug['structuralTransitionDirection'],
) {
  if (direction === 'quality-up') {
    return 'quality up'
  }

  if (direction === 'quality-down') {
    return 'quality down'
  }

  return 'neutral'
}

function resolveStructuralTransitionDirectionTone(
  direction: PublicPresenceVisualDebug['structuralTransitionDirection'],
) {
  if (direction === 'quality-up') {
    return 'gain' satisfies 'gain' | 'loss' | 'shift'
  }

  if (direction === 'quality-down') {
    return 'loss' satisfies 'gain' | 'loss' | 'shift'
  }

  return 'shift' satisfies 'gain' | 'loss' | 'shift'
}

function resolveStructuralTransitionMaturityLabel(
  maturity: PublicPresenceVisualDebug['structuralTransitionMaturity'],
) {
  if (maturity === 'consolidated-gain') {
    return 'consolidated gain'
  }

  if (maturity === 'transient-gain') {
    return 'transient gain'
  }

  if (maturity === 'regressive') {
    return 'regressive'
  }

  return 'neutral'
}

function resolveStructuralTransitionMaturityTone(
  maturity: PublicPresenceVisualDebug['structuralTransitionMaturity'],
) {
  if (maturity === 'consolidated-gain') {
    return 'gain' satisfies 'gain' | 'loss' | 'shift'
  }

  if (maturity === 'transient-gain') {
    return 'shift' satisfies 'gain' | 'loss' | 'shift'
  }

  if (maturity === 'regressive') {
    return 'loss' satisfies 'gain' | 'loss' | 'shift'
  }

  return 'shift' satisfies 'gain' | 'loss' | 'shift'
}

function resolveFalsePositiveGainLabel(value: boolean) {
  return value ? 'false positive gain' : 'stable reading'
}

function resolveFalsePositiveGainTone(value: boolean) {
  return value ? 'loss' satisfies 'gain' | 'loss' | 'shift' : 'shift' satisfies 'gain' | 'loss' | 'shift'
}

function resolveFalsePositiveCauseCategoryLabel(
  category: PublicPresenceVisualDebug['causeCategory'],
) {
  switch (category) {
    case 'semantic-reversal':
      return 'semantic-reversal'
    case 'safe-zone-loss':
      return 'safe-zone-loss'
    case 'authority-reversal':
      return 'authority-reversal'
    case 'consistency-drop':
      return 'consistency-drop'
    default:
      return 'n/a'
  }
}

function resolveCauseRankingLabel(entry: PublicPresenceVisualDebug['causeRanking'][number]) {
  return `${resolveFalsePositiveCauseCategoryLabel(entry.category)} · ${entry.cause}`
}

function resolveTemporalCauseRoleLabel(role: PublicPresenceVisualDebug['causeTimeline'][number]['role']) {
  return role === 'root-cause' ? 'root-cause' : 'derived-causes'
}

function resolveTemporalCauseClassificationLabel(
  classification: NonNullable<PublicPresenceVisualDebug['temporalCauseChain']>['classification'] | undefined,
) {
  if (classification === 'simultaneous-causes') {
    return 'simultaneous-causes'
  }

  if (classification === 'sequential-causes') {
    return 'sequential-causes'
  }

  return 'n/a'
}

function resolveTemporalCauseTimelineLabel(entry: PublicPresenceVisualDebug['causeTimeline'][number]) {
  return `${entry.turn} · ${resolveTemporalCauseRoleLabel(entry.role)} · ${resolveFalsePositiveCauseCategoryLabel(entry.category)}`
}

function resolveAdaptiveSovereigntyLine(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  return history.map((turn) => resolveDecisionSourceCompactLabel(turn.decisionSource)).join(' -> ')
}

function resolveAdaptiveZoneLine(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  return history.map((turn) => turn.semanticZone).join(' -> ')
}

function resolveAdaptiveSovereigntyStability(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  const recentTurns = history.slice(-3)

  if (recentTurns.length < 3) {
    return 'forming'
  }

  if (recentTurns.every((turn) => turn.decisionSource === 'adaptive-core')) {
    return 'adaptive stabilizing'
  }

  if (recentTurns.every((turn) => turn.decisionSource === 'heuristic-fallback')) {
    return 'fallback stable'
  }

  return 'transitioning'
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
    ? 'safe-consolidated'
    : 'mixed-zone'
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

function resolveAdaptiveStabilizationTone(
  stabilizationQuality: ReturnType<typeof resolveAdaptiveStabilizationQuality>,
) {
  if (stabilizationQuality === 'safe-consolidated') {
    return 'gain' satisfies 'gain' | 'loss' | 'shift'
  }

  if (stabilizationQuality === 'mixed-zone') {
    return 'shift' satisfies 'gain' | 'loss' | 'shift'
  }

  return undefined
}

function resolveAdaptiveStabilizationClassName(tone: 'gain' | 'loss' | 'shift') {
  return [
    'entity-public-debug-stabilization-state',
    `entity-public-debug-stabilization-state--${tone}`,
  ].join(' ')
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

function resolveAdaptiveDegradationLabel(args: {
  previousRegime: ReturnType<typeof resolveAdaptiveSovereigntyStability>
  previousQuality: ReturnType<typeof resolveAdaptiveStabilizationQuality>
  currentRegime: ReturnType<typeof resolveAdaptiveSovereigntyStability>
  currentQuality: ReturnType<typeof resolveAdaptiveStabilizationQuality>
}) {
  const { previousRegime, previousQuality, currentRegime, currentQuality } = args

  if (
    previousRegime === 'adaptive stabilizing' &&
    currentRegime === 'adaptive stabilizing' &&
    previousQuality != null &&
    currentQuality != null &&
    previousQuality !== currentQuality
  ) {
    return `${resolveAdaptiveStabilizationLabel(previousQuality)} -> ${resolveAdaptiveStabilizationLabel(currentQuality)}`
  }

  if (previousRegime === 'adaptive stabilizing' && previousQuality != null) {
    return `${resolveAdaptiveStabilizationLabel(previousQuality)} -> ${currentRegime}`
  }

  return `${previousRegime} -> ${currentRegime}`
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

function resolveAdaptiveDegradation(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  if (history.length < 4) {
    return undefined
  }

  const previousHistory = history.slice(0, -1)
  const previousRegime = resolveAdaptiveSovereigntyStability(previousHistory)
  const previousQuality = resolveAdaptiveStabilizationQuality(previousHistory)
  const currentRegime = resolveAdaptiveSovereigntyStability(history)
  const currentQuality = resolveAdaptiveStabilizationQuality(history)
  const previousStrength = resolveAdaptiveSovereigntyStrength({
    regime: previousRegime,
    quality: previousQuality,
  })
  const currentStrength = resolveAdaptiveSovereigntyStrength({
    regime: currentRegime,
    quality: currentQuality,
  })

  if (previousStrength < 3 || currentStrength >= previousStrength) {
    return undefined
  }

  return {
    label: resolveAdaptiveDegradationLabel({
      previousRegime,
      previousQuality,
      currentRegime,
      currentQuality,
    }),
    previousRegime,
    currentRegime,
  }
}

function resolveAdaptiveDegradationPersistence(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  if (history.length < 4) {
    return undefined
  }

  const snapshots = history.map((_, index) => buildAdaptiveSovereigntySnapshot(history.slice(0, index + 1))).filter((_, index) => index >= 2)

  if (snapshots.length < 2) {
    return undefined
  }

  const currentSnapshot = snapshots.at(-1)

  if (!currentSnapshot) {
    return undefined
  }

  const previousSnapshots = snapshots.slice(0, -1)
  const peakStrength = Math.max(...previousSnapshots.map((snapshot) => snapshot.strength))

  if (peakStrength < 3 || currentSnapshot.strength >= peakStrength) {
    return undefined
  }

  const baselineSnapshot = [...previousSnapshots].reverse().find((snapshot) => snapshot.strength === peakStrength) ?? previousSnapshots.at(-1)

  if (!baselineSnapshot) {
    return undefined
  }

  let consecutiveDegradedWindows = 0

  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index]!.strength < peakStrength) {
      consecutiveDegradedWindows += 1
      continue
    }

    break
  }

  return {
    kind: consecutiveDegradedWindows >= 2 ? 'persistent' : 'short',
    tone: (consecutiveDegradedWindows >= 2 ? 'loss' : 'shift') as 'gain' | 'loss' | 'shift',
    label: `${baselineSnapshot.label} -> ${currentSnapshot.label}`,
  }
}

function resolveAdaptiveRegimeShiftTone(regime: ReturnType<typeof resolveAdaptiveSovereigntyStability>) {
  if (regime === 'adaptive stabilizing') {
    return 'gain' satisfies 'gain' | 'loss' | 'shift'
  }

  if (regime === 'fallback stable') {
    return 'loss' satisfies 'gain' | 'loss' | 'shift'
  }

  return 'shift' satisfies 'gain' | 'loss' | 'shift'
}

function resolveAdaptiveRegimeShift(history: PublicPresenceAdaptiveSovereigntyTurn[]) {
  if (history.length < 2) {
    return undefined
  }

  const currentRegime = resolveAdaptiveSovereigntyStability(history)
  const previousRegime = resolveAdaptiveSovereigntyStability(history.slice(0, -1))

  if (currentRegime === previousRegime) {
    return undefined
  }

  return {
    from: previousRegime,
    to: currentRegime,
    tone: resolveAdaptiveRegimeShiftTone(currentRegime) as 'gain' | 'loss' | 'shift',
  }
}

function resolveAdaptiveRegimeShiftClassName(tone: 'gain' | 'loss' | 'shift') {
  return [
    'entity-public-debug-regime-shift',
    `entity-public-debug-regime-shift--${tone}`,
  ].join(' ')
}

type PublicPresencePageProps = {
  presence: PublicPresenceResponse
  socialState?: PublicEntitySocialState
  isAuthenticated: boolean
  shareState: 'idle' | 'copied' | 'shared'
  actionError?: string
  message: string
  response?: string
  cognitiveIndicator?: PublicPresenceCognitiveIndicator
  visualRuntimePatch?: BrandSoulVisualRuntimePatch
  visualDebug?: PublicPresenceVisualDebug
  officialDecisionDebugSummary?: PublicEntityDecisionDebugSummary
  operationalFallbackReason?: string
  legalCaseState?: PublicEntityDecisionResponse['actionResult']
  showVisualDebug?: boolean
  onMessageChange: (value: string) => void
  onSendMessage: () => void
  onFollow: () => void
  onShare: () => void
}

export function PublicPresencePage({
  presence,
  socialState,
  isAuthenticated,
  shareState,
  actionError,
  message,
  response,
  cognitiveIndicator,
  visualRuntimePatch,
  visualDebug,
  officialDecisionDebugSummary,
  operationalFallbackReason,
  legalCaseState,
  showVisualDebug,
  onMessageChange,
  onSendMessage,
  onFollow,
  onShare,
}: PublicPresencePageProps) {
  const adaptiveDecisionCore = visualDebug?.adaptiveDecisionCore
  const proposalEvidence = visualDebug?.proposalEvidence
  const dominantEvidence = visualDebug?.dominantEvidence
  const dominantReason = visualDebug?.dominantReason
  const confidenceArbitration = visualDebug?.confidenceArbitration
  const adaptiveSovereigntyHistory = visualDebug?.adaptiveSovereigntyHistory ?? []
  const adaptiveSovereigntyStability = resolveAdaptiveSovereigntyStability(adaptiveSovereigntyHistory)
  const adaptiveStabilizationQuality = resolveAdaptiveStabilizationQuality(adaptiveSovereigntyHistory)
  const adaptiveStabilizationTone = resolveAdaptiveStabilizationTone(adaptiveStabilizationQuality)
  const adaptiveRegimeShift = resolveAdaptiveRegimeShift(adaptiveSovereigntyHistory)
  const adaptiveDegradation = resolveAdaptiveDegradation(adaptiveSovereigntyHistory)
  const adaptiveDegradationPersistence = resolveAdaptiveDegradationPersistence(adaptiveSovereigntyHistory)
  const currentAdaptiveDecisionProfile = visualDebug?.currentAdaptiveDecisionProfile
  const nextAdaptiveDecisionProfile = visualDebug?.nextAdaptiveDecisionProfile
  const currentHistoricalSignals = visualDebug?.currentHistoricalSignals
  const nextHistoricalSignals = visualDebug?.nextHistoricalSignals
  const currentPolicyProfile = visualDebug?.currentPolicyProfile
  const nextPolicyProfile = visualDebug?.nextPolicyProfile
  const currentStrategyProfile = visualDebug?.currentStrategyProfile
  const nextStrategyProfile = visualDebug?.nextStrategyProfile
  const historicalComparison = currentHistoricalSignals != null && nextHistoricalSignals != null
    ? resolveHistoricalComparison(currentHistoricalSignals, nextHistoricalSignals)
    : undefined
  const adaptiveComparison = currentAdaptiveDecisionProfile != null && nextAdaptiveDecisionProfile != null
    ? resolveAdaptiveComparison(currentAdaptiveDecisionProfile, nextAdaptiveDecisionProfile)
    : undefined
  const policyComparison = currentPolicyProfile != null && nextPolicyProfile != null
    ? resolvePolicyComparison(currentPolicyProfile, nextPolicyProfile)
    : undefined

  const dominantStrategyChanged = currentStrategyProfile != null && nextStrategyProfile != null
    ? currentStrategyProfile.dominantStrategy !== nextStrategyProfile.dominantStrategy
    : false
  const adaptationConfidenceChanged = currentStrategyProfile != null && nextStrategyProfile != null
    ? isMaterialNumericChange(
        currentStrategyProfile.adaptationConfidence,
        nextStrategyProfile.adaptationConfidence,
        STRATEGY_CONFIDENCE_MATERIAL_DELTA,
      )
    : false
  const supportBiasChanged = currentStrategyProfile != null && nextStrategyProfile != null
    ? isMaterialNumericChange(
        currentStrategyProfile.strategyBias.supportBias,
        nextStrategyProfile.strategyBias.supportBias,
        STRATEGY_BIAS_MATERIAL_DELTA,
      )
    : false
  const explorationBiasChanged = currentStrategyProfile != null && nextStrategyProfile != null
    ? isMaterialNumericChange(
        currentStrategyProfile.strategyBias.explorationBias,
        nextStrategyProfile.strategyBias.explorationBias,
        STRATEGY_BIAS_MATERIAL_DELTA,
      )
    : false
  const conversionBiasChanged = currentStrategyProfile != null && nextStrategyProfile != null
    ? isMaterialNumericChange(
        currentStrategyProfile.strategyBias.conversionBias,
        nextStrategyProfile.strategyBias.conversionBias,
        STRATEGY_BIAS_MATERIAL_DELTA,
      )
    : false
  const cautionBiasChanged = currentStrategyProfile != null && nextStrategyProfile != null
    ? isMaterialNumericChange(
        currentStrategyProfile.strategyBias.cautionBias,
        nextStrategyProfile.strategyBias.cautionBias,
        STRATEGY_BIAS_MATERIAL_DELTA,
      )
    : false
  const materialStrategyChanges = [
    dominantStrategyChanged ? 'dominantStrategy' : null,
    adaptationConfidenceChanged ? 'adaptationConfidence' : null,
    supportBiasChanged ? 'supportBias' : null,
    explorationBiasChanged ? 'explorationBias' : null,
    conversionBiasChanged ? 'conversionBias' : null,
    cautionBiasChanged ? 'cautionBias' : null,
  ].filter((value): value is string => value !== null)
  const adaptationConfidenceDirection = currentStrategyProfile != null && nextStrategyProfile != null
    ? resolveDirectionalChange(currentStrategyProfile.adaptationConfidence, nextStrategyProfile.adaptationConfidence)
    : undefined
  const supportBiasDirection = currentStrategyProfile != null && nextStrategyProfile != null
    ? resolveDirectionalChange(currentStrategyProfile.strategyBias.supportBias, nextStrategyProfile.strategyBias.supportBias)
    : undefined
  const explorationBiasDirection = currentStrategyProfile != null && nextStrategyProfile != null
    ? resolveDirectionalChange(currentStrategyProfile.strategyBias.explorationBias, nextStrategyProfile.strategyBias.explorationBias)
    : undefined
  const conversionBiasDirection = currentStrategyProfile != null && nextStrategyProfile != null
    ? resolveDirectionalChange(currentStrategyProfile.strategyBias.conversionBias, nextStrategyProfile.strategyBias.conversionBias)
    : undefined
  const cautionBiasDirection = currentStrategyProfile != null && nextStrategyProfile != null
    ? resolveDirectionalChange(currentStrategyProfile.strategyBias.cautionBias, nextStrategyProfile.strategyBias.cautionBias)
    : undefined

  return (
    <main className="entity-public-shell entity-public-shell--living">
      <section className="entity-public-hero entity-public-hero--living">
        <div className="entity-public-hero__visual">
          <PresenceVisual
            presence={presence}
            visualRuntimePatch={visualRuntimePatch ?? visualDebug?.runtimePatch}
            cognitiveIndicator={cognitiveIndicator}
          />
        </div>

        <div className="entity-public-hero__copy">
          <RelationshipStateBanner
            relational={presence.relational}
            presenceHealth={presence.visual.presenceHealth}
          />

          <p className="entity-public-kicker">{presence.entity.species ?? 'entidade publica'}</p>
          <h1>{presence.entity.name}</h1>
          <p className="entity-public-tagline">
            {presence.entity.tagline ?? 'Uma presenca publica guiada pelo estado oficial da entidade.'}
          </p>

          <div className="entity-public-actions">
            <DynamicCTA cta={presence.cta} onFollow={onFollow} onShare={onShare} />
            <button
              type="button"
              className="entity-public-button entity-public-button--secondary"
              onClick={onFollow}
            >
              {socialState?.viewerState.followed ? 'Seguindo' : isAuthenticated ? 'Seguir' : 'Entrar para seguir'}
            </button>
            <a className="entity-public-button entity-public-button--secondary" href="#entity-public-trajectory">
              Ver trajetoria
            </a>
            <button
              type="button"
              className="entity-public-button entity-public-button--secondary"
              onClick={onShare}
            >
              Compartilhar
            </button>
          </div>
          {shareState !== 'idle' ? (
            <p className="entity-public-share-state">
              {shareState === 'shared' ? 'link compartilhado' : 'link copiado'}
            </p>
          ) : null}
          {actionError ? <p className="entity-public-share-state">{actionError}</p> : null}
        </div>
      </section>

      <section className="entity-public-grid entity-public-grid--living">
        <article className="entity-public-card">
          <span className="entity-public-card__label">Tendencia</span>
          <strong>{presence.visual.presenceHealth.trend}</strong>
        </article>
        <article className="entity-public-card">
          <span className="entity-public-card__label">Intensidade</span>
          <strong>{presence.visual.presenceHealth.intensity}</strong>
        </article>
        <article className="entity-public-card">
          <span className="entity-public-card__label">Vinculo</span>
          <strong>{presence.relational.tier ?? 'em leitura'}</strong>
        </article>
        <article className="entity-public-card">
          <span className="entity-public-card__label">Views</span>
          <strong>{socialState?.aggregate.counts.viewed ?? 0}</strong>
        </article>
        <article className="entity-public-card">
          <span className="entity-public-card__label">Follows</span>
          <strong>{socialState?.aggregate.counts.followed ?? 0}</strong>
        </article>
      </section>

      <section className="entity-public-section" id="entity-public-trajectory">
        <div className="entity-public-section__header">
          <p>trajetoria</p>
          <h2>Evolucao recente</h2>
        </div>
        <TrajectoryTimeline items={presence.trajectory} />
      </section>

      <section className="entity-public-section" id="entity-public-exports">
        <div className="entity-public-section__header">
          <p>exports vivos</p>
          <h2>Manifestacoes conectadas ao estado atual</h2>
        </div>
        <div className="entity-public-export-grid">
          {presence.exports.map((item) => (
            <LiveExportCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="entity-public-section" id="entity-public-interaction">
        <div className="entity-public-section__header">
          <p>interacao</p>
          <h2>Fale com a entidade</h2>
        </div>

        <div className="entity-public-interaction">
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder={`Envie um sinal para ${presence.entity.name}`}
          />
          <button type="button" onClick={onSendMessage}>
            Enviar
          </button>
        </div>

        <div className="entity-public-response">
          <span>Resposta atual</span>
          <p>{response ?? `${presence.entity.name} ainda esta observando o contexto.`}</p>
        </div>

        {legalCaseState?.actionType === 'create_legal_case' ? (
          <div className="entity-public-case-status">
            <span className="entity-public-case-status__label">Fluxo juridico</span>
            <strong>{legalCaseState.caseId ? 'caso aberto' : 'dados pendentes'}</strong>
            {legalCaseState.caseId ? (
              <p>Identificador: <code>{legalCaseState.caseId}</code></p>
            ) : (
              <p>Pre-cadastro iniciado. Ainda faltam dados para completar o atendimento.</p>
            )}
            {legalCaseState.missingFields && legalCaseState.missingFields.length > 0 ? (
              <p>
                Para continuar, envie: {legalCaseState.missingFields.map(formatMissingLegalField).join(' e ')}.
              </p>
            ) : null}
          </div>
        ) : null}

        {showVisualDebug && !visualDebug && officialDecisionDebugSummary ? (
          <details className="entity-public-response" open={false}>
            <summary>Debug de decisão backend</summary>
            <div className="entity-public-debug-panel">
              <div className="entity-public-debug-grid">
                <section className="entity-public-debug-section">
                  <div className="entity-public-debug-section__header">
                    <strong>Resumo oficial</strong>
                    <span>estado devolvido pelo backend TS</span>
                  </div>
                  <div className="debug-insights">
                    <span className="debug-chip"><span className="debug-label">fallback</span><span className="debug-value">{formatBoolean(officialDecisionDebugSummary.fallbackUsed)}</span></span>
                    <span className="debug-chip"><span className="debug-label">safe mode</span><span className="debug-value">{formatBoolean(Boolean(officialDecisionDebugSummary.safeMode))}</span></span>
                    <span className="debug-chip"><span className="debug-label">authority</span><span className="debug-value">{officialDecisionDebugSummary.authorityShift ?? 'n/a'}</span></span>
                    <span className="debug-chip"><span className="debug-label">terminal reason</span><span className="debug-value">{officialDecisionDebugSummary.terminalReason ?? 'n/a'}</span></span>
                    <span className="debug-chip"><span className="debug-label">dominant reason</span><span className="debug-value">{officialDecisionDebugSummary.dominantReason ?? 'n/a'}</span></span>
                    <span className="debug-chip"><span className="debug-label">fallback reason</span><span className="debug-value">{officialDecisionDebugSummary.fallbackReason ?? 'n/a'}</span></span>
                  </div>
                </section>
              </div>
            </div>
          </details>
        ) : null}

        {showVisualDebug && operationalFallbackReason ? (
          <details className="entity-public-response" open={false}>
            <summary>Debug de fallback operacional</summary>
            <div className="entity-public-debug-panel">
              <div className="entity-public-debug-grid">
                <section className="entity-public-debug-section">
                  <div className="entity-public-debug-section__header">
                    <strong>Fallback degradado</strong>
                    <span>resposta neutra sem decisao cognitiva local</span>
                  </div>
                  <div className="debug-insights">
                    <span className="debug-chip"><span className="debug-label">source</span><span className="debug-value">frontend-operational-fallback</span></span>
                    <span className="debug-chip"><span className="debug-label">fallback reason</span><span className="debug-value">{operationalFallbackReason}</span></span>
                  </div>
                </section>
              </div>
            </div>
          </details>
        ) : null}

        {showVisualDebug && visualDebug ? (
          <details className="entity-public-response" open={false}>
            <summary>Debug de presenca local</summary>
            <div className="entity-public-debug-panel">
              <div className="entity-public-debug-grid">
                <section className="entity-public-debug-section">
                  <div className="entity-public-debug-section__header">
                    <strong>Memoria</strong>
                    <span>influencia da memoria no turno</span>
                  </div>
                  <div className="debug-insights">
                    <span className="debug-chip"><span className="debug-label">applied</span><span className="debug-value">{formatBoolean(visualDebug.decision.memoryInfluence.applied)}</span></span>
                    <span className="debug-chip"><span className="debug-label">strength</span><span className="debug-value">{formatStrength(visualDebug.decision.memoryInfluence.influenceStrength)}</span></span>
                    <span className="debug-chip"><span className="debug-label">signals</span><span className="debug-value">{visualDebug.decision.memoryInfluence.signalsUsed.length}</span></span>
                  </div>
                </section>

                <section className="entity-public-debug-section">
                  <div className="entity-public-debug-section__header">
                    <strong>Estado cognitivo</strong>
                    <span>vies aplicado na decisao</span>
                  </div>
                  <div className="debug-insights">
                    <span className="debug-chip"><span className="debug-label">applied</span><span className="debug-value">{formatBoolean(Boolean(visualDebug.decision.cognitiveStateInfluence?.applied))}</span></span>
                    <span className="debug-chip"><span className="debug-label">strength</span><span className="debug-value">{formatStrength(visualDebug.decision.cognitiveStateInfluence?.influenceStrength)}</span></span>
                    <span className="debug-chip"><span className="debug-label">signals</span><span className="debug-value">{visualDebug.decision.cognitiveStateInfluence?.signalsUsed.length ?? 0}</span></span>
                  </div>
                </section>

                <section className="entity-public-debug-section entity-public-debug-section--strategy">
                  <div className="entity-public-debug-section__header">
                    <strong>Estrategia adaptativa</strong>
                    <span>perfil persistido no wrapper e usado para modular decisoes futuras</span>
                  </div>
                  <div className="debug-insights">
                    <span className="debug-chip"><span className="debug-label">before</span><span className="debug-value">{visualDebug.currentStrategyProfile.dominantStrategy}</span></span>
                    <span className="debug-chip"><span className="debug-label">after</span><span className="debug-value">{visualDebug.nextStrategyProfile.dominantStrategy}</span></span>
                    <span className="debug-chip"><span className="debug-label">confidence</span><span className="debug-value">{formatStrength(visualDebug.nextStrategyProfile.adaptationConfidence)}</span></span>
                  </div>

                  <div className="entity-public-debug-material-row" aria-label="mudancas materiais de estrategia">
                    {materialStrategyChanges.length > 0 ? (
                      materialStrategyChanges.map((change) => (
                        <span key={change} className="entity-public-debug-material-pill">
                          {change}
                        </span>
                      ))
                    ) : (
                      <span className="entity-public-debug-material-pill entity-public-debug-material-pill--quiet">
                        sem shift material
                      </span>
                    )}
                  </div>

                  <div className="entity-public-debug-strategy-grid">
                    <article className={resolveDebugCardClassName(dominantStrategyChanged, true)}>
                      <div className="entity-public-debug-card__title-row">
                        <span className="entity-public-debug-card__title">dominantStrategy</span>
                        {dominantStrategyChanged ? renderDirectionBadge('shift', 'troca') : null}
                      </div>
                      <div className="entity-public-debug-compare-list">
                        <span className="entity-public-debug-compare-row">
                          <strong>shift</strong>
                          <span>{formatModeShift(visualDebug.currentStrategyProfile.dominantStrategy, visualDebug.nextStrategyProfile.dominantStrategy)}</span>
                        </span>
                      </div>
                    </article>

                    <article className={resolveDebugCardClassName(adaptationConfidenceChanged)}>
                      <div className="entity-public-debug-card__title-row">
                        <span className="entity-public-debug-card__title">adaptationConfidence</span>
                        {adaptationConfidenceChanged && adaptationConfidenceDirection
                          ? renderDirectionBadge(
                              adaptationConfidenceDirection,
                              adaptationConfidenceDirection === 'gain' ? 'ganho' : 'queda',
                            )
                          : null}
                      </div>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentStrategyProfile.adaptationConfidence)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextStrategyProfile.adaptationConfidence)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextStrategyProfile.adaptationConfidence - visualDebug.currentStrategyProfile.adaptationConfidence)}</span>
                      </div>
                    </article>

                    <article className={resolveDebugCardClassName(supportBiasChanged)}>
                      <div className="entity-public-debug-card__title-row">
                        <span className="entity-public-debug-card__title">supportBias</span>
                        {supportBiasChanged && supportBiasDirection
                          ? renderDirectionBadge(supportBiasDirection, supportBiasDirection === 'gain' ? 'ganho' : 'queda')
                          : null}
                      </div>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentStrategyProfile.strategyBias.supportBias)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextStrategyProfile.strategyBias.supportBias)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextStrategyProfile.strategyBias.supportBias - visualDebug.currentStrategyProfile.strategyBias.supportBias)}</span>
                      </div>
                    </article>

                    <article className={resolveDebugCardClassName(explorationBiasChanged)}>
                      <div className="entity-public-debug-card__title-row">
                        <span className="entity-public-debug-card__title">explorationBias</span>
                        {explorationBiasChanged && explorationBiasDirection
                          ? renderDirectionBadge(explorationBiasDirection, explorationBiasDirection === 'gain' ? 'ganho' : 'queda')
                          : null}
                      </div>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentStrategyProfile.strategyBias.explorationBias)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextStrategyProfile.strategyBias.explorationBias)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextStrategyProfile.strategyBias.explorationBias - visualDebug.currentStrategyProfile.strategyBias.explorationBias)}</span>
                      </div>
                    </article>

                    <article className={resolveDebugCardClassName(conversionBiasChanged)}>
                      <div className="entity-public-debug-card__title-row">
                        <span className="entity-public-debug-card__title">conversionBias</span>
                        {conversionBiasChanged && conversionBiasDirection
                          ? renderDirectionBadge(conversionBiasDirection, conversionBiasDirection === 'gain' ? 'ganho' : 'queda')
                          : null}
                      </div>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentStrategyProfile.strategyBias.conversionBias)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextStrategyProfile.strategyBias.conversionBias)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextStrategyProfile.strategyBias.conversionBias - visualDebug.currentStrategyProfile.strategyBias.conversionBias)}</span>
                      </div>
                    </article>

                    <article className={resolveDebugCardClassName(cautionBiasChanged)}>
                      <div className="entity-public-debug-card__title-row">
                        <span className="entity-public-debug-card__title">cautionBias</span>
                        {cautionBiasChanged && cautionBiasDirection
                          ? renderDirectionBadge(cautionBiasDirection, cautionBiasDirection === 'gain' ? 'ganho' : 'queda')
                          : null}
                      </div>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentStrategyProfile.strategyBias.cautionBias)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextStrategyProfile.strategyBias.cautionBias)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextStrategyProfile.strategyBias.cautionBias - visualDebug.currentStrategyProfile.strategyBias.cautionBias)}</span>
                      </div>
                    </article>
                  </div>
                </section>

                {adaptiveComparison && currentAdaptiveDecisionProfile && nextAdaptiveDecisionProfile ? (
                  <section className="entity-public-debug-section entity-public-debug-section--adaptive">
                    <div className="entity-public-debug-section__header">
                      <strong>Adaptive decision</strong>
                      <span>comparativo before/after da camada estrutural anterior a policy</span>
                    </div>
                    <div className="debug-insights">
                      {adaptiveDecisionCore ? (
                        <>
                          <span className="debug-chip"><span className="debug-label">decision source</span><span className="debug-value">{resolveDecisionSourceLabel(adaptiveDecisionCore.decisionSource)}</span></span>
                          <span className="debug-chip"><span className="debug-label">authority shift</span><span className="debug-value">{resolveTerminalAuthorityShiftLabel(visualDebug.terminalAuthorityShift)}</span></span>
                          <span className="debug-chip"><span className="debug-label">correlation</span><span className="debug-value">{resolveAuthorityRegimeCorrelationLabel(visualDebug.correlationType)}</span></span>
                          <span className="debug-chip"><span className="debug-label">transition quality</span><span className="debug-value">{visualDebug.structuralTransitionDirection ? resolveStructuralTransitionDirectionLabel(visualDebug.structuralTransitionDirection) : 'n/a'}</span></span>
                          <span className="debug-chip"><span className="debug-label">transition maturity</span><span className="debug-value">{visualDebug.structuralTransitionMaturity ? resolveStructuralTransitionMaturityLabel(visualDebug.structuralTransitionMaturity) : 'n/a'}</span></span>
                          <span className="debug-chip"><span className="debug-label">false positive</span><span className="debug-value">{formatBoolean(visualDebug.falsePositiveGain)}</span></span>
                          <span className="debug-chip"><span className="debug-label">cause category</span><span className="debug-value">{resolveFalsePositiveCauseCategoryLabel(visualDebug.causeCategory)}</span></span>
                          <span className="debug-chip"><span className="debug-label">secondary causes</span><span className="debug-value">{visualDebug.secondaryCauses.length}</span></span>
                          <span className="debug-chip"><span className="debug-label">cause chain</span><span className="debug-value">{resolveTemporalCauseClassificationLabel(visualDebug.temporalCauseChain?.classification)}</span></span>
                          <span className="debug-chip"><span className="debug-label">origin turn</span><span className="debug-value">{visualDebug.causeOriginTurn ?? 'n/a'}</span></span>
                          <span className="debug-chip"><span className="debug-label">terminal authority</span><span className="debug-value">{resolveTerminalAuthorityLabel(visualDebug.terminalAuthority)}</span></span>
                          <span className="debug-chip"><span className="debug-label">semantic frozen</span><span className="debug-value">{formatBoolean(visualDebug.semanticFrozen)}</span></span>
                          <span className="debug-chip"><span className="debug-label">semantic zone</span><span className="debug-value">{resolveSemanticZoneLabel(adaptiveDecisionCore.semanticProposal.semanticZone)}</span></span>
                        </>
                      ) : null}
                      <span className="debug-chip"><span className="debug-label">before confidence</span><span className="debug-value">{formatStrength(currentAdaptiveDecisionProfile.adaptationConfidence)}</span></span>
                      <span className="debug-chip"><span className="debug-label">after confidence</span><span className="debug-value">{formatStrength(nextAdaptiveDecisionProfile.adaptationConfidence)}</span></span>
                      <span className="debug-chip"><span className="debug-label">before drift</span><span className="debug-value">{formatStrength(currentAdaptiveDecisionProfile.decisionDrift)}</span></span>
                      <span className="debug-chip"><span className="debug-label">after drift</span><span className="debug-value">{formatStrength(nextAdaptiveDecisionProfile.decisionDrift)}</span></span>
                      <span className="debug-chip"><span className="debug-label">material dims</span><span className="debug-value">{adaptiveComparison.materialDimensions.length}</span></span>
                    </div>

                    {adaptiveDecisionCore ? (
                      <div className="entity-public-debug-adaptive-audit-grid">
                        <article className={resolveDebugCardClassName(adaptiveDecisionCore.decisionSource === 'adaptive-core')}>
                          <div className="entity-public-debug-card__title-row">
                            <span className="entity-public-debug-card__title">terminal authority</span>
                            {renderDirectionBadge(
                              adaptiveDecisionCore.decisionSource === 'adaptive-core' ? 'gain' : 'shift',
                              resolveTerminalAuthorityLabel(visualDebug.terminalAuthority),
                            )}
                          </div>
                          <div className="entity-public-debug-compare-list">
                            <span className="entity-public-debug-compare-row">
                              <strong>previous</strong>
                              <span>
                                {visualDebug.previousTerminalAuthority != null
                                  ? resolveTerminalAuthorityLabel(visualDebug.previousTerminalAuthority)
                                  : 'n/a'}
                              </span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>author</strong>
                              <span>{resolveTerminalAuthorityLabel(visualDebug.terminalAuthority)}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>shift</strong>
                              <span>
                                {renderDirectionBadge(
                                  resolveTerminalAuthorityShiftTone(visualDebug.terminalAuthorityShift),
                                  resolveTerminalAuthorityShiftLabel(visualDebug.terminalAuthorityShift),
                                )}
                              </span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>correlation</strong>
                              <span>
                                {renderDirectionBadge(
                                  resolveAuthorityRegimeCorrelationTone({
                                    correlationType: visualDebug.correlationType,
                                    terminalAuthority: visualDebug.terminalAuthority,
                                  }),
                                  resolveAuthorityRegimeCorrelationLabel(visualDebug.correlationType),
                                )}
                              </span>
                            </span>
                            {visualDebug.structuralTransitionDirection ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>transition quality</strong>
                                <span>
                                  {renderDirectionBadge(
                                    resolveStructuralTransitionDirectionTone(visualDebug.structuralTransitionDirection),
                                    resolveStructuralTransitionDirectionLabel(visualDebug.structuralTransitionDirection),
                                  )}
                                </span>
                              </span>
                            ) : null}
                            {visualDebug.structuralTransitionMaturity ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>transition maturity</strong>
                                <span>
                                  {renderDirectionBadge(
                                    resolveStructuralTransitionMaturityTone(visualDebug.structuralTransitionMaturity),
                                    resolveStructuralTransitionMaturityLabel(visualDebug.structuralTransitionMaturity),
                                  )}
                                </span>
                              </span>
                            ) : null}
                            {visualDebug.falsePositiveGain ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>false positive</strong>
                                <span>
                                  {renderDirectionBadge(
                                    resolveFalsePositiveGainTone(visualDebug.falsePositiveGain),
                                    resolveFalsePositiveGainLabel(visualDebug.falsePositiveGain),
                                  )}
                                </span>
                              </span>
                            ) : null}
                            {visualDebug.causeCategory ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>cause category</strong>
                                <span>{resolveFalsePositiveCauseCategoryLabel(visualDebug.causeCategory)}</span>
                              </span>
                            ) : null}
                            <span className="entity-public-debug-compare-row">
                              <strong>semanticFrozen</strong>
                              <span>
                                {renderDirectionBadge(
                                  resolveSemanticFrozenTone(visualDebug.semanticFrozen),
                                  resolveSemanticFrozenLabel(visualDebug.semanticFrozen),
                                )}
                              </span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>source</strong>
                              <span>{resolveDecisionSourceLabel(adaptiveDecisionCore.decisionSource)}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>reason</strong>
                              <span>{visualDebug.terminalReason}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>regime correlation</strong>
                              <span>{visualDebug.authorityRegimeCorrelation.label}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>regime span</strong>
                              <span>
                                {visualDebug.authorityRegimeCorrelation.previousRegime != null
                                  ? `${visualDebug.authorityRegimeCorrelation.previousRegime} -> ${visualDebug.authorityRegimeCorrelation.currentRegime}`
                                  : visualDebug.authorityRegimeCorrelation.currentRegime}
                              </span>
                            </span>
                            {visualDebug.structuralTransitionQuality ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>quality span</strong>
                                <span>{visualDebug.structuralTransitionQuality.label}</span>
                              </span>
                            ) : null}
                            {visualDebug.structuralTransitionStability ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>stability span</strong>
                                <span>{visualDebug.structuralTransitionStability.label}</span>
                              </span>
                            ) : null}
                            {visualDebug.falsePositiveReason ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>false positive reason</strong>
                                <span>{visualDebug.falsePositiveReason}</span>
                              </span>
                            ) : null}
                            {visualDebug.falsePositiveCause ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>false positive cause</strong>
                                <span>{visualDebug.falsePositiveCause}</span>
                              </span>
                            ) : null}
                            {visualDebug.secondaryCauses.length > 0 ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>secondary causes</strong>
                                <span>{visualDebug.secondaryCauses.join(' | ')}</span>
                              </span>
                            ) : null}
                            {visualDebug.causeRanking.length > 1 ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>cause ranking</strong>
                                <span>{visualDebug.causeRanking.slice(0, 3).map(resolveCauseRankingLabel).join(' | ')}</span>
                              </span>
                            ) : null}
                            {visualDebug.temporalCauseChain ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>temporal chain</strong>
                                <span>{visualDebug.temporalCauseChain.label}</span>
                              </span>
                            ) : null}
                            {visualDebug.causeOriginTurn ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>cause origin turn</strong>
                                <span>{visualDebug.causeOriginTurn}</span>
                              </span>
                            ) : null}
                            {visualDebug.causeTimeline.length > 0 ? (
                              <span className="entity-public-debug-compare-row">
                                <strong>cause timeline</strong>
                                <span>{visualDebug.causeTimeline.slice(0, 3).map((entry) => `${resolveTemporalCauseTimelineLabel(entry)} · ${entry.cause}`).join(' | ')}</span>
                              </span>
                            ) : null}
                            <span className="entity-public-debug-compare-row">
                              <strong>zone</strong>
                              <span className={resolveSemanticZoneBadgeClassName(adaptiveDecisionCore.semanticProposal.semanticZone)}>
                                {resolveSemanticZoneLabel(adaptiveDecisionCore.semanticProposal.semanticZone)}
                              </span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>adaptivePriority</strong>
                              <span>{formatStrength(adaptiveDecisionCore.core.adaptivePriority)}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>learningConfidence</strong>
                              <span>{formatStrength(adaptiveDecisionCore.core.learningConfidence)}</span>
                            </span>
                          </div>
                        </article>

                        <article className={resolveDebugCardClassName(!adaptiveDecisionCore.semanticProposal.fallbackRequired, true)}>
                          <div className="entity-public-debug-card__title-row">
                            <span className="entity-public-debug-card__title">semanticProposal</span>
                            {!adaptiveDecisionCore.semanticProposal.fallbackRequired
                              ? renderDirectionBadge('gain', 'proposal active')
                              : renderDirectionBadge('loss', 'fallback required')}
                          </div>
                          <div className="entity-public-debug-compare-list">
                            <span className="entity-public-debug-compare-row">
                              <strong>intent</strong>
                              <span>{adaptiveDecisionCore.semanticProposal.proposedIntent ?? 'n/a'}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>action</strong>
                              <span>{adaptiveDecisionCore.semanticProposal.proposedAction ?? 'n/a'}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>plan kind</strong>
                              <span>{adaptiveDecisionCore.semanticProposal.proposedResponsePlanSkeleton?.kind ?? 'n/a'}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>topic</strong>
                              <span>{adaptiveDecisionCore.semanticProposal.proposedResponsePlanSkeleton?.topic ?? 'n/a'}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>intent goal</strong>
                              <span>{adaptiveDecisionCore.semanticProposal.proposedResponsePlanSkeleton?.intentGoal ?? 'n/a'}</span>
                            </span>
                            <span className="entity-public-debug-compare-row">
                              <strong>proposalConfidence</strong>
                              <span>{formatStrength(adaptiveDecisionCore.semanticProposal.proposalConfidence)}</span>
                            </span>
                          </div>
                        </article>

                        {proposalEvidence && confidenceArbitration ? (
                          <>
                            <article className={resolveDebugCardClassName(adaptiveDecisionCore.decisionSource === 'adaptive-core')}>
                              <div className="entity-public-debug-card__title-row">
                                <span className="entity-public-debug-card__title">proposalEvidence</span>
                                {dominantEvidence
                                  ? renderDirectionBadge(
                                      adaptiveDecisionCore.decisionSource === 'adaptive-core' ? 'gain' : 'loss',
                                      resolveProposalEvidenceLabel(dominantEvidence.signal),
                                    )
                                  : renderDirectionBadge(
                                      adaptiveDecisionCore.decisionSource === 'adaptive-core' ? 'gain' : 'loss',
                                      resolveAdaptiveExplanationTone(adaptiveDecisionCore.decisionSource),
                                    )}
                              </div>
                              <div className="entity-public-debug-compare-list">
                                <span className="entity-public-debug-compare-row">
                                  <strong>dominantEvidence</strong>
                                  <span>
                                    {dominantEvidence
                                      ? `${resolveProposalEvidenceLabel(dominantEvidence.signal)} · ${formatStrength(dominantEvidence.weight)}`
                                      : 'n/a'}
                                  </span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>dominantReason</strong>
                                  <span>{dominantReason ?? 'n/a'}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>memoryStrength</strong>
                                  <span>{formatStrength(proposalEvidence.memoryStrength)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>historicalReliability</strong>
                                  <span>{formatStrength(proposalEvidence.historicalReliability)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>adaptiveReadiness</strong>
                                  <span>{formatStrength(proposalEvidence.adaptiveReadiness)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>policyStability</strong>
                                  <span>{formatStrength(proposalEvidence.policyStability)}</span>
                                </span>
                              </div>
                            </article>

                            <article className={resolveDebugCardClassName(adaptiveSovereigntyStability === 'adaptive stabilizing' || adaptiveRegimeShift != null || adaptiveDegradation != null || adaptiveDegradationPersistence != null, true)}>
                              <div className="entity-public-debug-card__title-row">
                                <span className="entity-public-debug-card__title">adaptiveSovereignty</span>
                                {renderDirectionBadge(
                                  adaptiveSovereigntyHistory.at(-1)?.decisionSource === 'adaptive-core' ? 'gain' : 'shift',
                                  adaptiveSovereigntyStability,
                                )}
                              </div>
                              {adaptiveStabilizationTone ? (
                                <div className={resolveAdaptiveStabilizationClassName(adaptiveStabilizationTone)}>
                                  <strong>stabilization</strong>
                                  <span>{resolveAdaptiveStabilizationLabel(adaptiveStabilizationQuality)}</span>
                                </div>
                              ) : null}
                              {adaptiveDegradationPersistence ? (
                                <div className={resolveAdaptiveRegimeShiftClassName(adaptiveDegradationPersistence.tone)}>
                                  <strong>{adaptiveDegradationPersistence.kind === 'persistent' ? 'persistent degradation' : 'short degradation'}</strong>
                                  <span>{adaptiveDegradationPersistence.label}</span>
                                </div>
                              ) : null}
                              {adaptiveRegimeShift ? (
                                <div className={resolveAdaptiveRegimeShiftClassName(adaptiveRegimeShift.tone)}>
                                  <strong>regime shift</strong>
                                  <span>{`${adaptiveRegimeShift.from} -> ${adaptiveRegimeShift.to}`}</span>
                                </div>
                              ) : null}
                              <div className="entity-public-debug-compare-list">
                                <span className="entity-public-debug-compare-row">
                                  <strong>recent source line</strong>
                                  <span>{resolveAdaptiveSovereigntyLine(adaptiveSovereigntyHistory)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>recent zone line</strong>
                                  <span>{resolveAdaptiveZoneLine(adaptiveSovereigntyHistory)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>last turn</strong>
                                  <span>
                                    {resolveDecisionSourceCompactLabel(adaptiveDecisionCore.decisionSource)} · {adaptiveDecisionCore.semanticProposal.semanticZone}
                                  </span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>regime state</strong>
                                  <span>{adaptiveSovereigntyStability}</span>
                                </span>
                                {adaptiveStabilizationQuality ? (
                                  <span className="entity-public-debug-compare-row">
                                    <strong>stabilization quality</strong>
                                    <span>{resolveAdaptiveStabilizationLabel(adaptiveStabilizationQuality)}</span>
                                  </span>
                                ) : null}
                                {adaptiveDegradationPersistence ? (
                                  <span className="entity-public-debug-compare-row">
                                    <strong>degradation type</strong>
                                    <span>{adaptiveDegradationPersistence.kind}</span>
                                  </span>
                                ) : null}
                                {adaptiveDegradationPersistence ? (
                                  <span className="entity-public-debug-compare-row">
                                    <strong>quality drop</strong>
                                    <span>{adaptiveDegradationPersistence.label}</span>
                                  </span>
                                ) : null}
                              </div>
                              <div className="entity-public-debug-material-row" aria-label="historico recente de soberania adaptativa">
                                {adaptiveSovereigntyHistory.map((turn, index) => (
                                  <span
                                    key={`${turn.observedAt}:${index}`}
                                    className="entity-public-debug-material-pill entity-public-debug-material-pill--adaptive"
                                  >
                                    {`${resolveDecisionSourceCompactLabel(turn.decisionSource)} / ${turn.semanticZone}`}
                                  </span>
                                ))}
                              </div>
                            </article>

                            <article className={resolveDebugCardClassName(adaptiveDecisionCore.core.fallbackConditions.length === 0, true)}>
                              <div className="entity-public-debug-card__title-row">
                                <span className="entity-public-debug-card__title">confidenceArbitration</span>
                                {adaptiveDecisionCore.core.fallbackConditions.length === 0
                                  ? renderDirectionBadge('gain', 'accepted')
                                  : renderDirectionBadge('shift', 'gated')}
                              </div>
                              <div className="entity-public-debug-compare-list">
                                <span className="entity-public-debug-compare-row">
                                  <strong>summary</strong>
                                  <span>{resolveConfidenceArbitrationSummary(confidenceArbitration)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>proposal force</strong>
                                  <span>{formatStrength(adaptiveDecisionCore.semanticProposal.proposalConfidence)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>primary reason</strong>
                                  <span>
                                    {resolvePrimaryAdaptiveReasonLabel(
                                      adaptiveDecisionCore.core.fallbackConditions,
                                      adaptiveDecisionCore.decisionSource,
                                    )}
                                  </span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>learningConfidence</strong>
                                  <span>{formatStrength(adaptiveDecisionCore.core.learningConfidence)}</span>
                                </span>
                                <span className="entity-public-debug-compare-row">
                                  <strong>adaptivePriority</strong>
                                  <span>{formatStrength(adaptiveDecisionCore.core.adaptivePriority)}</span>
                                </span>
                              </div>
                            </article>
                          </>
                        ) : null}

                        <article className={resolveDebugCardClassName(adaptiveDecisionCore.core.fallbackConditions.length > 0, true)}>
                          <div className="entity-public-debug-card__title-row">
                            <span className="entity-public-debug-card__title">fallbackConditions</span>
                            {adaptiveDecisionCore.core.fallbackConditions.length > 0
                              ? renderDirectionBadge('loss', `${adaptiveDecisionCore.core.fallbackConditions.length} fallback gates`)
                              : renderDirectionBadge('gain', 'accepted')}
                          </div>
                          <div className="entity-public-debug-compare-list">
                            {adaptiveDecisionCore.core.fallbackConditions.length > 0 ? (
                              adaptiveDecisionCore.core.fallbackConditions.map((fallbackCondition) => (
                                <span key={fallbackCondition} className="entity-public-debug-compare-row">
                                  <strong>gate</strong>
                                  <span>{resolveFallbackConditionLabel(fallbackCondition)}</span>
                                </span>
                              ))
                            ) : (
                              <span>nenhuma condicao de fallback ativa</span>
                            )}
                          </div>
                        </article>
                      </div>
                    ) : null}

                    <div className="entity-public-debug-material-row" aria-label="mudancas materiais de adaptive decision">
                      {adaptiveComparison.materialDimensions.length > 0 ? (
                        adaptiveComparison.materialDimensions.map((dimension) => (
                          <span key={dimension} className="entity-public-debug-material-pill entity-public-debug-material-pill--adaptive">
                            {dimension}
                          </span>
                        ))
                      ) : (
                        <span className="entity-public-debug-material-pill entity-public-debug-material-pill--quiet">
                          sem shift material
                        </span>
                      )}
                    </div>

                    <div className="entity-public-debug-adaptive-grid">
                      <article className={resolveDebugCardClassName(adaptiveComparison.intentSelectionChanges.length > 0, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">intentSelectionWeights</span>
                          {adaptiveComparison.intentSelectionChanges.length > 0
                            ? renderDirectionBadge('shift', `${adaptiveComparison.intentSelectionChanges.length} shifts`)
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {adaptiveComparison.intentSelectionChanges.length > 0 ? (
                            <>
                              {adaptiveComparison.intentSelectionChanges.slice(0, ADAPTIVE_MAX_VISIBLE_CHANGES).map((change) => (
                                <span key={change.label} className="entity-public-debug-compare-row">
                                  <strong>{change.label}</strong>
                                  <span>{formatPolicyChange(change)}</span>
                                </span>
                              ))}
                              {adaptiveComparison.intentSelectionChanges.length > ADAPTIVE_MAX_VISIBLE_CHANGES ? (
                                <span>+{adaptiveComparison.intentSelectionChanges.length - ADAPTIVE_MAX_VISIBLE_CHANGES} shifts adicionais</span>
                              ) : null}
                            </>
                          ) : (
                            <span>sem shift material nos pesos de intent</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(adaptiveComparison.actionSelectionChanges.length > 0, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">actionSelectionBias</span>
                          {adaptiveComparison.actionSelectionChanges.length > 0
                            ? renderDirectionBadge('shift', `${adaptiveComparison.actionSelectionChanges.length} shifts`)
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {adaptiveComparison.actionSelectionChanges.length > 0 ? (
                            <>
                              {adaptiveComparison.actionSelectionChanges.slice(0, ADAPTIVE_MAX_VISIBLE_CHANGES).map((change) => (
                                <span key={change.label} className="entity-public-debug-compare-row">
                                  <strong>{change.label}</strong>
                                  <span>{formatPolicyChange(change)}</span>
                                </span>
                              ))}
                              {adaptiveComparison.actionSelectionChanges.length > ADAPTIVE_MAX_VISIBLE_CHANGES ? (
                                <span>+{adaptiveComparison.actionSelectionChanges.length - ADAPTIVE_MAX_VISIBLE_CHANGES} shifts adicionais</span>
                              ) : null}
                            </>
                          ) : (
                            <span>sem shift material nos vieses de acao</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(adaptiveComparison.confidenceScalingChanged, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">confidenceScalingProfile</span>
                          {adaptiveComparison.confidenceScalingChanged ? renderDirectionBadge('shift', 'ajustes ativos') : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {adaptiveComparison.confidenceScalingCoreChanges.length > 0 ? (
                            adaptiveComparison.confidenceScalingCoreChanges.map((change) => (
                              <span key={change.label} className="entity-public-debug-compare-row">
                                <strong>{change.label}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))
                          ) : (
                            <span>sem shift material no core de confidence scaling</span>
                          )}
                          {adaptiveComparison.confidenceIntentScaleChanges.length > 0 ? (
                            adaptiveComparison.confidenceIntentScaleChanges.slice(0, ADAPTIVE_MAX_VISIBLE_CHANGES).map((change) => (
                              <span key={`intent:${change.label}`} className="entity-public-debug-compare-row">
                                <strong>{`intent:${change.label}`}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))
                          ) : (
                            <span>sem shift material em intentScales</span>
                          )}
                          {adaptiveComparison.confidenceActionScaleChanges.length > 0 ? (
                            adaptiveComparison.confidenceActionScaleChanges.slice(0, ADAPTIVE_MAX_VISIBLE_CHANGES).map((change) => (
                              <span key={`action:${change.label}`} className="entity-public-debug-compare-row">
                                <strong>{`action:${change.label}`}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))
                          ) : (
                            <span>sem shift material em actionScales</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(adaptiveComparison.explorationVsExploitationChanged)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">explorationVsExploitationBalance</span>
                          {adaptiveComparison.explorationVsExploitationChanged ? renderDirectionBadge('shift', 'rebalance') : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {adaptiveComparison.explorationVsExploitationChanges.map((change) => (
                            <span key={change.label} className="entity-public-debug-compare-row">
                              <strong>{change.label}</strong>
                              <span>{formatPolicyChange(change)}</span>
                            </span>
                          ))}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(adaptiveComparison.adaptationConfidenceChanged)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">adaptationConfidence</span>
                          {adaptiveComparison.adaptationConfidenceChanged
                            ? renderDirectionBadge(
                                resolveDirectionalChange(currentAdaptiveDecisionProfile.adaptationConfidence, nextAdaptiveDecisionProfile.adaptationConfidence),
                                nextAdaptiveDecisionProfile.adaptationConfidence >= currentAdaptiveDecisionProfile.adaptationConfidence ? 'ganho' : 'queda',
                              )
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          <span><strong>before</strong> {formatStrength(currentAdaptiveDecisionProfile.adaptationConfidence)}</span>
                          <span><strong>after</strong> {formatStrength(nextAdaptiveDecisionProfile.adaptationConfidence)}</span>
                          <span><strong>delta</strong> {formatDelta(nextAdaptiveDecisionProfile.adaptationConfidence - currentAdaptiveDecisionProfile.adaptationConfidence)}</span>
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(adaptiveComparison.decisionDriftChanged)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">decisionDrift</span>
                          {adaptiveComparison.decisionDriftChanged
                            ? renderDirectionBadge(
                                resolveDirectionalChange(currentAdaptiveDecisionProfile.decisionDrift, nextAdaptiveDecisionProfile.decisionDrift),
                                nextAdaptiveDecisionProfile.decisionDrift >= currentAdaptiveDecisionProfile.decisionDrift ? 'ganho' : 'queda',
                              )
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          <span><strong>before</strong> {formatStrength(currentAdaptiveDecisionProfile.decisionDrift)}</span>
                          <span><strong>after</strong> {formatStrength(nextAdaptiveDecisionProfile.decisionDrift)}</span>
                          <span><strong>delta</strong> {formatDelta(nextAdaptiveDecisionProfile.decisionDrift - currentAdaptiveDecisionProfile.decisionDrift)}</span>
                        </div>
                      </article>
                    </div>
                  </section>
                ) : null}

                {policyComparison && currentPolicyProfile && nextPolicyProfile ? (
                  <section className="entity-public-debug-section entity-public-debug-section--policy">
                    <div className="entity-public-debug-section__header">
                      <strong>Policy adaptativa</strong>
                      <span>comparativo before/after da policy persistida, alinhado ao outcome qualificado</span>
                    </div>
                    <div className="debug-insights">
                      <span className="debug-chip"><span className="debug-label">before stability</span><span className="debug-value">{formatStrength(currentPolicyProfile.policyStability)}</span></span>
                      <span className="debug-chip"><span className="debug-label">after stability</span><span className="debug-value">{formatStrength(nextPolicyProfile.policyStability)}</span></span>
                      <span className="debug-chip"><span className="debug-label">before drift</span><span className="debug-value">{formatStrength(currentPolicyProfile.policyDrift)}</span></span>
                      <span className="debug-chip"><span className="debug-label">after drift</span><span className="debug-value">{formatStrength(nextPolicyProfile.policyDrift)}</span></span>
                      <span className="debug-chip"><span className="debug-label">material dims</span><span className="debug-value">{policyComparison.materialDimensions.length}</span></span>
                    </div>

                    <div className="entity-public-debug-material-row" aria-label="mudancas materiais de policy">
                      {policyComparison.materialDimensions.length > 0 ? (
                        policyComparison.materialDimensions.map((dimension) => (
                          <span key={dimension} className="entity-public-debug-material-pill entity-public-debug-material-pill--policy">
                            {dimension}
                          </span>
                        ))
                      ) : (
                        <span className="entity-public-debug-material-pill entity-public-debug-material-pill--quiet">
                          sem shift material
                        </span>
                      )}
                    </div>

                    <div className="entity-public-debug-policy-grid">
                      <article className={resolveDebugCardClassName(policyComparison.decisionWeightsChanged)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">decisionWeights</span>
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {policyComparison.decisionWeightChanges.map((change) => (
                            <span key={change.label} className="entity-public-debug-compare-row">
                              <strong>{change.label}</strong>
                              <span>{formatPolicyChange(change)}</span>
                            </span>
                          ))}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(policyComparison.intentPriorityChanges.length > 0)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">intentPriorityOverrides</span>
                          {policyComparison.intentPriorityChanges.length > 0
                            ? renderDirectionBadge('shift', `${policyComparison.intentPriorityChanges.length} shifts`)
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {policyComparison.intentPriorityChanges.length > 0 ? (
                            <>
                              {policyComparison.intentPriorityChanges.slice(0, POLICY_MAX_VISIBLE_CHANGES).map((change) => (
                                <span key={change.label} className="entity-public-debug-compare-row">
                                  <strong>{change.label}</strong>
                                  <span>{formatPolicyChange(change)}</span>
                                </span>
                              ))}
                              {policyComparison.intentPriorityChanges.length > POLICY_MAX_VISIBLE_CHANGES ? (
                                <span>+{policyComparison.intentPriorityChanges.length - POLICY_MAX_VISIBLE_CHANGES} shifts adicionais</span>
                              ) : null}
                            </>
                          ) : (
                            <span>sem shift material nos overrides de intent</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(policyComparison.actionPreferenceChanges.length > 0, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">actionPreferenceMatrix</span>
                          {policyComparison.actionPreferenceChanges.length > 0
                            ? renderDirectionBadge('shift', `${policyComparison.actionPreferenceChanges.length} shifts`)
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {policyComparison.actionPreferenceChanges.length > 0 ? (
                            <>
                              {policyComparison.actionPreferenceChanges.slice(0, POLICY_MAX_VISIBLE_CHANGES).map((change) => (
                                <span key={change.label} className="entity-public-debug-compare-row">
                                  <strong>{change.label}</strong>
                                  <span>{formatPolicyChange(change)}</span>
                                </span>
                              ))}
                              {policyComparison.actionPreferenceChanges.length > POLICY_MAX_VISIBLE_CHANGES ? (
                                <span>+{policyComparison.actionPreferenceChanges.length - POLICY_MAX_VISIBLE_CHANGES} shifts adicionais</span>
                              ) : null}
                            </>
                          ) : (
                            <span>sem shift material na matriz de acao</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(policyComparison.confidenceProfileChanged, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">confidenceAdjustmentProfile</span>
                          {policyComparison.confidenceProfileChanged ? renderDirectionBadge('shift', 'ajustes ativos') : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {policyComparison.confidenceCoreChanges.map((change) => (
                            <span key={change.label} className="entity-public-debug-compare-row">
                              <strong>{change.label}</strong>
                              <span>{formatPolicyChange(change)}</span>
                            </span>
                          ))}
                          {policyComparison.confidenceIntentAdjustmentChanges.length > 0 ? (
                            policyComparison.confidenceIntentAdjustmentChanges.slice(0, POLICY_MAX_VISIBLE_CHANGES).map((change) => (
                              <span key={`intent:${change.label}`} className="entity-public-debug-compare-row">
                                <strong>{`intent:${change.label}`}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))
                          ) : (
                            <span>sem shift material em intentAdjustments</span>
                          )}
                          {policyComparison.confidenceActionAdjustmentChanges.length > 0 ? (
                            policyComparison.confidenceActionAdjustmentChanges.slice(0, POLICY_MAX_VISIBLE_CHANGES).map((change) => (
                              <span key={`action:${change.label}`} className="entity-public-debug-compare-row">
                                <strong>{`action:${change.label}`}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))
                          ) : (
                            <span>sem shift material em actionAdjustments</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(policyComparison.policyStabilityChanged)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">policyStability</span>
                          {policyComparison.policyStabilityChanged
                            ? renderDirectionBadge(
                                resolveDirectionalChange(currentPolicyProfile.policyStability, nextPolicyProfile.policyStability),
                                nextPolicyProfile.policyStability >= currentPolicyProfile.policyStability ? 'ganho' : 'queda',
                              )
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          <span><strong>before</strong> {formatStrength(currentPolicyProfile.policyStability)}</span>
                          <span><strong>after</strong> {formatStrength(nextPolicyProfile.policyStability)}</span>
                          <span><strong>delta</strong> {formatDelta(nextPolicyProfile.policyStability - currentPolicyProfile.policyStability)}</span>
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(policyComparison.policyDriftChanged)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">policyDrift</span>
                          {policyComparison.policyDriftChanged
                            ? renderDirectionBadge(
                                resolveDirectionalChange(currentPolicyProfile.policyDrift, nextPolicyProfile.policyDrift),
                                nextPolicyProfile.policyDrift >= currentPolicyProfile.policyDrift ? 'ganho' : 'queda',
                              )
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          <span><strong>before</strong> {formatStrength(currentPolicyProfile.policyDrift)}</span>
                          <span><strong>after</strong> {formatStrength(nextPolicyProfile.policyDrift)}</span>
                          <span><strong>delta</strong> {formatDelta(nextPolicyProfile.policyDrift - currentPolicyProfile.policyDrift)}</span>
                        </div>
                      </article>
                    </div>
                  </section>
                ) : null}

                {historicalComparison && currentHistoricalSignals && nextHistoricalSignals ? (
                  <section className="entity-public-debug-section entity-public-debug-section--historical">
                    <div className="entity-public-debug-section__header">
                      <strong>Historical signals</strong>
                      <span>comparativo before/after da evidencia agregada que alimenta adaptive e policy</span>
                    </div>
                    <div className="debug-insights">
                      <span className="debug-chip"><span className="debug-label">before interactions</span><span className="debug-value">{currentHistoricalSignals.totalInteractions}</span></span>
                      <span className="debug-chip"><span className="debug-label">after interactions</span><span className="debug-value">{nextHistoricalSignals.totalInteractions}</span></span>
                      <span className="debug-chip"><span className="debug-label">before evidence</span><span className="debug-value">{formatStrength(currentHistoricalSignals.reliableEvidenceCount)}</span></span>
                      <span className="debug-chip"><span className="debug-label">after evidence</span><span className="debug-value">{formatStrength(nextHistoricalSignals.reliableEvidenceCount)}</span></span>
                      <span className="debug-chip"><span className="debug-label">material dims</span><span className="debug-value">{historicalComparison.materialDimensions.length}</span></span>
                    </div>

                    <div className="entity-public-debug-material-row" aria-label="mudancas materiais de historical signals">
                      {historicalComparison.materialDimensions.length > 0 ? (
                        historicalComparison.materialDimensions.map((dimension) => (
                          <span key={dimension} className="entity-public-debug-material-pill entity-public-debug-material-pill--historical">
                            {dimension}
                          </span>
                        ))
                      ) : (
                        <span className="entity-public-debug-material-pill entity-public-debug-material-pill--quiet">
                          sem shift material
                        </span>
                      )}
                    </div>

                    <div className="entity-public-debug-historical-grid">
                      <article className={resolveDebugCardClassName(historicalComparison.materialCoreChanges.some((change) => change.label === 'totalInteractions' || change.label === 'reliableEvidenceCount'))}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">evidenceVolume</span>
                          {historicalComparison.materialCoreChanges.some((change) => change.label === 'totalInteractions' || change.label === 'reliableEvidenceCount')
                            ? renderDirectionBadge('shift', 'volume ativo')
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {historicalComparison.coreChanges
                            .filter((change) => change.label === 'totalInteractions' || change.label === 'reliableEvidenceCount')
                            .map((change) => (
                              <span key={change.label} className="entity-public-debug-compare-row">
                                <strong>{change.label}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(historicalComparison.materialCoreChanges.some((change) => change.label === 'rollingSuccessRate' || change.label === 'rollingContinuationRate' || change.label === 'rollingEngagementDelta'))}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">rollingSignals</span>
                          {historicalComparison.materialCoreChanges.some((change) => change.label === 'rollingSuccessRate' || change.label === 'rollingContinuationRate' || change.label === 'rollingEngagementDelta')
                            ? renderDirectionBadge('shift', 'rebalance')
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {historicalComparison.coreChanges
                            .filter(
                              (change) =>
                                change.label === 'rollingSuccessRate' ||
                                change.label === 'rollingContinuationRate' ||
                                change.label === 'rollingEngagementDelta',
                            )
                            .map((change) => (
                              <span key={change.label} className="entity-public-debug-compare-row">
                                <strong>{change.label}</strong>
                                <span>{formatPolicyChange(change)}</span>
                              </span>
                            ))}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(historicalComparison.actionOutcomeChanges.length > 0, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">actionOutcomes</span>
                          {historicalComparison.actionOutcomeChanges.length > 0
                            ? renderDirectionBadge('shift', `${historicalComparison.actionOutcomeChanges.length} shifts`)
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {historicalComparison.actionOutcomeChanges.length > 0 ? (
                            <>
                              {historicalComparison.actionOutcomeChanges.slice(0, HISTORICAL_MAX_VISIBLE_CHANGES).map((change) => (
                                <span key={change.label} className="entity-public-debug-compare-row">
                                  <strong>{change.label}</strong>
                                  <span>{formatPolicyChange(change)}</span>
                                </span>
                              ))}
                              {historicalComparison.actionOutcomeChanges.length > HISTORICAL_MAX_VISIBLE_CHANGES ? (
                                <span>+{historicalComparison.actionOutcomeChanges.length - HISTORICAL_MAX_VISIBLE_CHANGES} shifts adicionais</span>
                              ) : null}
                            </>
                          ) : (
                            <span>sem shift material nos outcomes por acao</span>
                          )}
                        </div>
                      </article>

                      <article className={resolveDebugCardClassName(historicalComparison.intentOutcomeChanges.length > 0, true)}>
                        <div className="entity-public-debug-card__title-row">
                          <span className="entity-public-debug-card__title">intentOutcomes</span>
                          {historicalComparison.intentOutcomeChanges.length > 0
                            ? renderDirectionBadge('shift', `${historicalComparison.intentOutcomeChanges.length} shifts`)
                            : null}
                        </div>
                        <div className="entity-public-debug-compare-list">
                          {historicalComparison.intentOutcomeChanges.length > 0 ? (
                            <>
                              {historicalComparison.intentOutcomeChanges.slice(0, HISTORICAL_MAX_VISIBLE_CHANGES).map((change) => (
                                <span key={change.label} className="entity-public-debug-compare-row">
                                  <strong>{change.label}</strong>
                                  <span>{formatPolicyChange(change)}</span>
                                </span>
                              ))}
                              {historicalComparison.intentOutcomeChanges.length > HISTORICAL_MAX_VISIBLE_CHANGES ? (
                                <span>+{historicalComparison.intentOutcomeChanges.length - HISTORICAL_MAX_VISIBLE_CHANGES} shifts adicionais</span>
                              ) : null}
                            </>
                          ) : (
                            <span>sem shift material nos outcomes por intent</span>
                          )}
                        </div>
                      </article>
                    </div>
                  </section>
                ) : null}

                <section className="entity-public-debug-section entity-public-debug-section--behavior">
                  <div className="entity-public-debug-section__header">
                    <strong>Feedback comportamental</strong>
                    <span>resultado local inferido da interacao e impacto no estado</span>
                  </div>
                  <div className="debug-insights">
                    <span className="debug-chip"><span className="debug-label">applied</span><span className="debug-value">{formatBoolean(Boolean(visualDebug.decision.behaviorFeedbackInfluence?.applied))}</span></span>
                    <span className="debug-chip"><span className="debug-label">strength</span><span className="debug-value">{formatStrength(visualDebug.decision.behaviorFeedbackInfluence?.influenceStrength)}</span></span>
                    <span className="debug-chip"><span className="debug-label">provenance</span><span className="debug-value">{visualDebug.qualifiedInteractionOutcome?.provenance ?? 'n/a'}</span></span>
                    <span className="debug-chip"><span className="debug-label">confidence</span><span className="debug-value">{formatStrength(visualDebug.qualifiedInteractionOutcome?.confidence)}</span></span>
                    <span className="debug-chip"><span className="debug-label">continuation</span><span className="debug-value">{formatBoolean(visualDebug.interactionOutcome.userContinuation)}</span></span>
                    <span className="debug-chip"><span className="debug-label">success</span><span className="debug-value">{formatStrength(typeof visualDebug.interactionOutcome.interactionSuccess === 'number' ? visualDebug.interactionOutcome.interactionSuccess : visualDebug.interactionOutcome.interactionSuccess ? 1 : 0)}</span></span>
                  </div>

                  <div className="entity-public-debug-subgrid">
                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">Outcome local usado</span>
                      <div className="entity-public-debug-list">
                        <span><strong>engagementDelta</strong> {formatDelta(visualDebug.interactionOutcome.engagementDelta)}</span>
                        <span><strong>signalStrength</strong> {formatStrength(visualDebug.interactionOutcome.signalStrength)}</span>
                      </div>
                    </article>

                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">Signals usados</span>
                      <div className="entity-public-debug-list">
                        {(visualDebug.decision.behaviorFeedbackInfluence?.outcomeSignalsUsed ?? []).map((signal) => (
                          <span key={`${signal.signal}:${String(signal.value)}`}>
                            <strong>{signal.signal}</strong> {formatSignalValue(signal.value)} · peso {formatStrength(signal.influenceScore)}
                          </span>
                        ))}
                      </div>
                    </article>
                  </div>

                  <div className="entity-public-debug-impact-grid">
                    {visualDebug.decision.behaviorFeedbackInfluence ? (
                      <>
                        <article className="entity-public-debug-card">
                          <span className="entity-public-debug-card__title">focus</span>
                          <div className="entity-public-debug-list">
                            <span><strong>before</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.focusLevel.before)}</span>
                            <span><strong>after</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.focusLevel.after)}</span>
                            <span><strong>delta</strong> {formatDelta(visualDebug.decision.behaviorFeedbackInfluence.impact.focusLevel.delta)}</span>
                          </div>
                        </article>
                        <article className="entity-public-debug-card">
                          <span className="entity-public-debug-card__title">engagement</span>
                          <div className="entity-public-debug-list">
                            <span><strong>before</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.engagementLevel.before)}</span>
                            <span><strong>after</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.engagementLevel.after)}</span>
                            <span><strong>delta</strong> {formatDelta(visualDebug.decision.behaviorFeedbackInfluence.impact.engagementLevel.delta)}</span>
                          </div>
                        </article>
                        <article className="entity-public-debug-card">
                          <span className="entity-public-debug-card__title">stability</span>
                          <div className="entity-public-debug-list">
                            <span><strong>before</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.stability.before)}</span>
                            <span><strong>after</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.stability.after)}</span>
                            <span><strong>delta</strong> {formatDelta(visualDebug.decision.behaviorFeedbackInfluence.impact.stability.delta)}</span>
                          </div>
                        </article>
                        <article className="entity-public-debug-card">
                          <span className="entity-public-debug-card__title">adaptation</span>
                          <div className="entity-public-debug-list">
                            <span><strong>before</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.adaptationMomentum.before)}</span>
                            <span><strong>after</strong> {formatStrength(visualDebug.decision.behaviorFeedbackInfluence.impact.adaptationMomentum.after)}</span>
                            <span><strong>delta</strong> {formatDelta(visualDebug.decision.behaviorFeedbackInfluence.impact.adaptationMomentum.delta)}</span>
                          </div>
                        </article>
                      </>
                    ) : null}
                  </div>
                </section>

                <section className="entity-public-debug-section entity-public-debug-section--state-evolution">
                  <div className="entity-public-debug-section__header">
                    <strong>Evolucao do estado cognitivo</strong>
                    <span>comparativo before/after do estado interno local</span>
                  </div>

                  <div className="entity-public-debug-state-grid">
                    <article className="entity-public-debug-card entity-public-debug-card--state-span">
                      <span className="entity-public-debug-card__title">Modo e drive</span>
                      <div className="entity-public-debug-compare-list">
                        <span className="entity-public-debug-compare-row">
                          <strong>currentMode</strong>
                          <span>{formatModeShift(visualDebug.currentCognitiveState.currentMode, visualDebug.nextCognitiveState.currentMode)}</span>
                        </span>
                        <span className="entity-public-debug-compare-row">
                          <strong>dominantDrive</strong>
                          <span>{formatModeShift(visualDebug.currentCognitiveState.dominantDrive, visualDebug.nextCognitiveState.dominantDrive)}</span>
                        </span>
                      </div>
                    </article>

                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">tensionLevel</span>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentCognitiveState.tensionLevel)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextCognitiveState.tensionLevel)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextCognitiveState.tensionLevel - visualDebug.currentCognitiveState.tensionLevel)}</span>
                      </div>
                    </article>

                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">focusLevel</span>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentCognitiveState.focusLevel)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextCognitiveState.focusLevel)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextCognitiveState.focusLevel - visualDebug.currentCognitiveState.focusLevel)}</span>
                      </div>
                    </article>

                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">engagementLevel</span>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentCognitiveState.engagementLevel)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextCognitiveState.engagementLevel)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextCognitiveState.engagementLevel - visualDebug.currentCognitiveState.engagementLevel)}</span>
                      </div>
                    </article>

                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">stability</span>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentCognitiveState.stability)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextCognitiveState.stability)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextCognitiveState.stability - visualDebug.currentCognitiveState.stability)}</span>
                      </div>
                    </article>

                    <article className="entity-public-debug-card">
                      <span className="entity-public-debug-card__title">adaptationMomentum</span>
                      <div className="entity-public-debug-compare-list">
                        <span><strong>before</strong> {formatStrength(visualDebug.currentCognitiveState.adaptationMomentum)}</span>
                        <span><strong>after</strong> {formatStrength(visualDebug.nextCognitiveState.adaptationMomentum)}</span>
                        <span><strong>delta</strong> {formatDelta(visualDebug.nextCognitiveState.adaptationMomentum - visualDebug.currentCognitiveState.adaptationMomentum)}</span>
                      </div>
                    </article>
                  </div>
                </section>
              </div>

              <details className="entity-public-debug-raw">
                <summary>JSON completo</summary>
                <pre>{JSON.stringify({
                  decision: visualDebug.decision,
                  visualState: visualDebug.visualState,
                  runtimePatch: visualDebug.runtimePatch,
                  currentCognitiveState: visualDebug.currentCognitiveState,
                  currentHistoricalSignals: visualDebug.currentHistoricalSignals,
                  adaptiveDecisionCore: visualDebug.adaptiveDecisionCore,
                  previousTerminalAuthority: visualDebug.previousTerminalAuthority,
                  terminalAuthorityShift: visualDebug.terminalAuthorityShift,
                  authorityRegimeCorrelation: visualDebug.authorityRegimeCorrelation,
                  correlationType: visualDebug.correlationType,
                  structuralTransitionQuality: visualDebug.structuralTransitionQuality,
                  structuralTransitionDirection: visualDebug.structuralTransitionDirection,
                  structuralTransitionStability: visualDebug.structuralTransitionStability,
                  structuralTransitionMaturity: visualDebug.structuralTransitionMaturity,
                  falsePositiveGain: visualDebug.falsePositiveGain,
                  falsePositiveCause: visualDebug.falsePositiveCause,
                  causeCategory: visualDebug.causeCategory,
                  secondaryCauses: visualDebug.secondaryCauses,
                  causeRanking: visualDebug.causeRanking,
                  temporalCauseChain: visualDebug.temporalCauseChain,
                  causeTimeline: visualDebug.causeTimeline,
                  causeOriginTurn: visualDebug.causeOriginTurn,
                  falsePositiveReason: visualDebug.falsePositiveReason,
                  terminalAuthority: visualDebug.terminalAuthority,
                  semanticFrozen: visualDebug.semanticFrozen,
                  terminalReason: visualDebug.terminalReason,
                  proposalEvidence: visualDebug.proposalEvidence,
                  dominantEvidence: visualDebug.dominantEvidence,
                  dominantReason: visualDebug.dominantReason,
                  confidenceArbitration: visualDebug.confidenceArbitration,
                  adaptiveSovereigntyHistory: visualDebug.adaptiveSovereigntyHistory,
                  currentAdaptiveDecisionProfile: visualDebug.currentAdaptiveDecisionProfile,
                  currentPolicyProfile: visualDebug.currentPolicyProfile,
                  nextCognitiveState: visualDebug.nextCognitiveState,
                  nextHistoricalSignals: visualDebug.nextHistoricalSignals,
                  nextAdaptiveDecisionProfile: visualDebug.nextAdaptiveDecisionProfile,
                  nextPolicyProfile: visualDebug.nextPolicyProfile,
                  currentStrategyProfile: visualDebug.currentStrategyProfile,
                  nextStrategyProfile: visualDebug.nextStrategyProfile,
                  interactionOutcome: visualDebug.interactionOutcome,
                  qualifiedInteractionOutcome: visualDebug.qualifiedInteractionOutcome,
                  memoryPersistence: visualDebug.memoryPersistence,
                }, null, 2)}</pre>
              </details>
            </div>
          </details>
        ) : null}
      </section>
    </main>
  )
}

export default PublicPresencePage
