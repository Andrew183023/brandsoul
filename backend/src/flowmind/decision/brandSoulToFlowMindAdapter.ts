import type {
  FlowMindAdaptiveCoreResult,
  FlowMindBehaviorFeedbackResult,
  FlowMindDecisionAdapter,
  FlowMindInput,
  FlowMindStrategyResult,
} from '../types/flowMindContracts.js'
import type { FlowMindDecision } from '../types/flowMindDecision.js'
import { hydrateEntityCognitiveMemory, type EntityCognitiveMemory } from '../memory/entityCognitiveMemory.js'

type BrandSoulLikeDecision = FlowMindDecision

type BrandSoulDecisionWithStateResolution = {
  decision: BrandSoulLikeDecision
  adaptiveDecisionCore: {
    decision: BrandSoulLikeDecision
    decisionSource: 'adaptive-core' | 'heuristic-fallback'
    lowRiskLaneUsed?: boolean
    core?: {
      fallbackConditions?: string[]
    }
  }
  nextCognitiveState: Record<string, unknown>
  nextHistoricalSignals: Record<string, unknown>
  nextPolicyProfile: Record<string, unknown>
  nextAdaptiveDecisionProfile: Record<string, unknown>
  qualifiedInteractionOutcome?: unknown
  nextStrategyProfile: Record<string, unknown>
}

type BrandSoulRuntimeState = {
  context: unknown
  currentState: unknown
  currentAdaptiveDecisionProfile?: unknown
  currentPolicyProfile?: unknown
  currentStrategyProfile?: unknown
  historicalSignals?: unknown
  qualifiedOutcomeHistory?: unknown[]
}

type CachedBrandSoulResolution = {
  key: string
  runtimeState: BrandSoulRuntimeState
  resolution: BrandSoulDecisionWithStateResolution
}

export type BrandSoulAdapterDependencies = {
  resolveBrandSoulDecision: (context: unknown, userMessage: string) => BrandSoulLikeDecision
  resolveBrandSoulDecisionWithState?: (args: {
    context: unknown
    userMessage: string
    currentState: unknown
    currentAdaptiveDecisionProfile?: unknown
    currentPolicyProfile?: unknown
    currentStrategyProfile?: unknown
    explicitUserFeedback?: unknown
    historicalSignals?: unknown
    interactionOutcome?: unknown
    observableInteractionSignals?: unknown
    qualifiedOutcomeHistory?: unknown[]
  }) => BrandSoulDecisionWithStateResolution
  mapFlowMindContextToBrandSoulContext?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
  }) => unknown
  initializeBrandSoulRuntimeState?: (args: {
    input: FlowMindInput
    memory: EntityCognitiveMemory
    context: unknown
  }) => BrandSoulRuntimeState
  mapBrandSoulResolutionToMemory?: (args: {
    previousMemory: EntityCognitiveMemory
    resolution: BrandSoulDecisionWithStateResolution
  }) => Partial<EntityCognitiveMemory>
}

