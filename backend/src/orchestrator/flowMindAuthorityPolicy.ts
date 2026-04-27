import type { EntityAction } from '../brain/domain/entity/contracts/EntityAction.js'
import type { EntityIntentType } from '../brain/domain/entity/contracts/EntityIntent.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindDecisionOutput } from '../brain/domain/entity/contracts/FlowMindState.js'
import type { FlowMindAuthorityScopeZone, FlowMindServiceResult } from '../services/flowMindPort.js'
import type { OrchestratorCommand } from './orchestratorState.js'
import type { FlowMindDecisionComparison } from '../services/flowMindPort.js'
import { mapSafeSovereignActionToEntityActionType } from './flowMindSafeActionMapping.js'

export type FlowMindAuthorityPolicyThresholds = {
  maxDivergenceScore: number
  minStabilityScore: number
  maxFallbackRate: number
  minAdaptiveSuccessRate: number
  minSampleSize: number
}

export type FlowMindAuthorityPolicyResult = {
  applied: boolean
  zone: FlowMindAuthorityScopeZone
  reason: string
  action?: EntityAction
  thresholds: FlowMindAuthorityPolicyThresholds
}

export const DEFAULT_FLOWMIND_PARTIAL_AUTHORITY_THRESHOLDS: FlowMindAuthorityPolicyThresholds = {
  maxDivergenceScore: 0.24,
  minStabilityScore: 0.78,
  maxFallbackRate: 0.2,
  minAdaptiveSuccessRate: 0.6,
  minSampleSize: 5,
}

const SAFE_ALIGNED_MAX_DIVERGENCE_SCORE = 0.28

const SAFE_COMMANDS: OrchestratorCommand['name'][] = ['trigger_export', 'start_birth', 'resume_birth']
const PROHIBITED_COMMANDS: OrchestratorCommand['name'][] = ['apply_control', 'set_stage', 'pause_birth']

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
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
    return {
      applied: false,
      zone: 'future',
      reason: 'sovereign-flowmind-unavailable',
      thresholds,
    }
  }

  if (args.sovereignFlowMind.mode !== 'active') {
    return {
      applied: false,
      zone: 'future',
      reason: 'entity-not-active',
      thresholds,
    }
  }

  if (args.command.source !== 'user') {
    return {
      applied: false,
      zone: 'prohibited',
      reason: 'non-user-command-not-eligible',
      thresholds,
    }
  }

  if (PROHIBITED_COMMANDS.includes(args.command.name)) {
    return {
      applied: false,
      zone: 'prohibited',
      reason: 'command-zone-prohibited',
      thresholds,
    }
  }

  if (!SAFE_COMMANDS.includes(args.command.name)) {
    return {
      applied: false,
      zone: 'future',
      reason: 'command-zone-not-enabled-yet',
      thresholds,
    }
  }

  const summary = args.sovereignFlowMind.summary
  const metrics = args.comparison.metrics
  const effectiveMaxDivergenceScore = resolveEffectiveMaxDivergenceScore({
    comparison: args.comparison,
    command: args.command,
    thresholds,
  })

  if (summary.adapterLoadStatus !== 'loaded') {
    return {
      applied: false,
      zone: 'safe',
      reason: 'adapter-not-loaded',
      thresholds,
    }
  }

  if (summary.fallbackUsed || summary.decisionSource !== 'adaptive-core' || summary.terminalAuthority !== 'adaptive-core' || !summary.semanticFrozen) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'adaptive-authority-not-stable',
      thresholds,
    }
  }

  if (metrics.sampleSize < thresholds.minSampleSize) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'insufficient-sample-size',
      thresholds,
    }
  }

  if (metrics.divergenceScore > effectiveMaxDivergenceScore) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'divergence-too-high',
      thresholds,
    }
  }

  if (metrics.stabilityScore < thresholds.minStabilityScore) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'stability-too-low',
      thresholds,
    }
  }

  if (metrics.fallbackRate > thresholds.maxFallbackRate) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'fallback-rate-too-high',
      thresholds,
    }
  }

  if (metrics.adaptiveSuccessRate < thresholds.minAdaptiveSuccessRate) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'adaptive-success-rate-too-low',
      thresholds,
    }
  }

  const action = buildPartialAuthorityAction({
    entityProfile: args.entityProfile,
    legacyDecision: args.legacyDecision,
    sovereignFlowMind: args.sovereignFlowMind,
    command: args.command,
    now: args.now,
  })

  if (!action) {
    return {
      applied: false,
      zone: 'safe',
      reason: 'no-safe-authority-action-for-decision',
      thresholds,
    }
  }

  return {
    applied: true,
    zone: 'safe',
    reason: 'eligible-for-partial-authority',
    action,
    thresholds,
  }
}