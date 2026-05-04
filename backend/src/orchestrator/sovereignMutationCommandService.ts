import type { BackendDatabase } from '../db/index.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { EntityProfileDocument, StoredEntityProfile } from '../domain/entityProfile.js'
import type { JsonObject } from '../domain/entityProfile.js'
import { createDefaultEntityCognitiveMemory, hydrateEntityCognitiveMemory } from '../flowmind/index.js'
import type { OrchestratorCommandRequest } from './contracts.js'
import { EntityCognitiveMemoryRepository } from '../repositories/entityCognitiveMemoryRepository.js'
import { EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import { EntityRelationshipRepository } from '../repositories/entityRelationshipRepository.js'
import { EntityRepository } from '../repositories/entityRepository.js'
import { FlowMindExecutionLedgerRepository } from '../repositories/flowMindExecutionLedgerRepository.js'
import { PortfolioLeadIntakeRepository } from '../repositories/portfolioLeadIntakeRepository.js'
import { PortfolioLeadRevenueEventRepository, type PortfolioLeadRevenueValidationMethod } from '../repositories/portfolioLeadRevenueEventRepository.js'
import { PortfolioLeadRepository, type PortfolioLeadRecord, type PortfolioLeadStatus } from '../repositories/portfolioLeadRepository.js'
import { SocialSignalRepository } from '../repositories/socialSignalRepository.js'
import { PortfolioLeadSignalRepository, type PortfolioLeadSignalRecord } from '../repositories/portfolioLeadSignalRepository.js'
import { PortfolioProposalOutcomeRepository, type PortfolioProposalOutcomeRecord } from '../repositories/portfolioProposalOutcomeRepository.js'
import {
  PortfolioProposalRepository,
  type PortfolioProposalRecord,
  type PortfolioProposalStatus,
} from '../repositories/portfolioProposalRepository.js'
import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'
import { FlowMindApprovalQueue, type FlowMindApprovalRecord } from './approvalQueue.js'
import { executeFlowMindCommandTransaction, type ExecuteFlowMindCommandResult } from './flowMindCommandTransactionService.js'
import { hashFlowMindValue } from './flowMindHashing.js'
import { MultiEntityRegistry, type MultiEntityRegistryRecord, type MultiEntityRiskLevel } from './multiEntityRegistry.js'
import type { FlowMindPort } from '../services/flowMindPort.js'
import type { RelationshipEngine } from '../services/relationshipEngine.js'
import type { SocialSignalEngine } from '../services/socialSignalEngine.js'
import type { GlobalFeedEngine, GlobalFeedItem } from '../services/globalFeedEngine.js'
import type { MonetizationService } from '../services/monetizationService.js'
import type { GrowthEngine } from '../domain/growth/GrowthEngine.js'
import type { JobProducer } from '../jobs/index.js'

type SovereignCommandAction =
  | 'entity.event.append'
  | 'entity.create'
  | 'entity.profile.persist'
  | 'entity.relationship.interaction.record'
  | 'flowmind.partial.telemetry.record'
  | 'approval.resolve'
  | 'legal.case.assign'
  | 'legal.case.close'
  | 'legal.case.message.append'
  | 'lead.contact'
  | 'lead.convert'
  | 'lead.mark_lost'
  | 'lead.qualify'
  | 'orchestrator.command.execute'
  | 'portfolio.lead.route'
  | 'portfolio.scan'
  | 'portfolio.proposal.transition'
  | 'portfolio.proposal.evaluate'
  | 'public.export.view.record'
  | 'public.interaction.resolve'

type SovereignDecision = {
  commandId: string
  entityId: string
  action: SovereignCommandAction
  decisionHash: string
  payload: Record<string, unknown>
}

type ApprovalResolveCommand = {
  type: 'approval.resolve'
  commandId: string
  approvalId: string
  status: 'approved' | 'rejected'
  actorId: string
  now: string
}

type OrchestratorCommandExecuteCommand = {
  type: 'orchestrator.command.execute'
  entityId: string
  commandId: string
  issuedAt: string
  requestCommand: OrchestratorCommandRequest
  actorId: string
  auth?: {
    userId: number
    tenantId: number
    roles: string[]
  }
  idempotencyKey: string
}

type EntityRelationshipInteractionRecordCommand = {
  type: 'entity.relationship.interaction.record'
  commandId: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  reverseRelationType: string
  strengthDelta: number
  reverseStrengthDelta: number
  interactionType: 'mention' | 'collaboration' | 'reaction' | 'suggestion'
  summary: string
  topics: string[]
  occurredAt: string
  sourceOwnerId?: string
  targetOwnerId?: string
  sourceEntityName: string
  targetEntityName: string
}

type PublicInteractionResolveCommand = {
  type: 'public.interaction.resolve'
  commandId: string
  entityId: string
  occurredAt: string
  payload: Record<string, unknown>
}

type LegalCaseAssignCommand = {
  type: 'legal.case.assign'
  commandId: string
  entityId: string
  occurredAt: string
  payload: Record<string, unknown>
}

type LegalCaseMessageAppendCommand = {
  type: 'legal.case.message.append'
  commandId: string
  entityId: string
  occurredAt: string
  payload: Record<string, unknown>
}

type LegalCaseCloseCommand = {
  type: 'legal.case.close'
  commandId: string
  entityId: string
  occurredAt: string
  payload: Record<string, unknown>
}

type FlowMindPartialTelemetryRecordCommand = {
  type: 'flowmind.partial.telemetry.record'
  commandId: string
  entityId: string
  events: Array<{
    type: 'flowmind.public_partial.policy.evaluated' | 'flowmind.public_partial.policy.applied' | 'flowmind.public_partial.alert.triggered'
    timestamp: string
    payload: Record<string, unknown>
  }>
}

type PublicExportViewRecordCommand = {
  type: 'public.export.view.record'
  commandId: string
  entityId: string
  ownerId?: string
  actorId: string
  actorKind: 'anonymous' | 'authenticated'
  exportId: string
  exportFormat: string
  signalSince: string
  occurredAt: string
}

type EntityEventAppendCommand = {
  type: 'entity.event.append'
  commandId: string
  entityId: string
  ownerId?: string
  ownerUserId: number
  ownerTenantId: number
  entityProfile: EntityProfileDocument
  memoryUsage: number
  event: {
    id?: string
    type: string
    payload: Record<string, unknown>
    timestamp?: string
    causedByCommandId?: string
  }
}

type PortfolioScanCommand = {
  type: 'portfolio.scan'
  commandId: string
  now: string
}

type PortfolioLeadRouteCommand = {
  type: 'portfolio.lead.route'
  commandId: string
  entityId: string
  signalId: string
  source: string
  timestamp: string
  leadId?: string
  action?: 'store_only' | 'trigger_intake' | 'trigger_outreach'
  metadata?: Record<string, unknown>
}

type LeadQualifyCommand = {
  type: 'lead.qualify'
  commandId: string
  entityId: string
  leadId: string
  occurredAt: string
}

type LeadContactCommand = {
  type: 'lead.contact'
  commandId: string
  entityId: string
  leadId: string
  occurredAt: string
}

type LeadConvertCommand = {
  type: 'lead.convert'
  commandId: string
  entityId: string
  leadId: string
  occurredAt: string
  reconciledRevenue: {
    amount: number
    currency?: string
    invoiceId?: string
    paymentId?: string
    contractId?: string
    externalValidation?: {
      system: string
      validatedAt: string
      referenceId?: string
    }
    confirmedByEvent?: {
      eventId: string
    }
  }
}

type LeadMarkLostCommand = {
  type: 'lead.mark_lost'
  commandId: string
  entityId: string
  leadId: string
  occurredAt: string
  lostReason: string
}

type AutonomousLeadProgressionTrigger = 'time_since_last_action' | 'channel_feedback' | 'interaction_events' | 'memory_patterns'

type AutonomousLeadProgressionStep = {
  type: 'lead.qualify' | 'lead.contact' | 'lead.convert' | 'lead.mark_lost'
  commandId: string
  reason: string
  trigger: AutonomousLeadProgressionTrigger
  reconciledRevenue?: LeadConvertCommand['reconciledRevenue']
}

type EntityCreateCommand = {
  type: 'entity.create'
  commandId: string
  entityId: string
  ownerId?: string
  ownerUserId?: number
  ownerTenantId?: number
  entityProfile: EntityProfileDocument
  event?: {
    type: string
    timestamp: string
    payload: Record<string, unknown>
  }
  now: string
}

type EntityProfilePersistCommand = {
  type: 'entity.profile.persist'
  commandId: string
  entityId: string
  entityProfile: EntityProfileDocument
  updatedAt?: string
  event?: {
    type: string
    timestamp: string
    payload: Record<string, unknown>
  }
}

type PortfolioProposalTransitionCommand = {
  type: 'portfolio.proposal.transition'
  commandId: string
  proposalId: string
  status: 'acknowledged' | 'approved' | 'rejected' | 'executed'
  actorId?: string
  now: string
}

type PortfolioProposalEvaluateCommand = {
  type: 'portfolio.proposal.evaluate'
  commandId: string
  proposalId: string
  leadsGenerated: number
  conversions: number
  revenue: number
  roiObserved: number
  success: boolean
  actorId?: string
  evaluatedAt: string
}

export type SovereignMutationCommand =
  | EntityEventAppendCommand
  | EntityCreateCommand
  | EntityProfilePersistCommand
  | EntityRelationshipInteractionRecordCommand
  | FlowMindPartialTelemetryRecordCommand
  | ApprovalResolveCommand
  | LegalCaseAssignCommand
  | LegalCaseCloseCommand
  | LegalCaseMessageAppendCommand
  | LeadContactCommand
  | LeadConvertCommand
  | LeadMarkLostCommand
  | LeadQualifyCommand
  | OrchestratorCommandExecuteCommand
  | PortfolioLeadRouteCommand
  | PortfolioScanCommand
  | PortfolioProposalTransitionCommand
  | PortfolioProposalEvaluateCommand
  | PublicExportViewRecordCommand
  | PublicInteractionResolveCommand

export type EventMutationResult = {
  event: EntityEventLogRecord | null
  changed: boolean
}

export type MultiEventMutationResult = {
  events: EntityEventLogRecord[]
  changed: boolean
}

export type EntityRelationshipInteractionResult = {
  changed: boolean
  relationships: {
    sourceToTarget: Awaited<ReturnType<RelationshipEngine['updateRelationship']>>
    targetToSource: Awaited<ReturnType<RelationshipEngine['updateRelationship']>>
  }
  events: {
    source: EntityEventLogRecord
    target: EntityEventLogRecord
  }
  feedItem?: GlobalFeedItem
}

export type PublicExportViewRecordResult = {
  changed: boolean
  event: EntityEventLogRecord | null
}

export type EntityMutationResult = {
  entity: StoredEntityProfile | null
  changed: boolean
  blockedReason?: 'not_found'
}

export type ApprovalResolveResult = {
  approval: FlowMindApprovalRecord | null
  changed: boolean
  blockedReason?: 'not_found' | 'terminal_state_locked'
}

export type OrchestratorCommandExecuteResult = {
  changed: boolean
  idempotent: boolean
  transaction?: ExecuteFlowMindCommandResult
}

export type PortfolioProposalCommandResult = {
  proposal: PortfolioProposalRecord | null
  approval?: FlowMindApprovalRecord | null
  outcome?: PortfolioProposalOutcomeRecord
  changed: boolean
  blockedReason?: 'not_found' | 'invalid_transition'
}

export type PortfolioScanResult = {
  createdSignals: number
  createdLeads: number
  createdProposals: number
  createdApprovals: number
}

export type PortfolioLeadRouteResult = {
  lead: PortfolioLeadRecord | null
  changed: boolean
  event?: EntityEventLogRecord | null
  followUpEvent?: EntityEventLogRecord | null
  executionResult?: PortfolioLeadExternalExecutionResult
  externalReferenceId?: string
  blockedReason?: 'signal_not_found'
}

type PortfolioLeadExternalExecutionResult = {
  action: 'trigger_intake' | 'trigger_outreach'
  status: 'created' | 'enqueued' | 'replayed'
  externalReferenceId: string
  referenceType: 'lead_intake' | 'job'
  channel?: 'email' | 'whatsapp' | 'internal'
  targetIdentifier?: string
}

export type PortfolioLeadLifecycleResult = {
  lead: PortfolioLeadRecord | null
  changed: boolean
  event?: EntityEventLogRecord | null
  blockedReason?: 'invalid_transition' | 'lead_not_found'
}

export type SovereignMutationCommandResult =
  | EntityRelationshipInteractionResult
  | EventMutationResult
  | MultiEventMutationResult
  | EntityMutationResult
  | ApprovalResolveResult
  | OrchestratorCommandExecuteResult
  | PortfolioLeadLifecycleResult
  | PortfolioLeadRouteResult
  | PortfolioProposalCommandResult
  | PortfolioScanResult
  | PublicExportViewRecordResult

export type SovereignMutationCommandServiceDependencies = {
  connection: BackendDatabase
  flowMindService?: FlowMindPort
  relationshipEngine?: RelationshipEngine
  socialSignalEngine?: SocialSignalEngine
  globalFeedEngine?: GlobalFeedEngine
  monetizationService?: MonetizationService
  growthEngine?: GrowthEngine
  jobProducer?: JobProducer
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function normalizeIdPart(value: unknown) {
  const normalized = String(value ?? 'na')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized.slice(0, 24) : 'na'
}

function createSignalId(entityId: string, source: string, intent: string, now: string) {
  return ['lead', normalizeIdPart(entityId), normalizeIdPart(source), normalizeIdPart(intent), now.slice(0, 13)].join('-').slice(0, 128)
}

function createLeadId(entityId: string, signalId: string) {
  return ['routed', normalizeIdPart(entityId), normalizeIdPart(signalId)].join('-').slice(0, 128)
}

function createLeadIntakeId(leadId: string) {
  return ['intake', normalizeIdPart(leadId)].join('-').slice(0, 128)
}

function createLeadOutreachJobId(leadId: string) {
  return ['lead-outreach', normalizeIdPart(leadId)].join('-').slice(0, 128)
}

function createProposalId(entityId: string, proposalType: string, now: string) {
  return ['proposal', normalizeIdPart(entityId), normalizeIdPart(proposalType), now.slice(0, 13)].join('-').slice(0, 128)
}

function buildApprovalId(entityId: string, proposalId: string) {
  return `portfolio-approval-${entityId}-${proposalId}`.slice(0, 128)
}

function isLeadTransitionAllowed(current: PortfolioLeadStatus, next: PortfolioLeadStatus) {
  const allowed: Record<PortfolioLeadStatus, PortfolioLeadStatus[]> = {
    routed: ['qualified', 'contacted', 'converted', 'lost'],
    qualified: ['contacted', 'converted', 'lost'],
    contacted: ['converted', 'lost'],
    converted: [],
    lost: [],
  }

  return allowed[current].includes(next)
}

function buildLeadAttributionUpdate(args: {
  lead: PortfolioLeadRecord
  commandId: string
  transition: PortfolioLeadStatus
  occurredAt: string
  details?: Record<string, unknown>
}) {
  const existingLifecycle = typeof args.lead.attribution.lifecycle === 'object' && args.lead.attribution.lifecycle !== null
    ? args.lead.attribution.lifecycle as Record<string, unknown>
    : {}
  const existingCommandIds = typeof existingLifecycle.commandIds === 'object' && existingLifecycle.commandIds !== null
    ? existingLifecycle.commandIds as Record<string, unknown>
    : {}
  const existingTimestamps = typeof existingLifecycle.timestamps === 'object' && existingLifecycle.timestamps !== null
    ? existingLifecycle.timestamps as Record<string, unknown>
    : {}

  return {
    ...args.lead.attribution,
    lifecycle: {
      ...existingLifecycle,
      lastTransition: args.transition,
      lastCommandId: args.commandId,
      commandIds: {
        ...existingCommandIds,
        [args.transition]: args.commandId,
      },
      timestamps: {
        ...existingTimestamps,
        [args.transition]: args.occurredAt,
      },
      ...(args.details ? { [args.transition]: args.details } : {}),
    },
  }
}

function buildLeadLifecyclePath(lead: PortfolioLeadRecord, targetStatus: PortfolioLeadStatus) {
  const path: PortfolioLeadStatus[] = ['routed']
  if ((lead.qualifiedAt ?? null) !== null || targetStatus === 'qualified' || targetStatus === 'contacted' || targetStatus === 'converted' || targetStatus === 'lost') {
    if (lead.status === 'qualified' || lead.status === 'contacted' || lead.status === 'converted' || lead.status === 'lost' || targetStatus === 'qualified' || targetStatus === 'contacted' || targetStatus === 'converted' || targetStatus === 'lost') {
      if (!path.includes('qualified') && ((lead.qualifiedAt ?? null) !== null || ['qualified', 'contacted', 'converted', 'lost'].includes(targetStatus))) {
        path.push('qualified')
      }
    }
  }
  if ((lead.contactedAt ?? null) !== null || targetStatus === 'contacted' || targetStatus === 'converted' || targetStatus === 'lost') {
    if (!path.includes('contacted') && ((lead.contactedAt ?? null) !== null || ['contacted', 'converted', 'lost'].includes(targetStatus))) {
      path.push('contacted')
    }
  }
  if (targetStatus === 'converted') {
    path.push('converted')
  }
  if (targetStatus === 'lost') {
    path.push('lost')
  }

  return path.filter((status, index) => path.indexOf(status) === index)
}

async function applyLeadOutcomeLearning(args: {
  tx: BackendDatabase
  lead: PortfolioLeadRecord
  outcomeCommandId: string
  outcomeStatus: 'converted' | 'lost'
  occurredAt: string
}) {
  const memoryRepository = new EntityCognitiveMemoryRepository(args.tx)
  const entityRepository = new EntityRepository(args.tx)
  const registry = new MultiEntityRegistry(args.tx)
  const memoryRecord = await memoryRepository.getByEntityId(args.lead.entityId)
  const memory = hydrateEntityCognitiveMemory(
    memoryRecord?.memory ?? createDefaultEntityCognitiveMemory(),
  )
  const episodeId = `portfolio-lead-outcome:${args.lead.leadId}:${args.outcomeStatus}`
  if (!memory.episodicMemory.entries.some((entry) => entry.id === episodeId)) {
    memory.episodicMemory.entries = [
      {
        id: episodeId,
        summary: `portfolio-lead:${args.outcomeStatus}`,
        tags: ['portfolio', 'lead', 'outcome', args.outcomeStatus, args.lead.source],
        relevanceScore: args.outcomeStatus === 'converted'
          ? clamp(0.45 + ((args.lead.revenueAmount ?? 0) / 5000))
          : 0.4,
        recordedAt: args.occurredAt,
        context: {
          signalId: args.lead.signalId,
          leadId: args.lead.leadId,
          lifecyclePath: buildLeadLifecyclePath(args.lead, args.outcomeStatus),
          outcome: args.outcomeStatus,
          revenueAmount: args.lead.revenueAmount,
          lostReason: args.lead.lostReason,
          sourceCommandId: args.lead.attributedCommandId,
          outcomeCommandId: args.outcomeCommandId,
        },
      },
      ...memory.episodicMemory.entries,
    ].slice(0, 24)
  }

  const convertedRate = args.outcomeStatus === 'converted' ? 1 : 0
  const revenueSignal = args.outcomeStatus === 'converted' ? clamp((args.lead.revenueAmount ?? 0) / 5000) : 0
  memory.historicalSignals = {
    ...memory.historicalSignals,
    totalInteractions: memory.historicalSignals.totalInteractions + 1,
    reliableEvidenceCount: memory.historicalSignals.reliableEvidenceCount + 1,
    rollingSuccessRate: blendRate(memory.historicalSignals.rollingSuccessRate, convertedRate),
    rollingContinuationRate: blendRate(memory.historicalSignals.rollingContinuationRate, convertedRate),
    rollingEngagementDelta: blendRate(
      (memory.historicalSignals.rollingEngagementDelta + 1) / 2,
      args.outcomeStatus === 'converted' ? clamp(0.55 + revenueSignal * 0.45) : 0.15,
    ) * 2 - 1,
  }

  await memoryRepository.save({
    entityId: args.lead.entityId,
    memory,
    updatedAt: args.occurredAt,
  })

  const registryRecord = await registry.getEntityById(args.lead.entityId)
  if (registryRecord) {
    const observedLeadSignal = args.outcomeStatus === 'converted'
      ? clamp(0.7 + revenueSignal * 0.3)
      : 0.18
    const observedOpportunity = args.outcomeStatus === 'converted'
      ? clamp(0.72 + revenueSignal * 0.28)
      : 0.2
    const updatedGoals = registryRecord.activeGoals.map((goal) => {
      if (goal.type !== 'generate_leads' && goal.type !== 'optimize_performance') {
        return goal
      }

      const current = typeof goal.historicalSuccess === 'number' ? goal.historicalSuccess : 0.5
      return {
        ...goal,
        historicalSuccess: blendRate(current, convertedRate, 2),
      }
    })

    await registry.updateEntityState({
      entityId: args.lead.entityId,
      activeGoals: updatedGoals,
      leadGenerationScore: blendRate(registryRecord.leadGenerationScore, observedLeadSignal, 2),
      lastDecisionSnapshot: {
        ...(registryRecord.lastDecisionSnapshot ?? {}),
        leadOutcomeLearning: {
          leadId: args.lead.leadId,
          signalId: args.lead.signalId,
          outcome: args.outcomeStatus,
          sourceCommandId: args.lead.attributedCommandId,
          outcomeCommandId: args.outcomeCommandId,
          opportunityScore: observedOpportunity,
          updatedAt: args.occurredAt,
        },
      },
      updatedAt: args.occurredAt,
    })
  }

  const entityRecord = await entityRepository.getEntityById<EntityProfile>(args.lead.entityId)
  if (entityRecord) {
    const notes = entityRecord.entityProfile.metadata.notes ?? []
    await entityRepository.updateEntity({
      id: args.lead.entityId,
      updatedAt: args.occurredAt,
      entityProfile: {
        ...entityRecord.entityProfile,
        metadata: {
          ...entityRecord.entityProfile.metadata,
          updatedAt: args.occurredAt,
          notes: [
            `portfolio-lead-learning:${args.lead.leadId}:${args.outcomeStatus}:${args.outcomeCommandId}`,
            ...notes,
          ].slice(0, 24),
        },
      },
    })
  }
}

function summarizeEntityName(entityProfile: EntityProfile) {
  return entityProfile.social?.publicName
    ?? entityProfile.brand?.name
    ?? entityProfile.finalForm?.identity?.name
    ?? entityProfile.id
}

function detectRiskLevel(registryEntry: MultiEntityRegistryRecord, confidence: number): MultiEntityRiskLevel {
  if (registryEntry.riskLevel === 'critical' || registryEntry.rollbackState.active) {
    return 'critical'
  }

  if (registryEntry.riskLevel === 'high' || confidence >= 0.82) {
    return 'high'
  }

  if (registryEntry.riskLevel === 'medium' || confidence >= 0.64) {
    return 'medium'
  }

  return 'low'
}

function proposalRequiresApproval(proposalType: string, riskLevel: MultiEntityRiskLevel) {
  return proposalType === 'propose_budget_allocation' || riskLevel !== 'low'
}

function transitionAllowed(current: PortfolioProposalStatus, next: PortfolioProposalStatus) {
  const allowed: Record<PortfolioProposalStatus, PortfolioProposalStatus[]> = {
    proposed: ['acknowledged', 'approved', 'rejected', 'expired'],
    acknowledged: ['approved', 'rejected', 'expired'],
    approved: ['executed', 'evaluated', 'expired'],
    rejected: [],
    expired: [],
    executed: ['evaluated'],
    evaluated: [],
  }

  return allowed[current].includes(next)
}

function buildDecision(command: SovereignMutationCommand, entityId: string): SovereignDecision {
  const payload = JSON.parse(JSON.stringify(command)) as Record<string, unknown>
  const decisionHash = hashFlowMindValue({
    entityId,
    action: command.type,
    payload,
  })

  return {
    commandId: command.commandId,
    entityId,
    action: command.type,
    decisionHash,
    payload,
  }
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject
}

function readLeadExecutionResult(lead: PortfolioLeadRecord | null): PortfolioLeadExternalExecutionResult | undefined {
  const externalExecution = lead?.payload?.externalExecution
  if (!externalExecution || typeof externalExecution !== 'object' || Array.isArray(externalExecution)) {
    return undefined
  }

  const record = externalExecution as Record<string, unknown>
  const action = record.action
  const status = record.status
  const referenceType = record.referenceType
  if (
    (action === 'trigger_intake' || action === 'trigger_outreach')
    && (status === 'created' || status === 'enqueued' || status === 'replayed')
    && typeof record.externalReferenceId === 'string'
    && (referenceType === 'lead_intake' || referenceType === 'job')
  ) {
    return {
      action,
      status,
      externalReferenceId: record.externalReferenceId,
      referenceType,
      channel: record.channel === 'email' || record.channel === 'whatsapp' || record.channel === 'internal'
        ? record.channel
        : undefined,
      targetIdentifier: typeof record.targetIdentifier === 'string' ? record.targetIdentifier : undefined,
    }
  }

  return undefined
}

function resolveOutreachChannel(metadata: Record<string, unknown> | undefined, signalId: string) {
  const raw = typeof metadata?.channel === 'string' ? metadata.channel.trim().toLowerCase() : ''
  if (raw === 'email' || raw === 'whatsapp' || raw === 'internal') {
    return raw
  }

  const target = typeof metadata?.targetIdentifier === 'string' ? metadata.targetIdentifier.trim() : ''
  if (target.includes('@')) {
    return 'email'
  }
  if (/\d/.test(target)) {
    return 'whatsapp'
  }

  void signalId
  return 'internal'
}

function resolveOutreachTargetIdentifier(metadata: Record<string, unknown> | undefined, signalId: string) {
  const target = typeof metadata?.targetIdentifier === 'string' ? metadata.targetIdentifier.trim() : ''
  if (target.length > 0) {
    return target
  }

  return `signal:${signalId}`
}

function blendRate(current: number, observed: number, samples = 1) {
  const weight = clamp(samples / (samples + 4), 0.1, 0.6)
  return clamp((current * (1 - weight)) + (observed * weight))
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function minutesSince(from: string | null | undefined, to: string) {
  const fromTimestamp = toTimestamp(from)
  const toTimestampValue = toTimestamp(to)
  if (fromTimestamp === null || toTimestampValue === null) {
    return null
  }

  return Math.max(0, (toTimestampValue - fromTimestamp) / 60000)
}

function readLeadLifecycleTimestamp(lead: PortfolioLeadRecord) {
  return lead.contactedAt ?? lead.qualifiedAt ?? lead.timestamp
}

function readSignalFeedbackScore(payload: Record<string, unknown> | undefined) {
  const feedback = payload?.channelFeedback
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) {
    return 0
  }

  const feedbackRecord = feedback as Record<string, unknown>
  const sentiment = typeof feedbackRecord.sentiment === 'string' ? feedbackRecord.sentiment.toLowerCase() : ''
  const delivered = feedbackRecord.delivered === true || feedbackRecord.replyReceived === true
  const failed = feedbackRecord.failed === true || feedbackRecord.bounced === true || feedbackRecord.unsubscribed === true

  if (failed || sentiment === 'negative') {
    return -1
  }

  if (delivered || sentiment === 'positive') {
    return 1
  }

  return 0
}

function readEventFeedbackScore(eventPayload: Record<string, unknown>) {
  const rating = typeof eventPayload.rating === 'number' ? eventPayload.rating : null
  const feedback = typeof eventPayload.feedback === 'string' ? eventPayload.feedback.toLowerCase() : ''
  const status = typeof eventPayload.status === 'string' ? eventPayload.status.toLowerCase() : ''

  if ((rating !== null && rating >= 4) || feedback.includes('resolved') || feedback.includes('fechado') || status === 'success') {
    return 1
  }

  if ((rating !== null && rating <= 2) || feedback.includes('failed') || feedback.includes('timeout') || status === 'failed') {
    return -1
  }

  return 0
}

function buildAutonomousCommandId(type: AutonomousLeadProgressionStep['type'], leadId: string, now: string) {
  return `${type}:autonomous:${leadId}:${now}`
}

function createRevenueEventId(leadId: string) {
  return `revenue-${normalizeIdPart(leadId)}`.slice(0, 128)
}

function readNumericPayloadValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function readStringPayloadValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function readRevenueConfirmationCandidate(value: unknown): LeadConvertCommand['reconciledRevenue'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const amount = typeof record.amount === 'number' ? record.amount : null
  if (amount === null || amount <= 0) {
    return null
  }

  const candidate: LeadConvertCommand['reconciledRevenue'] = {
    amount,
    currency: typeof record.currency === 'string' ? record.currency : 'USD',
    invoiceId: typeof record.invoiceId === 'string' ? record.invoiceId : undefined,
    paymentId: typeof record.paymentId === 'string' ? record.paymentId : undefined,
    contractId: typeof record.contractId === 'string' ? record.contractId : undefined,
  }

  if (record.externalValidation && typeof record.externalValidation === 'object' && !Array.isArray(record.externalValidation)) {
    const externalValidation = record.externalValidation as Record<string, unknown>
    if (typeof externalValidation.system === 'string' && typeof externalValidation.validatedAt === 'string') {
      candidate.externalValidation = {
        system: externalValidation.system,
        validatedAt: externalValidation.validatedAt,
        referenceId: typeof externalValidation.referenceId === 'string' ? externalValidation.referenceId : undefined,
      }
    }
  }

  if (record.confirmedByEvent && typeof record.confirmedByEvent === 'object' && !Array.isArray(record.confirmedByEvent)) {
    const confirmedByEvent = record.confirmedByEvent as Record<string, unknown>
    if (typeof confirmedByEvent.eventId === 'string') {
      candidate.confirmedByEvent = {
        eventId: confirmedByEvent.eventId,
      }
    }
  }

  return candidate
}

async function validateReconciledRevenue(args: {
  connection: BackendDatabase
  entityId: string
  reconciledRevenue: LeadConvertCommand['reconciledRevenue']
}): Promise<{
  validationMethod: PortfolioLeadRevenueValidationMethod
  externalSystem?: string
  validationReference?: string
  confirmedEventId?: string
}> {
  const hasRevenueSource = Boolean(
    args.reconciledRevenue.invoiceId
    || args.reconciledRevenue.paymentId
    || args.reconciledRevenue.contractId,
  )
  if (!hasRevenueSource) {
    throw new Error('lead.convert requires invoiceId, paymentId, or contractId for revenue reconciliation.')
  }

  if (args.reconciledRevenue.amount <= 0) {
    throw new Error('lead.convert requires a positive reconciled revenue amount.')
  }

  if (args.reconciledRevenue.externalValidation) {
    return {
      validationMethod: 'external_system',
      externalSystem: args.reconciledRevenue.externalValidation.system,
      validationReference: args.reconciledRevenue.externalValidation.referenceId,
    }
  }

  if (!args.reconciledRevenue.confirmedByEvent?.eventId) {
    throw new Error('lead.convert requires external validation or confirmedByEvent for revenue reconciliation.')
  }

  const eventRepository = new EntityEventLogRepository(args.connection)
  const confirmationEvent = await eventRepository.getEventById(args.reconciledRevenue.confirmedByEvent.eventId)
  if (!confirmationEvent || confirmationEvent.entityId !== args.entityId) {
    throw new Error('lead.convert revenue confirmation event was not found for this entity.')
  }

  const amount = readNumericPayloadValue(confirmationEvent.payload, ['amount', 'revenueAmount'])
  if (amount !== null && amount !== args.reconciledRevenue.amount) {
    throw new Error('lead.convert reconciled revenue amount does not match the confirmation event.')
  }

  for (const [field, expected] of [
    ['invoiceId', args.reconciledRevenue.invoiceId],
    ['paymentId', args.reconciledRevenue.paymentId],
    ['contractId', args.reconciledRevenue.contractId],
  ] as const) {
    if (!expected) {
      continue
    }

    const actual = readStringPayloadValue(confirmationEvent.payload, [field])
    if (actual !== null && actual !== expected) {
      throw new Error(`lead.convert ${field} does not match the confirmation event.`)
    }
  }

  return {
    validationMethod: 'event_confirmation',
    confirmedEventId: confirmationEvent.id,
  }
}

function deriveLeadSignals(args: {
  entityProfile: EntityProfile
  registryEntry: MultiEntityRegistryRecord
  recentEventTypes: string[]
  recentSocialSignalTypes: string[]
}) {
  const signals: Array<{
    entityId: string
    market: string
    source: string
    intent: string
    urgency: PortfolioLeadSignalRecord['urgency']
    estimatedValue: number
    confidence: number
    recommendedAction: string
  }> = []
  const exportFormats = Array.isArray(args.entityProfile.export?.formatsEnabled)
    ? args.entityProfile.export.formatsEnabled
    : []

  if (args.recentSocialSignalTypes.some((type) => type === 'interacted' || type === 'shared')) {
    signals.push({
      entityId: args.registryEntry.entityId,
      market: args.registryEntry.market,
      source: 'inbound_message',
      intent: 'commercial_follow_up',
      urgency: 'medium',
      estimatedValue: clamp(0.45 + args.registryEntry.leadGenerationScore * 0.35),
      confidence: clamp(0.54 + args.registryEntry.healthScore * 0.24),
      recommendedAction: 'qualify_lead',
    })
  }

  if (args.registryEntry.market === 'legal' && !args.registryEntry.rollbackState.active) {
    signals.push({
      entityId: args.registryEntry.entityId,
      market: args.registryEntry.market,
      source: 'marketplace_demand',
      intent: 'legal_intake_demand',
      urgency: args.registryEntry.riskLevel === 'high' ? 'high' : 'medium',
      estimatedValue: clamp(0.58 + args.registryEntry.autonomyReadiness * 0.18),
      confidence: clamp(0.56 + args.registryEntry.leadGenerationScore * 0.22),
      recommendedAction: 'route_lead',
    })
  }

  if (args.registryEntry.healthScore >= 0.55 && args.registryEntry.leadGenerationScore <= 0.42) {
    signals.push({
      entityId: args.registryEntry.entityId,
      market: args.registryEntry.market,
      source: 'performance_gap',
      intent: 'lead_gap',
      urgency: 'medium',
      estimatedValue: clamp(0.35 + args.registryEntry.healthScore * 0.25),
      confidence: clamp(0.6 + (1 - args.registryEntry.leadGenerationScore) * 0.2),
      recommendedAction: 'create_offer',
    })
  }

  if (exportFormats.length === 0 && args.registryEntry.healthScore >= 0.48) {
    signals.push({
      entityId: args.registryEntry.entityId,
      market: args.registryEntry.market,
      source: 'content_opportunity',
      intent: 'content_gap',
      urgency: 'low',
      estimatedValue: clamp(0.24 + args.registryEntry.healthScore * 0.18),
      confidence: clamp(0.46 + args.registryEntry.memoryConfidence * 0.18),
      recommendedAction: 'qualify_lead',
    })
  }

  if (args.recentEventTypes.some((type) => type.includes('interaction') || type.includes('share'))) {
    signals.push({
      entityId: args.registryEntry.entityId,
      market: args.registryEntry.market,
      source: 'public_chat',
      intent: 'active_interest',
      urgency: 'medium',
      estimatedValue: clamp(0.3 + args.registryEntry.leadGenerationScore * 0.22),
      confidence: clamp(0.5 + args.registryEntry.memoryConfidence * 0.16),
      recommendedAction: args.registryEntry.market === 'legal' ? 'trigger_marketplace_case' : 'route_lead',
    })
  }

  return signals
}

function deriveEntityMetrics(args: {
  registryEntry: MultiEntityRegistryRecord
  leadSignals: Array<{ confidence: number, estimatedValue: number }>
}) {
  const signalConfidence = args.leadSignals.length > 0
    ? args.leadSignals.reduce((sum, signal) => sum + signal.confidence, 0) / args.leadSignals.length
    : 0
  const signalValue = args.leadSignals.length > 0
    ? args.leadSignals.reduce((sum, signal) => sum + signal.estimatedValue, 0) / args.leadSignals.length
    : 0
  const conversionScore = clamp((args.registryEntry.memoryConfidence * 0.4) + (signalConfidence * 0.35) + ((1 - args.registryEntry.riskScore) * 0.25))
  const revenuePotential = clamp((args.registryEntry.leadGenerationScore * 0.35) + (signalValue * 0.4) + (conversionScore * 0.25))
  const cacEstimate = clamp(1 - ((args.registryEntry.leadGenerationScore * 0.55) + (conversionScore * 0.45)))
  const ltvEstimate = clamp((revenuePotential * 0.58) + (args.registryEntry.healthScore * 0.26) + (args.registryEntry.autonomyReadiness * 0.16))
  const roiEstimate = clamp((ltvEstimate * 0.7) + ((1 - cacEstimate) * 0.3))
  const budgetUtilization = clamp(
    args.registryEntry.actionQueue.filter((entry) => String(entry.type ?? '').includes('budget')).length * 0.25,
  )
  const opportunityScore = clamp(
    (revenuePotential * 0.28)
    + (args.registryEntry.leadGenerationScore * 0.18)
    + (conversionScore * 0.16)
    + (roiEstimate * 0.14)
    + (args.registryEntry.autonomyReadiness * 0.12)
    + ((1 - args.registryEntry.riskScore) * 0.12),
  )

  return {
    opportunityScore,
    roiEstimate,
    revenuePotential,
  }
}

export class SovereignMutationCommandService {
  constructor(private readonly dependencies: SovereignMutationCommandServiceDependencies) {}

  private async evaluateAutonomousLeadProgression(args: {
    lead: PortfolioLeadRecord
    now: string
    source: 'portfolio.lead.route' | 'portfolio.scan' | 'lead.transition'
  }): Promise<PortfolioLeadRecord> {
    let currentLead = args.lead

    for (;;) {
      const step = await this.determineAutonomousLeadProgression({
        lead: currentLead,
        now: args.now,
      })
      if (!step) {
        return currentLead
      }

      const result = await this.submitCommand(
        step.type === 'lead.qualify'
          ? {
              type: 'lead.qualify',
              commandId: step.commandId,
              entityId: currentLead.entityId,
              leadId: currentLead.leadId,
              occurredAt: args.now,
            }
          : step.type === 'lead.contact'
            ? {
                type: 'lead.contact',
                commandId: step.commandId,
                entityId: currentLead.entityId,
                leadId: currentLead.leadId,
                occurredAt: args.now,
              }
            : step.type === 'lead.convert'
              ? {
                  type: 'lead.convert',
                  commandId: step.commandId,
                  entityId: currentLead.entityId,
                  leadId: currentLead.leadId,
                  occurredAt: args.now,
                  reconciledRevenue: step.reconciledRevenue!,
                }
              : {
                  type: 'lead.mark_lost',
                  commandId: step.commandId,
                  entityId: currentLead.entityId,
                  leadId: currentLead.leadId,
                  occurredAt: args.now,
                  lostReason: step.reason,
                },
      ) as PortfolioLeadLifecycleResult

      if (!result.lead || result.changed === false) {
        return result.lead ?? currentLead
      }

      currentLead = result.lead
      if (currentLead.status === 'converted' || currentLead.status === 'lost') {
        return currentLead
      }
    }
  }

  private async determineAutonomousLeadProgression(args: {
    lead: PortfolioLeadRecord
    now: string
  }): Promise<AutonomousLeadProgressionStep | null> {
    if (args.lead.status === 'converted' || args.lead.status === 'lost') {
      return null
    }

    const signalRepository = new PortfolioLeadSignalRepository(this.dependencies.connection)
    const eventRepository = new EntityEventLogRepository(this.dependencies.connection)
    const memoryRepository = new EntityCognitiveMemoryRepository(this.dependencies.connection)
    const socialSignalRepository = new SocialSignalRepository(this.dependencies.connection)

    const [signal, recentEvents, recentSocialSignals, memoryRecord] = await Promise.all([
      signalRepository.getById(args.lead.signalId),
      eventRepository.getRecentEvents(args.lead.entityId, 20),
      socialSignalRepository.getSignals(args.lead.entityId, 20),
      memoryRepository.getByEntityId(args.lead.entityId),
    ])

    const recentLeadEvents = recentEvents.filter((event) => {
      const payloadLeadId = typeof event.payload?.leadId === 'string' ? event.payload.leadId : null
      return payloadLeadId === args.lead.leadId || event.type.startsWith('portfolio.lead.')
    })
    const feedbackScores = [
      readSignalFeedbackScore(signal?.payload),
      readSignalFeedbackScore(args.lead.payload),
      ...recentLeadEvents.map((event) => readEventFeedbackScore(event.payload)),
    ]
    const feedbackScore = feedbackScores.some((score) => score < 0)
      ? -1
      : feedbackScores.some((score) => score > 0)
        ? 1
        : 0
    const failureSignal = feedbackScore < 0
      || recentLeadEvents.some((event) => /failed|rejected|timeout|bounce|lost/i.test(event.type))
    const interactionScore = recentSocialSignals.reduce((total, socialSignal) => {
      if (socialSignal.type === 'interacted') {
        return total + 1.2
      }
      if (socialSignal.type === 'shared' || socialSignal.type === 'followed') {
        return total + 0.8
      }
      if (socialSignal.type === 'viewed' || socialSignal.type === 'exported') {
        return total + 0.35
      }

      return total
    }, 0)
    const memory = memoryRecord?.memory ?? createDefaultEntityCognitiveMemory()
    const memorySuccess = clamp(memory.historicalSignals.rollingSuccessRate)
    const memoryEvidence = Math.max(0, memory.historicalSignals.reliableEvidenceCount)
    const signalConfidence = signal?.confidence ?? Number(args.lead.payload.confidence ?? 0)
    const signalValue = signal?.estimatedValue ?? Number(args.lead.payload.estimatedValue ?? 0)
    const urgency = signal?.urgency ?? String(args.lead.payload.urgency ?? 'low')
    const urgencyBoost = urgency === 'critical' ? 0.2 : urgency === 'high' ? 0.12 : urgency === 'medium' ? 0.06 : 0
    const signalStrength = clamp((signalConfidence * 0.5) + (signalValue * 0.2) + (memorySuccess * 0.2) + urgencyBoost + (interactionScore >= 1 ? 0.1 : 0))
    const minutesFromRoute = minutesSince(args.lead.timestamp, args.now) ?? 0
    const minutesFromLastAction = minutesSince(readLeadLifecycleTimestamp(args.lead), args.now) ?? minutesFromRoute
    const successSignals = feedbackScore > 0 || interactionScore >= 2 || (memorySuccess >= 0.7 && memoryEvidence >= 1 && signalStrength >= 0.72)
    const immediateSuccessSignals = feedbackScore > 0 && interactionScore >= 2
    const revenueCandidate = readRevenueConfirmationCandidate(signal?.payload.revenueCandidate)
      ?? readRevenueConfirmationCandidate(args.lead.payload.revenueCandidate)
    const timeoutReached = args.lead.status === 'contacted'
      ? minutesFromLastAction >= 120
      : args.lead.status === 'qualified'
        ? minutesFromLastAction >= 90
        : minutesFromRoute >= 60

    if (failureSignal) {
      return {
        type: 'lead.mark_lost',
        commandId: buildAutonomousCommandId('lead.mark_lost', args.lead.leadId, args.now),
        reason: 'autonomous_failure_signal',
        trigger: 'channel_feedback',
      }
    }

    if (args.lead.status === 'routed' && signalStrength >= 0.78) {
      return {
        type: 'lead.qualify',
        commandId: buildAutonomousCommandId('lead.qualify', args.lead.leadId, args.now),
        reason: 'autonomous_high_signal_strength',
        trigger: 'memory_patterns',
      }
    }

    if ((args.lead.status === 'routed' || args.lead.status === 'qualified') && (minutesFromRoute >= 3 || signalStrength >= 0.78 || interactionScore >= 2)) {
      return {
        type: 'lead.contact',
        commandId: buildAutonomousCommandId('lead.contact', args.lead.leadId, args.now),
        reason: 'autonomous_post_route_contact',
        trigger: interactionScore >= 1 ? 'interaction_events' : 'time_since_last_action',
      }
    }

    if (args.lead.status === 'contacted' && successSignals && revenueCandidate && (minutesFromLastAction >= 5 || immediateSuccessSignals)) {
      return {
        type: 'lead.convert',
        commandId: buildAutonomousCommandId('lead.convert', args.lead.leadId, args.now),
        reason: 'autonomous_success_signal',
        trigger: feedbackScore > 0 ? 'channel_feedback' : interactionScore >= 2 ? 'interaction_events' : 'memory_patterns',
        reconciledRevenue: revenueCandidate,
      }
    }

    if (timeoutReached) {
      return {
        type: 'lead.mark_lost',
        commandId: buildAutonomousCommandId('lead.mark_lost', args.lead.leadId, args.now),
        reason: 'autonomous_timeout',
        trigger: 'time_since_last_action',
      }
    }

    return null
  }

  async submitCommand(command: SovereignMutationCommand): Promise<SovereignMutationCommandResult> {
    return runWithMutationAuthority({
      source: 'backend/src/orchestrator/sovereignMutationCommandService.ts#submitCommand',
      viaExecutor: true,
    }, async () => {
      switch (command.type) {
        case 'entity.event.append':
          return this.executeEntityEventAppend(command)
        case 'entity.create':
          return this.executeEntityCreate(command)
        case 'entity.profile.persist':
          return this.executeEntityProfilePersist(command)
        case 'entity.relationship.interaction.record':
          return this.executeEntityRelationshipInteractionRecord(command)
        case 'flowmind.partial.telemetry.record':
          return this.executeFlowMindPartialTelemetryRecord(command)
        case 'approval.resolve':
          return this.executeApprovalResolve(command)
        case 'legal.case.assign':
          return this.executeLoggedEntityEvent(command, 'legal.case.assigned', command.entityId, command.occurredAt, command.payload)
        case 'legal.case.close':
          return this.executeLoggedEntityEvent(command, 'legal.case.closed', command.entityId, command.occurredAt, command.payload)
        case 'legal.case.message.append':
          return this.executeLoggedEntityEvent(command, 'legal.case.message.appended', command.entityId, command.occurredAt, command.payload)
        case 'lead.qualify':
          return this.executePortfolioLeadTransition(command, 'qualified', 'portfolio.lead.qualified')
        case 'lead.contact':
          return this.executePortfolioLeadTransition(command, 'contacted', 'portfolio.lead.contacted')
        case 'lead.convert':
          return this.executePortfolioLeadTransition(command, 'converted', 'portfolio.lead.converted')
        case 'lead.mark_lost':
          return this.executePortfolioLeadTransition(command, 'lost', 'portfolio.lead.lost')
        case 'orchestrator.command.execute':
          return this.executeOrchestratorCommand(command)
        case 'portfolio.lead.route':
          return this.executePortfolioLeadRoute(command)
        case 'portfolio.scan':
          return this.executePortfolioScan(command)
        case 'portfolio.proposal.transition':
          return this.executePortfolioProposalTransition(command)
        case 'portfolio.proposal.evaluate':
          return this.executePortfolioProposalEvaluate(command)
        case 'public.export.view.record':
          return this.executePublicExportViewRecord(command)
        case 'public.interaction.resolve':
          return this.executeLoggedEntityEvent(command, 'public.interaction.resolved', command.entityId, command.occurredAt, command.payload)
      }
    })
  }

  private requireRelationshipEngine(): RelationshipEngine {
    if (!this.dependencies.relationshipEngine) {
      throw new Error('Relationship engine is not configured for sovereign commands.')
    }

    return this.dependencies.relationshipEngine
  }

  private requireSocialSignalEngine(): SocialSignalEngine {
    if (!this.dependencies.socialSignalEngine) {
      throw new Error('Social signal engine is not configured for sovereign commands.')
    }

    return this.dependencies.socialSignalEngine
  }

  private requireGlobalFeedEngine(): GlobalFeedEngine {
    if (!this.dependencies.globalFeedEngine) {
      throw new Error('Global feed engine is not configured for sovereign commands.')
    }

    return this.dependencies.globalFeedEngine
  }

  private requireMonetizationService(): MonetizationService {
    if (!this.dependencies.monetizationService) {
      throw new Error('Monetization service is not configured for sovereign commands.')
    }

    return this.dependencies.monetizationService
  }

  private requireGrowthEngine(): GrowthEngine {
    if (!this.dependencies.growthEngine) {
      throw new Error('Growth engine is not configured for sovereign commands.')
    }

    return this.dependencies.growthEngine
  }

  private async executeLoggedEntityEvent(
    command:
      | PublicInteractionResolveCommand
      | LegalCaseAssignCommand
      | LegalCaseMessageAppendCommand
      | LegalCaseCloseCommand,
    eventType: string,
    entityId: string,
    occurredAt: string,
    payload: Record<string, unknown>,
  ): Promise<EventMutationResult> {
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, entityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const event = await new EntityEventLogRepository(this.dependencies.connection).getEventByCommandId(entityId, command.commandId)
      return { event, changed: false }
    }

    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })

        const event = await events.logEvent({
          entityId,
          type: eventType,
          timestamp: occurredAt,
          causedByCommandId: command.commandId,
          payload: toJsonObject(payload),
        })

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: event.timestamp,
          lastEventId: event.id,
          createdAt: occurredAt,
          updatedAt: event.timestamp,
        })

        return { event, changed: true }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_EVENT_APPEND_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Entity event append failed.',
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })
      throw error
    }
  }

  private async executeFlowMindPartialTelemetryRecord(command: FlowMindPartialTelemetryRecordCommand): Promise<MultiEventMutationResult> {
    if (command.events.length === 0) {
      return { events: [], changed: false }
    }

    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, command.entityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const eventRepository = new EntityEventLogRepository(this.dependencies.connection)
      const events = await Promise.all(command.events.map(async (event) => {
        return eventRepository.getEventByCommandId(command.entityId, command.commandId)
      }))
      return { events: events.filter((event): event is EntityEventLogRecord => Boolean(event)), changed: false }
    }

    const createdAt = command.events[0].timestamp
    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const eventRepository = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
        })

        const events: EntityEventLogRecord[] = []
        for (const event of command.events) {
          events.push(await eventRepository.logEvent({
            entityId: command.entityId,
            type: event.type,
            timestamp: event.timestamp,
            causedByCommandId: command.commandId,
            payload: toJsonObject(event.payload),
          }))
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: events[events.length - 1]?.timestamp ?? createdAt,
          lastEventId: events[events.length - 1]?.id,
          createdAt,
          updatedAt: events[events.length - 1]?.timestamp ?? createdAt,
        })

        return { events, changed: true }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_PARTIAL_TELEMETRY_RECORD_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Partial telemetry record failed.',
        createdAt,
        updatedAt: createdAt,
      })
      throw error
    }
  }

  private async executeEntityRelationshipInteractionRecord(command: EntityRelationshipInteractionRecordCommand): Promise<EntityRelationshipInteractionResult> {
    const relationshipEngine = this.requireRelationshipEngine()
    const socialSignalEngine = this.requireSocialSignalEngine()
    const globalFeedEngine = this.requireGlobalFeedEngine()
    const growthEngine = this.requireGrowthEngine()

    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, command.sourceEntityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const relationshipRepository = new EntityRelationshipRepository(this.dependencies.connection)
      const eventRepository = new EntityEventLogRepository(this.dependencies.connection)
      const [sourceToTarget, targetToSource, sourceEvent, targetEvent] = await Promise.all([
        relationshipRepository.getRelationship({
          sourceEntityId: command.sourceEntityId,
          targetEntityId: command.targetEntityId,
          relationType: command.relationType,
        }),
        relationshipRepository.getRelationship({
          sourceEntityId: command.targetEntityId,
          targetEntityId: command.sourceEntityId,
          relationType: command.reverseRelationType,
        }),
        eventRepository.getEventByCommandId(command.sourceEntityId, command.commandId),
        eventRepository.getEventByCommandId(command.targetEntityId, command.commandId),
      ])
      if (!sourceToTarget || !targetToSource || !sourceEvent || !targetEvent) {
        throw new Error(`Missing idempotent state for entity relationship interaction "${command.commandId}".`)
      }
      return {
        changed: false,
        relationships: { sourceToTarget, targetToSource },
        events: { source: sourceEvent, target: targetEvent },
      }
    }

    try {
      const [sourceToTarget, targetToSource] = await Promise.all([
        relationshipEngine.updateRelationship({
          sourceEntityId: command.sourceEntityId,
          targetEntityId: command.targetEntityId,
          relationType: command.relationType,
          strengthDelta: command.strengthDelta,
          lastInteractionAt: command.occurredAt,
        }),
        relationshipEngine.updateRelationship({
          sourceEntityId: command.targetEntityId,
          targetEntityId: command.sourceEntityId,
          relationType: command.reverseRelationType,
          strengthDelta: command.reverseStrengthDelta,
          lastInteractionAt: command.occurredAt,
        }),
      ])

      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
        })

        const [sourceEvent, targetEvent] = await Promise.all([
          events.logEvent({
            entityId: command.sourceEntityId,
            type: 'interaction.message',
            causedByCommandId: command.commandId,
            timestamp: command.occurredAt,
            payload: {
              summary: command.summary,
              topics: command.topics,
              targetEntityId: command.targetEntityId,
              interactionType: command.interactionType,
            },
          }),
          events.logEvent({
            entityId: command.targetEntityId,
            type: 'interaction.message',
            causedByCommandId: command.commandId,
            timestamp: command.occurredAt,
            payload: {
              summary: command.summary,
              topics: command.topics,
              sourceEntityId: command.sourceEntityId,
              interactionType: command.interactionType,
            },
          }),
        ])

        await Promise.all([
          socialSignalEngine.registerSignal({
            entityId: command.sourceEntityId,
            ownerId: command.sourceOwnerId,
            type: 'interacted',
            timestamp: command.occurredAt,
            source: 'entity-to-entity',
            actorId: command.targetEntityId,
            weight: Math.max(0.28, command.strengthDelta),
            metadata: {
              targetEntityId: command.targetEntityId,
              interactionType: command.interactionType,
            },
          }),
          socialSignalEngine.registerSignal({
            entityId: command.targetEntityId,
            ownerId: command.targetOwnerId,
            type: 'interacted',
            timestamp: command.occurredAt,
            source: 'entity-to-entity',
            actorId: command.sourceEntityId,
            weight: Math.max(0.24, command.strengthDelta * 0.86),
            metadata: {
              sourceEntityId: command.sourceEntityId,
              interactionType: command.interactionType,
            },
          }),
        ])

        const [feedItem] = await Promise.all([
          globalFeedEngine.publishFeedItem({
            entityId: command.sourceEntityId,
            ownerId: command.sourceOwnerId,
            type: 'interaction_happened',
            timestamp: command.occurredAt,
            relevanceScore: Math.max(0.54, command.strengthDelta),
            content: {
              entityName: command.sourceEntityName,
              targetEntityId: command.targetEntityId,
              targetEntityName: command.targetEntityName,
              interactionType: command.interactionType,
              summary: command.summary,
            },
            visibility: 'public',
          }),
          growthEngine.trackEvent({
            entityId: command.sourceEntityId,
            ownerId: command.sourceOwnerId,
            type: 'entity_interacted',
            actorId: command.targetEntityId,
            metadata: {
              targetEntityId: command.targetEntityId,
              interactionType: command.interactionType,
              strengthDelta: command.strengthDelta,
            },
          }),
        ])

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: command.occurredAt,
          lastEventId: targetEvent.id,
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
        })

        return {
          changed: true,
          relationships: {
            sourceToTarget,
            targetToSource,
          },
          events: {
            source: sourceEvent,
            target: targetEvent,
          },
          feedItem,
        }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_ENTITY_RELATIONSHIP_INTERACTION_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Entity relationship interaction failed.',
        createdAt: command.occurredAt,
        updatedAt: command.occurredAt,
      })
      throw error
    }
  }

  private async executePublicExportViewRecord(command: PublicExportViewRecordCommand): Promise<PublicExportViewRecordResult> {
    const socialSignalEngine = this.requireSocialSignalEngine()
    const growthEngine = this.requireGrowthEngine()

    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, command.entityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const event = await new EntityEventLogRepository(this.dependencies.connection).getEventByCommandId(command.entityId, command.commandId)
      return { changed: false, event }
    }

    try {
      const insertedViewedSignal = await socialSignalEngine.registerSignalIfActorAbsentSince({
        entityId: command.entityId,
        ownerId: command.ownerId,
        type: 'viewed',
        timestamp: command.occurredAt,
        source: 'public-export-link',
        actorId: command.actorId,
        weight: command.actorKind === 'authenticated' ? 0.18 : 0.045,
        metadata: {
          exportId: command.exportId,
          format: command.exportFormat,
          _signalTrust: command.actorKind,
        },
      }, command.signalSince)

      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
        })

        let event: EntityEventLogRecord | null = null
        if (insertedViewedSignal) {
          event = await events.logEvent({
            entityId: command.entityId,
            type: 'interaction.click',
            timestamp: command.occurredAt,
            causedByCommandId: command.commandId,
            payload: {
              target: 'public-export-link',
              summary: `Public export ${command.exportId} viewed.`,
              exportId: command.exportId,
              _signalTrust: command.actorKind,
            },
          })

          await growthEngine.trackEvent({
            entityId: command.entityId,
            ownerId: command.ownerId,
            type: 'export_viewed',
            actorId: command.actorId,
            metadata: {
              exportId: command.exportId,
              format: command.exportFormat,
              _signalTrust: command.actorKind,
            },
          })
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: command.occurredAt,
          lastEventId: event?.id,
          createdAt: command.occurredAt,
          updatedAt: command.occurredAt,
        })

        return {
          changed: Boolean(insertedViewedSignal),
          event,
        }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_PUBLIC_EXPORT_VIEW_RECORD_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Public export view record failed.',
        createdAt: command.occurredAt,
        updatedAt: command.occurredAt,
      })
      throw error
    }
  }

  private async executeEntityEventAppend(command: EntityEventAppendCommand): Promise<EventMutationResult> {
    const globalFeedEngine = this.requireGlobalFeedEngine()
    const monetizationService = this.requireMonetizationService()
    const growthEngine = this.requireGrowthEngine()

    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, command.entityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const event = await new EntityEventLogRepository(this.dependencies.connection).getEventByCommandId(command.entityId, command.commandId)
      return { event, changed: false }
    }

    const timestamp = command.event.timestamp ?? new Date().toISOString()
    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: timestamp,
          updatedAt: timestamp,
        })

        const event = await events.logEvent({
          id: command.event.id,
          entityId: command.entityId,
          type: command.event.type,
          payload: toJsonObject(command.event.payload),
          timestamp,
          causedByCommandId: command.event.causedByCommandId ?? command.commandId,
        })

        await globalFeedEngine.publishFromEvent({
          event,
          entity: command.entityProfile,
          ownerId: command.ownerId,
        })
        await monetizationService.incrementUsage({
          entityId: command.entityId,
          ownerUserId: command.ownerUserId,
          ownerTenantId: command.ownerTenantId,
          messagesCount: command.event.type === 'interaction.message' ? 1 : 0,
          socialInteractions: /^interaction\./.test(command.event.type) ? 1 : 0,
          flowMindActions: command.event.causedByCommandId ? 1 : 0,
          memoryUsage: command.memoryUsage,
        })

        if (command.event.type === 'return.visit') {
          await growthEngine.trackEvent({
            entityId: command.entityId,
            ownerId: command.ownerId,
            type: 'return_visit',
            metadata: {
              causedByCommandId: command.event.causedByCommandId ?? '',
            },
          })
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: event.timestamp,
          lastEventId: event.id,
          createdAt: timestamp,
          updatedAt: event.timestamp,
        })

        return { event, changed: true }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_ENTITY_EVENT_APPEND_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Entity event append failed.',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      throw error
    }
  }

  private async executeEntityCreate(command: EntityCreateCommand): Promise<EntityMutationResult> {
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, command.entityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const existing = await new EntityRepository(this.dependencies.connection).getEntityById(command.entityId)
      return { entity: existing, changed: false }
    }

    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const entityRepository = new EntityRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.now,
          updatedAt: command.now,
        })

        const created = await entityRepository.createEntity({
          id: command.entityId,
          ownerId: command.ownerId,
          ownerUserId: command.ownerUserId,
          ownerTenantId: command.ownerTenantId,
          entityProfile: command.entityProfile,
          createdAt: command.now,
          updatedAt: command.now,
        })

        if (command.event) {
          await events.logEvent({
            entityId: command.entityId,
            type: command.event.type,
            timestamp: command.event.timestamp,
            causedByCommandId: command.commandId,
            payload: toJsonObject(command.event.payload),
          })
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: command.now,
          createdAt: command.now,
          updatedAt: command.now,
        })

        return { entity: created, changed: true }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_ENTITY_CREATE_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Entity create failed.',
        createdAt: command.now,
        updatedAt: command.now,
      })
      throw error
    }
  }

  private async executeEntityProfilePersist(command: EntityProfilePersistCommand): Promise<EntityMutationResult> {
    const rootRepository = new EntityRepository(this.dependencies.connection)
    const existing = await rootRepository.getEntityById(command.entityId)
    if (!existing) {
      return { entity: null, changed: false, blockedReason: 'not_found' }
    }

    const updatedAt = command.updatedAt ?? new Date().toISOString()
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const decision = buildDecision(command, command.entityId)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const refreshed = await rootRepository.getEntityById(command.entityId)
      return { entity: refreshed, changed: false }
    }

    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const entityRepository = new EntityRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: updatedAt,
          updatedAt,
        })

        const updated = await entityRepository.updateEntity({
          id: command.entityId,
          entityProfile: command.entityProfile,
          updatedAt,
        })

        if (!updated) {
          throw new Error(`Entity "${command.entityId}" not found during persist.`)
        }

        if (command.event) {
          await events.logEvent({
            entityId: command.entityId,
            type: command.event.type,
            timestamp: command.event.timestamp,
            causedByCommandId: command.commandId,
            payload: toJsonObject(command.event.payload),
          })
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: updatedAt,
          createdAt: updatedAt,
          updatedAt,
        })

        return { entity: updated, changed: true }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_ENTITY_PERSIST_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Entity persist failed.',
        createdAt: updatedAt,
        updatedAt,
      })
      throw error
    }
  }

  private async executeApprovalResolve(command: ApprovalResolveCommand): Promise<ApprovalResolveResult> {
    const rootQueue = new FlowMindApprovalQueue(this.dependencies.connection)
    const existing = await rootQueue.getById(command.approvalId)
    if (!existing) {
      return { approval: null, changed: false, blockedReason: 'not_found' }
    }

    const decision = buildDecision(command, existing.entityId)
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const approval = await rootQueue.getById(command.approvalId)
      return { approval, changed: false }
    }

    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const queue = new FlowMindApprovalQueue(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.now,
          updatedAt: command.now,
        })

        const result = await queue.resolve({
          approvalId: command.approvalId,
          status: command.status,
          resolvedAt: command.now,
          resolvedBy: command.actorId,
        })

        if (result.record && result.changed) {
          await events.logEvent({
            entityId: result.record.entityId,
            type: `flowmind.approval.${command.status}`,
            timestamp: command.now,
            causedByCommandId: decision.commandId,
            payload: {
              approvalId: result.record.approvalId,
              actionType: result.record.actionType,
              decidedBy: command.actorId,
              status: result.record.status,
            },
          })
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: command.now,
          createdAt: command.now,
          updatedAt: command.now,
        })

        return {
          approval: result.record,
          changed: result.changed,
          blockedReason: result.blockedReason,
        }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_APPROVAL_RESOLVE_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Approval resolve failed.',
        createdAt: command.now,
        updatedAt: command.now,
      })
      throw error
    }
  }

  private async executeOrchestratorCommand(command: OrchestratorCommandExecuteCommand): Promise<OrchestratorCommandExecuteResult> {
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      return {
        changed: false,
        idempotent: true,
      }
    }

    const entityRepository = new EntityRepository(this.dependencies.connection)
    const entity = await entityRepository.getEntityById<EntityProfile>(command.entityId)
    if (!entity) {
      throw {
        statusCode: 404,
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${command.entityId}" was not found.`,
      }
    }

    const transaction = await executeFlowMindCommandTransaction({
      connection: this.dependencies.connection,
      flowMindService: this.dependencies.flowMindService,
      ledgerRepository: rootLedger,
    }, {
      entity: {
        id: entity.id,
        entityProfile: entity.entityProfile,
      },
      requestCommand: command.requestCommand,
      actorId: command.actorId,
    })

    return {
      changed: true,
      idempotent: false,
      transaction,
    }
  }

  private async executePortfolioLeadRoute(
    command: PortfolioLeadRouteCommand,
    database: BackendDatabase = this.dependencies.connection,
    transactionBoundaryActive = false,
  ): Promise<PortfolioLeadRouteResult> {
    const signalRepository = new PortfolioLeadSignalRepository(database)
    const leadRepository = new PortfolioLeadRepository(database)
    const signal = await signalRepository.getById(command.signalId)
    if (!signal || signal.entityId !== command.entityId) {
      return { lead: null, changed: false, blockedReason: 'signal_not_found' }
    }

    const leadId = command.leadId ?? createLeadId(command.entityId, command.signalId)
    const commandWithLeadId: PortfolioLeadRouteCommand = {
      ...command,
      leadId,
    }
    const decision = buildDecision(commandWithLeadId, command.entityId)
    const rootLedger = new FlowMindExecutionLedgerRepository(database)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const lead = await leadRepository.getById(leadId)
      const event = await new EntityEventLogRepository(database).getEventByCommandId(command.entityId, command.commandId)
      const executionResult = readLeadExecutionResult(lead)
      return {
        lead,
        changed: false,
        event,
        executionResult,
        externalReferenceId: executionResult?.externalReferenceId,
      }
    }

    const executeWithin = async (tx: BackendDatabase): Promise<PortfolioLeadRouteResult> => {
      const ledger = new FlowMindExecutionLedgerRepository(tx)
      const transactionalLeadRepository = new PortfolioLeadRepository(tx)
      const transactionalSignalRepository = new PortfolioLeadSignalRepository(tx)
      const events = new EntityEventLogRepository(tx)
      const transactionalSignal = await transactionalSignalRepository.getById(command.signalId)
      if (!transactionalSignal || transactionalSignal.entityId !== command.entityId) {
        return { lead: null, changed: false, blockedReason: 'signal_not_found' }
      }

      await ledger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'pending',
        createdAt: command.timestamp,
        updatedAt: command.timestamp,
      })

      const existingLead = await transactionalLeadRepository.getById(leadId)
        ?? await transactionalLeadRepository.getBySignalId(command.signalId)
      if (existingLead) {
        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: existingLead.updatedAt,
          createdAt: command.timestamp,
          updatedAt: existingLead.updatedAt,
        })
        return {
          lead: existingLead,
          changed: false,
          executionResult: readLeadExecutionResult(existingLead),
          externalReferenceId: readLeadExecutionResult(existingLead)?.externalReferenceId,
        }
      }

      const action = command.action ?? 'store_only'
      const routingStatus = action === 'trigger_intake'
        ? 'intake_requested'
        : action === 'trigger_outreach'
          ? 'outreach_requested'
          : 'stored'
      const lead = await transactionalLeadRepository.save({
        leadId,
        entityId: command.entityId,
        signalId: command.signalId,
        source: command.source,
        timestamp: command.timestamp,
        routingStatus,
        status: 'routed',
        qualifiedAt: null,
        contactedAt: null,
        convertedAt: null,
        lostAt: null,
        revenueAmount: null,
        lostReason: null,
        attributedCommandId: command.commandId,
        attribution: {
          signalId: transactionalSignal.signalId,
          signalSource: transactionalSignal.source,
          recommendedAction: transactionalSignal.recommendedAction,
          routedByCommandId: command.commandId,
          routedAt: command.timestamp,
          action,
          lifecycle: {
            lastTransition: 'routed',
            lastCommandId: command.commandId,
            commandIds: {
              routed: command.commandId,
            },
            timestamps: {
              routed: command.timestamp,
            },
          },
        },
        payload: {
          market: transactionalSignal.market,
          intent: transactionalSignal.intent,
          urgency: transactionalSignal.urgency,
          confidence: transactionalSignal.confidence,
          estimatedValue: transactionalSignal.estimatedValue,
          metadata: command.metadata ?? {},
        },
      })

      let executionResult: PortfolioLeadRouteResult['executionResult'] | undefined
      let persistedLead = lead.record

      const event = await events.logEvent({
        entityId: command.entityId,
        type: 'portfolio.lead.routed',
        timestamp: command.timestamp,
        causedByCommandId: decision.commandId,
        payload: {
          leadId: lead.record.leadId,
          signalId: lead.record.signalId,
          source: lead.record.source,
          routingStatus: lead.record.routingStatus,
            status: lead.record.status,
          attributedCommandId: lead.record.attributedCommandId,
        },
      })

      let followUpEvent: EntityEventLogRecord | null = null
      if (action === 'trigger_intake') {
        const intakeRepository = new PortfolioLeadIntakeRepository(tx)
        const intakeId = createLeadIntakeId(lead.record.leadId)
        const intake = await intakeRepository.save({
          intakeId,
          leadId: lead.record.leadId,
          entityId: lead.record.entityId,
          signalId: lead.record.signalId,
          source: lead.record.source,
          timestamp: command.timestamp,
          attributedCommandId: command.commandId,
          payload: {
            leadId: lead.record.leadId,
            entityId: lead.record.entityId,
            signalId: lead.record.signalId,
            timestamp: command.timestamp,
            attributionCommandId: command.commandId,
            action,
            metadata: command.metadata ?? {},
          },
        })
        executionResult = {
          action,
          status: intake.created ? 'created' : 'replayed',
          externalReferenceId: intake.record.intakeId,
          referenceType: 'lead_intake',
        }
        const updatedLead = await transactionalLeadRepository.save({
          ...lead.record,
          payload: {
            ...lead.record.payload,
            externalExecution: executionResult,
          },
          updatedAt: command.timestamp,
        })
        persistedLead = updatedLead.record
        followUpEvent = await events.logEvent({
          entityId: command.entityId,
          type: 'portfolio.lead.intake.created',
          timestamp: command.timestamp,
          causedByCommandId: decision.commandId,
          payload: {
            leadId: persistedLead.leadId,
            signalId: persistedLead.signalId,
            action,
            externalReferenceId: executionResult.externalReferenceId,
            referenceType: executionResult.referenceType,
            attribution: toJsonObject(persistedLead.attribution),
          },
        })
      } else if (action === 'trigger_outreach') {
        const channel = resolveOutreachChannel(command.metadata, lead.record.signalId)
        const targetIdentifier = resolveOutreachTargetIdentifier(command.metadata, lead.record.signalId)
        const jobId = createLeadOutreachJobId(lead.record.leadId)
        const job = await this.dependencies.jobProducer?.enqueueLeadOutreach({
          channel,
          targetIdentifier,
          leadId: lead.record.leadId,
          entityId: lead.record.entityId,
          signalId: lead.record.signalId,
          attributionCommandId: command.commandId,
          sourceCommandId: lead.record.attributedCommandId,
          timestamp: command.timestamp,
        }, {
          id: jobId,
          traceId: command.commandId,
          entityId: lead.record.entityId,
        })
        executionResult = {
          action,
          status: job ? 'enqueued' : 'replayed',
          externalReferenceId: job?.id ?? jobId,
          referenceType: 'job',
          channel,
          targetIdentifier,
        }
        const updatedLead = await transactionalLeadRepository.save({
          ...lead.record,
          payload: {
            ...lead.record.payload,
            externalExecution: executionResult,
          },
          updatedAt: command.timestamp,
        })
        persistedLead = updatedLead.record
        followUpEvent = await events.logEvent({
          entityId: command.entityId,
          type: 'portfolio.lead.outreach.enqueued',
          timestamp: command.timestamp,
          causedByCommandId: decision.commandId,
          payload: {
            leadId: persistedLead.leadId,
            signalId: persistedLead.signalId,
            action,
            externalReferenceId: executionResult.externalReferenceId,
            referenceType: executionResult.referenceType,
            channel,
            targetIdentifier,
            attribution: toJsonObject(persistedLead.attribution),
          },
        })
      }

      await ledger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'committed',
        committedAt: command.timestamp,
        lastEventId: followUpEvent?.id ?? event.id,
        createdAt: command.timestamp,
        updatedAt: command.timestamp,
      })

      return {
        lead: persistedLead,
        changed: lead.created,
        event,
        followUpEvent,
        executionResult,
        externalReferenceId: executionResult?.externalReferenceId,
      }
    }

    try {
      const result = transactionBoundaryActive
        ? await executeWithin(database)
        : await database.transaction(async (tx) => executeWithin(tx))

      if (result.lead && result.changed && !transactionBoundaryActive) {
        result.lead = await this.evaluateAutonomousLeadProgression({
          lead: result.lead,
          now: command.timestamp,
          source: 'portfolio.lead.route',
        })
      }

      return result
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_PORTFOLIO_LEAD_ROUTE_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Portfolio lead route failed.',
        createdAt: command.timestamp,
        updatedAt: command.timestamp,
      })
      throw error
    }
  }

  private async executePortfolioLeadTransition(
    command: LeadQualifyCommand | LeadContactCommand | LeadConvertCommand | LeadMarkLostCommand,
    targetStatus: PortfolioLeadStatus,
    eventType: string,
  ): Promise<PortfolioLeadLifecycleResult> {
    const leadRepository = new PortfolioLeadRepository(this.dependencies.connection)
    const currentLead = await leadRepository.getById(command.leadId)
    if (!currentLead || currentLead.entityId !== command.entityId) {
      return { lead: null, changed: false, blockedReason: 'lead_not_found' }
    }

    const decision = buildDecision(command, command.entityId)
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const lead = await leadRepository.getById(command.leadId)
      const event = await new EntityEventLogRepository(this.dependencies.connection).getEventByCommandId(command.entityId, command.commandId)
      return {
        lead,
        changed: false,
        event,
      }
    }

    const occurredAt = command.occurredAt

    const executeWithin = async (tx: BackendDatabase): Promise<PortfolioLeadLifecycleResult> => {
      const ledger = new FlowMindExecutionLedgerRepository(tx)
      const transactionalLeadRepository = new PortfolioLeadRepository(tx)
      const events = new EntityEventLogRepository(tx)
      const transactionalLead = await transactionalLeadRepository.getById(command.leadId)
      if (!transactionalLead || transactionalLead.entityId !== command.entityId) {
        return { lead: null, changed: false, blockedReason: 'lead_not_found' }
      }

      await ledger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'pending',
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })

      if (transactionalLead.status === targetStatus) {
        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })
        return {
          lead: transactionalLead,
          changed: false,
        }
      }

      if (!isLeadTransitionAllowed(transactionalLead.status, targetStatus)) {
        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })
        return {
          lead: transactionalLead,
          changed: false,
          blockedReason: 'invalid_transition',
        }
      }

      const revenueEvent = targetStatus === 'converted'
        ? await (async () => {
            const convertCommand = command as LeadConvertCommand
            const validation = await validateReconciledRevenue({
              connection: tx,
              entityId: command.entityId,
              reconciledRevenue: convertCommand.reconciledRevenue,
            })
            const revenueRepository = new PortfolioLeadRevenueEventRepository(tx)
            const savedRevenueEvent = await revenueRepository.save({
              revenueEventId: createRevenueEventId(transactionalLead.leadId),
              leadId: transactionalLead.leadId,
              entityId: transactionalLead.entityId,
              invoiceId: convertCommand.reconciledRevenue.invoiceId,
              paymentId: convertCommand.reconciledRevenue.paymentId,
              contractId: convertCommand.reconciledRevenue.contractId,
              amount: convertCommand.reconciledRevenue.amount,
              currency: convertCommand.reconciledRevenue.currency ?? 'USD',
              validationMethod: validation.validationMethod,
              externalSystem: validation.externalSystem,
              validationReference: validation.validationReference,
              confirmedEventId: validation.confirmedEventId,
              reconciliationStatus: 'reconciled',
              reconciledAt: occurredAt,
            })
            return savedRevenueEvent.record
          })()
        : null

      const transitionDetails = targetStatus === 'converted'
        ? { revenueAmount: revenueEvent?.amount }
        : targetStatus === 'lost'
          ? { lostReason: (command as LeadMarkLostCommand).lostReason }
          : undefined

      const savedLead = await transactionalLeadRepository.save({
        ...transactionalLead,
        status: targetStatus,
        qualifiedAt: targetStatus === 'qualified' ? occurredAt : transactionalLead.qualifiedAt,
        contactedAt: targetStatus === 'contacted' ? occurredAt : transactionalLead.contactedAt,
        convertedAt: targetStatus === 'converted' ? occurredAt : transactionalLead.convertedAt,
        lostAt: targetStatus === 'lost' ? occurredAt : transactionalLead.lostAt,
        revenueAmount: targetStatus === 'converted'
          ? (revenueEvent?.amount ?? transactionalLead.revenueAmount)
          : transactionalLead.revenueAmount,
        lostReason: targetStatus === 'lost'
          ? (command as LeadMarkLostCommand).lostReason
          : transactionalLead.lostReason,
        attribution: buildLeadAttributionUpdate({
          lead: transactionalLead,
          commandId: command.commandId,
          transition: targetStatus,
          occurredAt,
          details: transitionDetails,
        }),
        payload: targetStatus === 'converted'
          ? {
              ...transactionalLead.payload,
              reconciledRevenue: {
                revenueEventId: revenueEvent?.revenueEventId,
                amount: revenueEvent?.amount,
                currency: revenueEvent?.currency,
                invoiceId: revenueEvent?.invoiceId,
                paymentId: revenueEvent?.paymentId,
                contractId: revenueEvent?.contractId,
                validationMethod: revenueEvent?.validationMethod,
                externalSystem: revenueEvent?.externalSystem,
                confirmedEventId: revenueEvent?.confirmedEventId,
                reconciledAt: revenueEvent?.reconciledAt,
              },
            }
          : transactionalLead.payload,
        updatedAt: occurredAt,
      })

      if (targetStatus === 'converted' || targetStatus === 'lost') {
        await applyLeadOutcomeLearning({
          tx,
          lead: savedLead.record,
          outcomeCommandId: command.commandId,
          outcomeStatus: targetStatus,
          occurredAt,
        })
      }

      const event = await events.logEvent({
        entityId: command.entityId,
        type: eventType,
        timestamp: occurredAt,
        causedByCommandId: command.commandId,
        payload: {
          leadId: savedLead.record.leadId,
          signalId: savedLead.record.signalId,
          status: savedLead.record.status,
          attributedCommandId: savedLead.record.attributedCommandId,
          ...(targetStatus === 'converted'
            ? {
                revenueEventId: revenueEvent?.revenueEventId,
                revenueAmount: revenueEvent?.amount,
                currency: revenueEvent?.currency,
                invoiceId: revenueEvent?.invoiceId,
                paymentId: revenueEvent?.paymentId,
                contractId: revenueEvent?.contractId,
                validationMethod: revenueEvent?.validationMethod,
                confirmedEventId: revenueEvent?.confirmedEventId,
              }
            : {}),
          ...(targetStatus === 'lost' ? { lostReason: savedLead.record.lostReason } : {}),
        },
      })

      await ledger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'committed',
        committedAt: occurredAt,
        lastEventId: event.id,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })

      return {
        lead: savedLead.record,
        changed: true,
        event,
      }
    }

    try {
      const result = await this.dependencies.connection.transaction(async (tx) => executeWithin(tx))
      if (result.lead && result.changed && targetStatus !== 'converted' && targetStatus !== 'lost') {
        result.lead = await this.evaluateAutonomousLeadProgression({
          lead: result.lead,
          now: occurredAt,
          source: 'lead.transition',
        })
      }

      return result
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_PORTFOLIO_LEAD_TRANSITION_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Portfolio lead transition failed.',
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })
      throw error
    }
  }

  private async executePortfolioProposalTransition(command: PortfolioProposalTransitionCommand): Promise<PortfolioProposalCommandResult> {
    const rootProposalRepository = new PortfolioProposalRepository(this.dependencies.connection)
    const proposal = await rootProposalRepository.getById(command.proposalId)
    if (!proposal) {
      return { proposal: null, changed: false, blockedReason: 'not_found' }
    }

    const decision = buildDecision(command, proposal.entityId)
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const refreshedProposal = await rootProposalRepository.getById(command.proposalId)
      const approval = proposal.payload.approvalRequired === true
        ? await new FlowMindApprovalQueue(this.dependencies.connection).getByProposal(proposal.entityId, proposal.proposalId, proposal.proposalType)
        : null
      return { proposal: refreshedProposal, approval, changed: false }
    }

    if (proposal.status === command.status) {
      const approval = proposal.payload.approvalRequired === true
        ? await new FlowMindApprovalQueue(this.dependencies.connection).getByProposal(proposal.entityId, proposal.proposalId, proposal.proposalType)
        : null
      return { proposal, approval, changed: false }
    }

    if (!transitionAllowed(proposal.status, command.status)) {
      return { proposal, changed: false, blockedReason: 'invalid_transition' }
    }

    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const proposalRepository = new PortfolioProposalRepository(tx)
        const approvalQueue = new FlowMindApprovalQueue(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.now,
          updatedAt: command.now,
        })

        let approval: FlowMindApprovalRecord | null = null
        const approvalRequired = proposal.payload.approvalRequired === true || proposalRequiresApproval(proposal.proposalType, proposal.riskLevel)
        if (approvalRequired) {
          approval = await approvalQueue.getByProposal(proposal.entityId, proposal.proposalId, proposal.proposalType)
          if (!approval) {
            approval = await approvalQueue.enqueue({
              approvalId: buildApprovalId(proposal.entityId, proposal.proposalId),
              entityId: proposal.entityId,
              proposalId: proposal.proposalId,
              actionType: proposal.proposalType,
              rationale: proposal.rationale,
              payload: {
                proposalType: proposal.proposalType,
                proposalStatus: proposal.status,
              },
              proposalHash: hashFlowMindValue(proposal),
              payloadHash: hashFlowMindValue(proposal.payload),
              riskLevel: proposal.riskLevel,
              requestedAt: command.now,
            })
          }
        }

        if (command.status === 'approved' && approval) {
          approval = (await approvalQueue.resolve({
            approvalId: approval.approvalId,
            status: 'approved',
            resolvedAt: command.now,
            resolvedBy: command.actorId,
          })).record
        }

        if (command.status === 'rejected' && approval) {
          approval = (await approvalQueue.resolve({
            approvalId: approval.approvalId,
            status: 'rejected',
            resolvedAt: command.now,
            resolvedBy: command.actorId,
          })).record
        }

        const nextProposal = await proposalRepository.update({
          proposalId: proposal.proposalId,
          status: command.status,
          payload: {
            ...proposal.payload,
            approvalRequired,
            approvalId: approval?.approvalId ?? proposal.payload.approvalId,
            lastTransitionAt: command.now,
            lastTransitionBy: command.actorId,
          },
          updatedAt: command.now,
        })

        if (nextProposal) {
          await events.logEvent({
            entityId: proposal.entityId,
            type: `portfolio.proposal.${command.status}`,
            timestamp: command.now,
            causedByCommandId: decision.commandId,
            payload: {
              proposalId: nextProposal.proposalId,
              proposalType: nextProposal.proposalType,
              status: nextProposal.status,
              actorId: command.actorId,
              approvalId: approval?.approvalId,
            },
          })
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: command.now,
          createdAt: command.now,
          updatedAt: command.now,
        })

        return {
          proposal: nextProposal,
          approval,
          changed: true,
        }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_PORTFOLIO_TRANSITION_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Portfolio transition failed.',
        createdAt: command.now,
        updatedAt: command.now,
      })
      throw error
    }
  }

  private async executePortfolioProposalEvaluate(command: PortfolioProposalEvaluateCommand): Promise<PortfolioProposalCommandResult> {
    const rootProposalRepository = new PortfolioProposalRepository(this.dependencies.connection)
    const proposal = await rootProposalRepository.getById(command.proposalId)
    if (!proposal) {
      return { proposal: null, changed: false, blockedReason: 'not_found' }
    }
    if (proposal.status === 'rejected' || proposal.status === 'expired' || proposal.status === 'proposed') {
      return { proposal, changed: false, blockedReason: 'invalid_transition' }
    }

    const decision = buildDecision(command, proposal.entityId)
    const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
    const existingLedger = await rootLedger.getByCommandId(command.commandId)
    if (existingLedger?.status === 'committed') {
      const outcome = await new PortfolioProposalOutcomeRepository(this.dependencies.connection).getByProposalId(command.proposalId)
      const refreshed = await rootProposalRepository.getById(command.proposalId)
      return { proposal: refreshed, outcome: outcome ?? undefined, changed: false }
    }

    try {
      return await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const outcomes = new PortfolioProposalOutcomeRepository(tx)
        const proposals = new PortfolioProposalRepository(tx)
        const memoryRepository = new EntityCognitiveMemoryRepository(tx)
        const entityRepository = new EntityRepository(tx)
        const events = new EntityEventLogRepository(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.evaluatedAt,
          updatedAt: command.evaluatedAt,
        })

        const existingOutcome = await outcomes.getByProposalId(command.proposalId)
        if (existingOutcome) {
          const refreshedProposal = proposal.status === 'evaluated'
            ? proposal
            : await proposals.update({
              proposalId: proposal.proposalId,
              status: 'evaluated',
              payload: {
                ...proposal.payload,
                outcomeRecordedAt: existingOutcome.evaluatedAt,
              },
              updatedAt: existingOutcome.evaluatedAt,
            })
          await ledger.save({
            commandId: decision.commandId,
            entityId: decision.entityId,
            decisionHash: decision.decisionHash,
            status: 'committed',
            committedAt: existingOutcome.evaluatedAt,
            createdAt: command.evaluatedAt,
            updatedAt: existingOutcome.evaluatedAt,
          })
          return { proposal: refreshedProposal, outcome: existingOutcome, changed: false }
        }

        const outcome = await outcomes.save({
          proposalId: command.proposalId,
          leadsGenerated: command.leadsGenerated,
          conversions: command.conversions,
          revenue: command.revenue,
          roiObserved: command.roiObserved,
          success: command.success,
          evaluatedAt: command.evaluatedAt,
        })

        const evaluatedProposal = await proposals.update({
          proposalId: proposal.proposalId,
          status: 'evaluated',
          payload: {
            ...proposal.payload,
            outcomeRecordedAt: command.evaluatedAt,
          },
          updatedAt: command.evaluatedAt,
        })

        const memoryRecord = await memoryRepository.getByEntityId(proposal.entityId)
        const memory = hydrateEntityCognitiveMemory(
          memoryRecord?.memory ?? createDefaultEntityCognitiveMemory(),
        )
        const episodeId = `portfolio-proposal-evaluation:${proposal.proposalId}`
        if (!memory.episodicMemory.entries.some((entry) => entry.id === episodeId)) {
          memory.episodicMemory.entries = [
            {
              id: episodeId,
              summary: `portfolio-proposal:${proposal.proposalType}:${outcome.success ? 'success' : 'failure'}`,
              tags: ['portfolio', 'proposal', proposal.proposalType, outcome.success ? 'success' : 'failure'],
              relevanceScore: clamp(Math.abs(outcome.roiObserved)),
              recordedAt: outcome.evaluatedAt,
              context: {
                proposalId: proposal.proposalId,
                leadsGenerated: outcome.leadsGenerated,
                conversions: outcome.conversions,
                revenue: outcome.revenue,
                roiObserved: outcome.roiObserved,
                success: outcome.success,
              },
            },
            ...memory.episodicMemory.entries,
          ].slice(0, 24)
        }

        memory.historicalSignals = {
          ...memory.historicalSignals,
          totalInteractions: memory.historicalSignals.totalInteractions + 1,
          reliableEvidenceCount: memory.historicalSignals.reliableEvidenceCount + 1,
          rollingSuccessRate: blendRate(memory.historicalSignals.rollingSuccessRate, outcome.success ? 1 : 0),
          rollingContinuationRate: blendRate(
            memory.historicalSignals.rollingContinuationRate,
            outcome.leadsGenerated > 0 ? clamp(outcome.conversions / Math.max(outcome.leadsGenerated, 1)) : 0,
          ),
          rollingEngagementDelta: blendRate(
            (memory.historicalSignals.rollingEngagementDelta + 1) / 2,
            clamp(outcome.roiObserved),
          ) * 2 - 1,
        }

        await memoryRepository.save({
          entityId: proposal.entityId,
          memory,
          updatedAt: outcome.evaluatedAt,
        })

        const entityRecord = await entityRepository.getEntityById<EntityProfile>(proposal.entityId)
        if (entityRecord) {
          const notes = entityRecord.entityProfile.metadata.notes ?? []
          await entityRepository.updateEntity({
            id: proposal.entityId,
            updatedAt: outcome.evaluatedAt,
            entityProfile: {
              ...entityRecord.entityProfile,
              metadata: {
                ...entityRecord.entityProfile.metadata,
                updatedAt: outcome.evaluatedAt,
                confidence: clamp((entityRecord.entityProfile.metadata.confidence ?? 0.5) * 0.6 + clamp(outcome.roiObserved) * 0.4),
                notes: [
                  `portfolio-learning:${proposal.proposalId}:${outcome.success ? 'success' : 'failure'}:${outcome.roiObserved.toFixed(3)}`,
                  ...notes,
                ].slice(0, 24),
              },
            },
          })
        }

        await events.logEvent({
          entityId: proposal.entityId,
          type: 'portfolio.proposal.evaluated',
          timestamp: outcome.evaluatedAt,
          causedByCommandId: decision.commandId,
          payload: {
            proposalId: proposal.proposalId,
            proposalType: proposal.proposalType,
            status: 'evaluated',
            actorId: command.actorId,
            outcome,
          },
        })

        await ledger.save({
          commandId: decision.commandId,
          entityId: decision.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: outcome.evaluatedAt,
          createdAt: command.evaluatedAt,
          updatedAt: outcome.evaluatedAt,
        })

        return {
          proposal: evaluatedProposal,
          outcome,
          changed: true,
        }
      })
    } catch (error) {
      await rootLedger.save({
        commandId: decision.commandId,
        entityId: decision.entityId,
        decisionHash: decision.decisionHash,
        status: 'failed',
        errorCode: 'SOVEREIGN_PORTFOLIO_EVALUATE_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Portfolio evaluation failed.',
        createdAt: command.evaluatedAt,
        updatedAt: command.evaluatedAt,
      })
      throw error
    }
  }

  private async executePortfolioScan(command: PortfolioScanCommand): Promise<PortfolioScanResult> {
    const registry = new MultiEntityRegistry(this.dependencies.connection)
    const entityRepository = new EntityRepository(this.dependencies.connection)
    const eventLogRepository = new EntityEventLogRepository(this.dependencies.connection)
    const socialSignalRepository = {
      getSignals: async (entityId: string, limit = 12) => {
        const module = await import('../repositories/socialSignalRepository.js')
        return new module.SocialSignalRepository(this.dependencies.connection).getSignals(entityId, limit)
      },
    }

    const registryEntries = await registry.listEntities()
    let createdSignals = 0
    let createdLeads = 0
    let createdProposals = 0
    let createdApprovals = 0

    for (const registryEntry of registryEntries) {
      const entityRecord = await entityRepository.getEntityById<EntityProfile>(registryEntry.entityId)
      if (!entityRecord) {
        continue
      }

      const recentEvents = await eventLogRepository.getRecentEvents(registryEntry.entityId, 12)
      const recentSocialSignals = await socialSignalRepository.getSignals(registryEntry.entityId, 12)
      const leadSignals = deriveLeadSignals({
        entityProfile: entityRecord.entityProfile,
        registryEntry,
        recentEventTypes: recentEvents.map((event) => event.type),
        recentSocialSignalTypes: recentSocialSignals.map((signal) => signal.type),
      })
      const metrics = deriveEntityMetrics({
        registryEntry,
        leadSignals,
      })

      const decision = buildDecision({
        type: 'portfolio.scan',
        commandId: `${command.commandId}:${registryEntry.entityId}`,
        now: command.now,
      }, registryEntry.entityId)
      const rootLedger = new FlowMindExecutionLedgerRepository(this.dependencies.connection)
      const existingLedger = await rootLedger.getByCommandId(decision.commandId)
      if (existingLedger?.status === 'committed') {
        continue
      }

      await this.dependencies.connection.transaction(async (tx) => {
        const ledger = new FlowMindExecutionLedgerRepository(tx)
        const signalRepository = new PortfolioLeadSignalRepository(tx)
        const proposalRepository = new PortfolioProposalRepository(tx)
        const approvalQueue = new FlowMindApprovalQueue(tx)

        await ledger.save({
          commandId: decision.commandId,
          entityId: registryEntry.entityId,
          decisionHash: decision.decisionHash,
          status: 'pending',
          createdAt: command.now,
          updatedAt: command.now,
        })

        const persistedSignals: PortfolioLeadSignalRecord[] = []
        for (const signal of leadSignals) {
          const persisted = await signalRepository.save({
            signalId: createSignalId(registryEntry.entityId, signal.source, signal.intent, command.now),
            entityId: signal.entityId,
            market: signal.market,
            source: signal.source,
            intent: signal.intent,
            urgency: signal.urgency,
            estimatedValue: signal.estimatedValue,
            confidence: signal.confidence,
            recommendedAction: signal.recommendedAction,
            payload: {
              mode: 'phase-2-portfolio-scan',
              executionBlocked: true,
            },
            detectedAt: command.now,
          })
          if (persisted.created) {
            createdSignals += 1
          }
          persistedSignals.push(persisted.record)
        }

        if (metrics.opportunityScore >= 0.52 && !registryEntry.rollbackState.active) {
          const proposalId = createProposalId(registryEntry.entityId, 'propose_budget_allocation', command.now)
          const riskLevel = detectRiskLevel(registryEntry, metrics.roiEstimate)
          const approvalRequired = proposalRequiresApproval('propose_budget_allocation', riskLevel)
          const approvalId = approvalRequired ? buildApprovalId(registryEntry.entityId, proposalId) : undefined
          const existing = await proposalRepository.getById(proposalId)
          const record = await proposalRepository.save({
            proposalId,
            entityId: registryEntry.entityId,
            market: registryEntry.market,
            proposalType: 'propose_budget_allocation',
            status: existing?.status ?? 'proposed',
            riskLevel,
            priorityScore: metrics.opportunityScore,
            rationale: `Phase 2 portfolio recommendation for ${summarizeEntityName(entityRecord.entityProfile)}.`,
            payload: {
              ...existing?.payload,
              mode: 'simulation-only',
              executionBlocked: true,
              approvalRequired,
              approvalId,
              proposedDailyBudgetShare: roundMetric(clamp(metrics.opportunityScore * 0.4)),
              roiEstimate: metrics.roiEstimate,
              revenuePotential: metrics.revenuePotential,
            },
            createdAt: command.now,
            updatedAt: command.now,
          })
          if (!existing) {
            createdProposals += 1
          }
          if (approvalRequired) {
            const approval = await approvalQueue.getByProposal(record.entityId, record.proposalId, record.proposalType)
            if (!approval) {
              await approvalQueue.enqueue({
                approvalId: approvalId!,
                entityId: record.entityId,
                proposalId: record.proposalId,
                actionType: record.proposalType,
                rationale: record.rationale,
                payload: {
                  proposalType: record.proposalType,
                  proposalStatus: record.status,
                },
                proposalHash: hashFlowMindValue(record),
                payloadHash: hashFlowMindValue(record.payload),
                riskLevel: record.riskLevel,
                requestedAt: command.now,
              })
              createdApprovals += 1
            }
          }
        }

        const routableSignal = persistedSignals.find((signal) => signal.confidence >= 0.6)
        if (routableSignal) {
          const routeLead = await this.executePortfolioLeadRoute({
            type: 'portfolio.lead.route',
            commandId: `portfolio-lead-route:${routableSignal.signalId}`,
            entityId: registryEntry.entityId,
            signalId: routableSignal.signalId,
            source: routableSignal.source,
            timestamp: command.now,
            action: registryEntry.market === 'legal' || routableSignal.recommendedAction === 'trigger_marketplace_case'
              ? 'trigger_intake'
              : 'trigger_outreach',
            metadata: {
              triggeredBy: 'portfolio.scan',
              signalIntent: routableSignal.intent,
              recommendedAction: routableSignal.recommendedAction,
            },
          }, tx, true)
          if (routeLead.changed) {
            createdLeads += 1
          }
        }

        await ledger.save({
          commandId: decision.commandId,
          entityId: registryEntry.entityId,
          decisionHash: decision.decisionHash,
          status: 'committed',
          committedAt: command.now,
          createdAt: command.now,
          updatedAt: command.now,
        })
      })

      const leadRepository = new PortfolioLeadRepository(this.dependencies.connection)
      const entityLeads = (await leadRepository.list()).filter((lead) => lead.entityId === registryEntry.entityId)
      for (const lead of entityLeads) {
        await this.evaluateAutonomousLeadProgression({
          lead,
          now: command.now,
          source: 'portfolio.scan',
        })
      }
    }

    return {
      createdSignals,
      createdLeads,
      createdProposals,
      createdApprovals,
    }
  }
}

export function createSovereignMutationCommandService(dependencies: SovereignMutationCommandServiceDependencies) {
  return new SovereignMutationCommandService(dependencies)
}
