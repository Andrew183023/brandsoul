import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'

export type MorningBriefTone =
  | 'positive'
  | 'attention'
  | 'critical'
  | 'neutral'

export interface MorningBriefItem {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export interface MorningBrief {
  title: string
  tone: MorningBriefTone
  summary: string
  topPriority: string
  items: MorningBriefItem[]
  generatedAt: string
}

export interface MorningBriefEngineInput {
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
  officeHealth: OfficeHealth
  decisionCenter: DecisionCenterResult
  generatedAt?: string
}
