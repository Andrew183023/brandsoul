import type { FlowMindUiEffect } from '../../domain/entity/services/flowMindActionExecutor'
import type { EntityScheduledTask } from '../../domain/entity/services/entityScheduler'
import type { OrchestratorEventLogRecord } from './OrchestratorEventLogRecord'
import type { OrchestratorFrame } from './OrchestratorFrame'
import type { CommandRequest } from './CommandRequest'
import type { FlowMindDecisionComparison, FlowMindServiceSummary } from './DashboardSparkStateResponse'
import type { OrchestratorRuntimeStatePayload, OrchestratorSessionMetadata } from './HydrateRuntimeResponse'

export type CommandResponse = {
  entityId: string
  command: CommandRequest
  state: OrchestratorRuntimeStatePayload
  frame: OrchestratorFrame
  session: OrchestratorSessionMetadata
  lastEvent?: OrchestratorEventLogRecord
  pendingUiEffects: FlowMindUiEffect[]
  pendingScheduledTasks: EntityScheduledTask[]
  sovereignFlowMind?: FlowMindServiceSummary
  flowMindComparison?: FlowMindDecisionComparison
  lineage?: {
    rootCommandId: string
    reentryBlocked: boolean
    followUps: Array<{
      commandId: string
      name: string
      classification: 'domain-command'
      appliedEventIds?: string[]
    }>
  }
}