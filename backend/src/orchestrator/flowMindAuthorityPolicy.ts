import type { EntityAction } from '../brain/domain/entity/contracts/EntityAction.js'
import type { EntityIntentType } from '../brain/domain/entity/contracts/EntityIntent.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindDecisionOutput } from '../brain/domain/entity/contracts/FlowMindState.js'
import type {
  FlowMindAuthorityScopeZone,
  FlowMindAutonomyLevel,
  FlowMindAutonomyMetrics,
  FlowMindServiceResult,
} from '../services/flowMindPort.js'
import type { OrchestratorCommand } from './orchestratorState.js'
import type { FlowMindDecisionComparison } from '../services/flowMindPort.js'
import { listFlowMindServiceSnapshots } from './flowMindComparison.js'
import { mapSafeSovereignActionToEntityActionType } from './flowMindSafeActionMapping.js'
import type { MultiEntityLifecycleState, MultiEntityRiskLevel } from './multiEntityRegistry.js'

export type FlowMindAutonomyActionType =
  | 'create_entity'
  | 'update_identity'
  | 'launch_campaign'
  | 'respond_to_lead'
  | 'route_lead'
  | 'create_marketplace_case'
  | 'dispatch_professional'
  | 'modify_pricing'
  | 'publish_public_content'

export const FLOWMIND_AUTONOMY_MATRIX: Record<FlowMindAutonomyActionType, FlowMindAutonomyLevel[]> = {
  create_entity: ['partial', 'autonomous'],
  update_identity: ['supervised', 'partial', 'autonomous'],
  launch_campaign: ['partial', 'autonomous'],
  respond_to_lead: ['supervised', 'partial', 'autonomous'],
  route_lead: ['supervised', 'partial', 'autonomous'],
  create_marketplace_case: ['manual', 'supervised'],
  dispatch_professional: ['manual', 'supervised'],
  modify_pricing: ['manual', 'supervised'],
  publish_public_content: ['supervised', 'partial', 'autonomous'],
}

export type FlowMindAutonomyActionPermission = {
  allowed: boolean
  requiresApproval: boolean
  reason?: string
}

export type FlowMindAuthorityPolicyThresholds = {
  maxDivergenceScore: number
  minStabilityScore: number
  maxFallbackRate: number
  minAdaptiveSuccessRate: number
  minSampleSize: number
  maxErrorRate: number
  minDecisionStability: number
}

export type FlowMindAutonomyRollbackTrigger = {
  active: boolean
  reason?: string
}

export type FlowMindAuthorityPolicyResult = {
  applied: boolean
  zone: FlowMindAuthorityScopeZone
  reason: string
  action?: EntityAction
  autonomyLevel: FlowMindAutonomyLevel
  promotionEligible: boolean
  autonomyMetrics: FlowMindAutonomyMetrics
  rollbackTrigger: FlowMindAutonomyRollbackTrigger
  thresholds: FlowMindAuthorityPolicyThresholds
}

export const DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS: FlowMindAuthorityPolicyThresholds = {
  maxDivergenceScore: 0.24,
  minStabilityScore: 0.78,
  maxFallbackRate: 0.2,
  minAdaptiveSuccessRate: 0.6,
  minSampleSize: 5,
  maxErrorRate: 0.22,
  minDecisionStability: 0.8,
}

const SAFE_ALIGNED_MAX_DIVERGENCE_SCORE = 0.28
const AUTONOMY_HISTORY_WINDOW = 6

const SAFE_COMMANDS: OrchestratorCommand['name'][] = ['trigger_export', 'start_birth', 'resume_birth']
const PROHIBITED_COMMANDS: OrchestratorCommand['name'][] = ['apply_control', 'set_stage', 'pause_birth']

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function autonomyLevelRank(level: FlowMindAutonomyLevel) {
  switch (level) {
    case 'autonomous':
      return 3
    case 'partial':
      return 2
    case 'supervised':
      return 1
    default:
      return 0
  }
}

export function checkAutonomyActionPermission(args: {
  actionType: FlowMindAutonomyActionType
  autonomyLevel: FlowMindAutonomyLevel
  riskLevel: MultiEntityRiskLevel
  approvalRequired: boolean
  lifecycleState?: MultiEntityLifecycleState
}): FlowMindAutonomyActionPermission {
  const allowedLevels = FLOWMIND_AUTONOMY_MATRIX[args.actionType]
  if (!allowedLevels.includes(args.autonomyLevel)) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: 'autonomy-matrix-denied',
    }
  }

  if (args.actionType === 'create_entity') {
    if (args.approvalRequired) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'create-entity-approval-required',
      }
    }

    if (args.riskLevel !== 'low') {
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'create-entity-risk-too-high',
      }
    }

    if (args.lifecycleState && args.lifecycleState !== 'sandbox' && args.lifecycleState !== 'internal-active' && args.lifecycleState !== 'proposed') {
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'create-entity-lifecycle-blocked',
      }
    }
  }

  if ((args.actionType === 'publish_public_content' || args.actionType === 'launch_campaign')
    && args.riskLevel !== 'low'
    && autonomyLevelRank(args.autonomyLevel) < autonomyLevelRank('autonomous')) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: 'public-action-approval-required',
    }
  }

  return {
    allowed: true,
    requiresApproval: false,
  }
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function createDefaultAutonomyMetrics(sampleSize = 0): FlowMindAutonomyMetrics {
  return {
    averageErrorRate: 1,
    decisionStability: 0,
    averageDivergenceScore: 1,
    sampleSize,
  }
}

