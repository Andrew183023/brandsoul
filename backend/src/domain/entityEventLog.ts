import type { JsonObject } from './entityProfile.js'

export type EntityEventLogRecord = {
  id: string
  entityId: string
  type: string
  payload: JsonObject
  timestamp: string
  causedByCommandId?: string
}