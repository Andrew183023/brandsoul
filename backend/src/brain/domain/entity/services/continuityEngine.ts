const MAX_TIMELINE_ENTRIES = 40

type TimelineEntryType =
  | 'created'
  | 'return'
  | 'share'
  | 'interaction'
  | 'time_spent'
  | string

export type EntityTimelineEntry = {
  id: string
  type: TimelineEntryType
  occurredAt: string
  summary: string
  weight: number
  sourceEventId?: string
}

export type EntityTimelineLog = {
  schemaVersion: 1
  firstSeenAt: string
  lastEventAt: string
  totalActiveMs: number
  returnCount: number
  interactionDiversity: number
  updatedAt: string
  entries: EntityTimelineEntry[]
}

export type AppendEntityTimelineEventInput = {
  type: TimelineEntryType
  occurredAt?: string
  summary: string
  weight?: number
  durationMs?: number
  sourceEventId?: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function createTimelineEntryId() {
  return `timeline-entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function resolveInteractionDiversity(entries: EntityTimelineEntry[]) {
  const types = new Set(entries.map((entry) => entry.type).filter((type) => type !== 'created'))
  return clamp(types.size / 7)
}

export function buildInitialEntityTimelineLog(createdAt = new Date().toISOString()): EntityTimelineLog {
  return {
    schemaVersion: 1,
    firstSeenAt: createdAt,
    lastEventAt: createdAt,
    totalActiveMs: 0,
    returnCount: 0,
    interactionDiversity: 0,
    updatedAt: createdAt,
    entries: [
      {
        id: createTimelineEntryId(),
        type: 'created',
        occurredAt: createdAt,
        summary: 'Entity created.',
        weight: 0,
      },
    ],
  }
}

export function appendEntityTimelineEvent(log: EntityTimelineLog, input: AppendEntityTimelineEventInput): EntityTimelineLog {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const entry: EntityTimelineEntry = {
    id: createTimelineEntryId(),
    type: input.type,
    occurredAt,
    summary: input.summary,
    weight: clamp(input.weight ?? 0.35),
    sourceEventId: input.sourceEventId,
  }
  const entries = [entry, ...log.entries].slice(0, MAX_TIMELINE_ENTRIES)

  return {
    ...log,
    entries,
    lastEventAt: occurredAt,
    totalActiveMs: log.totalActiveMs + (input.type === 'time_spent' ? Math.max(0, input.durationMs ?? 0) : 0),
    returnCount: log.returnCount + (input.type === 'return' ? 1 : 0),
    interactionDiversity: resolveInteractionDiversity(entries),
    updatedAt: occurredAt,
  }
}

export function updateContinuityScore(log: EntityTimelineLog) {
  const activeTimeScore = clamp(log.totalActiveMs / 900_000)
  const returnScore = clamp(log.returnCount / 5)
  const diversityScore = log.interactionDiversity
  const historyDepthScore = clamp(log.entries.length / 18)

  return clamp(
    activeTimeScore * 0.24 +
      returnScore * 0.34 +
      diversityScore * 0.28 +
      historyDepthScore * 0.14,
  )
}
