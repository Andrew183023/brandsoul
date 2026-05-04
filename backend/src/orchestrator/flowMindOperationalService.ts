import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindDecisionOutput } from '../brain/domain/entity/contracts/FlowMindState.js'
import { executeFlowMindAction, type FlowMindActionTransaction } from '../brain/flowmind/flowMindActionExecutor.js'
import { registerOutcome } from '../brain/flowmind/learningEngine.js'
import { resolveFlowMindDecision, type EntityCognitiveMemory } from '../flowmind/index.js'
import type {
  FlowMindAuthorityObservation,
  FlowMindDecisionComparison,
  FlowMindPort,
  FlowMindServiceResult,
} from '../services/flowMindPort.js'
import type { OrchestratorCommand, OrchestratorState } from './orchestratorState.js'
import type { FlowMindDecisionEnvelope, FlowMindUiEffect, EntityScheduledTask, FlowMindLineageTrace } from './flowMindContracts.js'
import { buildFlowMindDecisionComparison, serializeFlowMindServiceSnapshot } from './flowMindComparison.js'
import { buildEntityActionFromFlowMindDecision } from './flowMindSafeActionMapping.js'
import { evaluateFlowMindPartialAuthorityPolicy, type FlowMindAuthorityPolicyResult } from './flowMindAuthorityPolicy.js'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function resolveJourneyMoment(state: OrchestratorState, command: OrchestratorCommand) {
  if (command.name === 'trigger_export') {
    return 'export' as const
  }
  if (state.sessionStatus === 'completed' || state.currentStage === 'final') {
    return 'final' as const
  }
  if (state.sessionStatus === 'running') {
    return 'birth' as const
  }
  return 'creation' as const
}

function resolveLegacyUserIntent(command: OrchestratorCommand) {
  if (command.name === 'trigger_export') {
    return 'export'
  }

  if (command.name === 'start_birth' || command.name === 'resume_birth') {
    return 'interact'
  }

  return 'unknown'
}

function buildLegacyContextSnapshot(state: OrchestratorState, command: OrchestratorCommand, entityProfile: EntityProfile) {
  const behaviorState = entityProfile.relational?.behaviorState
  return {
    commandName: command.name,
    userIntent: resolveLegacyUserIntent(command),
    journeyMoment: resolveJourneyMoment(state, command),
    interactionType: command.source === 'user' ? 'message' : 'system',
    urgencyLevel: command.name === 'trigger_export' ? 'medium' : 'low',
    memoryRelevance: entityProfile.relational?.userMemory?.memoryConfidence ?? 0,
    socialContext: {
      engagementScore: behaviorState?.affinityScore ?? 0,
    },
  }
}

function resolveLastInteraction(entityProfile: EntityProfile) {
  const interactions = entityProfile.relational?.userMemory?.lastInteractions
  return Array.isArray(interactions) ? interactions[0] : undefined
}

function appendFlowMindNotes(entityProfile: EntityProfile, decision: FlowMindDecisionOutput, envelope: FlowMindDecisionEnvelope, now: string): EntityProfile {
  const notes = entityProfile.metadata.notes ?? []
  const nextNotes = [
    `flowmind:decision:${now}:${decision.intent}:${decision.entityAction.type}:${decision.confidence.toFixed(3)}`,
    `flowmind:outcome:${now}:${envelope.outcome.impact.success ? 'success' : 'failure'}:${envelope.outcome.impact.engagementScore.toFixed(3)}`,
    ...notes,
  ].slice(0, 24)

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      confidence: envelope.outcome.decisionConfidence,
      updatedAt: now,
      notes: nextNotes,
    },
  }
}