export function createBrandSoulToFlowMindAdapter(
  dependencies: BrandSoulAdapterDependencies,
): FlowMindDecisionAdapter {
  const runtimeStateByEntityId = new Map<string, BrandSoulRuntimeState>()
  const resolutionCache = new Map<string, CachedBrandSoulResolution>()

  function resolveInvocationKey(input: FlowMindInput) {
    const commandRecord = input.context.command
    const command = commandRecord && typeof commandRecord === 'object'
      ? commandRecord as { commandId?: unknown }
      : undefined
    const commandId =
      typeof command?.commandId === 'string'
        ? command.commandId
        : undefined

    return `${input.entityId}:${commandId ?? input.input}`
  }

  function resolveBrandSoulContext(input: FlowMindInput, memory: EntityCognitiveMemory) {
    return dependencies.mapFlowMindContextToBrandSoulContext?.({ input, memory }) ?? input.context
  }

  function deriveInitialRuntimeState(input: FlowMindInput, memory: EntityCognitiveMemory) {
    const context = resolveBrandSoulContext(input, memory)
    return dependencies.initializeBrandSoulRuntimeState?.({
      input,
      memory,
      context,
    }) ?? {
      context,
      currentState: memory.cognitiveState,
      currentAdaptiveDecisionProfile: memory.adaptiveDecisionProfile,
      currentPolicyProfile: memory.policyProfile,
      currentStrategyProfile: memory.strategyProfile,
      historicalSignals: memory.historicalSignals,
      qualifiedOutcomeHistory: input.interaction?.qualifiedOutcomeHistory,
    }
  }

  function getOrResolveWrappedDecision(input: FlowMindInput, memory: EntityCognitiveMemory) {
    if (!dependencies.resolveBrandSoulDecisionWithState) {
      return undefined
    }

    const key = resolveInvocationKey(input)
    const cached = resolutionCache.get(key)
    if (cached) {
      return cached
    }

    const runtimeState = runtimeStateByEntityId.get(input.entityId) ?? deriveInitialRuntimeState(input, memory)
    const resolution = dependencies.resolveBrandSoulDecisionWithState({
      context: runtimeState.context,
      userMessage: input.input,
      currentState: runtimeState.currentState,
      currentAdaptiveDecisionProfile: runtimeState.currentAdaptiveDecisionProfile,
      currentPolicyProfile: runtimeState.currentPolicyProfile,
      currentStrategyProfile: runtimeState.currentStrategyProfile,
      explicitUserFeedback: input.interaction?.explicitFeedback,
      historicalSignals: runtimeState.historicalSignals,
      interactionOutcome: input.interaction?.outcome,
      observableInteractionSignals: input.interaction?.observableSignals,
      qualifiedOutcomeHistory: runtimeState.qualifiedOutcomeHistory,
    })

    const nextRuntimeState: BrandSoulRuntimeState = {
      context: runtimeState.context,
      currentState: resolution.nextCognitiveState,
      currentAdaptiveDecisionProfile: resolution.nextAdaptiveDecisionProfile,
      currentPolicyProfile: resolution.nextPolicyProfile,
      currentStrategyProfile: resolution.nextStrategyProfile,
      historicalSignals: resolution.nextHistoricalSignals,
      qualifiedOutcomeHistory: [
        ...(runtimeState.qualifiedOutcomeHistory ?? []),
        resolution.qualifiedInteractionOutcome,
      ].filter((entry) => entry !== undefined),
    }

    runtimeStateByEntityId.set(input.entityId, nextRuntimeState)

    const wrappedResolution = {
      key,
      runtimeState: nextRuntimeState,
      resolution,
    }

    resolutionCache.set(key, wrappedResolution)
    return wrappedResolution
  }

  function clearCachedResolution(input: FlowMindInput) {
    resolutionCache.delete(resolveInvocationKey(input))
  }

  function mapResolutionToMemory(previousMemory: EntityCognitiveMemory, resolution: BrandSoulDecisionWithStateResolution) {
    return hydrateEntityCognitiveMemory(
      dependencies.mapBrandSoulResolutionToMemory?.({
        previousMemory,
        resolution,
      }) ?? {},
      previousMemory,
    )
  }

  return {
    name: 'brandsoul-compat-adapter',
    resolveBaseDecision(input, memory) {
      return dependencies.resolveBrandSoulDecision(resolveBrandSoulContext(input, memory), input.input)
    },
    resolveAdaptiveCore(args): FlowMindAdaptiveCoreResult {
      const wrapped = getOrResolveWrappedDecision(args.input, args.memory)
      if (!wrapped) {
        return {
          decision: args.baseDecision,
          decisionSource: 'heuristic-base',
          terminalAuthority: 'heuristic-fallback',
          fallbackConditions: ['brandsoul-wrapper-not-configured'],
          semanticFrozen: false,
          lowRiskLaneUsed: false,
        }
      }

      const { resolution: result } = wrapped

      return {
        decision: result.adaptiveDecisionCore.decision,
        decisionSource: result.adaptiveDecisionCore.decisionSource === 'adaptive-core' ? 'adaptive-core' : 'heuristic-base',
        terminalAuthority: result.adaptiveDecisionCore.decisionSource === 'adaptive-core' ? 'adaptive-core' : 'heuristic-fallback',
        fallbackConditions: result.adaptiveDecisionCore.core?.fallbackConditions ?? [],
        semanticFrozen: result.adaptiveDecisionCore.decisionSource === 'adaptive-core',
        lowRiskLaneUsed: result.adaptiveDecisionCore.lowRiskLaneUsed === true,
      }
    },
    applyPolicy(args) {
      return getOrResolveWrappedDecision(args.input, args.memory)?.resolution.decision ?? args.decision
    },
    applyCognitiveState(args) {
      const wrapped = getOrResolveWrappedDecision(args.input, args.memory)
      if (!wrapped) {
        return {
          decision: args.decision,
          nextCognitiveState: args.memory.cognitiveState,
        }
      }

      return {
        decision: wrapped.resolution.decision,
        nextCognitiveState: mapResolutionToMemory(args.memory, wrapped.resolution).cognitiveState,
      }
    },
    applyBehaviorFeedback(args): FlowMindBehaviorFeedbackResult {
      const wrapped = getOrResolveWrappedDecision(args.input, args.memory)
      if (!wrapped) {
        return {
          nextCognitiveState: args.currentCognitiveState,
          nextHistoricalSignals: args.memory.historicalSignals,
        }
      }

      const mappedMemory = mapResolutionToMemory(args.memory, wrapped.resolution)

      return {
        nextCognitiveState: mappedMemory.cognitiveState,
        nextHistoricalSignals: mappedMemory.historicalSignals,
        qualifiedOutcome: wrapped.resolution.qualifiedInteractionOutcome,
        behaviorFeedbackInfluence: wrapped.resolution.decision.behaviorFeedbackInfluence,
      }
    },
    applyStrategy(args): FlowMindStrategyResult {
      const wrapped = getOrResolveWrappedDecision(args.input, args.memory)
      if (!wrapped) {
        return {
          decision: args.decision,
          updatedStrategyProfile: args.memory.strategyProfile,
        }
      }

      const mappedMemory = mapResolutionToMemory(args.memory, wrapped.resolution)

      return {
        decision: wrapped.resolution.decision,
        updatedStrategyProfile: mappedMemory.strategyProfile,
      }
    },
    updatePolicy(args) {
      const wrapped = getOrResolveWrappedDecision(args.input, args.memory)
      return wrapped ? mapResolutionToMemory(args.memory, wrapped.resolution).policyProfile : args.memory.policyProfile
    },
    updateAdaptiveLearning(args) {
      const wrapped = getOrResolveWrappedDecision(args.input, args.memory)
      return wrapped ? mapResolutionToMemory(args.memory, wrapped.resolution).adaptiveDecisionProfile : args.memory.adaptiveDecisionProfile
    },
    updateMemory(args) {
      const wrapped = getOrResolveWrappedDecision(args.input, args.previousMemory)
      const nextMemory = wrapped
        ? mapResolutionToMemory(args.previousMemory, wrapped.resolution)
        : hydrateEntityCognitiveMemory(args.updatedProfiles, args.previousMemory)

      clearCachedResolution(args.input)

      return nextMemory
    },
  }
}
