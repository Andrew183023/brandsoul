import type { FastifyInstance } from 'fastify'

import type { RuntimeControl } from '../../brain/domain/orchestration/contracts/RuntimeControl.js'
import type { JsonObject } from '../../domain/entityProfile.js'
import type { EntityEventLogRepository } from '../../repositories/entityEventLogRepository.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { OrchestratorSnapshotRepository } from '../../repositories/orchestratorSnapshotRepository.js'
import type { RelationalTraceRepository } from '../../repositories/relationalTraceRepository.js'
import type { FlowMindPort } from '../../services/flowMindPort.js'
import type { PublicCacheService } from '../../services/publicCacheService.js'
import {
  createRuntimeStatePayload,
  type DashboardFlowMindMetricsEndpoint,
  type DashboardFlowMindMetricsFilters,
  type DashboardFlowMindMetricsPeriod,
  type DashboardSparkStateResponse,
  type RelationalTraceDetailedResponse,
  withAuthoritativeFrame,
  type CommandResponse,
  type HydrateRuntimeResponse,
  type OrchestratorCommandRequest,
  type OrchestratorSessionMetadata,
} from '../../orchestrator/contracts.js'
import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import { buildDashboardSparkStateResponse } from '../../orchestrator/dashboardProjection.js'
import { buildDetailedRelationalTraceResponse } from '../../orchestrator/relationalTraceProjection.js'
import { buildRuntimeSceneProjection } from '../../orchestrator/runtimeSceneProjection.js'
import {
  applyOrchestratorCommandPipeline,
  createOrchestratorCommand,
  applyOrchestratorCommand,
  OrchestratorCommandPreconditionError,
} from '../../orchestrator/orchestratorCore.js'
import { resolveFlowMindOperationalEffect } from '../../orchestrator/flowMindOperationalService.js'
import {
  buildMinimalOrchestratorFrame,
  buildOrchestratorRuntimeControl,
  restoreOrchestratorState,
  type OrchestratorCommandName,
} from '../../orchestrator/orchestratorState.js'
import { applyRelationalStateToEntityProfile } from '../../orchestrator/relationalTypes.js'
import { getRequestAuth, requireAuth, type AuthContext } from '../middleware/requireAuth.js'
import { buildLegacyOwnerId, validateEntityOwnership } from '../middleware/requireEntityOwner.js'
import {
  buildPublicFlowMindPartialAggregation,
  normalizePublicFlowMindPartialControlUpdate,
  resolvePublicFlowMindPartialConfig,
} from '../../services/publicFlowMindPartialService.js'
import { buildPublicFlowMindShadowAggregation, buildPublicFlowMindShadowReadiness } from '../../orchestrator/dashboardProjection.js'

type BackendContext = {
  backendContext: {
    entityRepository: EntityRepository
    eventLogRepository: EntityEventLogRepository
    orchestratorSnapshotRepository: OrchestratorSnapshotRepository
    relationalTraceRepository: RelationalTraceRepository
    flowMindService?: FlowMindPort
    publicCacheService: PublicCacheService
  }
}

type PublicPartialControlBody = {
  rolloutPercentage?: unknown
  killSwitchEnabled?: unknown
  automationMode?: unknown
}

type CommandBody = Partial<OrchestratorCommandRequest> & {
  type?: 'command'
  name?: OrchestratorCommandName
}

type DashboardQuery = {
  endpoint?: string
  period?: string
}

function getRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

function getEventLogRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.eventLogRepository
}

function getOrchestratorSnapshotRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.orchestratorSnapshotRepository
}

function getRelationalTraceRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.relationalTraceRepository
}

function getFlowMindService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.flowMindService
}

function getPublicCacheService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.publicCacheService
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

function isSafeIdentifier(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value)
}

function isAllowedCommandName(value: unknown): value is OrchestratorCommandName {
  return value === 'start_birth'
    || value === 'pause_birth'
    || value === 'resume_birth'
    || value === 'set_stage'
    || value === 'apply_control'
    || value === 'trigger_export'
}