function appendSovereignFlowMindNotes(
  entityProfile: EntityProfile,
  serviceResult: FlowMindServiceResult | undefined,
  comparison?: FlowMindDecisionComparison,
  authority?: FlowMindAuthorityObservation,
) {
  if (!serviceResult) {
    return entityProfile
  }

  const notes = entityProfile.metadata.notes ?? []
  const nextNotes = [
    serializeFlowMindServiceSnapshot({
      summary: serviceResult.summary,
      comparison,
      authority,
    }),
    ...notes,
  ].slice(0, 24)

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      notes: nextNotes,
    },
  }
}

function buildLegacyComparisonEnvelope(args: {
  decision: FlowMindDecisionOutput
  command: OrchestratorCommand
}): FlowMindDecisionEnvelope {
  return {
    decision: {
      intent: args.decision.intent,
      confidence: args.decision.confidence,
      reason: args.decision.reason,
    },
    trace: args.decision.trace,
    lineage: {
      rootCommandId: args.command.commandId,
      reentryBlocked: true,
      entityAction: {
        type: args.decision.entityAction.type,
        priority: args.decision.entityAction.priority,
        confidence: args.decision.entityAction.confidence,
        createdAt: args.decision.entityAction.createdAt,
        source: args.decision.entityAction.source,
      },
      followUps: [],
    },
    outcome: {
      decisionConfidence: args.decision.confidence,
      impact: {
        xpGranted: 0,
        bindingEvent: 'no_interaction',
        engagementScore: 0,
        success: false,
      },
    },
  }
}

function buildFlowMindAuthorityObservation(args: {
  sovereignFlowMind: FlowMindServiceResult
  partialAuthority: FlowMindAuthorityPolicyResult
  command: OrchestratorCommand
}): FlowMindAuthorityObservation {
  return {
    authorityEligible: args.sovereignFlowMind.summary.mode === 'active' && args.partialAuthority.zone === 'safe',
    authorityGranted: true,
    authorityDeniedReason: args.partialAuthority.applied ? undefined : args.partialAuthority.reason,
    authorityZone: args.partialAuthority.zone,
    authorityCommand: args.command.name,
    autonomyLevel: args.partialAuthority.autonomyLevel,
    promotionEligible: args.partialAuthority.promotionEligible,
    rollbackTriggered: args.partialAuthority.rollbackTrigger.active,
    rollbackReason: args.partialAuthority.rollbackTrigger.reason,
    autonomyMetrics: args.partialAuthority.autonomyMetrics,
  }
}

async function evaluateSovereignFlowMindSafely(args: {
  flowMindService?: FlowMindPort
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now: string
  memory?: EntityCognitiveMemory
}) {
  const { flowMindService, entityProfile, state, command, now, memory } = args

  if (!flowMindService || flowMindService.mode === 'disabled') {
    return undefined
  }

  return flowMindService.evaluateOrchestratorCommand({
    entityProfile,
    state,
    command,
    now,
    memory,
    persistMemory: false,
  })
}

export type ResolveFlowMindOperationalEffectResult = {
  entityProfile: EntityProfile
  updatedMemory: EntityCognitiveMemory
  uiEffects: FlowMindUiEffect[]
  scheduledTasks: EntityScheduledTask[]
  domainCommands: import('./flowMindContracts.js').FlowMindFollowUpCommand[]
  actionTransaction: FlowMindActionTransaction
  flowMind: FlowMindDecisionEnvelope
  sovereignFlowMind?: FlowMindServiceResult
  flowMindComparison?: FlowMindDecisionComparison
  flowMindAuthority?: FlowMindAuthorityObservation
  partialAuthority?: FlowMindAuthorityPolicyResult
}

type LearningEntityProfile = Parameters<typeof registerOutcome>[0]['entity']

function resolveDeterministicOperationalNow(args: {
  now?: string
  state: OrchestratorState
  command: OrchestratorCommand
  entityProfile: EntityProfile
}) {
  return args.now
    ?? args.command.issuedAt
    ?? args.state.metadata.updatedAt
    ?? args.state.metadata.createdAt
    ?? args.entityProfile.metadata.updatedAt
    ?? args.entityProfile.metadata.createdAt
    ?? '1970-01-01T00:00:00.000Z'
}

