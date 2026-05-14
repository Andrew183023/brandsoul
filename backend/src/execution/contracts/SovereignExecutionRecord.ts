export type SovereignExecutionRecord = {
  executionId: string
  proposalId: string
  entityId: string
  actionType: string
  executionStatus: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  resultSummary?: string
  generatedLeadId?: string
  revenueAttributed?: number
}