function isRuntimeControl(value: unknown): value is RuntimeControl {
  if (!isPlainObject(value)) {
    return false
  }

  if (value.engine !== 'pixi' && value.engine !== 'visual') {
    return false
  }

  if (typeof value.compareMode !== 'undefined' && typeof value.compareMode !== 'boolean') {
    return false
  }

  if (typeof value.playback !== 'undefined') {
    if (!isPlainObject(value.playback)) {
      return false
    }

    if (typeof value.playback.playBirthTimeline !== 'undefined' && typeof value.playback.playBirthTimeline !== 'boolean') {
      return false
    }

    if (typeof value.playback.activeStage !== 'undefined' && typeof value.playback.activeStage !== 'string') {
      return false
    }
  }

  return true
}

function isValidPublicPartialControlBody(body: unknown): body is PublicPartialControlBody {
  if (!isPlainObject(body)) {
    return false
  }

  return (typeof body.rolloutPercentage === 'undefined' || (typeof body.rolloutPercentage === 'number' && Number.isFinite(body.rolloutPercentage)))
    && (typeof body.killSwitchEnabled === 'undefined' || typeof body.killSwitchEnabled === 'boolean')
    && (typeof body.automationMode === 'undefined' || body.automationMode === 'recommendation-only' || body.automationMode === 'auto-apply')
}

function isValidCommandBody(body: unknown): body is CommandBody {
  if (!isPlainObject(body)) {
    return false
  }

  if (body.type !== 'command' || !isAllowedCommandName(body.name)) {
    return false
  }

  if (typeof body.commandId !== 'undefined' && !isSafeIdentifier(body.commandId)) {
    return false
  }

  if (typeof body.issuedAt !== 'undefined' && (typeof body.issuedAt !== 'string' || !Number.isFinite(Date.parse(body.issuedAt)))) {
    return false
  }

  if (typeof body.payload === 'undefined') {
    return true
  }

  if (!isPlainObject(body.payload)) {
    return false
  }

  if (body.name === 'set_stage') {
    return typeof body.payload.stageId === 'string' && body.payload.stageId.trim().length > 0 && body.payload.stageId.length <= 120
  }

  if (body.name === 'apply_control') {
    return isRuntimeControl(body.payload.control)
  }

  if (body.name === 'trigger_export') {
    return (
      typeof body.payload.exportFormat === 'string'
      && ['current', 'square', 'vertical', 'post', 'story'].includes(body.payload.exportFormat)
      && (typeof body.payload.summary === 'undefined' || (typeof body.payload.summary === 'string' && body.payload.summary.length <= 280))
    )
  }

  return (
    typeof body.payload.stageId === 'undefined'
    || (typeof body.payload.stageId === 'string' && body.payload.stageId.length <= 120)
  )
}

