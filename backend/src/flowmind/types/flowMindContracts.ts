import type {
  FlowMindAdaptiveDecisionProfile,
  FlowMindHistoricalSignals,
} from '../cognition/adaptiveLearning.js'
import type { FlowMindCognitiveState } from '../cognition/cognitiveState.js'
import type { FlowMindPolicyProfile } from '../cognition/policyProfile.js'
import type { FlowMindStrategyProfile } from '../cognition/strategyProfile.js'
import type { EntityCognitiveMemory, EntityEpisodicMemory } from '../memory/entityCognitiveMemory.js'
import type { CognitiveObjective } from '../objectives/cognitiveObjective.js'
import type {
  FlowMindDecision,
  FlowMindDecisionSeed,
  FlowMindDecisionSource,
  FlowMindTerminalAuthority,
} from './flowMindDecision.js'

export type FlowMindInput = {
  entityId: string
  input: string
  context: Record<string, unknown>
  requestedAt?: string
  memory?: Partial<EntityCognitiveMemory>
  episodicMemory?: {
    retrieved: Array<EntityEpisodicMemory & {
      retrievalWeight: number
      ageDecayWeight: number
      relevanceWeight: number
    }>
    queryTerms: string[]
  }
  objective?: CognitiveObjective
  interaction?: {
    outcome?: unknown
    observableSignals?: unknown
    explicitFeedback?: unknown
    qualifiedOutcomeHistory?: unknown[]
  }
}

export type FlowMindUpdatedProfiles = {
  cognitiveState: FlowMindCognitiveState
  strategyProfile: FlowMindStrategyProfile
  policyProfile: FlowMindPolicyProfile
  adaptiveDecisionProfile: FlowMindAdaptiveDecisionProfile
  historicalSignals: FlowMindHistoricalSignals
}

export type FlowMindAdaptiveCoreResult = {
  decision: FlowMindDecisionSeed
  decisionSource: FlowMindDecisionSource
  terminalAuthority?: FlowMindTerminalAuthority
  fallbackConditions: string[]
  semanticFrozen?: boolean
  lowRiskLaneUsed?: boolean
}

export type FlowMindStrategyResult = {
  decision: FlowMindDecisionSeed
  updatedStrategyProfile: FlowMindStrategyProfile
}

export type FlowMindBehaviorFeedbackResult = {
  nextCognitiveState: FlowMindCognitiveState
  nextHistoricalSignals?: FlowMindHistoricalSignals
  qualifiedOutcome?: unknown
  behaviorFeedbackInfluence?: unknown
}

export type FlowMindDecisionAdapter = {
  name: string
  resolveBaseDecision?: (input: FlowMindInput, memory: EntityCognitiveMemory) => FlowMindDecisionSeed
  resolveAdaptiveCore?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    baseDecision: FlowMindDecision
  }) => FlowMindAdaptiveCoreResult
  applyPolicy?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    decision: FlowMindDecision
    allowSemanticRewrite: boolean
  }) => FlowMindDecisionSeed
  applyCognitiveState?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    decision: FlowMindDecision
    allowSemanticRewrite: boolean
  }) => {
    decision: FlowMindDecisionSeed
    nextCognitiveState: FlowMindCognitiveState
  }
  applyStrategy?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    decision: FlowMindDecision
    allowSemanticRewrite: boolean
    qualifiedOutcome?: unknown
  }) => FlowMindStrategyResult
  applyBehaviorFeedback?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    decision: FlowMindDecision
    currentCognitiveState: FlowMindCognitiveState
  }) => FlowMindBehaviorFeedbackResult
  updatePolicy?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    nextCognitiveState: FlowMindCognitiveState
    nextStrategyProfile: FlowMindStrategyProfile
    nextHistoricalSignals: FlowMindHistoricalSignals
    qualifiedOutcome?: unknown
  }) => FlowMindPolicyProfile
  updateAdaptiveLearning?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    nextPolicyProfile: FlowMindPolicyProfile
    nextStrategyProfile: FlowMindStrategyProfile
    nextHistoricalSignals: FlowMindHistoricalSignals
    qualifiedOutcome?: unknown
  }) => FlowMindAdaptiveDecisionProfile
  updateMemory?: (args: {
    input: FlowMindInput
    previousMemory: EntityCognitiveMemory
    updatedProfiles: FlowMindUpdatedProfiles
    decision: FlowMindDecision
    decisionSource: FlowMindDecisionSource
    terminalAuthority: FlowMindTerminalAuthority
    qualifiedOutcome?: unknown
  }) => EntityCognitiveMemory
}

export type FlowMindOutput = {
  decision: FlowMindDecision
  decisionSource: FlowMindDecisionSource
  terminalAuthority: FlowMindTerminalAuthority
  semanticFrozen: boolean
  lowRiskLaneUsed: boolean
  fallbackConditions: string[]
  updatedMemory: EntityCognitiveMemory
  updatedProfiles: FlowMindUpdatedProfiles
  qualifiedOutcome?: unknown
}