function buildAutonomyMetrics(args: {
  entityProfile: EntityProfile
  comparison: FlowMindDecisionComparison
}): FlowMindAutonomyMetrics {
  const historicalComparisons = listFlowMindServiceSnapshots(args.entityProfile)
    .map((snapshot) => snapshot.comparison)
    .filter((comparison): comparison is FlowMindDecisionComparison => comparison !== undefined)

  const window = [args.comparison, ...historicalComparisons].slice(0, AUTONOMY_HISTORY_WINDOW)
  if (window.length === 0) {
    return createDefaultAutonomyMetrics(0)
  }

  const totals = window.reduce((accumulator, comparison) => {
    accumulator.errorRate += clamp(1 - comparison.metrics.adaptiveSuccessRate)
    accumulator.averageDivergenceScore += comparison.metrics.divergenceScore
    accumulator.decisionStability += comparison.semanticDifference.intentChanged || comparison.semanticDifference.actionChanged ? 0 : 1
    return accumulator
  }, {
    errorRate: 0,
    averageDivergenceScore: 0,
    decisionStability: 0,
  })

  return {
    averageErrorRate: roundMetric(totals.errorRate / window.length),
    decisionStability: roundMetric(totals.decisionStability / window.length),
    averageDivergenceScore: roundMetric(totals.averageDivergenceScore / window.length),
    sampleSize: window.length,
  }
}

function resolveAutonomyLevel(args: {
  applied: boolean
  promotionEligible: boolean
}): FlowMindAutonomyLevel {
  if (args.applied) {
    return 'partial'
  }

  if (args.promotionEligible) {
    return 'supervised'
  }

  return 'manual'
}

function buildRollbackTrigger(args: {
  entityProfile: EntityProfile
  comparison: FlowMindDecisionComparison
  autonomyMetrics: FlowMindAutonomyMetrics
  effectiveMaxDivergenceScore: number
  thresholds: FlowMindAuthorityPolicyThresholds
}): FlowMindAutonomyRollbackTrigger {
  const hadRecentAuthority = listFlowMindServiceSnapshots(args.entityProfile)
    .slice(0, AUTONOMY_HISTORY_WINDOW)
    .some((snapshot) => snapshot.authority?.authorityGranted === true)

  if (!hadRecentAuthority) {
    return { active: false }
  }

  if (args.comparison.metrics.adaptiveSuccessRate < (1 - args.thresholds.maxErrorRate)) {
    return {
      active: true,
      reason: 'rollback-error-rate-too-high',
    }
  }

  if (args.comparison.metrics.stabilityScore < args.thresholds.minStabilityScore) {
    return {
      active: true,
      reason: 'rollback-decision-stability-too-low',
    }
  }

  if (args.comparison.metrics.divergenceScore > args.effectiveMaxDivergenceScore) {
    return {
      active: true,
      reason: 'rollback-divergence-too-high',
    }
  }

  if (args.autonomyMetrics.averageErrorRate > args.thresholds.maxErrorRate) {
    return {
      active: true,
      reason: 'rollback-error-rate-too-high',
    }
  }

  if (args.autonomyMetrics.decisionStability < args.thresholds.minDecisionStability) {
    return {
      active: true,
      reason: 'rollback-decision-stability-too-low',
    }
  }

  if (args.autonomyMetrics.averageDivergenceScore > args.effectiveMaxDivergenceScore) {
    return {
      active: true,
      reason: 'rollback-divergence-too-high',
    }
  }

  return { active: false }
}

function buildDeniedResult(args: {
  zone: FlowMindAuthorityScopeZone
  reason: string
  thresholds: FlowMindAuthorityPolicyThresholds
  autonomyMetrics?: FlowMindAutonomyMetrics
  promotionEligible?: boolean
  rollbackTrigger?: FlowMindAutonomyRollbackTrigger
}): FlowMindAuthorityPolicyResult {
  const autonomyMetrics = args.autonomyMetrics ?? createDefaultAutonomyMetrics(0)
  const promotionEligible = args.promotionEligible ?? false
  const rollbackTrigger = args.rollbackTrigger ?? { active: false }

  return {
    applied: false,
    zone: args.zone,
    reason: rollbackTrigger.active ? rollbackTrigger.reason ?? args.reason : args.reason,
    autonomyLevel: resolveAutonomyLevel({
      applied: false,
      promotionEligible,
    }),
    promotionEligible,
    autonomyMetrics,
    rollbackTrigger,
    thresholds: args.thresholds,
  }
}

