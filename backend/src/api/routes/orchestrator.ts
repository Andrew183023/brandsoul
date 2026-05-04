import type { FastifyInstance } from 'fastify'

import type { RuntimeControl } from '../../brain/domain/orchestration/contracts/RuntimeControl.js'
import type { JsonObject } from '../../domain/entityProfile.js'
import type { EntityEventLogRepository } from '../../repositories/entityEventLogRepository.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { FlowMindExecutionLedgerRepository } from '../../repositories/flowMindExecutionLedgerRepository.js'
import type { OrchestratorSnapshotRepository } from '../../repositories/orchestratorSnapshotRepository.js'
import type { PortfolioLeadSignalRepository } from '../../repositories/portfolioLeadSignalRepository.js'
import type { PortfolioProposalRepository } from '../../repositories/portfolioProposalRepository.js'
import type { RelationalTraceRepository } from '../../repositories/relationalTraceRepository.js'
import type { FlowMindPort } from '../../services/flowMindPort.js'
import type { PublicCacheService } from '../../services/publicCacheService.js'
import type { FlowMindApprovalQueue, FlowMindApprovalRecord } from '../../orchestrator/approvalQueue.js'
import type { PortfolioOperationsService } from '../../orchestrator/portfolioOperationsService.js'
import type { PortfolioProposalLifecycleService } from '../../orchestrator/portfolioProposalLifecycleService.js'
import type { MultiEntityRegistry, MultiEntityLifecycleState, MultiEntityRiskLevel } from '../../orchestrator/multiEntityRegistry.js'
import type {
  ApprovalResolveResult,
  OrchestratorCommandExecuteResult,
  SovereignMutationCommandService,
} from '../../orchestrator/sovereignMutationCommandService.js'
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
  buildMinimalOrchestratorFrame,
  buildOrchestratorRuntimeControl,
  restoreOrchestratorState,
  type OrchestratorCommandName,
} from '../../orchestrator/orchestratorState.js'
import { getRequestAuth, requireAuth, type AuthContext } from '../middleware/requireAuth.js'
import { buildLegacyOwnerId, validateEntityOwnership } from '../middleware/requireEntityOwner.js'
import {
  buildPublicFlowMindPartialAggregation,
  normalizePublicFlowMindPartialControlUpdate,
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
    multiEntityRegistry: MultiEntityRegistry
    flowMindApprovalQueue: FlowMindApprovalQueue
    flowMindExecutionLedgerRepository: FlowMindExecutionLedgerRepository
    portfolioLeadSignalRepository: PortfolioLeadSignalRepository
    portfolioProposalRepository: PortfolioProposalRepository
    portfolioOperationsService: PortfolioOperationsService
    portfolioProposalLifecycleService: PortfolioProposalLifecycleService
    sovereignMutationCommandService: SovereignMutationCommandService
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
  lifecycleState?: string
  autonomyLevel?: string
  riskLevel?: string
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

function getMultiEntityRegistry(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.multiEntityRegistry
}

function getFlowMindApprovalQueue(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.flowMindApprovalQueue
}

function getFlowMindExecutionLedgerRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.flowMindExecutionLedgerRepository
}

function getPortfolioOperationsService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.portfolioOperationsService
}

function getPortfolioProposalLifecycleService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.portfolioProposalLifecycleService
}

function getSovereignMutationCommandService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.sovereignMutationCommandService
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

function hasGovernanceApprovalRole(auth: AuthContext) {
  return auth.roles.includes('admin') || auth.roles.includes('owner') || auth.roles.includes('operator')
}

function toApprovalItem(record: FlowMindApprovalRecord) {
  const proposal = isPlainObject(record.payload.proposal)
    ? record.payload.proposal
    : undefined
  const riskLevel = typeof proposal?.riskClassification === 'string'
    ? proposal.riskClassification
    : typeof record.payload.riskLevel === 'string'
      ? record.payload.riskLevel
      : 'unknown'
  const decidedByUserId = typeof record.resolvedBy === 'string' && /^user:\d+$/.test(record.resolvedBy)
    ? Number.parseInt(record.resolvedBy.slice('user:'.length), 10)
    : undefined

  return {
    id: record.approvalId,
    entityId: record.entityId,
    actionType: record.actionType,
    riskLevel,
    status: record.status,
    reason: record.rationale,
    payload: toJsonObject(record.payload),
    createdAt: record.createdAt,
    decidedAt: record.resolvedAt,
    decidedByUserId,
  }
}

