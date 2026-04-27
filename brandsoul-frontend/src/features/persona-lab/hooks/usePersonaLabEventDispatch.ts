import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getDiscovery } from '../../../backend-bridge/api/discoveryApi'
import { getEntityConnections, normalizeEntityInteractionType, persistEntityInteraction } from '../../../backend-bridge/api/entityInteractionApi'
import { createHttpOrchestratorApi, type OrchestratorCommandResponse } from '../../../backend-bridge/api/orchestratorApi'
import { createHybridPersonaEngineApi } from '../../../backend-bridge/api/personaEngineApi'
import type { HydrateRuntimeResponse } from '../../../backend-bridge/contracts/HydrateRuntimeResponse'
import type { OrchestratorFrame } from '../../../backend-bridge/contracts/OrchestratorFrame'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import type { OrchestratorCommand } from '../../../domain/orchestration/contracts/OrchestratorCommand'
import type {
  OrchestratorEvent,
  ReturnVisitSource,
  ShareTriggeredChannel,
} from '../../../domain/orchestration/contracts/OrchestratorEvent'
import type { OrchestratorState } from '../../../domain/orchestration/contracts/OrchestratorState'
import { applyOrchestratorEventToRelationalState } from '../../../domain/orchestration/mappers/eventToRelationalUpdate'
import { orchestratorEventBus } from '../../../domain/orchestration/realtime/orchestratorEventBus'
import { dispatchOrchestratorCommand } from '../../../domain/orchestration/session/orchestratorDispatcher'
import type { FlowMindUiEffect } from '../../../domain/entity/services/flowMindActionExecutor'
import { createEntityScheduler, type EntityScheduledTask } from '../../../domain/entity/services/entityScheduler'
import { applyEntityProfile } from '../state/personaLabActions'
import type { PersonaLabState } from '../state/personaLabStore'

const orchestratorApi = createHttpOrchestratorApi()
const personaEngineApi = createHybridPersonaEngineApi()

type PersonaLabEventInput =
  | {
      name: 'birth.completed'
      payload?: {
        durationMs?: number
      }
    }
  | {
      name: 'interaction.click'
      payload: {
        target?: string
        summary?: string
        topics?: string[]
      }
    }
  | {
      name: 'return.visit'
      payload: {
        source: ReturnVisitSource
      }
    }
  | {
      name: 'share.triggered'
      payload: {
        channel: ShareTriggeredChannel
        summary?: string
      }
    }

