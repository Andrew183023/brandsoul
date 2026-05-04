import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { ContinuityState } from './relationalTypes.js'
import { appendEntityTimelineEvent, updateContinuityScore } from '../brain/domain/entity/services/continuityEngine.js'
import type { RelationalGuardrailPolicy } from './relationalGuardrails.js'

function parseWeight(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function parseSummary(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

export function applyContinuityRules(continuity: ContinuityState, event: EntityEventLogRecord, policy: RelationalGuardrailPolicy): ContinuityState {
  if (event.type !== 'interaction.registered' && event.type !== 'return.visit.registered' && event.type !== 'return_visit.registered' && event.type !== 'share.registered') {
    if (policy.decay.continuity <= 0) {
      return continuity
    }

    return {
      ...continuity,
      continuityScore: clamp(continuity.continuityScore - policy.decay.continuity, 0, 0.9),
      updatedAt: event.timestamp,
    }
  }

  const decayedContinuity = policy.decay.continuity > 0
    ? {
      ...continuity,
      continuityScore: clamp(continuity.continuityScore - policy.decay.continuity, 0, 0.9),
    }
    : continuity

  if (!policy.continuityAccepted) {
    return {
      ...decayedContinuity,
      updatedAt: event.timestamp,
    }
  }

  const nextTimelineLog = appendEntityTimelineEvent(decayedContinuity.timelineLog, {
    type: event.type === 'share.registered' ? 'share' : event.type === 'interaction.registered' ? 'interaction' : 'return',
    occurredAt: event.timestamp,
    summary: parseSummary(event.payload.summary, `${event.type} registered.`),
    weight: (parseWeight(event.payload.weight) ?? 0.4) * policy.weightMultiplier,
    sourceEventId: event.id,
  })
  const continuityScore = clamp(updateContinuityScore(nextTimelineLog) - policy.decay.continuity, 0, 0.9)

  return {
    schemaVersion: 1,
    timelineLog: nextTimelineLog,
    continuityScore,
    updatedAt: event.timestamp,
  }
}