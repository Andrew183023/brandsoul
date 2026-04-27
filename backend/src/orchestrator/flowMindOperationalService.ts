import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindDecisionOutput } from '../brain/domain/entity/contracts/FlowMindState.js'
import { decide } from '../brain/flowmind/flowMindEngine.js'
import { executeFlowMindAction } from '../brain/flowmind/flowMindActionExecutor.js'
import { registerOutcome } from '../brain/flowmind/learningEngine.js'
import type {
  FlowMindAuthorityObservation,
  FlowMindDecisionComparison,
  FlowMindPort,
  FlowMindServiceResult,
} from '../services/flowMindPort.js'
import type { OrchestratorCommand, OrchestratorState } from './orchestratorState.js'
import type { FlowMindDecisionEnvelope, FlowMindUiEffect, EntityScheduledTask, FlowMindLineageTrace } from './flowMindContracts.js'
import { buildFlowMindDecisionComparison, serializeFlowMindServiceSnapshot } from './flowMindComparison.js'
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

function buildFlowMindAuthorityObservation(args: {
  sovereignFlowMind: FlowMindServiceResult
  partialAuthority: FlowMindAuthorityPolicyResult
  command: OrchestratorCommand
}): FlowMindAuthorityObservation {
  const authorityGranted = args.partialAuthority.applied

  return {
    authorityEligible: args.sovereignFlowMind.summary.mode === 'active' && args.partialAuthority.zone === 'safe',
    authorityGranted,
    authorityDeniedReason: authorityGranted ? undefined : args.partialAuthority.reason,
    authorityZone: args.partialAuthority.zone,
    authorityCommand: args.command.name,
  }
}
async function evaluateSovereignFlowMindSafely(args: {
  flowMindService?: FlowMindPort
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now: string
}) {
  const { flowMindService, entityProfile, state, command, now } = args

  if (!flowMindService || flowMindService.mode === 'disabled') {
    return undefined
  }

  try {
    return await flowMindService.evaluateOrchestratorCommand({
      entityProfile,
      state,
      command,
      now,
    })
  } catch {
    return undefined
  }
}

export type ResolveFlowMindOperationalEffectResult = {
  entityProfile: EntityProfile
  uiEffects: FlowMindUiEffect[]
  scheduledTasks: EntityScheduledTask[]
  domainCommands: import('./flowMindContracts.js').FlowMindFollowUpCommand[]
  flowMind: FlowMindDecisionEnvelope
  sovereignFlowMind?: FlowMindServiceResult
  flowMindComparison?: FlowMindDecisionComparison
  flowMindAuthority?: FlowMindAuthorityObservation
  partialAuthority?: FlowMindAuthorityPolicyResult
}

type LearningEntityProfile = Parameters<typeof registerOutcome>[0]['entity']

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

export async function resolveFlowMindOperationalEffect(args: {
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now?: string
  flowMindService?: FlowMindPort
}): Promise<ResolveFlowMindOperationalEffectResult> {
  const now = args.now ?? new Date().toISOString()
  const decision = decide({
    entity: args.entityProfile,
    journeyMoment: resolveJourneyMoment(args.state, args.command),
    previousState: undefined,
    lastInteraction: args.entityProfile.relational.userMemory.lastInteractions[0],
    now,
  })
  const legacyEnvelope = buildLegacyComparisonEnvelope({
    decision,
    command: args.command,
  })
  const sovereignFlowMind = await evaluateSovereignFlowMindSafely({
    flowMindService: args.flowMindService,
    entityProfile: args.entityProfile,
    state: args.state,
    command: args.command,
    now,
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
    legacyDecision: decision,
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
  const effectiveAction = partialAuthority.action ?? decision.entityAction
  const effectiveDecision: FlowMindDecisionOutput = partialAuthority.applied
    ? {
      ...decision,
      reason: `${decision.reason} | flowmind-partial-authority:${partialAuthority.reason}`,
      entityAction: effectiveAction,
    }
    : decision
  const execution = executeFlowMindAction({
    action: effectiveAction,
    entityProfile: args.entityProfile,
    state: args.state,
    command: args.command,
    now,
  })
  const success = execution.policy.allowed && (execution.domainCommands.length > 0 || execution.uiEffects.length > 0 || execution.scheduledTasks.length > 0)
  const learningOutcome = registerOutcome({
    entity: execution.entityProfile as unknown as LearningEntityProfile,
    decision: effectiveDecision,
    action: effectiveAction,
    success,
    engagementScore: clamp(Math.max(effectiveDecision.confidence * 0.84, execution.uiEffects.length > 0 ? 0.44 : 0.22)),
    occurredAt: now,
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
  const flowMind: FlowMindDecisionEnvelope = {
    decision: {
      intent: effectiveDecision.intent,
      confidence: effectiveDecision.confidence,
      reason: effectiveDecision.reason,
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
    uiEffects: execution.uiEffects,
    scheduledTasks: execution.scheduledTasks,
    domainCommands: execution.domainCommands,
    flowMind,
    sovereignFlowMind,
    flowMindComparison,
    flowMindAuthority,
    partialAuthority,
  }
}