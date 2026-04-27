import { createDefaultFlowMindHistoricalSignals } from '../cognition/adaptiveLearning.js'
import { createDefaultFlowMindCognitiveState } from '../cognition/cognitiveState.js'
import { hydrateEntityCognitiveMemory, type EntityCognitiveMemory } from '../memory/entityCognitiveMemory.js'
import type { EntityCognitiveMemoryStore } from '../memory/entityCognitiveMemoryStore.js'
import { applyCognitiveObjectiveToDecision } from '../objectives/cognitiveObjective.js'
import type {
  FlowMindDecisionAdapter,
  FlowMindInput,
  FlowMindOutput,
  FlowMindUpdatedProfiles,
} from '../types/flowMindContracts.js'
import {
  clampFlowMindConfidence,
  type FlowMindDecision,
  type FlowMindDecisionSource,
  type FlowMindTerminalAuthority,
} from '../types/flowMindDecision.js'

export type ResolveFlowMindDecisionOptions = {
  adapter?: FlowMindDecisionAdapter
  memoryStore?: EntityCognitiveMemoryStore
}

function createFallbackBaseDecision(input: FlowMindInput): FlowMindDecision {
  return {
    intent: 'general',
    action: 'guide',
    confidence: 0.5,
    responsePlan: {
      kind: 'general',
      topic: input.input.slice(0, 120) || 'general-context',
      intentGoal: 'continue-contextual-guidance',
      requiredData: [],
      constraints: [],
      optionalCloseStyle: 'contextual-clarity',
    },
    statePatch: {},
    memoryCandidates: [],
  }
}

function preserveTerminalSemanticDecision(
  authoritativeDecision: FlowMindDecision,
  candidateDecision: FlowMindDecision,
  terminalAuthority: FlowMindTerminalAuthority,
): FlowMindDecision {
  if (terminalAuthority !== 'adaptive-core') {
    return candidateDecision
  }

  return {
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
  }
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
  entityId: string,
  memory: FlowMindInput['memory'],
  memoryStore?: EntityCognitiveMemoryStore,
) {
  const persistedMemory = memoryStore ? await memoryStore.get(entityId) : undefined
  const baseMemory = persistedMemory ?? hydrateEntityCognitiveMemory()
  return memory ? hydrateEntityCognitiveMemory(memory, baseMemory) : baseMemory
}

