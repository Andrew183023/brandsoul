import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import {
  createDefaultEntityCognitiveMemory,
  InMemoryEntityCognitiveMemoryStore,
  resolveFlowMindDecision,
  type CognitiveObjective,
  type EntityCognitiveMemoryStore,
  type FlowMindDecisionAdapter,
} from '../flowmind/index.js'
import { requireCanonicalEntityIdentity } from '../entities/identity/entityIdentityBuilder.js'
import type { OrchestratorCommand, OrchestratorState } from '../orchestrator/orchestratorState.js'
import type {
  FlowMindAdapterLoadStatus,
  FlowMindPort,
  FlowMindServiceInvocation,
  FlowMindServiceMode,
  FlowMindServiceResult,
} from './flowMindPort.js'

function buildContractDecision(args: {
  intent: string
  action: string
  confidence: number
  topic: string
  intentGoal: string
  reason: string
}) {
  return {
    intent: args.intent,
    action: args.action,
    confidence: args.confidence,
    decisionHash: '',
    responsePlan: {
      kind: 'observe',
      topic: args.topic,
      intentGoal: args.intentGoal,
      requiredData: [],
      constraints: [args.reason],
      optionalCloseStyle: 'contextual-clarity',
    },
    actionPayload: {},
    memoryReadSet: [],
    memoryWritePlan: [],
    expectedStateChanges: [],
    metadata: {
      reason: args.reason,
    },
  }
}

export type CreateFlowMindServiceOptions = {
  mode?: FlowMindServiceMode
  adapter?: FlowMindDecisionAdapter
  adapterLoadStatus?: FlowMindAdapterLoadStatus
  adapterLoadReason?: string
  memoryStore?: EntityCognitiveMemoryStore
}

function resolveEntityConfiguredMode(entityProfile: EntityProfile) {
  return entityProfile.runtime?.flowMind?.mode
}

function resolveEffectiveMode(args: {
  globalMode: FlowMindServiceMode
  entityProfile: EntityProfile
}) {
  if (args.globalMode === 'disabled') {
    return 'disabled' as const
  }

  if (args.entityProfile.runtime?.flowMind?.killSwitchEnabled) {
    return 'disabled' as const
  }

  return resolveEntityConfiguredMode(args.entityProfile) ?? args.globalMode
}

function resolveAdapterLoadStatus(options: CreateFlowMindServiceOptions): FlowMindAdapterLoadStatus {
  if (options.adapterLoadStatus) {
    return options.adapterLoadStatus
  }

  return options.adapter ? 'loaded' : 'backend-base-only'
}

function resolveDeterministicInvokedAt(input: FlowMindServiceInvocation) {
  return input.now
    ?? input.command.issuedAt
    ?? input.state.metadata.updatedAt
    ?? input.state.metadata.createdAt
    ?? input.entityProfile.metadata.updatedAt
    ?? input.entityProfile.metadata.createdAt
    ?? '1970-01-01T00:00:00.000Z'
}

function describeDecisionInput(input: FlowMindServiceInvocation) {
  return {
    entityId: input.entityProfile.id,
    commandName: input.command.name,
    commandId: input.command.commandId,
    currentStage: input.state.currentStage,
    sessionStatus: input.state.sessionStatus,
    requestedAt: resolveDeterministicInvokedAt(input),
  }
}

function createMissingCognitiveCoreResult(args: {
  mode: Exclude<FlowMindServiceMode, 'disabled'>
  invokedAt: string
}): FlowMindServiceResult {
  const updatedMemory = createDefaultEntityCognitiveMemory()

  return {
    mode: args.mode,
    summary: {
      mode: args.mode,
      adapterName: 'missing-cognitive-core',
      adapterLoadStatus: 'backend-base-only',
      invokedAt: args.invokedAt,
      decisionSource: 'heuristic-base',
      terminalAuthority: 'heuristic-fallback',
      semanticFrozen: false,
      lowRiskLaneUsed: false,
      fallbackConditions: ['no-cognitive-core'],
      fallbackUsed: true,
      fallbackReason: 'no-cognitive-core',
      decision: {
        intent: 'observe',
        action: 'none',
        confidence: 0,
      },
    },
    output: {
      decision: buildContractDecision({
        intent: 'observe',
        action: 'none',
        confidence: 0,
        topic: 'cognitive-core-unavailable',
        intentGoal: 'preserve-safe-observation',
        reason: 'no-cognitive-core',
      }),
      decisionSource: 'heuristic-base',
      terminalAuthority: 'heuristic-fallback',
      semanticFrozen: false,
      lowRiskLaneUsed: false,
      fallbackConditions: ['no-cognitive-core'],
      updatedMemory,
      updatedProfiles: {
        cognitiveState: updatedMemory.cognitiveState,
        strategyProfile: updatedMemory.strategyProfile,
        policyProfile: updatedMemory.policyProfile,
        adaptiveDecisionProfile: updatedMemory.adaptiveDecisionProfile,
        historicalSignals: updatedMemory.historicalSignals,
      },
    },
  }
}

