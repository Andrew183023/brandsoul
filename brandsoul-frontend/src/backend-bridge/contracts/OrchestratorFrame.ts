import type { OrchestratorEvent } from '../../domain/orchestration/contracts/OrchestratorEvent'
import type { RuntimeControl } from '../../domain/orchestration/contracts/RuntimeControl'
import type { RuntimeSignal } from '../../domain/orchestration/contracts/RuntimeSignal'
import type { TimelineState } from '../../domain/orchestration/contracts/TimelineState'
import type { RuntimeSceneSpec } from '../../domain/rendering/contracts/RuntimeSceneSpec'

export type OrchestratorRelationalHints = {
  bindingStrength?: number
  attachmentLevel?: string
  progressionLevel?: number
  memoryConfidence?: number
  loopStrength?: number
  affinityScore?: number
  continuityScore?: number
}

export type OrchestratorRelationalProjection = {
  attachmentLevel: 'low' | 'medium' | 'high' | 'bonded'
  relationshipTier: 'new' | 'growing' | 'engaged' | 'bonded'
  continuityConfidence: number
  maturityStage: 'seed' | 'forming' | 'expressive' | 'stable' | 'evolved'
  affinityIndicator: number
}

export type OrchestratorFrame = {
  frameId: string
  sessionId: string
  entityId?: string
  sequence: number
  timestamp: string
  authority?: 'orchestrator' | 'compatibility'
  stage?: string
  timelineProgress?: number
  runtimeControl: RuntimeControl
  timelineState?: TimelineState
  renderSpecRef?: string
  renderSpec?: RuntimeSceneSpec
  relationalProjection?: OrchestratorRelationalProjection
  relationalHints?: OrchestratorRelationalHints
  pendingSignal?: RuntimeSignal
  emittedEvent?: OrchestratorEvent
}
