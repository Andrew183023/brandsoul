import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../db/index.js'
import { resolveFlowMindDecision } from '../flowmind/decision/resolveFlowMindDecision.js'
import type { EntityCognitiveMemoryStore } from '../flowmind/memory/entityCognitiveMemoryStore.js'
import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import type { FlowMindApprovalQueue } from './approvalQueue.js'
import { createEntityCreationProposal, type EntityCreationProposal } from './entityCreationProposal.js'
import { checkAutonomyActionPermission } from './flowMindAuthorityPolicy.js'
import {
  type MultiEntityActionRecord,
  type MultiEntityGoalRecord,
  type MultiEntityInternalGoalType,
  type MultiEntityOutcomeRecord,
  type MultiEntityRegistry,
  type MultiEntityRegistryRecord,
} from './multiEntityRegistry.js'

export type EntityRuntimeLoopDependencies = {
  database: BackendDatabase
  registry: MultiEntityRegistry
  approvalQueue: FlowMindApprovalQueue
  entityRepository: EntityRepository
  eventLogRepository: EntityEventLogRepository
  memoryStore: EntityCognitiveMemoryStore
}

export type RuntimeCommandRequest =
  | {
    type: 'entity.runtime.observe'
    commandId: string
    entityId: string
    now: string
    decisionHash: string
    memoryWritePlan: unknown[]
    expectedStateChanges: unknown[]
  }
  | {
    type: 'entity.runtime.request_approval'
    commandId: string
    entityId: string
    now: string
    proposal: EntityCreationProposal
    deniedReason?: string
    decisionHash: string
    memoryWritePlan: unknown[]
    expectedStateChanges: unknown[]
  }
  | {
    type: 'entity.runtime.execute'
    commandId: string
    entityId: string
    now: string
    action: string
    actionPayload: Record<string, unknown>
    proposal?: EntityCreationProposal
    decisionHash: string
    memoryWritePlan: unknown[]
    expectedStateChanges: unknown[]
  }

export type EntityRuntimeLoopTriggers = {
  leadScoreDrop: boolean
  growthStagnation: boolean
  opportunityDetected: boolean
  memoryPatternDetected: boolean
  portfolioGapDetected: boolean
}

