import type { OrchestratorSnapshotRecord } from '../domain/orchestratorSnapshot.js'
import type { RuntimeControl } from '../brain/domain/orchestration/contracts/RuntimeControl.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { RuntimeSceneSpec } from '../brain/domain/rendering/contracts/RuntimeSceneSpec.js'
import type { OrchestratorRelationalState } from './relationalTypes.js'
import { buildInitialRelationalState, restoreRelationalState } from './relationalTypes.js'

export type OrchestratorSessionStatus = 'idle' | 'ready' | 'running' | 'paused' | 'completed' | 'error'

export type OrchestratorCommandSource = 'user' | 'flowmind' | 'system'

export type OrchestratorCommandName = 'start_birth' | 'pause_birth' | 'resume_birth' | 'set_stage' | 'apply_control' | 'trigger_export' | 'register_interaction' | 'register_return_visit' | 'register_share'

export type OrchestratorCommand = {
  type: 'command'
  name: OrchestratorCommandName
  commandId: string
  issuedAt: string
  source: OrchestratorCommandSource
  payload?: {
    stageId?: string
    control?: RuntimeControl
    interactionType?: string
    topics?: string[]
    weight?: number
    exportFormat?: 'current' | 'square' | 'vertical' | 'post' | 'story'
    summary?: string
  }
}

export type OrchestratorState = {
  entityId: string
  sessionId?: string
  currentStage?: string
  sessionStatus: OrchestratorSessionStatus
  sequence: number
  metadata: {
    createdAt: string
    updatedAt: string
  }
  runtimeControl: RuntimeControl
  relationalState: OrchestratorRelationalState
  lastCommand?: {
    commandId: string
    type: string
    issuedAt: string
    source: OrchestratorCommandSource
  }
  lastEventId?: string
  lastEventType?: string
}

export type OrchestratorRuntimeControl = RuntimeControl

export type OrchestratorRelationalProjection = {
  attachmentLevel: OrchestratorRelationalState['binding']['attachmentLevel']
  relationshipTier: 'new' | 'growing' | 'engaged' | 'bonded'
  continuityConfidence: number
  maturityStage: OrchestratorRelationalState['progression']['maturityStage']
  affinityIndicator: number
}

export type OrchestratorFrame = {
  frameId: string
  sessionId: string
  entityId: string
  sequence: number
  timestamp: string
  authority?: 'orchestrator' | 'compatibility'
  stage?: string
  runtimeControl: OrchestratorRuntimeControl
  renderSpec?: RuntimeSceneSpec
  relationalProjection?: OrchestratorRelationalProjection
  relationalHints?: {
    attachmentLevel?: string
    continuityScore?: number
    progressionLevel?: number
    affinityScore?: number
  }
}

