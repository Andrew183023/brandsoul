import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindDecisionEnvelope } from './flowMindContracts.js'
import type {
  FlowMindAuthorityObservation,
  FlowMindDecisionComparison,
  FlowMindDecisionDivergenceType,
  FlowMindServiceSummary,
} from '../services/flowMindPort.js'
import type { OrchestratorCommand } from './orchestratorState.js'
import { mapSafeSovereignActionToEntityActionType } from './flowMindSafeActionMapping.js'

export const FLOW_MIND_SERVICE_NOTE_PREFIX = 'flowmind-service:'
export const FLOW_MIND_POST_SAFE_MAPPING_MARKER = 'post-safe-mapping-v1'

type FlowMindRolloutWindowMarker = typeof FLOW_MIND_POST_SAFE_MAPPING_MARKER

type FlowMindServiceSnapshot = {
  version: 4
  summary: FlowMindServiceSummary
  comparison?: FlowMindDecisionComparison
  authority?: FlowMindAuthorityObservation
  rolloutWindow?: FlowMindRolloutWindowMarker
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function normalizeAction(action: string) {
  const normalized = action.trim().toLowerCase()

  if (normalized === 'triggerexport' || normalized === 'suggestproduct' || normalized === 'sell') {
    return 'sell'
  }

  if (normalized === 'suggestdiscovery' || normalized === 'askquestion' || normalized === 'guide') {
    return 'guide'
  }

  if (normalized === 'sendmessage' || normalized === 'inform' || normalized === 'support') {
    return 'support'
  }

  if (normalized === 'refuse') {
    return 'refuse'
  }

  return normalized
}

function determineDivergenceType(args: {
  intentChanged: boolean
  actionChanged: boolean
  authorityChanged: boolean
}): FlowMindDecisionDivergenceType {
  if (!args.intentChanged && !args.actionChanged && !args.authorityChanged) {
    return 'aligned'
  }

  if (args.authorityChanged && (args.intentChanged || args.actionChanged)) {
    return 'semantic-and-authority-drift'
  }

  if (args.authorityChanged) {
    return 'authority-shift'
  }

  if (args.intentChanged && args.actionChanged) {
    return 'semantic-drift'
  }

  if (args.intentChanged) {
    return 'intent-drift'
  }

  return 'action-drift'
}

function buildSemanticDifferenceSummary(args: {
  intentChanged: boolean
  actionChanged: boolean
  legacyIntent: string
  legacyAction: string
  flowMindIntent: string
  flowMindAction: string
  confidenceDelta: number
}) {
  if (!args.intentChanged && !args.actionChanged) {
    if (args.confidenceDelta < 0.08) {
      return 'Legado e FlowMind ficaram semanticamente alinhados.'
    }

    return `Semântica alinhada com variação leve de confiança (${args.confidenceDelta.toFixed(2)}).`
  }

  if (args.intentChanged && args.actionChanged) {
    return `Intent ${args.legacyIntent} -> ${args.flowMindIntent}; ação ${args.legacyAction} -> ${args.flowMindAction}.`
  }

  if (args.intentChanged) {
    return `Intent divergente: legado ${args.legacyIntent}, FlowMind ${args.flowMindIntent}.`
  }

  return `Ação divergente: legado ${args.legacyAction}, FlowMind ${args.flowMindAction}.`
}

function buildAuthorityDifferenceSummary(summary: FlowMindServiceSummary) {
  if (summary.decisionSource === 'heuristic-base' && summary.terminalAuthority === 'heuristic-fallback' && !summary.semanticFrozen) {
    return 'FlowMind permaneceu em fallback heurístico comparável ao baseline.'
  }

  if (summary.decisionSource === 'adaptive-core' && summary.terminalAuthority === 'adaptive-core' && summary.semanticFrozen) {
    return 'Adaptive core assumiu a decisão e congelou a semântica terminal.'
  }

  return `Shadow operou com decisionSource ${summary.decisionSource} e terminalAuthority ${summary.terminalAuthority}.`
}

function computeDivergenceScore(args: {
  intentChanged: boolean
  actionChanged: boolean
  authorityChanged: boolean
  confidenceDelta: number
  fallbackUsed: boolean
}) {
  return roundMetric(clamp(
    (args.intentChanged ? 0.42 : 0)
      + (args.actionChanged ? 0.32 : 0)
      + Math.min(args.confidenceDelta, 0.2)
      + (args.authorityChanged ? 0.12 : 0)
      + (args.fallbackUsed ? 0.06 : 0),
  ))
}

function computeStabilityScore(args: {
  divergenceScore: number
  fallbackUsed: boolean
  summary: FlowMindServiceSummary
}) {
  return roundMetric(clamp(
    1
      - args.divergenceScore
      - (args.fallbackUsed ? 0.08 : 0)
      + (args.summary.decisionSource === 'adaptive-core' && !args.fallbackUsed ? 0.06 : 0)
      + (args.summary.semanticFrozen ? 0.03 : 0),
  ))
}

function isAdaptiveSuccess(comparison: FlowMindDecisionComparison) {
  return comparison.flowMindDecision.decisionSource === 'adaptive-core'
    && !comparison.flowMindDecision.fallbackUsed
    && comparison.metrics.divergenceScore <= 0.34
}

function buildSnapshot(args: {
  summary: FlowMindServiceSummary
  comparison?: FlowMindDecisionComparison
  authority?: FlowMindAuthorityObservation
  rolloutWindow?: FlowMindRolloutWindowMarker
}): FlowMindServiceSnapshot {
  return {
    version: 4,
    summary: args.summary,
    comparison: args.comparison,
    authority: args.authority,
    rolloutWindow: args.rolloutWindow,
  }
}

function isRolloutWindowMarker(value: unknown): value is FlowMindRolloutWindowMarker {
  return value === FLOW_MIND_POST_SAFE_MAPPING_MARKER
}

function isAuthorityObservationCandidate(value: unknown): value is FlowMindAuthorityObservation {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.authorityEligible === 'boolean'
    && typeof record.authorityGranted === 'boolean'
    && typeof record.authorityZone === 'string'
    && typeof record.authorityCommand === 'string'
    && (record.authorityDeniedReason === undefined || typeof record.authorityDeniedReason === 'string')
    && (record.autonomyLevel === undefined || record.autonomyLevel === 'manual' || record.autonomyLevel === 'supervised' || record.autonomyLevel === 'partial' || record.autonomyLevel === 'autonomous')
    && (record.promotionEligible === undefined || typeof record.promotionEligible === 'boolean')
    && (record.rollbackTriggered === undefined || typeof record.rollbackTriggered === 'boolean')
    && (record.rollbackReason === undefined || typeof record.rollbackReason === 'string')
}

function isSummaryCandidate(value: unknown): value is FlowMindServiceSummary {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return (record.mode === 'shadow' || record.mode === 'dry-run' || record.mode === 'debug' || record.mode === 'active')
    && typeof record.adapterName === 'string'
    && (record.adapterLoadStatus === 'loaded' || record.adapterLoadStatus === 'backend-base-only' || record.adapterLoadStatus === 'load-failed')
    && typeof record.invokedAt === 'string'
    && typeof record.decisionSource === 'string'
    && typeof record.terminalAuthority === 'string'
    && typeof record.semanticFrozen === 'boolean'
    && Array.isArray(record.fallbackConditions)
    && typeof record.fallbackUsed === 'boolean'
    && !!record.decision
    && typeof (record.decision as Record<string, unknown>).intent === 'string'
    && typeof (record.decision as Record<string, unknown>).action === 'string'
    && typeof (record.decision as Record<string, unknown>).confidence === 'number'
}

function isComparisonCandidate(value: unknown): value is FlowMindDecisionComparison {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return !!record.legacyDecision
    && !!record.flowMindDecision
    && typeof record.divergenceType === 'string'
    && !!record.semanticDifference
    && !!record.authorityDifference
    && !!record.metrics
}

export function serializeFlowMindServiceSnapshot(args: {
  summary: FlowMindServiceSummary
  comparison?: FlowMindDecisionComparison
  authority?: FlowMindAuthorityObservation
}) {
  return `${FLOW_MIND_SERVICE_NOTE_PREFIX}${JSON.stringify(buildSnapshot({
    summary: args.summary,
    comparison: args.comparison,
    authority: args.authority,
    rolloutWindow: FLOW_MIND_POST_SAFE_MAPPING_MARKER,
  }))}`
}

export function parseFlowMindServiceSnapshot(note: string): FlowMindServiceSnapshot | undefined {
  if (!note.startsWith(FLOW_MIND_SERVICE_NOTE_PREFIX)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(note.slice(FLOW_MIND_SERVICE_NOTE_PREFIX.length)) as unknown
    if (isSummaryCandidate(parsed)) {
      return buildSnapshot({ summary: parsed })
    }

    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }

    const record = parsed as Record<string, unknown>
    if (!isSummaryCandidate(record.summary)) {
      return undefined
    }

    return {
      ...buildSnapshot({
        summary: record.summary,
        comparison: isComparisonCandidate(record.comparison) ? record.comparison : undefined,
        authority: isAuthorityObservationCandidate(record.authority) ? record.authority : undefined,
        rolloutWindow: isRolloutWindowMarker(record.rolloutWindow) ? record.rolloutWindow : undefined,
      }),
    }
  } catch {
    return undefined
  }
}

