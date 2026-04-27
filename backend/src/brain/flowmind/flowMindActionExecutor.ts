import type { EntityAction } from '../domain/entity/contracts/EntityAction.js'
import type { EntityProfile } from '../domain/entity/contracts/EntityProfile.js'
import type { OrchestratorCommand, OrchestratorState } from '../../orchestrator/orchestratorState.js'
import { updateMemoryPreference } from '../domain/entity/services/memoryEngine.js'
import { validateAction } from './flowMindGuard.js'
import type {
  EntityScheduledTask,
  FlowMindFollowUpCommand,
  FlowMindFollowUpCommandName,
  FlowMindUiEffect,
} from '../../orchestrator/flowMindContracts.js'

type MemoryEngineState = Parameters<typeof updateMemoryPreference>[0]

export type FlowMindActionExecutionResult = {
  entityProfile: EntityProfile
  domainCommands: FlowMindFollowUpCommand[]
  uiEffects: FlowMindUiEffect[]
  scheduledTasks: EntityScheduledTask[]
  policy: {
    allowed: boolean
    reason?: string
  }
}

export const FLOW_MIND_ACTION_COMMAND_MAP: Record<EntityAction['type'], FlowMindFollowUpCommandName> = {
  sendMessage: 'register_interaction',
  suggestProduct: 'register_share',
  suggestDiscovery: 'register_share',
  askQuestion: 'register_interaction',
  triggerExport: 'trigger_export',
  triggerEvent: 'register_interaction',
  updateMemory: 'register_interaction',
  entityInteraction: 'register_share',
}

function createId(prefix: 'effect' | 'task' | 'command' | 'event') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function createDerivedCommandId(rootCommandId: string, sequence: number) {
  return `${rootCommandId}-flowmind-${sequence}`.slice(0, 128)
}

function createCommand(args: {
  name: FlowMindFollowUpCommandName
  issuedAt: string
  rootCommandId: string
  sequence: number
  payload?: FlowMindFollowUpCommand['payload']
}): FlowMindFollowUpCommand {
  return {
    type: 'command',
    name: args.name,
    commandId: createDerivedCommandId(args.rootCommandId, args.sequence),
    issuedAt: args.issuedAt,
    classification: 'domain-command',
    payload: args.payload,
  }
}

function createEvent(state: OrchestratorState, command: OrchestratorCommand, issuedAt: string, name: string, payload?: Record<string, unknown>) {
  return {
    type: 'event' as const,
    eventId: createId('event'),
    timestamp: issuedAt,
    sessionId: state.sessionId,
    entityId: state.entityId,
    causedByCommandId: command.commandId,
    name,
    payload,
  }
}

function createScheduledTask(args: {
  entityId: string
  type: EntityScheduledTask['type']
  delayMs: number
  createdAt: string
  payload: EntityScheduledTask['payload']
}): EntityScheduledTask {
  return {
    taskId: createId('task'),
    entityId: args.entityId,
    type: args.type,
    createdAt: args.createdAt,
    runAt: new Date(Date.parse(args.createdAt) + args.delayMs).toISOString(),
    delayMs: args.delayMs,
    payload: args.payload,
  }
}

function buildMessageEffect(entityId: string, body: string, createdAt: string): Extract<FlowMindUiEffect, { kind: 'message' }> {
  return {
    effectId: createId('effect'),
    entityId,
    kind: 'message',
    title: 'A entidade enviou um sinal',
    body,
    createdAt,
  }
}

function buildPromptEffect(entityId: string, question: string, createdAt: string): Extract<FlowMindUiEffect, { kind: 'prompt' }> {
  return {
    effectId: createId('effect'),
    entityId,
    kind: 'prompt',
    title: 'A entidade quer entender melhor seu estilo',
    question,
    placeholder: 'Descreva um gosto, tom, cor, ritmo ou direcao.',
    createdAt,
  }
}

function buildDiscoveryEffect(entityId: string, body: string, createdAt: string): Extract<FlowMindUiEffect, { kind: 'discovery' }> {
  return {
    effectId: createId('effect'),
    entityId,
    kind: 'discovery',
    title: 'Descoberta sugerida',
    body,
    href: '/discover',
    ctaLabel: 'Ver descoberta',
    createdAt,
  }
}

function buildExportEffect(entityId: string, body: string, createdAt: string): Extract<FlowMindUiEffect, { kind: 'export' }> {
  return {
    effectId: createId('effect'),
    entityId,
    kind: 'export',
    title: 'Export recomendado',
    body,
    exportFormat: 'post',
    createdAt,
  }
}

function appendDomainCommand(commands: FlowMindFollowUpCommand[], command: FlowMindFollowUpCommand) {
  commands.push(command)
}

