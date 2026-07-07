import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import type { ExecutiveFeed } from './ExecutiveFeedTypes.js'
import type { MorningBrief } from './MorningBriefTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'

export interface ExecutiveOfficeState {
  officeId: string
  tenantId: number
  growthStatus: GrowthIntelligenceResponse['status']
  operationalStatus: OperationalIntelligenceResponse['status']
}

export interface ExecutiveDashboard {
  generatedAt: string
  officeState: ExecutiveOfficeState
  morningBrief: MorningBrief
  officeHealth: OfficeHealth
  decisionCenter: DecisionCenterResult
  executiveFeed: ExecutiveFeed
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
}

export interface ExecutiveDashboardBuildInput {
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
  officeHealth?: OfficeHealth
  decisionCenter?: DecisionCenterResult
  morningBrief?: MorningBrief
  executiveFeed?: ExecutiveFeed
  generatedAt?: string
}