export function listFlowMindServiceSnapshots(entityProfile?: EntityProfile) {
  return (entityProfile?.metadata.notes ?? [])
    .map((note) => parseFlowMindServiceSnapshot(note))
    .filter((snapshot): snapshot is FlowMindServiceSnapshot => snapshot !== undefined)
}

export function buildFlowMindDecisionComparison(args: {
  entityProfile?: EntityProfile
  legacyDecision: FlowMindDecisionEnvelope
  summary: FlowMindServiceSummary
  command: OrchestratorCommand
  now: string
}): FlowMindDecisionComparison {
  const legacyAction = args.legacyDecision.lineage.entityAction.type
  const flowMindAction = args.summary.decision.action
  const mappedSafeFlowMindAction = mapSafeSovereignActionToEntityActionType(args.command.name, flowMindAction)
  const intentChanged = args.legacyDecision.decision.intent !== args.summary.decision.intent
  const actionChanged = mappedSafeFlowMindAction
    ? legacyAction !== mappedSafeFlowMindAction
    : normalizeAction(legacyAction) !== normalizeAction(flowMindAction)
  const confidenceDelta = roundMetric(Math.abs(args.legacyDecision.decision.confidence - args.summary.decision.confidence))
  const authorityChanged = args.summary.decisionSource !== 'heuristic-base'
    || args.summary.terminalAuthority !== 'heuristic-fallback'
    || args.summary.semanticFrozen
  const divergenceType = determineDivergenceType({
    intentChanged,
    actionChanged,
    authorityChanged,
  })
  const semanticDifference = {
    intentChanged,
    actionChanged,
    confidenceDelta,
    summary: buildSemanticDifferenceSummary({
      intentChanged,
      actionChanged,
      legacyIntent: args.legacyDecision.decision.intent,
      legacyAction,
      flowMindIntent: args.summary.decision.intent,
      flowMindAction: mappedSafeFlowMindAction ?? flowMindAction,
      confidenceDelta,
    }),
  }
  const authorityDifference = {
    authorityChanged,
    legacyAuthority: 'orchestrator-legacy' as const,
    flowMindDecisionSource: args.summary.decisionSource,
    flowMindTerminalAuthority: args.summary.terminalAuthority,
    semanticFrozen: args.summary.semanticFrozen,
    summary: buildAuthorityDifferenceSummary(args.summary),
  }
  const provisionalDivergenceScore = computeDivergenceScore({
    intentChanged,
    actionChanged,
    authorityChanged,
    confidenceDelta,
    fallbackUsed: args.summary.fallbackUsed,
  })
  const provisionalStabilityScore = computeStabilityScore({
    divergenceScore: provisionalDivergenceScore,
    fallbackUsed: args.summary.fallbackUsed,
    summary: args.summary,
  })

  const comparison: FlowMindDecisionComparison = {
    legacyDecision: {
      commandId: args.command.commandId,
      commandName: args.command.name,
      evaluatedAt: args.now,
      authority: 'orchestrator-legacy',
      intent: args.legacyDecision.decision.intent,
      action: legacyAction,
      confidence: args.legacyDecision.decision.confidence,
    },
    flowMindDecision: {
      commandId: args.command.commandId,
      commandName: args.command.name,
      evaluatedAt: args.summary.invokedAt,
      intent: args.summary.decision.intent,
      action: flowMindAction,
      confidence: args.summary.decision.confidence,
      decisionSource: args.summary.decisionSource,
      terminalAuthority: args.summary.terminalAuthority,
      semanticFrozen: args.summary.semanticFrozen,
      fallbackUsed: args.summary.fallbackUsed,
    },
    divergenceType,
    semanticDifference,
    authorityDifference,
    metrics: {
      divergenceScore: provisionalDivergenceScore,
      stabilityScore: provisionalStabilityScore,
      fallbackRate: args.summary.fallbackUsed ? 1 : 0,
      adaptiveSuccessRate: 0,
      sampleSize: 1,
    },
  }

  const history = [comparison, ...listFlowMindServiceSnapshots(args.entityProfile)
    .map((snapshot) => snapshot.comparison)
    .filter((entry): entry is FlowMindDecisionComparison => entry !== undefined)]
  const fallbackCount = history.filter((entry) => entry.flowMindDecision.fallbackUsed).length
  const adaptiveAttempts = history.filter((entry) => entry.flowMindDecision.decisionSource === 'adaptive-core').length
  const adaptiveSuccesses = history.filter((entry) => isAdaptiveSuccess(entry)).length

  comparison.metrics = {
    divergenceScore: provisionalDivergenceScore,
    stabilityScore: provisionalStabilityScore,
    fallbackRate: roundMetric(fallbackCount / history.length),
    adaptiveSuccessRate: adaptiveAttempts > 0 ? roundMetric(adaptiveSuccesses / adaptiveAttempts) : 0,
    sampleSize: history.length,
  }

  return comparison
}