export function createOrchestratorSessionId() {
  return `orchestrator-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createInitialOrchestratorState(args: {
  entityId: string
  entityProfile?: EntityProfile
  fallbackStage?: string
  runtimeControl?: RuntimeControl
  now?: string
}): OrchestratorState {
  const now = args.now ?? new Date().toISOString()

  return {
    entityId: args.entityId,
    currentStage: args.fallbackStage,
    sessionStatus: 'ready',
    sequence: 0,
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
    runtimeControl: args.runtimeControl ?? buildDefaultRuntimeControl(args.fallbackStage),
    relationalState: buildInitialRelationalState({
      entityProfile: args.entityProfile,
      ownerId: args.entityProfile?.ownerId,
      now,
    }),
  }
}

export function restoreOrchestratorState(args: {
  entityId: string
  entityProfile?: EntityProfile
  snapshot?: OrchestratorSnapshotRecord | null
  fallbackStage?: string
  runtimeControl?: RuntimeControl
  now?: string
}): OrchestratorState {
  const now = args.now ?? new Date().toISOString()

  if (!args.snapshot) {
    return createInitialOrchestratorState({
      entityId: args.entityId,
      entityProfile: args.entityProfile,
      fallbackStage: args.fallbackStage,
      runtimeControl: args.runtimeControl,
      now,
    })
  }

  const snapshotRuntimeControl = readRuntimeControl(args.snapshot.renderSnapshot.runtimeControl)
  const restoredRuntimeControl = snapshotRuntimeControl ?? args.runtimeControl ?? buildDefaultRuntimeControl(
    args.snapshot.currentStage ?? readOptionalString(args.snapshot.renderSnapshot.activeStage) ?? args.fallbackStage,
  )

  return {
    entityId: args.entityId,
    sessionId: args.snapshot.sessionId,
    currentStage: args.snapshot.currentStage ?? readOptionalString(args.snapshot.renderSnapshot.activeStage) ?? args.fallbackStage,
    sessionStatus: normalizeSessionStatus(args.snapshot.sessionStatus),
    sequence: args.snapshot.sequence,
    metadata: {
      createdAt: args.snapshot.createdAt,
      updatedAt: args.snapshot.updatedAt,
    },
    relationalState: restoreRelationalState({
      snapshot: args.snapshot.relationalSnapshot,
      entityProfile: args.entityProfile,
      ownerId: args.entityProfile?.ownerId,
      now,
    }),
    runtimeControl: {
      ...restoredRuntimeControl,
      playback: {
        ...restoredRuntimeControl.playback,
        activeStage: args.snapshot.currentStage ?? readOptionalString(args.snapshot.renderSnapshot.activeStage) ?? restoredRuntimeControl.playback?.activeStage,
        playBirthTimeline: normalizeSessionStatus(args.snapshot.sessionStatus) === 'running',
      },
    },
    lastCommand: args.snapshot.lastCommand,
    lastEventId: args.snapshot.lastEventId,
    lastEventType: args.snapshot.lastEventType,
  }
}

export function updateOrchestratorState(
  state: OrchestratorState,
  updates: Partial<Omit<OrchestratorState, 'entityId' | 'metadata'>>,
  now = new Date().toISOString(),
): OrchestratorState {
  return {
    ...state,
    ...updates,
    metadata: {
      ...state.metadata,
      updatedAt: now,
    },
  }
}

export function buildOrchestratorRuntimeControl(state: OrchestratorState): OrchestratorRuntimeControl {
  return {
    ...state.runtimeControl,
    engine: state.runtimeControl.engine === 'visual' ? 'visual' : 'pixi',
    playback: {
      ...state.runtimeControl.playback,
      playBirthTimeline: state.sessionStatus === 'running',
      activeStage: state.currentStage ?? state.runtimeControl.playback?.activeStage,
    },
  }
}

export function buildMinimalOrchestratorFrame(state: OrchestratorState, now = state.metadata.updatedAt): OrchestratorFrame {
  const relationalProjection = buildRelationalProjection(state.relationalState)
  const progressionLevel = typeof state.relationalState.progression.level === 'number'
    ? state.relationalState.progression.level
    : 0

  return {
    frameId: `frame-${state.entityId}-${state.sequence}`,
    sessionId: state.sessionId ?? createOrchestratorSessionId(),
    entityId: state.entityId,
    sequence: state.sequence,
    timestamp: now,
    stage: state.currentStage,
    runtimeControl: buildOrchestratorRuntimeControl(state),
    relationalProjection,
    relationalHints: {
      attachmentLevel: typeof relationalProjection.attachmentLevel === 'string' ? relationalProjection.attachmentLevel : undefined,
      continuityScore: relationalProjection.continuityConfidence,
      progressionLevel,
      affinityScore: relationalProjection.affinityIndicator,
    },
  }
}

function buildRelationalProjection(relationalState: OrchestratorRelationalState): OrchestratorRelationalProjection {
  const attachmentLevel = typeof relationalState.binding.attachmentLevel === 'string'
    ? relationalState.binding.attachmentLevel
    : 'low'
  const bindingStrength = typeof relationalState.binding.bindingStrength === 'number'
    ? relationalState.binding.bindingStrength
    : 0
  const memoryConfidence = typeof relationalState.memory.memoryConfidence === 'number'
    ? relationalState.memory.memoryConfidence
    : 0
  const continuityScore = typeof relationalState.continuity.continuityScore === 'number'
    ? relationalState.continuity.continuityScore
    : 0
  const continuityConfidence = roundProjectionValue(continuityScore)
  const affinityIndicator = roundProjectionValue(
    bindingStrength * 0.44
    + memoryConfidence * 0.28
    + continuityScore * 0.28,
  )

  return {
    attachmentLevel,
    relationshipTier: resolveRelationshipTier(bindingStrength),
    continuityConfidence,
    maturityStage: typeof relationalState.progression.maturityStage === 'string'
      ? relationalState.progression.maturityStage
      : 'seed',
    affinityIndicator,
  }
}

function resolveRelationshipTier(bindingStrength: number): OrchestratorRelationalProjection['relationshipTier'] {
  if (bindingStrength >= 0.82) {
    return 'bonded'
  }
  if (bindingStrength >= 0.58) {
    return 'engaged'
  }
  if (bindingStrength >= 0.3) {
    return 'growing'
  }
  return 'new'
}

function roundProjectionValue(value: number) {
  return Math.round(value * 1000) / 1000
}

function normalizeSessionStatus(status: string): OrchestratorSessionStatus {
  if (status === 'idle' || status === 'ready' || status === 'running' || status === 'paused' || status === 'completed' || status === 'error') {
    return status
  }

  return 'ready'
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRuntimeControl(value: unknown): RuntimeControl | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  const playback = isPlainObject(value.playback) ? value.playback : undefined
  const layerVisibility = isPlainObject(value.layerVisibility) ? value.layerVisibility : undefined
  const debugFlags = isPlainObject(value.debugFlags) ? value.debugFlags : undefined

  return {
    engine: value.engine === 'visual' ? 'visual' : 'pixi',
    playback: playback
      ? {
          playBirthTimeline: typeof playback.playBirthTimeline === 'boolean' ? playback.playBirthTimeline : undefined,
          activeStage: readOptionalString(playback.activeStage),
        }
      : undefined,
    compareMode: typeof value.compareMode === 'boolean' ? value.compareMode : undefined,
    layerVisibility: layerVisibility
      ? {
          field: typeof layerVisibility.field === 'boolean' ? layerVisibility.field : undefined,
          particles: typeof layerVisibility.particles === 'boolean' ? layerVisibility.particles : undefined,
          core: typeof layerVisibility.core === 'boolean' ? layerVisibility.core : undefined,
          debug: typeof layerVisibility.debug === 'boolean' ? layerVisibility.debug : undefined,
          liteEffects: typeof layerVisibility.liteEffects === 'boolean' ? layerVisibility.liteEffects : undefined,
          shapeOnly: typeof layerVisibility.shapeOnly === 'boolean' ? layerVisibility.shapeOnly : undefined,
        }
      : undefined,
    debugFlags: debugFlags
      ? {
          showDebugOverlay: typeof debugFlags.showDebugOverlay === 'boolean' ? debugFlags.showDebugOverlay : undefined,
          showPerformancePanel: typeof debugFlags.showPerformancePanel === 'boolean' ? debugFlags.showPerformancePanel : undefined,
          shapeOnly: typeof debugFlags.shapeOnly === 'boolean' ? debugFlags.shapeOnly : undefined,
        }
      : undefined,
  }
}

function buildDefaultRuntimeControl(activeStage?: string): RuntimeControl {
  return {
    engine: 'pixi',
    playback: {
      playBirthTimeline: false,
      activeStage,
    },
  }
}