function applyMemoryUpdate(entityProfile: EntityProfile, action: EntityAction, now: string): EntityProfile {
  if (!action.payload.memoryKey || !action.payload.memoryValue) {
    return entityProfile
  }

  return {
    ...entityProfile,
    relational: {
      ...entityProfile.relational,
      userMemory: updateMemoryPreference(entityProfile.relational.userMemory as MemoryEngineState, {
        key: action.payload.memoryKey,
        value: action.payload.memoryValue,
        source: 'behavioral',
        confidence: Math.max(0.12, action.confidence * 0.24),
        observedAt: now,
      }),
    },
    metadata: {
      ...entityProfile.metadata,
      updatedAt: now,
    },
  }
}

function buildInteractionPayload(action: EntityAction) {
  return {
    interactionType: action.type === 'askQuestion' ? 'message' : action.type === 'entityInteraction' ? 'social' : 'message',
    summary:
      action.payload.message
      ?? action.payload.question
      ?? action.payload.suggestion
      ?? `FlowMind action ${action.type}.`,
    topics: ['flowmind', action.source.intent, action.type],
    weight: clamp(Math.max(0.22, action.confidence * 0.72)),
  }
}

export function executeFlowMindAction(args: {
  action: EntityAction
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now?: string
}): FlowMindActionExecutionResult {
  const now = args.now ?? new Date().toISOString()
  const guarded = validateAction(args.action, {
    now,
    previousActionAt: args.entityProfile.metadata.updatedAt,
  })
  const action = guarded.action
  const domainCommands: FlowMindFollowUpCommand[] = []
  const uiEffects: FlowMindUiEffect[] = []
  const scheduledTasks: EntityScheduledTask[] = []
  let entityProfile = args.entityProfile

  const nextCommand = (name: FlowMindFollowUpCommandName, payload?: FlowMindFollowUpCommand['payload']) => createCommand({
    name,
    issuedAt: now,
    rootCommandId: args.command.commandId,
    sequence: domainCommands.length,
    payload,
  })

  switch (action.type) {
    case 'sendMessage': {
      appendDomainCommand(domainCommands, nextCommand('register_interaction', buildInteractionPayload(action)))
      const body = action.payload.message ?? 'A entidade registrou uma mensagem contextual.'
      if (action.payload.eventName === 'schedule_return_prompt') {
        scheduledTasks.push(createScheduledTask({
          entityId: action.entityId,
          type: 'return_prompt',
          delayMs: 18_000,
          createdAt: now,
          payload: {
            uiEffect: buildMessageEffect(action.entityId, body, now),
            event: createEvent(args.state, args.command, now, 'interaction.message', {
              messageType: 'assistant',
              summary: body,
              topics: ['flowmind', action.source.intent],
            }),
          },
        }))
      } else {
        uiEffects.push(buildMessageEffect(action.entityId, body, now))
      }
      break
    }
    case 'askQuestion': {
      appendDomainCommand(domainCommands, nextCommand('register_interaction', buildInteractionPayload(action)))
      uiEffects.push(buildPromptEffect(
        action.entityId,
        action.payload.question ?? 'Qual sinal de estilo deve ser reforcado agora?',
        now,
      ))
      scheduledTasks.push(createScheduledTask({
        entityId: action.entityId,
        type: 'follow_up',
        delayMs: args.state.sessionStatus === 'completed' ? 22_000 : 28_000,
        createdAt: now,
        payload: {
          uiEffect: buildMessageEffect(
            action.entityId,
            'Quando quiser, me diga um novo sinal de estilo para eu refinar a memoria desta presenca.',
            now,
          ),
        },
      }))
      break
    }
    case 'suggestProduct':
    case 'suggestDiscovery': {
      appendDomainCommand(domainCommands, nextCommand('register_share', {
        summary: action.payload.suggestion ?? 'FlowMind suggested a discovery path.',
        topics: ['flowmind', 'discovery'],
        weight: clamp(Math.max(0.22, action.confidence * 0.72)),
      }))
      const effect = buildDiscoveryEffect(
        action.entityId,
        action.payload.suggestion ?? 'Existem outras entidades relevantes para explorar agora.',
        now,
      )
      uiEffects.push(effect)
      if (args.state.sessionStatus === 'completed' || args.state.currentStage === 'final') {
        scheduledTasks.push(createScheduledTask({
          entityId: action.entityId,
          type: 'social_action',
          delayMs: 14_000,
          createdAt: now,
          payload: {
            uiEffect: {
              ...effect,
              effectId: createId('effect'),
              title: 'Ha outra presenca compativel',
              body: 'Existe uma entidade proxima do seu ritmo atual. Vale explorar essa conexao.',
            },
          },
        }))
      }
      break
    }
    case 'triggerExport': {
      if (args.state.sessionStatus === 'completed' || args.state.currentStage === 'final') {
        appendDomainCommand(domainCommands, nextCommand('trigger_export', {
          exportFormat: 'post',
          summary: action.payload.message ?? action.payload.suggestion ?? 'FlowMind requested export generation.',
          topics: ['flowmind', 'export'],
          weight: clamp(Math.max(0.34, action.confidence * 0.78)),
        }))
        uiEffects.push(buildExportEffect(
          action.entityId,
          action.payload.message ?? action.payload.suggestion ?? 'A entidade esta pronta para sair do laboratorio.',
          now,
        ))
      } else {
        scheduledTasks.push(createScheduledTask({
          entityId: action.entityId,
          type: 'reminder',
          delayMs: 18_000,
          createdAt: now,
          payload: {
            uiEffect: buildExportEffect(
              action.entityId,
              action.payload.message ?? action.payload.suggestion ?? 'A entidade esta pronta para sair do laboratorio.',
              now,
            ),
          },
        }))
      }
      break
    }
    case 'updateMemory': {
      appendDomainCommand(domainCommands, nextCommand('register_interaction', buildInteractionPayload(action)))
      entityProfile = applyMemoryUpdate(entityProfile, action, now)
      break
    }
    case 'entityInteraction': {
      appendDomainCommand(domainCommands, nextCommand('register_share', {
        summary:
          action.payload.message
          ?? action.payload.suggestion
          ?? `FlowMind initiated ${action.payload.interactionType ?? 'signal'} with ${action.payload.targetEntityName ?? action.payload.targetEntityId ?? 'another entity'}.`,
        topics: ['flowmind', 'entity-to-entity'],
        weight: clamp(Math.max(0.22, action.confidence * 0.72)),
      }))
      break
    }
    case 'triggerEvent': {
      const eventName = action.payload.eventName
      if (eventName === 'prepare_share') {
        appendDomainCommand(domainCommands, nextCommand('trigger_export', {
          exportFormat: 'post',
          summary: action.payload.message ?? action.payload.suggestion ?? 'FlowMind prepared share distribution.',
          topics: ['flowmind', 'export'],
          weight: clamp(Math.max(0.34, action.confidence * 0.78)),
        }))
        uiEffects.push(buildExportEffect(
          action.entityId,
          action.payload.message ?? action.payload.suggestion ?? 'A entidade esta pronta para ser compartilhada.',
          now,
        ))
      } else if (eventName === 'surface_in_feed') {
        appendDomainCommand(domainCommands, nextCommand('register_share', {
          summary: action.payload.suggestion ?? 'FlowMind surfaced the entity in discovery context.',
          topics: ['flowmind', 'feed'],
          weight: clamp(Math.max(0.22, action.confidence * 0.72)),
        }))
        uiEffects.push(buildDiscoveryEffect(
          action.entityId,
          action.payload.suggestion ?? 'Existem outras entidades relevantes para explorar agora.',
          now,
        ))
      } else if (eventName === 'schedule_return_prompt') {
        appendDomainCommand(domainCommands, nextCommand('register_return_visit', {
          summary: action.payload.message ?? 'FlowMind scheduled a return prompt.',
          topics: ['flowmind', 'return'],
          weight: clamp(Math.max(0.22, action.confidence * 0.72)),
        }))
        scheduledTasks.push(createScheduledTask({
          entityId: action.entityId,
          type: 'return_prompt',
          delayMs: 18_000,
          createdAt: now,
          payload: {
            uiEffect: buildMessageEffect(
              action.entityId,
              action.payload.message ?? 'A entidade quer retomar contato no momento certo.',
              now,
            ),
            event: createEvent(args.state, args.command, now, 'interaction.message', {
              messageType: 'assistant',
              summary: action.payload.message ?? 'FlowMind scheduled a return prompt.',
              topics: ['flowmind', 'return'],
            }),
          },
        }))
      } else if (eventName === 'lock_final_presence') {
        appendDomainCommand(domainCommands, nextCommand('set_stage', {
          stageId: 'final',
          summary: 'FlowMind locked final presence.',
        }))
      } else {
        appendDomainCommand(domainCommands, nextCommand('register_interaction', {
          summary: action.payload.question ?? action.payload.message ?? 'FlowMind observed context before acting.',
          topics: ['flowmind', 'memory'],
          weight: clamp(Math.max(0.18, action.confidence * 0.48)),
        }))
        if (eventName === 'capture_preference_signal') {
          uiEffects.push(buildPromptEffect(
            action.entityId,
            action.payload.question ?? action.payload.message ?? 'Qual preferencia deve ser registrada agora?',
            now,
          ))
        }
      }
      break
    }
  }

  return {
    entityProfile,
    domainCommands,
    uiEffects,
    scheduledTasks,
    policy: {
      allowed: guarded.allowed,
      reason: guarded.reason,
    },
  }
}