function toCommandRequest(body: CommandBody): OrchestratorCommandRequest {
  return {
    type: 'command',
    name: body.name!,
    commandId: body.commandId ?? `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    issuedAt: body.issuedAt ?? new Date().toISOString(),
    source: 'user',
    payload: body.payload,
  }
}

async function getOwnedEntityForAuth(app: FastifyInstance, entityId: string, auth: AuthContext) {
  const entity = await getRepository(app).getEntityById(entityId)
  if (!entity) {
    return {
      status: 'not_found' as const,
    }
  }

  const ownership = validateEntityOwnership(entity, auth.userId, auth.tenantId)
  if (!ownership) {
    return {
      status: 'forbidden' as const,
    }
  }

  if (ownership.source === 'legacy-backfilled') {
    const updatedEntity = await getRepository(app).setEntityOwnership({
      id: entity.id,
      ownerId: ownership.ownerId ?? buildLegacyOwnerId(auth.userId, auth.tenantId),
      ownerUserId: ownership.ownerUserId,
      ownerTenantId: ownership.ownerTenantId,
    })

    return {
      status: 'owned' as const,
      entity: updatedEntity ?? {
        ...entity,
        ownerUserId: ownership.ownerUserId,
        ownerTenantId: ownership.ownerTenantId,
      },
    }
  }

  return {
    status: 'owned' as const,
    entity,
  }
}

function resolveFallbackStage(entity: { entityProfile: Record<string, unknown> }) {
  const runtime = entity.entityProfile.runtime
  if (!isPlainObject(runtime)) {
    return undefined
  }

  const control = runtime.control
  if (!isPlainObject(control)) {
    return undefined
  }

  const playback = control.playback
  if (!isPlainObject(playback)) {
    return undefined
  }

  return typeof playback.activeStage === 'string' ? playback.activeStage : undefined
}

function buildSessionMetadata(args: {
  hydratedAt: string
  snapshotId?: string
  restoredFromEventLog: boolean
  eventLogWindowSize: number
}): OrchestratorSessionMetadata {
  return {
    hydratedAt: args.hydratedAt,
    source: args.snapshotId ? 'snapshot' : 'initialized',
    snapshotId: args.snapshotId,
    restoredFromEventLog: args.restoredFromEventLog,
    eventLogWindowSize: args.eventLogWindowSize,
  }
}

async function buildHydrateRuntimeResponse(args: {
  app: FastifyInstance
  entityId: string
  entityProfile?: EntityProfile
  fallbackStage?: string
}): Promise<HydrateRuntimeResponse> {
  const snapshotRepository = getOrchestratorSnapshotRepository(args.app)
  const eventLogRepository = getEventLogRepository(args.app)
  const latestSnapshot = await snapshotRepository.getLatestSnapshot(args.entityId)
  const recentEvents = await eventLogRepository.getRecentEvents(args.entityId, 1)
  const lastEvent = recentEvents[0]
  const restoredAt = lastEvent?.timestamp ?? latestSnapshot?.updatedAt ?? new Date().toISOString()
  const restoredState = restoreOrchestratorState({
    entityId: args.entityId,
    entityProfile: args.entityProfile,
    snapshot: latestSnapshot,
    fallbackStage: args.fallbackStage,
    now: restoredAt,
  })
  const baseFrame = buildMinimalOrchestratorFrame(restoredState, restoredAt)
  const authoritativeState = {
    ...restoredState,
    sessionId: baseFrame.sessionId,
  }
  const runtimeControl = buildOrchestratorRuntimeControl(authoritativeState)
  const frame = withAuthoritativeFrame({
    ...baseFrame,
    sessionId: authoritativeState.sessionId,
    renderSpec: buildRuntimeSceneProjection({
      entityProfile: args.entityProfile,
      runtimeControl,
      stage: authoritativeState.currentStage,
    }),
  })

  return {
    entityId: args.entityId,
    state: createRuntimeStatePayload(authoritativeState, runtimeControl),
    frame,
    session: buildSessionMetadata({
      hydratedAt: restoredAt,
      snapshotId: latestSnapshot?.id,
      restoredFromEventLog: Boolean(lastEvent),
      eventLogWindowSize: recentEvents.length,
    }),
    lastEvent,
    pendingUiEffects: [],
    pendingScheduledTasks: [],
  }
}

async function buildDashboardResponse(args: {
  app: FastifyInstance
  entityId: string
  entityProfile?: EntityProfile
  fallbackStage?: string
  metricsFilters?: DashboardFlowMindMetricsFilters
}): Promise<DashboardSparkStateResponse> {
  const runtime = await buildHydrateRuntimeResponse(args)
  const recentEvents = await getEventLogRepository(args.app).getRecentEvents(args.entityId, 6)
  const relationalTrace = await getRelationalTraceRepository(args.app).getEntityTraces(args.entityId, 6)

  return buildDashboardSparkStateResponse({
    runtime,
    recentEvents,
    relationalTrace,
    entityProfile: args.entityProfile,
    metricsFilters: args.metricsFilters,
  })
}

async function buildDetailedRelationalTrace(args: {
  app: FastifyInstance
  entityId: string
  entityProfile?: EntityProfile
  limit: number
}): Promise<RelationalTraceDetailedResponse> {
  const traces = await getRelationalTraceRepository(args.app).getEntityTraces(args.entityId, args.limit)

  return buildDetailedRelationalTraceResponse({
    entityId: args.entityId,
    traces,
    entityProfile: args.entityProfile,
  })
}

export async function registerOrchestratorRoutes(app: FastifyInstance) {
  app.get<{ Params: { entityId: string } }>('/orchestrator/:entityId/runtime', { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        },
      })
    }

    const ownedEntity = await getOwnedEntityForAuth(app, request.params.entityId, auth)
    if (ownedEntity.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    if (ownedEntity.status === 'forbidden') {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this entity.',
        },
      })
    }

    const runtime = await buildHydrateRuntimeResponse({
      app,
      entityId: request.params.entityId,
      entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
      fallbackStage: resolveFallbackStage(ownedEntity.entity),
    })

    return reply.status(200).send({
      status: 'ready',
      ...runtime,
    })
  })

  app.get<{ Params: { entityId: string }; Querystring: DashboardQuery }>('/orchestrator/:entityId/dashboard', { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        },
      })
    }

    const ownedEntity = await getOwnedEntityForAuth(app, request.params.entityId, auth)
    if (ownedEntity.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    if (ownedEntity.status === 'forbidden') {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this entity.',
        },
      })
    }

    const dashboard = await buildDashboardResponse({
      app,
      entityId: request.params.entityId,
      entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
      fallbackStage: resolveFallbackStage(ownedEntity.entity),
      metricsFilters: resolveDashboardMetricsFilters(request.query),
    })

    return reply.status(200).send({
      status: 'ready',
      ...dashboard,
    })
  })

  app.patch<{ Params: { entityId: string }; Body: PublicPartialControlBody }>('/orchestrator/:entityId/public-partial-control', { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        },
      })
    }

    if (!isValidPublicPartialControlBody(request.body)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PUBLIC_PARTIAL_CONTROL',
          message: 'rolloutPercentage and killSwitchEnabled are invalid.',
        },
      })
    }

    const ownedEntity = await getOwnedEntityForAuth(app, request.params.entityId, auth)
    if (ownedEntity.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    if (ownedEntity.status === 'forbidden') {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this entity.',
        },
      })
    }

    const controlUpdate = normalizePublicFlowMindPartialControlUpdate({
      rolloutPercentage: request.body.rolloutPercentage,
      killSwitchEnabled: request.body.killSwitchEnabled,
      automationMode: request.body.automationMode,
    })
    const entityProfile = ownedEntity.entity.entityProfile as EntityProfile
    const shadowAggregation = buildPublicFlowMindShadowAggregation(entityProfile)
    const readiness = buildPublicFlowMindShadowReadiness(shadowAggregation)
    const currentPartialAggregation = buildPublicFlowMindPartialAggregation({
      entityProfile,
      readiness,
      shadowAggregation,
    })

    if (
      controlUpdate.automationMode === 'auto-apply'
      && entityProfile.runtime?.flowMind?.publicPartial?.automationMode !== 'auto-apply'
      && currentPartialAggregation
      && !currentPartialAggregation.automationGuard.autoApplyAllowed
    ) {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'PUBLIC_PARTIAL_AUTO_APPLY_BLOCKED',
          message: currentPartialAggregation.automationGuard.guidance,
        },
      })
    }

    const now = new Date().toISOString()
    const previousRolloutPercentage = entityProfile.runtime?.flowMind?.publicPartial?.rolloutPercentage ?? 0
    const previousAutomationMode = entityProfile.runtime?.flowMind?.publicPartial?.automationMode ?? 'recommendation-only'
    const updatedEntityProfile: EntityProfile = {
      ...entityProfile,
      runtime: {
        ...entityProfile.runtime,
        flowMind: {
          ...entityProfile.runtime?.flowMind,
          publicPartial: {
            ...entityProfile.runtime?.flowMind?.publicPartial,
            rolloutPercentage: controlUpdate.rolloutPercentage,
            killSwitchEnabled: controlUpdate.killSwitchEnabled,
            automationMode: controlUpdate.automationMode,
            autoRolloutPolicy: {
              ...entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy,
              lastAdjustment: {
                action: 'manual-update',
                source: 'manual',
                fromRolloutPercentage: previousRolloutPercentage,
                toRolloutPercentage: controlUpdate.rolloutPercentage,
                reason: previousAutomationMode !== controlUpdate.automationMode
                  ? `manual-admin-control:${controlUpdate.automationMode}`
                  : 'manual-admin-control',
                changedAt: now,
              },
            },
            updatedAt: now,
          },
          updatedAt: now,
        },
      },
    }

    const updated = await getRepository(app).updateEntity({
      id: request.params.entityId,
      entityProfile: updatedEntityProfile,
    })

    if (!updated) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    await getEventLogRepository(app).logEvent({
      entityId: request.params.entityId,
      type: 'flowmind.public_partial.control.updated',
      timestamp: updated.updatedAt,
      payload: {
        rolloutPercentage: controlUpdate.rolloutPercentage,
        killSwitchEnabled: controlUpdate.killSwitchEnabled,
        automationMode: controlUpdate.automationMode,
      },
    })
    getPublicCacheService(app).deleteByPrefix(`entity-public:${request.params.entityId}`)
    getPublicCacheService(app).deleteByPrefix(`entity-public-presence:${request.params.entityId}`)

    return reply.status(200).send({
      status: 'ready',
      entityId: request.params.entityId,
      publicPartialControl: resolvePublicFlowMindPartialConfig({
        entityProfile: updated.entityProfile as EntityProfile,
        readiness: buildPublicFlowMindShadowReadiness(
          buildPublicFlowMindShadowAggregation(updated.entityProfile as EntityProfile),
        ),
      }),
    })
  })

  app.get<{ Params: { entityId: string }; Querystring: { limit?: string } }>('/orchestrator/:entityId/relational-trace', { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        },
      })
    }

    const ownedEntity = await getOwnedEntityForAuth(app, request.params.entityId, auth)
    if (ownedEntity.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    if (ownedEntity.status === 'forbidden') {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this entity.',
        },
      })
    }

    const parsedLimit = Number.parseInt(request.query.limit ?? '20', 10)
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20
    const trace = await buildDetailedRelationalTrace({
      app,
      entityId: request.params.entityId,
      entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
      limit,
    })

    return reply.status(200).send({
      status: 'ready',
      ...trace,
    })
  })

  app.post<{ Params: { entityId: string }; Body: CommandBody }>('/orchestrator/:entityId/command', { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        },
      })
    }

    if (!isValidCommandBody(request.body)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_COMMAND_PAYLOAD',
          message: 'A valid orchestrator command payload is required.',
        },
      })
    }

    const ownedEntity = await getOwnedEntityForAuth(app, request.params.entityId, auth)
    if (ownedEntity.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    if (ownedEntity.status === 'forbidden') {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this entity.',
        },
      })
    }

    const snapshotRepository = getOrchestratorSnapshotRepository(app)
    const eventLogRepository = getEventLogRepository(app)
    const requestedCommand = toCommandRequest(request.body)
    const duplicateEvent = await eventLogRepository.getEventByCommandId(request.params.entityId, requestedCommand.commandId)

    if (duplicateEvent) {
      const runtime = await buildHydrateRuntimeResponse({
        app,
        entityId: request.params.entityId,
        entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
        fallbackStage: resolveFallbackStage(ownedEntity.entity),
      })
      const duplicateResponse: CommandResponse = {
        entityId: request.params.entityId,
        command: requestedCommand,
        state: runtime.state,
        frame: runtime.frame,
        session: runtime.session,
        lastEvent: duplicateEvent,
        pendingUiEffects: runtime.pendingUiEffects,
        pendingScheduledTasks: runtime.pendingScheduledTasks,
      }

      return reply.status(200).send({
        status: 'ready',
        idempotent: true,
        ...duplicateResponse,
        event: duplicateEvent,
      })
    }

    const latestSnapshot = await snapshotRepository.getLatestSnapshot(request.params.entityId)
    const command = createOrchestratorCommand(requestedCommand)
    const state = restoreOrchestratorState({
      entityId: request.params.entityId,
      entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
      snapshot: latestSnapshot,
      fallbackStage: resolveFallbackStage(ownedEntity.entity),
      now: command.issuedAt,
    })
    let result

    try {
      result = applyOrchestratorCommand({
        state,
        command,
        previousSnapshot: latestSnapshot,
        now: command.issuedAt,
      })
    } catch (error) {
      if (error instanceof OrchestratorCommandPreconditionError) {
        return reply.status(409).send({
          status: 'failed',
          error: {
            code: 'COMMAND_PRECONDITION_FAILED',
            message: error.message,
          },
        })
      }

      throw error
    }
    const loggedEvent = await eventLogRepository.logEvent({
      id: result.event.id,
      entityId: result.event.entityId,
      type: result.event.type,
      payload: result.event.payload,
      timestamp: result.event.timestamp,
      causedByCommandId: result.event.causedByCommandId,
    })
    const flowMindEffect = await resolveFlowMindOperationalEffect({
      entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
      state: result.state,
      command: result.command,
      now: command.issuedAt,
      flowMindService: getFlowMindService(app),
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

      await getRelationalTraceRepository(app).logTrace({
        entityId: event.entityId,
        commandId: event.causedByCommandId,
        eventType: event.type,
        eventId: event.id,
        actorId: `${auth.userId}`,
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
          decisionCreatedAt: flowMindEffect.flowMind.trace.createdAt,
          decisionTraceId: `decision:${flowMindEffect.flowMind.lineage.rootCommandId}:${flowMindEffect.flowMind.trace.createdAt}`,
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
    await getRepository(app).updateEntity({
      id: ownedEntity.entity.id,
      entityProfile: persistedEntityProfile,
      updatedAt: snapshot.updatedAt,
    })
    const lineage = flowMindEffect.flowMind.lineage
      ? {
        ...flowMindEffect.flowMind.lineage,
        followUps: flowMindEffect.flowMind.lineage.followUps.map((followUp) => ({
          ...followUp,
          appliedEventIds: allEvents
            .filter((event) => event.causedByCommandId === followUp.commandId)
            .map((event) => event.id),
        })),
      }
      : undefined
    const response: CommandResponse = {
      entityId: request.params.entityId,
      command: {
        type: requestedCommand.type,
        name: requestedCommand.name,
        commandId: requestedCommand.commandId,
        issuedAt: requestedCommand.issuedAt,
        source: requestedCommand.source,
        payload: requestedCommand.payload,
      },
      state: createRuntimeStatePayload(finalState, finalFrame.runtimeControl),
      frame: finalFrame,
      session: buildSessionMetadata({
        hydratedAt: snapshot.updatedAt,
        snapshotId: snapshot.id,
        restoredFromEventLog: true,
        eventLogWindowSize: allEvents.length,
      }),
      lastEvent: allEvents[allEvents.length - 1],
      pendingUiEffects: [...result.uiEffects, ...(followUpPipeline?.uiEffects ?? []), ...flowMindEffect.uiEffects],
      pendingScheduledTasks: flowMindEffect.scheduledTasks,
      flowMind: flowMindEffect.flowMind,
      sovereignFlowMind: flowMindEffect.sovereignFlowMind?.summary,
      flowMindComparison: flowMindEffect.flowMindComparison,
      lineage,
    }

    return reply.status(200).send({
      status: 'ready',
      ...response,
      event: allEvents[allEvents.length - 1],
      snapshot,
    })
  })
}

function isDashboardMetricsEndpoint(value: unknown): value is DashboardFlowMindMetricsEndpoint {
  return value === 'all' || value === 'public-shadow' || value === 'public-partial'
}

function isDashboardMetricsPeriod(value: unknown): value is DashboardFlowMindMetricsPeriod {
  return value === '24h' || value === '7d' || value === '30d' || value === 'all'
}

function resolveDashboardMetricsFilters(query?: DashboardQuery): DashboardFlowMindMetricsFilters {
  return {
    endpoint: isDashboardMetricsEndpoint(query?.endpoint) ? query.endpoint : 'all',
    period: isDashboardMetricsPeriod(query?.period) ? query.period : '24h',
  }
}