export type EntityRuntimeLoopResult = {
  entityId: string
  blockedReason?: string
  proposal?: EntityCreationProposal
  commandRequest: RuntimeCommandRequest
  decision: {
    intent: string
    action: string
    confidence: number
  }
  scores: {
    healthScore: number
    leadGenerationScore: number
    memoryConfidence: number
    autonomyReadiness: number
    riskScore: number
    goalPriorityScore: number
    episodicMemoryRelevance: number
  }
  activeGoals: MultiEntityGoalRecord[]
  lastActions: MultiEntityActionRecord[]
  lastOutcomes: MultiEntityOutcomeRecord[]
  triggers: EntityRuntimeLoopTriggers
  valueLoop: {
    opportunityScore: number
    leadSignalStrength: number
    outcomeSuccessRate: number
    conversionMomentum: number
    autonomousExecutionEligible: boolean
    selectedAction: string
  }
  continuousLoop: {
    phase: 'observe' | 'evaluate' | 'execute' | 'cooldown'
    nextIntervalMs: number
    nextWakeAt: string
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function asGoalNumber(goal: Record<string, unknown>, key: 'priority' | 'impact' | 'urgency' | 'historicalSuccess', fallback: number) {
  const value = goal[key]
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value) : fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeGoalType(goalType: string | undefined): MultiEntityInternalGoalType {
  if (goalType === 'create_entity' || goalType === 'create_entities') {
    return 'create_entities'
  }
  if (goalType === 'generate_leads' || goalType === 'expand_presence' || goalType === 'optimize_performance') {
    return goalType
  }
  return 'optimize_performance'
}

function deriveScores(entity: EntityProfile, registryEntry: MultiEntityRegistryRecord) {
  const affinity = Number(entity.relational?.behaviorState?.affinityScore ?? 0.4)
  const memoryConfidence = Number(entity.relational?.userMemory?.memoryConfidence ?? registryEntry.memoryConfidence)
  const healthScore = clamp((affinity * 0.55) + (memoryConfidence * 0.45))
  const leadGenerationScore = clamp((registryEntry.leadGenerationScore * 0.6) + (entity.metadata.confidence ?? 0.4) * 0.4)
  const autonomyReadiness = clamp((healthScore * 0.45) + (memoryConfidence * 0.35) + ((1 - registryEntry.riskScore) * 0.2))

  return {
    healthScore,
    leadGenerationScore,
    memoryConfidence,
    autonomyReadiness,
    riskScore: registryEntry.riskScore,
  }
}

function classifyEventGoalType(eventType: string): MultiEntityInternalGoalType {
  if (eventType.includes('lead') || eventType.includes('interaction.click') || eventType.includes('public.interaction')) {
    return 'generate_leads'
  }
  if (eventType.includes('publish') || eventType.includes('exposure') || eventType.includes('presence')) {
    return 'expand_presence'
  }
  if (eventType.includes('create_entity') || eventType.includes('entity.create')) {
    return 'create_entities'
  }
  return 'optimize_performance'
}

function classifyOutcomeStatus(eventType: string): MultiEntityOutcomeRecord['status'] {
  if (eventType.includes('converted') || eventType.includes('success') || eventType.includes('approved')) {
    return 'success'
  }
  if (eventType.includes('rejected') || eventType.includes('failed') || eventType.includes('rollback')) {
    return 'failure'
  }
  return 'neutral'
}

function classifyImpactScore(eventType: string) {
  if (eventType.includes('converted')) {
    return 0.92
  }
  if (eventType.includes('qualified') || eventType.includes('approved')) {
    return 0.72
  }
  if (eventType.includes('contacted') || eventType.includes('click') || eventType.includes('resolved')) {
    return 0.58
  }
  if (eventType.includes('failed') || eventType.includes('rejected') || eventType.includes('rollback')) {
    return 0.18
  }
  return 0.46
}

function classifyConversionEffect(eventType: string) {
  if (eventType.includes('converted')) {
    return 1
  }
  if (eventType.includes('qualified') || eventType.includes('contacted') || eventType.includes('resolved')) {
    return 0.35
  }
  if (eventType.includes('failed') || eventType.includes('rejected') || eventType.includes('rollback')) {
    return -0.7
  }
  return 0
}

function actionTypeFromDecisionAction(action: string, goalType: MultiEntityGoalRecord['type']) {
  if (action === 'route_lead' || action === 'expand_presence' || action === 'optimize_performance' || action === 'create_entity') {
    return action
  }
  if (goalType === 'generate_leads') {
    return 'route_lead'
  }
  if (goalType === 'expand_presence') {
    return 'expand_presence'
  }
  if (goalType === 'create_entities') {
    return 'create_entity'
  }
  return 'optimize_performance'
}

function deriveRecentActions(events: EntityEventLogRecord[], existingActions: MultiEntityActionRecord[]) {
  const derived = events.map((event) => ({
    actionId: event.id,
    goalType: classifyEventGoalType(event.type),
    actionType: event.type,
    confidence: clamp(typeof event.payload.confidence === 'number' ? event.payload.confidence : classifyImpactScore(event.type)),
    opportunityScore: clamp(typeof event.payload.opportunityScore === 'number' ? event.payload.opportunityScore : classifyImpactScore(event.type)),
    executedAt: event.timestamp,
    context: {
      eventType: event.type,
      causedByCommandId: event.causedByCommandId,
    },
  } satisfies MultiEntityActionRecord))

  return [...derived, ...existingActions]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.actionId === entry.actionId) === index)
    .sort((left, right) => right.executedAt.localeCompare(left.executedAt))
    .slice(0, 8)
}

