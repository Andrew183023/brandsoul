import type { EntityAction, EntityActionType } from '../brain/domain/entity/contracts/EntityAction.js'
import type { FlowMindDecision } from '../flowmind/types/flowMindDecision.js'
import type { OrchestratorCommand } from './orchestratorState.js'

export function mapSafeSovereignActionToEntityActionType(
  commandName: OrchestratorCommand['name'],
  sovereignAction: string,
): EntityActionType | undefined {
  const normalized = sovereignAction.trim().toLowerCase()

  if (commandName === 'trigger_export') {
    return normalized === 'sell' ? 'triggerExport' : undefined
  }

  if (commandName === 'start_birth' || commandName === 'resume_birth') {
    if (normalized === 'guide') {
      return 'sendMessage'
    }

    if (normalized === 'support') {
      return 'askQuestion'
    }
  }

  return undefined
}

export function buildEntityActionFromFlowMindDecision(args: {
  entityId: string
  commandName: OrchestratorCommand['name']
  decision: FlowMindDecision
  now: string
  sourceIntent?: string
  sourceStrategy?: string
  metadata?: Record<string, unknown>
}): EntityAction {
  const mappedType = mapSafeSovereignActionToEntityActionType(args.commandName, args.decision.action)
  const actionType: EntityActionType = args.decision.action === 'none'
    ? 'observeContext'
    : args.decision.action === 'create_entity'
      ? 'create_entity'
      : mappedType ?? 'observeContext'

  return {
    schemaVersion: 1,
    entityId: args.entityId,
    type: actionType,
    priority: args.decision.confidence >= 0.72 ? 'high' : args.decision.confidence >= 0.42 ? 'medium' : 'low',
    confidence: args.decision.confidence,
    createdAt: args.now,
    source: {
      intent: args.sourceIntent ?? args.decision.intent,
      strategy: args.sourceStrategy ?? 'resolveFlowMindDecision',
    },
    payload: {
      message: typeof args.decision.responsePlan.topic === 'string' && args.decision.responsePlan.topic.trim().length > 0
        ? args.decision.responsePlan.topic
        : 'flowmind-decision',
      question: args.decision.action === 'support'
        ? `Qual contexto adicional devo considerar sobre ${args.decision.responsePlan.topic}?`
        : undefined,
      metadata: {
        flowMind: {
          responsePlan: args.decision.responsePlan,
          metadata: args.decision.metadata,
        },
        ...(args.metadata ?? {}),
      },
    },
  }
}