import type { EntityAction } from '../domain/entity/contracts/EntityAction.js'
import type { EntityProfile } from '../domain/entity/contracts/EntityProfile.js'
import type { OrchestratorCommand, OrchestratorState } from '../../orchestrator/orchestratorState.js'
import { updateMemoryPreference } from '../domain/entity/services/memoryEngine.js'
import { validateAction, type FlowMindActionPolicyContext } from './flowMindGuard.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { EntityRepository as TransactionalEntityRepository } from '../../repositories/entityRepository.js'
import type { EntityEventLogRepository } from '../../repositories/entityEventLogRepository.js'
import { EntityEventLogRepository as TransactionalEntityEventLogRepository } from '../../repositories/entityEventLogRepository.js'
import { checkAutonomyActionPermission } from '../../orchestrator/flowMindAuthorityPolicy.js'
import type { MultiEntityRegistry } from '../../orchestrator/multiEntityRegistry.js'
import { MultiEntityRegistry as TransactionalMultiEntityRegistry } from '../../orchestrator/multiEntityRegistry.js'
import type { EntityCreationProposal } from '../../orchestrator/entityCreationProposal.js'
import type { BackendDatabase } from '../../db/index.js'
import type { FlowMindApprovalQueue } from '../../orchestrator/approvalQueue.js'
import { FlowMindApprovalQueue as TransactionalFlowMindApprovalQueue } from '../../orchestrator/approvalQueue.js'
import type { FlowMindAutonomyLevel } from '../../services/flowMindPort.js'
import { hashFlowMindValue } from '../../orchestrator/flowMindHashing.js'
import { runWithMutationAuthority } from '../../sovereignty/authorityBoundary.js'
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
  transaction: FlowMindActionTransaction
  policy: {
    allowed: boolean
    reason?: string
  }
}

export type FlowMindActionTransactionFailureKind = 'validation' | 'policy' | 'conflict'

export type FlowMindActionTransactionFailure = {
  kind: FlowMindActionTransactionFailureKind
  statusCode: 400 | 403 | 409
  code: string
  message: string
}

export type FlowMindActionTransaction = {
  idempotencyKey: string
  validated: boolean
  executed: boolean
  committed: boolean
  rolledBack: boolean
  failure?: FlowMindActionTransactionFailure
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
  create_entity: 'register_interaction',
}

export type FlowMindActionOrchestrationDependencies = {
  database: BackendDatabase
  entityRepository: EntityRepository
  eventLogRepository: EntityEventLogRepository
  registry: MultiEntityRegistry
  approvalQueue: FlowMindApprovalQueue
  transactionBoundaryActive?: boolean
}

function buildApprovalId(entityId: string, proposalId: string) {
  return `approval-${entityId}-${proposalId}`.slice(0, 128)
}

function buildApprovalExpiry(now: string) {
  return new Date(Date.parse(now) + (1000 * 60 * 60 * 24 * 3)).toISOString()
}

function hasApprovedCreateEntityApproval(action: EntityAction) {
  return action.payload.metadata?.approvalStatus === 'approved'
}

function buildApprovalHashes(proposal: EntityCreationProposal) {
  return {
    proposalHash: hashFlowMindValue(proposal),
    payloadHash: hashFlowMindValue(proposal.blueprint),
    riskLevel: proposal.riskClassification,
  }
}

async function validateCreateEntityApproval(args: {
  action: EntityAction
  proposal: EntityCreationProposal
  approvalQueue: FlowMindApprovalQueue
  entityId: string
}) {
  const approvalId = typeof args.action.payload.metadata?.approvalId === 'string'
    ? args.action.payload.metadata.approvalId
    : undefined
  const record = approvalId
    ? await args.approvalQueue.getById(approvalId)
    : await args.approvalQueue.getByProposal(args.entityId, args.proposal.proposalId, 'create_entity')

  if (!record || record.status !== 'approved') {
    return {
      approved: false,
      reason: 'approved-approval-record-required',
    }
  }

  const expected = buildApprovalHashes(args.proposal)
  if (record.entityId !== args.entityId
    || record.proposalId !== args.proposal.proposalId
    || record.proposalHash !== expected.proposalHash
    || record.payloadHash !== expected.payloadHash
    || record.riskLevel !== expected.riskLevel) {
    return {
      approved: false,
      reason: 'approval-binding-mismatch',
    }
  }

  return {
    approved: true,
    record,
  }
}