function createDegradedCognitionResult(args: {
  mode: Exclude<FlowMindServiceMode, 'disabled'>
  invokedAt: string
  reason: string
}): FlowMindServiceResult {
  const updatedMemory = createDefaultEntityCognitiveMemory()

  return {
    mode: args.mode,
    summary: {
      mode: args.mode,
      adapterName: 'degraded-cognition',
      adapterLoadStatus: 'load-failed',
      invokedAt: args.invokedAt,
      decisionSource: 'heuristic-base',
      terminalAuthority: 'heuristic-fallback',
      semanticFrozen: false,
      lowRiskLaneUsed: false,
      fallbackConditions: ['degraded_cognition'],
      fallbackUsed: true,
      fallbackReason: args.reason,
      decision: {
        intent: 'observe',
        action: 'none',
        confidence: 0,
      },
      objectiveType: 'degraded_cognition',
    },
    output: {
      decision: buildContractDecision({
        intent: 'observe',
        action: 'none',
        confidence: 0,
        topic: 'degraded_cognition',
        intentGoal: 'preserve-safe-observation',
        reason: 'degraded_cognition',
      }),
      decisionSource: 'heuristic-base',
      terminalAuthority: 'heuristic-fallback',
      semanticFrozen: false,
      lowRiskLaneUsed: false,
      fallbackConditions: ['degraded_cognition'],
      updatedMemory,
      updatedProfiles: {
        cognitiveState: updatedMemory.cognitiveState,
        strategyProfile: updatedMemory.strategyProfile,
        policyProfile: updatedMemory.policyProfile,
        adaptiveDecisionProfile: updatedMemory.adaptiveDecisionProfile,
        historicalSignals: updatedMemory.historicalSignals,
      },
    },
  }
}

function resolveFallbackReason(args: {
  output: Awaited<ReturnType<typeof resolveFlowMindDecision>>
  adapterLoadStatus: FlowMindAdapterLoadStatus
  adapterLoadReason?: string
}) {
  const primaryFallbackCondition = args.output.fallbackConditions.find((condition) => condition.trim().length > 0)
  if (primaryFallbackCondition) {
    return primaryFallbackCondition
  }

  if (args.adapterLoadStatus === 'load-failed') {
    return args.adapterLoadReason ?? 'shadow-adapter-load-failed'
  }

  if (args.adapterLoadStatus === 'backend-base-only') {
    return 'shadow-adapter-unavailable'
  }

  return undefined
}

function buildCommandInput(command: OrchestratorCommand, state: OrchestratorState) {
  if (typeof command.payload?.summary === 'string' && command.payload.summary.trim().length > 0) {
    return command.payload.summary.trim()
  }

  switch (command.name) {
    case 'trigger_export':
      return `trigger export in format ${command.payload?.exportFormat ?? 'current'} for stage ${state.currentStage ?? 'unknown'}`
    case 'set_stage':
      return `set entity stage to ${command.payload?.stageId ?? 'unknown-stage'}`
    case 'apply_control':
      return `apply runtime control for engine ${command.payload?.control?.engine ?? 'visual'}`
    case 'resume_birth':
      return 'resume entity birth timeline'
    case 'pause_birth':
      return 'pause entity birth timeline'
    case 'start_birth':
    default:
      return `run orchestrator command ${command.name}`
  }
}

export function resolveObjectiveFromEntityProfile(
  entityProfile: EntityProfile,
  command: OrchestratorCommand,
): CognitiveObjective | undefined {
  requireCanonicalEntityIdentity(entityProfile, 'flowMindService.resolveObjectiveFromEntityProfile')
  const exportFormats = Array.isArray(entityProfile.export?.formatsEnabled)
    ? entityProfile.export.formatsEnabled
    : []
  const languageStyle = entityProfile.context?.styleAnswers?.languageStyle
  const canonicalBehavior = entityProfile.canonicalIdentity?.persona.responseBehaviorProfile

  if (command.name === 'trigger_export') {
    return {
      type: 'convert',
      priority: 0.8,
      constraints: ['orchestrator-shadow-mode'],
    }
  }

  if (canonicalBehavior?.primaryObjective === 'guide') {
    return {
      type: 'engage',
      priority: 0.6,
      constraints: ['backend-native-persona-guide'],
    }
  }

  if (canonicalBehavior?.primaryObjective === 'educate') {
    return {
      type: 'educate',
      priority: 0.52,
      constraints: ['backend-native-persona-educate'],
    }
  }

  if (exportFormats.length > 0) {
    return {
      type: 'engage',
      priority: 0.58,
      constraints: ['entity-has-export-surface'],
    }
  }

  if (languageStyle === 'technical') {
    return {
      type: 'educate',
      priority: 0.46,
      constraints: ['brand-language-style-technical'],
    }
  }

  return {
    type: 'engage',
    priority: 0.42,
    constraints: ['default-orchestrator-objective'],
  }
}

