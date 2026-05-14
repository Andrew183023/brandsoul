export type OpportunityExecutionProposal = {
  proposalId: string
  sourceOpportunityId: string
  entityId: string
  entityName: string
  actionType: string
  confidence: number
  reasoning: string
  createdAt: string
  governanceStatus: 'pending' | 'approved' | 'rejected'
}
