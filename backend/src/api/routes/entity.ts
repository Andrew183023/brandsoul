import { createHmac } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { EntityEventLogRepository } from '../../repositories/entityEventLogRepository.js'
import type { EntityExportRepository } from '../../repositories/entityExportRepository.js'
import type { JobProducer } from '../../jobs/index.js'
import type { MonetizationService } from '../../services/monetizationService.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import type { PublicCacheService } from '../../services/publicCacheService.js'
import type { GlobalFeedEngine } from '../../services/globalFeedEngine.js'
import type { RelationshipEngine } from '../../services/relationshipEngine.js'
import type { SocialSignalEngine } from '../../services/socialSignalEngine.js'
import type { GrowthEngine } from '../../domain/growth/GrowthEngine.js'
import type { FlowMindPort } from '../../services/flowMindPort.js'
import { mapEntityProfileToPublicProfile } from '../../services/publicProfileMapper.js'
import { buildPublicPresenceResponse } from '../../services/publicPresenceProjection.js'
import {
  appendPublicFlowMindShadowSnapshot,
  buildPublicFlowMindShadowSnapshot,
  evaluatePublicFlowMindShadow,
  isPublicFlowMindShadowBackendDecisionCandidate,
  isPublicFlowMindShadowFrontendDecisionCandidate,
} from '../../services/publicFlowMindShadowService.js'
import {
  resolvePublicEntityInteraction,
  resolvePublicEntityInteractionAvailability,
  type PublicEntityInteractionRequest,
} from '../../services/publicEntityInteractionService.js'
import { getLegalMarketplaceEntityId } from '../../config/env.js'
import {
  appendLegalCaseMessage,
  assignLegalCase,
  buildLawyerReputationMetrics,
  buildPublicInteractionActionResponseText,
  claimLegalCaseClientOwnership,
  closeLegalCase,
  executePublicInteractionAction,
  findLegalCaseById,
  getEntityLegalCases,
  resolvePublicInteractionExecutionDecision,
  type LegalCaseMessageRole,
} from '../../services/publicInteractionActionService.js'
import {
  applyPublicFlowMindPartialIncidentState,
  applyPublicFlowMindPartialPolicyAdjustment,
  applyPublicFlowMindPartialPolicyEvaluation,
  buildPublicFlowMindPartialTelemetrySnapshot,
  buildPublicFlowMindPartialAggregation,
  computePublicFlowMindPartialRolloutBucket,
  isPublicFlowMindPartialTelemetryInputCandidate,
  reconcilePublicFlowMindPartialTelemetry,
  registerPublicFlowMindPartialSampledRequest,
  resolvePublicFlowMindPartialConfig,
} from '../../services/publicFlowMindPartialService.js'
import {
  emitPublicFlowMindPartialOperationalAlerts,
  resolvePublicFlowMindPartialOperationalAlertWebhookPublisher,
} from '../../services/publicFlowMindPartialOperationalAlertService.js'
import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import type { EntityBusinessConfig, EntityBusinessType } from '../../domain/entityBusinessConfig.js'
import type { OrchestratorSnapshotRepository } from '../../repositories/orchestratorSnapshotRepository.js'
import type { RelationalTraceRepository } from '../../repositories/relationalTraceRepository.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type {
  EntityMutationResult,
  EntityRelationshipInteractionResult,
  EventMutationResult,
  MultiEventMutationResult,
  PublicExportViewRecordResult,
} from '../../orchestrator/sovereignMutationCommandService.js'
import { processBrandInBackendEngine } from '../../services/entityEngineService.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { BackendDatabase } from '../../db/index.js'
import { requireAuth, getRequestAuth, optionalAuth } from '../middleware/requireAuth.js'
import { buildLegacyOwnerId, requireEntityOwner, validateEntityOwnership } from '../middleware/requireEntityOwner.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { AuthContext } from '../middleware/requireAuth.js'
import { getJwtSecret } from '../../config/env.js'
import { createRuntimeStatePayload, withAuthoritativeFrame } from '../../orchestrator/contracts.js'
import {
  buildDashboardSparkStateResponse,
  buildPublicFlowMindShadowAggregation,
  buildPublicFlowMindShadowReadiness,
} from '../../orchestrator/dashboardProjection.js'
import {
  buildMinimalOrchestratorFrame,
  buildOrchestratorRuntimeControl,
  restoreOrchestratorState,
} from '../../orchestrator/orchestratorState.js'
import { buildRuntimeSceneProjection } from '../../orchestrator/runtimeSceneProjection.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'
import type { CaseMessageRecord, CaseRecord, CaseTimelineEventRecord } from '../../modules/legalCases/caseTypes.js'
import { createCaseService } from '../../modules/legalCases/caseService.js'

type BackendContext = {
  backendContext: {
    entityRepository: EntityRepository
    eventLogRepository: EntityEventLogRepository
    entityExportRepository: EntityExportRepository
    globalFeedEngine: GlobalFeedEngine
    socialSignalEngine: SocialSignalEngine
    relationshipEngine: RelationshipEngine
    jobProducer: JobProducer
    monetizationService: MonetizationService
    growthEngine: GrowthEngine
    connection: BackendDatabase
    observability: ObservabilityService
    orchestratorSnapshotRepository: OrchestratorSnapshotRepository
    relationalTraceRepository: RelationalTraceRepository
    publicCacheService: PublicCacheService
    flowMindService?: FlowMindPort
    sovereignMutationCommandService: SovereignMutationCommandService
  }
}

type CreateEntityBody = {
  requestId?: string
  entityInput?: {
    brand?: Record<string, unknown>
    context?: {
      brandCategory?: string
      styleAnswers?: Record<string, unknown>
    }
    palette?: {
      primary?: string
      secondary?: string
      contrast?: 'high' | 'medium' | 'low'
    }
    manifestation?: Record<string, unknown>
  }
  manifestation?: {
    intensity?: 'soft' | 'balanced' | 'cinematic'
  }
  runtimeControl?: Record<string, unknown>
  referralId?: string
}

type PatchEntityBody = {
  entityProfile?: EntityProfileDocument
}

type BusinessConfigBody = {
  businessConfig?: Partial<EntityBusinessConfig>
}

type AuthenticatedOwnerContext = {
  ownerId: string
  ownerUserId: number
  ownerTenantId: number
}

type ResolvedSocialActor = {
  actorId: string
  kind: 'anonymous' | 'authenticated'
}

type DiagnosisArtifactStatus = 'draft' | 'approved' | 'rejected'

type DiagnosisArtifact = {
  id: string
  entityId: string
  entityName: string
  context: string[]
  problem: string
  proposal: string
  impact: string[]
  confidence?: number
  createdAt: string
  status: DiagnosisArtifactStatus
}

type DiagnosisActionBody = {
  diagnosisId?: string
}

type CaseMessageBody = {
  role?: LegalCaseMessageRole
  text?: string
}

type CaseAssignBody = {
  lawyerId?: string
}

type CaseCloseBody = {
  rating?: number
  feedback?: string
  closedBy?: string
}

type CasesQuerystring = {
  entityId?: string
}

const REBRAND_DIAGNOSIS_NOTE_PREFIX = 'rebrand:diagnosis:'

function getRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityRepository
}

function getEventLogRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.eventLogRepository
}

function getEntityExportRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.entityExportRepository
}

function getGlobalFeedEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.globalFeedEngine
}

function getSocialSignalEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.socialSignalEngine
}

function getRelationshipEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.relationshipEngine
}

function getOrchestratorSnapshotRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.orchestratorSnapshotRepository
}

function getJobProducer(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.jobProducer
}

function getMonetizationService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.monetizationService
}

function getPublicCacheService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.publicCacheService
}

function getFlowMindService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.flowMindService
}

function getSovereignMutationCommandService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.sovereignMutationCommandService
}

function getObservability(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.observability
}

function getRelationalTraceRepository(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.relationalTraceRepository
}

