export type SemanticMutationIntent = {
  intentId: string
  intentType: string
  domain:
    | 'auth'
    | 'entity'
    | 'memory'
    | 'legal_case'
    | 'governance'
    | 'replay'
    | 'checkpoint'
    | 'queue'
    | 'runtime'

  actor:
    | 'public'
    | 'admin'
    | 'runtime'
    | 'governance'
    | 'recovery'

  targetRef: {
    entityId?: string
    userId?: string
    tenantId?: string
    caseId?: string
    runtimeId?: string
    checkpointId?: string
  }

  semanticPurpose: string
  expectedInstitutionalEffect: string[]

  riskLevel:
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'

  replayRelevant: boolean
  continuityRelevant: boolean
  authRelevant: boolean

  createdAt: string
}
