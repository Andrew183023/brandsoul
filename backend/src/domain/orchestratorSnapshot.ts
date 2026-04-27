import type { JsonObject } from './entityProfile.js'

export type OrchestratorSnapshotRecord = {
  id: string
  entityId: string
  sessionId?: string
  version: number
  sequence: number
  currentStage?: string
  sessionStatus: string
  relationalSnapshot: JsonObject
  renderSnapshot: JsonObject
  lastCommand?: {
    commandId: string
    type: string
    issuedAt: string
    source: 'user' | 'flowmind' | 'system'
  }
  lastEventId?: string
  lastEventType?: string
  createdAt: string
  updatedAt: string
}