function getGrowthEngine(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.growthEngine
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function getLegalCaseRepository(app: FastifyInstance) {
  return createCaseRepository(getConnection(app))
}

function getLegalCaseService(app: FastifyInstance) {
  return createCaseService(getConnection(app))
}

function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createOwnerId() {
  return `owner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createExportRecordId() {
  return `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createDiagnosisArtifactId() {
  return `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function trackCaseRouteMetric(
  app: FastifyInstance,
  metric: 'postgres_case_hit' | 'legacy_case_fallback' | 'legacy_case_fallback_error',
  route: string,
) {
  getObservability(app).incrementMetric(metric, 1, { route })
}

function resolveAuthenticatedOwnerContext(auth: AuthContext): AuthenticatedOwnerContext {
  return {
    ownerId: buildLegacyOwnerId(auth.userId, auth.tenantId),
    ownerUserId: auth.userId,
    ownerTenantId: auth.tenantId,
  }
}

function applyOwnerContextToEntityProfile<T extends EntityProfileDocument>(
  entityProfile: T,
  ownerContext: AuthenticatedOwnerContext,
): T {
  return {
    ...entityProfile,
    ownerId: ownerContext.ownerId,
    ownerUserId: ownerContext.ownerUserId,
    ownerTenantId: ownerContext.ownerTenantId,
  } as T
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
      ownerId: ownership.ownerId,
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
      ownership,
    }
  }

  return {
    status: 'owned' as const,
    entity,
    ownership,
  }
}

function mapInteractionToRelationType(type: string) {
  if (type === 'collaboration') {
    return 'collaboration' as const
  }
  if (type === 'suggestion') {
    return 'affinity' as const
  }
  return 'interaction' as const
}

function resolveInteractionStrength(type: string, weight = 0.42) {
  const normalizedWeight = Math.min(Math.max(weight, 0.08), 1)
  if (type === 'collaboration') {
    return 0.24 + normalizedWeight * 0.34
  }
  if (type === 'suggestion') {
    return 0.14 + normalizedWeight * 0.18
  }
  if (type === 'mention') {
    return 0.12 + normalizedWeight * 0.2
  }

  return 0.1 + normalizedWeight * 0.14
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function isBusinessType(value: unknown): value is EntityBusinessType {
  return value === 'restaurant' || value === 'store' || value === 'legal' || value === 'services'
}

function deepMergeRecord<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'undefined') {
      continue
    }

    if (Array.isArray(value)) {
      next[key] = value
      continue
    }

    const current = next[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      next[key] = deepMergeRecord(current, value)
      continue
    }

    next[key] = value
  }

  return next as T
}

function readEntityBusinessConfig(entityProfile: EntityProfile): EntityBusinessConfig | undefined {
  const metadataRecord = entityProfile.metadata as EntityProfile['metadata'] & {
    businessConfig?: EntityBusinessConfig
  }

  return metadataRecord.businessConfig
}

function isValidScheduleSlot(value: unknown) {
  return isPlainObject(value)
    && typeof value.start === 'string'
    && value.start.trim().length > 0
    && typeof value.end === 'string'
    && value.end.trim().length > 0
}

function validateBusinessConfig(config: EntityBusinessConfig) {
  if (!isBusinessType(config.businessType)) {
    return 'businessType is required and must be one of: restaurant, store, legal, services.'
  }

  if (typeof config.description !== 'undefined' && !isSafeString(config.description, 400)) {
    return 'description is invalid.'
  }

  if (config.catalog) {
    if (!isPlainObject(config.catalog)) {
      return 'catalog is invalid.'
    }

    if (typeof config.catalog.categories !== 'undefined') {
      if (!Array.isArray(config.catalog.categories)) {
        return 'catalog.categories must be an array.'
      }

      for (const category of config.catalog.categories) {
        if (!isPlainObject(category) || !isSafeIdentifier(category.id) || !isSafeString(category.label, 80)) {
          return 'catalog.categories contains invalid entries.'
        }
      }
    }

    if (typeof config.catalog.items !== 'undefined') {
      if (!Array.isArray(config.catalog.items)) {
        return 'catalog.items must be an array.'
      }

      for (const item of config.catalog.items) {
        if (!isPlainObject(item) || !isSafeIdentifier(item.id) || !isSafeString(item.title, 120)) {
          return 'catalog.items contains invalid entries.'
        }
      }
    }
  }

  if (typeof config.services !== 'undefined') {
    if (!Array.isArray(config.services)) {
      return 'services must be an array.'
    }

    for (const service of config.services) {
      if (!isPlainObject(service) || !isSafeIdentifier(service.id) || !isSafeString(service.name, 120)) {
        return 'services contains invalid entries.'
      }
    }

    if ((config.businessType === 'restaurant' || config.businessType === 'store') && config.services.length > 0) {
      return 'services are not enabled for this businessType in the base configuration.'
    }
  }

  if (typeof config.schedule !== 'undefined') {
    if (!isPlainObject(config.schedule)) {
      return 'schedule is invalid.'
    }

    if (typeof config.schedule.days !== 'undefined') {
      if (!Array.isArray(config.schedule.days)) {
        return 'schedule.days must be an array.'
      }

      for (const day of config.schedule.days) {
        if (!isPlainObject(day) || typeof day.enabled !== 'boolean') {
          return 'schedule.days contains invalid entries.'
        }

        if (typeof day.day !== 'string' || !['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(day.day)) {
          return 'schedule.days contains an invalid day.'
        }

        if (typeof day.slots !== 'undefined') {
          if (!Array.isArray(day.slots) || !day.slots.every(isValidScheduleSlot)) {
            return 'schedule.days.slots contains invalid entries.'
          }
        }
      }
    }
  }

  if (config.legalMode) {
    if (!isPlainObject(config.legalMode) || typeof config.legalMode.enabled !== 'boolean') {
      return 'legalMode is invalid.'
    }

    if (config.legalMode.enabled && config.businessType !== 'legal') {
      return 'legalMode can only be enabled for legal businessType.'
    }
  }

  if (typeof config.publicCtas !== 'undefined') {
    if (!Array.isArray(config.publicCtas)) {
      return 'publicCtas must be an array.'
    }

    for (const cta of config.publicCtas) {
      if (!isPlainObject(cta) || !isSafeIdentifier(cta.id) || !isSafeString(cta.label, 80)) {
        return 'publicCtas contains invalid entries.'
      }
    }
  }

  return undefined
}

function mergeBusinessConfig(current: EntityBusinessConfig | undefined, patch: Partial<EntityBusinessConfig>) {
  const currentRecord = (current ?? {}) as Record<string, unknown>
  const patchRecord = patch as Record<string, unknown>

  return deepMergeRecord(currentRecord, patchRecord) as EntityBusinessConfig
}

function writeEntityBusinessConfig(entityProfile: EntityProfile, businessConfig: EntityBusinessConfig): EntityProfile {
  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      updatedAt: new Date().toISOString(),
      businessConfig,
    },
  }
}

function parseTimestamp(value?: string) {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readDiagnosisArtifactNote(note: string) {
  if (!note.startsWith(REBRAND_DIAGNOSIS_NOTE_PREFIX)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(note.slice(REBRAND_DIAGNOSIS_NOTE_PREFIX.length)) as DiagnosisArtifact
    if (
      typeof parsed?.id === 'string'
      && typeof parsed?.entityId === 'string'
      && typeof parsed?.entityName === 'string'
      && Array.isArray(parsed?.context)
      && typeof parsed?.problem === 'string'
      && typeof parsed?.proposal === 'string'
      && Array.isArray(parsed?.impact)
      && typeof parsed?.createdAt === 'string'
      && (parsed?.status === 'draft' || parsed?.status === 'approved' || parsed?.status === 'rejected')
    ) {
      return parsed
    }
  } catch {
    return undefined
  }

  return undefined
}

function serializeDiagnosisArtifact(artifact: DiagnosisArtifact) {
  return `${REBRAND_DIAGNOSIS_NOTE_PREFIX}${JSON.stringify(artifact)}`
}

function listDiagnosisArtifacts(entityProfile: EntityProfile) {
  return (entityProfile.metadata.notes ?? [])
    .map((note) => readDiagnosisArtifactNote(note))
    .filter((artifact): artifact is DiagnosisArtifact => Boolean(artifact))
    .sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt))
}

function writeDiagnosisArtifact(entityProfile: EntityProfile, artifact: DiagnosisArtifact) {
  const notes = entityProfile.metadata.notes ?? []
  const filteredNotes = notes.filter((note) => {
    const parsed = readDiagnosisArtifactNote(note)
    return parsed?.id !== artifact.id
  })

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      notes: [
        serializeDiagnosisArtifact(artifact),
        ...filteredNotes,
      ].slice(0, 48),
    },
  }
}

function resolveEntityNameForDiagnosis(entityProfile: EntityProfile) {
  return entityProfile.finalForm.identity?.name
    ?? entityProfile.social.publicName
    ?? entityProfile.id
}

function resolveDiagnosisFallbackStage(entity: { entityProfile: Record<string, unknown> }) {
  const runtime = entity.entityProfile.runtime
  if (!runtime || typeof runtime !== 'object') {
    return undefined
  }

  const runtimeRecord = runtime as Record<string, unknown>
  const control = runtimeRecord.control
  if (!control || typeof control !== 'object') {
    return undefined
  }

  const controlRecord = control as Record<string, unknown>
  const playback = controlRecord.playback
  if (!playback || typeof playback !== 'object') {
    return undefined
  }

  const playbackRecord = playback as Record<string, unknown>
  return typeof playbackRecord.activeStage === 'string' ? playbackRecord.activeStage : undefined
}

async function buildDiagnosisSignals(args: {
  app: FastifyInstance
  entityRecord: { id: string; entityProfile: EntityProfile }
}) {
  const entityId = args.entityRecord.id
  const entityProfile = args.entityRecord.entityProfile
  const eventLogRepository = getEventLogRepository(args.app)
  const exportRepository = getEntityExportRepository(args.app)
  const snapshotRepository = getOrchestratorSnapshotRepository(args.app)
  const relationalTraceRepository = getRelationalTraceRepository(args.app)

  const [events, exports, latestSnapshot, relationalTrace] = await Promise.all([
    eventLogRepository.getRecentEvents(entityId, 24),
    exportRepository.getExports(entityId),
    snapshotRepository.getLatestSnapshot(entityId),
    relationalTraceRepository.getEntityTraces(entityId, 12),
  ])

  const publicProfile = mapEntityProfileToPublicProfile({
    entity: entityProfile,
    events,
    exports,
  })

  const presence = buildPublicPresenceResponse({
    entityId,
    entityProfile,
    publicProfile,
    latestSnapshot,
    recentEvents: events,
    relationalTrace,
    exports,
  })

  const restoredAt = latestSnapshot?.updatedAt ?? events[0]?.timestamp ?? new Date().toISOString()
  const restoredState = restoreOrchestratorState({
    entityId,
    entityProfile,
    snapshot: latestSnapshot,
    fallbackStage: resolveDiagnosisFallbackStage({ entityProfile }),
    now: restoredAt,
  })
  const baseFrame = buildMinimalOrchestratorFrame(restoredState, restoredAt)
  const runtimeControl = buildOrchestratorRuntimeControl(restoredState)
  const runtime = {
    entityId,
    state: createRuntimeStatePayload(restoredState, runtimeControl),
    frame: withAuthoritativeFrame({
      ...baseFrame,
      renderSpec: buildRuntimeSceneProjection({
        entityProfile,
        runtimeControl,
        stage: restoredState.currentStage,
      }),
    }),
    session: {
      hydratedAt: restoredAt,
      source: latestSnapshot ? 'snapshot' as const : 'initialized' as const,
      snapshotId: latestSnapshot?.id,
      restoredFromEventLog: Boolean(events[0]),
      eventLogWindowSize: events.length,
    },
    lastEvent: events[0],
    pendingUiEffects: [],
    pendingScheduledTasks: [],
  }

  const dashboard = buildDashboardSparkStateResponse({
    runtime,
    recentEvents: events,
    relationalTrace,
    entityProfile,
  })

  return {
    events,
    exports,
    latestSnapshot,
    relationalTrace,
    publicProfile,
    presence,
    runtime,
    dashboard,
  }
}

function buildDiagnosisArtifact(args: {
  entityId: string
  entityProfile: EntityProfile
  presence: ReturnType<typeof buildPublicPresenceResponse>
  runtime: {
    state: {
      currentStage?: string
      sessionStatus: string
    }
  }
  dashboard: ReturnType<typeof buildDashboardSparkStateResponse>
  relationalTrace: Awaited<ReturnType<RelationalTraceRepository['getEntityTraces']>>
}) {
  const entityName = resolveEntityNameForDiagnosis(args.entityProfile)
  const continuity = args.dashboard.relationalState?.continuityConfidence ?? 0
  const trend = args.dashboard.presenceHealth.trend
  const intensity = args.presence.visual.intensity
  const stage = args.runtime.state.currentStage ?? 'unmapped'
  const category = args.entityProfile.context.brandCategory
  const traceVolume = args.relationalTrace.length
  const hasExports = readStringArray(args.entityProfile.export.formatsEnabled).length > 0

  const context = [
    trend === 'cooling'
      ? 'Presenca publica em fase de resfriamento.'
      : trend === 'forming'
        ? 'Presenca publica ainda em fase de formacao.'
        : trend === 'stable'
          ? 'Presenca publica estavel, com baixo deslocamento perceptivo.'
          : 'Presenca publica com sinais de movimento, mas sem direcao estrategica forte.',
    continuity < 0.46
      ? 'Baixa continuidade relacional nas interacoes recentes.'
      : 'Continuidade relacional moderada, mas sem vinculo distintivo forte.',
    hasExports
      ? 'A entidade ja se manifesta em canais/exports, mas a narrativa ainda pode ganhar diferenciacao.'
      : 'A entidade ainda possui pouca manifestacao exportavel para reforcar identidade.',
  ]

  if (traceVolume <= 1) {
    context.push('Poucos eventos relacionais relevantes para sustentar memoria estrategica.')
  } else if (intensity < 0.5) {
    context.push('A intensidade atual de presenca esta abaixo do ideal para consolidacao de valor percebido.')
  } else {
    context.push(`O runtime esta ativo no estagio ${stage}, mas sem traducao clara de posicionamento para o publico.`)
  }

  const confidence = Math.min(
    0.92,
    Math.max(
      0.52,
      0.56
        + (args.relationalTrace.length >= 3 ? 0.08 : 0)
        + (args.dashboard.liveState.sessionStatus === 'running' ? 0.06 : 0)
        + (hasExports ? 0.04 : 0)
        + (continuity >= 0.5 ? 0.04 : 0),
    ),
  )

  return {
    id: createDiagnosisArtifactId(),
    entityId: args.entityId,
    entityName,
    context: context.slice(0, 4),
    problem: `A entidade esta operando com sinal de identidade insuficientemente diferenciado para o contexto atual de ${category}, o que reduz clareza de valor, consistencia de presenca e continuidade perceptiva.`,
    proposal: 'Reposicionar a entidade como uma presenca mais distinta e coerente, reforcando narrativa, tom e foco de manifestacao sem alterar diretamente sua memoria ou runtime.',
    impact: [
      'Melhor clareza de posicionamento.',
      'Maior consistencia entre identidade, presenca e comportamento publico.',
      'Maior capacidade de retencao e continuidade nas proximas interacoes.',
    ],
    confidence: Math.round(confidence * 100) / 100,
    createdAt: new Date().toISOString(),
    status: 'draft' as const,
  }
}

function updateDiagnosisStatus(entityProfile: EntityProfile, diagnosisId: string, status: DiagnosisArtifactStatus) {
  const artifacts = listDiagnosisArtifacts(entityProfile)
  const target = artifacts.find((artifact) => artifact.id === diagnosisId)

  if (!target) {
    return undefined
  }

  const updated: DiagnosisArtifact = {
    ...target,
    status,
  }

  return {
    diagnosis: updated,
    entityProfile: writeDiagnosisArtifact(entityProfile, updated),
  }
}

function getPublicBaseUrl(request: FastifyRequest) {
  const host = request.headers.host ?? '127.0.0.1:3001'
  const protocol = host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${protocol}://${host}`
}

const publicReadRateLimit = createRateLimit({
  namespace: 'public-read',
  max: 180,
  windowMs: 60_000,
  key: (request) => {
    const auth = getRequestAuth(request)
    return auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : (request.ip || 'unknown')
  },
})

const publicActionRateLimit = createRateLimit({
  namespace: 'public-action',
  max: 40,
  windowMs: 60_000,
  key: (request) => {
    const auth = getRequestAuth(request)
    return auth ? buildLegacyOwnerId(auth.userId, auth.tenantId) : (request.ip || 'unknown')
  },
})

const privateWriteRateLimit = createRateLimit({
  namespace: 'private-write',
  max: 120,
  windowMs: 60_000,
  key: 'user',
})

function isSafeIdentifier(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value)
}

function isSafeString(value: unknown, maxLength = 256) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isIsoDateTime(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isSafeMetadata(value: unknown) {
  if (!isPlainObject(value)) {
    return true
  }

  return JSON.stringify(value).length <= 8_192
}

function isPublicEntityInteractionRequestCandidate(value: unknown): value is PublicEntityInteractionRequest {
  if (!isPlainObject(value)) {
    return false
  }

  const businessContext = value.businessContext
  if (businessContext !== undefined) {
    if (!isPlainObject(businessContext)) {
      return false
    }

    if (businessContext.businessType !== undefined && !isSafeString(businessContext.businessType, 32)) {
      return false
    }

    if (businessContext.description !== undefined && !isSafeString(businessContext.description, 512)) {
      return false
    }

    const catalogSummary = businessContext.catalogSummary
    if (catalogSummary !== undefined) {
      if (!isPlainObject(catalogSummary)) {
        return false
      }

      if (catalogSummary.categories !== undefined) {
        if (!Array.isArray(catalogSummary.categories) || !catalogSummary.categories.every((item) => isSafeString(item, 96))) {
          return false
        }
      }

      if (catalogSummary.featuredItems !== undefined) {
        if (!Array.isArray(catalogSummary.featuredItems) || !catalogSummary.featuredItems.every((item) => isSafeString(item, 96))) {
          return false
        }
      }
    }

    const servicesSummary = businessContext.servicesSummary
    if (servicesSummary !== undefined) {
      if (!isPlainObject(servicesSummary)) {
        return false
      }

      if (servicesSummary.names !== undefined) {
        if (!Array.isArray(servicesSummary.names) || !servicesSummary.names.every((item) => isSafeString(item, 96))) {
          return false
        }
      }
    }
  }

  const context = value.context
  if (context !== undefined) {
    if (!isPlainObject(context)) {
      return false
    }

    if (context.sessionId !== undefined && !isSafeIdentifier(context.sessionId)) {
      return false
    }

    if (context.allowDebug !== undefined && typeof context.allowDebug !== 'boolean') {
      return false
    }

    if (context.clientRenderVersion !== undefined && !isSafeString(context.clientRenderVersion, 64)) {
      return false
    }
  }

  return (value.requestId === undefined || isSafeIdentifier(value.requestId))
    && isSafeString(value.userMessage, 1024)
}

function isAllowedEventType(type: string) {
  return /^[a-z][a-z0-9_.-]{1,63}$/i.test(type)
}

function isAllowedSignalType(type: string) {
  return ['viewed', 'interacted', 'exported', 'shared', 'followed'].includes(type)
}

function isLegalCaseMessageRole(value: unknown): value is LegalCaseMessageRole {
  return value === 'user' || value === 'lawyer' || value === 'system'
}

function isCaseMessageBodyCandidate(value: unknown): value is CaseMessageBody {
  return isPlainObject(value)
    && (value.role === undefined || isLegalCaseMessageRole(value.role))
    && isSafeString(value.text, 4_000)
}

function isCaseAssignBodyCandidate(value: unknown): value is CaseAssignBody {
  return isPlainObject(value) && isSafeIdentifier(value.lawyerId)
}

function isCaseCloseBodyCandidate(value: unknown): value is CaseCloseBody {
  return isPlainObject(value)
    && typeof value.rating === 'number'
    && Number.isInteger(value.rating)
    && value.rating >= 1
    && value.rating <= 5
    && isSafeString(value.closedBy, 120)
    && (value.feedback === undefined || isSafeString(value.feedback, 1_500))
}

function isAssignedLawyer(auth: AuthContext | undefined, assignedLawyerId: string | undefined) {
  if (!auth || !assignedLawyerId) {
    return false
  }

  return assignedLawyerId === String(auth.userId)
    || assignedLawyerId === buildLegacyOwnerId(auth.userId, auth.tenantId)
}

function logCasesAuthDebug(args: {
  request?: FastifyRequest
  auth: AuthContext
  caseTenantId?: number
  createdByUserId?: number
  createdByTenantId?: number
  entityOwnerUserId?: number
  entityOwnerTenantId?: number
  professionalId?: string
  assignedLawyerId?: string
  isClient: boolean
  isOwner: boolean
  isLawyer: boolean
  accessAllowed: boolean
}) {
  args.request?.log.debug({
    event: 'cases.auth.debug',
    userId: args.auth.userId,
    tenantId: args.auth.tenantId,
    caseTenantId: args.caseTenantId,
    createdByUserId: args.createdByUserId,
    createdByTenantId: args.createdByTenantId,
    entityOwnerUserId: args.entityOwnerUserId,
    entityOwnerTenantId: args.entityOwnerTenantId,
    professionalId: args.professionalId,
    assignedLawyerId: args.assignedLawyerId,
    isClient: args.isClient,
    isOwner: args.isOwner,
    isLawyer: args.isLawyer,
    accessAllowed: args.accessAllowed,
  }, 'Case authorization evaluation')
}

function resolveLegacyCaseParticipantAccess(args: {
  auth: AuthContext
  legalCase: {
    creatorUserId?: number
    creatorTenantId?: number
    assignedLawyerId?: string
    tenantId?: number
  }
  entity: {
    ownerUserId?: number
    ownerTenantId?: number
  }
}) {
  const { auth, legalCase, entity } = args
  const isClient = legalCase.creatorUserId === auth.userId
  const isLawyer = isAssignedLawyer(auth, legalCase.assignedLawyerId)
  const isOwner = entity.ownerUserId === auth.userId
    && entity.ownerTenantId === auth.tenantId

  return {
    isClient,
    isLawyer,
    isOwner,
    accessAllowed: isClient || isLawyer || isOwner,
  }
}

async function resolveCaseForAuthenticatedAccess(args: {
  app: FastifyInstance
  request: FastifyRequest
  caseId: string
}) {
  const repository = getRepository(args.app)
  let found = await findLegalCaseById({
    repository,
    caseId: args.caseId,
  })

  const auth = getRequestAuth(args.request)
  if (!found || !auth) {
    return found
  }

  const creatorMissing = typeof found.legalCase.creatorUserId !== 'number'
    && typeof found.legalCase.creatorTenantId !== 'number'
  const isOwner = found.entity.ownerUserId === auth.userId
    && found.entity.ownerTenantId === auth.tenantId
  const isLawyer = isAssignedLawyer(auth, found.legalCase.assignedLawyerId)

  if (!creatorMissing || isOwner || isLawyer) {
    logCasesAuthDebug({
      request: args.request,
      auth,
      caseTenantId: found.legalCase.creatorTenantId,
      createdByUserId: found.legalCase.creatorUserId,
      createdByTenantId: found.legalCase.creatorTenantId,
      entityOwnerUserId: found.entity.ownerUserId,
      entityOwnerTenantId: found.entity.ownerTenantId,
      assignedLawyerId: found.legalCase.assignedLawyerId,
      isClient: found.legalCase.creatorUserId === auth.userId,
      isOwner,
      isLawyer,
      accessAllowed: true,
    })
    return found
  }

  found = await claimLegalCaseClientOwnership({
    repository,
    sovereignCommandService: getSovereignMutationCommandService(args.app),
    caseId: args.caseId,
    userId: auth.userId,
    tenantId: auth.tenantId,
  })

  if (found) {
    logCasesAuthDebug({
      request: args.request,
      auth,
      caseTenantId: found.legalCase.creatorTenantId,
      createdByUserId: found.legalCase.creatorUserId,
      createdByTenantId: found.legalCase.creatorTenantId,
      entityOwnerUserId: found.entity.ownerUserId,
      entityOwnerTenantId: found.entity.ownerTenantId,
      assignedLawyerId: found.legalCase.assignedLawyerId,
      isClient: found.legalCase.creatorUserId === auth.userId,
      isOwner: found.entity.ownerUserId === auth.userId && found.entity.ownerTenantId === auth.tenantId,
      isLawyer: isAssignedLawyer(auth, found.legalCase.assignedLawyerId),
      accessAllowed: true,
    })
  }

  return found
}

type LegacyCompatibleCaseMessage = {
  id: string
  role: LegalCaseMessageRole
  text: string
  actorId?: string
  createdAt: string
}

type LegacyCompatibleCaseTimelineEntry = {
  id: string
  type: 'case_opened' | 'message_added' | 'status_changed' | 'case_closed'
  createdAt: string
  summary: string
}

type LegacyCompatibleCaseRecord = {
  id: string
  tenantId: number
  entityId: string
  status: 'open' | 'assigned' | 'pending' | 'closed'
  createdAt: string
  updatedAt: string
  creatorUserId?: number
  creatorTenantId?: number
  assignedLawyerId?: string
  description: string
  city?: string
  contact?: string
  source: 'public-interaction'
  messages: LegacyCompatibleCaseMessage[]
  timeline: LegacyCompatibleCaseTimelineEntry[]
}

function safeJsonObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>
  }

  return value as Record<string, unknown>
}