export async function resolveFlowMindOperationalEffect(args: {
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now?: string
  flowMindService?: FlowMindPort
  memory?: EntityCognitiveMemory
}): Promise<ResolveFlowMindOperationalEffectResult> {
  const now = resolveDeterministicOperationalNow(args)
  const sovereignFlowMind = await evaluateSovereignFlowMindSafely({
    flowMindService: args.flowMindService,
    entityProfile: args.entityProfile,
    state: args.state,
    command: args.command,
    now,
    memory: args.memory,
  })
  const directFlowMind = sovereignFlowMind?.output ?? await resolveFlowMindDecision({
    entityId: args.entityProfile.id,
    input: args.command.payload?.summary ?? `run orchestrator command ${args.command.name}`,
    context: {
      source: 'orchestrator',
      command: {
        name: args.command.name,
        commandId: args.command.commandId,
        payload: args.command.payload,
      },
      orchestrator: {
        entityId: args.state.entityId,
        currentStage: args.state.currentStage,
        sessionStatus: args.state.sessionStatus,
        sequence: args.state.sequence,
      },
      entity: {
        profileId: args.entityProfile.id,
        confidence: args.entityProfile.metadata.confidence,
      },
    },
    requestedAt: now,
    memory: args.memory,
  })
  const authoritativeDecision = directFlowMind.decision
  const effectiveAction = buildEntityActionFromFlowMindDecision({
    entityId: args.entityProfile.id,
    commandName: args.command.name,
    decision: authoritativeDecision,
    now,
    metadata: {
      authority: {
        zone: 'safe',
        reason: directFlowMind.terminalAuthority,
      },
    },
  })
  const effectiveDecision: FlowMindDecisionOutput = {
    intent: authoritativeDecision.intent,
    confidence: authoritativeDecision.confidence,
    reason: typeof authoritativeDecision.metadata?.reason === 'string'
      ? authoritativeDecision.metadata.reason
      : `authoritative:${authoritativeDecision.action}`,
    entityAction: effectiveAction,
    state: {
      schemaVersion: 1,
      entityId: args.entityProfile.id,
      awarenessLevel: Number(args.entityProfile.relational?.behaviorState?.affinityScore ?? 0),
      contextConfidence: Number(args.entityProfile.relational?.userMemory?.memoryConfidence ?? 0),
      decisionConfidence: authoritativeDecision.confidence,
      lastDecisionAt: now,
      activeIntent: authoritativeDecision.intent,
      state: authoritativeDecision.action === 'none' ? 'idle' : 'acting',
    },
    context: buildLegacyContextSnapshot(args.state, args.command, args.entityProfile),
    entityIntent: {
      type: authoritativeDecision.intent,
      confidence: authoritativeDecision.confidence,
      reason: typeof authoritativeDecision.metadata?.reason === 'string'
        ? authoritativeDecision.metadata.reason
        : authoritativeDecision.action,
    },
    trace: {
      createdAt: now,
      responsePlan: authoritativeDecision.responsePlan,
      memoryInfluence: authoritativeDecision.memoryInfluence,
      metadata: authoritativeDecision.metadata,
    },
  }
  const legacyEnvelope = buildLegacyComparisonEnvelope({
    decision: effectiveDecision,
    command: args.command,
  })
  const flowMindComparison = sovereignFlowMind
    ? buildFlowMindDecisionComparison({
      entityProfile: args.entityProfile,
      legacyDecision: legacyEnvelope,
      summary: sovereignFlowMind.summary,
      command: args.command,
      now,
    })
    : undefined
  const partialAuthority = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: args.entityProfile,
    legacyDecision: effectiveDecision,
    sovereignFlowMind,
    comparison: flowMindComparison,
    command: args.command,
    now,
  })
  const flowMindAuthority = sovereignFlowMind
    ? buildFlowMindAuthorityObservation({
      sovereignFlowMind,
      partialAuthority,
      command: args.command,
    })
    : undefined
  const execution = await executeFlowMindAction({
    action: effectiveAction,
    entityProfile: args.entityProfile,
    state: args.state,
    command: args.command,
    now,
    idempotencyKey: args.command.commandId,
  })
  const lineage: FlowMindLineageTrace = {
    rootCommandId: args.command.commandId,
    reentryBlocked: true,
    entityAction: {
      type: effectiveDecision.entityAction.type,
      priority: effectiveDecision.entityAction.priority,
      confidence: effectiveDecision.entityAction.confidence,
      createdAt: effectiveDecision.entityAction.createdAt,
      source: effectiveDecision.entityAction.source,
    },
    followUps: execution.domainCommands.map((followUp) => ({
      commandId: followUp.commandId,
      name: followUp.name,
      classification: followUp.classification,
      issuedAt: followUp.issuedAt,
    })),
  }

  if (execution.transaction.rolledBack) {
    const blockedReason = execution.transaction.failure?.message ?? effectiveDecision.reason
    return {
      entityProfile: args.entityProfile,
      updatedMemory: directFlowMind.updatedMemory,
      uiEffects: [],
      scheduledTasks: [],
      domainCommands: [],
      actionTransaction: execution.transaction,
      flowMind: {
        decision: {
          intent: execution.transaction.failure ? 'observe' : effectiveDecision.intent,
          confidence: 0,
          reason: `policy-guardrail:${blockedReason}`,
        },
        trace: effectiveDecision.trace,
        lineage: {
          ...lineage,
          entityAction: {
            type: 'observeContext',
            priority: 'low',
            confidence: 0,
            createdAt: now,
            source: {
              intent: 'observe',
              strategy: 'guardrail',
            },
          },
          followUps: [],
        },
        outcome: {
          decisionConfidence: 0,
          impact: {
            xpGranted: 0,
            bindingEvent: 'no_interaction',
            engagementScore: 0,
            success: false,
          },
        },
      },
      sovereignFlowMind,
      flowMindComparison,
      flowMindAuthority,
      partialAuthority,
    }
  }

  const success = execution.policy.allowed && (execution.domainCommands.length > 0 || execution.uiEffects.length > 0 || execution.scheduledTasks.length > 0)
  const learningOutcome = registerOutcome({
    entity: execution.entityProfile as unknown as LearningEntityProfile,
    decision: effectiveDecision,
    action: effectiveAction,
    success,
    engagementScore: clamp(Math.max(effectiveDecision.confidence * 0.84, execution.uiEffects.length > 0 ? 0.44 : 0.22)),
    occurredAt: now,
  })
  const flowMind: FlowMindDecisionEnvelope = {
    decision: {
      intent: success ? effectiveDecision.intent : 'observe',
      confidence: success ? effectiveDecision.confidence : 0,
      reason: success ? effectiveDecision.reason : `no-op:${effectiveDecision.reason}`,
    },
    trace: effectiveDecision.trace,
    lineage,
    outcome: {
      decisionConfidence: learningOutcome.decisionConfidence,
      impact: learningOutcome.impact,
    },
  }

  return {
    entityProfile: appendSovereignFlowMindNotes(
      appendFlowMindNotes(learningOutcome.entity as unknown as EntityProfile, effectiveDecision, flowMind, now),
      sovereignFlowMind,
      flowMindComparison,
      flowMindAuthority,
    ),
    updatedMemory: directFlowMind.updatedMemory,
    uiEffects: execution.uiEffects,
    scheduledTasks: execution.scheduledTasks,
    domainCommands: execution.domainCommands,
    actionTransaction: execution.transaction,
    flowMind,
    sovereignFlowMind,
    flowMindComparison,
    flowMindAuthority,
    partialAuthority,
  }
}
