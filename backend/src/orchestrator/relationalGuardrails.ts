import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { ContinuityState } from './relationalTypes.js'

const SHORT_REPEAT_WINDOW_MS = 45_000
const REPEAT_WINDOW_MS = 3 * 60_000
const ACTIVITY_WINDOW_MS = 15 * 60_000
const INACTIVITY_DECAY_THRESHOLD_MS = 72 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

export type RelationalGuardrailPolicy = {
  weightMultiplier: number
  continuityAccepted: boolean
  inactivityGapMs: number
  sameTypeEventsInWindow: number
  totalEventsInWindow: number
  lastSameTypeGapMs?: number
  decay: {
    binding: number
    continuity: number
    refinement: number
  }
  tags: string[]
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function toTimestampMs(value?: string) {
  if (!value) {
    return undefined
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function mapEventTypeToTimelineType(eventType: string) {
  if (eventType === 'interaction.registered') {
    return 'interaction' as const
  }
  if (eventType === 'return.visit.registered' || eventType === 'return_visit.registered') {
    return 'return' as const
  }
  if (eventType === 'share.registered') {
    return 'share' as const
  }
  return undefined
}

export function resolveRelationalGuardrailPolicy(args: {
  continuity: ContinuityState
  event: EntityEventLogRecord
}): RelationalGuardrailPolicy {
  const mappedType = mapEventTypeToTimelineType(args.event.type)
  const eventAt = toTimestampMs(args.event.timestamp) ?? Date.now()
  const lastEventAt = toTimestampMs(args.continuity.timelineLog.lastEventAt)
  const inactivityGapMs = lastEventAt ? Math.max(0, eventAt - lastEventAt) : 0
  const recentEntries = args.continuity.timelineLog.entries.filter((entry) => {
    const entryAt = toTimestampMs(entry.occurredAt)
    return typeof entryAt === 'number' && eventAt - entryAt >= 0 && eventAt - entryAt <= ACTIVITY_WINDOW_MS
  })
  const recentSameTypeEntries = mappedType
    ? recentEntries.filter((entry) => entry.type === mappedType)
    : []
  const lastSameTypeGapMs = recentSameTypeEntries[0]
    ? Math.max(0, eventAt - (toTimestampMs(recentSameTypeEntries[0].occurredAt) ?? eventAt))
    : undefined

  let weightMultiplier = 1
  const tags: string[] = []

  if (typeof lastSameTypeGapMs === 'number' && lastSameTypeGapMs <= SHORT_REPEAT_WINDOW_MS) {
    weightMultiplier *= 0.18
    tags.push('short-repeat')
  } else if (typeof lastSameTypeGapMs === 'number' && lastSameTypeGapMs <= REPEAT_WINDOW_MS) {
    weightMultiplier *= 0.45
    tags.push('repeat-window')
  }

  if (recentSameTypeEntries.length >= 3) {
    weightMultiplier *= Math.max(0.22, 1 - (recentSameTypeEntries.length - 2) * 0.16)
    tags.push('window-cap')
  }

  if (mappedType === 'share' && recentSameTypeEntries.length >= 2) {
    weightMultiplier *= 0.55
    tags.push('share-spam-guard')
  }

  if (recentEntries.length >= 8) {
    weightMultiplier *= 0.82
    tags.push('dense-activity-window')
  }

  let bindingDecay = 0
  let continuityDecay = 0
  let refinementDecay = 0
  if (inactivityGapMs > INACTIVITY_DECAY_THRESHOLD_MS) {
    const daysInactive = Math.floor((inactivityGapMs - INACTIVITY_DECAY_THRESHOLD_MS) / DAY_MS) + 1
    bindingDecay = Math.min(0.12, daysInactive * 0.015)
    continuityDecay = Math.min(0.18, daysInactive * 0.02)
    refinementDecay = Math.min(0.08, daysInactive * 0.008)
    tags.push('inactivity-decay')
  }

  const continuityAccepted = !(recentSameTypeEntries.length >= 4 && typeof lastSameTypeGapMs === 'number' && lastSameTypeGapMs <= REPEAT_WINDOW_MS)
  if (!continuityAccepted) {
    tags.push('continuity-coalesced')
  }

  // TODO: Replace entry-count heuristics with per-actor/window counters once relational analytics matures.
  // TODO: Distinguish organic shares from system-amplified shares using explicit provenance instead of topic heuristics.
  return {
    weightMultiplier: clamp(weightMultiplier, 0.08, 1),
    continuityAccepted,
    inactivityGapMs,
    sameTypeEventsInWindow: recentSameTypeEntries.length,
    totalEventsInWindow: recentEntries.length,
    lastSameTypeGapMs,
    decay: {
      binding: bindingDecay,
      continuity: continuityDecay,
      refinement: refinementDecay,
    },
    tags,
  }
}