function mapDecisionIntentToEntityIntentType(intent: string, fallback: EntityIntentType): EntityIntentType {
  if (intent === 'promotion') {
    return 'convert'
  }

  if (intent === 'support') {
    return 'assist'
  }

  if (intent === 'general') {
    return 'engage'
  }

  return fallback
}

function buildGuidanceMessage(topic?: string) {
  return topic && topic.trim().length > 0
    ? `FlowMind orienta foco contextual em ${topic.trim()}.`
    : 'FlowMind orienta um próximo passo contextual e reversível.'
}

function buildQuestion(topic?: string) {
  return topic && topic.trim().length > 0
    ? `Qual sinal adicional deve reforçar ${topic.trim()} nesta entidade?`
    : 'Qual sinal adicional deve ser reforçado agora nesta entidade?'
}

function resolveEffectiveMaxDivergenceScore(args: {
  comparison: FlowMindDecisionComparison
  command: OrchestratorCommand
  thresholds: FlowMindAuthorityPolicyThresholds
}) {
  const isSafeAlignedCase = SAFE_COMMANDS.includes(args.command.name)
    && !args.comparison.semanticDifference.intentChanged
    && !args.comparison.semanticDifference.actionChanged

  return isSafeAlignedCase
    ? Math.max(args.thresholds.maxDivergenceScore, SAFE_ALIGNED_MAX_DIVERGENCE_SCORE)
    : args.thresholds.maxDivergenceScore
}

function buildPartialAuthorityAction(args: {
  entityProfile: EntityProfile
  legacyDecision: FlowMindDecisionOutput
  sovereignFlowMind: FlowMindServiceResult
  command: OrchestratorCommand
  now: string
}): EntityAction | undefined {
  const topic = args.sovereignFlowMind.output.decision.responsePlan.topic
  const fallbackIntentType = args.legacyDecision.entityIntent.type
  const legacyIntentContext = args.legacyDecision.entityIntent.context ?? {}
  const mappedIntentType = mapDecisionIntentToEntityIntentType(
    args.sovereignFlowMind.output.decision.intent,
    fallbackIntentType,
  )
  const mappedActionType = mapSafeSovereignActionToEntityActionType(
    args.command.name,
    args.sovereignFlowMind.output.decision.action,
  )

  if (mappedActionType === 'triggerExport') {
    return {
      schemaVersion: 1,
      entityId: args.entityProfile.id,
      type: 'triggerExport',
      payload: {
        message: buildGuidanceMessage(topic),
        suggestion: 'Permitir export autoritativo controlado do FlowMind para esta entidade.',
        metadata: {
          authorityMode: 'flowmind-partial',
          policyZone: 'safe',
          commandName: args.command.name,
        },
      },
      priority: args.sovereignFlowMind.summary.decision.confidence >= 0.78 ? 'high' : 'medium',
      confidence: clamp(args.sovereignFlowMind.summary.decision.confidence),
      source: {
        intent: mappedIntentType,
        userIntent: legacyIntentContext.userIntent,
        journeyMoment: legacyIntentContext.journeyMoment,
      },
      createdAt: args.now,
    }
  }

  if (mappedActionType === 'sendMessage') {
    return {
      schemaVersion: 1,
      entityId: args.entityProfile.id,
      type: 'sendMessage',
      payload: {
        message: buildGuidanceMessage(topic),
        metadata: {
          authorityMode: 'flowmind-partial',
          policyZone: 'safe',
          commandName: args.command.name,
        },
      },
      priority: 'medium',
      confidence: clamp(args.sovereignFlowMind.summary.decision.confidence, 0, 0.86),
      source: {
        intent: mappedIntentType,
        userIntent: legacyIntentContext.userIntent,
        journeyMoment: legacyIntentContext.journeyMoment,
      },
      createdAt: args.now,
    }
  }

  if (mappedActionType === 'askQuestion') {
    return {
      schemaVersion: 1,
      entityId: args.entityProfile.id,
      type: 'askQuestion',
      payload: {
        question: buildQuestion(topic),
        eventName: 'capture_preference_signal',
        metadata: {
          authorityMode: 'flowmind-partial',
          policyZone: 'safe',
          commandName: args.command.name,
        },
      },
      priority: 'medium',
      confidence: clamp(args.sovereignFlowMind.summary.decision.confidence, 0, 0.82),
      source: {
        intent: mappedIntentType,
        userIntent: legacyIntentContext.userIntent,
        journeyMoment: legacyIntentContext.journeyMoment,
      },
      createdAt: args.now,
    }
  }

  return undefined
}

