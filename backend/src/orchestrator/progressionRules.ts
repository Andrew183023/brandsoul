import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { BindingState, ContinuityState, RelationalMemoryState, RelationalProgressionState } from './relationalTypes.js'
import { grantEntityXp, refineEntityProgression } from '../brain/domain/entity/services/progressionEngine.js'
import type { RelationalGuardrailPolicy } from './relationalGuardrails.js'

function parseSummary(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

export function applyProgressionRules(
  progression: RelationalProgressionState,
  event: EntityEventLogRecord,
  context: {
    memory: RelationalMemoryState
    binding: BindingState
    continuity: ContinuityState
  },
  policy: RelationalGuardrailPolicy,
): RelationalProgressionState {
  if (event.type !== 'interaction.registered' && event.type !== 'return.visit.registered' && event.type !== 'return_visit.registered' && event.type !== 'share.registered') {
    if (policy.decay.refinement <= 0) {
      return progression
    }

    return refineEntityProgression(progression, -policy.decay.refinement, event.timestamp)
  }

  const decayedProgression = policy.decay.refinement > 0
    ? refineEntityProgression(progression, -policy.decay.refinement, event.timestamp)
    : progression

  const xpBase = event.type === 'share.registered' ? 18 : event.type === 'interaction.registered' ? 12 : 20
  const continuityBonus = Math.round(context.continuity.continuityScore * 6)
  const memoryBonus = Math.round(context.memory.memoryConfidence * 4)
  const antiSpamPenalty = policy.sameTypeEventsInWindow >= 5 ? 4 : 0
  const granted = grantEntityXp(decayedProgression, {
    amount: Math.max(0, Math.round((xpBase + continuityBonus + memoryBonus - antiSpamPenalty) * policy.weightMultiplier)),
    event: 'interaction',
    note: parseSummary(event.payload.summary, `${event.type} applied by orchestrator relational reducer.`),
    at: event.timestamp,
  })

  const refined = refineEntityProgression(granted, Math.max(0, context.binding.bindingStrength * 0.01 * policy.weightMultiplier), event.timestamp)
  return {
    ...refined,
    refinementScore: clamp(refined.refinementScore, 0, 0.88),
  }
}