function readRecordString(input: Record<string, unknown>, key: string) {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function mapPostgresCaseStatus(record: CaseRecord): LegacyCompatibleCaseRecord['status'] {
  if (record.status === 'closed' || record.status === 'archived') {
    return 'closed'
  }

  if (record.status === 'pending' || record.status === 'on_hold') {
    return 'pending'
  }

  if (record.leadProfessionalId) {
    return 'assigned'
  }

  return 'open'
}

function mapPostgresMessageRole(message: CaseMessageRecord): LegalCaseMessageRole {
  if (message.direction === 'inbound') {
    return 'user'
  }

  if (message.authorProfessionalId || message.direction === 'outbound') {
    return 'lawyer'
  }

  return 'system'
}

function mapTimelineEventTypeToLegacyType(eventType: string): LegacyCompatibleCaseTimelineEntry['type'] {
  if (eventType === 'created') {
    return 'case_opened'
  }

  if (eventType === 'message_added') {
    return 'message_added'
  }

  if (eventType === 'closed') {
    return 'case_closed'
  }

  return 'status_changed'
}

function buildTimelineSummary(event: CaseTimelineEventRecord) {
  const payload = safeJsonObject(event.payload)
  if (event.eventType === 'message_added') {
    const sequenceNo = payload.sequenceNo
    if (typeof sequenceNo === 'number' && Number.isFinite(sequenceNo)) {
      return `Mensagem registrada no caso (#${Math.trunc(sequenceNo)}).`
    }

    return 'Mensagem registrada no caso.'
  }

  if (event.eventType === 'assigned') {
    const professionalId = readRecordString(payload, 'professionalId')
    if (professionalId) {
      return `Caso atribuido ao advogado ${professionalId}.`
    }

    return 'Caso atribuido.'
  }

  if (event.eventType === 'accepted') {
    return 'Atribuicao aceita.'
  }

  if (event.eventType === 'rejected') {
    return 'Atribuicao recusada.'
  }

  if (event.eventType === 'closed') {
    return 'Caso finalizado.'
  }

  if (event.eventType === 'created') {
    return 'Caso aberto.'
  }

  return `Evento ${event.eventType} registrado.`
}

async function listPostgresCaseTimeline(db: BackendDatabase, tenantId: number, caseId: string) {
  const rows = await db.all<Array<{
    id: string
    tenant_id: number
    case_id: string
    event_type: string
    actor_professional_id: string | null
    actor_user_id: number | null
    occurred_at: string
    payload: unknown
    created_at: string
    updated_at: string
  }>>(
    `
      SELECT
        id, tenant_id, case_id, event_type, actor_professional_id, actor_user_id, occurred_at, payload, created_at, updated_at
      FROM case_timeline
      WHERE tenant_id = ? AND case_id = ?
      ORDER BY occurred_at ASC, created_at ASC, id ASC
    `,
    tenantId,
    caseId,
  )

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    eventType: row.event_type as CaseTimelineEventRecord['eventType'],
    actorProfessionalId: row.actor_professional_id ?? undefined,
    actorUserId: row.actor_user_id ?? undefined,
    occurredAt: row.occurred_at,
    payload: safeJsonObject(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function toLegacyCompatibleCase(args: {
  tenantId: number
  caseRecord: CaseRecord
  messages: CaseMessageRecord[]
  timeline: CaseTimelineEventRecord[]
}): LegacyCompatibleCaseRecord {
  const metadata = safeJsonObject(args.caseRecord.metadata)
  const metadataLocation = safeJsonObject(metadata.location)
  const contact = readRecordString(metadata, 'contact')
    ?? readRecordString(safeJsonObject(metadata.contact), 'value')
    ?? readRecordString(safeJsonObject(metadata.contact), 'whatsapp')
    ?? readRecordString(safeJsonObject(metadata.contact), 'phone')
    ?? readRecordString(safeJsonObject(metadata.contact), 'email')
  const city = readRecordString(metadata, 'city')
    ?? readRecordString(metadataLocation, 'city')

  return {
    id: args.caseRecord.id,
    tenantId: args.caseRecord.tenantId,
    entityId: args.caseRecord.entityId ?? '',
    status: mapPostgresCaseStatus(args.caseRecord),
    createdAt: args.caseRecord.createdAt,
    updatedAt: args.caseRecord.updatedAt,
    creatorUserId: args.caseRecord.createdByUserId,
    creatorTenantId: args.caseRecord.createdByUserId ? args.tenantId : undefined,
    assignedLawyerId: args.caseRecord.leadProfessionalId,
    description: args.caseRecord.description?.trim() || args.caseRecord.title,
    city,
    contact,
    source: 'public-interaction',
    messages: args.messages.map((message) => ({
      id: message.id,
      role: mapPostgresMessageRole(message),
      text: message.body,
      actorId: message.authorProfessionalId,
      createdAt: message.createdAt,
    })),
    timeline: args.timeline.map((event) => ({
      id: event.id,
      type: mapTimelineEventTypeToLegacyType(event.eventType),
      createdAt: event.occurredAt,
      summary: buildTimelineSummary(event),
    })),
  }
}

function isPostgresCaseParticipant(args: {
  auth: AuthContext
  legalCase: LegacyCompatibleCaseRecord
  entity: { ownerUserId?: number; ownerTenantId?: number } | null
  professionalId?: string
}) {
  const { auth, legalCase, entity, professionalId } = args
  const isClient = legalCase.creatorUserId === auth.userId
  const isOwner = entity?.ownerUserId === auth.userId && entity?.ownerTenantId === auth.tenantId
  const isAssignedLawyerByUserId = legalCase.assignedLawyerId === String(auth.userId)
    || legalCase.assignedLawyerId === buildLegacyOwnerId(auth.userId, auth.tenantId)
  const isAssignedLawyerByProfessionalId = Boolean(professionalId && legalCase.assignedLawyerId === professionalId)

  return isClient || isOwner || isAssignedLawyerByUserId || isAssignedLawyerByProfessionalId
}

async function resolveMarketplaceCasesAccess(args: {
  app: FastifyInstance
  auth: AuthContext
}) {
  const marketplaceEntityId = getLegalMarketplaceEntityId()
  const marketplaceEntity = await getRepository(args.app).getEntityById(marketplaceEntityId)

  if (!marketplaceEntity) {
    return {
      marketplaceEntityId,
      marketplaceEntity: null,
      hasAccess: false,
    }
  }

  const normalizedRoles = Array.isArray(args.auth.roles)
    ? args.auth.roles.map((role) => role.trim().toLowerCase())
    : []
  const hasMarketplaceRole = normalizedRoles.some((role) => role === 'owner' || role === 'admin' || role === 'operator')
  const marketplaceTenantId = marketplaceEntity.ownerTenantId
  const hasMarketplaceTenant = typeof marketplaceTenantId === 'number' && Number.isInteger(marketplaceTenantId) && marketplaceTenantId > 0
  const hasAccess = hasMarketplaceTenant
    && marketplaceTenantId === args.auth.tenantId
    && (validateEntityOwnership(marketplaceEntity, args.auth.userId, args.auth.tenantId) || hasMarketplaceRole)

  return {
    marketplaceEntityId,
    marketplaceEntity,
    hasAccess,
  }
}

async function resolvePostgresCaseForRead(args: {
  app: FastifyInstance
  request?: FastifyRequest
  auth: AuthContext
  caseId: string
}) {
  const repository = getLegalCaseRepository(args.app)
  let caseRecord = await repository.getCaseById(args.auth.tenantId, args.caseId)
  let globalCaseRecord: CaseRecord | null = null
  const claimTokenHeader = args.request?.headers['x-case-claim-token']
  const claimToken = Array.isArray(claimTokenHeader) ? claimTokenHeader[0] : claimTokenHeader
  const normalizedClaimToken = typeof claimToken === 'string' ? claimToken.trim() : ''

  if (!caseRecord) {
    globalCaseRecord = await repository.getCaseByIdAnyTenant(args.caseId)
  }

  if (!caseRecord && normalizedClaimToken.length > 0) {
    const globalCaseClaimToken = typeof globalCaseRecord?.metadata.caseClaimToken === 'string'
      ? globalCaseRecord.metadata.caseClaimToken
      : undefined

    if (globalCaseRecord && globalCaseClaimToken && globalCaseClaimToken === normalizedClaimToken) {
      caseRecord = globalCaseRecord
    }
  }

  if (!caseRecord && globalCaseRecord) {
    caseRecord = globalCaseRecord
  }

  if (!caseRecord) {
    return undefined
  }

  const metadataClaimToken = typeof caseRecord.metadata.caseClaimToken === 'string'
    ? caseRecord.metadata.caseClaimToken
    : undefined

  if (
    !caseRecord.createdByUserId
    && normalizedClaimToken.length > 0
    && metadataClaimToken
    && metadataClaimToken === normalizedClaimToken
  ) {
    const claimedCase = await repository.updateCaseCreatorOwnership(caseRecord.tenantId, args.caseId, args.auth.userId)
    if (claimedCase) {
      caseRecord = claimedCase
    }
  }

  const caseTenantId = caseRecord.tenantId
  const [messages, timeline, professional, entity] = await Promise.all([
    repository.listMessages(caseTenantId, args.caseId),
    listPostgresCaseTimeline(getConnection(args.app), caseTenantId, args.caseId),
    repository.getProfessionalByUserId(caseTenantId, args.auth.userId),
    caseRecord.entityId ? getRepository(args.app).getEntityById(caseRecord.entityId) : Promise.resolve(null),
  ])

  const legalCase = toLegacyCompatibleCase({
    tenantId: caseTenantId,
    caseRecord,
    messages,
    timeline,
  })

  const marketplaceAccess = legalCase.entityId
    ? await resolveMarketplaceCasesAccess({
        app: args.app,
        auth: args.auth,
      })
    : undefined
  const hasMarketplaceReadAccess = Boolean(
    marketplaceAccess?.hasAccess
      && marketplaceAccess.marketplaceEntityId === legalCase.entityId,
  )

  const hasAccess = isPostgresCaseParticipant({
    auth: args.auth,
    legalCase,
    entity,
    professionalId: professional?.id,
  }) || hasMarketplaceReadAccess

  logCasesAuthDebug({
    request: args.request,
    auth: args.auth,
    caseTenantId: caseRecord.tenantId,
    createdByUserId: legalCase.creatorUserId,
    createdByTenantId: legalCase.creatorTenantId,
    entityOwnerUserId: entity?.ownerUserId,
    entityOwnerTenantId: entity?.ownerTenantId,
    professionalId: professional?.id,
    assignedLawyerId: legalCase.assignedLawyerId,
    isClient: legalCase.creatorUserId === args.auth.userId,
    isOwner: entity?.ownerUserId === args.auth.userId && entity?.ownerTenantId === args.auth.tenantId,
    isLawyer: legalCase.assignedLawyerId === String(args.auth.userId)
      || legalCase.assignedLawyerId === buildLegacyOwnerId(args.auth.userId, args.auth.tenantId)
      || (Boolean(professional?.id) && legalCase.assignedLawyerId === professional?.id),
    accessAllowed: hasAccess,
  })

  return {
    source: 'postgres' as const,
    legalCase,
    entity,
    hasAccess,
    messages: legalCase.messages,
  }
}

async function resolvePostgresAssignedProfessionalForAuth(app: FastifyInstance, auth: AuthContext) {
  return getLegalCaseRepository(app).getProfessionalByUserId(auth.tenantId, auth.userId)
}

function readHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }

  return value ?? ''
}

function createAnonymousSignalActorId(request: FastifyRequest, entityId: string, scope: string) {
  const userAgent = readHeaderValue(request.headers['user-agent']).slice(0, 160)
  const acceptLanguage = readHeaderValue(request.headers['accept-language']).slice(0, 64)
  const accept = readHeaderValue(request.headers.accept).slice(0, 64)
  const dayBucket = new Date().toISOString().slice(0, 10)
  const digest = createHmac('sha256', getJwtSecret())
    .update([entityId, scope, request.ip || 'unknown', userAgent, acceptLanguage, accept, dayBucket].join('|'), 'utf-8')
    .digest('hex')

  return `anon:${digest.slice(0, 24)}`
}

function resolveSocialActor(request: FastifyRequest, entityId: string, scope: string): ResolvedSocialActor {
  const auth = getRequestAuth(request)
  if (auth) {
    const actorId = buildLegacyOwnerId(auth.userId, auth.tenantId)
    return {
      actorId: scope === 'viewer-state' ? actorId : `${actorId}:${scope}`,
      kind: 'authenticated',
    }
  }

  return {
    actorId: createAnonymousSignalActorId(request, entityId, scope),
    kind: 'anonymous',
  }
}

function resolveSignalTrackingScope(type: string) {
  if (type === 'viewed') {
    return 'signal:viewed'
  }

  return `signal:${type}`
}

function isSignalAllowedForActor(type: string, actor: ResolvedSocialActor) {
  if (actor.kind === 'anonymous') {
    return type === 'viewed'
  }

  return ['viewed', 'interacted', 'shared', 'followed'].includes(type)
}

function resolveSignalWeight(type: string, actor: ResolvedSocialActor) {
  if (type === 'followed') {
    return 0.78
  }

  if (type === 'shared') {
    return 0.64
  }

  if (type === 'interacted') {
    return 0.34
  }

  if (type === 'viewed') {
    return actor.kind === 'authenticated' ? 0.08 : 0.04
  }

  return 0.18
}

function resolveSignalWindowMs(type: string, actor: ResolvedSocialActor) {
  if (type === 'followed') {
    return 365 * 24 * 60 * 60_000
  }

  if (type === 'shared') {
    return actor.kind === 'authenticated' ? 15 * 60_000 : 60 * 60_000
  }

  if (type === 'interacted') {
    return actor.kind === 'authenticated' ? 10 * 60_000 : 30 * 60_000
  }

  return actor.kind === 'authenticated' ? 60 * 60_000 : 6 * 60 * 60_000
}

function resolveSignalMaxWithinWindow(type: string, actor: ResolvedSocialActor) {
  if (type === 'followed') {
    return 1
  }

  if (type === 'shared') {
    return actor.kind === 'authenticated' ? 1 : 0
  }

  if (type === 'interacted') {
    return actor.kind === 'authenticated' ? 3 : 0
  }

  return 1
}

function buildServerValidatedSignalMetadata(metadata: Record<string, unknown> | undefined, actor: ResolvedSocialActor) {
  return {
    ...(metadata ?? {}),
    _signalTrust: actor.kind,
    _signalResolvedBy: 'server',
  }
}

function isAllowedInteractionType(type: string) {
  return ['mention', 'collaboration', 'reaction', 'suggestion'].includes(type)
}

function isAllowedExportFormat(value: string) {
  return /^[a-z0-9_-]{1,32}$/i.test(value)
}

function sanitizeLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.min(parsed, max)
}

function readArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function resolveMemoryUsageFromEntityDocument(entity?: EntityProfileDocument | EntityProfile | null) {
  if (!entity || !isPlainObject(entity)) {
    return 0
  }

  const relational = isPlainObject(entity.relational) ? entity.relational : null
  if (!relational) {
    return 0
  }

  const userMemory = isPlainObject(relational.userMemory) ? relational.userMemory : null
  const timelineLog = isPlainObject(relational.timelineLog) ? relational.timelineLog : null

  const preferences = readArrayLength(userMemory?.knownPreferences)
  const interactions = readArrayLength(userMemory?.lastInteractions)
  const timelineEntries = readArrayLength(timelineLog?.entries)

  return preferences + interactions + timelineEntries
}