function enrichHistoricalSignals(memory: EntityCognitiveMemory, interactionOutcome: unknown) {
  if (!interactionOutcome || typeof interactionOutcome !== 'object') {
    return memory.historicalSignals
  }

  const outcomeRecord = interactionOutcome as Record<string, unknown>
  const interactionSuccess = typeof outcomeRecord.interactionSuccess === 'number' ? outcomeRecord.interactionSuccess : 0.5
  const userContinuation = outcomeRecord.userContinuation === true ? 1 : 0
  const engagementDelta = typeof outcomeRecord.engagementDelta === 'number' ? outcomeRecord.engagementDelta : 0

  return {
    ...memory.historicalSignals,
    totalInteractions: memory.historicalSignals.totalInteractions + 1,
    reliableEvidenceCount: memory.historicalSignals.reliableEvidenceCount + 1,
    rollingSuccessRate: clampFlowMindConfidence((memory.historicalSignals.rollingSuccessRate + interactionSuccess) / 2),
    rollingContinuationRate: clampFlowMindConfidence((memory.historicalSignals.rollingContinuationRate + userContinuation) / 2),
    rollingEngagementDelta: (memory.historicalSignals.rollingEngagementDelta + engagementDelta) / 2,
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
  const { adapter, memoryStore } = options
  const memory = await mergeInputMemory(input.entityId, input.memory, memoryStore)
  const baseDecision = adapter?.resolveBaseDecision?.(input, memory) ?? createFallbackBaseDecision(input)
  const adaptiveCore = adapter?.resolveAdaptiveCore?.({
    input,
    memory,
    baseDecision,
  }) ?? defaultAdaptiveDecision(baseDecision)
  const decisionSource = adaptiveCore.decisionSource
  const terminalAuthority = adaptiveCore.terminalAuthority ?? (decisionSource === 'adaptive-core' ? 'adaptive-core' : 'heuristic-fallback')
  const semanticFrozen = adaptiveCore.semanticFrozen ?? terminalAuthority === 'adaptive-core'
  const lowRiskLaneUsed = adaptiveCore.lowRiskLaneUsed === true && decisionSource === 'adaptive-core'
  const allowSemanticRewrite = terminalAuthority !== 'adaptive-core'
  const authoritativeDecision = adaptiveCore.decision
  const policyDecision = preserveTerminalSemanticDecision(
    authoritativeDecision,
    adapter?.applyPolicy?.({
      input,
      memory,
      decision: adaptiveCore.decision,
      allowSemanticRewrite,
    }) ?? adaptiveCore.decision,
    terminalAuthority,
  )
  const cognitiveStateResult = adapter?.applyCognitiveState?.({
    input,
    memory,
    decision: policyDecision,
    allowSemanticRewrite,
  }) ?? {
    decision: policyDecision,
    nextCognitiveState: memory.cognitiveState ?? createDefaultFlowMindCognitiveState(),
  }
  const cognitiveDecision = preserveTerminalSemanticDecision(
    authoritativeDecision,
    cognitiveStateResult.decision,
    terminalAuthority,
  )
  const strategyResult = adapter?.applyStrategy?.({
    input,
    memory,
    decision: cognitiveDecision,
    allowSemanticRewrite,
  }) ?? {
    decision: cognitiveDecision,
    updatedStrategyProfile: memory.strategyProfile,
  }
  const semanticallyFinalDecision = preserveTerminalSemanticDecision(
    authoritativeDecision,
    strategyResult.decision,
    terminalAuthority,
  )
  const objectiveAlignedDecision = applyCognitiveObjectiveToDecision(semanticallyFinalDecision, input.objective)
  const behaviorFeedbackResult = adapter?.applyBehaviorFeedback?.({
    input,
    memory,
    decision: objectiveAlignedDecision,
    currentCognitiveState: cognitiveStateResult.nextCognitiveState,
  }) ?? {
    nextCognitiveState: cognitiveStateResult.nextCognitiveState,
    nextHistoricalSignals: input.interaction?.outcome
      ? enrichHistoricalSignals(memory, input.interaction.outcome)
      : memory.historicalSignals ?? createDefaultFlowMindHistoricalSignals(),
    qualifiedOutcome: input.interaction?.outcome,
  }

  const nextHistoricalSignals = behaviorFeedbackResult.nextHistoricalSignals ?? memory.historicalSignals
  const nextPolicyProfile = adapter?.updatePolicy?.({
    input,
    memory,
    nextCognitiveState: behaviorFeedbackResult.nextCognitiveState,
    nextStrategyProfile: strategyResult.updatedStrategyProfile,
    nextHistoricalSignals,
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  }) ?? memory.policyProfile
  const nextAdaptiveDecisionProfile = adapter?.updateAdaptiveLearning?.({
    input,
    memory,
    nextPolicyProfile,
    nextStrategyProfile: strategyResult.updatedStrategyProfile,
    nextHistoricalSignals,
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  }) ?? memory.adaptiveDecisionProfile

  const updatedProfiles: FlowMindUpdatedProfiles = {
    cognitiveState: behaviorFeedbackResult.nextCognitiveState,
    strategyProfile: strategyResult.updatedStrategyProfile,
    policyProfile: nextPolicyProfile,
    adaptiveDecisionProfile: nextAdaptiveDecisionProfile,
    historicalSignals: nextHistoricalSignals,
  }
  const updatedMemory = adapter?.updateMemory?.({
    input,
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
  }, memory)

  if (memoryStore) {
    await memoryStore.set(input.entityId, updatedMemory)
  }

  return {
    decision: {
      ...objectiveAlignedDecision,
      behaviorFeedbackInfluence: behaviorFeedbackResult.behaviorFeedbackInfluence,
    },
    decisionSource,
    terminalAuthority,
    semanticFrozen,
    lowRiskLaneUsed,
    fallbackConditions: adaptiveCore.fallbackConditions,
    updatedMemory,
    updatedProfiles: createUpdatedProfiles(updatedMemory),
    qualifiedOutcome: behaviorFeedbackResult.qualifiedOutcome,
  }
}