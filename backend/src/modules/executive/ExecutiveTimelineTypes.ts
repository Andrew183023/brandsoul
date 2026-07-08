import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'

export type ExecutiveTimelineCategory =
  | 'growth'
  | 'operations'
  | 'health'
  | 'coverage'
  | 'capacity'
  | 'sla'
  | 'decision'

export type ExecutiveTimelineImportance =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'

export type ExecutiveTimelineTemporalKind =
  | 'observed'
  | 'trend'
  | 'comparison'

export interface ExecutiveTimelineEvidence {
  key: string
  value?: string | number | boolean | null
  description: string
}

export interface ExecutiveTimelineItem {
  id: string
  category: ExecutiveTimelineCategory
  importance: ExecutiveTimelineImportance
  temporalKind: ExecutiveTimelineTemporalKind
  title: string
  summary: string
  evidence: ExecutiveTimelineEvidence[]
  suggestedAction?: string
  occurredAt?: string
  source:
    | 'growth'
    | 'operational'
    | 'office_health'
    | 'decision_center'
  sourceKey: string
}

export interface ExecutiveTimeline {
  items: ExecutiveTimelineItem[]
  totalDetected: number
  totalPublished: number
  generatedAt: string
}

export interface ExecutiveTimelineEngineInput {
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
  officeHealth: OfficeHealth
  decisionCenter: DecisionCenterResult
  generatedAt?: string
  limit?: number
}