function deriveRecentOutcomes(events: EntityEventLogRecord[], existingOutcomes: MultiEntityOutcomeRecord[]) {
  const derived = events.map((event) => ({
    outcomeId: `outcome:${event.id}`,
    actionId: event.id,
    status: classifyOutcomeStatus(event.type),
    impactScore: classifyImpactScore(event.type),
    conversionEffect: classifyConversionEffect(event.type),
    observedAt: event.timestamp,
    signalType: event.type,
    context: {
      causedByCommandId: event.causedByCommandId,
    },
  } satisfies MultiEntityOutcomeRecord))

  return [...derived, ...existingOutcomes]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.outcomeId === entry.outcomeId) === index)
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 8)
}

function deriveMemoryBackedOutcomes(args: {
  memory: Awaited<ReturnType<EntityCognitiveMemoryStore['get']>>
  existingOutcomes: MultiEntityOutcomeRecord[]
}) {
  if (args.existingOutcomes.length > 0) {
    return args.existingOutcomes
  }

  const entries = args.memory?.episodicMemory.entries ?? []
  return entries
    .filter((entry) => entry.tags.includes('success') || entry.tags.includes('failure') || entry.tags.includes('conversion') || entry.tags.includes('lead'))
    .map((entry) => ({
      outcomeId: `memory:${entry.id}`,
      status: entry.tags.includes('failure')
        ? 'failure'
        : entry.tags.includes('success') || entry.tags.includes('conversion')
          ? 'success'
          : 'neutral',
      impactScore: clamp(Number(entry.relevanceScore ?? 0.5)),
      conversionEffect: entry.tags.includes('conversion') ? 0.72 : entry.tags.includes('failure') ? -0.4 : 0.2,
      observedAt: entry.recordedAt,
      signalType: 'episodic-memory',
      context: asRecord(entry.context) ?? {},
    } satisfies MultiEntityOutcomeRecord))
    .slice(0, 4)
}

function summarizeOutcomes(outcomes: MultiEntityOutcomeRecord[]) {
  if (outcomes.length === 0) {
    return {
      successRate: 0.5,
      failureRate: 0.18,
      averageImpact: 0.5,
      conversionMomentum: 0,
    }
  }

  const successCount = outcomes.filter((outcome) => outcome.status === 'success').length
  const failureCount = outcomes.filter((outcome) => outcome.status === 'failure').length
  const averageImpact = outcomes.reduce((sum, outcome) => sum + outcome.impactScore, 0) / outcomes.length
  const conversionMomentum = outcomes.reduce((sum, outcome) => sum + outcome.conversionEffect, 0) / outcomes.length

  return {
    successRate: clamp(successCount / outcomes.length),
    failureRate: clamp(failureCount / outcomes.length),
    averageImpact: clamp(averageImpact),
    conversionMomentum: clamp((conversionMomentum + 1) / 2),
  }
}

function deriveLeadSignalStrength(events: EntityEventLogRecord[], outcomes: MultiEntityOutcomeRecord[], baseLeadScore: number) {
  const weightedSignals = events.reduce((sum, event) => {
    if (event.type.includes('lead.converted')) {
      return sum + 1
    }
    if (event.type.includes('lead.qualified')) {
      return sum + 0.72
    }
    if (event.type.includes('lead.contacted') || event.type.includes('interaction.click') || event.type.includes('public.interaction.resolved')) {
      return sum + 0.48
    }
    return sum
  }, 0)
  const normalizedSignals = clamp(weightedSignals / Math.max(events.length, 1))
  const positiveMomentum = outcomes.filter((outcome) => outcome.status === 'success').length > 0
    ? outcomes.filter((outcome) => outcome.status === 'success').reduce((sum, outcome) => sum + outcome.impactScore, 0) / outcomes.filter((outcome) => outcome.status === 'success').length
    : 0.4

  return clamp((baseLeadScore * 0.25) + (normalizedSignals * 0.2) + (positiveMomentum * 0.55))
}