function buildCreatedEntityProfile(args: {
  sourceEntity: EntityProfile
  proposal: EntityCreationProposal
  now: string
  requestId: string
}): EntityProfile {
  return {
    ...args.sourceEntity,
    id: args.proposal.blueprint.targetEntityId,
    brand: args.proposal.blueprint.entityInput.brand as EntityProfile['brand'],
    context: {
      ...args.sourceEntity.context,
      ...args.proposal.blueprint.entityInput.context,
    } as EntityProfile['context'],
    palette: {
      ...args.sourceEntity.palette,
      ...args.proposal.blueprint.entityInput.palette,
    } as EntityProfile['palette'],
    social: {
      ...args.sourceEntity.social,
      publicName: args.proposal.blueprint.identity.name,
      category: args.proposal.blueprint.market,
      visibility: args.proposal.blueprint.publicFacing ? 'public' : 'private',
    },
    finalForm: {
      ...args.sourceEntity.finalForm,
      identity: {
        ...(args.sourceEntity.finalForm?.identity ?? {}),
        name: args.proposal.blueprint.identity.name,
        socialLine: args.proposal.blueprint.identity.tagline ?? args.proposal.rationale,
        openingLine: `Hello, I am ${args.proposal.blueprint.identity.name}.`,
      },
    },
    metadata: {
      ...args.sourceEntity.metadata,
      createdAt: args.now,
      updatedAt: args.now,
      requestId: args.requestId,
      notes: [
        `flowmind:create_entity:${args.now}:${args.proposal.proposalId}:${args.proposal.riskClassification}`,
      ],
    },
    runtime: {
      ...args.sourceEntity.runtime,
      flowMind: {
        ...args.sourceEntity.runtime?.flowMind,
        mode: 'shadow',
        updatedAt: args.now,
      },
    },
  }
}

function normalizeIdPart(value: unknown) {
  const normalized = String(value ?? 'na')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized.slice(0, 24) : 'na'
}

function createId(prefix: 'effect' | 'task' | 'command' | 'event', ...parts: unknown[]) {
  return [prefix, ...parts.map((part) => normalizeIdPart(part))].join('-').slice(0, 128)
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
    eventId: createId('event', state.entityId, command.commandId, name, issuedAt),
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
    taskId: createId('task', args.entityId, args.type, args.createdAt, args.delayMs),
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
    effectId: createId('effect', entityId, 'message', createdAt, body),
    entityId,
    kind: 'message',
    title: 'A entidade enviou um sinal',
    body,
    createdAt,
  }
}

