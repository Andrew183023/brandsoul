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
import type { EconomicSnapshotStore } from '../../orchestrator/economicSnapshotStore.js'
import type { MarketSignalSnapshotStore } from '../../market-signals/runtime/marketSignalSnapshotStore.js'
import type { OpportunitySnapshotStore } from '../../market-signals/opportunities/runtime/opportunitySnapshotStore.js'
import type { OpportunityGovernanceSnapshotStore } from '../../market-signals/opportunities/governance/runtime/opportunityGovernanceSnapshotStore.js'
import type { SovereignExecutionSnapshotStore } from '../../execution/runtime/sovereignExecutionSnapshotStore.js'
import type { RevenueAttributionSnapshotStore } from '../../execution/revenue/runtime/revenueAttributionSnapshotStore.js'
import type { NegativeAttributionSnapshotStore } from '../../learning/negative-attribution/runtime/negativeAttributionSnapshotStore.js'
import type { NegativeAttributionRuntime } from '../../learning/negative-attribution/runtime/negativeAttributionRuntime.js'
import type { AdaptiveWeightSnapshotRuntime } from '../../learning/runtime/adaptiveWeightSnapshotRuntime.js'
import type { AdaptiveInfluenceGateRuntime } from '../../learning/runtime/adaptiveInfluenceGateRuntime.js'
import type { EconomicFeedbackRuntime } from '../../learning/runtime/economicFeedbackRuntime.js'
import type { NegativeOutcomeRepository } from '../../learning/persistence/negativeOutcomeRepository.js'
import type { NegativeAttributionRepository } from '../../learning/persistence/negativeAttributionRepository.js'
import type { TerminalFailureDetectionRuntime } from '../../learning/runtime/terminalFailureDetectionRuntime.js'
import type { ShadowProposalConfidenceRuntime } from '../../learning/shadow/shadowProposalConfidenceRuntime.js'
import type { LearningLedgerRepository } from '../../learning/persistence/learningLedgerRepository.js'
import type { LearningCheckpointRepository } from '../../learning/persistence/learningCheckpointRepository.js'
import type { AdaptiveEquilibriumEvidenceRepository } from '../../learning/persistence/adaptiveEquilibriumEvidenceRepository.js'
import type { AdaptiveTimelineDashboardService } from '../../learning/observability/adaptiveTimelineDashboardService.js'
import type { AdaptiveHeatmapService } from '../../learning/observability/adaptiveHeatmapService.js'
import type { LongitudinalStabilityScoreService } from '../../learning/observability/longitudinalStabilityScoreService.js'
import type { ReplayConsistencyGraphService } from '../../learning/observability/replayConsistencyGraphService.js'
import type { GovernanceEvidenceTimelineService } from '../../learning/governance/governanceEvidenceTimelineService.js'
import type { ReplayIdentityOperationalFreezeStatus } from '../../learning/governance/replayIdentityOperationalFreeze.js'
import type { EconomicMemoryRepository } from '../../persistence/economic/economicMemoryRepository.js'
import type { EconomicMemoryRebuildService } from '../../learning/rebuild/economicMemoryRebuildService.js'
import type { EconomicMemoryRebuildPlan, EconomicMemoryRebuildScope } from '../../learning/rebuild/EconomicMemoryRebuildPlan.js'
import type { FlowMindPort } from '../../services/flowMindPort.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import type { PublicCacheService } from '../../services/publicCacheService.js'
import {
  InstitutionalContinuityBlockedError,
  type InstitutionalContinuityGovernanceService,
} from '../../services/institutionalContinuityGovernanceService.js'
import type { RuntimeContinuityAttestationService } from '../../services/runtimeContinuityAttestationService.js'
import type { RuntimeGovernanceService } from '../../services/runtimeGovernanceService.js'
import type { InstitutionalRecoveryGovernanceService } from '../../services/institutionalRecoveryGovernanceService.js'
import type { AuthSovereignMutationService } from '../../auth/authSovereignMutationService.js'
import type { DistributedSovereigntyService } from '../../sovereignty/distributedSovereigntyService.js'
import { getInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { getSemanticMutationExecutor } from '../../sovereignty/semanticMutationExecutor.js'
import { getSovereignPersistenceCoordinationService } from '../../sovereignty/sovereignPersistenceCoordinationService.js'
import type { FlowMindApprovalQueue, FlowMindApprovalRecord } from '../../orchestrator/approvalQueue.js'
import type { PortfolioOperationsService } from '../../orchestrator/portfolioOperationsService.js'
import type { PortfolioProposalLifecycleService } from '../../orchestrator/portfolioProposalLifecycleService.js'
import type { MultiEntityRegistry, MultiEntityLifecycleState, MultiEntityRiskLevel } from '../../orchestrator/multiEntityRegistry.js'
import type {
  ApprovalResolveResult,
  OrchestratorCommandExecuteResult,
  SovereignMutationCommandService,
} from '../../orchestrator/sovereignMutationCommandService.js'
import { isRuntimeGovernanceBlockedError } from '../../orchestrator/sovereignMutationCommandService.js'
import { isInstitutionalContinuityBlockedError } from '../../services/institutionalContinuityGovernanceService.js'
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
import {
  assessAdaptiveEvidenceCompatibility,
  buildAdaptiveEvidenceCompatibilitySummary,
} from '../../learning/persistence/adaptiveEvidenceContract.js'

type BackendContext = {
  backendContext: {
    entityRepository: EntityRepository
    observability: ObservabilityService
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
    economicSnapshotStore: EconomicSnapshotStore
    marketSignalSnapshotStore: MarketSignalSnapshotStore
    opportunitySnapshotStore: OpportunitySnapshotStore
    opportunityGovernanceSnapshotStore: OpportunityGovernanceSnapshotStore
    sovereignExecutionSnapshotStore: SovereignExecutionSnapshotStore
    revenueAttributionSnapshotStore: RevenueAttributionSnapshotStore
    negativeAttributionSnapshotStore: NegativeAttributionSnapshotStore
    negativeOutcomeRepository: NegativeOutcomeRepository
    negativeAttributionRepository: NegativeAttributionRepository
    terminalFailureDetectionRuntime: TerminalFailureDetectionRuntime
    negativeAttributionRuntime: NegativeAttributionRuntime
    adaptiveWeightSnapshotRuntime: AdaptiveWeightSnapshotRuntime
    adaptiveInfluenceGateRuntime: AdaptiveInfluenceGateRuntime
    shadowProposalConfidenceRuntime: ShadowProposalConfidenceRuntime
    economicFeedbackRuntime: EconomicFeedbackRuntime
    economicMemoryRebuildService: EconomicMemoryRebuildService
    learningLedgerRepository: LearningLedgerRepository
    learningCheckpointRepository: LearningCheckpointRepository
    adaptiveEquilibriumEvidenceRepository: AdaptiveEquilibriumEvidenceRepository
    adaptiveTimelineDashboardService: AdaptiveTimelineDashboardService
    adaptiveHeatmapService: AdaptiveHeatmapService
    longitudinalStabilityScoreService: LongitudinalStabilityScoreService
    replayConsistencyGraphService: ReplayConsistencyGraphService
    governanceEvidenceTimelineService: GovernanceEvidenceTimelineService
    replayIdentityOperationalFreezeStatus: ReplayIdentityOperationalFreezeStatus
    economicMemoryRepository: EconomicMemoryRepository
    portfolioProposalLifecycleService: PortfolioProposalLifecycleService
    sovereignMutationCommandService: SovereignMutationCommandService
    institutionalContinuityGovernance: InstitutionalContinuityGovernanceService
    runtimeContinuityAttestationService: RuntimeContinuityAttestationService
    runtimeGovernance: RuntimeGovernanceService
    institutionalRecoveryGovernance: InstitutionalRecoveryGovernanceService
    distributedSovereigntyService: DistributedSovereigntyService
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

type AdaptiveLearningLedgerQuery = {
  page?: string
  pageSize?: string
}

type AdaptiveInfluenceEvidenceQuery = {
  page?: string
  pageSize?: string
}

type AdaptiveInfluenceTimelineQuery = {
  historyLimit?: string
  rollingHours?: string
}

type ReplayConsistencyGraphQuery = {
  historyLimit?: string
  rollingHours?: string
  bucketCount?: string
}

type AdaptiveHeatmapQuery = {
  historyLimit?: string
  hotspotLimit?: string
}

type LongitudinalStabilityScoreQuery = {
  historyLimit?: string
  rollingHours?: string
}

type AdaptiveDashboardEvidenceQuery = {
  page?: string
  pageSize?: string
  historyLimit?: string
  rollingHours?: string
  hotspotLimit?: string
  bucketCount?: string
}

type GovernanceEvidenceTimelineQuery = {
  page?: string
  pageSize?: string
  historyLimit?: string
}

type AdaptiveLearningRebuildBody = {
  scope?: unknown
  fromObservedAt?: unknown
  toObservedAt?: unknown
  reason?: unknown
  confirmCommit?: unknown
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

function getEconomicSnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.economicSnapshotStore
}

function getDistributedSovereignty(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.distributedSovereigntyService
}

function getMarketSignalSnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.marketSignalSnapshotStore
}

function getOpportunitySnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.opportunitySnapshotStore
}

function getOpportunityGovernanceSnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.opportunityGovernanceSnapshotStore
}

function getSovereignExecutionSnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.sovereignExecutionSnapshotStore
}

function getRevenueAttributionSnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.revenueAttributionSnapshotStore
}

function getNegativeAttributionSnapshotStore(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.negativeAttributionSnapshotStore
}

function getNegativeOutcomeRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.negativeOutcomeRepository
}

function getNegativeAttributionRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.negativeAttributionRepository
}

function getTerminalFailureDetectionRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.terminalFailureDetectionRuntime
}

function getNegativeAttributionRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.negativeAttributionRuntime
}

function getAdaptiveWeightSnapshotRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.adaptiveWeightSnapshotRuntime
}

function getAdaptiveInfluenceGateRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.adaptiveInfluenceGateRuntime
}

function getEconomicFeedbackRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.economicFeedbackRuntime
}

function getShadowProposalConfidenceRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.shadowProposalConfidenceRuntime
}

function getEconomicMemoryRebuildService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.economicMemoryRebuildService
}

function getLearningLedgerRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.learningLedgerRepository
}

function getLearningCheckpointRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.learningCheckpointRepository
}

function getAdaptiveEquilibriumEvidenceRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.adaptiveEquilibriumEvidenceRepository
}

function getAdaptiveTimelineDashboardService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.adaptiveTimelineDashboardService
}

function getAdaptiveHeatmapService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.adaptiveHeatmapService
}

function getLongitudinalStabilityScoreService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.longitudinalStabilityScoreService
}

function getReplayConsistencyGraphService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.replayConsistencyGraphService
}

function getObservability(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.observability
}

function getAuthSovereignMutationService(app: FastifyInstance) {
  return (app as FastifyInstance & {
    backendContext: {
      auth: {
        authSovereignMutationService: AuthSovereignMutationService
      }
    }
  }).backendContext.auth.authSovereignMutationService
}

function parseHistoryLimit(raw: string | undefined, fallback: string) {
  return Math.max(10, Math.min(10_000, Number.parseInt(raw ?? fallback, 10) || Number.parseInt(fallback, 10)))
}

function parseRollingHours(raw: string | undefined, fallback = '6,24,72') {
  return String(raw ?? fallback)
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 10)
}

function parsePage(raw: string | undefined, fallback = '1') {
  return Math.max(1, Number.parseInt(raw ?? fallback, 10) || Number.parseInt(fallback, 10))
}

function parsePageSize(raw: string | undefined, fallback = '50') {
  return Math.max(1, Math.min(500, Number.parseInt(raw ?? fallback, 10) || Number.parseInt(fallback, 10)))
}

function getGovernanceEvidenceTimelineService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.governanceEvidenceTimelineService
}

function getEconomicMemoryRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.economicMemoryRepository
}

function getPortfolioProposalLifecycleService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.portfolioProposalLifecycleService
}

function getSovereignMutationCommandService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.sovereignMutationCommandService
}

function getReplayIdentityOperationalFreezeStatus(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.replayIdentityOperationalFreezeStatus
}

function getRuntimeGovernanceService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.runtimeGovernance
}

function getInstitutionalRecoveryGovernanceService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.institutionalRecoveryGovernance
}

function getInstitutionalContinuityGovernanceService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.institutionalContinuityGovernance
}

function getRuntimeContinuityAttestationService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.runtimeContinuityAttestationService
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

function isValidOptionalIsoTimestamp(value: unknown) {
  return typeof value === 'undefined' || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function isValidRebuildScope(value: unknown): value is EconomicMemoryRebuildScope {
  return value === 'all' || value === 'signal' || value === 'category' || value === 'entity'
}

function parseAdaptiveLearningRebuildPlan(body: unknown, dryRun: boolean): { plan?: EconomicMemoryRebuildPlan; error?: string; confirmCommit?: boolean } {
  if (!isPlainObject(body)) {
    return {
      error: 'Request body must be a JSON object.',
    }
  }

  const input = body as AdaptiveLearningRebuildBody

  if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
    return {
      error: 'reason is required and must be a non-empty string.',
    }
  }

  if (typeof input.scope !== 'undefined' && !isValidRebuildScope(input.scope)) {
    return {
      error: 'scope must be one of: all, signal, category, entity.',
    }
  }

  if (!isValidOptionalIsoTimestamp(input.fromObservedAt) || !isValidOptionalIsoTimestamp(input.toObservedAt)) {
    return {
      error: 'fromObservedAt and toObservedAt must be valid ISO timestamps when provided.',
    }
  }

  const fromObservedAt = typeof input.fromObservedAt === 'string' ? new Date(input.fromObservedAt).toISOString() : undefined
  const toObservedAt = typeof input.toObservedAt === 'string' ? new Date(input.toObservedAt).toISOString() : undefined

  if (fromObservedAt && toObservedAt && fromObservedAt > toObservedAt) {
    return {
      error: 'fromObservedAt must be less than or equal to toObservedAt.',
    }
  }

  const confirmCommit = input.confirmCommit === true

  return {
    plan: {
      dryRun,
      scope: input.scope ?? 'all',
      fromObservedAt,
      toObservedAt,
      reason: input.reason.trim(),
    },
    confirmCommit,
  }
}

function deriveDurationMs(startedAt: string, completedAt: string) {
  const startedAtMs = Date.parse(startedAt)
  const completedAtMs = Date.parse(completedAt)

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs)) {
    return 0
  }

  return Math.max(0, completedAtMs - startedAtMs)
}

function safeParseDecisionJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(value, 0), 1)
}

function roundMetric(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function countByKey<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1
    return counts
  }, {})
}

function toLowerKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function extractKeywordFromReasoning(reasoning: string | null | undefined) {
  if (!reasoning) {
    return null
  }

  const keywordMatch = reasoning.match(/signal "([^"]+)"/i)
  return keywordMatch?.[1]?.trim().toLowerCase() ?? null
}