function createEventId() {
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEffectId() {
  return `effect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function refreshUiEffect(effect: FlowMindUiEffect, now: string): FlowMindUiEffect {
  if (effect.kind === 'message') {
    return {
      ...effect,
      effectId: createEffectId(),
      createdAt: now,
    }
  }

  if (effect.kind === 'prompt') {
    return {
      ...effect,
      effectId: createEffectId(),
      createdAt: now,
    }
  }

  if (effect.kind === 'discovery') {
    return {
      ...effect,
      effectId: createEffectId(),
      createdAt: now,
    }
  }

  return {
    ...effect,
    effectId: createEffectId(),
    createdAt: now,
  }
}

function buildPersonaLabEvent(state: PersonaLabState, input: PersonaLabEventInput): OrchestratorEvent {
  const base = {
    type: 'event' as const,
    eventId: createEventId(),
    timestamp: new Date().toISOString(),
    sessionId: state.entityProfile?.metadata.sessionId ?? 'persona-lab-ui',
    entityId: state.entityProfile?.id,
  }

  if (input.name === 'birth.completed') {
    return {
      ...base,
      name: 'birth.completed',
      payload: input.payload ?? {},
    }
  }

  if (input.name === 'interaction.click') {
    return {
      ...base,
      name: 'interaction.click',
      payload: input.payload,
    }
  }

  if (input.name === 'return.visit') {
    return {
      ...base,
      name: 'return.visit',
      payload: input.payload,
    }
  }

  return {
    ...base,
    name: 'share.triggered',
    payload: input.payload,
  }
}

function applyBackendAuthorityToState(state: OrchestratorState): OrchestratorState {
  return state
}

function applyBackendAuthorityToFrame(
  frame: OrchestratorFrame,
  commandResponse?: OrchestratorCommandResponse,
): OrchestratorFrame {
  return commandResponse?.frame ?? frame
}

function mapRuntimePayloadToOrchestratorState(input: HydrateRuntimeResponse | OrchestratorCommandResponse): OrchestratorState {
  return {
    sessionId: input.state.sessionId,
    entityId: input.entityId,
    currentStage: input.state.currentStage,
    currentTime: input.state.currentTime,
    sessionStatus: input.state.sessionStatus as OrchestratorState['sessionStatus'],
    runtimeControl: input.state.runtimeControl,
    sequence: input.state.sequence,
    lastCommand: input.state.lastCommand,
    metadata: input.state.metadata,
  }
}

export function usePersonaLabEventDispatch(args: {
  labState: PersonaLabState
  setLabState: Dispatch<SetStateAction<PersonaLabState>>
  setOrchestratorCommand: Dispatch<SetStateAction<OrchestratorCommand | undefined>>
}) {
  const { labState, setLabState, setOrchestratorCommand } = args
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState | undefined>(undefined)
  const [orchestratorFrame, setOrchestratorFrame] = useState<OrchestratorFrame | undefined>(undefined)
  const [flowMindEffects, setFlowMindEffects] = useState<FlowMindUiEffect[]>([])
  const schedulerRef = useRef(createEntityScheduler())
  const orchestratorStateRef = useRef<OrchestratorState | undefined>(undefined)

  useEffect(() => {
    orchestratorStateRef.current = orchestratorState
  }, [orchestratorState])

  const executeScheduledTask = useCallback((task: EntityScheduledTask) => {
    const now = new Date().toISOString()
    const uiEffect = task.payload.uiEffect

    if (uiEffect) {
      setFlowMindEffects((current) => [
        refreshUiEffect(uiEffect, now),
        ...current,
      ].slice(0, 4))
    }

    if (!task.payload.event) {
      return
    }

    const event = {
      ...task.payload.event,
      eventId: createEventId(),
      timestamp: now,
    }

    orchestratorEventBus.publish(event)
    setOrchestratorState((current) => current
      ? {
          ...current,
          lastEvent: event,
          metadata: {
            ...current.metadata,
            updatedAt: now,
          },
        }
      : current)

    setLabState((currentState) => {
      if (!currentState.entityProfile) {
        return currentState
      }

      const nextEntityProfile = applyOrchestratorEventToRelationalState(currentState.entityProfile, event)

      return applyEntityProfile(currentState, nextEntityProfile)
    })
  }, [setLabState])

  useEffect(() => () => {
    schedulerRef.current.listTasks().forEach((task) => {
      schedulerRef.current.cancelTask(task.taskId)
    })
  }, [])

  const resolveSocialTarget = useCallback(async (entityProfile?: EntityProfile) => {
    if (!entityProfile) {
      return undefined
    }

    const [connections, discovery] = await Promise.all([
      getEntityConnections(entityProfile.id),
      getDiscovery({
        referenceEntityId: entityProfile.id,
        limit: 8,
      }),
    ])

    const strongestConnection = connections
      .filter((connection) => connection.sourceEntityId === entityProfile.id || connection.targetEntityId === entityProfile.id)
      .sort((a, b) => b.strength - a.strength)[0]

    const targetEntityId = strongestConnection
      ? (strongestConnection.sourceEntityId === entityProfile.id ? strongestConnection.targetEntityId : strongestConnection.sourceEntityId)
      : discovery?.items.find((item) => item.entityId !== entityProfile.id)?.entityId

    if (!targetEntityId) {
      return undefined
    }

    const response = await personaEngineApi.getEntityById(targetEntityId)
    return response?.entity
  }, [])

  const restoreOrchestratorRuntime = useCallback((input: {
    state: OrchestratorState
    frame: OrchestratorFrame
    pendingUiEffects?: FlowMindUiEffect[]
    pendingScheduledTasks?: EntityScheduledTask[]
  }) => {
    setOrchestratorState(input.state)
    setOrchestratorFrame(input.frame)
    setFlowMindEffects(input.pendingUiEffects ?? [])
    for (const task of input.pendingScheduledTasks ?? []) {
      schedulerRef.current.scheduleTask(task, executeScheduledTask)
    }
  }, [])

  const restoreHydratedRuntime = useCallback((input: HydrateRuntimeResponse) => {
    restoreOrchestratorRuntime({
      state: mapRuntimePayloadToOrchestratorState(input),
      frame: input.frame,
      pendingUiEffects: input.pendingUiEffects,
      pendingScheduledTasks: input.pendingScheduledTasks,
    })
  }, [restoreOrchestratorRuntime])

  const dispatchPersonaCommand = useCallback(async (command: OrchestratorCommand) => {
    setOrchestratorCommand(command)
    const entityId = labState.entityProfile?.id
    const [targetEntityProfile, backendCommandResponse] = await Promise.all([
      entityId ? resolveSocialTarget(labState.entityProfile) : Promise.resolve(undefined),
      entityId
        ? orchestratorApi.sendCommand(entityId, command).catch(() => undefined)
        : Promise.resolve(undefined),
    ])

    if (backendCommandResponse) {
      const authoritativeState = mapRuntimePayloadToOrchestratorState(backendCommandResponse)
      const authoritativeFrame = backendCommandResponse.frame

      setOrchestratorState(authoritativeState)
      setOrchestratorFrame(authoritativeFrame)
      if (backendCommandResponse.pendingUiEffects.length > 0) {
        setFlowMindEffects((current) => [...backendCommandResponse.pendingUiEffects, ...current].slice(0, 4))
      }
      for (const task of backendCommandResponse.pendingScheduledTasks) {
        schedulerRef.current.scheduleTask(task, executeScheduledTask)
      }

      return
    }

    setLabState((currentState) => {
      // Deprecated fallback until the backend owns the remaining non-critical commands.
      const result = dispatchOrchestratorCommand({
        command,
        orchestratorState,
        entityProfile: currentState.entityProfile,
        targetEntityProfile,
      })
      const authoritativeState = result.state
        ? applyBackendAuthorityToState(result.state)
        : result.state
      const authoritativeFrame = authoritativeState && result.frame
        ? applyBackendAuthorityToFrame(result.frame, undefined)
        : undefined

      setOrchestratorState(authoritativeState)
      setOrchestratorFrame(authoritativeFrame)
      if ((result.uiEffects?.length ?? 0) > 0) {
        setFlowMindEffects((current) => [...(result.uiEffects ?? []), ...current].slice(0, 4))
      }
      for (const task of result.scheduledTasks ?? []) {
        schedulerRef.current.scheduleTask(task, executeScheduledTask)
      }

      const action = result.flowMindDecision?.entityAction
      if (
        action?.type === 'entityInteraction' &&
        currentState.entityProfile &&
        targetEntityProfile &&
        action.payload.targetEntityId
      ) {
        void persistEntityInteraction({
          sourceEntityId: currentState.entityProfile.id,
          targetEntityId: targetEntityProfile.id,
          type: normalizeEntityInteractionType(action.payload.interactionType),
          summary:
            action.payload.message ??
            action.payload.suggestion ??
            `Entity interaction: ${action.payload.interactionType ?? 'mention'}.`,
          topics: ['entity-to-entity', action.payload.interactionType ?? 'mention', action.source.intent],
          weight: Math.max(0.22, action.confidence * 0.72),
          commandId: command.commandId,
        })
      }

      if (!result.entityProfile) {
        return currentState
      }

      return applyEntityProfile(currentState, result.entityProfile)
    })
  }, [executeScheduledTask, labState.entityProfile, orchestratorState, resolveSocialTarget, setLabState, setOrchestratorCommand])

  const dispatchPersonaEvent = useCallback((input: PersonaLabEventInput) => {
    setLabState((currentState) => {
      // Deprecated local-only event path kept for UX until equivalent backend commands exist.
      const event = buildPersonaLabEvent(currentState, input)
      orchestratorEventBus.publish(event)

      if (!currentState.entityProfile) {
        return currentState
      }

      return applyEntityProfile(currentState, applyOrchestratorEventToRelationalState(currentState.entityProfile, event))
    })
  }, [setLabState])

  const dismissFlowMindEffect = useCallback((effectId: string) => {
    setFlowMindEffects((current) => current.filter((effect) => effect.effectId !== effectId))
  }, [])

  return {
    orchestratorFrame,
    flowMindEffects,
    restoreOrchestratorRuntime,
    restoreHydratedRuntime,
    dispatchPersonaCommand,
    dispatchPersonaEvent,
    dismissFlowMindEffect,
  }
}
