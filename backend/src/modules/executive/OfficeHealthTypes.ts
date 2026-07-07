import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'

export interface OfficeHealthDriver {
  key: string
  title: string
  impact: 'positive' | 'neutral' | 'negative'
  weight: number
  summary: string
}

export interface OfficeHealth {
  score: number
  level: 'excellent' | 'good' | 'attention' | 'critical'
  explanation: string
  positives: OfficeHealthDriver[]
  warnings: OfficeHealthDriver[]
  opportunities: OfficeHealthDriver[]
  drivers: OfficeHealthDriver[]
}

export interface OfficeHealthEngineInput {
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
}
