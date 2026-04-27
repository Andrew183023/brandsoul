export type EntityTimelineEntry = {
  id: string
  type: string
  occurredAt: string
  [key: string]: unknown
}

export type EntityTimelineLog = {
  entries: EntityTimelineEntry[]
  [key: string]: unknown
}