function toDivergenceLevel(value: number) {
  if (value >= 0.2) {
    return 'high'
  }

  if (value >= 0.1) {
    return 'medium'
  }

  return 'low'
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
    const updatedEntity = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
      authoritySource: 'backend/src/api/routes/orchestrator.ts#legacyBackfill',
      context: {
        mutationType: 'entity.ownership.backfill',
        mutationScope: 'entity',
        requestedCapability: 'orchestrator.command.execute',
        runtimeMode: getRuntimeGovernanceService(app).getStatus().runtimeMode,
        continuityMode: getInstitutionalContinuityGovernanceService(app).getStatus().continuityMode,
        replayVerificationState: 'verified',
        attestationIntegrity: 'verified',
        recoveryRequired: getInstitutionalContinuityGovernanceService(app).getStatus().recoveryRequired,
        actor: 'admin',
        traceId: `orchestrator-legacy-backfill:${entity.id}`,
      },
      work: () => getRepository(app).setEntityOwnership({
        id: entity.id,
        ownerId: ownership.ownerId ?? buildLegacyOwnerId(auth.userId, auth.tenantId),
        ownerUserId: ownership.ownerUserId,
        ownerTenantId: ownership.ownerTenantId,
      }),
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

function requireContinuityCapability(
  app: FastifyInstance,
  capability: 'governance.replay.generate' | 'public.read.low_risk',
  riskLevel: 'high' | 'low',
) {
  const continuityMetadata = getInstitutionalContinuityGovernanceService(app).evaluateCapability({
    capability,
    riskLevel,
  })

  if (!continuityMetadata.continuityDecision.allowed) {
    throw new InstitutionalContinuityBlockedError(continuityMetadata)
  }

  return continuityMetadata
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
    const snapshot = getEconomicSnapshotStore(app).getSnapshot()

    return {
      status: snapshot.status,
      metrics: snapshot.metrics,
      summary: snapshot.summary,
      incidents: snapshot.incidents,
      freshness: snapshot.freshness,
    }
  })

  app.get('/admin/market-signals', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const state = getMarketSignalSnapshotStore(app).getSnapshot()

    return {
      ...state.snapshot,
      freshness: state.freshness,
    }
  })

  app.get('/admin/opportunities', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const state = getOpportunitySnapshotStore(app).getSnapshot()

    return {
      ...state.snapshot,
      freshness: state.freshness,
    }
  })

  app.get('/admin/executions', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const state = getSovereignExecutionSnapshotStore(app).getSnapshot()
    const governanceFreshness = getOpportunityGovernanceSnapshotStore(app).getSnapshot().freshness

    return {
      ...state.snapshot,
      freshness: state.freshness,
      sources: {
        governanceFreshness,
      },
    }
  })

  app.get('/admin/revenue-attribution', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const state = getRevenueAttributionSnapshotStore(app).getSnapshot()

    return {
      ...state.snapshot,
      freshness: state.freshness,
    }
  })

  app.get('/admin/negative-learning/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const [
      negativeOutcomes,
      negativeAttributions,
      learningLedgerEvents,
    ] = await Promise.all([
      getNegativeOutcomeRepository(app).listNegativeOutcomes(2_147_483_647),
      getNegativeAttributionRepository(app).listNegativeAttributions(2_147_483_647),
      getLearningLedgerRepository(app).listLearningEvents(2_147_483_647),
    ])
    const terminalFailureRuntimeStatus = getTerminalFailureDetectionRuntime(app).getStatus()
    const negativeAttributionRuntimeStatus = getNegativeAttributionRuntime(app).getStatus()
    const negativeAttributionSnapshotState = getNegativeAttributionSnapshotStore(app).getSnapshot()
    const economicFeedbackStatus = getEconomicFeedbackRuntime(app).getStatus()
    const negativeLedgerEventCount = learningLedgerEvents.filter((event) => event.attributionId.startsWith('negative-outcome:')).length

    return {
      status: 'ready',
      terminalFailureRuntimeStatus,
      negativeAttributionRuntimeStatus,
      economicFeedbackRuntimeStatus: economicFeedbackStatus,
      negativeOutcomeCount: negativeOutcomes.length,
      negativeAttributionCount: negativeAttributions.length,
      negativeLedgerEventCount,
      negativeMemoryUpdateCount: null,
      countsByOutcomeType: countByKey(negativeOutcomes.map((item) => item.outcomeType)),
      countsBySeverity: countByKey(negativeAttributions.map((item) => item.severity)),
      countsByLineageQuality: countByKey(negativeAttributions.map((item) => item.lineageQuality)),
      detectorFreshness: {
        terminalFailure: {
          ready: terminalFailureRuntimeStatus.ready,
          warming: terminalFailureRuntimeStatus.warming,
          lastRunAt: terminalFailureRuntimeStatus.lastRunAt,
          refreshIntervalMs: terminalFailureRuntimeStatus.refreshIntervalMs,
        },
        negativeAttribution: {
          ready: negativeAttributionSnapshotState.freshness.ready,
          warming: negativeAttributionRuntimeStatus.warming,
          lastRunAt: negativeAttributionRuntimeStatus.lastRunAt,
          refreshIntervalMs: negativeAttributionRuntimeStatus.refreshIntervalMs,
          snapshotFreshness: negativeAttributionSnapshotState.freshness,
        },
      },
      lastRunAt: negativeAttributionRuntimeStatus.lastRunAt ?? terminalFailureRuntimeStatus.lastRunAt ?? null,
      lastError: negativeAttributionRuntimeStatus.lastError ?? terminalFailureRuntimeStatus.lastError ?? null,
      lastProcessedNegativeOutcomeWatermark: economicFeedbackStatus.lastProcessedNegativeOutcomeWatermark ?? null,
      lastDurableNegativeOutcomeWatermark: economicFeedbackStatus.lastDurableNegativeOutcomeWatermark ?? null,
      negativeReplayLag: Number.isFinite(economicFeedbackStatus.negativeReplayLag)
        ? economicFeedbackStatus.negativeReplayLag
        : 'not_available',
      feedbackRuntimeError: economicFeedbackStatus.lastError ?? null,
      feedbackRuntimeLastRunAt: economicFeedbackStatus.lastRefreshCompletedAt ?? null,
      checkpoint: {
        runtimeName: economicFeedbackStatus.runtimeName,
        lastProcessedNegativeOutcomeWatermark: economicFeedbackStatus.lastProcessedNegativeOutcomeWatermark ?? null,
        lastDurableNegativeOutcomeWatermark: economicFeedbackStatus.lastDurableNegativeOutcomeWatermark ?? null,
        negativeReplayLag: Number.isFinite(economicFeedbackStatus.negativeReplayLag)
          ? economicFeedbackStatus.negativeReplayLag
          : 'not_available',
      },
      operationalMetadata: {
        advisoryOnly: true,
        runtimeMutationEnabled: false,
        governanceMutationEnabled: false,
        snapshotSafe: true,
      },
    }
  })

  app.get('/admin/shadow/comparisons', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const shadowState = getShadowProposalConfidenceRuntime(app).getSnapshot()
    const opportunityState = getOpportunitySnapshotStore(app).getSnapshot()
    const generatedAt = shadowState.snapshot.generatedAt

    const opportunityBySignalId = new Map(
      opportunityState.snapshot.opportunities.map((opportunity) => [opportunity.sourceSignalId, opportunity] as const),
    )
    const suggestionByKeywordAndEntity = new Map<string, { entityName: string | null }>()

    for (const suggestion of opportunityState.snapshot.suggestions) {
      const keyword = extractKeywordFromReasoning(suggestion.reasoning)
      const entityId = toLowerKey(suggestion.entityId)
      if (!keyword || entityId.length === 0) {
        continue
      }

      const key = `${keyword}::${entityId}`
      if (!suggestionByKeywordAndEntity.has(key)) {
        suggestionByKeywordAndEntity.set(key, {
          entityName: suggestion.entityName,
        })
      }
    }

    const comparisons = shadowState.snapshot.comparisons.map((detail) => {
      const liveDecision = safeParseDecisionJson(detail.comparison.liveDecision)
      const shadowDecision = safeParseDecisionJson(detail.comparison.shadowDecision)

      const entityId = typeof liveDecision?.entityId === 'string' ? liveDecision.entityId : null
      const liveConfidence = clampScore(typeof liveDecision?.proposalConfidence === 'number'
        ? liveDecision.proposalConfidence
        : 0)
      const adaptiveConfidence = clampScore(typeof shadowDecision?.shadowProposalConfidence === 'number'
        ? shadowDecision.shadowProposalConfidence
        : 0)
      const confidenceDelta = roundMetric(adaptiveConfidence - liveConfidence)

      const adaptiveMultiplier = typeof shadowDecision?.adaptiveMultiplier === 'number'
        ? shadowDecision.adaptiveMultiplier
        : detail.contribution.combinedAdaptiveMultiplier

      const opportunity = opportunityBySignalId.get(detail.comparison.marketSignalId)
      const keyword = opportunity?.keyword ?? null
      const category = opportunity?.category ?? null
      const liveScore = clampScore((opportunity?.economicRelevance ?? 0) / 100)
      const adaptiveScore = clampScore(liveScore * adaptiveMultiplier)
      const scoreDelta = roundMetric(adaptiveScore - liveScore)

      const entityName = (() => {
        if (!entityId || !keyword) {
          return null
        }

        const key = `${toLowerKey(keyword)}::${toLowerKey(entityId)}`
        return suggestionByKeywordAndEntity.get(key)?.entityName ?? null
      })()

      return {
        comparisonId: detail.comparison.comparisonId,
        entityId,
        entityName,
        keyword,
        category,
        liveScore,
        adaptiveScore,
        scoreDelta,
        liveConfidence,
        adaptiveConfidence,
        confidenceDelta,
        projectedRankingChange: 0,
        projectedRevenueImpact: detail.comparison.estimatedEconomicDelta,
        divergenceLevel: toDivergenceLevel(Math.max(Math.abs(scoreDelta), Math.abs(confidenceDelta))),
        advisoryOnly: true,
        createdAt: detail.comparison.generatedAt,
      }
    })

    const liveOrder = [...comparisons]
      .sort((left, right) => {
        if (left.liveScore !== right.liveScore) {
          return right.liveScore - left.liveScore
        }

        return left.comparisonId.localeCompare(right.comparisonId)
      })
      .map((item, index) => ({ comparisonId: item.comparisonId, rank: index + 1 }))
    const adaptiveOrder = [...comparisons]
      .sort((left, right) => {
        if (left.adaptiveScore !== right.adaptiveScore) {
          return right.adaptiveScore - left.adaptiveScore
        }

        return left.comparisonId.localeCompare(right.comparisonId)
      })
      .map((item, index) => ({ comparisonId: item.comparisonId, rank: index + 1 }))
    const liveRankByComparisonId = new Map(liveOrder.map((item) => [item.comparisonId, item.rank] as const))
    const adaptiveRankByComparisonId = new Map(adaptiveOrder.map((item) => [item.comparisonId, item.rank] as const))

    const enrichedComparisons = comparisons
      .map((item) => {
        const liveRank = liveRankByComparisonId.get(item.comparisonId) ?? 0
        const adaptiveRank = adaptiveRankByComparisonId.get(item.comparisonId) ?? 0

        return {
          ...item,
          projectedRankingChange: liveRank - adaptiveRank,
        }
      })
      .sort((left, right) => {
        const byCreatedAt = left.createdAt.localeCompare(right.createdAt)
        if (byCreatedAt !== 0) {
          return byCreatedAt
        }

        return left.comparisonId.localeCompare(right.comparisonId)
      })

    const comparisonCount = enrichedComparisons.length
    const averageScoreDelta = comparisonCount > 0
      ? roundMetric(
        enrichedComparisons.reduce((sum, item) => sum + Math.abs(item.scoreDelta), 0) / comparisonCount,
      )
      : 0
    const averageConfidenceDelta = comparisonCount > 0
      ? roundMetric(
        enrichedComparisons.reduce((sum, item) => sum + Math.abs(item.confidenceDelta), 0) / comparisonCount,
      )
      : 0
    const highDivergenceCount = shadowState.snapshot.metrics.highDivergenceCount

    return {
      status: shadowState.snapshot.status,
      generatedAt,
      comparisons: enrichedComparisons,
      metrics: {
        comparisonCount,
        projectionGenerationCount: shadowState.snapshot.metrics.projectionGenerationCount,
        averageScoreDelta,
        averageConfidenceDelta,
        highDivergenceCount,
        divergenceDistribution: shadowState.snapshot.metrics.divergenceDistribution,
        refreshDurationMs: shadowState.snapshot.metrics.refreshDurationMs,
        replayConsistencyStatus: shadowState.snapshot.metrics.replayConsistencyStatus,
      },
    }
  })

  app.get('/admin/adaptive-influence/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const runtimeStatus = getAdaptiveInfluenceGateRuntime(app).getStatus()
    const snapshot = getAdaptiveInfluenceGateRuntime(app).getSnapshot()

    return {
      status: snapshot.status,
      enabled: runtimeStatus.config.enabled,
      mode: runtimeStatus.config.mode,
      rolloutPercentage: runtimeStatus.config.rolloutPercentage,
      killSwitchEnabled: runtimeStatus.config.killSwitchEnabled,
      boundedMin: runtimeStatus.config.boundedMin,
      boundedMax: runtimeStatus.config.boundedMax,
      minimumSampleRequirement: runtimeStatus.config.minimumSampleRequirement,
      allowedScopes: runtimeStatus.config.allowedScopes,
      runtimeHealth: {
        runtimeName: runtimeStatus.runtimeName,
        started: runtimeStatus.started,
        ready: runtimeStatus.ready,
        warming: runtimeStatus.warming,
        error: runtimeStatus.error,
        advisoryOnly: runtimeStatus.advisoryOnly,
        mutatesLiveRanking: runtimeStatus.mutatesLiveRanking,
        mutatesGovernance: runtimeStatus.mutatesGovernance,
        mutatesExecution: runtimeStatus.mutatesExecution,
        refreshIntervalMs: runtimeStatus.refreshIntervalMs,
        candidateCount: runtimeStatus.candidateCount,
        influenceAppliedCount: runtimeStatus.influenceAppliedCount,
        rolloutEligibleCount: runtimeStatus.rolloutEligibleCount,
        blockedCount: runtimeStatus.blockedCount,
        divergenceCount: runtimeStatus.divergenceCount,
        rankShiftCount: runtimeStatus.rankShiftCount,
        topRankChanged: runtimeStatus.topRankChanged,
      },
      lastRefreshAt: runtimeStatus.lastRunAt,
      lastError: runtimeStatus.lastError ?? snapshot.metadata.lastError,
    }
  })

  app.get('/admin/adaptive-influence/divergence', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const snapshot = getAdaptiveInfluenceGateRuntime(app).getSnapshot()
    const lowConfidenceProjectionCount = snapshot.influences.filter((projection) => (
      projection.evidence.signal?.confidenceLevel === 'low'
      || projection.evidence.category?.confidenceLevel === 'low'
      || projection.evidence.entity?.confidenceLevel === 'low'
    )).length
    const suppressedInfluenceCount = snapshot.influences.filter((projection) => !projection.influenceApplied).length
    const audit = snapshot.metadata.audit

    return {
      status: snapshot.status,
      generatedAt: snapshot.generatedAt,
      averageRankDelta: snapshot.metadata.averageRankDelta,
      largestRankDelta: snapshot.metadata.maxAbsRankDelta,
      divergenceCount: snapshot.metadata.divergenceCount,
      lowConfidenceProjectionCount,
      suppressedInfluenceCount,
      divergenceMetrics: {
        rankDrift: audit.rankDrift,
        categoryDominance: audit.categoryDominance,
        entityDominance: audit.entityDominance,
        repeatedTopRankPersistence: audit.repeatedTopRankPersistence,
        suppressedProjectionRatios: audit.suppression,
        lowSampleInstability: audit.lowSampleInstability,
        lowConfidenceAmplification: audit.lowConfidenceAmplification,
        projectionVolatility: audit.projectionVolatility,
      },
      driftDetectionArchitecture: {
        analysisOnly: true,
        automaticCorrection: false,
        autoDisable: false,
        thresholds: audit.driftDetection.thresholds,
      },
      driftEventModel: {
        warningSummary: audit.driftDetection.warningSummary,
        warnings: audit.driftDetection.warnings,
      },
      reinforcementLoopDetectionArchitecture: {
        analysisOnly: true,
        automaticSuppression: false,
        automaticRebalance: false,
        automaticCorrection: false,
        thresholds: audit.reinforcementLoopDetection.thresholds,
      },
      reinforcementLoopWarningModel: {
        warningSummary: audit.reinforcementLoopDetection.warningSummary,
        loopMetrics: audit.reinforcementLoopDetection.loopMetrics,
        persistence: audit.reinforcementLoopDetection.persistence,
        warnings: audit.reinforcementLoopDetection.warnings,
      },
      reinforcementLoopReplaySafeDiagnostics: audit.reinforcementLoopDetection.replaySafeDiagnostics,
      historicalReplayEngine: audit.historicalReplaySimulation.engine,
      replayTimelineModel: audit.historicalReplaySimulation.replayTimeline,
      historicalDriftAnalysis: audit.historicalReplaySimulation.historicalDriftAnalysis,
      projectionStabilityAnalysis: audit.historicalReplaySimulation.projectionStabilityAnalysis,
      replayDegradationMetrics: audit.historicalReplaySimulation.replayDegradationMetrics,
      replayStressSimulationEngine: audit.historicalReplaySimulation.stressSimulation.engine,
      replayStressDegradationMetrics: audit.historicalReplaySimulation.stressSimulation.degradationMetrics,
      replayCollapseDetection: audit.historicalReplaySimulation.stressSimulation.replayCollapseDetection,
      replayInstabilityThresholds: audit.historicalReplaySimulation.stressSimulation.replayInstabilityThresholds,
      replayRiskDiagnostics: audit.historicalReplaySimulation.stressSimulation.replayRiskDiagnostics,
      adaptiveInstabilityRootCauseAnalysis: {
        rootCauseGraph: audit.historicalReplaySimulation.rootCauseAnalysis.rootCauseGraph,
        instabilityContributionModel: audit.historicalReplaySimulation.rootCauseAnalysis.instabilityContributionModel,
        dominantInstabilityFactors: audit.historicalReplaySimulation.rootCauseAnalysis.dominantInstabilityFactors,
        replayCollapseContributors: audit.historicalReplaySimulation.rootCauseAnalysis.replayCollapseContributors,
        saturationContributors: audit.historicalReplaySimulation.rootCauseAnalysis.saturationContributors,
        reinforcementEscalationContributors: audit.historicalReplaySimulation.rootCauseAnalysis.reinforcementEscalationContributors,
        stabilityBlockers: audit.historicalReplaySimulation.rootCauseAnalysis.stabilityBlockers,
        governanceRiskSummary: audit.historicalReplaySimulation.rootCauseAnalysis.governanceRiskSummary,
      },
      adaptiveDecayHysteresisResearch: {
        decaySimulationModel: audit.historicalReplaySimulation.decayHysteresisResearch.decaySimulationModel,
        hysteresisSimulationModel: audit.historicalReplaySimulation.decayHysteresisResearch.hysteresisSimulationModel,
        replayImpactAnalysis: audit.historicalReplaySimulation.decayHysteresisResearch.replayImpactAnalysis,
        saturationImpactAnalysis: audit.historicalReplaySimulation.decayHysteresisResearch.saturationImpactAnalysis,
        oscillationImpactAnalysis: audit.historicalReplaySimulation.decayHysteresisResearch.oscillationImpactAnalysis,
        equilibriumAnalysis: audit.historicalReplaySimulation.decayHysteresisResearch.equilibriumAnalysis,
        governanceRiskAssessment: audit.historicalReplaySimulation.decayHysteresisResearch.governanceRiskAssessment,
        rolloutRecommendation: audit.historicalReplaySimulation.decayHysteresisResearch.rolloutRecommendation,
      },
      adaptiveEquilibriumLongitudinalStudy: {
        longitudinalModel: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.longitudinalModel,
        stabilityConvergenceMetrics: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.stabilityConvergenceMetrics,
        saturationEquilibriumMetrics: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.saturationEquilibriumMetrics,
        reinforcementPersistenceMetrics: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.reinforcementPersistenceMetrics,
        entropyEvolutionAnalysis: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.entropyEvolutionAnalysis,
        rankingDiversityAnalysis: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.rankingDiversityAnalysis,
        replayEquilibriumAnalysis: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.replayEquilibriumAnalysis,
        governanceRecommendation: audit.historicalReplaySimulation.equilibriumLongitudinalStudy.governanceRecommendation,
      },
      historicalReplayDiagnostics: {
        divergenceEvolution: audit.historicalReplaySimulation.divergenceEvolution,
        saturationEvolution: audit.historicalReplaySimulation.saturationEvolution,
        oscillationPersistence: audit.historicalReplaySimulation.oscillationPersistence,
        reinforcementLoops: audit.historicalReplaySimulation.reinforcementLoops,
      },
      longDurationValidationArchitecture: audit.longDurationValidation.architecture,
      historicalTrendModel: {
        snapshotHistory: audit.longDurationValidation.snapshotHistory,
        trendAggregation: audit.longDurationValidation.trendAggregation,
        historicalDivergenceSummary: audit.longDurationValidation.historicalDivergenceSummary,
      },
      replayTrendAggregation: audit.longDurationValidation.replayConsistencyHistory,
      driftPersistenceMetrics: {
        driftTrend: audit.longDurationValidation.trendAggregation.driftPersistence,
        driftWarningConsecutive: audit.longDurationValidation.persistenceCounters.driftWarningConsecutive,
        driftCriticalConsecutive: audit.longDurationValidation.persistenceCounters.driftCriticalConsecutive,
      },
      saturationPersistenceMetrics: {
        saturationTrend: audit.longDurationValidation.trendAggregation.multiplierSaturationTrends,
        saturationWarningConsecutive: audit.longDurationValidation.persistenceCounters.saturationWarningConsecutive,
        saturationCriticalConsecutive: audit.longDurationValidation.persistenceCounters.saturationCriticalConsecutive,
      },
      driftDiagnostics: audit.rankDrift,
      saturationDiagnostics: audit.multiplierSaturation,
      oscillationDiagnostics: audit.oscillation,
      stabilityScoring: {
        stabilityScore: audit.stabilityScore,
      },
      replayConsistencyMetrics: audit.replayConsistency,
    }
  })

  app.get('/admin/adaptive-influence/projected-ranking', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const snapshot = getAdaptiveInfluenceGateRuntime(app).getSnapshot()

    return {
      status: snapshot.status,
      generatedAt: snapshot.generatedAt,
      projections: snapshot.influences.map((projection) => ({
        opportunityId: projection.opportunityId,
        marketSignalId: projection.marketSignalId,
        entityId: projection.entityId,
        baseRank: projection.baseRank,
        projectedRank: projection.projectedRank,
        baseScore: projection.baseScore,
        projectedAdaptiveScore: projection.finalProjectedScore,
        adaptiveMultiplier: projection.adaptiveMultiplier,
        influenceApplied: projection.influenceApplied,
        rolloutEligible: projection.rolloutEligible,
        blockedReason: projection.blockedReason,
        rolloutBucket: projection.rolloutBucket,
        sampleThresholdSatisfied: projection.sampleThresholdSatisfied,
        weightSources: projection.weightSources,
        memoryIds: projection.memoryIds,
        projectionMode: projection.projectionMode,
        evidenceScopes: projection.evidenceScopes,
        sampleCounts: projection.sampleCounts,
        replayFingerprint: projection.replayFingerprint,
      })),
    }
  })

  app.get<{ Querystring: AdaptiveInfluenceEvidenceQuery }>('/admin/adaptive-influence/evidence', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1)
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(request.query.pageSize ?? '50', 10) || 50))
    const offset = (page - 1) * pageSize
    const repository = getAdaptiveEquilibriumEvidenceRepository(app)
    const [total, records] = await Promise.all([
      repository.countEvidence(),
      repository.listEvidencePaginated({ limit: pageSize, offset }),
    ])
    const compatibility = buildAdaptiveEvidenceCompatibilitySummary(records)

    return {
      status: 'ready',
      compatibility,
      records: records.map((record) => ({
        ...record,
        compatibility: assessAdaptiveEvidenceCompatibility(record),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      operationalMetadata: {
        appendOnly: true,
        replaySafe: true,
        deterministicEvidenceId: true,
        advisoryOnly: true,
        noLiveMutation: true,
      },
    }
  })

  app.get<{ Querystring: AdaptiveInfluenceTimelineQuery }>('/admin/adaptive-influence/timeline', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const rollingHours = String(request.query.rollingHours ?? '6,24,72')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 10)
    const timeline = await getAdaptiveTimelineDashboardService(app).buildDashboard({
      historyLimit,
      rollingHours: rollingHours.length > 0 ? rollingHours : undefined,
    })

    return {
      status: 'ready',
      generatedAt: timeline.generatedAt,
      aggregationArchitecture: timeline.aggregationArchitecture,
      timeline: {
        hourlyWindows: timeline.hourlyWindows,
        dailyWindows: timeline.dailyWindows,
        rollingWindows: timeline.rollingWindows,
        historicalSnapshots: timeline.historicalSnapshots,
        longitudinalTrends: timeline.longitudinalTrends,
      },
      compatibility: timeline.compatibility,
      epistemicConfidence: timeline.epistemicConfidence,
      replaySafePayload: {
        payloadFingerprint: timeline.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
      },
      operationalMetadata: {
        observabilityOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveExecution: true,
        noGovernanceMutation: true,
      },
    }
  })

  app.get<{ Querystring: AdaptiveHeatmapQuery }>('/admin/adaptive-influence/heatmaps', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const startedAt = Date.now()
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const hotspotLimit = Math.max(1, Math.min(100, Number.parseInt(request.query.hotspotLimit ?? '24', 10) || 24))
    const heatmaps = await getAdaptiveHeatmapService(app).buildHeatmaps({
      historyLimit,
      hotspotLimit,
    })

    const durationMs = Date.now() - startedAt
    getObservability(app).incrementMetric('adaptive_heatmap_requests_total')
    getObservability(app).recordTiming('adaptive_heatmap_build_duration_ms', durationMs)

    return {
      status: 'ready',
      generatedAt: heatmaps.generatedAt,
      aggregationArchitecture: heatmaps.aggregationArchitecture,
      concentrationScoring: heatmaps.concentrationScoring,
      compatibility: heatmaps.compatibility,
      heatmaps: heatmaps.heatmaps,
      hotspots: heatmaps.hotspots,
      observability: heatmaps.observability,
      replaySafePayload: {
        payloadFingerprint: heatmaps.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
        replaySafe: true,
      },
      operationalMetadata: {
        observabilityOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveExecution: true,
        noGovernanceMutation: true,
      },
    }
  })

  app.get<{ Querystring: LongitudinalStabilityScoreQuery }>('/admin/adaptive-influence/stability-score', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const startedAt = Date.now()
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const rollingHours = String(request.query.rollingHours ?? '6,24,72')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 10)
    const stabilityScore = await getLongitudinalStabilityScoreService(app).buildStabilityScore({
      historyLimit,
      rollingHours: rollingHours.length > 0 ? rollingHours : undefined,
    })

    const durationMs = Date.now() - startedAt
    getObservability(app).incrementMetric('adaptive_longitudinal_stability_requests_total')
    getObservability(app).recordTiming('adaptive_longitudinal_stability_build_duration_ms', durationMs)

    return {
      status: 'ready',
      generatedAt: stabilityScore.generatedAt,
      aggregationArchitecture: stabilityScore.aggregationArchitecture,
      stabilityScoringArchitecture: stabilityScore.stabilityScoringArchitecture,
      compatibility: stabilityScore.compatibility,
      currentScore: stabilityScore.currentScore,
      historicalScores: stabilityScore.historicalScores,
      rollingAverages: stabilityScore.rollingAverages,
      longitudinalEvolution: stabilityScore.longitudinalEvolution,
      replaySafePayload: {
        ...stabilityScore.replaySafePayload,
        payloadFingerprint: stabilityScore.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
        replaySafe: true,
      },
      operationalMetadata: {
        observabilityOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveExecution: true,
        noGovernanceMutation: true,
      },
    }
  })

  app.get<{ Querystring: ReplayConsistencyGraphQuery }>('/admin/adaptive-influence/replay-graphs', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    requireContinuityCapability(app, 'governance.replay.generate', 'high')
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const rollingHours = String(request.query.rollingHours ?? '6,24,72')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 10)
    const replayConsistencyBucketCount = Math.max(2, Math.min(20, Number.parseInt(request.query.bucketCount ?? '5', 10) || 5))

    const replayGraphs = await getReplayConsistencyGraphService(app).buildReplayGraphs({
      historyLimit,
      rollingHours: rollingHours.length > 0 ? rollingHours : undefined,
      replayConsistencyBucketCount,
    })

    return {
      status: 'ready',
      generatedAt: replayGraphs.generatedAt,
      aggregationArchitecture: replayGraphs.aggregationArchitecture,
      compatibility: replayGraphs.compatibility,
      epistemicConfidence: replayGraphs.epistemicConfidence,
      replayGraphs: replayGraphs.graph,
      replaySafePayload: {
        payloadFingerprint: replayGraphs.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
        replaySafe: true,
      },
      operationalMetadata: {
        observabilityOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveExecution: true,
        noGovernanceMutation: true,
      },
    }
  })

  app.get<{ Querystring: GovernanceEvidenceTimelineQuery }>('/admin/adaptive-influence/governance-timeline', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    requireContinuityCapability(app, 'governance.replay.generate', 'high')
    const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1)
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(request.query.pageSize ?? '50', 10) || 50))
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '1000', 10) || 1000))

    const history = await getGovernanceEvidenceTimelineService(app).buildHistory({
      page,
      pageSize,
      historyLimit,
    })

    return {
      status: 'ready',
      generatedAt: history.generatedAt,
      compatibility: history.compatibility,
      epistemicConfidence: history.epistemicConfidence,
      reducers: history.reducers,
      events: history.events,
      pagination: history.pagination,
      replaySafePayload: history.replaySafePayload,
      operationalMetadata: {
        observabilityOnly: true,
        noMutation: true,
        noRollout: true,
        noAdaptiveExecution: true,
        noGovernanceMutation: true,
        appendOnly: true,
      },
    }
  })

  app.get('/admin/adaptive-governance/replay-identity-freeze', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const freezeStatus = getReplayIdentityOperationalFreezeStatus(app)

    return {
      freezeStatus: freezeStatus.freezeStatus,
      currentManifestHash: freezeStatus.currentManifestHash,
      expectedManifestHash: freezeStatus.expectedManifestHash,
      identityFields: freezeStatus.identityFields,
      operationalCouplingFields: freezeStatus.operationalCouplingFields,
      prohibitedFields: freezeStatus.prohibitedFields,
      driftDetected: freezeStatus.driftDetected,
      driftWarnings: freezeStatus.driftWarnings,
      observationModeLocked: freezeStatus.observationModeLocked,
    }
  })

  app.get('/admin/runtime-governance/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = getRuntimeGovernanceService(app).getStatus()

    return {
      status: 'ready',
      runtimeMode: status.runtimeMode,
      degradedReason: status.degradedReason,
      blockedCapabilities: status.blockedCapabilities,
      hardReadinessFailure: status.hardReadinessFailure ?? null,
      subsystemMatrix: status.subsystemMatrix,
      governanceDecision: {
        capability: 'admin.runtime-governance.status',
        allowed: true,
        reason: 'status-only',
        riskLevel: 'low',
        evaluatedAt: new Date().toISOString(),
      },
      lastUpdatedAt: status.lastUpdatedAt,
    }
  })

  app.get('/admin/institutional-continuity/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = getInstitutionalContinuityGovernanceService(app).getStatus()

    return {
      status: 'ready',
      continuityMode: status.continuityMode,
      persistenceTruthfulness: status.persistenceTruthfulness,
      recoveryRequired: status.recoveryRequired,
      degradedMemoryFallbackActive: status.degradedMemoryFallbackActive,
      unsafeShutdownDetected: status.unsafeShutdownDetected,
      replayContinuityState: status.replayContinuityState,
      restartIntegrityState: status.restartIntegrityState,
      shutdownIntegrityState: status.shutdownIntegrityState,
      blockedCapabilities: status.blockedCapabilities,
      lastReason: status.lastReason ?? null,
      lastTransitionAt: status.lastTransitionAt,
      updatedAt: status.updatedAt,
      continuityDecision: {
        capability: 'public.read.low_risk',
        allowed: true,
        reason: 'institutional-safe',
        riskLevel: 'low',
        evaluatedAt: new Date().toISOString(),
      },
    }
  })

  app.get('/admin/runtime-attestation/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const attestation = getRuntimeContinuityAttestationService(app).getStatus()
    const continuity = getInstitutionalContinuityGovernanceService(app).getStatus()

    return {
      status: 'ready',
      attestationIntegrity: attestation.attestationIntegrity,
      replayVerificationState: attestation.replayVerificationState,
      queueContinuityState: attestation.queueContinuityState,
      checkpointAttestationState: attestation.checkpointAttestationState,
      lineageContinuityState: attestation.lineageContinuityState,
      recoveryVerificationState: attestation.recoveryVerificationState,
      brokenAttestationChains: attestation.brokenAttestationChains,
      blockedCapabilities: continuity.blockedCapabilities,
    }
  })

  app.get('/admin/sovereign-mutation/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getInstitutionalSovereignMutationGate().getStatus()

    return {
      status: 'ready',
      mutationSovereigntyState: status.mutationSovereigntyState,
      centralizedAuthorityCoverage: status.centralizedAuthorityCoverage,
      detectedBypassPaths: status.detectedBypassPaths,
      blockedCapabilities: status.blockedCapabilities,
      attestationIntegrity: status.attestationIntegrity,
      continuityRequirements: status.continuityRequirements,
      replayRequirements: status.replayRequirements,
      mutationAuthorityGraph: status.mutationAuthorityGraph,
    }
  })

  app.get('/admin/mutation-idempotency/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getInstitutionalSovereignMutationGate().getMutationIdempotencyStatus()

    return {
      status: 'ready',
      idempotencyState: status.idempotencyState,
      replayEquivalentCoverage: status.replayEquivalentCoverage,
      deduplicatedMutationCount: status.deduplicatedMutationCount,
      semanticReplayIntegrity: status.semanticReplayIntegrity,
      replayCollisionCount: status.replayCollisionCount,
      lineageReplayEquivalence: status.lineageReplayEquivalence,
      recoveryReplayIntegrity: status.recoveryReplayIntegrity,
      unresolvedReplayConflicts: status.unresolvedReplayConflicts,
    }
  })

  app.get('/admin/auth-sovereignty/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getAuthSovereignMutationService(app).getStatus()

    return {
      status: 'ready',
      authSovereigntyState: status.authSovereigntyState,
      centralizedAuthCoverage: status.centralizedAuthCoverage,
      ungatedAuthPaths: status.ungatedAuthPaths,
      replayVerificationState: status.replayVerificationState,
      continuityMode: status.continuityMode,
      attestationIntegrity: status.attestationIntegrity,
      blockedCapabilities: status.blockedCapabilities,
      authAuthorityGraph: status.authAuthorityGraph,
    }
  })

  app.get('/admin/semantic-mutation/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getSemanticMutationExecutor().getStatus()

    return {
      status: 'ready',
      semanticSovereigntyState: status.semanticSovereigntyState,
      semanticCoverage: status.semanticCoverage,
      unsafeSemanticWriters: status.unsafeSemanticWriters,
      repositoryPassivityViolations: status.repositoryPassivityViolations,
      replayRelevantCoverage: status.replayRelevantCoverage,
      verifiedEffectCoverage: status.verifiedEffectCoverage,
      semanticMutationAuthorityGraph: status.semanticMutationAuthorityGraph,
    }
  })

  app.get('/admin/semantic-replay/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getSemanticMutationExecutor().getReplayHydrationStatus()

    return {
      status: 'ready',
      semanticReplayIntegrity: status.semanticReplayIntegrity,
      canonicalReplayCoverage: status.canonicalReplayCoverage,
      reconstructedReplayCount: status.reconstructedReplayCount,
      fallbackReplayCount: status.fallbackReplayCount,
      invalidReplayCount: status.invalidReplayCount,
      replayShapeMismatchCount: status.replayShapeMismatchCount,
      adaptiveEvidenceHydrationState: status.adaptiveEvidenceHydrationState,
    }
  })

  app.get('/admin/persistence-coordination/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getSovereignPersistenceCoordinationService().getStatus()

    return {
      status: 'ready',
      persistenceCoordinationState: status.persistenceCoordinationState,
      sqliteContentionState: status.sqliteContentionState,
      transactionalQueueState: status.transactionalQueueState,
      replaySerializationState: status.replaySerializationState,
      leaseCoordinationState: status.leaseCoordinationState,
      recoveryPriorityState: status.recoveryPriorityState,
      persistenceLineageIntegrity: status.persistenceLineageIntegrity,
      activePersistenceLeases: status.activePersistenceLeases,
      retryExhaustionState: status.retryExhaustionState,
    }
  })

  app.get('/admin/recovery-sovereignty/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = getInstitutionalRecoveryGovernanceService(app).getStatus()

    return {
      status: 'ready',
      recoveryState: status.recoveryState,
      replayRestorationState: status.replayRestorationState,
      lineageReconciliationState: status.lineageReconciliationState,
      continuityRestorationState: status.continuityRestorationState,
      semanticIntegrityState: status.semanticIntegrityState,
      attestationReconstructionState: status.attestationReconstructionState,
      recoveryLockdownState: status.recoveryLockdownState,
      institutionalUnlockAllowed: status.institutionalUnlockAllowed,
    }
  })

  app.get('/admin/distributed-sovereignty/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const status = await getDistributedSovereignty(app).getStatus()

    return {
      status: 'ready',
      distributedSovereigntyState: status.distributedSovereigntyState,
      nodeRegistryState: status.nodeRegistryState,
      quorumState: status.quorumState,
      distributedContinuityState: status.distributedContinuityState,
      replayFederationState: status.replayFederationState,
      splitBrainRiskState: status.splitBrainRiskState,
      distributedRecoveryState: status.distributedRecoveryState,
      distributedLineageIntegrity: status.distributedLineageIntegrity,
    }
  })

  app.get<{ Querystring: AdaptiveInfluenceTimelineQuery }>('/admin/adaptive-dashboard/timeline', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    requireContinuityCapability(app, 'governance.replay.generate', 'high')
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const rollingHours = String(request.query.rollingHours ?? '6,24,72')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 10)
    const timeline = await getAdaptiveTimelineDashboardService(app).buildDashboard({
      historyLimit,
      rollingHours: rollingHours.length > 0 ? rollingHours : undefined,
    })

    return {
      status: 'ready',
      generatedAt: timeline.generatedAt,
      aggregationArchitecture: timeline.aggregationArchitecture,
      timeline: {
        hourlyWindows: timeline.hourlyWindows,
        dailyWindows: timeline.dailyWindows,
        rollingWindows: timeline.rollingWindows,
        historicalSnapshots: timeline.historicalSnapshots,
        longitudinalTrends: timeline.longitudinalTrends,
      },
      compatibility: timeline.compatibility,
      epistemicConfidence: timeline.epistemicConfidence,
      replaySafePayload: {
        payloadFingerprint: timeline.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
      },
      operationalMetadata: {
        adminOnly: true,
        readOnly: true,
        replaySafe: true,
        noMutation: true,
        noDomainMutation: true,
        noAdaptiveStateMutation: true,
        noGovernanceMutation: true,
        observabilityWritesOnly: false,
        noRolloutActivation: true,
      },
    }
  })

  app.get<{ Querystring: GovernanceEvidenceTimelineQuery }>('/admin/adaptive-dashboard/governance-timeline', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    requireContinuityCapability(app, 'governance.replay.generate', 'high')
    const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1)
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(request.query.pageSize ?? '50', 10) || 50))
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '1000', 10) || 1000))
    const history = await getGovernanceEvidenceTimelineService(app).buildHistory({
      page,
      pageSize,
      historyLimit,
    })

    return {
      status: 'ready',
      generatedAt: history.generatedAt,
      compatibility: history.compatibility,
      epistemicConfidence: history.epistemicConfidence,
      reducers: history.reducers,
      events: history.events,
      pagination: history.pagination,
      replaySafePayload: history.replaySafePayload,
      operationalMetadata: {
        adminOnly: true,
        readOnly: true,
        replaySafe: true,
        noMutation: true,
        noDomainMutation: true,
        noAdaptiveStateMutation: true,
        noGovernanceMutation: true,
        observabilityWritesOnly: false,
        noRolloutActivation: true,
        appendOnly: true,
      },
    }
  })

  app.get<{ Querystring: ReplayConsistencyGraphQuery }>('/admin/adaptive-dashboard/replay-graphs', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    requireContinuityCapability(app, 'governance.replay.generate', 'high')
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const rollingHours = String(request.query.rollingHours ?? '6,24,72')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 10)
    const replayConsistencyBucketCount = Math.max(2, Math.min(20, Number.parseInt(request.query.bucketCount ?? '5', 10) || 5))

    const replayGraphs = await getReplayConsistencyGraphService(app).buildReplayGraphs({
      historyLimit,
      rollingHours: rollingHours.length > 0 ? rollingHours : undefined,
      replayConsistencyBucketCount,
    })

    return {
      status: 'ready',
      generatedAt: replayGraphs.generatedAt,
      aggregationArchitecture: replayGraphs.aggregationArchitecture,
      compatibility: replayGraphs.compatibility,
      epistemicConfidence: replayGraphs.epistemicConfidence,
      replayGraphs: replayGraphs.graph,
      replaySafePayload: {
        payloadFingerprint: replayGraphs.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
        replaySafe: true,
      },
      operationalMetadata: {
        adminOnly: true,
        readOnly: true,
        replaySafe: true,
        noMutation: true,
        noDomainMutation: true,
        noAdaptiveStateMutation: true,
        noGovernanceMutation: true,
        observabilityWritesOnly: false,
        noRolloutActivation: true,
      },
    }
  })

  app.get<{ Querystring: AdaptiveHeatmapQuery }>('/admin/adaptive-dashboard/heatmaps', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const startedAt = Date.now()
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const hotspotLimit = Math.max(1, Math.min(100, Number.parseInt(request.query.hotspotLimit ?? '24', 10) || 24))
    const heatmaps = await getAdaptiveHeatmapService(app).buildHeatmaps({
      historyLimit,
      hotspotLimit,
    })

    const durationMs = Date.now() - startedAt
    getObservability(app).incrementMetric('adaptive_dashboard_heatmap_requests_total')
    getObservability(app).recordTiming('adaptive_dashboard_heatmap_build_duration_ms', durationMs)

    return {
      status: 'ready',
      generatedAt: heatmaps.generatedAt,
      aggregationArchitecture: heatmaps.aggregationArchitecture,
      concentrationScoring: heatmaps.concentrationScoring,
      compatibility: heatmaps.compatibility,
      heatmaps: heatmaps.heatmaps,
      hotspots: heatmaps.hotspots,
      observability: heatmaps.observability,
      replaySafePayload: {
        payloadFingerprint: heatmaps.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
        replaySafe: true,
      },
      operationalMetadata: {
        adminOnly: true,
        readOnly: true,
        replaySafe: true,
        noMutation: true,
        noDomainMutation: true,
        noAdaptiveStateMutation: true,
        noGovernanceMutation: true,
        observabilityWritesOnly: true,
        noRolloutActivation: true,
      },
    }
  })

  app.get<{ Querystring: LongitudinalStabilityScoreQuery }>('/admin/adaptive-dashboard/stability-score', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const startedAt = Date.now()
    const historyLimit = Math.max(10, Math.min(10_000, Number.parseInt(request.query.historyLimit ?? '720', 10) || 720))
    const rollingHours = String(request.query.rollingHours ?? '6,24,72')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 10)
    const stabilityScore = await getLongitudinalStabilityScoreService(app).buildStabilityScore({
      historyLimit,
      rollingHours: rollingHours.length > 0 ? rollingHours : undefined,
    })

    const durationMs = Date.now() - startedAt
    getObservability(app).incrementMetric('adaptive_dashboard_stability_requests_total')
    getObservability(app).recordTiming('adaptive_dashboard_stability_build_duration_ms', durationMs)

    return {
      status: 'ready',
      generatedAt: stabilityScore.generatedAt,
      aggregationArchitecture: stabilityScore.aggregationArchitecture,
      stabilityScoringArchitecture: stabilityScore.stabilityScoringArchitecture,
      compatibility: stabilityScore.compatibility,
      currentScore: stabilityScore.currentScore,
      historicalScores: stabilityScore.historicalScores,
      rollingAverages: stabilityScore.rollingAverages,
      longitudinalEvolution: stabilityScore.longitudinalEvolution,
      replaySafePayload: {
        ...stabilityScore.replaySafePayload,
        payloadFingerprint: stabilityScore.payloadFingerprint,
        deterministic: true,
        derivedOnly: true,
        replaySafe: true,
      },
      operationalMetadata: {
        adminOnly: true,
        readOnly: true,
        replaySafe: true,
        noMutation: true,
        noDomainMutation: true,
        noAdaptiveStateMutation: true,
        noGovernanceMutation: true,
        observabilityWritesOnly: true,
        noRolloutActivation: true,
      },
    }
  })

  app.get('/admin/adaptive-weights', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const state = getAdaptiveWeightSnapshotRuntime(app).getSnapshot()

    console.info('[adaptive-weights] route.read', {
      ready: state.runtimeState.ready,
      warming: state.runtimeState.warming,
      signalWeightCount: state.snapshot.signalWeights.length,
      categoryWeightCount: state.snapshot.categoryWeights.length,
      entityWeightCount: state.snapshot.entityWeights.length,
    })

    return {
      generatedAt: state.snapshot.generatedAt,
      signalWeights: state.snapshot.signalWeights,
      categoryWeights: state.snapshot.categoryWeights,
      entityWeights: state.snapshot.entityWeights,
      metadata: state.snapshot.metadata,
      freshness: state.freshness,
      runtimeState: state.runtimeState,
    }
  })

  app.get('/admin/adaptive-learning/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const feedbackStatus = getEconomicFeedbackRuntime(app).getStatus()
    const adaptiveState = getAdaptiveWeightSnapshotRuntime(app).getSnapshot()
    const ledgerCount = await getLearningLedgerRepository(app).countLearningEvents()
    const [signalMemory, categoryMemory, entityMemory] = await Promise.all([
      getEconomicMemoryRepository(app).listEconomicMemoryByScope('signal'),
      getEconomicMemoryRepository(app).listEconomicMemoryByScope('category'),
      getEconomicMemoryRepository(app).listEconomicMemoryByScope('entity'),
    ])

    return {
      status: 'ready',
      runtime: feedbackStatus,
      adaptiveWeights: {
        generatedAt: adaptiveState.snapshot.generatedAt,
        freshness: adaptiveState.freshness,
        runtimeState: adaptiveState.runtimeState,
      },
      counts: {
        ledgerCount,
        signalMemoryCount: signalMemory.length,
        categoryMemoryCount: categoryMemory.length,
        entityMemoryCount: entityMemory.length,
        signalWeightCount: adaptiveState.snapshot.signalWeights.length,
        categoryWeightCount: adaptiveState.snapshot.categoryWeights.length,
        entityWeightCount: adaptiveState.snapshot.entityWeights.length,
      },
      operationalMetadata: {
        advisoryOnly: true,
        runtimeMutationEnabled: false,
        governanceMutationEnabled: false,
        snapshotSafe: true,
      },
    }
  })

  app.get<{ Querystring: AdaptiveLearningLedgerQuery }>('/admin/adaptive-learning/ledger', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request) => {
    const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1)
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(request.query.pageSize ?? '50', 10) || 50))
    const offset = (page - 1) * pageSize
    const repository = getLearningLedgerRepository(app)
    const [total, records] = await Promise.all([
      repository.countLearningEvents(),
      repository.listLearningEventsPaginated({ limit: pageSize, offset }),
    ])

    return {
      status: 'ready',
      records,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      operationalMetadata: {
        immutable: true,
        sorted: 'newest_first',
        advisoryOnly: true,
        snapshotSafe: true,
      },
    }
  })

  app.get('/admin/adaptive-learning/memory', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const repository = getEconomicMemoryRepository(app)
    const [signal, category, entity] = await Promise.all([
      repository.listEconomicMemoryByScope('signal'),
      repository.listEconomicMemoryByScope('category'),
      repository.listEconomicMemoryByScope('entity'),
    ])

    return {
      status: 'ready',
      grouped: {
        signal,
        category,
        entity,
      },
      counts: {
        signal: signal.length,
        category: category.length,
        entity: entity.length,
      },
      operationalMetadata: {
        advisoryOnly: true,
        groupedBy: ['signal', 'category', 'entity'],
        snapshotSafe: true,
      },
    }
  })

  app.get('/admin/adaptive-learning/checkpoint', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const checkpoint = await getLearningCheckpointRepository(app).getCheckpointByRuntimeName('economic-feedback-runtime')
    const revenueState = getRevenueAttributionSnapshotStore(app).getSnapshot()
    const watermark = checkpoint?.lastProcessedAttributionId && checkpoint.lastProcessedAttributedAt
      ? {
        attributionId: checkpoint.lastProcessedAttributionId,
        attributedAt: checkpoint.lastProcessedAttributedAt,
      }
      : null
    const replayLagCount = revenueState.snapshot.attributions.filter((attribution) => {
      if (!watermark) {
        return true
      }

      const attributedAtOrder = attribution.attributedAt.localeCompare(watermark.attributedAt)
      if (attributedAtOrder !== 0) {
        return attributedAtOrder > 0
      }

      return attribution.attributionId.localeCompare(watermark.attributionId) > 0
    }).length

    return {
      status: 'ready',
      checkpoint: checkpoint ?? null,
      lastProcessedAttribution: watermark,
      replayLag: {
        count: replayLagCount,
        sourceFreshness: revenueState.freshness,
      },
      operationalMetadata: {
        readOnly: true,
        runtimeName: 'economic-feedback-runtime',
        snapshotSafe: true,
      },
    }
  })

  app.post<{ Body: AdaptiveLearningRebuildBody }>('/admin/adaptive-learning/rebuild-memory/dry-run', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const parsed = parseAdaptiveLearningRebuildPlan(request.body, true)
    if (!parsed.plan) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_REBUILD_PLAN',
          message: parsed.error ?? 'Invalid rebuild plan.',
        },
      })
    }

    const rebuildResult = await getEconomicMemoryRebuildService(app).rebuild(parsed.plan)
    const durationMs = deriveDurationMs(rebuildResult.startedAt, rebuildResult.completedAt)
    const isConcurrentBlocked = rebuildResult.warnings.some((warning) => warning.includes('already in progress'))

    if (isConcurrentBlocked) {
      return reply.status(409).send({
        status: 'failed',
        rebuild: rebuildResult,
        warnings: rebuildResult.warnings,
        counts: {
          processedLedgerEvents: rebuildResult.processedLedgerEvents,
          rebuiltMemoryRecords: rebuildResult.rebuiltMemoryRecords,
          skippedEvents: rebuildResult.skippedEvents,
        },
        durationMs,
        dryRun: rebuildResult.dryRun,
        operationalMetadata: {
          adminOnly: true,
          ledgerMutation: false,
          commitExplicit: false,
          concurrentProtected: true,
          mode: 'dry-run',
        },
      })
    }

    return {
      status: rebuildResult.status === 'completed' ? 'ready' : 'failed',
      rebuild: rebuildResult,
      warnings: rebuildResult.warnings,
      counts: {
        processedLedgerEvents: rebuildResult.processedLedgerEvents,
        rebuiltMemoryRecords: rebuildResult.rebuiltMemoryRecords,
        skippedEvents: rebuildResult.skippedEvents,
      },
      durationMs,
      dryRun: rebuildResult.dryRun,
      operationalMetadata: {
        adminOnly: true,
        ledgerMutation: false,
        commitExplicit: false,
        concurrentProtected: true,
        mode: 'dry-run',
      },
    }
  })

  app.post<{ Body: AdaptiveLearningRebuildBody }>('/admin/adaptive-learning/rebuild-memory/commit', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async (request, reply) => {
    const parsed = parseAdaptiveLearningRebuildPlan(request.body, false)
    if (!parsed.plan) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_REBUILD_PLAN',
          message: parsed.error ?? 'Invalid rebuild plan.',
        },
      })
    }

    if (!parsed.confirmCommit) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'REBUILD_COMMIT_CONFIRMATION_REQUIRED',
          message: 'Set confirmCommit=true to execute a committing rebuild.',
        },
      })
    }

    const rebuildResult = await getEconomicMemoryRebuildService(app).rebuild(parsed.plan)
    const durationMs = deriveDurationMs(rebuildResult.startedAt, rebuildResult.completedAt)
    const isConcurrentBlocked = rebuildResult.warnings.some((warning) => warning.includes('already in progress'))

    if (isConcurrentBlocked) {
      return reply.status(409).send({
        status: 'failed',
        rebuild: rebuildResult,
        warnings: rebuildResult.warnings,
        counts: {
          processedLedgerEvents: rebuildResult.processedLedgerEvents,
          rebuiltMemoryRecords: rebuildResult.rebuiltMemoryRecords,
          skippedEvents: rebuildResult.skippedEvents,
        },
        durationMs,
        dryRun: rebuildResult.dryRun,
        operationalMetadata: {
          adminOnly: true,
          ledgerMutation: false,
          commitExplicit: true,
          concurrentProtected: true,
          mode: 'commit',
        },
      })
    }

    return {
      status: rebuildResult.status === 'completed' ? 'ready' : 'failed',
      rebuild: rebuildResult,
      warnings: rebuildResult.warnings,
      counts: {
        processedLedgerEvents: rebuildResult.processedLedgerEvents,
        rebuiltMemoryRecords: rebuildResult.rebuiltMemoryRecords,
        skippedEvents: rebuildResult.skippedEvents,
      },
      durationMs,
      dryRun: rebuildResult.dryRun,
      operationalMetadata: {
        adminOnly: true,
        ledgerMutation: false,
        commitExplicit: true,
        concurrentProtected: true,
        mode: 'commit',
      },
    }
  })

  app.get('/admin/adaptive-learning/rebuild-memory/status', { preHandler: [requireAuth, requireApprovalGovernanceAccess] }, async () => {
    const serviceStatus = getEconomicMemoryRebuildService(app).getStatus()
    const memoryCount = (await getEconomicMemoryRepository(app).listAllEconomicMemory()).length
    const lastResult = serviceStatus.lastResult
    const lastDurationMs = lastResult ? deriveDurationMs(lastResult.startedAt, lastResult.completedAt) : 0
    const inFlightDurationMs = serviceStatus.inProgress && serviceStatus.startedAt
      ? Math.max(0, Date.now() - Date.parse(serviceStatus.startedAt))
      : 0

    return {
      status: 'ready',
      rebuild: {
        inProgress: serviceStatus.inProgress,
        startedAt: serviceStatus.startedAt,
        activePlan: serviceStatus.activePlan,
        lastResult,
      },
      warnings: lastResult?.warnings ?? [],
      counts: {
        currentEconomicMemoryRecords: memoryCount,
        processedLedgerEvents: lastResult?.processedLedgerEvents ?? 0,
        rebuiltMemoryRecords: lastResult?.rebuiltMemoryRecords ?? 0,
        skippedEvents: lastResult?.skippedEvents ?? 0,
      },
      duration: {
        lastRunMs: lastDurationMs,
        inFlightMs: inFlightDurationMs,
      },
      dryRun: lastResult?.dryRun ?? null,
      operationalMetadata: {
        adminOnly: true,
        ledgerMutation: false,
        commitExplicit: true,
        concurrentProtected: true,
      },
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

    const runtimeGovernance = getRuntimeGovernanceService(app)
    const governanceMetadata = runtimeGovernance.evaluateCapability({
      capability: 'orchestrator.command.execute',
      riskLevel: 'high',
    })

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
        runtimeMode: governanceMetadata.runtimeMode,
        degradedReason: governanceMetadata.degradedReason,
        blockedCapabilities: governanceMetadata.blockedCapabilities,
        governanceDecision: governanceMetadata.governanceDecision,
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
      const governedResult = commandResult as OrchestratorCommandExecuteResult & {
        runtimeMode: string
        degradedReason?: string
        blockedCapabilities: string[]
        governanceDecision: {
          allowed: boolean
          capability: string
          riskLevel: string
          reason: string
        }
      }
      const transactionResult = governedResult.transaction
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
      runtimeMode: governedResult.runtimeMode,
      degradedReason: governedResult.degradedReason,
      blockedCapabilities: governedResult.blockedCapabilities,
      governanceDecision: governedResult.governanceDecision,
      })
    } catch (error) {
      if (isRuntimeGovernanceBlockedError(error) || isInstitutionalContinuityBlockedError(error)) {
        throw error
      }

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
