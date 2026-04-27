export type EntityTimelineLogEntry = {
  id: string
  type: string
  occurredAt: string
  summary: string
  weight: number
}

export type EntityTimelineLog = {
  schemaVersion: 1
  firstSeenAt: string
  lastEventAt: string
  totalActiveMs: number
  returnCount: number
  interactionDiversity: number
  updatedAt: string
  entries: EntityTimelineLogEntry[]
}

export function buildInitialEntityTimelineLog(now: string): EntityTimelineLog {
  return {
    schemaVersion: 1,
    firstSeenAt: now,
    lastEventAt: now,
    totalActiveMs: 0,
    returnCount: 0,
    interactionDiversity: 0,
    updatedAt: now,
    entries: [],
  }
}