function adaptScores(args: {
  baseScores: ReturnType<typeof deriveScores>
  outcomeSummary: ReturnType<typeof summarizeOutcomes>
  leadSignalStrength: number
  episodicMemoryRelevance: number
}) {
  const healthScore = clamp(
    (args.baseScores.healthScore * 0.64)
    + (args.outcomeSummary.averageImpact * 0.18)
    + ((1 - args.outcomeSummary.failureRate) * 0.1)
    + (args.episodicMemoryRelevance * 0.08),
  )
  const leadGenerationScore = clamp(
    (args.baseScores.leadGenerationScore * 0.62)
    + (args.leadSignalStrength * 0.18)
    + (args.outcomeSummary.successRate * 0.1)
    + (args.outcomeSummary.conversionMomentum * 0.1),
  )
  const memoryConfidence = clamp(
    (args.baseScores.memoryConfidence * 0.6)
    + (args.episodicMemoryRelevance * 0.24)
    + (args.outcomeSummary.successRate * 0.16),
  )
  const autonomyReadiness = clamp(
    (healthScore * 0.35)
    + (leadGenerationScore * 0.25)
    + (memoryConfidence * 0.2)
    + ((1 - args.baseScores.riskScore) * 0.2),
  )

  return {
    healthScore,
    leadGenerationScore,
    memoryConfidence,
    autonomyReadiness,
    riskScore: args.baseScores.riskScore,
  }
}

function resolveCreateProposalGoal(registryEntry: MultiEntityRegistryRecord) {
  return registryEntry.activeGoals.find((goal) => goal.type === 'create_entities' || goal.type === 'create_entity')
}

function deriveMemoryRelevance(memory: Awaited<ReturnType<EntityCognitiveMemoryStore['get']>>) {
  const entries = memory?.episodicMemory.entries ?? []
  if (entries.length === 0) {
    return 0.22
  }

  return clamp(Math.max(...entries.slice(0, 6).map((entry) => Number(entry.relevanceScore ?? 0))))
}

function detectAutonomousTriggers(args: {
  registryEntry: MultiEntityRegistryRecord
  scores: ReturnType<typeof deriveScores>
  memory: Awaited<ReturnType<EntityCognitiveMemoryStore['get']>>
  lastOutcomes: MultiEntityOutcomeRecord[]
  leadSignalStrength: number
}): EntityRuntimeLoopTriggers {
  const lastDecision = args.registryEntry.lastDecisionSnapshot ?? {}
  const previousLeadScore = typeof lastDecision.leadGenerationScore === 'number'
    ? clamp(lastDecision.leadGenerationScore)
    : args.registryEntry.leadGenerationScore
  const previousHealthScore = typeof lastDecision.healthScore === 'number'
    ? clamp(lastDecision.healthScore)
    : args.registryEntry.healthScore

  const leadScoreDrop = previousLeadScore - args.scores.leadGenerationScore >= 0.04 || args.scores.leadGenerationScore <= 0.34
  const growthStagnation = Math.abs(previousHealthScore - args.scores.healthScore) <= 0.03 && args.scores.leadGenerationScore < 0.5
  const opportunityDetected = args.scores.leadGenerationScore >= 0.6 || args.scores.autonomyReadiness >= 0.72 || args.leadSignalStrength >= 0.68
  const memoryPatternDetected = (args.memory?.episodicMemory.entries ?? []).some((entry) => (
    entry.tags.includes('success') || entry.tags.includes('conversion') || entry.tags.includes('lead')
  )) || (args.memory?.historicalSignals.rollingSuccessRate ?? 0) >= 0.58 || args.lastOutcomes.some((outcome) => outcome.status === 'success')
  const portfolioGapDetected = !args.registryEntry.actionQueue.some((entry) => String(entry.type ?? '').includes('create_entity'))
    && args.registryEntry.market === 'legal'

  return {
    leadScoreDrop,
    growthStagnation,
    opportunityDetected,
    memoryPatternDetected,
    portfolioGapDetected,
  }
}

