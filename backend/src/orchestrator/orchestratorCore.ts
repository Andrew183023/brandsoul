import type { RuntimeControl } from '../brain/domain/orchestration/contracts/RuntimeControl.js'
import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { JsonObject } from '../domain/entityProfile.js'
import type { OrchestratorSnapshotRecord } from '../domain/orchestratorSnapshot.js'
import type { SaveOrchestratorSnapshotInput } from '../repositories/orchestratorSnapshotRepository.js'
import { computeRelationalDelta, applyRelationalEventReducerWithDelta, type RelationalReducerDelta } from './relationalReducer.js'
import { serializeRelationalState } from './relationalTypes.js'
import {
  buildMinimalOrchestratorFrame,
  createOrchestratorSessionId,
  type OrchestratorCommand,
  type OrchestratorCommandName,
  type OrchestratorFrame,
  type OrchestratorState,
  updateOrchestratorState,
} from './orchestratorState.js'

export type ApplyOrchestratorCommandResult = {
  command: OrchestratorCommand
  state: OrchestratorState
  event: EntityEventLogRecord
  relationalDeltas: RelationalReducerDelta[]
  relationalGuardrails: Array<import('./relationalGuardrails.js').RelationalGuardrailPolicy>
  frame: OrchestratorFrame
  snapshot: SaveOrchestratorSnapshotInput
  uiEffects: Array<{
    effectId: string
    entityId: string
    kind: 'export'
    title: string
    body: string
    exportFormat: 'current' | 'square' | 'vertical' | 'post' | 'story'
    createdAt: string
  }>
}

export type ApplyOrchestratorCommandPipelineResult = {
  commands: OrchestratorCommand[]
  state: OrchestratorState
  events: EntityEventLogRecord[]
  relationalDeltas: RelationalReducerDelta[]
  relationalGuardrails: Array<import('./relationalGuardrails.js').RelationalGuardrailPolicy>
  frame: OrchestratorFrame
  snapshot: SaveOrchestratorSnapshotInput
  uiEffects: ApplyOrchestratorCommandResult['uiEffects']
}

export class OrchestratorCommandPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrchestratorCommandPreconditionError'
  }
}

