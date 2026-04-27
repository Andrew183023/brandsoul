import type { EntityProfile } from '../../entity/contracts/EntityProfile'
import type { OrchestratorCommand } from './OrchestratorCommand'
import type { OrchestratorEvent } from './OrchestratorEvent'
import type { RuntimeControl } from './RuntimeControl'
import type { TimelineState } from './TimelineState'

export type OrchestratorSessionStatus = 'idle' | 'ready' | 'running' | 'paused' | 'completed' | 'error'

export type OrchestratorState = {
  sessionId: string
  entityId?: string
  currentStage?: string
  currentTime: number
  sessionStatus: OrchestratorSessionStatus
  activeCommand?: OrchestratorCommand
  lastCommand?: {
    commandId: string
    type: string
    issuedAt: string
    source: 'user' | 'flowmind' | 'system'
  }
  lastEvent?: OrchestratorEvent
  relationalSnapshotRef?: string
  renderSnapshotRef?: string
  runtimeControl: RuntimeControl
  timelineState?: TimelineState
  sequence: number
  entityProfile?: EntityProfile
  metadata: {
    createdAt: string
    updatedAt: string
  }
}
