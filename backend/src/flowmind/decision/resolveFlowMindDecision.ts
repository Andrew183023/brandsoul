import { createHash } from 'node:crypto'
import { createDefaultFlowMindHistoricalSignals } from '../cognition/adaptiveLearning.js'
import { createDefaultFlowMindCognitiveState } from '../cognition/cognitiveState.js'
import {
  hydrateEntityCognitiveMemory,
  type EntityCognitiveMemory,
  type EntityEpisodicMemory,
} from '../memory/entityCognitiveMemory.js'
import { applyCognitiveObjectiveToDecision } from '../objectives/cognitiveObjective.js'
import type {
  FlowMindAdaptiveCoreResult,
  FlowMindDecisionAdapter,
  FlowMindInput,
  FlowMindOutput,
  FlowMindUpdatedProfiles,
} from '../types/flowMindContracts.js'
import {
  clampFlowMindConfidence,
  type FlowMindDecision,
  type FlowMindDecisionSeed,
  type FlowMindDecisionSource,
  type FlowMindExpectedStateChange,
  type FlowMindMemoryReadRef,
  type FlowMindMemoryWriteOperation,
  type FlowMindTerminalAuthority,
} from '../types/flowMindDecision.js'

export type ResolveFlowMindDecisionOptions = {
  adapter?: FlowMindDecisionAdapter
}

const EPISODIC_MEMORY_LIMIT = 24
const EPISODIC_RETRIEVAL_LIMIT = 5
const EPISODIC_MEMORY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 14
const AUTONOMOUS_GOAL_TYPES = ['generate_leads', 'expand_presence', 'create_entities', 'optimize_performance'] as const
type AutonomousGoalType = (typeof AUTONOMOUS_GOAL_TYPES)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sortStringArray(values: string[] | undefined) {
  if (!Array.isArray(values)) {
    return values
  }

  return [...values].sort((left, right) => left.localeCompare(right))
}

function canonicalizeDeterministicValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeDeterministicValue(entry)) as T
  }

  if (!isRecord(value)) {
    return value
  }

  const normalizedRecord: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    const nextValue = value[key]
    normalizedRecord[key] = key === 'engagementScore' && nextValue === undefined
      ? 0
      : canonicalizeDeterministicValue(nextValue)
  }

  return normalizedRecord as T
}

function canonicalizeDecision(decision: FlowMindDecisionSeed): FlowMindDecision {
  const normalized = canonicalizeDeterministicValue(decision)

  return {
    ...normalized,
    responsePlan: {
      ...normalized.responsePlan,
      requiredData: sortStringArray(normalized.responsePlan.requiredData),
      constraints: sortStringArray(normalized.responsePlan.constraints),
    },
    actionPayload: normalized.actionPayload ?? {},
    memoryReadSet: normalized.memoryReadSet ?? [],
    memoryWritePlan: normalized.memoryWritePlan ?? [],
    expectedStateChanges: normalized.expectedStateChanges ?? [],
    decisionHash: normalized.decisionHash ?? '',
  }
}

function canonicalizeAdaptiveCoreResult(result: FlowMindAdaptiveCoreResult): FlowMindAdaptiveCoreResult {
  return {
    ...result,
    decision: canonicalizeDecision(result.decision),
    fallbackConditions: sortStringArray(result.fallbackConditions) ?? [],
  }
}

function normalizeFlowMindInput(input: FlowMindInput): FlowMindInput {
  return canonicalizeDeterministicValue(input)
}

function stableStringify(value: unknown) {
  return JSON.stringify(canonicalizeDeterministicValue(value))
}

