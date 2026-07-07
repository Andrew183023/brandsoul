import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'

export type ExecutiveDecisionType =
  | 'hire'
  | 'expand'
  | 'invest'
  | 'wait'
  | 'redistribute'

export type ExecutiveDecisionPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'

export type ExecutiveDecisionImpact =
  | 'very_high'
  | 'high'
  | 'medium'
  | 'low'

export interface ExecutiveDecisionEvidence {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export interface ExecutiveDecision {
  id: string
  type: ExecutiveDecisionType
  title: string
  priority: ExecutiveDecisionPriority
  impact: ExecutiveDecisionImpact
  confidence: number
  explanation: string
  evidence: ExecutiveDecisionEvidence[]
  recommendedActions: string[]
  blockingFactors: string[]
}

export interface DecisionCenterEngineInput {
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
  officeHealth: OfficeHealth
}

export interface DecisionCenterResult {
  decisions: ExecutiveDecision[]
}
