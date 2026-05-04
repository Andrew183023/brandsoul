import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../db/index.js'
import { resolveFlowMindDecision } from '../flowmind/decision/resolveFlowMindDecision.js'
import type { EntityCognitiveMemoryStore } from '../flowmind/memory/entityCognitiveMemoryStore.js'
import type { EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import type { FlowMindApprovalQueue } from './approvalQueue.js'
import { createEntityCreationProposal, type EntityCreationProposal } from './entityCreationProposal.js'
import { checkAutonomyActionPermission } from './flowMindAuthorityPolicy.js'
import {
  type MultiEntityGoalRecord,
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
    proposal: EntityCreationProposal
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
  triggers: EntityRuntimeLoopTriggers
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
}): EntityRuntimeLoopTriggers {
  const lastDecision = args.registryEntry.lastDecisionSnapshot ?? {}
  const previousLeadScore = typeof lastDecision.leadGenerationScore === 'number'
    ? clamp(lastDecision.leadGenerationScore)
    : args.registryEntry.leadGenerationScore
  const previousHealthScore = typeof lastDecision.healthScore === 'number'
    ? clamp(lastDecision.healthScore)
    : args.registryEntry.healthScore

  const leadScoreDrop = previousLeadScore - args.scores.leadGenerationScore >= 0.08 || args.scores.leadGenerationScore <= 0.34
  const growthStagnation = Math.abs(previousHealthScore - args.scores.healthScore) <= 0.03 && args.scores.leadGenerationScore < 0.5
  const opportunityDetected = args.scores.leadGenerationScore >= 0.62 || args.scores.autonomyReadiness >= 0.72
  const memoryPatternDetected = (args.memory?.episodicMemory.entries ?? []).some((entry) => (
    entry.tags.includes('success') || entry.tags.includes('conversion') || entry.tags.includes('lead')
  )) || (args.memory?.historicalSignals.rollingSuccessRate ?? 0) >= 0.58
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

function prioritizeGoals(goals: MultiEntityGoalRecord[], triggers: EntityRuntimeLoopTriggers) {
  return [...goals].sort((left, right) => {
    const leftBoost = (
      (left.type === 'generate_leads' && triggers.leadScoreDrop ? 0.18 : 0)
      + (left.type === 'optimize_performance' && triggers.growthStagnation ? 0.16 : 0)
      + (left.type === 'expand_presence' && triggers.opportunityDetected ? 0.14 : 0)
      + (left.type === 'create_entities' && triggers.portfolioGapDetected ? 0.2 : 0)
      + (triggers.memoryPatternDetected ? 0.08 : 0)
    )
    const rightBoost = (
      (right.type === 'generate_leads' && triggers.leadScoreDrop ? 0.18 : 0)
      + (right.type === 'optimize_performance' && triggers.growthStagnation ? 0.16 : 0)
      + (right.type === 'expand_presence' && triggers.opportunityDetected ? 0.14 : 0)
      + (right.type === 'create_entities' && triggers.portfolioGapDetected ? 0.2 : 0)
      + (triggers.memoryPatternDetected ? 0.08 : 0)
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
  const scores = deriveScores(entityRecord.entityProfile as EntityProfile, registryEntry)
  const triggers = detectAutonomousTriggers({
    registryEntry,
    scores,
    memory: existingMemory,
  })
  const activeGoals = prioritizeGoals(registryEntry.activeGoals as MultiEntityGoalRecord[], triggers)
  const topGoal = activeGoals[0]
  const episodicMemoryRelevance = deriveMemoryRelevance(existingMemory)
  const nextIntervalMs = resolveDynamicIntervalMs({
    autonomyLevel: registryEntry.autonomyLevel,
    rollbackActive: registryEntry.rollbackState.active,
    triggers,
  })

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
      },
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
    memory: existingMemory,
  }, {})

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
    triggers,
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
