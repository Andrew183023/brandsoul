import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import {
  InMemoryEntityCognitiveMemoryStore,
  resolveFlowMindDecision,
  type CognitiveObjective,
  type EntityCognitiveMemoryStore,
  type FlowMindDecisionAdapter,
} from '../flowmind/index.js'
import type { OrchestratorCommand, OrchestratorState } from '../orchestrator/orchestratorState.js'
import type {
  FlowMindAdapterLoadStatus,
  FlowMindPort,
  FlowMindServiceInvocation,
  FlowMindServiceMode,
  FlowMindServiceResult,
} from './flowMindPort.js'

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

function resolveObjectiveFromEntityProfile(
  entityProfile: EntityProfile,
  command: OrchestratorCommand,
): CognitiveObjective | undefined {
  const exportFormats = Array.isArray(entityProfile.export?.formatsEnabled)
    ? entityProfile.export.formatsEnabled
    : []
  const languageStyle = entityProfile.context?.styleAnswers?.languageStyle

  if (command.name === 'trigger_export') {
    return {
      type: 'convert',
      priority: 0.8,
      constraints: ['orchestrator-shadow-mode'],
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
      brandCategory: input.entityProfile.context?.brandCategory,
      actionStyle: styleAnswers?.actionStyle,
      languageStyle: styleAnswers?.languageStyle,
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
  }

  async evaluateOrchestratorCommand(input: FlowMindServiceInvocation): Promise<FlowMindServiceResult | undefined> {
    const effectiveMode = resolveEffectiveMode({
      globalMode: this.mode,
      entityProfile: input.entityProfile,
    })

    if (effectiveMode === 'disabled') {
      return undefined
    }

    const invokedAt = input.now ?? input.command.issuedAt ?? new Date().toISOString()
    const objective = resolveObjectiveFromEntityProfile(input.entityProfile, input.command)
    const output = await resolveFlowMindDecision({
      entityId: input.entityProfile.id,
      input: buildCommandInput(input.command, input.state),
      context: buildFlowMindContext(input),
      objective,
    }, {
      adapter: this.adapter,
      memoryStore: this.memoryStore,
    })
    const fallbackReason = resolveFallbackReason({
      output,
      adapterLoadStatus: this.adapterLoadStatus,
      adapterLoadReason: this.adapterLoadReason,
    })

    return {
      mode: effectiveMode,
      summary: {
        mode: effectiveMode,
        adapterName: this.adapter?.name ?? 'backend-base-fallback',
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