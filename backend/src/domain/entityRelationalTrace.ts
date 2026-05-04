import type { JsonObject } from './entityProfile.js'

export type EntityRelationalTraceRecord = {
  id: string
  entityId: string
  commandId?: string
  eventType: string
  eventId: string
  actorId?: string
  occurredAt: string
  topic?: string
  intent?: string
  interactionType?: string
  deltaBindingStrength: number
  deltaXp: number
  deltaContinuityConfidence: number
  deltaReturnCount: number
  deltaShareCount: number
  metadataJson: JsonObject
  createdAt: string
}