export function evaluateFlowMindPartialAuthorityPolicy(args: {
  entityProfile: EntityProfile
  legacyDecision: FlowMindDecisionOutput
  sovereignFlowMind?: FlowMindServiceResult
  comparison?: FlowMindDecisionComparison
  command: OrchestratorCommand
  now: string
  thresholds?: Partial<FlowMindAuthorityPolicyThresholds>
}): FlowMindAuthorityPolicyResult {
  const thresholds = {
    ...DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS,
    ...args.thresholds,
  }

  if (!args.sovereignFlowMind || !args.comparison) {
    return buildDeniedResult({
      zone: 'future',
      reason: 'sovereign-flowmind-unavailable',
      thresholds,
    })
  }

  if (args.sovereignFlowMind.mode !== 'active') {
    return buildDeniedResult({
      zone: 'future',
      reason: 'entity-not-active',
      thresholds,
    })
  }

  if (args.command.source !== 'user') {
    return buildDeniedResult({
      zone: 'prohibited',
      reason: 'non-user-command-not-eligible',
      thresholds,
    })
  }

  if (PROHIBITED_COMMANDS.includes(args.command.name)) {
    return buildDeniedResult({
      zone: 'prohibited',
      reason: 'command-zone-prohibited',
      thresholds,
    })
  }

  if (!SAFE_COMMANDS.includes(args.command.name)) {
    return buildDeniedResult({
      zone: 'future',
      reason: 'command-zone-not-enabled-yet',
      thresholds,
    })
  }

  const summary = args.sovereignFlowMind.summary
  const metrics = args.comparison.metrics
  const autonomyMetrics = buildAutonomyMetrics({
    entityProfile: args.entityProfile,
    comparison: args.comparison,
  })
  const effectiveMaxDivergenceScore = resolveEffectiveMaxDivergenceScore({
    comparison: args.comparison,
    command: args.command,
    thresholds,
  })
  const rollbackTrigger = buildRollbackTrigger({
    entityProfile: args.entityProfile,
    comparison: args.comparison,
    autonomyMetrics,
    effectiveMaxDivergenceScore,
    thresholds,
  })
  const promotionEligible = metrics.sampleSize >= thresholds.minSampleSize
    && autonomyMetrics.sampleSize >= Math.min(AUTONOMY_HISTORY_WINDOW, thresholds.minSampleSize)
    && autonomyMetrics.averageErrorRate <= thresholds.maxErrorRate
    && autonomyMetrics.decisionStability >= thresholds.minDecisionStability
    && autonomyMetrics.averageDivergenceScore <= effectiveMaxDivergenceScore

  if (summary.adapterLoadStatus !== 'loaded') {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'adapter-not-loaded',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (summary.fallbackUsed || summary.decisionSource !== 'adaptive-core' || summary.terminalAuthority !== 'adaptive-core' || !summary.semanticFrozen) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'adaptive-authority-not-stable',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (metrics.sampleSize < thresholds.minSampleSize) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'insufficient-sample-size',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (metrics.divergenceScore > effectiveMaxDivergenceScore) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'divergence-too-high',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (metrics.stabilityScore < thresholds.minStabilityScore) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'stability-too-low',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (metrics.fallbackRate > thresholds.maxFallbackRate) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'fallback-rate-too-high',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (metrics.adaptiveSuccessRate < thresholds.minAdaptiveSuccessRate) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'adaptive-success-rate-too-low',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (autonomyMetrics.averageErrorRate > thresholds.maxErrorRate) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'error-rate-too-high',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (autonomyMetrics.decisionStability < thresholds.minDecisionStability) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'decision-stability-too-low',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  if (autonomyMetrics.averageDivergenceScore > effectiveMaxDivergenceScore) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'autonomy-divergence-too-high',
      thresholds,
      autonomyMetrics,
      promotionEligible: false,
      rollbackTrigger,
    })
  }

  const action = buildPartialAuthorityAction({
    entityProfile: args.entityProfile,
    legacyDecision: args.legacyDecision,
    sovereignFlowMind: args.sovereignFlowMind,
    command: args.command,
    now: args.now,
  })

  if (!action) {
    return buildDeniedResult({
      zone: 'safe',
      reason: 'no-safe-authority-action-for-decision',
      thresholds,
      autonomyMetrics,
      promotionEligible,
      rollbackTrigger,
    })
  }

  return {
    applied: true,
    zone: 'safe',
    reason: 'eligible-for-partial-authority',
    action,
    autonomyLevel: resolveAutonomyLevel({
      applied: true,
      promotionEligible,
    }),
    promotionEligible,
    autonomyMetrics,
    rollbackTrigger,
    thresholds,
  }
}