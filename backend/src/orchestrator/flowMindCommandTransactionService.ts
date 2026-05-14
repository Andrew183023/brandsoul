import type { BackendDatabase } from '../db/index.js'
import type { JsonObject } from '../domain/entityProfile.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindExecutionLedgerRepository } from '../repositories/flowMindExecutionLedgerRepository.js'
import { EntityCognitiveMemoryRepository } from '../repositories/entityCognitiveMemoryRepository.js'
import { EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import { EntityRepository } from '../repositories/entityRepository.js'
import { FlowMindDecisionJournalRepository } from '../repositories/flowMindDecisionJournalRepository.js'
import { FlowMindExecutionLedgerRepository as TransactionalFlowMindExecutionLedgerRepository } from '../repositories/flowMindExecutionLedgerRepository.js'
import { MultiEntityRegistry } from './multiEntityRegistry.js'
import { OrchestratorSnapshotRepository } from '../repositories/orchestratorSnapshotRepository.js'
import { RelationalTraceRepository } from '../repositories/relationalTraceRepository.js'
import type { FlowMindPort } from '../services/flowMindPort.js'
import { createOrchestratorCommand, applyOrchestratorCommand, applyOrchestratorCommandPipeline } from './orchestratorCore.js'
import { resolveFlowMindOperationalEffect } from './flowMindOperationalService.js'
import { restoreOrchestratorState } from './orchestratorState.js'
import { applyRelationalStateToEntityProfile } from './relationalTypes.js'
import { hashFlowMindValue } from './flowMindHashing.js'
import { withAuthoritativeFrame } from './contracts.js'
import type { OrchestratorFrame } from './orchestratorState.js'
import { getMutationAuthorityContext, runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'

type TransactionFailure = {
  statusCode: number
  code: string
  message: string
}

export type ExecuteFlowMindCommandResult = {
  snapshot: Awaited<ReturnType<OrchestratorSnapshotRepository['saveSnapshot']>>
  allEvents: Array<Awaited<ReturnType<EntityEventLogRepository['logEvent']>>>
  finalState: ReturnType<typeof restoreOrchestratorState>
  finalFrame: OrchestratorFrame
  pendingUiEffects: Awaited<ReturnType<typeof resolveFlowMindOperationalEffect>>['uiEffects']
  pendingScheduledTasks: Awaited<ReturnType<typeof resolveFlowMindOperationalEffect>>['scheduledTasks']
  flowMindEffect: Awaited<ReturnType<typeof resolveFlowMindOperationalEffect>>
  command: ReturnType<typeof createOrchestratorCommand>
}

export type FlowMindCommandTransactionDependencies = {
  connection: BackendDatabase
  flowMindService?: FlowMindPort
  ledgerRepository: FlowMindExecutionLedgerRepository
}

export type ExecuteFlowMindCommandInput = {
  entity: { id: string, entityProfile: EntityProfile }
  requestCommand: Parameters<typeof createOrchestratorCommand>[0]
  actorId: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

function parseFirstTopic(value: unknown) {
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).find(Boolean)
  }

  return undefined
}

function parseIntentFromTopics(value: unknown) {
  const topics = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : []

  if (topics.length >= 2 && topics[0] === 'flowmind') {
    return topics[1]
  }

  return undefined
}

function resolveFallbackStage(entity: { entityProfile: EntityProfile }) {
  const renderOutput = entity.entityProfile.runtime?.renderOutput as { sceneSpec?: { stage?: string } } | undefined
  return entity.entityProfile.runtime?.control?.playback?.activeStage
    ?? renderOutput?.sceneSpec?.stage
    ?? entity.entityProfile.finalForm?.identity?.name
    ?? 'initial'
}

export class FlowMindCommandTransactionService {
  constructor(private readonly dependencies: FlowMindCommandTransactionDependencies) {}

  async execute(args: ExecuteFlowMindCommandInput): Promise<ExecuteFlowMindCommandResult> {
    // Deprecated active path. Routes should submit `orchestrator.command.execute`
    // through SovereignMutationCommandService instead of calling this adapter directly.
    return executeFlowMindCommandTransaction(this.dependencies, args)
  }
}

export async function executeFlowMindCommandTransaction(
  dependencies: FlowMindCommandTransactionDependencies,
  args: ExecuteFlowMindCommandInput,
): Promise<ExecuteFlowMindCommandResult> {
  const command = createOrchestratorCommand(args.requestCommand)
  const createdAt = command.issuedAt
  const existingAuthority = getMutationAuthorityContext()
  const executeTransaction = async () => dependencies.connection.transaction(async (transactionDb) => {
        const entityRepository = new EntityRepository(transactionDb)
        const eventLogRepository = new EntityEventLogRepository(transactionDb)
        const snapshotRepository = new OrchestratorSnapshotRepository(transactionDb)
        const relationalTraceRepository = new RelationalTraceRepository(transactionDb)
        const entityCognitiveMemoryRepository = new EntityCognitiveMemoryRepository(transactionDb)
        const registry = new MultiEntityRegistry(transactionDb)
        const decisionJournalRepository = new FlowMindDecisionJournalRepository(transactionDb)
        const executionLedgerRepository = new TransactionalFlowMindExecutionLedgerRepository(transactionDb)

        await executionLedgerRepository.save({
          commandId: command.commandId,
          entityId: args.entity.id,
          decisionHash: '',
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
        })

        const latestSnapshot = await snapshotRepository.getLatestSnapshot(args.entity.id)
        const state = restoreOrchestratorState({
          entityId: args.entity.id,
          entityProfile: args.entity.entityProfile,
          snapshot: latestSnapshot,
          fallbackStage: resolveFallbackStage(args.entity),
          now: command.issuedAt,
        })

        const result = applyOrchestratorCommand({
          state,
          command,
          previousSnapshot: latestSnapshot,
          now: command.issuedAt,
        })

        const memoryRecord = await entityCognitiveMemoryRepository.getByEntityId(args.entity.id)
        const flowMindEffect = await resolveFlowMindOperationalEffect({
          entityProfile: args.entity.entityProfile,
          state: result.state,
          command: result.command,
          now: command.issuedAt,
          flowMindService: dependencies.flowMindService,
          memory: memoryRecord?.memory,
        })

        if (flowMindEffect.actionTransaction.rolledBack && flowMindEffect.actionTransaction.failure) {
          throw flowMindEffect.actionTransaction.failure
        }

        const rootDecisionHash = hashFlowMindValue(flowMindEffect.flowMind)
        await decisionJournalRepository.save({
          commandId: command.commandId,
          entityId: args.entity.id,
          decisionHash: rootDecisionHash,
          decisionJson: JSON.stringify(flowMindEffect.flowMind),
          createdAt: command.issuedAt,
        })

        const loggedEvent = await eventLogRepository.logEvent({
          id: result.event.id,
          entityId: result.event.entityId,
          type: result.event.type,
          payload: result.event.payload,
          timestamp: result.event.timestamp,
          causedByCommandId: result.event.causedByCommandId,
        })
        const followUpPipeline = flowMindEffect.domainCommands.length > 0
          ? applyOrchestratorCommandPipeline({
            state: result.state,
            commands: flowMindEffect.domainCommands.map((followUp) => createOrchestratorCommand({
              type: followUp.type,
              name: followUp.name,
              payload: followUp.payload,
              commandId: followUp.commandId,
              issuedAt: followUp.issuedAt,
              source: 'flowmind',
            })),
            previousSnapshot: latestSnapshot,
            now: command.issuedAt,
          })
          : undefined

        const allEvents = [loggedEvent]
        for (const event of followUpPipeline?.events ?? []) {
          const loggedFollowUpEvent = await eventLogRepository.logEvent({
            id: event.id,
            entityId: event.entityId,
            type: event.type,
            payload: event.payload,
            timestamp: event.timestamp,
            causedByCommandId: event.causedByCommandId,
          })
          allEvents.push(loggedFollowUpEvent)
        }

        const allRelationalDeltas = [
          ...(result.relationalDeltas ?? []),
          ...(followUpPipeline?.relationalDeltas ?? []),
        ]
        const allRelationalGuardrails = [
          ...(result.relationalGuardrails ?? []),
          ...(followUpPipeline?.relationalGuardrails ?? []),
        ]

        for (const [index, event] of allEvents.entries()) {
          const delta = allRelationalDeltas[index]
          const guardrails = allRelationalGuardrails[index]
          if (!delta) {
            continue
          }

          if (event.type !== 'interaction.registered' && event.type !== 'return.visit.registered' && event.type !== 'return_visit.registered' && event.type !== 'share.registered') {
            continue
          }

          await relationalTraceRepository.logTrace({
            entityId: event.entityId,
            commandId: event.causedByCommandId,
            eventType: event.type,
            eventId: event.id,
            actorId: args.actorId,
            occurredAt: event.timestamp,
            topic: parseFirstTopic(event.payload.topics),
            intent: parseIntentFromTopics(event.payload.topics),
            interactionType: typeof event.payload.interactionType === 'string' ? event.payload.interactionType : undefined,
            deltaBindingStrength: delta.deltaBindingStrength,
            deltaXp: delta.deltaXp,
            deltaContinuityConfidence: delta.deltaContinuityConfidence,
            deltaReturnCount: delta.deltaReturnCount,
            deltaShareCount: delta.deltaShareCount,
            metadataJson: toJsonObject({
              commandId: event.causedByCommandId,
              topics: event.payload.topics,
              summary: event.payload.summary,
              lineageRootCommandId: flowMindEffect.flowMind.lineage.rootCommandId,
              decisionCreatedAt: isPlainObject(flowMindEffect.flowMind.trace) ? flowMindEffect.flowMind.trace.createdAt : command.issuedAt,
              actionType: flowMindEffect.flowMind.lineage.entityAction.type,
              decisionReason: flowMindEffect.flowMind.decision.reason,
              guardrails,
            }),
          })
        }

        const snapshot = await snapshotRepository.saveSnapshot(followUpPipeline?.snapshot ?? result.snapshot)
        const finalState = followUpPipeline?.state ?? result.state
        const finalFrame = withAuthoritativeFrame(followUpPipeline?.frame ?? result.frame)
        const persistedEntityProfile = applyRelationalStateToEntityProfile(
          flowMindEffect.entityProfile,
          finalState.relationalState,
          snapshot.updatedAt,
        )

        await entityRepository.updateEntity({
          id: args.entity.id,
          entityProfile: persistedEntityProfile,
          updatedAt: snapshot.updatedAt,
        })
        await entityCognitiveMemoryRepository.save({
          entityId: args.entity.id,
          memory: flowMindEffect.updatedMemory,
          updatedAt: snapshot.updatedAt,
        })

        const registryRecord = await registry.getEntityById(args.entity.id)
        if (registryRecord) {
          await registry.updateEntityState({
            entityId: args.entity.id,
            lastDecisionSnapshot: {
              commandId: command.commandId,
              evaluatedAt: snapshot.updatedAt,
              decision: flowMindEffect.flowMind.decision,
              actionType: flowMindEffect.flowMind.lineage.entityAction.type,
              transaction: flowMindEffect.actionTransaction,
            },
            updatedAt: snapshot.updatedAt,
          })
        }

        await executionLedgerRepository.save({
          commandId: command.commandId,
          entityId: args.entity.id,
          decisionHash: rootDecisionHash,
          status: 'committed',
          committedAt: snapshot.updatedAt,
          snapshotId: snapshot.id,
          lastEventId: allEvents[allEvents.length - 1]?.id,
          createdAt,
          updatedAt: snapshot.updatedAt,
        })

        return {
          snapshot,
          allEvents,
          finalState,
          finalFrame,
          pendingUiEffects: [...result.uiEffects, ...(followUpPipeline?.uiEffects ?? []), ...flowMindEffect.uiEffects],
          pendingScheduledTasks: flowMindEffect.scheduledTasks,
          flowMindEffect,
          command,
        }
      })

  try {
    if (existingAuthority) {
      return await executeTransaction()
    }

    return await runWithMutationAuthority({
      source: 'backend/src/orchestrator/flowMindCommandTransactionService.ts#execute',
      viaExecutor: true,
    }, executeTransaction)
  } catch (error) {
    const failure = error as TransactionFailure
    await dependencies.ledgerRepository.save({
      commandId: command.commandId,
      entityId: args.entity.id,
      decisionHash: '',
      status: 'failed',
      errorCode: failure.code ?? 'FLOWMIND_COMMAND_FAILED',
      errorMessage: failure.message ?? 'FlowMind command transaction failed.',
      createdAt,
      updatedAt: command.issuedAt,
    })
    throw error
  }
}

export function createFlowMindCommandTransactionService(dependencies: FlowMindCommandTransactionDependencies) {
  return new FlowMindCommandTransactionService(dependencies)
}
