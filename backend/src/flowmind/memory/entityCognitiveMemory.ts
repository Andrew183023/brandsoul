import {
  createDefaultFlowMindAdaptiveDecisionProfile,
  createDefaultFlowMindHistoricalSignals,
  type FlowMindAdaptiveDecisionProfile,
  type FlowMindHistoricalSignals,
} from '../cognition/adaptiveLearning.js'
import { createDefaultFlowMindCognitiveState, type FlowMindCognitiveState } from '../cognition/cognitiveState.js'
import { createDefaultFlowMindPolicyProfile, type FlowMindPolicyProfile } from '../cognition/policyProfile.js'
import { createDefaultFlowMindStrategyProfile, type FlowMindStrategyProfile } from '../cognition/strategyProfile.js'

export type EntityEpisodicMemory = {
  id: string
  summary: string
  tags: string[]
  relevanceScore: number
  recordedAt: string
  context: Record<string, unknown>
}

export type EntityEpisodicMemoryStore = {
  entries: EntityEpisodicMemory[]
}

export type EntityCognitiveMemory = {
  cognitiveState: FlowMindCognitiveState
  strategyProfile: FlowMindStrategyProfile
  policyProfile: FlowMindPolicyProfile
  adaptiveDecisionProfile: FlowMindAdaptiveDecisionProfile
  historicalSignals: FlowMindHistoricalSignals
  episodicMemory: EntityEpisodicMemoryStore
}

function hydrateEpisodicMemoryEntry(seed?: Partial<EntityEpisodicMemory>): EntityEpisodicMemory {
  return {
    id: seed?.id ?? 'episode:unknown',
    summary: seed?.summary ?? '',
    tags: Array.isArray(seed?.tags) ? [...seed.tags] : [],
    relevanceScore: typeof seed?.relevanceScore === 'number' ? seed.relevanceScore : 0,
    recordedAt: seed?.recordedAt ?? '1970-01-01T00:00:00.000Z',
    context: seed?.context && typeof seed.context === 'object' && !Array.isArray(seed.context)
      ? { ...seed.context }
      : {},
  }
}

export function createDefaultEntityCognitiveMemory(): EntityCognitiveMemory {
  return {
    cognitiveState: createDefaultFlowMindCognitiveState(),
    strategyProfile: createDefaultFlowMindStrategyProfile(),
    policyProfile: createDefaultFlowMindPolicyProfile(),
    adaptiveDecisionProfile: createDefaultFlowMindAdaptiveDecisionProfile(),
    historicalSignals: createDefaultFlowMindHistoricalSignals(),
    episodicMemory: {
      entries: [],
    },
  }
}

export function hydrateEntityCognitiveMemory(
  seed?: Partial<EntityCognitiveMemory>,
  base: EntityCognitiveMemory = createDefaultEntityCognitiveMemory(),
): EntityCognitiveMemory {
  return {
    cognitiveState: {
      ...base.cognitiveState,
      ...seed?.cognitiveState,
    },
    strategyProfile: {
      ...base.strategyProfile,
      ...seed?.strategyProfile,
      strategyBias: {
        ...base.strategyProfile.strategyBias,
        ...seed?.strategyProfile?.strategyBias,
      },
    },
    policyProfile: {
      ...base.policyProfile,
      ...seed?.policyProfile,
      confidenceAdjustmentProfile: {
        ...base.policyProfile.confidenceAdjustmentProfile,
        ...seed?.policyProfile?.confidenceAdjustmentProfile,
      },
    },
    adaptiveDecisionProfile: {
      ...base.adaptiveDecisionProfile,
      ...seed?.adaptiveDecisionProfile,
      safetyProfile: {
        ...base.adaptiveDecisionProfile.safetyProfile,
        ...seed?.adaptiveDecisionProfile?.safetyProfile,
      },
      explorationVsExploitationBalance: {
        ...base.adaptiveDecisionProfile.explorationVsExploitationBalance,
        ...seed?.adaptiveDecisionProfile?.explorationVsExploitationBalance,
      },
    },
    historicalSignals: {
      ...base.historicalSignals,
      ...seed?.historicalSignals,
    },
    episodicMemory: {
      entries: (seed?.episodicMemory?.entries ?? base.episodicMemory.entries).map((entry) => hydrateEpisodicMemoryEntry(entry)),
    },
  }
}