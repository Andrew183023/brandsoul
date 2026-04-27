import type { FlowMindUiEffect } from '../../domain/entity/services/flowMindActionExecutor'
import type { EntityScheduledTask } from '../../domain/entity/services/entityScheduler'
import type { OrchestratorEventLogRecord } from './OrchestratorEventLogRecord'
import type { OrchestratorFrame } from './OrchestratorFrame'

export type OrchestratorRuntimeStatePayload = {
  sessionId: string
  entityId: string
  currentStage?: string
  currentTime: number
  sessionStatus: string
  sequence: number
  runtimeControl: OrchestratorFrame['runtimeControl']
  lastCommand?: {
    commandId: string
    type: string
    issuedAt: string
    source: 'user' | 'flowmind' | 'system'
  }
  metadata: {
    createdAt: string
    updatedAt: string
  }
}

export type OrchestratorSessionMetadata = {
  hydratedAt: string
  source: 'snapshot' | 'initialized'
  snapshotId?: string
  restoredFromEventLog: boolean
  eventLogWindowSize: number
}

export type HydrateRuntimeResponse = {
  entityId: string
  state: OrchestratorRuntimeStatePayload
  frame: OrchestratorFrame
  session: OrchestratorSessionMetadata
  lastEvent?: OrchestratorEventLogRecord
  pendingUiEffects: FlowMindUiEffect[]
  pendingScheduledTasks: EntityScheduledTask[]
}