import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { BindingState, ContinuityState } from './relationalTypes.js'
import { updateBindingFromEvent } from '../brain/domain/entity/services/bindingEngine.js'
import type { RelationalGuardrailPolicy } from './relationalGuardrails.js'

function parseWeight(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function applyBindingDecay(binding: BindingState, policy: RelationalGuardrailPolicy): BindingState {
  if (policy.decay.binding <= 0) {
    return binding
  }

  return {
    ...binding,
    bindingStrength: clamp(binding.bindingStrength - policy.decay.binding, 0, 0.92),
    continuityScore: clamp(binding.continuityScore - policy.decay.continuity, 0, 0.9),
    updatedAt: binding.updatedAt,
  }
}

export function applyBindingRules(binding: BindingState, continuity: ContinuityState, event: EntityEventLogRecord, policy: RelationalGuardrailPolicy): BindingState {
  const decayedBinding = applyBindingDecay(binding, policy)
  const effectiveWeight = (parseWeight(event.payload.weight) ?? 0.4) * policy.weightMultiplier

  if (event.type === 'interaction.registered') {
    const next = updateBindingFromEvent(decayedBinding, {
      name: 'interaction.message',
      timestamp: event.timestamp,
      weight: effectiveWeight,
      continuityScore: continuity.continuityScore,
    })
    return {
      ...next,
      bindingStrength: clamp(next.bindingStrength, 0, 0.92),
      continuityScore: clamp(next.continuityScore, 0, 0.9),
    }
  }

  if (event.type === 'return.visit.registered' || event.type === 'return_visit.registered') {
    const next = updateBindingFromEvent(decayedBinding, {
      name: 'return.visit',
      timestamp: event.timestamp,
      weight: effectiveWeight,
      continuityScore: continuity.continuityScore,
    })
    return {
      ...next,
      bindingStrength: clamp(next.bindingStrength, 0, 0.92),
      continuityScore: clamp(next.continuityScore, 0, 0.9),
    }
  }

  if (event.type === 'share.registered') {
    const next = updateBindingFromEvent(decayedBinding, {
      name: 'share.triggered',
      timestamp: event.timestamp,
      weight: effectiveWeight,
      continuityScore: continuity.continuityScore,
    })
    return {
      ...next,
      bindingStrength: clamp(next.bindingStrength, 0, 0.92),
      continuityScore: clamp(next.continuityScore, 0, 0.9),
    }
  }

  return decayedBinding
}