function readRuntimeEngine(value: unknown): 'pixi' | 'visual' | undefined {
  return value === 'pixi' || value === 'visual' ? value : undefined
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

export function createOrchestratorCommand(input: {
  type: 'command'
  name: OrchestratorCommandName
  payload?: {
    stageId?: string
    control?: RuntimeControl
    interactionType?: string
    topics?: string[]
    weight?: number
    exportFormat?: 'current' | 'square' | 'vertical' | 'post' | 'story'
    summary?: string
  }
  commandId?: string
  issuedAt?: string
  source?: import('./orchestratorState.js').OrchestratorCommandSource
}): OrchestratorCommand {
  return {
    type: 'command',
    name: input.name,
    commandId: input.commandId ?? `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      issuedAt: input.issuedAt ?? new Date().toISOString(),
      source: input.source ?? 'system',
    payload: input.payload,
  }
}

export function applyOrchestratorCommand(args: {
  state: OrchestratorState
  command: OrchestratorCommand
  previousSnapshot?: OrchestratorSnapshotRecord | null
  now?: string
}): ApplyOrchestratorCommandResult {
  const pipeline = applyOrchestratorCommandPipeline({
    state: args.state,
    commands: [args.command],
    previousSnapshot: args.previousSnapshot,
    now: args.now,
  })

  return {
    command: args.command,
    state: pipeline.state,
    event: pipeline.events[pipeline.events.length - 1]!,
    relationalDeltas: pipeline.relationalDeltas,
    relationalGuardrails: pipeline.relationalGuardrails,
    frame: pipeline.frame,
    snapshot: pipeline.snapshot,
    uiEffects: pipeline.uiEffects,
  }
}

export function applyOrchestratorCommandPipeline(args: {
  state: OrchestratorState
  commands: OrchestratorCommand[]
  previousSnapshot?: OrchestratorSnapshotRecord | null
  now?: string
}): ApplyOrchestratorCommandPipelineResult {
  const now = args.now ?? new Date().toISOString()
  if (args.commands.length === 0) {
    throw new OrchestratorCommandPreconditionError('At least one command is required to run the orchestrator pipeline.')
  }

  let currentState = updateOrchestratorState(args.state, {
    sessionId: args.state.sessionId ?? createOrchestratorSessionId(),
  }, now)
  const events: EntityEventLogRecord[] = []
  const relationalDeltas: RelationalReducerDelta[] = []
  const relationalGuardrails: Array<import('./relationalGuardrails.js').RelationalGuardrailPolicy> = []
  const uiEffects: ApplyOrchestratorCommandResult['uiEffects'] = []

  for (const command of args.commands) {
    validateCommandPreconditions(currentState, command)
    const previousRelationalState = currentState.relationalState
    const event = createDomainEvent({
      state: currentState,
      command,
      now: command.issuedAt ?? now,
    })
    currentState = applyDomainEvent({
      state: currentState,
      event,
      command,
      now: command.issuedAt ?? now,
    })
    const relationalOutcome = applyRelationalEventReducerWithDelta(previousRelationalState, event)
    events.push(event)
    relationalDeltas.push(relationalOutcome.delta)
    relationalGuardrails.push(relationalOutcome.guardrails)
    uiEffects.push(...buildUiEffects(command, currentState, command.issuedAt ?? now))
  }

  const lastEvent = events[events.length - 1]!
  const frame = buildMinimalOrchestratorFrame(currentState, lastEvent.timestamp)
  const snapshot = buildSnapshot({
    state: currentState,
    event: lastEvent,
    previousSnapshot: args.previousSnapshot,
    now: lastEvent.timestamp,
  })

  return {
    commands: args.commands,
    state: currentState,
    events,
    relationalDeltas,
    relationalGuardrails,
    frame,
    snapshot,
    uiEffects,
  }
}

function buildSnapshot(args: {
  state: OrchestratorState
  event: EntityEventLogRecord
  previousSnapshot?: OrchestratorSnapshotRecord | null
  now: string
}): SaveOrchestratorSnapshotInput {
  return {
    entityId: args.state.entityId,
    sessionId: args.state.sessionId,
    version: args.previousSnapshot?.version ?? 1,
    sequence: args.state.sequence,
    currentStage: args.state.currentStage,
    sessionStatus: args.state.sessionStatus,
    relationalSnapshot: serializeRelationalState(args.state.relationalState) as JsonObject,
    renderSnapshot: {
      ...(args.previousSnapshot?.renderSnapshot ?? {}),
      engine: readRuntimeEngine(args.state.runtimeControl.engine),
      activeStage: args.state.currentStage,
      runtimeControl: toJsonObject(args.state.runtimeControl),
    },
      lastEventId: args.event.id,
      lastCommand: args.state.lastCommand,
    lastEventType: args.event.type,
    createdAt: args.previousSnapshot?.createdAt ?? args.state.metadata.createdAt,
    updatedAt: args.now,
  }
}

function validateCommandPreconditions(state: OrchestratorState, command: OrchestratorCommand) {
  if (command.name === 'start_birth') {
    if (state.sessionStatus === 'running') {
      throw new OrchestratorCommandPreconditionError('Birth is already running.')
    }
    if (state.sessionStatus === 'completed') {
      throw new OrchestratorCommandPreconditionError('Birth session is already completed.')
    }
    return
  }

  if (command.name === 'set_stage') {
    if (!command.payload?.stageId?.trim()) {
      throw new OrchestratorCommandPreconditionError('stageId is required to set stage.')
    }
    return
  }

  if (command.name === 'apply_control') {
    if (!command.payload?.control) {
      throw new OrchestratorCommandPreconditionError('control is required to apply runtime control.')
    }
    return
  }

  if (command.name === 'trigger_export' && !command.payload?.exportFormat) {
    throw new OrchestratorCommandPreconditionError('exportFormat is required to trigger export.')
  }
}

function createDomainEvent(args: {
  state: OrchestratorState
  command: OrchestratorCommand
  now: string
}): EntityEventLogRecord {
  switch (args.command.name) {
    case 'start_birth':
      return createEventRecord(args.state, args.command, 'birth.started', {
        stageId: args.state.currentStage,
      }, args.now)
    case 'set_stage':
      return createEventRecord(args.state, args.command, 'stage.changed', {
        stageId: args.command.payload?.stageId,
      }, args.now)
    case 'apply_control':
      return createEventRecord(args.state, args.command, 'runtime.control.applied', {
        engine: readRuntimeEngine(args.command.payload?.control?.engine),
        activeStage: args.command.payload?.control?.playback?.activeStage,
        playBirthTimeline: args.command.payload?.control?.playback?.playBirthTimeline,
      }, args.now)
    case 'trigger_export':
      return createEventRecord(args.state, args.command, 'export.triggered', {
        exportFormat: args.command.payload?.exportFormat,
        summary: args.command.payload?.summary,
      }, args.now)
    case 'register_interaction':
      return createEventRecord(args.state, args.command, 'interaction.registered', {
        interactionType: args.command.payload?.interactionType,
        summary: args.command.payload?.summary,
        topics: args.command.payload?.topics?.join(','),
        weight: args.command.payload?.weight,
      }, args.now)
    case 'register_return_visit':
      return createEventRecord(args.state, args.command, 'return.visit.registered', {
        summary: args.command.payload?.summary,
        topics: args.command.payload?.topics?.join(','),
        weight: args.command.payload?.weight,
      }, args.now)
    case 'register_share':
      return createEventRecord(args.state, args.command, 'share.registered', {
        summary: args.command.payload?.summary,
        topics: args.command.payload?.topics?.join(','),
        weight: args.command.payload?.weight,
      }, args.now)
    case 'pause_birth':
      return createEventRecord(args.state, args.command, 'birth.paused', {
        stageId: args.state.currentStage,
      }, args.now)
    case 'resume_birth':
      return createEventRecord(args.state, args.command, 'birth.resumed', {
        stageId: args.state.currentStage,
      }, args.now)
  }
}

function applyDomainEvent(args: {
  state: OrchestratorState
  event: EntityEventLogRecord
  command: OrchestratorCommand
  now: string
}): OrchestratorState {
  const nextSequence = args.state.sequence + 1

  if (args.event.type === 'birth.started') {
    return updateOrchestratorState(args.state, {
      sessionStatus: 'running',
      sequence: nextSequence,
      runtimeControl: {
        ...args.state.runtimeControl,
        playback: {
          ...args.state.runtimeControl.playback,
          playBirthTimeline: true,
          activeStage: args.state.currentStage ?? args.state.runtimeControl.playback?.activeStage,
        },
      },
      lastEventId: args.event.id,
      lastEventType: args.event.type,
        lastCommand: {
          commandId: args.command.commandId,
          type: args.command.name,
          issuedAt: args.command.issuedAt,
          source: args.command.source,
        },
      }, args.now)
  }

  if (args.event.type === 'stage.changed') {
    const currentStage = typeof args.event.payload.stageId === 'string' ? args.event.payload.stageId : args.state.currentStage
    return updateOrchestratorState(args.state, {
      currentStage,
      sessionStatus: currentStage === 'final' ? 'completed' : args.state.sessionStatus === 'idle' ? 'ready' : args.state.sessionStatus,
      sequence: nextSequence,
      runtimeControl: {
        ...args.state.runtimeControl,
        playback: {
          ...args.state.runtimeControl.playback,
          activeStage: currentStage,
          playBirthTimeline: currentStage === 'final' ? false : args.state.runtimeControl.playback?.playBirthTimeline,
        },
      },
      lastEventId: args.event.id,
      lastEventType: args.event.type,
        lastCommand: {
          commandId: args.command.commandId,
          type: args.command.name,
          issuedAt: args.command.issuedAt,
          source: args.command.source,
        },
      }, args.now)
  }

  if (args.event.type === 'runtime.control.applied') {
    const control = args.command.payload?.control ?? args.state.runtimeControl
    return updateOrchestratorState(args.state, {
      sequence: nextSequence,
      runtimeControl: {
        ...args.state.runtimeControl,
        ...control,
        playback: {
          ...args.state.runtimeControl.playback,
          ...control.playback,
          activeStage: control.playback?.activeStage ?? args.state.currentStage ?? args.state.runtimeControl.playback?.activeStage,
        },
      },
      lastEventId: args.event.id,
      lastEventType: args.event.type,
        lastCommand: {
          commandId: args.command.commandId,
          type: args.command.name,
          issuedAt: args.command.issuedAt,
          source: args.command.source,
        },
      }, args.now)
  }

  if (args.event.type === 'export.triggered') {
    const relational = applyRelationalEventReducerWithDelta(args.state.relationalState, args.event)
    return updateOrchestratorState(args.state, {
      sequence: nextSequence,
      relationalState: relational.state,
      lastEventId: args.event.id,
      lastEventType: args.event.type,
        lastCommand: {
          commandId: args.command.commandId,
          type: args.command.name,
          issuedAt: args.command.issuedAt,
          source: args.command.source,
        },
      }, args.now)
  }

  const relational = applyRelationalEventReducerWithDelta(args.state.relationalState, args.event)
  return updateOrchestratorState(args.state, {
    sequence: nextSequence,
    relationalState: relational.state,
    lastEventId: args.event.id,
    lastEventType: args.event.type,
      lastCommand: {
        commandId: args.command.commandId,
        type: args.command.name,
        issuedAt: args.command.issuedAt,
        source: args.command.source,
      },
    }, args.now)
}

function createEventRecord(
  state: OrchestratorState,
  command: OrchestratorCommand,
  type: string,
  payload: Record<string, string | number | boolean | undefined>,
  timestamp: string,
): EntityEventLogRecord {
  return {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: state.entityId,
    type,
    payload,
    timestamp,
    causedByCommandId: command.commandId,
  }
}

function buildUiEffects(command: OrchestratorCommand, state: OrchestratorState, now: string) {
  if (command.name !== 'trigger_export' || !command.payload?.exportFormat) {
    return []
  }

  return [
    {
      effectId: `effect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      entityId: state.entityId,
      kind: 'export' as const,
      title: 'Export pronto para execucao',
      body: command.payload.summary ?? `Export ${command.payload.exportFormat} solicitado.`,
      exportFormat: command.payload.exportFormat,
      createdAt: now,
    },
  ]
}