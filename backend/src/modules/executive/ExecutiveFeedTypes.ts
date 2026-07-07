import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'

export type ExecutiveFeedCategory =
  | 'health'
  | 'growth'
  | 'operations'
  | 'decision'
  | 'coverage'
  | 'capacity'
  | 'sla'

export type ExecutiveFeedSeverity =
  | 'critical'
  | 'warning'
  | 'opportunity'
  | 'positive'
  | 'info'

export interface ExecutiveFeedEvidence {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export interface ExecutiveFeedItem {
  id: string
  category: ExecutiveFeedCategory
  severity: ExecutiveFeedSeverity
  title: string
  summary: string
  evidence: ExecutiveFeedEvidence[]
  suggestedAction?: string
  source:
    | 'office_health'
    | 'growth'
    | 'operational'
    | 'decision_center'
  sourceKey: string
}

export interface ExecutiveFeed {
  items: ExecutiveFeedItem[]
  totalDetected: number
  totalPublished: number
  generatedAt: string
}

export interface ExecutiveFeedEngineInput {
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
  officeHealth: OfficeHealth
  decisionCenter: DecisionCenterResult
  generatedAt?: string
  limit?: number
}