function prioritizeGoals(
  goals: MultiEntityGoalRecord[],
  triggers: EntityRuntimeLoopTriggers,
  outcomeSummary: ReturnType<typeof summarizeOutcomes>,
  leadSignalStrength: number,
) {
  return [...goals].sort((left, right) => {
    const leftBoost = (
      (left.type === 'generate_leads' && triggers.leadScoreDrop ? 0.18 : 0)
      + (left.type === 'generate_leads' ? leadSignalStrength * 0.16 : 0)
      + (left.type === 'optimize_performance' && triggers.growthStagnation ? 0.16 : 0)
      + (left.type === 'expand_presence' && triggers.opportunityDetected ? 0.14 : 0)
      + (left.type === 'create_entities' && triggers.portfolioGapDetected ? 0.2 : 0)
      + (triggers.memoryPatternDetected ? 0.08 : 0)
      + (outcomeSummary.successRate * 0.06)
    )
    const rightBoost = (
      (right.type === 'generate_leads' && triggers.leadScoreDrop ? 0.18 : 0)
      + (right.type === 'generate_leads' ? leadSignalStrength * 0.16 : 0)
      + (right.type === 'optimize_performance' && triggers.growthStagnation ? 0.16 : 0)
      + (right.type === 'expand_presence' && triggers.opportunityDetected ? 0.14 : 0)
      + (right.type === 'create_entities' && triggers.portfolioGapDetected ? 0.2 : 0)
      + (triggers.memoryPatternDetected ? 0.08 : 0)
      + (outcomeSummary.successRate * 0.06)
    )
    const leftWeight = (asGoalNumber(left, 'priority', 0.5) * 0.38) + (asGoalNumber(left, 'impact', 0.5) * 0.24) + (asGoalNumber(left, 'urgency', 0.5) * 0.23) + (asGoalNumber(left, 'historicalSuccess', 0.5) * 0.15) + leftBoost
    const rightWeight = (asGoalNumber(right, 'priority', 0.5) * 0.38) + (asGoalNumber(right, 'impact', 0.5) * 0.24) + (asGoalNumber(right, 'urgency', 0.5) * 0.23) + (asGoalNumber(right, 'historicalSuccess', 0.5) * 0.15) + rightBoost
    return rightWeight - leftWeight
  })
}

function resolveDynamicIntervalMs(args: {
  autonomyLevel: MultiEntityRegistryRecord['autonomyLevel']
  rollbackActive: boolean
  triggers: EntityRuntimeLoopTriggers
  opportunityScore: number
}) {
  if (args.rollbackActive) {
    return 30 * 60 * 1000
  }

  const base = args.autonomyLevel === 'autonomous'
    ? 60_000
    : args.autonomyLevel === 'partial'
      ? 2 * 60_000
      : args.autonomyLevel === 'supervised'
        ? 5 * 60_000
        : 15 * 60_000
  const pressure = [
    args.triggers.leadScoreDrop,
    args.triggers.growthStagnation,
    args.triggers.opportunityDetected,
    args.triggers.memoryPatternDetected,
    args.opportunityScore >= 0.72,
  ].filter(Boolean).length

  return Math.max(30_000, base - (pressure * 20_000))
}

function plusMs(iso: string, deltaMs: number) {
  return new Date(Date.parse(iso) + deltaMs).toISOString()
}

function mapGoalToObjectiveType(goalType: MultiEntityGoalRecord['type'] | undefined): 'sell' | 'engage' | 'educate' | 'convert' | undefined {
  switch (goalType) {
    case 'generate_leads':
      return 'sell'
    case 'expand_presence':
      return 'engage'
    case 'create_entities':
    case 'create_entity':
      return 'convert'
    case 'optimize_performance':
      return 'educate'
    default:
      return undefined
  }
}

async function readScopedEntityMemory(args: {
  memoryStore: EntityCognitiveMemoryStore
  ownerEntityId: string
  targetEntityId: string
  allowCrossEntityRead?: boolean
}) {
  if (args.ownerEntityId !== args.targetEntityId && args.allowCrossEntityRead !== true) {
    throw new Error('Cross-entity memory access is not allowed without policy.')
  }

  return args.memoryStore.get(args.targetEntityId)
}