function buildFlowMindContext(input: FlowMindServiceInvocation) {
  const canonicalIdentity = requireCanonicalEntityIdentity(input.entityProfile, 'flowMindService.buildFlowMindContext')
  const exportFormats = Array.isArray(input.entityProfile.export?.formatsEnabled)
    ? input.entityProfile.export.formatsEnabled
    : []
  const styleAnswers = input.entityProfile.context?.styleAnswers

  return {
    source: 'orchestrator',
    command: {
      name: input.command.name,
      commandId: input.command.commandId,
      payload: input.command.payload,
    },
    orchestrator: {
      entityId: input.state.entityId,
      currentStage: input.state.currentStage,
      sessionStatus: input.state.sessionStatus,
      sequence: input.state.sequence,
    },
    entity: {
      profileId: input.entityProfile.id,
      canonicalName: canonicalIdentity.identity.canonicalName,
      canonicalSlug: canonicalIdentity.identity.canonicalSlug,
      entityType: canonicalIdentity.identity.entityType,
      brandCategory: input.entityProfile.context?.brandCategory,
      actionStyle: styleAnswers?.actionStyle,
      languageStyle: styleAnswers?.languageStyle,
      communicationStyle: canonicalIdentity.persona.communicationStyle,
      governanceProfile: canonicalIdentity.runtime.governanceProfile,
      memoryProfile: canonicalIdentity.runtime.memoryProfile,
      hasExports: exportFormats.length > 0,
      confidence: input.entityProfile.metadata.confidence,
    },
    shadowRuntime: {
      entityProfile: input.entityProfile,
      orchestratorState: input.state,
      command: input.command,
      now: input.now,
    },
  }
}

class FlowMindService implements FlowMindPort {
  readonly mode: FlowMindServiceMode
  readonly adapter?: FlowMindDecisionAdapter
  private readonly memoryStore: EntityCognitiveMemoryStore
  private readonly adapterLoadStatus: FlowMindAdapterLoadStatus
  private readonly adapterLoadReason?: string

  constructor(options: CreateFlowMindServiceOptions = {}) {
    this.mode = options.mode ?? 'shadow'
    this.adapter = options.adapter
    this.memoryStore = options.memoryStore ?? new InMemoryEntityCognitiveMemoryStore()
    this.adapterLoadStatus = resolveAdapterLoadStatus(options)
    this.adapterLoadReason = options.adapterLoadReason

    if (!options.adapter && this.mode !== 'disabled') {
      console.error('flowmind.adapter_missing', {
        severity: 'critical',
        mode: this.mode,
        outcome: 'safe-observable-decision',
      })
    }
  }

  async evaluateOrchestratorCommand(input: FlowMindServiceInvocation): Promise<FlowMindServiceResult | undefined> {
    console.info('flowmind.decision_input', describeDecisionInput(input))
    const effectiveMode = resolveEffectiveMode({
      globalMode: this.mode,
      entityProfile: input.entityProfile,
    })

    if (effectiveMode === 'disabled') {
      return undefined
    }

    const invokedAt = resolveDeterministicInvokedAt(input)
    if (!this.adapter) {
      return createDegradedCognitionResult({
        mode: effectiveMode,
        invokedAt,
        reason: 'degraded_cognition',
      })
    }

    const objective = resolveObjectiveFromEntityProfile(input.entityProfile, input.command)
    let output

    try {
      output = await resolveFlowMindDecision({
        entityId: input.entityProfile.id,
        input: buildCommandInput(input.command, input.state),
        context: buildFlowMindContext(input),
        requestedAt: invokedAt,
        objective,
        memory: input.memory,
      }, {
        adapter: this.adapter,
      })
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'ENTITY_CANONICAL_IDENTITY_REQUIRED'
      ) {
        throw error
      }

      return createDegradedCognitionResult({
        mode: effectiveMode,
        invokedAt,
        reason: 'degraded_cognition',
      })
    }
    const fallbackReason = resolveFallbackReason({
      output,
      adapterLoadStatus: this.adapterLoadStatus,
      adapterLoadReason: this.adapterLoadReason,
    })

    if (fallbackReason) {
      console.warn('flowmind.fallback_used', {
        entityId: input.entityProfile.id,
        commandName: input.command.name,
        fallbackReason,
        adapterLoadStatus: this.adapterLoadStatus,
      })
    }

    return {
      mode: effectiveMode,
      summary: {
        mode: effectiveMode,
        adapterName: this.adapter.name,
        adapterLoadStatus: this.adapterLoadStatus,
        invokedAt,
        decisionSource: output.decisionSource,
        terminalAuthority: output.terminalAuthority,
        semanticFrozen: output.semanticFrozen,
        lowRiskLaneUsed: output.lowRiskLaneUsed,
        fallbackConditions: output.fallbackConditions,
        fallbackUsed: fallbackReason !== undefined,
        fallbackReason,
        decision: {
          intent: output.decision.intent,
          action: output.decision.action,
          confidence: output.decision.confidence,
        },
        objectiveType: objective?.type,
      },
      output,
    }
  }
}

export function createFlowMindService(options: CreateFlowMindServiceOptions = {}): FlowMindPort {
  return new FlowMindService(options)
}