function hashDeterministicValue(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function createFallbackBaseDecision(input: FlowMindInput): FlowMindDecision {
  const activeGoals = extractPrioritizedGoals(input.context)
  const triggers = extractAutonomousTriggers(input.context)
  const scores = extractStateScores(input.context)
  const valueLoop = extractValueLoop(input.context)
  const topGoal = activeGoals[0]
  const createEntityOpportunity =
    topGoal?.type === 'create_entities'
    && triggers.opportunityDetected
    && triggers.portfolioGapDetected
    && scores.leadGenerationScore >= 0.58
    && (scores.autonomyLevel === 'partial' || scores.autonomyLevel === 'autonomous')

  if (createEntityOpportunity) {
    return {
      intent: 'orchestrate',
      action: 'create_entity',
      confidence: clampFlowMindConfidence(
        0.44
        + (topGoal.priorityScore * 0.18)
        + (topGoal.historicalSuccess * 0.12)
        + (scores.leadGenerationScore * 0.14),
      ),
      decisionHash: '',
      responsePlan: {
        kind: 'general',
        topic: 'continuous-create-entity-opportunity',
        intentGoal: 'expand-portfolio-with-high-opportunity-entity',
        requiredData: [],
        constraints: [],
        optionalCloseStyle: 'contextual-clarity',
      },
      actionPayload: {
        triggerSet: activeGoals.map((goal) => goal.type),
        triggerReason: 'opportunity-lead-gap-memory-aligned',
        opportunityScore: valueLoop.opportunityScore,
        outcomePattern: valueLoop.outcomePattern,
      },
      memoryReadSet: [],
      memoryWritePlan: [],
      expectedStateChanges: [],
      statePatch: {},
      memoryCandidates: [],
      metadata: {
        source: 'continuous-goal-prioritization',
        topGoal: topGoal.type,
        triggerSummary: triggers,
        valueLoop,
      },
    }
  }

  if (topGoal?.type === 'generate_leads' && (valueLoop.opportunityScore >= 0.62 || triggers.leadScoreDrop)) {
    const routeLeadConfidence = clampFlowMindConfidence(
      0.42
      + (topGoal.priorityScore * 0.14)
      + (scores.leadGenerationScore * 0.16)
      + (valueLoop.leadSignalStrength * 0.18)
      + (valueLoop.outcomePattern.successRate * 0.1)
      + (scores.memoryRelevance * 0.08),
    )
    const routeLeadAction = valueLoop.leadSignalStrength >= 0.66 || valueLoop.outcomePattern.conversionMomentum >= 0.56
      ? 'route_lead'
      : 'expand_presence'

    return {
      intent: 'growth',
      action: routeLeadAction,
      confidence: routeLeadConfidence,
      decisionHash: '',
      responsePlan: {
        kind: 'general',
        topic: 'generate_leads',
        intentGoal: 'convert-opportunity-into-qualified-lead',
        requiredData: [],
        constraints: [],
        optionalCloseStyle: 'contextual-clarity',
      },
      actionPayload: {
        goalType: topGoal.type,
        leadSignalStrength: valueLoop.leadSignalStrength,
        opportunityScore: valueLoop.opportunityScore,
        outcomePattern: valueLoop.outcomePattern,
        measurementPlan: 'track-qualified-contact-conversion',
      },
      memoryReadSet: [],
      memoryWritePlan: [],
      expectedStateChanges: [],
      statePatch: {},
      memoryCandidates: [],
      metadata: {
        source: 'value-loop-growth',
        selectedGoal: topGoal.type,
        triggerSummary: triggers,
        valueLoop,
      },
    }
  }

  if (topGoal?.type === 'expand_presence' && (valueLoop.opportunityScore >= 0.58 || triggers.opportunityDetected)) {
    return {
      intent: 'presence',
      action: 'expand_presence',
      confidence: clampFlowMindConfidence(
        0.4
        + (topGoal.priorityScore * 0.16)
        + (valueLoop.outcomePattern.successRate * 0.1)
        + (scores.memoryRelevance * 0.1)
        + (scores.autonomyWeight * 0.08),
      ),
      decisionHash: '',
      responsePlan: {
        kind: 'general',
        topic: 'expand_presence',
        intentGoal: 'increase-surface-area-for-opportunity-detection',
        requiredData: [],
        constraints: [],
        optionalCloseStyle: 'contextual-clarity',
      },
      actionPayload: {
        goalType: topGoal.type,
        opportunityScore: valueLoop.opportunityScore,
        outcomePattern: valueLoop.outcomePattern,
        measurementPlan: 'track-exposure-click-response',
      },
      memoryReadSet: [],
      memoryWritePlan: [],
      expectedStateChanges: [],
      statePatch: {},
      memoryCandidates: [],
      metadata: {
        source: 'value-loop-presence',
        selectedGoal: topGoal.type,
        valueLoop,
      },
    }
  }

  if (topGoal?.type === 'optimize_performance' && (triggers.growthStagnation || valueLoop.outcomePattern.failureRate >= 0.34)) {
    return {
      intent: 'stabilize',
      action: 'optimize_performance',
      confidence: clampFlowMindConfidence(
        0.38
        + (topGoal.priorityScore * 0.14)
        + (valueLoop.outcomePattern.failureRate * 0.16)
        + (scores.healthScore * 0.08)
        + (scores.memoryRelevance * 0.08),
      ),
      decisionHash: '',
      responsePlan: {
        kind: 'general',
        topic: 'optimize_performance',
        intentGoal: 'improve-future-execution-quality',
        requiredData: [],
        constraints: [],
        optionalCloseStyle: 'contextual-clarity',
      },
      actionPayload: {
        goalType: topGoal.type,
        opportunityScore: valueLoop.opportunityScore,
        failureRate: valueLoop.outcomePattern.failureRate,
        measurementPlan: 'track-health-lead-memory-recovery',
      },
      memoryReadSet: [],
      memoryWritePlan: [],
      expectedStateChanges: [],
      statePatch: {},
      memoryCandidates: [],
      metadata: {
        source: 'value-loop-optimization',
        selectedGoal: topGoal.type,
        valueLoop,
      },
    }
  }

  const topGoalTopic = topGoal?.type ?? 'optimize_performance'
  const weightedConfidence = clampFlowMindConfidence(
    0.36
    + ((topGoal?.priorityScore ?? 0.5) * 0.16)
    + (scores.healthScore * 0.14)
    + (scores.memoryRelevance * 0.14)
    + (scores.autonomyWeight * 0.1),
  )
  return {
    intent: 'general',
    action: 'guide',
    confidence: weightedConfidence,
    decisionHash: '',
    responsePlan: {
      kind: 'general',
      topic: topGoalTopic,
      intentGoal: `continuous-${topGoalTopic}`,
      requiredData: [],
      constraints: [],
      optionalCloseStyle: 'contextual-clarity',
    },
    actionPayload: {
      topGoal: topGoalTopic,
      triggers,
      scores,
      valueLoop,
    },
    memoryReadSet: [],
    memoryWritePlan: [],
    expectedStateChanges: [],
    statePatch: {},
    memoryCandidates: [],
    metadata: {
      topGoal: topGoalTopic,
      triggerSummary: triggers,
      weighting: scores,
      valueLoop,
    },
  }
}

function extractPrioritizedGoals(context: FlowMindInput['context']) {
  const activeGoals = isRecord(context) && Array.isArray(context.activeGoals)
    ? context.activeGoals
    : []

  return activeGoals
    .filter((goal): goal is Record<string, unknown> => isRecord(goal))
    .map((goal) => ({
      type: AUTONOMOUS_GOAL_TYPES.includes((goal.type === 'create_entity' ? 'create_entities' : goal.type) as AutonomousGoalType)
        ? (goal.type === 'create_entity' ? 'create_entities' : goal.type) as AutonomousGoalType
        : 'optimize_performance' as const,
      priorityScore: clampFlowMindConfidence(typeof goal.priority === 'number' ? goal.priority : 0.5),
      urgencyScore: clampFlowMindConfidence(typeof goal.urgency === 'number' ? goal.urgency : 0.5),
      impactScore: clampFlowMindConfidence(typeof goal.impact === 'number' ? goal.impact : 0.5),
      historicalSuccess: clampFlowMindConfidence(typeof goal.historicalSuccess === 'number' ? goal.historicalSuccess : 0.5),
      enabled: goal.enabled !== false,
    }))
    .filter((goal) => goal.enabled)
    .sort((left, right) => {
      const leftWeight = (left.priorityScore * 0.4) + (left.impactScore * 0.25) + (left.urgencyScore * 0.2) + (left.historicalSuccess * 0.15)
      const rightWeight = (right.priorityScore * 0.4) + (right.impactScore * 0.25) + (right.urgencyScore * 0.2) + (right.historicalSuccess * 0.15)
      return rightWeight - leftWeight
    })
}

function extractAutonomousTriggers(context: FlowMindInput['context']) {
  const loop = isRecord(context.loopSignals) ? context.loopSignals : {}

  return {
    leadScoreDrop: loop.leadScoreDrop === true,
    growthStagnation: loop.growthStagnation === true,
    opportunityDetected: loop.opportunityDetected === true,
    memoryPatternDetected: loop.memoryPatternDetected === true,
    portfolioGapDetected: loop.portfolioGapDetected === true,
  }
}

function extractStateScores(context: FlowMindInput['context']) {
  const scores = isRecord(context.runtimeScores) ? context.runtimeScores : {}
  const autonomyLevel = typeof context.autonomyLevel === 'string' ? context.autonomyLevel : 'manual'
  const autonomyWeight = autonomyLevel === 'autonomous'
    ? 1
    : autonomyLevel === 'partial'
      ? 0.72
      : autonomyLevel === 'supervised'
        ? 0.44
        : 0.18

  return {
    healthScore: clampFlowMindConfidence(typeof scores.healthScore === 'number' ? scores.healthScore : 0.5),
    leadGenerationScore: clampFlowMindConfidence(typeof scores.leadGenerationScore === 'number' ? scores.leadGenerationScore : 0.5),
    memoryRelevance: clampFlowMindConfidence(typeof scores.memoryRelevance === 'number' ? scores.memoryRelevance : 0.5),
    opportunityScore: clampFlowMindConfidence(typeof scores.opportunityScore === 'number' ? scores.opportunityScore : 0.5),
    leadSignalStrength: clampFlowMindConfidence(typeof scores.leadSignalStrength === 'number' ? scores.leadSignalStrength : 0.5),
    autonomyWeight,
    autonomyLevel,
  }
}

function extractValueLoop(context: FlowMindInput['context']) {
  const lastActions = Array.isArray(context.lastActions) ? context.lastActions : []
  const lastOutcomes = Array.isArray(context.lastOutcomes) ? context.lastOutcomes : []
  const summary = isRecord(context.outcomeSummary) ? context.outcomeSummary : {}
  const scores = isRecord(context.runtimeScores) ? context.runtimeScores : {}

  return {
    opportunityScore: clampFlowMindConfidence(typeof scores.opportunityScore === 'number' ? scores.opportunityScore : 0.5),
    leadSignalStrength: clampFlowMindConfidence(typeof scores.leadSignalStrength === 'number' ? scores.leadSignalStrength : 0.5),
    lastActions: canonicalizeDeterministicValue(lastActions),
    lastOutcomes: canonicalizeDeterministicValue(lastOutcomes),
    outcomePattern: {
      successRate: clampFlowMindConfidence(typeof summary.successRate === 'number' ? summary.successRate : 0.5),
      failureRate: clampFlowMindConfidence(typeof summary.failureRate === 'number' ? summary.failureRate : 0.2),
      averageImpact: clampFlowMindConfidence(typeof summary.averageImpact === 'number' ? summary.averageImpact : 0.5),
      conversionMomentum: clampFlowMindConfidence(typeof summary.conversionMomentum === 'number' ? summary.conversionMomentum : 0.5),
    },
  }
}

function tokenizeForMemory(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .toLowerCase()
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => tokenizeForMemory(entry))
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((entry) => tokenizeForMemory(entry))
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }

  return []
}

