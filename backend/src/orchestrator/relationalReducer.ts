import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { OrchestratorRelationalState } from './relationalTypes.js'
import { applyBindingRules } from './bindingRules.js'
import { applyContinuityRules } from './continuityRules.js'
import { resolveRelationalGuardrailPolicy, type RelationalGuardrailPolicy } from './relationalGuardrails.js'
import { applyMemoryRules } from './memoryRules.js'
import { applyProgressionRules } from './progressionRules.js'

export type RelationalReducerDelta = {
  deltaBindingStrength: number
  deltaXp: number
  deltaContinuityConfidence: number
  deltaReturnCount: number
  deltaShareCount: number
}

export type RelationalReducerResult = {
  state: OrchestratorRelationalState
  delta: RelationalReducerDelta
  guardrails: RelationalGuardrailPolicy
}

function roundDelta(value: number) {
  return Math.round(value * 10000) / 10000
}

function countShareEntries(state: OrchestratorRelationalState) {
  return state.continuity.timelineLog.entries.filter((entry) => entry.type === 'share').length
}

export function computeRelationalDelta(before: OrchestratorRelationalState, after: OrchestratorRelationalState): RelationalReducerDelta {
  return {
    deltaBindingStrength: roundDelta(after.binding.bindingStrength - before.binding.bindingStrength),
    deltaXp: roundDelta(after.progression.xp - before.progression.xp),
    deltaContinuityConfidence: roundDelta(after.continuity.continuityScore - before.continuity.continuityScore),
    deltaReturnCount: after.continuity.timelineLog.returnCount - before.continuity.timelineLog.returnCount,
    deltaShareCount: countShareEntries(after) - countShareEntries(before),
  }
}

export function applyRelationalEventReducer(state: OrchestratorRelationalState, event: EntityEventLogRecord): OrchestratorRelationalState {
  return applyRelationalEventReducerWithDelta(state, event).state
}

export function applyRelationalEventReducerWithDelta(state: OrchestratorRelationalState, event: EntityEventLogRecord): RelationalReducerResult {
  const guardrails = resolveRelationalGuardrailPolicy({
    continuity: state.continuity,
    event,
  })
  const continuity = applyContinuityRules(state.continuity, event, guardrails)
  const memory = applyMemoryRules(state.memory, event)
  const binding = applyBindingRules(state.binding, continuity, event, guardrails)
  const progression = applyProgressionRules(state.progression, event, {
    memory,
    binding,
    continuity,
  }, guardrails)

  return {
    state: {
      memory,
      binding,
      continuity,
      progression,
    },
    delta: computeRelationalDelta(state, {
      memory,
      binding,
      continuity,
      progression,
    }),
    guardrails,
  }
}