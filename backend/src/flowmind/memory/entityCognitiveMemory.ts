import {
  createDefaultFlowMindAdaptiveDecisionProfile,
  createDefaultFlowMindHistoricalSignals,
  type FlowMindAdaptiveDecisionProfile,
  type FlowMindHistoricalSignals,
} from '../cognition/adaptiveLearning.js'
import { createDefaultFlowMindCognitiveState, type FlowMindCognitiveState } from '../cognition/cognitiveState.js'
import { createDefaultFlowMindPolicyProfile, type FlowMindPolicyProfile } from '../cognition/policyProfile.js'
import { createDefaultFlowMindStrategyProfile, type FlowMindStrategyProfile } from '../cognition/strategyProfile.js'

export type EntityCognitiveMemory = {
  cognitiveState: FlowMindCognitiveState
  strategyProfile: FlowMindStrategyProfile
  policyProfile: FlowMindPolicyProfile
  adaptiveDecisionProfile: FlowMindAdaptiveDecisionProfile
  historicalSignals: FlowMindHistoricalSignals
}

export function createDefaultEntityCognitiveMemory(): EntityCognitiveMemory {
  return {
    cognitiveState: createDefaultFlowMindCognitiveState(),
    strategyProfile: createDefaultFlowMindStrategyProfile(),
    policyProfile: createDefaultFlowMindPolicyProfile(),
    adaptiveDecisionProfile: createDefaultFlowMindAdaptiveDecisionProfile(),
    historicalSignals: createDefaultFlowMindHistoricalSignals(),
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
  }
}