async function requireApprovalGovernanceAccess(request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
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

  if (!hasGovernanceApprovalRole(auth) || auth.roles.includes('client')) {
    return reply.status(403).send({
      status: 'failed',
      error: {
        code: 'APPROVAL_ACCESS_DENIED',
        message: 'Admin, owner, or operator role is required.',
      },
    })
  }
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
  return toCommandRequestWithIdempotency(body, 'command-missing-idempotency', '1970-01-01T00:00:00.000Z')
}

function toCommandRequestWithIdempotency(body: CommandBody, idempotencyKey: string, fallbackIssuedAt: string): OrchestratorCommandRequest {
  return {
    type: 'command',
    name: body.name!,
    commandId: idempotencyKey,
    issuedAt: body.issuedAt ?? fallbackIssuedAt,
    source: 'user',
    payload: body.payload,
  }
}

function getIdempotencyKey(request: { headers: Record<string, unknown> }) {
  const headerValue = request.headers['idempotency-key']
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue

  return typeof rawValue === 'string' && rawValue.trim().length > 0
    ? rawValue.trim()
    : undefined
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
  app.get<{ Querystring: DashboardQuery }>('/admin/orchestrator/entities', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const query = request.query ?? {}
    const entities = await getMultiEntityRegistry(app).listEntities({
      lifecycleState: typeof query.lifecycleState === 'string' ? query.lifecycleState as MultiEntityLifecycleState : undefined,
      autonomyLevel: typeof query.autonomyLevel === 'string' ? query.autonomyLevel as never : undefined,
      riskLevel: typeof query.riskLevel === 'string' ? query.riskLevel as MultiEntityRiskLevel : undefined,
    })

    return {
      status: 'ready',
      entities,
    }
  })

  app.get('/admin/orchestrator/metrics', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    return {
      status: 'ready',
      metrics: await getMultiEntityRegistry(app).getMetrics(),
    }
  })

  app.get('/admin/orchestrator/incidents', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    return {
      status: 'ready',
      incidents: await getMultiEntityRegistry(app).listIncidents(),
    }
  })

  app.get('/admin/portfolio/lead-signals', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const snapshot = await getPortfolioOperationsService(app).getReadModel()

    return {
      status: 'ready',
      leadSignals: snapshot.leadSignals.map((signal) => ({
        id: signal.signalId,
        entityId: signal.entityId,
        market: signal.market,
        source: signal.source,
        intent: signal.intent,
        urgency: signal.urgency,
        estimatedValue: signal.estimatedValue,
        confidence: signal.confidence,
        recommendedAction: signal.recommendedAction,
        detectedAt: signal.detectedAt,
      })),
    }
  })

  app.get('/admin/portfolio/metrics', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const snapshot = await getPortfolioOperationsService(app).getReadModel()

    return {
      status: 'ready',
      metrics: snapshot.metrics,
    }
  })

  app.get('/admin/portfolio/lead-funnel', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const snapshot = await getPortfolioOperationsService(app).getReadModel()

    return {
      status: 'ready',
      leadFunnel: snapshot.leadFunnel,
    }
  })

  app.get('/admin/portfolio/proposals', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const snapshot = await getPortfolioOperationsService(app).getReadModel()

    return {
      status: 'ready',
      proposals: snapshot.proposals.map((proposal) => ({
        id: proposal.proposalId,
        entityId: proposal.entityId,
        market: proposal.market,
        type: proposal.proposalType,
        status: proposal.status,
        riskLevel: proposal.riskLevel,
        priorityScore: proposal.priorityScore,
        rationale: proposal.rationale,
        payload: proposal.payload,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
      })),
      safeMode: {
        executionBlocked: true,
        moneyMovementEnabled: false,
        campaignExecutionEnabled: false,
        pricingChangeEnabled: false,
      },
    }
  })

  app.post('/admin/portfolio/scan', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const now = new Date().toISOString()
    const result = await getSovereignMutationCommandService(app).submitCommand({
      type: 'portfolio.scan',
      commandId: `portfolio-scan:${now}`,
      now,
    })

    return {
      status: 'ready',
      result,
    }
  })

  app.post<{ Params: { id: string } }>('/admin/portfolio/proposals/:id/acknowledge', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const now = new Date().toISOString()
    const result = await getPortfolioProposalLifecycleService(app).acknowledge(request.params.id, now, `user:${auth.userId}`)

    if (!result.proposal) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'PORTFOLIO_PROPOSAL_NOT_FOUND',
          message: `Portfolio proposal "${request.params.id}" was not found.`,
        },
      })
    }

    if (result.blockedReason === 'invalid_transition') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'PORTFOLIO_PROPOSAL_INVALID_TRANSITION',
          message: `Proposal "${request.params.id}" cannot transition from ${result.proposal.status} to acknowledged.`,
        },
        proposal: result.proposal,
      })
    }

    return {
      status: 'ready',
      proposal: result.proposal,
      approval: result.approval,
    }
  })

  app.post<{ Params: { id: string } }>('/admin/portfolio/proposals/:id/approve', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const now = new Date().toISOString()
    const result = await getPortfolioProposalLifecycleService(app).approve(request.params.id, now, `user:${auth.userId}`)

    if (!result.proposal) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'PORTFOLIO_PROPOSAL_NOT_FOUND',
          message: `Portfolio proposal "${request.params.id}" was not found.`,
        },
      })
    }

    if (result.blockedReason === 'invalid_transition') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'PORTFOLIO_PROPOSAL_INVALID_TRANSITION',
          message: `Proposal "${request.params.id}" cannot transition from ${result.proposal.status} to approved.`,
        },
        proposal: result.proposal,
      })
    }

    return {
      status: 'ready',
      proposal: result.proposal,
      approval: result.approval,
    }
  })

  app.post<{ Params: { id: string } }>('/admin/portfolio/proposals/:id/reject', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const now = new Date().toISOString()
    const result = await getPortfolioProposalLifecycleService(app).reject(request.params.id, now, `user:${auth.userId}`)

    if (!result.proposal) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'PORTFOLIO_PROPOSAL_NOT_FOUND',
          message: `Portfolio proposal "${request.params.id}" was not found.`,
        },
      })
    }

    if (result.blockedReason === 'invalid_transition') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'PORTFOLIO_PROPOSAL_INVALID_TRANSITION',
          message: `Proposal "${request.params.id}" cannot transition from ${result.proposal.status} to rejected.`,
        },
        proposal: result.proposal,
      })
    }

    return {
      status: 'ready',
      proposal: result.proposal,
      approval: result.approval,
    }
  })

  app.get('/admin/approvals', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    return {
      status: 'ready',
      approvals: (await getFlowMindApprovalQueue(app).list()).map((record) => toApprovalItem(record)),
    }
  })

  app.get<{ Params: { id: string } }>('/admin/approvals/:id', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const record = await getFlowMindApprovalQueue(app).getById(request.params.id)
    if (!record) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'APPROVAL_NOT_FOUND',
          message: `Approval "${request.params.id}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      approval: toApprovalItem(record),
    }
  })

  app.post<{ Params: { id: string } }>('/admin/approvals/:id/approve', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const now = new Date().toISOString()
    const result = await getSovereignMutationCommandService(app).submitCommand({
      type: 'approval.resolve',
      commandId: `approval-resolve:${request.params.id}:approved:${now}`,
      approvalId: request.params.id,
      status: 'approved',
      actorId: `user:${auth.userId}`,
      now,
    }) as ApprovalResolveResult

    if (!result.approval) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'APPROVAL_NOT_FOUND',
          message: `Approval "${request.params.id}" was not found.`,
        },
      })
    }

    if (result.blockedReason === 'terminal_state_locked') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'APPROVAL_TERMINAL_STATE_LOCKED',
          message: 'Rejected or expired approvals cannot be approved later.',
        },
        approval: toApprovalItem(result.approval),
      })
    }

    return {
      status: 'ready',
      approval: toApprovalItem(result.approval),
    }
  })

  app.post<{ Params: { id: string } }>('/admin/approvals/:id/reject', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const auth = getRequestAuth(request)!
    const now = new Date().toISOString()
    const result = await getSovereignMutationCommandService(app).submitCommand({
      type: 'approval.resolve',
      commandId: `approval-resolve:${request.params.id}:rejected:${now}`,
      approvalId: request.params.id,
      status: 'rejected',
      actorId: `user:${auth.userId}`,
      now,
    }) as ApprovalResolveResult

    if (!result.approval) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'APPROVAL_NOT_FOUND',
          message: `Approval "${request.params.id}" was not found.`,
        },
      })
    }

    if (result.blockedReason === 'terminal_state_locked') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'APPROVAL_TERMINAL_STATE_LOCKED',
          message: 'Rejected or expired approvals cannot change terminal state.',
        },
        approval: toApprovalItem(result.approval),
      })
    }

    return {
      status: 'ready',
      approval: toApprovalItem(result.approval),
    }
  })

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

    return reply.status(409).send({
      status: 'failed',
      error: {
        code: 'FLOWMIND_DIRECT_STATE_MUTATION_BLOCKED',
        message: 'Direct runtime mutation is blocked. FlowMind state must change through the sovereign command executor.',
      },
      requestedControl: {
        rolloutPercentage: controlUpdate.rolloutPercentage,
        killSwitchEnabled: controlUpdate.killSwitchEnabled,
        automationMode: controlUpdate.automationMode,
      },
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

    const idempotencyKey = getIdempotencyKey(request)
    if (!idempotencyKey || !isSafeIdentifier(idempotencyKey)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key header is required.',
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

    const requestedCommand = toCommandRequestWithIdempotency(
      request.body,
      idempotencyKey,
      (ownedEntity.entity.entityProfile as EntityProfile).metadata.updatedAt
        ?? (ownedEntity.entity.entityProfile as EntityProfile).metadata.createdAt,
    )
    const ledgerRecord = await getFlowMindExecutionLedgerRepository(app).getByCommandId(requestedCommand.commandId)

    if (ledgerRecord?.status === 'committed') {
      const runtime = await buildHydrateRuntimeResponse({
        app,
        entityId: request.params.entityId,
        entityProfile: ownedEntity.entity.entityProfile as EntityProfile,
        fallbackStage: resolveFallbackStage(ownedEntity.entity),
      })
      const latestEvent = (await getEventLogRepository(app).getRecentEvents(request.params.entityId, 1))[0]
      const duplicateResponse: CommandResponse = {
        entityId: request.params.entityId,
        command: requestedCommand,
        state: runtime.state,
        frame: runtime.frame,
        session: runtime.session,
        lastEvent: latestEvent,
        pendingUiEffects: runtime.pendingUiEffects,
        pendingScheduledTasks: runtime.pendingScheduledTasks,
      }

      return reply.status(200).send({
        status: 'ready',
        idempotent: true,
        ...duplicateResponse,
        event: latestEvent,
      })
    }

    try {
      const commandResult = await getSovereignMutationCommandService(app).submitCommand({
        type: 'orchestrator.command.execute',
        entityId: ownedEntity.entity.id,
        commandId: requestedCommand.commandId,
        issuedAt: requestedCommand.issuedAt,
        requestCommand: requestedCommand,
        actorId: `${auth.userId}`,
        auth: {
          userId: auth.userId,
          tenantId: auth.tenantId,
          roles: auth.roles,
        },
        idempotencyKey,
      })
      const transactionResult = (commandResult as OrchestratorCommandExecuteResult).transaction
      if (!transactionResult) {
        throw new Error(`Missing transaction result for orchestrator command "${requestedCommand.commandId}".`)
      }
      const lineage = transactionResult.flowMindEffect.flowMind.lineage
      ? {
        ...transactionResult.flowMindEffect.flowMind.lineage,
        followUps: transactionResult.flowMindEffect.flowMind.lineage.followUps.map((followUp) => ({
          ...followUp,
          appliedEventIds: transactionResult.allEvents
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
      state: createRuntimeStatePayload(transactionResult.finalState, transactionResult.finalFrame.runtimeControl),
      frame: transactionResult.finalFrame,
      session: buildSessionMetadata({
        hydratedAt: transactionResult.snapshot.updatedAt,
        snapshotId: transactionResult.snapshot.id,
        restoredFromEventLog: true,
        eventLogWindowSize: transactionResult.allEvents.length,
      }),
      lastEvent: transactionResult.allEvents[transactionResult.allEvents.length - 1],
      pendingUiEffects: transactionResult.pendingUiEffects,
      pendingScheduledTasks: transactionResult.pendingScheduledTasks,
      flowMind: transactionResult.flowMindEffect.flowMind,
      sovereignFlowMind: transactionResult.flowMindEffect.sovereignFlowMind?.summary,
      flowMindComparison: transactionResult.flowMindEffect.flowMindComparison,
      lineage,
      }

      return reply.status(200).send({
      status: 'ready',
      ...response,
      event: transactionResult.allEvents[transactionResult.allEvents.length - 1],
      snapshot: transactionResult.snapshot,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'OrchestratorCommandPreconditionError') {
        return reply.status(409).send({
          status: 'failed',
          error: {
            code: 'COMMAND_PRECONDITION_FAILED',
            message: error.message,
          },
        })
      }

      if (typeof error === 'object' && error && 'statusCode' in error && 'code' in error && 'message' in error) {
        const failure = error as { statusCode: number, code: string, message: string }
        return reply.status(failure.statusCode).send({
          status: 'failed',
          error: {
            code: failure.code,
            message: failure.message,
          },
        })
      }

      throw error
    }
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