function buildPromptEffect(entityId: string, question: string, createdAt: string): Extract<FlowMindUiEffect, { kind: 'prompt' }> {
  return {
    effectId: createId('effect', entityId, 'prompt', createdAt, question),
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
    effectId: createId('effect', entityId, 'discovery', createdAt, body),
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
    effectId: createId('effect', entityId, 'export', createdAt, body),
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

function resolvePolicyContext(args: {
  state: OrchestratorState
  command: OrchestratorCommand
}): FlowMindActionPolicyContext {
  if (args.command.name === 'trigger_export') {
    return 'export'
  }

  if (args.state.sessionStatus === 'completed' || args.state.currentStage === 'final') {
    return 'final'
  }

  if (args.command.name === 'start_birth' || args.command.name === 'resume_birth') {
    return 'creation'
  }

  return 'interaction'
}

function resolvePreviousActionType(entityProfile: EntityProfile) {
  const notes = entityProfile.metadata.notes ?? []
  const latestDecisionNote = notes.find((note) => /^flowmind:decision:/.test(note))
  if (!latestDecisionNote) {
    return undefined
  }

  const match = latestDecisionNote.match(/^flowmind:decision:(.+Z):([^:]+):([^:]+):([0-9.]+)$/)
  return match?.[3]
}

function buildRollbackResult(args: {
  entityProfile: EntityProfile
  idempotencyKey: string
  failure: FlowMindActionTransactionFailure
  validated: boolean
  executed?: boolean
}): FlowMindActionExecutionResult {
  return {
    entityProfile: args.entityProfile,
    domainCommands: [],
    uiEffects: [],
    scheduledTasks: [],
    transaction: {
      idempotencyKey: args.idempotencyKey,
      validated: args.validated,
      executed: args.executed === true,
      committed: false,
      rolledBack: true,
      failure: args.failure,
    },
    policy: {
      allowed: false,
      reason: args.failure.message,
    },
  }
}

function mapGuardFailureToTransactionFailure(guarded: ReturnType<typeof validateAction>): FlowMindActionTransactionFailure {
  if (guarded.failureKind === 'policy') {
    return {
      kind: 'policy',
      statusCode: 403,
      code: guarded.failureCode ?? 'FLOWMIND_ACTION_POLICY_DENIED',
      message: guarded.reason ?? 'FlowMind action is not allowed by policy.',
    }
  }

  if (guarded.failureKind === 'conflict') {
    return {
      kind: 'conflict',
      statusCode: 409,
      code: guarded.failureCode ?? 'FLOWMIND_ACTION_CONFLICT',
      message: guarded.reason ?? 'FlowMind action conflicts with current state.',
    }
  }

  return {
    kind: 'validation',
    statusCode: 400,
    code: guarded.failureCode ?? 'FLOWMIND_ACTION_VALIDATION_FAILED',
    message: guarded.reason ?? 'FlowMind action failed validation.',
  }
}

function executeValidatedFlowMindAction(args: {
  action: EntityAction
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now: string
  orchestration?: FlowMindActionOrchestrationDependencies
}) {
  const domainCommands: FlowMindFollowUpCommand[] = []
  const uiEffects: FlowMindUiEffect[] = []
  const scheduledTasks: EntityScheduledTask[] = []
  let entityProfile = args.entityProfile

  const nextCommand = (name: FlowMindFollowUpCommandName, payload?: FlowMindFollowUpCommand['payload']) => createCommand({
    name,
    issuedAt: args.now,
    rootCommandId: args.command.commandId,
    sequence: domainCommands.length,
    payload,
  })

  switch (args.action.type) {
    case 'sendMessage': {
      appendDomainCommand(domainCommands, nextCommand('register_interaction', buildInteractionPayload(args.action)))
      const body = args.action.payload.message ?? 'A entidade registrou uma mensagem contextual.'
      if (args.action.payload.eventName === 'schedule_return_prompt') {
        scheduledTasks.push(createScheduledTask({
          entityId: args.action.entityId,
          type: 'return_prompt',
          delayMs: 18_000,
          createdAt: args.now,
          payload: {
            uiEffect: buildMessageEffect(args.action.entityId, body, args.now),
            event: createEvent(args.state, args.command, args.now, 'interaction.message', {
              messageType: 'assistant',
              summary: body,
              topics: ['flowmind', args.action.source.intent],
            }),
          },
        }))
      } else {
        uiEffects.push(buildMessageEffect(args.action.entityId, body, args.now))
      }
      break
    }
    case 'askQuestion': {
      appendDomainCommand(domainCommands, nextCommand('register_interaction', buildInteractionPayload(args.action)))
      uiEffects.push(buildPromptEffect(
        args.action.entityId,
        args.action.payload.question ?? 'Qual sinal de estilo deve ser reforcado agora?',
        args.now,
      ))
      scheduledTasks.push(createScheduledTask({
        entityId: args.action.entityId,
        type: 'follow_up',
        delayMs: args.state.sessionStatus === 'completed' ? 22_000 : 28_000,
        createdAt: args.now,
        payload: {
          uiEffect: buildMessageEffect(
            args.action.entityId,
            'Quando quiser, me diga um novo sinal de estilo para eu refinar a memoria desta presenca.',
            args.now,
          ),
        },
      }))
      break
    }
    case 'suggestProduct':
    case 'suggestDiscovery': {
      appendDomainCommand(domainCommands, nextCommand('register_share', {
        summary: args.action.payload.suggestion ?? 'FlowMind suggested a discovery path.',
        topics: ['flowmind', 'discovery'],
        weight: clamp(Math.max(0.22, args.action.confidence * 0.72)),
      }))
      const effect = buildDiscoveryEffect(
        args.action.entityId,
        args.action.payload.suggestion ?? 'Existem outras entidades relevantes para explorar agora.',
        args.now,
      )
      uiEffects.push(effect)
      if (args.state.sessionStatus === 'completed' || args.state.currentStage === 'final') {
        scheduledTasks.push(createScheduledTask({
          entityId: args.action.entityId,
          type: 'social_action',
          delayMs: 14_000,
          createdAt: args.now,
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
          summary: args.action.payload.message ?? args.action.payload.suggestion ?? 'FlowMind requested export generation.',
          topics: ['flowmind', 'export'],
          weight: clamp(Math.max(0.34, args.action.confidence * 0.78)),
        }))
        uiEffects.push(buildExportEffect(
          args.action.entityId,
          args.action.payload.message ?? args.action.payload.suggestion ?? 'A entidade esta pronta para sair do laboratorio.',
          args.now,
        ))
      } else {
        scheduledTasks.push(createScheduledTask({
          entityId: args.action.entityId,
          type: 'reminder',
          delayMs: 18_000,
          createdAt: args.now,
          payload: {
            uiEffect: buildExportEffect(
              args.action.entityId,
              args.action.payload.message ?? args.action.payload.suggestion ?? 'A entidade esta pronta para sair do laboratorio.',
              args.now,
            ),
          },
        }))
      }
      break
    }
    case 'updateMemory': {
      appendDomainCommand(domainCommands, nextCommand('register_interaction', buildInteractionPayload(args.action)))
      entityProfile = applyMemoryUpdate(entityProfile, args.action, args.now)
      break
    }
    case 'entityInteraction': {
      appendDomainCommand(domainCommands, nextCommand('register_share', {
        summary:
          args.action.payload.message
          ?? args.action.payload.suggestion
          ?? `FlowMind initiated ${args.action.payload.interactionType ?? 'signal'} with ${args.action.payload.targetEntityName ?? args.action.payload.targetEntityId ?? 'another entity'}.`,
        topics: ['flowmind', 'entity-to-entity'],
        weight: clamp(Math.max(0.22, args.action.confidence * 0.72)),
      }))
      break
    }
    case 'triggerEvent': {
      const eventName = args.action.payload.eventName
      if (eventName === 'prepare_share') {
        appendDomainCommand(domainCommands, nextCommand('trigger_export', {
          exportFormat: 'post',
          summary: args.action.payload.message ?? args.action.payload.suggestion ?? 'FlowMind prepared share distribution.',
          topics: ['flowmind', 'export'],
          weight: clamp(Math.max(0.34, args.action.confidence * 0.78)),
        }))
        uiEffects.push(buildExportEffect(
          args.action.entityId,
          args.action.payload.message ?? args.action.payload.suggestion ?? 'A entidade esta pronta para ser compartilhada.',
          args.now,
        ))
      } else if (eventName === 'surface_in_feed') {
        appendDomainCommand(domainCommands, nextCommand('register_share', {
          summary: args.action.payload.suggestion ?? 'FlowMind surfaced the entity in discovery context.',
          topics: ['flowmind', 'feed'],
          weight: clamp(Math.max(0.22, args.action.confidence * 0.72)),
        }))
        uiEffects.push(buildDiscoveryEffect(
          args.action.entityId,
          args.action.payload.suggestion ?? 'Existem outras entidades relevantes para explorar agora.',
          args.now,
        ))
      } else if (eventName === 'schedule_return_prompt') {
        appendDomainCommand(domainCommands, nextCommand('register_return_visit', {
          summary: args.action.payload.message ?? 'FlowMind scheduled a return prompt.',
          topics: ['flowmind', 'return'],
          weight: clamp(Math.max(0.22, args.action.confidence * 0.72)),
        }))
        scheduledTasks.push(createScheduledTask({
          entityId: args.action.entityId,
          type: 'return_prompt',
          delayMs: 18_000,
          createdAt: args.now,
          payload: {
            uiEffect: buildMessageEffect(
              args.action.entityId,
              args.action.payload.message ?? 'A entidade quer retomar contato no momento certo.',
              args.now,
            ),
            event: createEvent(args.state, args.command, args.now, 'interaction.message', {
              messageType: 'assistant',
              summary: args.action.payload.message ?? 'FlowMind scheduled a return prompt.',
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
          summary: args.action.payload.question ?? args.action.payload.message ?? 'FlowMind observed context before acting.',
          topics: ['flowmind', 'memory'],
          weight: clamp(Math.max(0.18, args.action.confidence * 0.48)),
        }))
        if (eventName === 'capture_preference_signal') {
          uiEffects.push(buildPromptEffect(
            args.action.entityId,
            args.action.payload.question ?? args.action.payload.message ?? 'Qual preferencia deve ser registrada agora?',
            args.now,
          ))
        }
      }
      break
    }
    case 'observeContext': {
      break
    }
    case 'create_entity': {
      const proposal = args.action.payload.metadata?.proposal as EntityCreationProposal | undefined
      const autonomyLevel: FlowMindAutonomyLevel = typeof args.action.payload.metadata?.autonomyLevel === 'string'
        ? args.action.payload.metadata.autonomyLevel as FlowMindAutonomyLevel
        : 'manual'
      const approvalGranted = hasApprovedCreateEntityApproval(args.action)

      if (!proposal || !args.orchestration) {
        throw new Error('create_entity requires proposal metadata and orchestration dependencies.')
      }

      const permission = checkAutonomyActionPermission({
        actionType: 'create_entity',
        autonomyLevel,
        riskLevel: proposal.riskClassification,
        approvalRequired: proposal.approvalRequired,
        lifecycleState: 'sandbox',
      })

      if (!permission.allowed && !approvalGranted) {
        throw new Error(permission.reason ?? 'create_entity denied by autonomy policy.')
      }

      break
    }
  }

  return {
    entityProfile,
    domainCommands,
    uiEffects,
    scheduledTasks,
  }
}

export async function executeFlowMindAction(args: {
  action: EntityAction
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now?: string
  idempotencyKey?: string
  orchestration?: FlowMindActionOrchestrationDependencies
}): Promise<FlowMindActionExecutionResult> {
  return runWithMutationAuthority({
    source: 'backend/src/brain/flowmind/flowMindActionExecutor.ts#executeFlowMindAction',
    viaExecutor: true,
  }, async () => {
    const now = args.now ?? args.command.issuedAt ?? args.entityProfile.metadata.updatedAt ?? '2026-01-01T00:00:00.000Z'
    const idempotencyKey = args.idempotencyKey?.trim() || args.command.commandId?.trim() || ''

    if (!idempotencyKey) {
      return buildRollbackResult({
        entityProfile: args.entityProfile,
        idempotencyKey: '',
        validated: false,
        failure: {
          kind: 'validation',
          statusCode: 400,
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key is required for FlowMind action execution.',
        },
      })
    }

    const guarded = validateAction(args.action, {
      now,
      policyContext: resolvePolicyContext({
        state: args.state,
        command: args.command,
      }),
      previousActionAt: args.entityProfile.metadata.updatedAt,
      previousActionType: resolvePreviousActionType(args.entityProfile),
    })

    if (!guarded.allowed) {
      return buildRollbackResult({
        entityProfile: args.entityProfile,
        idempotencyKey,
        validated: true,
        failure: mapGuardFailureToTransactionFailure(guarded),
      })
    }

    if (guarded.action.type === 'create_entity') {
    const proposal = guarded.action.payload.metadata?.proposal as EntityCreationProposal | undefined
    const autonomyLevel: FlowMindAutonomyLevel = typeof guarded.action.payload.metadata?.autonomyLevel === 'string'
      ? guarded.action.payload.metadata.autonomyLevel as FlowMindAutonomyLevel
      : 'manual'

    if (!proposal) {
      return buildRollbackResult({
        entityProfile: args.entityProfile,
        idempotencyKey,
        validated: true,
        failure: {
          kind: 'validation',
          statusCode: 400,
          code: 'FLOWMIND_CREATE_ENTITY_PROPOSAL_REQUIRED',
          message: 'create_entity requires a proposal payload.',
        },
      })
    }

    if (!args.orchestration) {
      return buildRollbackResult({
        entityProfile: args.entityProfile,
        idempotencyKey,
        validated: true,
        failure: {
          kind: 'validation',
          statusCode: 400,
          code: 'FLOWMIND_CREATE_ENTITY_ORCHESTRATION_REQUIRED',
          message: 'create_entity requires orchestration dependencies.',
        },
      })
    }

    const permission = checkAutonomyActionPermission({
      actionType: 'create_entity',
      autonomyLevel,
      riskLevel: proposal.riskClassification,
      approvalRequired: proposal.approvalRequired,
      lifecycleState: 'sandbox',
    })
    const approvalValidation = hasApprovedCreateEntityApproval(guarded.action)
      ? await validateCreateEntityApproval({
        action: guarded.action,
        proposal,
        approvalQueue: args.orchestration.approvalQueue,
        entityId: args.entityProfile.id,
      })
      : { approved: false as const }
    const approvalGranted = approvalValidation.approved === true

    if (!permission.allowed && !approvalGranted) {
      if (permission.requiresApproval) {
        const approvalHashes = buildApprovalHashes(proposal)
        await args.orchestration.approvalQueue.enqueue({
          approvalId: typeof guarded.action.payload.metadata?.approvalId === 'string'
            ? guarded.action.payload.metadata.approvalId
            : buildApprovalId(args.entityProfile.id, proposal.proposalId),
          entityId: args.entityProfile.id,
          proposalId: proposal.proposalId,
          actionType: 'create_entity',
          rationale: proposal.rationale,
          payload: {
            proposal,
            autonomyLevel,
          },
          proposalHash: approvalHashes.proposalHash,
          payloadHash: approvalHashes.payloadHash,
          riskLevel: approvalHashes.riskLevel,
          requestedAt: now,
          expiresAt: buildApprovalExpiry(now),
        })
      }

      return buildRollbackResult({
        entityProfile: args.entityProfile,
        idempotencyKey,
        validated: true,
        failure: {
          kind: 'policy',
          statusCode: 403,
          code: permission.requiresApproval
            ? 'FLOWMIND_CREATE_ENTITY_APPROVAL_REQUIRED'
            : 'FLOWMIND_CREATE_ENTITY_PERMISSION_DENIED',
          message: approvalValidation.approved === false && 'reason' in approvalValidation && approvalValidation.reason === 'approval-binding-mismatch'
            ? 'create_entity approval binding mismatch.'
            : permission.requiresApproval
            ? 'create_entity routed to approval queue.'
            : permission.reason ?? 'create_entity denied by autonomy matrix.',
        },
      })
    }

    const existingRegistryEntry = await args.orchestration.registry.getEntityById(proposal.blueprint.targetEntityId)
    const existingEntityRecord = await args.orchestration.entityRepository.getEntityById(proposal.blueprint.targetEntityId)
    if (!existingRegistryEntry && !existingEntityRecord) {
      const createdEntity = buildCreatedEntityProfile({
        sourceEntity: args.entityProfile,
        proposal,
        now,
        requestId: idempotencyKey,
      })

      const persistCreateEntity = async (transactionDb: BackendDatabase) => {
        const transactionEntityRepository = new TransactionalEntityRepository(transactionDb)
        const transactionRegistry = new TransactionalMultiEntityRegistry(transactionDb)
        const transactionEventLogRepository = new TransactionalEntityEventLogRepository(transactionDb)
        const transactionApprovalQueue = new TransactionalFlowMindApprovalQueue(transactionDb)
        const transactionalRegistryEntry = await transactionRegistry.getEntityById(proposal.blueprint.targetEntityId)
        const transactionalEntityRecord = await transactionEntityRepository.getEntityById(proposal.blueprint.targetEntityId)

        if (transactionalRegistryEntry || transactionalEntityRecord) {
          return
        }

        await transactionEntityRepository.createEntity({
          id: proposal.blueprint.targetEntityId,
          ownerId: args.entityProfile.ownerId,
          entityProfile: createdEntity,
          createdAt: now,
          updatedAt: now,
        })
        await transactionRegistry.registerEntity({
          entityId: proposal.blueprint.targetEntityId,
          entityType: proposal.blueprint.entityType,
          market: proposal.blueprint.market,
          lifecycleState: proposal.blueprint.publicFacing ? 'proposed' : 'sandbox',
          autonomyLevel: 'manual',
          riskLevel: proposal.riskClassification,
          memoryStatus: 'cold',
          activeGoals: proposal.blueprint.initialGoals.map((goal) => ({ type: goal })),
          operatingConstraints: proposal.blueprint.operatingConstraints ?? {},
          healthScore: 0.5,
          leadGenerationScore: 0,
          memoryConfidence: 0.2,
          autonomyReadiness: 0.2,
          riskScore: proposal.riskClassification === 'low' ? 0.2 : proposal.riskClassification === 'medium' ? 0.45 : proposal.riskClassification === 'high' ? 0.72 : 0.9,
          actionQueue: [],
          lastDecisionSnapshot: {
            createdBy: args.entityProfile.id,
            proposalId: proposal.proposalId,
            executedAt: now,
          },
          rollbackState: { active: false },
          createdAt: now,
          updatedAt: now,
        })
        await transactionEventLogRepository.logEvent({
          entityId: args.entityProfile.id,
          type: 'orchestrator.create_entity',
          timestamp: now,
          causedByCommandId: args.command.commandId,
          payload: {
            proposalId: proposal.proposalId,
            targetEntityId: proposal.blueprint.targetEntityId,
            riskClassification: proposal.riskClassification,
            approvalRequired: proposal.approvalRequired,
          },
        })
        await transactionEventLogRepository.logEvent({
          entityId: proposal.blueprint.targetEntityId,
          type: 'entity.created.autonomous',
          timestamp: now,
          causedByCommandId: args.command.commandId,
          payload: {
            sourceEntityId: args.entityProfile.id,
            proposalId: proposal.proposalId,
            auditTrail: 'transactional-executor',
          },
        })

        if (approvalGranted && typeof guarded.action.payload.metadata?.approvalId === 'string') {
          await transactionApprovalQueue.resolve({
            approvalId: guarded.action.payload.metadata.approvalId,
            status: 'approved',
            resolvedAt: now,
            resolvedBy: 'flowmind.executor',
          })
        }
      }

      if (args.orchestration.transactionBoundaryActive) {
        await persistCreateEntity(args.orchestration.database)
      } else {
        await args.orchestration.database.transaction(persistCreateEntity)
      }
    }

      return {
      entityProfile: args.entityProfile,
      domainCommands: [],
      uiEffects: [buildMessageEffect(
        args.entityProfile.id,
        `Nova entidade ${proposal.blueprint.identity.name} registrada em ${proposal.blueprint.publicFacing ? 'proposta' : 'sandbox'}.`,
        now,
      )],
      scheduledTasks: [],
      transaction: {
        idempotencyKey,
        validated: true,
        executed: true,
        committed: true,
        rolledBack: false,
      },
      policy: {
        allowed: true,
      },
      }
    }

    const executed = executeValidatedFlowMindAction({
      action: guarded.action,
      entityProfile: args.entityProfile,
      state: args.state,
      command: args.command,
      now,
      orchestration: args.orchestration,
    })

    return {
      ...executed,
      transaction: {
        idempotencyKey,
        validated: true,
        executed: true,
        committed: true,
        rolledBack: false,
      },
      policy: {
        allowed: true,
      },
    }
  })
}