export async function runEntityRuntimeLoop(args: {
  entityId: string
  commandId: string
  now: string
  dependencies: EntityRuntimeLoopDependencies
}): Promise<EntityRuntimeLoopResult> {
  const registryEntry = await args.dependencies.registry.getEntityById(args.entityId)
  if (!registryEntry) {
    throw new Error(`Registry entry not found for ${args.entityId}.`)
  }

  const entityRecord = await args.dependencies.entityRepository.getEntityById<EntityProfile>(args.entityId)
  if (!entityRecord) {
    throw new Error(`Entity profile not found for ${args.entityId}.`)
  }

  await readScopedEntityMemory({
    memoryStore: args.dependencies.memoryStore,
    ownerEntityId: args.entityId,
    targetEntityId: args.entityId,
  })

  const existingMemory = await args.dependencies.memoryStore.get(args.entityId)
  const recentEvents = await args.dependencies.eventLogRepository.getRecentEvents(args.entityId, 8)
  const previousActions = registryEntry.lastActions
  const previousOutcomes = registryEntry.lastOutcomes
  const lastActions = deriveRecentActions(recentEvents, previousActions)
  const eventBackedOutcomes = deriveRecentOutcomes(recentEvents, previousOutcomes)
  const lastOutcomes = eventBackedOutcomes.length > 0
    ? eventBackedOutcomes
    : deriveMemoryBackedOutcomes({
      memory: existingMemory,
      existingOutcomes: previousOutcomes,
    })
  const baseScores = deriveScores(entityRecord.entityProfile as EntityProfile, registryEntry)
  const episodicMemoryRelevance = deriveMemoryRelevance(existingMemory)
  const outcomeSummary = summarizeOutcomes(lastOutcomes)
  const leadSignalStrength = deriveLeadSignalStrength(recentEvents, lastOutcomes, baseScores.leadGenerationScore)
  const scores = adaptScores({
    baseScores,
    outcomeSummary,
    leadSignalStrength,
    episodicMemoryRelevance,
  })
  const triggers = detectAutonomousTriggers({
    registryEntry,
    scores,
    memory: existingMemory,
    lastOutcomes,
    leadSignalStrength,
  })
  const opportunityScore = clamp(
    (scores.leadGenerationScore * 0.36)
    + (scores.autonomyReadiness * 0.18)
    + (episodicMemoryRelevance * 0.14)
    + (leadSignalStrength * 0.18)
    + (outcomeSummary.successRate * 0.14),
  )
  const activeGoals = prioritizeGoals(registryEntry.activeGoals as MultiEntityGoalRecord[], triggers, outcomeSummary, leadSignalStrength)
  const topGoal = activeGoals[0]
  const nextIntervalMs = resolveDynamicIntervalMs({
    autonomyLevel: registryEntry.autonomyLevel,
    rollbackActive: registryEntry.rollbackState.active,
    triggers,
    opportunityScore,
  })
  const mostRecentOutcome = lastOutcomes[0]

  const decisionOutput = await resolveFlowMindDecision({
    entityId: args.entityId,
    requestedAt: args.now,
    input: `health:${scores.healthScore.toFixed(3)} lead:${scores.leadGenerationScore.toFixed(3)} memory:${scores.memoryConfidence.toFixed(3)} risk:${scores.riskScore.toFixed(3)} goal:${String(topGoal?.type ?? 'optimize_performance')}`,
    context: {
      lifecycleState: registryEntry.lifecycleState,
      autonomyLevel: registryEntry.autonomyLevel,
      market: registryEntry.market,
      activeGoals,
      rollbackState: registryEntry.rollbackState,
      runtimeScores: {
        healthScore: scores.healthScore,
        leadGenerationScore: scores.leadGenerationScore,
        memoryRelevance: episodicMemoryRelevance,
        opportunityScore,
        leadSignalStrength,
      },
      lastActions,
      lastOutcomes,
      outcomeSummary,
      loopSignals: triggers,
      loopState: {
        phase: 'evaluate',
        nextIntervalMs,
      },
    },
    objective: topGoal
      ? {
        type: mapGoalToObjectiveType(topGoal.type) ?? 'engage',
        priority: asGoalNumber(topGoal, 'priority', 0.5),
      }
      : undefined,
    interaction: mostRecentOutcome
      ? {
        outcome: {
          interactionSuccess: mostRecentOutcome.status === 'success' ? mostRecentOutcome.impactScore : mostRecentOutcome.status === 'failure' ? 1 - mostRecentOutcome.impactScore : 0.5,
          userContinuation: mostRecentOutcome.conversionEffect > 0,
          engagementDelta: mostRecentOutcome.conversionEffect,
          outcomeStatus: mostRecentOutcome.status,
          signalType: mostRecentOutcome.signalType,
        },
      }
      : undefined,
    memory: existingMemory,
  }, {})

  const autonomousConfidenceThreshold = registryEntry.autonomyLevel === 'autonomous'
    ? 0.56
    : registryEntry.autonomyLevel === 'partial'
      ? 0.68
      : registryEntry.autonomyLevel === 'supervised'
        ? 0.82
        : 1.01
  const autonomousExecutionEligible = !registryEntry.rollbackState.active
    && (registryEntry.autonomyLevel === 'partial' || registryEntry.autonomyLevel === 'autonomous')
    && (
      decisionOutput.decision.confidence >= autonomousConfidenceThreshold
      || opportunityScore >= 0.78
    )
  const selectedAction = actionTypeFromDecisionAction(decisionOutput.decision.action, normalizeGoalType(String(topGoal?.type ?? 'optimize_performance')))

  const createGoal = resolveCreateProposalGoal({
    ...registryEntry,
    activeGoals,
  })
  const baseResult: Omit<EntityRuntimeLoopResult, 'blockedReason' | 'proposal' | 'commandRequest'> = {
    entityId: args.entityId,
    decision: {
      intent: decisionOutput.decision.intent,
      action: decisionOutput.decision.action,
      confidence: decisionOutput.decision.confidence,
    },
    scores: {
      ...scores,
      goalPriorityScore: topGoal ? asGoalNumber(topGoal, 'priority', 0.5) : 0.5,
      episodicMemoryRelevance,
    },
    activeGoals,
    lastActions,
    lastOutcomes,
    triggers,
    valueLoop: {
      opportunityScore,
      leadSignalStrength,
      outcomeSuccessRate: outcomeSummary.successRate,
      conversionMomentum: outcomeSummary.conversionMomentum,
      autonomousExecutionEligible,
      selectedAction,
    },
    continuousLoop: {
      phase: 'evaluate',
      nextIntervalMs,
      nextWakeAt: plusMs(args.now, nextIntervalMs),
    },
  }

  const observeCommand: RuntimeCommandRequest = {
    type: 'entity.runtime.observe',
    commandId: args.commandId,
    entityId: args.entityId,
    now: args.now,
    decisionHash: decisionOutput.decision.decisionHash,
    memoryWritePlan: decisionOutput.decision.memoryWritePlan,
    expectedStateChanges: decisionOutput.decision.expectedStateChanges,
  }

  if (registryEntry.rollbackState.active) {
    return {
      ...baseResult,
      blockedReason: 'rollback-active',
      continuousLoop: {
        ...baseResult.continuousLoop,
        phase: 'cooldown',
      },
      commandRequest: observeCommand,
    }
  }

  const entityCreationAllowedBySignals = triggers.opportunityDetected
    && triggers.portfolioGapDetected
    && scores.leadGenerationScore >= 0.58

  const shouldAutonomouslyExecuteValueAction = autonomousExecutionEligible
    && topGoal
    && topGoal.type !== 'create_entities'
    && topGoal.type !== 'create_entity'
    && (decisionOutput.decision.action === 'route_lead' || decisionOutput.decision.action === 'expand_presence' || decisionOutput.decision.action === 'optimize_performance')

  if (shouldAutonomouslyExecuteValueAction) {
    return {
      ...baseResult,
      continuousLoop: {
        ...baseResult.continuousLoop,
        phase: 'execute',
      },
      commandRequest: {
        type: 'entity.runtime.execute',
        commandId: args.commandId,
        entityId: args.entityId,
        now: args.now,
        action: decisionOutput.decision.action,
        actionPayload: {
          ...decisionOutput.decision.actionPayload,
          opportunityScore,
          leadSignalStrength,
          lastActions,
          lastOutcomes,
          selectedAction,
        },
        decisionHash: decisionOutput.decision.decisionHash,
        memoryWritePlan: decisionOutput.decision.memoryWritePlan,
        expectedStateChanges: decisionOutput.decision.expectedStateChanges,
      },
    }
  }

  if (!createGoal || decisionOutput.decision.action !== 'create_entity' || !entityCreationAllowedBySignals) {
    return {
      ...baseResult,
      blockedReason: !createGoal
        ? undefined
        : decisionOutput.decision.action !== 'create_entity'
          ? 'authoritative-decision-no-create-entity'
          : 'create-entity-trigger-threshold-not-met',
      continuousLoop: {
        ...baseResult.continuousLoop,
        phase: 'observe',
      },
      commandRequest: observeCommand,
    }
  }

  const proposal = createEntityCreationProposal({
    proposalId: String(createGoal.proposalId ?? `${args.commandId}-proposal`),
    sourceEntityId: args.entityId,
    requestedAt: args.now,
    rationale: String(createGoal.rationale ?? 'FlowMind identified a portfolio expansion opportunity from continuous cognition.'),
    blueprint: createGoal.blueprint as EntityCreationProposal['blueprint'],
  })
  const permission = checkAutonomyActionPermission({
    actionType: 'create_entity',
    autonomyLevel: registryEntry.autonomyLevel,
    riskLevel: proposal.riskClassification,
    approvalRequired: proposal.approvalRequired,
    lifecycleState: registryEntry.lifecycleState,
  })
  const existingApproval = await args.dependencies.approvalQueue.getByProposal(
    args.entityId,
    proposal.proposalId,
    'create_entity',
  )

  if (!permission.allowed && existingApproval?.status !== 'approved') {
    return {
      ...baseResult,
      proposal,
      blockedReason: permission.reason,
      continuousLoop: {
        ...baseResult.continuousLoop,
        phase: 'execute',
      },
      commandRequest: {
        type: 'entity.runtime.request_approval',
        commandId: args.commandId,
        entityId: args.entityId,
        now: args.now,
        proposal,
        deniedReason: permission.reason,
        decisionHash: decisionOutput.decision.decisionHash,
        memoryWritePlan: decisionOutput.decision.memoryWritePlan,
        expectedStateChanges: decisionOutput.decision.expectedStateChanges,
      },
    }
  }

  return {
    ...baseResult,
    proposal,
    continuousLoop: {
      ...baseResult.continuousLoop,
      phase: 'execute',
    },
    commandRequest: {
      type: 'entity.runtime.execute',
      commandId: args.commandId,
      entityId: args.entityId,
      now: args.now,
      action: decisionOutput.decision.action,
      actionPayload: {
        ...decisionOutput.decision.actionPayload,
        opportunityScore,
        leadSignalStrength,
      },
      proposal,
      decisionHash: decisionOutput.decision.decisionHash,
      memoryWritePlan: decisionOutput.decision.memoryWritePlan,
      expectedStateChanges: decisionOutput.decision.expectedStateChanges,
    },
  }
}

export async function assertScopedEntityMemoryAccess(args: {
  memoryStore: EntityCognitiveMemoryStore
  ownerEntityId: string
  targetEntityId: string
  allowCrossEntityRead?: boolean
}) {
  return readScopedEntityMemory(args)
}