function uniqueSortedTokens(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function resolveReferenceTime(input: FlowMindInput, memory: EntityCognitiveMemory) {
  const requestedAt = input.requestedAt ? Date.parse(input.requestedAt) : Number.NaN
  if (Number.isFinite(requestedAt)) {
    return requestedAt
  }

  const latestRecordedAt = memory.episodicMemory.entries
    .map((entry) => Date.parse(entry.recordedAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0]

  return Number.isFinite(latestRecordedAt) ? latestRecordedAt : Date.parse('1970-01-01T00:00:00.000Z')
}

function computeAgeDecayWeight(recordedAt: string, referenceTimeMs: number) {
  const recordedAtMs = Date.parse(recordedAt)
  if (!Number.isFinite(recordedAtMs)) {
    return 0.1
  }

  const ageMs = Math.max(0, referenceTimeMs - recordedAtMs)
  const decayWeight = Math.exp((-Math.log(2) * ageMs) / EPISODIC_MEMORY_HALF_LIFE_MS)
  return Number(decayWeight.toFixed(6))
}

function retrieveRelevantEpisodicMemory(input: FlowMindInput, memory: EntityCognitiveMemory) {
  const queryTerms = uniqueSortedTokens([
    ...tokenizeForMemory(input.input),
    ...tokenizeForMemory(input.context),
    ...tokenizeForMemory(input.objective?.type),
  ])
  const referenceTimeMs = resolveReferenceTime(input, memory)

  const retrieved = memory.episodicMemory.entries
    .map((entry) => {
      const entryTerms = uniqueSortedTokens([
        ...tokenizeForMemory(entry.summary),
        ...tokenizeForMemory(entry.tags),
        ...tokenizeForMemory(entry.context),
      ])
      const matchedTerms = entryTerms.filter((term) => queryTerms.includes(term))
      const relevanceWeight = entryTerms.length === 0 ? 0 : matchedTerms.length / entryTerms.length
      const ageDecayWeight = computeAgeDecayWeight(entry.recordedAt, referenceTimeMs)
      const retrievalWeight = Number((((entry.relevanceScore * 0.55) + (relevanceWeight * 0.45)) * ageDecayWeight).toFixed(6))

      return {
        ...entry,
        relevanceWeight: Number(relevanceWeight.toFixed(6)),
        ageDecayWeight,
        retrievalWeight,
      }
    })
    .filter((entry) => entry.retrievalWeight > 0)
    .sort((left, right) => {
      if (right.retrievalWeight !== left.retrievalWeight) {
        return right.retrievalWeight - left.retrievalWeight
      }

      return left.recordedAt.localeCompare(right.recordedAt)
    })
    .slice(0, EPISODIC_RETRIEVAL_LIMIT)

  return {
    retrieved,
    queryTerms,
  }
}

function createEpisodeFromDecision(args: {
  input: FlowMindInput
  queryTerms: string[]
  decision: FlowMindDecision
  qualifiedOutcome?: unknown
}): EntityEpisodicMemory {
  const recordedAt = args.input.requestedAt ?? '1970-01-01T00:00:00.000Z'

  return {
    id: `episode:${args.input.entityId}:${recordedAt}:${args.decision.intent}:${args.decision.action}`,
    summary: `${args.decision.intent}:${args.decision.action}:${args.input.input.slice(0, 160)}`,
    tags: uniqueSortedTokens([
      args.decision.intent,
      args.decision.action,
      args.input.objective?.type ?? '',
      typeof (args.qualifiedOutcome as Record<string, unknown> | undefined)?.outcomeStatus === 'string'
        ? String((args.qualifiedOutcome as Record<string, unknown>).outcomeStatus)
        : '',
      ...args.queryTerms,
    ]),
    relevanceScore: clampFlowMindConfidence(args.decision.confidence),
    recordedAt,
    context: canonicalizeDeterministicValue({
      objective: args.input.objective?.type,
      queryTerms: args.queryTerms,
      qualifiedOutcome: args.qualifiedOutcome,
      actionPayload: args.decision.actionPayload,
      decisionContext: args.decision.metadata,
    }),
  }
}

function mergeEpisodicMemory(args: {
  previousMemory: EntityCognitiveMemory
  input: FlowMindInput
  queryTerms: string[]
  decision: FlowMindDecision
  qualifiedOutcome?: unknown
}) {
  const nextEntry = createEpisodeFromDecision({
    input: args.input,
    queryTerms: args.queryTerms,
    decision: args.decision,
    qualifiedOutcome: args.qualifiedOutcome,
  })

  return [
    nextEntry,
    ...args.previousMemory.episodicMemory.entries.filter((entry) => entry.id !== nextEntry.id),
  ].slice(0, EPISODIC_MEMORY_LIMIT)
}

function preserveTerminalSemanticDecision(
  authoritativeDecision: FlowMindDecision,
  candidateDecision: FlowMindDecisionSeed,
  terminalAuthority: FlowMindTerminalAuthority,
): FlowMindDecision {
  if (terminalAuthority !== 'adaptive-core') {
    return canonicalizeDecision(candidateDecision)
  }

  return canonicalizeDecision({
    ...candidateDecision,
    intent: authoritativeDecision.intent,
    action: authoritativeDecision.action,
    responsePlan: {
      ...authoritativeDecision.responsePlan,
      optionalCloseStyle:
        candidateDecision.responsePlan.optionalCloseStyle ?? authoritativeDecision.responsePlan.optionalCloseStyle,
    },
    statePatch: authoritativeDecision.statePatch,
    memoryCandidates: authoritativeDecision.memoryCandidates,
  })
}

function defaultAdaptiveDecision(baseDecision: FlowMindDecision) {
  return {
    decision: baseDecision,
    decisionSource: 'heuristic-base' as FlowMindDecisionSource,
    terminalAuthority: 'heuristic-fallback' as FlowMindTerminalAuthority,
    fallbackConditions: ['adaptive-core-not-configured'],
    semanticFrozen: false,
    lowRiskLaneUsed: false,
  }
}

async function mergeInputMemory(
  _entityId: string,
  memory: FlowMindInput['memory'],
) {
  const baseMemory = hydrateEntityCognitiveMemory()
  return memory ? hydrateEntityCognitiveMemory(memory, baseMemory) : baseMemory
}

function buildMemoryReadSet(input: FlowMindInput): FlowMindMemoryReadRef[] {
  return [{
    scope: 'entity',
    entityId: input.entityId,
    segments: ['episodic', 'policy', 'strategy', 'adaptive', 'historical', 'cognitive'],
    version: input.requestedAt ?? '1970-01-01T00:00:00.000Z',
  }]
}

function buildMemoryWritePlan(entityId: string, updatedMemory: EntityCognitiveMemory): FlowMindMemoryWriteOperation[] {
  return [{
    op: 'replace_memory',
    entityId,
    nextMemory: canonicalizeDeterministicValue(updatedMemory) as unknown as Record<string, unknown>,
  }]
}

function buildExpectedStateChanges(entityId: string): FlowMindExpectedStateChange[] {
  return [{
    target: 'memory',
    entityId,
    change: 'replace_memory',
  }]
}

function enrichHistoricalSignals(memory: EntityCognitiveMemory, interactionOutcome: unknown) {
  if (!interactionOutcome || typeof interactionOutcome !== 'object') {
    return memory.historicalSignals
  }

  const outcomeRecord = interactionOutcome as Record<string, unknown>
  const interactionSuccess = typeof outcomeRecord.interactionSuccess === 'number' ? outcomeRecord.interactionSuccess : 0.5
  const userContinuation = outcomeRecord.userContinuation === true ? 1 : 0
  const engagementDelta = typeof outcomeRecord.engagementDelta === 'number' ? outcomeRecord.engagementDelta : 0
  const conversionEffect = typeof outcomeRecord.conversionEffect === 'number' ? outcomeRecord.conversionEffect : engagementDelta
  const reinforcement = outcomeRecord.outcomeStatus === 'success'
    ? 0.08
    : outcomeRecord.outcomeStatus === 'failure'
      ? -0.06
      : 0

  return {
    ...memory.historicalSignals,
    totalInteractions: memory.historicalSignals.totalInteractions + 1,
    reliableEvidenceCount: memory.historicalSignals.reliableEvidenceCount + 1,
    rollingSuccessRate: clampFlowMindConfidence(((memory.historicalSignals.rollingSuccessRate + interactionSuccess) / 2) + reinforcement),
    rollingContinuationRate: clampFlowMindConfidence((memory.historicalSignals.rollingContinuationRate + userContinuation) / 2),
    rollingEngagementDelta: (memory.historicalSignals.rollingEngagementDelta + engagementDelta + conversionEffect) / 2,
  }
}

function createUpdatedProfiles(memory: EntityCognitiveMemory): FlowMindUpdatedProfiles {
  return {
    cognitiveState: memory.cognitiveState,
    strategyProfile: memory.strategyProfile,
    policyProfile: memory.policyProfile,
    adaptiveDecisionProfile: memory.adaptiveDecisionProfile,
    historicalSignals: memory.historicalSignals,
  }
}

export async function resolveFlowMindDecision(
  input: FlowMindInput,
  options: ResolveFlowMindDecisionOptions = {},
): Promise<FlowMindOutput> {
  const normalizedInput = normalizeFlowMindInput(input)
  const { adapter } = options
  const memory = canonicalizeDeterministicValue(await mergeInputMemory(normalizedInput.entityId, normalizedInput.memory))
  const episodicMemory = retrieveRelevantEpisodicMemory(normalizedInput, memory)
  const decisionInput = canonicalizeDeterministicValue({
    ...normalizedInput,
    episodicMemory,
  })
  const baseDecision = canonicalizeDecision(adapter?.resolveBaseDecision?.(decisionInput, memory) ?? createFallbackBaseDecision(decisionInput))
  const adaptiveCore = canonicalizeAdaptiveCoreResult(adapter?.resolveAdaptiveCore?.({
    input: decisionInput,
    memory,
    baseDecision,
  }) ?? defaultAdaptiveDecision(baseDecision))
  const decisionSource = adaptiveCore.decisionSource
  const terminalAuthority = adaptiveCore.terminalAuthority ?? (decisionSource === 'adaptive-core' ? 'adaptive-core' : 'heuristic-fallback')
  const semanticFrozen = adaptiveCore.semanticFrozen ?? terminalAuthority === 'adaptive-core'
  const lowRiskLaneUsed = adaptiveCore.lowRiskLaneUsed === true && decisionSource === 'adaptive-core'
  const allowSemanticRewrite = terminalAuthority !== 'adaptive-core'
  const authoritativeDecision = canonicalizeDecision(adaptiveCore.decision)
  const policyDecision = canonicalizeDecision(preserveTerminalSemanticDecision(
    authoritativeDecision,
    adapter?.applyPolicy?.({
      input: decisionInput,
      memory,
      decision: authoritativeDecision,
      allowSemanticRewrite,
    }) ?? adaptiveCore.decision,
    terminalAuthority,
  ))
  const cognitiveStateResult = canonicalizeDeterministicValue(adapter?.applyCognitiveState?.({
    input: decisionInput,
    memory,
    decision: policyDecision,
    allowSemanticRewrite,
  }) ?? {
    decision: policyDecision,
    nextCognitiveState: memory.cognitiveState ?? createDefaultFlowMindCognitiveState(),
  })
  const cognitiveDecision = canonicalizeDecision(preserveTerminalSemanticDecision(
    authoritativeDecision,
    cognitiveStateResult.decision,
    terminalAuthority,
  ))
  const strategyResult = canonicalizeDeterministicValue(adapter?.applyStrategy?.({
    input: decisionInput,
    memory,
    decision: cognitiveDecision,
    allowSemanticRewrite,
  }) ?? {
    decision: cognitiveDecision,
    updatedStrategyProfile: memory.strategyProfile,
  })
  const semanticallyFinalDecision = canonicalizeDecision(preserveTerminalSemanticDecision(
    authoritativeDecision,
    strategyResult.decision,
    terminalAuthority,
  ))
  const objectiveAlignedDecision = canonicalizeDecision(applyCognitiveObjectiveToDecision(semanticallyFinalDecision, decisionInput.objective))
  const behaviorFeedbackResult = canonicalizeDeterministicValue(adapter?.applyBehaviorFeedback?.({
    input: decisionInput,
    memory,
    decision: objectiveAlignedDecision,
    currentCognitiveState: cognitiveStateResult.nextCognitiveState,
  }) ?? {
    nextCognitiveState: cognitiveStateResult.nextCognitiveState,
    nextHistoricalSignals: decisionInput.interaction?.outcome
      ? enrichHistoricalSignals(memory, decisionInput.interaction.outcome)
      : memory.historicalSignals ?? createDefaultFlowMindHistoricalSignals(),
    qualifiedOutcome: decisionInput.interaction?.outcome,
  })

  const nextHistoricalSignals = canonicalizeDeterministicValue(behaviorFeedbackResult.nextHistoricalSignals ?? memory.historicalSignals)
  const nextPolicyProfile = canonicalizeDeterministicValue(adapter?.updatePolicy?.({
    input: decisionInput,
    memory,
    nextCognitiveState: behaviorFeedbackResult.nextCognitiveState,
    nextStrategyProfile: strategyResult.updatedStrategyProfile,
    nextHistoricalSignals,
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  }) ?? memory.policyProfile)
  const nextAdaptiveDecisionProfile = canonicalizeDeterministicValue(adapter?.updateAdaptiveLearning?.({
    input: decisionInput,
    memory,
    nextPolicyProfile,
    nextStrategyProfile: strategyResult.updatedStrategyProfile,
    nextHistoricalSignals,
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  }) ?? memory.adaptiveDecisionProfile)

  const updatedProfiles: FlowMindUpdatedProfiles = canonicalizeDeterministicValue({
    cognitiveState: behaviorFeedbackResult.nextCognitiveState,
    strategyProfile: strategyResult.updatedStrategyProfile,
    policyProfile: nextPolicyProfile,
    adaptiveDecisionProfile: nextAdaptiveDecisionProfile,
    historicalSignals: nextHistoricalSignals,
  })
  const updatedMemory = canonicalizeDeterministicValue(adapter?.updateMemory?.({
    input: decisionInput,
    previousMemory: memory,
    updatedProfiles,
    decision: {
      ...objectiveAlignedDecision,
      behaviorFeedbackInfluence: behaviorFeedbackResult.behaviorFeedbackInfluence,
    },
    decisionSource,
    terminalAuthority,
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  }) ?? hydrateEntityCognitiveMemory({
    cognitiveState: updatedProfiles.cognitiveState,
    strategyProfile: updatedProfiles.strategyProfile,
    policyProfile: updatedProfiles.policyProfile,
    adaptiveDecisionProfile: updatedProfiles.adaptiveDecisionProfile,
    historicalSignals: updatedProfiles.historicalSignals,
  }, memory))
  updatedMemory.episodicMemory = {
    entries: mergeEpisodicMemory({
      previousMemory: updatedMemory,
      input: decisionInput,
      queryTerms: episodicMemory.queryTerms,
      decision: objectiveAlignedDecision,
      qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
    }),
  }

  const memoryReadSet = buildMemoryReadSet(normalizedInput)
  const memoryWritePlan = buildMemoryWritePlan(normalizedInput.entityId, updatedMemory)
  const expectedStateChanges = buildExpectedStateChanges(normalizedInput.entityId)
  const decisionWithoutHash = canonicalizeDeterministicValue({
    ...objectiveAlignedDecision,
    actionPayload: objectiveAlignedDecision.actionPayload ?? {},
    memoryReadSet,
    memoryWritePlan,
    expectedStateChanges,
    memoryInfluence: {
      episodicMemory,
    },
    behaviorFeedbackInfluence: behaviorFeedbackResult.behaviorFeedbackInfluence,
  })
  const decisionHash = hashDeterministicValue({
    entityId: normalizedInput.entityId,
    requestedAt: normalizedInput.requestedAt ?? '1970-01-01T00:00:00.000Z',
    decision: {
      ...decisionWithoutHash,
      decisionHash: '',
    },
  })

  return canonicalizeDeterministicValue({
    decision: {
      ...decisionWithoutHash,
      decisionHash,
    },
    decisionSource,
    terminalAuthority,
    semanticFrozen,
    lowRiskLaneUsed,
    fallbackConditions: adaptiveCore.fallbackConditions,
    updatedMemory,
    updatedProfiles: createUpdatedProfiles(updatedMemory),
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  })
}