function validateCreateEntityBody(body: CreateEntityBody) {
  if (!body.entityInput) {
    return 'entityInput is required.'
  }

  if (!body.entityInput.brand) {
    return 'entityInput.brand is required.'
  }

  if (!body.entityInput.context?.styleAnswers) {
    return 'entityInput.context.styleAnswers is required.'
  }

  if (!body.entityInput.palette?.primary || !body.entityInput.palette?.contrast) {
    return 'entityInput.palette.primary and entityInput.palette.contrast are required.'
  }

  if (body.requestId && !isSafeIdentifier(body.requestId)) {
    return 'requestId is invalid.'
  }

  return null
}

export async function registerEntityRoutes(app: FastifyInstance) {
  const listAuthenticatedOwnerEntities = async (request: FastifyRequest) => {
    const auth = getRequestAuth(request)!
    const repository = getRepository(app)
    const entities = await repository.getEntitiesByOwnerUserId(auth.userId, auth.tenantId)

    return {
      status: 'ready' as const,
      userId: auth.userId,
      tenantId: auth.tenantId,
      entities: entities.map((entity) => ({
        entityId: entity.id,
        status: 'ready',
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        entity: entity.entityProfile,
      })),
    }
  }

  // Authenticated owner-scoped listing and billing surfaces.
  app.get('/entities', { preHandler: requireAuth }, async (
    request,
    reply,
  ) => {
    const auth = getRequestAuth(request)!
    const ownerContext = resolveAuthenticatedOwnerContext(auth)

    reply.header('Deprecation', 'true')
    reply.header('Link', '</me/entities>; rel="successor-version"')

    const payload = await listAuthenticatedOwnerEntities(request)

    return {
      status: payload.status,
      ownerId: ownerContext.ownerId,
      authOwnerContext: {
        userId: auth.userId,
        tenantId: auth.tenantId,
      },
      compatibility: {
        canonicalEndpoint: '/me/entities',
        ignoresClientOwnerId: true,
      },
      entities: payload.entities,
    }
  })

  app.get('/me/entities', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return listAuthenticatedOwnerEntities(request)
  })

  app.get('/me/monetization', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = getRequestAuth(request)!
    const entityId = typeof (request.query as { entityId?: string } | undefined)?.entityId === 'string'
      ? (request.query as { entityId?: string }).entityId
      : undefined
    const ownedEntityResult = entityId ? await getOwnedEntityForAuth(app, entityId, auth) : null

    if (ownedEntityResult?.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (ownedEntityResult?.status === 'forbidden') {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_DENIED',
          message: 'You do not own this entity.',
        },
      })
    }

    const entity = ownedEntityResult?.status === 'owned' ? ownedEntityResult.entity : null
    const monetization = await getMonetizationService(app).getEntitlements({
      userId: auth.userId,
      tenantId: auth.tenantId,
      entityId,
      entity: (entity?.entityProfile ?? null) as EntityProfile | null,
    })

    return {
      status: 'ready',
      entityId,
      ...monetization,
    }
  })

  // Entity administration routes. Full EntityProfile and internal state never leave these owner-only handlers.
  app.post<{ Body: CreateEntityBody }>('/entity/create', { preHandler: requireAuth }, async (request, reply) => {
    const validationError = validateCreateEntityBody(request.body)

    if (validationError) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_ENTITY_INPUT',
          message: validationError,
        },
      })
    }

    const requestId = request.body.requestId ?? createRequestId()
    const engineResult = await processBrandInBackendEngine({
      requestId,
      entityInput: request.body.entityInput,
      manifestation: request.body.manifestation,
      runtimeControl: request.body.runtimeControl,
    })

    if (engineResult.status === 'failed') {
      return reply.status(422).send(engineResult)
    }

    const auth = getRequestAuth(request)!
    const ownerContext = resolveAuthenticatedOwnerContext(auth)
    const entity = applyOwnerContextToEntityProfile({
      ...(engineResult.entity as EntityProfileDocument),
    }, ownerContext)
    const entityId = String(entity.id)
    const storedResult = await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.create',
      commandId: `entity-create:${entityId}:${requestId}`,
      entityId,
      ownerId: ownerContext.ownerId,
      ownerUserId: ownerContext.ownerUserId,
      ownerTenantId: ownerContext.ownerTenantId,
      entityProfile: entity,
      now: new Date().toISOString(),
      event: {
        type: 'entity.created',
        timestamp: new Date().toISOString(),
        payload: {
          requestId,
          ownerId: ownerContext.ownerId,
          ownerUserId: ownerContext.ownerUserId,
          ownerTenantId: ownerContext.ownerTenantId,
        },
      },
    }) as EntityMutationResult
    const stored = storedResult.entity!
    await getGlobalFeedEngine(app).publishFeedItem({
      entityId,
      ownerId: ownerContext.ownerId,
      type: 'entity_created',
      timestamp: stored.createdAt,
      relevanceScore: 0.72,
      content: {
        entityName: String((entity.finalForm as Record<string, unknown> | undefined)?.identity && (((entity.finalForm as Record<string, unknown>).identity as Record<string, unknown>).name ?? entityId)),
        summary: 'A new entity entered the system.',
        requestId,
      },
    })
    request.log.info({
      event: 'entity.created',
      traceId: request.traceId ?? request.id,
      entityId,
      ownerUserId: ownerContext.ownerUserId,
      ownerTenantId: ownerContext.ownerTenantId,
      requestId,
    }, 'Entity created')
    ;(app as FastifyInstance & BackendContext).backendContext.observability.increment('entities_created')
    await getMonetizationService(app).ensureEntityBaseline({
      entityId,
      ownerUserId: ownerContext.ownerUserId,
      ownerTenantId: ownerContext.ownerTenantId,
      entitiesCount: (await getRepository(app).getEntitiesByOwnerUserId(ownerContext.ownerUserId, ownerContext.ownerTenantId)).length,
      memoryUsage: resolveMemoryUsageFromEntityDocument(entity),
    })
    await getGrowthEngine(app).trackEvent({
      entityId,
      ownerId: ownerContext.ownerId,
      type: 'entity_created',
      metadata: {
        requestId,
      },
    })
    if (request.body.referralId) {
      await getGrowthEngine(app).markEntityCreatedFromReferral(request.body.referralId, entityId)
    }

    return reply.status(201).send({
      entityId,
      ownerId: ownerContext.ownerId,
      ownerUserId: ownerContext.ownerUserId,
      ownerTenantId: ownerContext.ownerTenantId,
      requestId,
      status: 'ready',
      entity: stored.entityProfile,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    })
  })

  app.get<{ Params: { id: string } }>('/entity/:id', { preHandler: [requireAuth, requireEntityOwner] }, async (request) => {
    const entity = request.entityRecord!

    return {
      status: 'ready',
      entityId: entity.id,
      ownerId: entity.ownerId,
      ownerUserId: entity.ownerUserId,
      ownerTenantId: entity.ownerTenantId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      entity: entity.entityProfile,
    }
  })

  app.get<{ Params: { id: string } }>('/entity/:id/business-config', { preHandler: publicReadRateLimit }, async (request, reply) => {
    const entity = await getRepository(app).getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const businessConfig = readEntityBusinessConfig(entity.entityProfile as EntityProfile)

    return {
      status: 'ready',
      entityId: request.params.id,
      businessConfig: businessConfig ?? null,
    }
  })

  app.post<{ Params: { id: string }; Body: BusinessConfigBody }>('/entity/:id/business-config', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    const entity = request.entityRecord!
    const patch = request.body?.businessConfig

    if (!patch || !isPlainObject(patch)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_BUSINESS_CONFIG',
          message: 'businessConfig is required.',
        },
      })
    }

    const currentBusinessConfig = readEntityBusinessConfig(entity.entityProfile as EntityProfile)
    const mergedBusinessConfig = mergeBusinessConfig(currentBusinessConfig, patch)
    const validationError = validateBusinessConfig(mergedBusinessConfig)

    if (validationError) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_BUSINESS_CONFIG',
          message: validationError,
        },
      })
    }

    const nextEntityProfile = writeEntityBusinessConfig(entity.entityProfile as EntityProfile, mergedBusinessConfig)
    const updated = (await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-business-config:${request.params.id}:${createRequestId()}`,
      entityId: request.params.id,
      entityProfile: nextEntityProfile,
    }) as EntityMutationResult).entity

    if (!updated) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    return {
      status: 'ready',
      entityId: request.params.id,
      businessConfig: readEntityBusinessConfig(updated.entityProfile as EntityProfile) ?? null,
      updatedAt: updated.updatedAt,
    }
  })

  app.get<{ Params: { id: string } }>('/entity/:id/connections', { preHandler: [requireAuth, requireEntityOwner] }, async (request) => {
    const connections = await getRelationshipEngine(app).getConnections(request.params.id)
    return {
      status: 'ready',
      entityId: request.params.id,
      connections,
    }
  })

  app.post<{
      Params: { id: string }
      Body: {
        targetEntityId?: string
        type?: 'mention' | 'collaboration' | 'reaction' | 'suggestion'
        summary?: string
        body?: string
        topics?: string[]
        weight?: number
        commandId?: string
      }
    }>('/entity/:id/interactions/entity', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    const sourceEntityId = request.params.id
    const targetEntityId = request.body.targetEntityId
    const type = request.body.type ?? 'mention'
    if (!targetEntityId || !isSafeIdentifier(targetEntityId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_TARGET_ENTITY',
          message: 'targetEntityId is required.',
        },
      })
    }
    if (!isAllowedInteractionType(type)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_INTERACTION_TYPE',
          message: 'Unsupported interaction type.',
        },
      })
    }
    if (request.body.summary && !isSafeString(request.body.summary, 280)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_INTERACTION_SUMMARY',
          message: 'summary is invalid.',
        },
      })
    }

    const repository = getRepository(app)
    const [sourceEntity, targetEntity] = await Promise.all([
      Promise.resolve(request.entityRecord ?? null),
      repository.getEntityById(targetEntityId),
    ])

    if (!sourceEntity || !targetEntity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: 'Source or target entity was not found.',
        },
      })
    }

    const at = new Date().toISOString()
    const relationType = mapInteractionToRelationType(type)
    const strengthDelta = resolveInteractionStrength(type, request.body.weight)

    const summary =
      request.body.summary ??
      `${String((sourceEntity.entityProfile.social as Record<string, unknown>).publicName ?? sourceEntityId)} interacted with ${String((targetEntity.entityProfile.social as Record<string, unknown>).publicName ?? targetEntityId)} via ${type}.`
    const recorded = await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.relationship.interaction.record',
      commandId: request.body.commandId ?? `entity-relationship-interaction:${sourceEntityId}:${targetEntityId}:${at}`,
      sourceEntityId,
      targetEntityId,
      relationType,
      reverseRelationType: type === 'suggestion' ? 'affinity' : relationType,
      strengthDelta,
      reverseStrengthDelta: Math.max(0.08, strengthDelta * 0.72),
      interactionType: type,
      summary,
      topics: request.body.topics ?? ['entity-to-entity', type],
      occurredAt: at,
      sourceOwnerId: sourceEntity.ownerId,
      targetOwnerId: targetEntity.ownerId,
      sourceEntityName: String((sourceEntity.entityProfile.social as Record<string, unknown>).publicName ?? sourceEntityId),
      targetEntityName: String((targetEntity.entityProfile.social as Record<string, unknown>).publicName ?? targetEntityId),
    }) as EntityRelationshipInteractionResult

    return {
      status: 'ready',
      interaction: {
        sourceEntityId,
        targetEntityId,
        type,
        summary,
        timestamp: at,
      },
      relationships: {
        sourceToTarget: recorded.relationships.sourceToTarget,
        targetToSource: recorded.relationships.targetToSource,
      },
      events: {
        source: recorded.events.source,
        target: recorded.events.target,
      },
      feedItem: recorded.feedItem,
    }
  })

  // Public entity projection. Only the mapped public profile is exposed here.
  app.get<{ Params: { id: string } }>('/entity/:id/public', { preHandler: publicReadRateLimit }, async (request, reply) => {
    const repository = getRepository(app)
    const cache = getPublicCacheService(app)
    const cacheKey = `entity-public:${request.params.id}`

    const payload = await cache.getOrSet(cacheKey, 30_000, async () => {
      const entity = await repository.getEntityById(request.params.id)
      if (!entity) {
        return null
      }

      const eventLogRepository = getEventLogRepository(app)
      const exportRepository = getEntityExportRepository(app)
      const [events, exports] = await Promise.all([
        eventLogRepository.getRecentEvents(request.params.id, 100),
        exportRepository.getExports(request.params.id),
      ])

      return {
        status: 'ready',
        entityId: request.params.id,
        publicProfile: mapEntityProfileToPublicProfile({
          entity: entity.entityProfile,
          events,
          exports,
        }),
      }
    })

    if (!payload) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    return payload
  })

  app.post<{ Params: { id: string } }>('/entity/:id/rebrand/diagnose', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    const entityRecord = request.entityRecord
    if (!entityRecord) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const entityProfile = entityRecord.entityProfile as EntityProfile
    const signals = await buildDiagnosisSignals({
      app,
      entityRecord: {
        id: entityRecord.id,
        entityProfile,
      },
    })
    const diagnosis = buildDiagnosisArtifact({
      entityId: request.params.id,
      entityProfile,
      presence: signals.presence,
      runtime: signals.runtime,
      dashboard: signals.dashboard,
      relationalTrace: signals.relationalTrace,
    })

    const updatedEntityProfile = writeDiagnosisArtifact(entityProfile, diagnosis)
    await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-rebrand-diagnose:${request.params.id}:${diagnosis.id}`,
      entityId: request.params.id,
      entityProfile: updatedEntityProfile,
    })

    return {
      status: 'ready',
      diagnosis,
    }
  })

  app.post<{ Params: { id: string }; Body: DiagnosisActionBody }>('/entity/:id/rebrand/approve', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    if (!request.body?.diagnosisId || !isSafeIdentifier(request.body.diagnosisId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_DIAGNOSIS_ACTION',
          message: 'diagnosisId is required.',
        },
      })
    }

    const entityRecord = request.entityRecord
    if (!entityRecord) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const update = updateDiagnosisStatus(entityRecord.entityProfile as EntityProfile, request.body.diagnosisId, 'approved')
    if (!update) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'DIAGNOSIS_NOT_FOUND',
          message: `Diagnosis "${request.body.diagnosisId}" was not found.`,
        },
      })
    }

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-rebrand-approve:${request.params.id}:${request.body.diagnosisId}`,
      entityId: request.params.id,
      entityProfile: update.entityProfile,
    })

    return {
      status: 'approved',
      diagnosis: update.diagnosis,
    }
  })

  app.post<{ Params: { id: string }; Body: DiagnosisActionBody }>('/entity/:id/rebrand/reject', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    if (!request.body?.diagnosisId || !isSafeIdentifier(request.body.diagnosisId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_DIAGNOSIS_ACTION',
          message: 'diagnosisId is required.',
        },
      })
    }

    const entityRecord = request.entityRecord
    if (!entityRecord) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const update = updateDiagnosisStatus(entityRecord.entityProfile as EntityProfile, request.body.diagnosisId, 'rejected')
    if (!update) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'DIAGNOSIS_NOT_FOUND',
          message: `Diagnosis "${request.body.diagnosisId}" was not found.`,
        },
      })
    }

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-rebrand-reject:${request.params.id}:${request.body.diagnosisId}`,
      entityId: request.params.id,
      entityProfile: update.entityProfile,
    })

    return {
      status: 'rejected',
      diagnosis: update.diagnosis,
    }
  })

  app.get<{ Params: { id: string } }>('/public/entity/:id/presence', { preHandler: publicReadRateLimit }, async (request, reply) => {
    const repository = getRepository(app)
    const cache = getPublicCacheService(app)
    const cacheKey = `entity-public-presence:${request.params.id}`

    const payload = await cache.getOrSet(cacheKey, 30_000, async () => {
      const entity = await repository.getEntityById(request.params.id)
      if (!entity) {
        return null
      }

      const eventLogRepository = getEventLogRepository(app)
      const exportRepository = getEntityExportRepository(app)
      const snapshotRepository = getOrchestratorSnapshotRepository(app)
      const relationalTraceRepository = getRelationalTraceRepository(app)
      const [events, exports, latestSnapshot, relationalTrace] = await Promise.all([
        eventLogRepository.getRecentEvents(request.params.id, 60),
        exportRepository.getExports(request.params.id),
        snapshotRepository.getLatestSnapshot(request.params.id),
        relationalTraceRepository.getEntityTraces(request.params.id, 12),
      ])
      const publicProfile = mapEntityProfileToPublicProfile({
        entity: entity.entityProfile,
        events,
        exports,
      })

      const presence = buildPublicPresenceResponse({
        entityId: request.params.id,
        entityProfile: entity.entityProfile as EntityProfile,
        publicProfile,
        latestSnapshot,
        recentEvents: events,
        relationalTrace,
        exports,
      })

      return {
        status: 'ready',
        entityId: request.params.id,
        presence: {
          ...presence,
          entity: {
            ...presence.entity,
            ownerTenantId: entity.ownerTenantId ?? undefined,
          },
        },
      }
    })

    if (!payload) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    return payload
  })

  app.post<{
      Params: { id: string }
      Body: {
        requestId?: string
        userMessage?: string
      }
    }>('/public/entity/:id/flowmind-shadow/evaluate', { preHandler: [optionalAuth, publicActionRateLimit] }, async (request, reply) => {
    const requestedUserMessage = request.body.userMessage

    if (request.body.requestId && !isSafeIdentifier(request.body.requestId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SHADOW_REQUEST',
          message: 'requestId is invalid.',
        },
      })
    }

    if (typeof requestedUserMessage !== 'string' || !isSafeString(requestedUserMessage, 1024)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SHADOW_REQUEST',
          message: 'userMessage is required.',
        },
      })
    }

    const userMessage = requestedUserMessage.trim()

    const entity = await getRepository(app).getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const requestId = request.body.requestId ?? createRequestId()
    const latestSnapshot = await getOrchestratorSnapshotRepository(app).getLatestSnapshot(request.params.id)
    const decision = await evaluatePublicFlowMindShadow({
      entityProfile: entity.entityProfile as EntityProfile,
      latestSnapshot,
      flowMindService: getFlowMindService(app),
      requestId,
      userMessage,
    })

    return {
      status: 'ready',
      entityId: request.params.id,
      requestId,
      enabled: decision !== undefined,
      decision,
    }
  })

  app.post<{
      Params: { id: string }
      Body: PublicEntityInteractionRequest
    }>('/public/entity/:id/interactions', { preHandler: [optionalAuth, publicActionRateLimit] }, async (request, reply) => {
    const startedAt = Date.now()

    if (!isPublicEntityInteractionRequestCandidate(request.body)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PUBLIC_INTERACTION',
          message: 'A valid public interaction payload is required.',
        },
      })
    }

    const entity = await getRepository(app).getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const flowMindService = getFlowMindService(app)
    const availability = resolvePublicEntityInteractionAvailability({
      entityProfile: entity.entityProfile as EntityProfile,
      flowMindService,
    })
    const availabilityReason = availability.reason ?? 'unknown'

    if (!availability.enabled) {
      getObservability(app).incrementMetric('public_entity_interaction_unavailable_total', 1, {
        reason: availabilityReason,
      })
      getObservability(app).recordTiming('public_entity_interaction_unavailable_ms', Date.now() - startedAt, {
        reason: availabilityReason,
      })

      return reply.status(503).send({
        status: 'failed',
        error: {
          code: 'PUBLIC_INTERACTION_DISABLED',
          message: 'Public interaction is temporarily unavailable for this entity.',
          reason: availabilityReason,
        },
      })
    }

    const eventLogRepository = getEventLogRepository(app)
    const exportRepository = getEntityExportRepository(app)
    const snapshotRepository = getOrchestratorSnapshotRepository(app)
    const relationalTraceRepository = getRelationalTraceRepository(app)
    const [events, exports, latestSnapshot, relationalTrace] = await Promise.all([
      eventLogRepository.getRecentEvents(request.params.id, 60),
      exportRepository.getExports(request.params.id),
      snapshotRepository.getLatestSnapshot(request.params.id),
      relationalTraceRepository.getEntityTraces(request.params.id, 12),
    ])
    const publicProfile = mapEntityProfileToPublicProfile({
      entity: entity.entityProfile,
      events,
      exports,
    })
    const publicPresence = buildPublicPresenceResponse({
      entityId: request.params.id,
      entityProfile: entity.entityProfile as EntityProfile,
      publicProfile,
      latestSnapshot,
      recentEvents: events,
      relationalTrace,
      exports,
    })
    const requestId = request.body.requestId ?? createRequestId()
    const interaction = await resolvePublicEntityInteraction({
      entityId: request.params.id,
      entityProfile: entity.entityProfile as EntityProfile,
      latestSnapshot,
      flowMindService,
      requestId,
      userMessage: request.body.userMessage.trim(),
      businessContext: request.body.businessContext,
      currentRelationshipLabel: publicPresence.relational.relationshipLabel,
      currentPresenceIntensity: publicPresence.visual.intensity,
      allowDebug: request.body.context?.allowDebug === true,
    })

    if (!interaction) {
      getObservability(app).incrementMetric('public_entity_interaction_failed_total', 1, {
        reason: 'backend-decision-unavailable',
      })
      getObservability(app).recordTiming('public_entity_interaction_failed_ms', Date.now() - startedAt, {
        reason: 'backend-decision-unavailable',
      })

      return reply.status(503).send({
        status: 'failed',
        error: {
          code: 'PUBLIC_INTERACTION_UNAVAILABLE',
          message: 'Backend decision is temporarily unavailable.',
        },
      })
    }

    const executionDecision = resolvePublicInteractionExecutionDecision({
      entityProfile: entity.entityProfile as EntityProfile,
      userMessage: request.body.userMessage.trim(),
      businessContext: request.body.businessContext,
      flowMindDecision: interaction.decision.decision,
    })
    const actor = resolveSocialActor(request, request.params.id, 'case:create')
    const auth = getRequestAuth(request)

    const actionResult = await executePublicInteractionAction({
      entityId: request.params.id,
      entityProfile: entity.entityProfile as EntityProfile,
      repository: getRepository(app),
      decision: executionDecision,
      initialUserMessage: request.body.userMessage.trim(),
      creatorActorId: actor.actorId,
      creatorUserId: auth?.userId,
      creatorTenantId: auth?.tenantId,
      now: interaction.telemetry.evaluatedAt,
    })

    const responseText = buildPublicInteractionActionResponseText({
      entityName: publicPresence.entity.name,
      baseResponseText: interaction.decision.responseText,
      actionDecision: executionDecision,
      actionResult,
    })

    const interactionWithAction = {
      ...interaction,
      decision: {
        ...interaction.decision,
        responseText,
      },
      actionResult,
    }

    getObservability(app).incrementMetric('public_entity_interaction_total', 1, {
      source: interactionWithAction.fallback.source,
      fallback: String(interactionWithAction.fallback.occurred),
      action: actionResult.actionType,
    })
    getObservability(app).recordTiming('public_entity_interaction_latency_ms', interactionWithAction.telemetry.latencyMs, {
      source: interactionWithAction.fallback.source,
      fallback: String(interactionWithAction.fallback.occurred),
      action: actionResult.actionType,
    })

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'public.interaction.resolve',
      commandId: `public-interaction-resolved:${request.params.id}:${interactionWithAction.requestId}`,
      entityId: request.params.id,
      occurredAt: interactionWithAction.telemetry.evaluatedAt,
      payload: {
        requestId: interactionWithAction.requestId,
        message: request.body.userMessage.trim(),
        latencyMs: interactionWithAction.telemetry.latencyMs,
        fallbackOccurred: interactionWithAction.fallback.occurred,
        fallbackSource: interactionWithAction.fallback.source,
        fallbackReason: interactionWithAction.fallback.reason,
        decisionIntent: interactionWithAction.decision.decision.intent,
        decisionAction: interactionWithAction.decision.decision.action,
        decisionConfidence: interactionWithAction.decision.decision.confidence,
        actionResult,
        businessType: request.body.businessContext?.businessType,
        businessContextApplied: request.body.businessContext !== undefined,
        clientRenderVersion: request.body.context?.clientRenderVersion,
        sessionId: request.body.context?.sessionId,
      },
    })

    return reply.status(200).send(interactionWithAction)
  })

  app.get<{ Params: { id: string } }>('/cases/:id', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
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

    const postgresCase = await resolvePostgresCaseForRead({
      app,
      request,
      auth,
      caseId: request.params.id,
    })

    if (postgresCase) {
      trackCaseRouteMetric(app, 'postgres_case_hit', 'GET /cases/:id')
      if (!postgresCase.hasAccess) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_ACCESS_FORBIDDEN',
            message: 'You do not have access to this case.',
          },
        })
      }

      return reply.status(200).send({
        status: 'ready',
        case: postgresCase.legalCase,
      })
    }

    trackCaseRouteMetric(app, 'legacy_case_fallback', 'GET /cases/:id')

    const found = await resolveCaseForAuthenticatedAccess({
      app,
      request,
      caseId: request.params.id,
    })

    if (!found) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const access = resolveLegacyCaseParticipantAccess({ auth, legalCase: found.legalCase, entity: found.entity })
    logCasesAuthDebug({
      request,
      auth,
      caseTenantId: found.legalCase.creatorTenantId,
      createdByUserId: found.legalCase.creatorUserId,
      createdByTenantId: found.legalCase.creatorTenantId,
      entityOwnerUserId: found.entity.ownerUserId,
      entityOwnerTenantId: found.entity.ownerTenantId,
      assignedLawyerId: found.legalCase.assignedLawyerId,
      isClient: access.isClient,
      isOwner: access.isOwner,
      isLawyer: access.isLawyer,
      accessAllowed: access.accessAllowed,
    })
    if (!access.accessAllowed) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_ACCESS_FORBIDDEN',
          message: 'You do not have access to this case.',
        },
      })
    }

    return reply.status(200).send({
      status: 'ready',
      case: found.legalCase,
    })
  })

  app.get<{ Querystring: CasesQuerystring }>('/cases', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    if (!isSafeIdentifier(request.query.entityId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASES_QUERY',
          message: 'A valid entityId query parameter is required.',
        },
      })
    }

    const entityId = request.query.entityId as string
    const traceId = request.traceId ?? request.id
    const auth = getRequestAuth(request)
    const tenantId = auth?.tenantId

    // SQL diagnostics (manual checks when debugging production incidents):
    // 1) SELECT to_regclass(current_schema() || '.cases') AS cases_table,
    //           to_regclass(current_schema() || '.case_messages') AS case_messages_table,
    //           to_regclass(current_schema() || '.case_timeline') AS case_timeline_table;
    // 2) SELECT id FROM entity_profile WHERE id = $1;
    //    -- then validate entity_profile JSON payload for the same entityId if needed.

    let ownerEntity: Awaited<ReturnType<ReturnType<typeof getRepository>['getEntityById']>> | null = null
    try {
      ownerEntity = await getRepository(app).getEntityById(entityId)
    } catch (error) {
      request.log.error({
        event: 'cases.owner_entity_read_failed',
        traceId,
        entityId,
        tenantId,
        message: error instanceof Error ? error.message : 'Failed to read owner entity.',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Owner entity lookup failed unexpectedly while reading cases')
      return reply.status(500).send({
        status: 'failed',
        error: {
          code: 'ENTITY_CASES_OWNER_LOOKUP_FAILED',
          message: 'Failed to load entity cases.',
        },
      })
    }

    if (!ownerEntity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${entityId}" was not found.`,
        },
      })
    }

    if (!auth || !validateEntityOwnership(ownerEntity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_FORBIDDEN',
          message: 'You do not have access to this entity cases list.',
        },
      })
    }

    let postgresCases: CaseRecord[] = []
    let postgresListFailed = false
    try {
      postgresCases = await getLegalCaseRepository(app).listCasesByEntity(auth.tenantId, entityId)
    } catch (error) {
      postgresListFailed = true
      request.log.error({
        event: 'cases.postgres_list_failed',
        traceId,
        entityId,
        tenantId: auth.tenantId,
        message: error instanceof Error ? error.message : 'Failed to list Postgres cases.',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Postgres case listing failed, attempting legacy fallback')
    }

    if (!postgresListFailed && postgresCases.length > 0) {
      trackCaseRouteMetric(app, 'postgres_case_hit', 'GET /cases')
      try {
        const normalizedCases = await Promise.all(postgresCases.map(async (caseRecord) => {
          try {
            const [messages, timeline] = await Promise.all([
              getLegalCaseRepository(app).listMessages(auth.tenantId, caseRecord.id),
              listPostgresCaseTimeline(getConnection(app), auth.tenantId, caseRecord.id),
            ])

            return toLegacyCompatibleCase({
              tenantId: auth.tenantId,
              caseRecord,
              messages,
              timeline,
            })
          } catch (error) {
            request.log.error({
              event: 'cases.postgres_normalization_failed',
              traceId,
              entityId,
              tenantId: auth.tenantId,
              caseId: caseRecord.id,
              message: error instanceof Error ? error.message : 'Failed to normalize Postgres case.',
              stack: error instanceof Error ? error.stack : undefined,
            }, 'Failed to normalize one Postgres case, skipping record')
            return null
          }
        }))

        const safeCases = normalizedCases.filter((item): item is LegacyCompatibleCaseRecord => Boolean(item))
        if (safeCases.length > 0) {
          return reply.status(200).send({
            status: 'ready',
            entityId: request.query.entityId,
            cases: safeCases,
          })
        }
      } catch (error) {
        request.log.error({
          event: 'cases.postgres_normalization_failed',
          traceId,
          entityId,
          tenantId: auth.tenantId,
          message: error instanceof Error ? error.message : 'Failed to normalize Postgres case list.',
          stack: error instanceof Error ? error.stack : undefined,
        }, 'Postgres case normalization failed, attempting legacy fallback')
      }
    }

    trackCaseRouteMetric(app, 'legacy_case_fallback', 'GET /cases')
    try {
      const resolvedLegacy = await getEntityLegalCases({
        repository: getRepository(app),
        entityId,
      })

      return reply.status(200).send({
        status: 'ready',
        entityId: request.query.entityId,
        cases: resolvedLegacy?.cases ?? [],
      })
    } catch (error) {
      trackCaseRouteMetric(app, 'legacy_case_fallback_error', 'GET /cases')
      request.log.error({
        event: 'cases.legacy_fallback_failed',
        traceId,
        entityId,
        tenantId: auth.tenantId,
        message: error instanceof Error ? error.message : 'Failed to read legacy fallback cases.',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Legacy fallback failed while reading cases')

      return reply.status(500).send({
        status: 'failed',
        error: {
          code: 'ENTITY_CASES_READ_FAILED',
          message: 'Failed to load entity cases.',
        },
      })
    }
  })

  app.get('/marketplace/legal/cases', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
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

    const traceId = request.traceId ?? request.id
    const marketplaceAccess = await resolveMarketplaceCasesAccess({
      app,
      auth,
    })

    if (!marketplaceAccess.marketplaceEntity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${marketplaceAccess.marketplaceEntityId}" was not found.`,
        },
      })
    }

    if (!marketplaceAccess.hasAccess) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'MARKETPLACE_CASES_ACCESS_FORBIDDEN',
          message: 'You do not have access to the marketplace legal cases list.',
        },
      })
    }

    const rawMarketplaceTenantId = marketplaceAccess.marketplaceEntity.ownerTenantId
    if (typeof rawMarketplaceTenantId !== 'number' || !Number.isInteger(rawMarketplaceTenantId) || rawMarketplaceTenantId <= 0) {
      return reply.status(500).send({
        status: 'failed',
        error: {
          code: 'MARKETPLACE_CASES_TENANT_INVALID',
          message: 'Failed to resolve marketplace legal cases tenant.',
        },
      })
    }
    const marketplaceTenantId = Number(rawMarketplaceTenantId)

    let postgresCases: CaseRecord[] = []
    let postgresListFailed = false
    try {
      postgresCases = await getLegalCaseRepository(app).listCasesByEntity(
        marketplaceTenantId,
        marketplaceAccess.marketplaceEntityId,
      )
    } catch (error) {
      postgresListFailed = true
      request.log.error({
        event: 'marketplace_cases.postgres_list_failed',
        traceId,
        entityId: marketplaceAccess.marketplaceEntityId,
        tenantId: marketplaceTenantId,
        message: error instanceof Error ? error.message : 'Failed to list marketplace Postgres cases.',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Marketplace Postgres case listing failed, attempting legacy fallback')
    }

    if (!postgresListFailed && postgresCases.length > 0) {
      try {
        const normalizedCases = await Promise.all(postgresCases.map(async (caseRecord) => {
          try {
            const [messages, timeline] = await Promise.all([
              getLegalCaseRepository(app).listMessages(marketplaceTenantId, caseRecord.id),
              listPostgresCaseTimeline(getConnection(app), marketplaceTenantId, caseRecord.id),
            ])

            return toLegacyCompatibleCase({
              tenantId: marketplaceTenantId,
              caseRecord,
              messages,
              timeline,
            })
          } catch (error) {
            request.log.error({
              event: 'marketplace_cases.postgres_normalization_failed',
              traceId,
              entityId: marketplaceAccess.marketplaceEntityId,
              tenantId: marketplaceTenantId,
              caseId: caseRecord.id,
              message: error instanceof Error ? error.message : 'Failed to normalize marketplace Postgres case.',
              stack: error instanceof Error ? error.stack : undefined,
            }, 'Failed to normalize one marketplace Postgres case, skipping record')
            return null
          }
        }))

        const safeCases = normalizedCases.filter((item): item is LegacyCompatibleCaseRecord => Boolean(item))
        if (safeCases.length > 0) {
          return reply.status(200).send({
            status: 'ready',
            entityId: marketplaceAccess.marketplaceEntityId,
            cases: safeCases,
          })
        }
      } catch (error) {
        request.log.error({
          event: 'marketplace_cases.postgres_normalization_failed',
          traceId,
          entityId: marketplaceAccess.marketplaceEntityId,
          tenantId: marketplaceTenantId,
          message: error instanceof Error ? error.message : 'Failed to normalize marketplace Postgres case list.',
          stack: error instanceof Error ? error.stack : undefined,
        }, 'Marketplace Postgres case normalization failed, attempting legacy fallback')
      }
    }

    try {
      const resolvedLegacy = await getEntityLegalCases({
        repository: getRepository(app),
        entityId: marketplaceAccess.marketplaceEntityId,
      })

      return reply.status(200).send({
        status: 'ready',
        entityId: marketplaceAccess.marketplaceEntityId,
        cases: resolvedLegacy?.cases ?? [],
      })
    } catch (error) {
      request.log.error({
        event: 'marketplace_cases.legacy_fallback_failed',
        traceId,
        entityId: marketplaceAccess.marketplaceEntityId,
        tenantId: marketplaceTenantId,
        message: error instanceof Error ? error.message : 'Failed to read marketplace legacy fallback cases.',
        stack: error instanceof Error ? error.stack : undefined,
      }, 'Marketplace legacy fallback failed while reading cases')

      return reply.status(500).send({
        status: 'failed',
        error: {
          code: 'MARKETPLACE_CASES_READ_FAILED',
          message: 'Failed to load marketplace legal cases.',
        },
      })
    }
  })

  app.get<{ Params: { entityId: string; lawyerId: string } }>('/entities/:entityId/lawyers/:lawyerId/reputation', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
    if (!isSafeIdentifier(request.params.entityId) || !isSafeIdentifier(request.params.lawyerId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_LAWYER_REPUTATION_QUERY',
          message: 'A valid entityId and lawyerId are required.',
        },
      })
    }

    const resolved = await getEntityLegalCases({
      repository: getRepository(app),
      entityId: request.params.entityId,
    })

    if (!resolved) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.entityId}" was not found.`,
        },
      })
    }

    const auth = getRequestAuth(request)
    if (!auth || !validateEntityOwnership(resolved.entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'ENTITY_ACCESS_FORBIDDEN',
          message: 'Only the entity owner can access lawyer reputation.',
        },
      })
    }

    const metrics = buildLawyerReputationMetrics(resolved.cases, request.params.lawyerId)

    return reply.status(200).send({
      status: 'ready',
      entityId: request.params.entityId,
      lawyerId: request.params.lawyerId,
      reputation: {
        assignedCases: metrics.assignedCases,
        closedCases: metrics.closedCases,
        averageRating: metrics.averageRating,
        ratingCount: metrics.ratingCount,
        averageFirstResponseMinutes: metrics.averageFirstResponseMinutes,
        mockRevenueCents: metrics.mockRevenueCents,
        closureRate: metrics.closureRate,
      },
    })
  })

  app.get<{ Params: { id: string } }>('/cases/:id/messages', { preHandler: [requireAuth, publicReadRateLimit] }, async (request, reply) => {
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

    const postgresCase = await resolvePostgresCaseForRead({
      app,
      request,
      auth,
      caseId: request.params.id,
    })

    if (postgresCase) {
      trackCaseRouteMetric(app, 'postgres_case_hit', 'GET /cases/:id/messages')
      if (!postgresCase.hasAccess) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_ACCESS_FORBIDDEN',
            message: 'You do not have access to this case.',
          },
        })
      }

      return reply.status(200).send({
        status: 'ready',
        caseId: postgresCase.legalCase.id,
        messages: postgresCase.messages,
      })
    }

    trackCaseRouteMetric(app, 'legacy_case_fallback', 'GET /cases/:id/messages')

    const found = await resolveCaseForAuthenticatedAccess({
      app,
      request,
      caseId: request.params.id,
    })

    if (!found) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const access = resolveLegacyCaseParticipantAccess({ auth, legalCase: found.legalCase, entity: found.entity })
    logCasesAuthDebug({
      request,
      auth,
      caseTenantId: found.legalCase.creatorTenantId,
      createdByUserId: found.legalCase.creatorUserId,
      createdByTenantId: found.legalCase.creatorTenantId,
      entityOwnerUserId: found.entity.ownerUserId,
      entityOwnerTenantId: found.entity.ownerTenantId,
      assignedLawyerId: found.legalCase.assignedLawyerId,
      isClient: access.isClient,
      isOwner: access.isOwner,
      isLawyer: access.isLawyer,
      accessAllowed: access.accessAllowed,
    })
    if (!access.accessAllowed) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_ACCESS_FORBIDDEN',
          message: 'You do not have access to this case.',
        },
      })
    }

    return reply.status(200).send({
      status: 'ready',
      caseId: found.legalCase.id,
      messages: found.legalCase.messages,
    })
  })

  app.post<{ Params: { id: string }; Body: CaseAssignBody }>('/cases/:id/assign', { preHandler: [requireAuth, publicActionRateLimit] }, async (request, reply) => {
    if (!isCaseAssignBodyCandidate(request.body)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_ASSIGNMENT',
          message: 'A valid lawyerId is required.',
        },
      })
    }

    const found = await findLegalCaseById({
      repository: getRepository(app),
      caseId: request.params.id,
    })

    if (!found) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const auth = getRequestAuth(request)
    if (!auth || !validateEntityOwnership(found.entity, auth.userId, auth.tenantId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_ASSIGNMENT_FORBIDDEN',
          message: 'Only the entity owner can assign this case.',
        },
      })
    }

    const assigned = await assignLegalCase({
      repository: getRepository(app),
      sovereignCommandService: getSovereignMutationCommandService(app),
      caseId: request.params.id,
      lawyerId: request.body.lawyerId!,
    })

    if (assigned.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    if (assigned.status === 'invalid_state') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'CASE_ASSIGNMENT_INVALID_STATE',
          message: 'Only open cases can be assigned.',
        },
        case: assigned.legalCase,
      })
    }

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'legal.case.assign',
      commandId: `legal-case-assigned:${assigned.entityId}:${assigned.legalCase.id}:${assigned.legalCase.updatedAt}`,
      entityId: assigned.entityId,
      occurredAt: assigned.legalCase.updatedAt,
      payload: {
        caseId: assigned.legalCase.id,
        lawyerId: request.body.lawyerId,
        status: assigned.legalCase.status,
      },
    })

    return reply.status(200).send({
      status: 'ready',
      case: assigned.legalCase,
    })
  })

  app.post<{ Params: { id: string }; Body: CaseMessageBody }>('/cases/:id/messages', { preHandler: [requireAuth, publicActionRateLimit] }, async (request, reply) => {
    if (!isCaseMessageBodyCandidate(request.body)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_MESSAGE',
          message: 'A valid case message payload is required.',
        },
      })
    }

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

    const caseMessageText = request.body.text?.trim() ?? ''
    const role = request.body.role ?? 'user'

    const postgresCase = await resolvePostgresCaseForRead({
      app,
      request,
      auth,
      caseId: request.params.id,
    })

    if (postgresCase) {
      trackCaseRouteMetric(app, 'postgres_case_hit', 'POST /cases/:id/messages')
      if (!postgresCase.hasAccess) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_ACCESS_FORBIDDEN',
            message: 'You do not have access to this case.',
          },
        })
      }

      const professional = await resolvePostgresAssignedProfessionalForAuth(app, auth)
      const canAnswerAsLawyer = role === 'lawyer'
        ? (isAssignedLawyer(auth, postgresCase.legalCase.assignedLawyerId)
          || (Boolean(professional?.id) && postgresCase.legalCase.assignedLawyerId === professional?.id))
        : true

      if (!canAnswerAsLawyer) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_LAWYER_NOT_ASSIGNED',
            message: 'Only the assigned lawyer can answer as lawyer.',
          },
        })
      }

      await getLegalCaseService(app).addMessage({
        tenantId: auth.tenantId,
        caseId: request.params.id,
        authorProfessionalId: role === 'lawyer' ? professional?.id : undefined,
        body: caseMessageText,
        direction: role === 'lawyer' ? 'outbound' : role === 'system' ? 'internal' : 'inbound',
        messageType: role === 'system' ? 'system' : 'chat',
        messageStatus: 'sent',
      })

      const [caseRecord, messages, timeline] = await Promise.all([
        getLegalCaseRepository(app).getCaseById(auth.tenantId, request.params.id),
        getLegalCaseRepository(app).listMessages(auth.tenantId, request.params.id),
        listPostgresCaseTimeline(getConnection(app), auth.tenantId, request.params.id),
      ])

      if (!caseRecord) {
        return reply.status(404).send({
          status: 'failed',
          error: {
            code: 'CASE_NOT_FOUND',
            message: `Case "${request.params.id}" was not found.`,
          },
        })
      }

      const normalized = toLegacyCompatibleCase({
        tenantId: auth.tenantId,
        caseRecord,
        messages,
        timeline,
      })
      const latestMessage = normalized.messages.at(-1)

      if (normalized.entityId) {
        await getSovereignMutationCommandService(app).submitCommand({
          type: 'legal.case.message.append',
          commandId: `legal-case-message:${normalized.entityId}:${normalized.id}:${latestMessage?.id ?? normalized.updatedAt}`,
          entityId: normalized.entityId,
          occurredAt: latestMessage?.createdAt ?? normalized.updatedAt,
          payload: {
            caseId: normalized.id,
            role,
            actorId: latestMessage?.actorId,
            messageId: latestMessage?.id,
          },
        })
      }

      return reply.status(200).send({
        status: 'ready',
        caseId: normalized.id,
        message: latestMessage,
        messages: normalized.messages,
      })
    }

    trackCaseRouteMetric(app, 'legacy_case_fallback', 'POST /cases/:id/messages')

    const found = await resolveCaseForAuthenticatedAccess({
      app,
      request,
      caseId: request.params.id,
    })

    if (!found) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const access = resolveLegacyCaseParticipantAccess({ auth, legalCase: found.legalCase, entity: found.entity })
    logCasesAuthDebug({
      request,
      auth,
      caseTenantId: found.legalCase.creatorTenantId,
      createdByUserId: found.legalCase.creatorUserId,
      createdByTenantId: found.legalCase.creatorTenantId,
      entityOwnerUserId: found.entity.ownerUserId,
      entityOwnerTenantId: found.entity.ownerTenantId,
      assignedLawyerId: found.legalCase.assignedLawyerId,
      isClient: access.isClient,
      isOwner: access.isOwner,
      isLawyer: access.isLawyer,
      accessAllowed: access.accessAllowed,
    })
    if (!access.accessAllowed) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_ACCESS_FORBIDDEN',
          message: 'You do not have access to this case.',
        },
      })
    }

    const actor = resolveSocialActor(request, found.entity.id, `case:${request.params.id}`)

    if (role === 'lawyer' && !isAssignedLawyer(auth, found.legalCase.assignedLawyerId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_LAWYER_NOT_ASSIGNED',
          message: 'Only the assigned lawyer can answer as lawyer.',
        },
      })
    }

    const appended = await appendLegalCaseMessage({
      repository: getRepository(app),
      sovereignCommandService: getSovereignMutationCommandService(app),
      caseId: request.params.id,
      role,
      text: request.body.text!.trim(),
      actorId: `${actor.actorId}:${role}`,
    })

    if (!appended) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'legal.case.message.append',
      commandId: `legal-case-message:${appended.entityId}:${appended.legalCase.id}:${appended.message.id}`,
      entityId: appended.entityId,
      occurredAt: appended.message.createdAt,
      payload: {
        caseId: appended.legalCase.id,
        role,
        actorId: `${actor.actorId}:${role}`,
        messageId: appended.message.id,
      },
    })

    return reply.status(200).send({
      status: 'ready',
      caseId: appended.legalCase.id,
      message: appended.message,
      messages: appended.legalCase.messages,
    })
  })

  app.post<{ Params: { id: string }; Body: Pick<CaseMessageBody, 'text'> }>('/cases/:id/respond', { preHandler: [requireAuth, publicActionRateLimit] }, async (request, reply) => {
    if (!isPlainObject(request.body) || !isSafeString(request.body.text, 4_000)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_MESSAGE',
          message: 'A valid response payload is required.',
        },
      })
    }

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

    const caseMessageText = request.body.text?.trim() ?? ''
    const postgresCase = await resolvePostgresCaseForRead({
      app,
      request,
      auth,
      caseId: request.params.id,
    })

    if (postgresCase) {
      trackCaseRouteMetric(app, 'postgres_case_hit', 'POST /cases/:id/respond')
      if (!postgresCase.hasAccess) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_ACCESS_FORBIDDEN',
            message: 'You do not have access to this case.',
          },
        })
      }

      const professional = await resolvePostgresAssignedProfessionalForAuth(app, auth)
      const canRespond = isAssignedLawyer(auth, postgresCase.legalCase.assignedLawyerId)
        || (Boolean(professional?.id) && postgresCase.legalCase.assignedLawyerId === professional?.id)

      if (!canRespond) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_LAWYER_NOT_ASSIGNED',
            message: 'Only the assigned lawyer can respond to this case.',
          },
        })
      }

      await getLegalCaseService(app).addMessage({
        tenantId: auth.tenantId,
        caseId: request.params.id,
        authorProfessionalId: professional?.id,
        body: caseMessageText,
        direction: 'outbound',
        messageType: 'chat',
        messageStatus: 'sent',
      })

      const [caseRecord, messages, timeline] = await Promise.all([
        getLegalCaseRepository(app).getCaseById(auth.tenantId, request.params.id),
        getLegalCaseRepository(app).listMessages(auth.tenantId, request.params.id),
        listPostgresCaseTimeline(getConnection(app), auth.tenantId, request.params.id),
      ])

      if (!caseRecord) {
        return reply.status(404).send({
          status: 'failed',
          error: {
            code: 'CASE_NOT_FOUND',
            message: `Case "${request.params.id}" was not found.`,
          },
        })
      }

      const normalized = toLegacyCompatibleCase({
        tenantId: auth.tenantId,
        caseRecord,
        messages,
        timeline,
      })
      const latestMessage = normalized.messages.at(-1)

      if (normalized.entityId) {
        await getSovereignMutationCommandService(app).submitCommand({
          type: 'legal.case.message.append',
          commandId: `legal-case-message:${normalized.entityId}:${normalized.id}:${latestMessage?.id ?? normalized.updatedAt}`,
          entityId: normalized.entityId,
          occurredAt: latestMessage?.createdAt ?? normalized.updatedAt,
          payload: {
            caseId: normalized.id,
            role: 'lawyer',
            actorId: latestMessage?.actorId,
            messageId: latestMessage?.id,
          },
        })
      }

      return reply.status(200).send({
        status: 'ready',
        caseId: normalized.id,
        message: latestMessage,
        messages: normalized.messages,
      })
    }

    trackCaseRouteMetric(app, 'legacy_case_fallback', 'POST /cases/:id/respond')

    const found = await findLegalCaseById({
      repository: getRepository(app),
      caseId: request.params.id,
    })

    if (!found) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    if (!isAssignedLawyer(auth, found.legalCase.assignedLawyerId)) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_LAWYER_NOT_ASSIGNED',
          message: 'Only the assigned lawyer can respond to this case.',
        },
      })
    }

    const actorId = found.legalCase.assignedLawyerId ?? String(auth?.userId ?? 'lawyer')
    const appended = await appendLegalCaseMessage({
      repository: getRepository(app),
      sovereignCommandService: getSovereignMutationCommandService(app),
      caseId: request.params.id,
      role: 'lawyer',
      text: caseMessageText,
      actorId,
    })

    if (!appended) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'legal.case.message.append',
      commandId: `legal-case-message:${appended.entityId}:${appended.legalCase.id}:${appended.message.id}`,
      entityId: appended.entityId,
      occurredAt: appended.message.createdAt,
      payload: {
        caseId: appended.legalCase.id,
        role: 'lawyer',
        actorId,
        messageId: appended.message.id,
      },
    })

    return reply.status(200).send({
      status: 'ready',
      caseId: appended.legalCase.id,
      message: appended.message,
      messages: appended.legalCase.messages,
    })
  })

  app.post<{ Params: { id: string }; Body: CaseCloseBody }>('/cases/:id/close', { preHandler: [requireAuth, publicActionRateLimit] }, async (request, reply) => {
    if (!isCaseCloseBodyCandidate(request.body)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_CASE_CLOSE',
          message: 'A valid case close payload is required.',
        },
      })
    }

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

    const postgresCase = await resolvePostgresCaseForRead({
      app,
      request,
      auth,
      caseId: request.params.id,
    })

    if (postgresCase) {
      trackCaseRouteMetric(app, 'postgres_case_hit', 'POST /cases/:id/close')
      if (!postgresCase.hasAccess) {
        return reply.status(403).send({
          status: 'failed',
          error: {
            code: 'CASE_ACCESS_FORBIDDEN',
            message: 'You do not have access to this case.',
          },
        })
      }

      const professional = await resolvePostgresAssignedProfessionalForAuth(app, auth)
      const closedCaseRecord = await getLegalCaseService(app).closeCase(
        auth.tenantId,
        request.params.id,
        request.body.feedback,
        professional?.id,
      )

      if (!closedCaseRecord) {
        return reply.status(404).send({
          status: 'failed',
          error: {
            code: 'CASE_NOT_FOUND',
            message: `Case "${request.params.id}" was not found.`,
          },
        })
      }

      const [messages, timeline] = await Promise.all([
        getLegalCaseRepository(app).listMessages(auth.tenantId, request.params.id),
        listPostgresCaseTimeline(getConnection(app), auth.tenantId, request.params.id),
      ])
      const normalized = toLegacyCompatibleCase({
        tenantId: auth.tenantId,
        caseRecord: closedCaseRecord,
        messages,
        timeline,
      })
      const responseCase = {
        ...normalized,
        outcome: {
          rating: request.body.rating!,
          feedback: request.body.feedback,
          closedBy: request.body.closedBy!,
          closedAt: normalized.updatedAt,
        },
      }

      if (normalized.entityId) {
        await getSovereignMutationCommandService(app).submitCommand({
          type: 'legal.case.close',
          commandId: `legal-case-closed:${normalized.entityId}:${normalized.id}:${normalized.updatedAt}`,
          entityId: normalized.entityId,
          occurredAt: normalized.updatedAt,
          payload: {
            caseId: normalized.id,
            rating: request.body.rating,
            feedback: request.body.feedback,
            closedBy: request.body.closedBy,
            status: normalized.status,
          },
        })
      }

      return reply.status(200).send({
        status: 'ready',
        case: responseCase,
      })
    }

    trackCaseRouteMetric(app, 'legacy_case_fallback', 'POST /cases/:id/close')

    const found = await resolveCaseForAuthenticatedAccess({
      app,
      request,
      caseId: request.params.id,
    })

    if (!found) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    const access = resolveLegacyCaseParticipantAccess({ auth, legalCase: found.legalCase, entity: found.entity })
    logCasesAuthDebug({
      request,
      auth,
      caseTenantId: found.legalCase.creatorTenantId,
      createdByUserId: found.legalCase.creatorUserId,
      createdByTenantId: found.legalCase.creatorTenantId,
      entityOwnerUserId: found.entity.ownerUserId,
      entityOwnerTenantId: found.entity.ownerTenantId,
      assignedLawyerId: found.legalCase.assignedLawyerId,
      isClient: access.isClient,
      isOwner: access.isOwner,
      isLawyer: access.isLawyer,
      accessAllowed: access.accessAllowed,
    })
    if (!access.accessAllowed) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'CASE_ACCESS_FORBIDDEN',
          message: 'You do not have access to this case.',
        },
      })
    }

    const closed = await closeLegalCase({
      repository: getRepository(app),
      sovereignCommandService: getSovereignMutationCommandService(app),
      caseId: request.params.id,
      rating: request.body.rating!,
      feedback: request.body.feedback,
      closedBy: request.body.closedBy!,
    })

    if (closed.status === 'not_found') {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'CASE_NOT_FOUND',
          message: `Case "${request.params.id}" was not found.`,
        },
      })
    }

    if (closed.status === 'invalid_state') {
      return reply.status(409).send({
        status: 'failed',
        error: {
          code: 'CASE_CLOSE_INVALID_STATE',
          message: 'This case is already closed.',
        },
        case: closed.legalCase,
      })
    }

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'legal.case.close',
      commandId: `legal-case-closed:${closed.entityId}:${closed.legalCase.id}:${closed.legalCase.updatedAt}`,
      entityId: closed.entityId,
      occurredAt: closed.legalCase.updatedAt,
      payload: {
        caseId: closed.legalCase.id,
        rating: request.body.rating,
        feedback: request.body.feedback,
        closedBy: request.body.closedBy,
        status: closed.legalCase.status,
      },
    })

    return reply.status(200).send({
      status: 'ready',
      case: closed.legalCase,
    })
  })

  app.post<{
      Params: { id: string }
      Body: {
        requestId?: string
        frontendDecision?: unknown
        backendDecision?: unknown
      }
    }>('/public/entity/:id/flowmind-shadow/telemetry', { preHandler: [optionalAuth, publicActionRateLimit] }, async (request, reply) => {
    if (request.body.requestId && !isSafeIdentifier(request.body.requestId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SHADOW_TELEMETRY',
          message: 'requestId is invalid.',
        },
      })
    }

    if (!isPublicFlowMindShadowFrontendDecisionCandidate(request.body.frontendDecision)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SHADOW_TELEMETRY',
          message: 'frontendDecision is invalid.',
        },
      })
    }

    if (!isPublicFlowMindShadowBackendDecisionCandidate(request.body.backendDecision)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SHADOW_TELEMETRY',
          message: 'backendDecision is invalid.',
        },
      })
    }

    const entity = await getRepository(app).getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const requestId = request.body.requestId ?? request.body.backendDecision.requestId
    const snapshot = buildPublicFlowMindShadowSnapshot({
      entityProfile: entity.entityProfile as EntityProfile,
      requestId,
      frontendDecision: request.body.frontendDecision,
      backendDecision: request.body.backendDecision,
    })
    const updatedEntity = appendPublicFlowMindShadowSnapshot(entity.entityProfile as EntityProfile, snapshot)

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-public-shadow:${request.params.id}:${requestId}`,
      entityId: request.params.id,
      entityProfile: updatedEntity,
    })

    return {
      status: 'ready',
      entityId: request.params.id,
      requestId,
      divergenceScore: snapshot.comparison.divergenceScore,
      fallbackRate: snapshot.metrics.fallbackRate,
      semanticInconsistencies: snapshot.comparison.semanticInconsistencies,
    }
  })

  app.post<{
      Params: { id: string }
      Body: {
        requestId?: string
        userMessage?: string
      }
    }>('/public/entity/:id/flowmind-partial/evaluate', { preHandler: [optionalAuth, publicActionRateLimit] }, async (request, reply) => {
    const requestedUserMessage = request.body.userMessage

    if (request.body.requestId && !isSafeIdentifier(request.body.requestId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PARTIAL_REQUEST',
          message: 'requestId is invalid.',
        },
      })
    }

    if (typeof requestedUserMessage !== 'string' || !isSafeString(requestedUserMessage, 1024)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PARTIAL_REQUEST',
          message: 'userMessage is required.',
        },
      })
    }

    const entity = await getRepository(app).getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const requestId = request.body.requestId ?? createRequestId()
    const partialPolicy = resolvePublicFlowMindPartialConfig({
      entityProfile: entity.entityProfile as EntityProfile,
      readiness: buildPublicFlowMindShadowReadiness(
        buildPublicFlowMindShadowAggregation(entity.entityProfile as EntityProfile),
      ),
    })
    const rolloutBucket = computePublicFlowMindPartialRolloutBucket(requestId)
    const sampled = partialPolicy.enabled && rolloutBucket < partialPolicy.rolloutPercentage

    if (!sampled) {
      return {
        status: 'ready',
        entityId: request.params.id,
        requestId,
        enabled: false,
        sampled: false,
        rolloutBucket,
        partialPolicy,
      }
    }

    const registeredSampled = registerPublicFlowMindPartialSampledRequest({
      entityProfile: entity.entityProfile as EntityProfile,
      requestId,
      policy: partialPolicy,
    })

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-public-partial-sampled:${request.params.id}:${requestId}`,
      entityId: request.params.id,
      entityProfile: registeredSampled.entityProfile,
    })

    const latestSnapshot = await getOrchestratorSnapshotRepository(app).getLatestSnapshot(request.params.id)
    const decision = await evaluatePublicFlowMindShadow({
      entityProfile: registeredSampled.entityProfile,
      latestSnapshot,
      flowMindService: getFlowMindService(app),
      requestId,
      userMessage: requestedUserMessage.trim(),
    })

    return {
      status: 'ready',
      entityId: request.params.id,
      requestId,
      enabled: decision !== undefined,
      sampled: true,
      rolloutBucket,
      partialPolicy,
      decision,
    }
  })

  app.post<{
      Params: { id: string }
      Body: {
        requestId?: string
        telemetry?: unknown
      }
    }>('/public/entity/:id/flowmind-partial/telemetry', { preHandler: [optionalAuth, publicActionRateLimit] }, async (request, reply) => {
    if (request.body.requestId && !isSafeIdentifier(request.body.requestId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PARTIAL_TELEMETRY',
          message: 'requestId is invalid.',
        },
      })
    }

    if (!isPublicFlowMindPartialTelemetryInputCandidate(request.body.telemetry)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_PARTIAL_TELEMETRY',
          message: 'telemetry is invalid.',
        },
      })
    }

    const entity = await getRepository(app).getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const requestId = request.body.requestId ?? request.body.telemetry.requestId
    const snapshot = buildPublicFlowMindPartialTelemetrySnapshot({
      requestId,
      policy: request.body.telemetry.policy,
      frontendDecision: request.body.telemetry.frontendDecision,
      backendDecision: request.body.telemetry.backendDecision,
      decidedAt: request.body.telemetry.decidedAt,
    })
    const entityProfile = entity.entityProfile as EntityProfile
    const reconciledTelemetry = reconcilePublicFlowMindPartialTelemetry({
      entityProfile,
      snapshot,
      now: snapshot.decidedAt,
    })
    const withTelemetry = reconciledTelemetry.entityProfile
    const shadowAggregation = buildPublicFlowMindShadowAggregation(withTelemetry)
    const readiness = buildPublicFlowMindShadowReadiness(shadowAggregation)
    const partialAggregation = buildPublicFlowMindPartialAggregation({
      entityProfile: withTelemetry,
      readiness,
      shadowAggregation,
    })
    const policyRecommendation = partialAggregation?.policyRecommendation
    const withPolicyEvaluation = policyRecommendation
      ? applyPublicFlowMindPartialPolicyEvaluation({
        entityProfile: withTelemetry,
        recommendation: policyRecommendation,
      })
      : withTelemetry
    const autoApplied = policyRecommendation && policyRecommendation.automationMode === 'auto-apply'
      && policyRecommendation.status !== 'blocked'
      && policyRecommendation.action !== 'maintain'
      ? applyPublicFlowMindPartialPolicyAdjustment({
        entityProfile: withPolicyEvaluation,
        recommendation: policyRecommendation,
        source: 'policy-auto-apply',
        reason: policyRecommendation.reasons[0],
      })
      : undefined
    const updatedEntity = partialAggregation
      ? applyPublicFlowMindPartialIncidentState({
        entityProfile: autoApplied?.entityProfile ?? withPolicyEvaluation,
        incidentState: partialAggregation.incidentState,
        observedAt: snapshot.decidedAt,
      })
      : (autoApplied?.entityProfile ?? withPolicyEvaluation)

    if (autoApplied?.adjustment) {
      getPublicCacheService(app).deleteByPrefix(`entity-public:${request.params.id}`)
      getPublicCacheService(app).deleteByPrefix(`entity-public-presence:${request.params.id}`)
    }

    const alertEmission = partialAggregation
      ? await emitPublicFlowMindPartialOperationalAlerts({
        entityId: request.params.id,
        requestId,
        observedAt: snapshot.decidedAt,
        entityProfile: updatedEntity,
        aggregation: partialAggregation,
        observability: getObservability(app),
        logger: app.log,
        webhookPublisher: resolvePublicFlowMindPartialOperationalAlertWebhookPublisher({
          entityProfile: updatedEntity,
        }),
      })
      : undefined

    const telemetryEvents = [
      ...(policyRecommendation ? [{
        type: 'flowmind.public_partial.policy.evaluated' as const,
        timestamp: policyRecommendation.evaluatedAt,
        payload: {
          mode: policyRecommendation.automationMode,
          action: policyRecommendation.action,
          status: autoApplied?.adjustment ? 'applied' : policyRecommendation.status,
          currentRolloutPercentage: policyRecommendation.currentRolloutPercentage,
          targetRolloutPercentage: autoApplied?.adjustment?.toRolloutPercentage ?? policyRecommendation.targetRolloutPercentage,
          blockedReason: policyRecommendation.blockedReason,
          sampleSize: policyRecommendation.sampleSize,
          reasons: policyRecommendation.reasons,
        },
      }] : []),
      ...(autoApplied?.adjustment ? [{
        type: 'flowmind.public_partial.policy.applied' as const,
        timestamp: autoApplied.adjustment.changedAt,
        payload: {
          action: autoApplied.adjustment.action,
          source: autoApplied.adjustment.source,
          fromRolloutPercentage: autoApplied.adjustment.fromRolloutPercentage,
          toRolloutPercentage: autoApplied.adjustment.toRolloutPercentage,
          reason: autoApplied.adjustment.reason,
        },
      }] : []),
      ...(alertEmission?.eventRecords ?? []),
    ]

    if (telemetryEvents.length > 0) {
      await getSovereignMutationCommandService(app).submitCommand({
        type: 'flowmind.partial.telemetry.record',
        commandId: `flowmind-public-partial-telemetry:${request.params.id}:${requestId}`,
        entityId: request.params.id,
        events: telemetryEvents,
      })
    }

    const entityProfileForPersistence = (alertEmission?.entityProfile ?? updatedEntity) as EntityProfile

    await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-public-partial-telemetry:${request.params.id}:${requestId}`,
      entityId: request.params.id,
      entityProfile: entityProfileForPersistence,
    })

    return {
      status: 'ready',
      entityId: request.params.id,
      requestId,
      engineUsed: snapshot.engineUsed,
      fallbackOccurred: snapshot.fallbackOccurred,
      fallbackReason: snapshot.fallbackReason,
      divergenceScore: snapshot.metrics.divergenceScore,
      publicPartialPolicyRecommendation: policyRecommendation,
      publicPartialAdjustmentApplied: autoApplied?.adjustment,
    }
  })

  // Public export delivery surface.
  app.get<{ Params: { id: string; exportId: string } }>('/entity/:id/export/:exportId', { preHandler: [optionalAuth, publicReadRateLimit] }, async (
    request,
    reply,
  ) => {
    const repository = getRepository(app)
    const entity = await repository.getEntityById(request.params.id)

    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const exportRepository = getEntityExportRepository(app)
    const exportRecord = await exportRepository.getExportById(request.params.id, request.params.exportId)

    if (!exportRecord) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'EXPORT_NOT_FOUND',
          message: `Export "${request.params.exportId}" was not found.`,
        },
      })
    }

    const actor = resolveSocialActor(request, request.params.id, `view:export:${request.params.exportId}`)
    await getSovereignMutationCommandService(app).submitCommand({
      type: 'public.export.view.record',
      commandId: `public-export-view:${request.params.id}:${request.params.exportId}:${actor.actorId}:${new Date().toISOString()}`,
      entityId: request.params.id,
      ownerId: entity.ownerId,
      actorId: actor.actorId,
      actorKind: actor.kind,
      exportId: request.params.exportId,
      exportFormat: exportRecord.format,
      signalSince: new Date(Date.now() - resolveSignalWindowMs('viewed', actor)).toISOString(),
      occurredAt: new Date().toISOString(),
    }) as PublicExportViewRecordResult

    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
    return {
      status: 'ready',
      entityId: request.params.id,
      export: exportRecord,
      publicLink: `${getPublicBaseUrl(request)}/entity/${request.params.id}/export/${request.params.exportId}`,
      entityLink: `${getPublicBaseUrl(request)}/entity/${request.params.id}`,
    }
  })

  app.patch<{ Params: { id: string }; Body: PatchEntityBody }>('/entity/:id', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (request, reply) => {
    if (!request.body.entityProfile) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_UPDATE_PAYLOAD',
          message: 'entityProfile is required.',
        },
      })
    }

    const ownerContext = resolveAuthenticatedOwnerContext(getRequestAuth(request)!)
    const updated = (await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.profile.persist',
      commandId: `entity-patch:${request.params.id}:${createRequestId()}`,
      entityId: request.params.id,
      entityProfile: applyOwnerContextToEntityProfile(request.body.entityProfile, ownerContext),
      event: {
        type: 'entity.updated',
        timestamp: new Date().toISOString(),
        payload: {
          ownerId: ownerContext.ownerId,
          ownerUserId: ownerContext.ownerUserId,
          ownerTenantId: ownerContext.ownerTenantId,
        },
      },
    }) as EntityMutationResult).entity

    if (!updated) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    getPublicCacheService(app).deleteByPrefix(`entity-public:${request.params.id}`)

    return {
      status: 'ready',
      entityId: updated.id,
      ownerId: updated.ownerId,
      ownerUserId: updated.ownerUserId,
      ownerTenantId: updated.ownerTenantId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      entity: updated.entityProfile,
    }
  })

  // Public interaction and social-signal surfaces.
  app.post<{
      Params: { id: string }
      Body: {
        id?: string
        type?: string
        payload?: Record<string, unknown>
        timestamp?: string
        causedByCommandId?: string
      }
    }>('/entity/:id/events', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    if (!request.body.type || !isAllowedEventType(request.body.type)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EVENT_PAYLOAD',
          message: 'A valid type is required.',
        },
      })
    }
    if (!isSafeMetadata(request.body.payload)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EVENT_PAYLOAD',
          message: 'payload is too large or invalid.',
        },
      })
    }
    if (request.body.causedByCommandId && !isSafeIdentifier(request.body.causedByCommandId)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EVENT_PAYLOAD',
          message: 'causedByCommandId is invalid.',
        },
      })
    }

    const entity = request.entityRecord!
    const logged = (await getSovereignMutationCommandService(app).submitCommand({
      type: 'entity.event.append',
      commandId: `entity-event:${request.params.id}:${request.body.id ?? createRequestId()}`,
      entityId: request.params.id,
      ownerId: entity.ownerId,
      ownerUserId: request.entityRecord!.ownerUserId ?? 0,
      ownerTenantId: request.entityRecord!.ownerTenantId ?? 0,
      entityProfile: request.entityRecord!.entityProfile,
      memoryUsage: resolveMemoryUsageFromEntityDocument(request.entityRecord!.entityProfile),
      event: {
        id: request.body.id,
        type: request.body.type,
        payload: (request.body.payload ?? {}) as Record<string, unknown>,
        timestamp: request.body.timestamp,
        causedByCommandId: request.body.causedByCommandId,
      },
    }) as EventMutationResult).event!

    if (request.body.type === 'return.visit') {
      await getJobProducer(app).enqueueFlowMindExecution({
        entityId: request.params.id,
        commandName: 'growth_return_loop',
        context: {
          trigger: 'return_visit',
          causedByCommandId: request.body.causedByCommandId ?? null,
        },
      }, {
        traceId: request.traceId ?? request.id,
        entityId: request.params.id,
      })
    }
    ;(app as FastifyInstance & BackendContext).backendContext.observability.increment('orchestrator_events')
    request.log.info({
      event: 'orchestrator.event_logged',
      traceId: request.traceId ?? request.id,
      entityId: request.params.id,
      eventType: request.body.type,
      causedByCommandId: request.body.causedByCommandId,
    }, 'Orchestrator event logged')

    return reply.status(201).send({
      status: 'ready',
      event: logged,
    })
  })

  app.get<{ Params: { id: string } }>('/entity/:id/events', { preHandler: [requireAuth, requireEntityOwner] }, async (request) => {
    const eventLogRepository = getEventLogRepository(app)
    const events = await eventLogRepository.getEvents(request.params.id)

    return {
      status: 'ready',
      entityId: request.params.id,
      events,
    }
  })

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/entity/:id/events/recent', { preHandler: [requireAuth, requireEntityOwner] }, async (
    request,
  ) => {
    const eventLogRepository = getEventLogRepository(app)
    const limit = Number(request.query.limit ?? 20)
    const events = await eventLogRepository.getRecentEvents(request.params.id, Number.isFinite(limit) ? limit : 20)

    return {
      status: 'ready',
      entityId: request.params.id,
      events,
    }
  })

  app.post<{
      Params: { id: string }
      Body: {
        id?: string
        type?: string
        timestamp?: string
        weight?: number
        source?: string
        actorId?: string
        metadata?: Record<string, unknown>
        async?: boolean
      }
    }>('/entity/:id/signals', { preHandler: [optionalAuth, publicActionRateLimit] }, async (
    request,
    reply,
  ) => {
    if (!request.body.type || !isAllowedSignalType(request.body.type)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SIGNAL_PAYLOAD',
          message: 'A supported type is required.',
        },
      })
    }
    if (request.body.source && !isSafeString(request.body.source, 64)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SIGNAL_PAYLOAD',
          message: 'source is invalid.',
        },
      })
    }
    if (!isSafeMetadata(request.body.metadata)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SIGNAL_PAYLOAD',
          message: 'metadata is too large or invalid.',
        },
      })
    }
    const repository = getRepository(app)
    const entity = await repository.getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const socialSignalEngine = getSocialSignalEngine(app)
    const actor = resolveSocialActor(request, request.params.id, resolveSignalTrackingScope(request.body.type))

    if (!isSignalAllowedForActor(request.body.type, actor)) {
      return reply.status(actor.kind === 'anonymous' ? 401 : 403).send({
        status: 'failed',
        error: {
          code: actor.kind === 'anonymous' ? 'AUTH_REQUIRED_FOR_SIGNAL' : 'SIGNAL_TYPE_NOT_ALLOWED',
          message: actor.kind === 'anonymous'
            ? 'Authentication is required for this signal type.'
            : 'This signal type is not accepted from public clients.',
        },
      })
    }

    if (request.body.type === 'followed' && await socialSignalEngine.hasSignalByActor(request.params.id, 'followed', actor.actorId)) {
      return reply.status(202).send({
        status: 'ignored',
        reason: 'already_followed',
      })
    }

    const recentSignalCount = await socialSignalEngine.countSignalsByActorSince(
      request.params.id,
      actor.actorId,
      new Date(Date.now() - resolveSignalWindowMs(request.body.type, actor)).toISOString(),
      request.body.type as 'viewed' | 'interacted' | 'shared' | 'followed',
    )

    if (recentSignalCount >= resolveSignalMaxWithinWindow(request.body.type, actor)) {
      if (request.body.type === 'interacted') {
        return reply.status(429).send({
          status: 'failed',
          error: {
            code: 'SIGNAL_RATE_LIMITED',
            message: 'Too many repeated signals for this entity.',
          },
        })
      }

        return reply.status(202).send({
          status: 'ignored',
          reason: 'duplicate_recent_signal',
        })
    }

    const job = await getJobProducer(app).enqueueSocialSignalIngest({
      entityId: request.params.id,
      ownerId: entity.ownerId,
      type: request.body.type,
      timestamp: request.body.timestamp,
      weight: resolveSignalWeight(request.body.type, actor),
      source: request.body.source,
      actorId: actor.actorId,
      metadata: buildServerValidatedSignalMetadata(request.body.metadata, actor),
    }, {
      traceId: request.traceId ?? request.id,
      entityId: request.params.id,
    })

    request.log.info({
      event: 'social.signal_queued',
      traceId: request.traceId ?? request.id,
      entityId: request.params.id,
      signalType: request.body.type,
      actorKind: actor.kind,
      jobId: job.id,
    }, 'Social signal queued')

    return reply.status(202).send({
      status: 'queued',
      jobId: job.id,
      job,
    })
  })

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/entity/:id/signals', { preHandler: [optionalAuth, publicReadRateLimit] }, async (
    request,
    reply,
  ) => {
    const repository = getRepository(app)
    const entity = await repository.getEntityById(request.params.id)
    if (!entity) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${request.params.id}" was not found.`,
        },
      })
    }

    const socialSignalEngine = getSocialSignalEngine(app)
    const aggregate = await socialSignalEngine.aggregateSignals(
      request.params.id,
      sanitizeLimit(request.query.limit, 200, 500),
    )
    const viewerActor = getRequestAuth(request)
      ? resolveSocialActor(request, request.params.id, 'viewer-state')
      : undefined
    const viewerState = await socialSignalEngine.getViewerState(request.params.id, viewerActor?.actorId)

    return {
      status: 'ready',
      entityId: request.params.id,
      aggregate,
      viewerState,
    }
  })

  app.post<{
      Params: { id: string }
      Body: {
        id?: string
        format?: string
        createdAt?: string
        metadata?: Record<string, unknown>
        fileUrl?: string
        assetBase64?: string
        contentType?: string
        fileName?: string
        assetKind?: 'original' | 'preview' | 'thumbnail' | 'avatar'
        async?: boolean
      }
    }>('/entity/:id/exports', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    if (!request.body.format || !isAllowedExportFormat(request.body.format)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EXPORT_PAYLOAD',
          message: 'A valid format is required.',
        },
      })
    }
    if (request.body.id && !isSafeIdentifier(request.body.id)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EXPORT_PAYLOAD',
          message: 'id is invalid.',
        },
      })
    }
    if (request.body.fileName && !isSafeString(request.body.fileName, 180)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EXPORT_PAYLOAD',
          message: 'fileName is invalid.',
        },
      })
    }
    if (!isSafeMetadata(request.body.metadata)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_EXPORT_PAYLOAD',
          message: 'metadata is too large or invalid.',
        },
      })
    }
    if (request.body.assetBase64 && request.body.assetBase64.length > 20_000_000) {
      return reply.status(413).send({
        status: 'failed',
        error: {
          code: 'EXPORT_ASSET_TOO_LARGE',
          message: 'assetBase64 is too large.',
        },
      })
    }

    const entity = request.entityRecord!

    const exportId = request.body.id ?? createExportRecordId()
    const publicBaseUrl = getPublicBaseUrl(request)

    const job = await getJobProducer(app).enqueueExportRender({
      entityId: request.params.id,
      ownerId: entity.ownerId,
      exportId,
      format: request.body.format,
      createdAt: request.body.createdAt,
      metadata: request.body.metadata,
      fileUrl: request.body.fileUrl,
      publicBaseUrl,
      assetBase64: request.body.assetBase64,
      contentType: request.body.contentType,
      fileName: request.body.fileName,
      assetKind: request.body.assetKind,
    }, {
      traceId: request.traceId ?? request.id,
      entityId: request.params.id,
    })

    request.log.info({
      event: 'entity.export_queued',
      traceId: request.traceId ?? request.id,
      entityId: request.params.id,
      exportId,
      format: request.body.format,
      jobId: job.id,
    }, 'Entity export queued')

    return reply.status(202).send({
      status: 'queued',
      exportId,
      jobId: job.id,
      job,
      publicLink: `${publicBaseUrl}/entity/${request.params.id}/export/${exportId}`,
      entityLink: `${publicBaseUrl}/entity/${request.params.id}`,
    })
  })

  app.get<{ Params: { id: string } }>('/entity/:id/exports', { preHandler: [requireAuth, requireEntityOwner] }, async (request) => {
    const exportRepository = getEntityExportRepository(app)
    const exports = await exportRepository.getExports(request.params.id)

    return {
      status: 'ready',
      entityId: request.params.id,
      exports,
    }
  })

  app.post<{
      Params: { id: string }
      Body: {
        id?: string
        sessionId?: string
        version?: number
        sequence?: number
        currentStage?: string
        sessionStatus?: string
        relationalSnapshot?: Record<string, unknown>
        renderSnapshot?: Record<string, unknown>
        lastCommand?: {
          commandId: string
          type: string
          issuedAt: string
          source: 'user' | 'flowmind' | 'system'
        }
        lastEventId?: string
        lastEventType?: string
        createdAt?: string
        updatedAt?: string
      }
    }>('/entity/:id/snapshots', { preHandler: [requireAuth, requireEntityOwner, privateWriteRateLimit] }, async (
    request,
    reply,
  ) => {
    if (!request.body.sessionStatus || !isSafeString(request.body.sessionStatus, 40)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SNAPSHOT_PAYLOAD',
          message: 'sessionStatus is required.',
        },
      })
    }
    if (!isSafeMetadata(request.body.relationalSnapshot) || !isSafeMetadata(request.body.renderSnapshot)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_SNAPSHOT_PAYLOAD',
          message: 'snapshot payload is too large or invalid.',
        },
      })
    }

    const snapshotRepository = getOrchestratorSnapshotRepository(app)
    const snapshot = await snapshotRepository.saveSnapshot({
      id: request.body.id,
      entityId: request.params.id,
      sessionId: request.body.sessionId,
      version: request.body.version,
      sequence: request.body.sequence,
      currentStage: request.body.currentStage,
      sessionStatus: request.body.sessionStatus,
      relationalSnapshot: (request.body.relationalSnapshot ?? {}) as never,
      renderSnapshot: (request.body.renderSnapshot ?? {}) as never,
      lastCommand: request.body.lastCommand,
      lastEventId: request.body.lastEventId,
      lastEventType: request.body.lastEventType,
      createdAt: request.body.createdAt,
      updatedAt: request.body.updatedAt,
    })

    return reply.status(201).send({
      status: 'ready',
      snapshot,
    })
  })

  app.get<{ Params: { id: string } }>('/entity/:id/snapshots/latest', { preHandler: [requireAuth, requireEntityOwner] }, async (
    request,
  ) => {
    const snapshotRepository = getOrchestratorSnapshotRepository(app)
    const snapshot = await snapshotRepository.getLatestSnapshot(request.params.id)

    return {
      status: 'ready',
      entityId: request.params.id,
      snapshot: snapshot ?? undefined,
    }
  })

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/entity/:id/snapshots', { preHandler: [requireAuth, requireEntityOwner] }, async (
    request,
  ) => {
    const snapshotRepository = getOrchestratorSnapshotRepository(app)
    const limit = Number(request.query.limit ?? 20)
    const snapshots = await snapshotRepository.listSnapshots(request.params.id, Number.isFinite(limit) ? limit : 20)

    return {
      status: 'ready',
      entityId: request.params.id,
      snapshots,
    }
  })
}
