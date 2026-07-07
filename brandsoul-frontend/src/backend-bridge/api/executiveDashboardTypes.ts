import type {
  AdminGrowthConfidence,
  AdminGrowthIntelligenceResponse as GrowthIntelligenceResponse,
  AdminGrowthPriority,
} from './adminApi'

export type ExecutiveOfficeState = {
  officeId: string
  tenantId: number
  growthStatus: GrowthIntelligenceResponse['status']
  operationalStatus: OperationalIntelligenceResponse['status']
}

export type OfficeHealthLevel =
  | 'excellent'
  | 'good'
  | 'attention'
  | 'critical'

export type OfficeHealthDriver = {
  key: string
  title: string
  impact: 'positive' | 'neutral' | 'negative'
  weight: number
  summary: string
}

export type OfficeHealth = {
  score: number
  level: OfficeHealthLevel
  explanation: string
  positives: OfficeHealthDriver[]
  warnings: OfficeHealthDriver[]
  opportunities: OfficeHealthDriver[]
  drivers: OfficeHealthDriver[]
}

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

export type ExecutiveDecisionEvidence = {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export type ExecutiveDecision = {
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

export type DecisionCenterResult = {
  decisions: ExecutiveDecision[]
}

export type MorningBriefTone =
  | 'positive'
  | 'attention'
  | 'critical'
  | 'neutral'

export type MorningBriefItem = {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export type MorningBrief = {
  title: string
  tone: MorningBriefTone
  summary: string
  topPriority: string
  items: MorningBriefItem[]
  generatedAt: string
}

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

export type ExecutiveFeedEvidence = {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export type ExecutiveFeedItem = {
  id: string
  category: ExecutiveFeedCategory
  severity: ExecutiveFeedSeverity
  title: string
  summary: string
  evidence: ExecutiveFeedEvidence[]
  suggestedAction?: string
  source: 'office_health' | 'growth' | 'operational' | 'decision_center'
  sourceKey: string
}

export type ExecutiveFeed = {
  items: ExecutiveFeedItem[]
  totalDetected: number
  totalPublished: number
  generatedAt: string
}

export type OperationalSnapshotDistribution = Record<string, number>

export type OperationalSnapshot = {
  tenantId: number
  entityId: string
  builtAt: string
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  slaWarningCases: number
  slaBreachedCases: number
  casesPerProfessional: OperationalSnapshotDistribution
  casesPerPracticeArea: OperationalSnapshotDistribution
  casesPerCity: OperationalSnapshotDistribution
}

export type RegionalProjection = {
  tenantId: number
  entityId: string
  city: string
  totalCases: number
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  slaWarningCases: number
  slaBreachedCases: number
  practiceAreas: OperationalSnapshotDistribution
  generatedAt: string
}

export type SpecialtyProjection = {
  tenantId: number
  entityId: string
  practiceArea: string
  totalCases: number
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  slaWarningCases: number
  slaBreachedCases: number
  cities: OperationalSnapshotDistribution
  generatedAt: string
  revenuePotentialPrepared: null
}

export type WorkloadLevel =
  | 'idle'
  | 'normal'
  | 'high'
  | 'overloaded'

export type ProfessionalWorkloadProjection = {
  tenantId: number
  entityId: string
  professionalId: string
  activeCases: number
  totalCases: number
  closedCases: number
  averageResolutionHours: number | null
  averageFirstResponseMinutes: number | null
  averageSlaRiskScore: number | null
  criticalCases: number
  delayedCases: number
  waitingResponseCases: number
  slaWarningCases: number
  slaBreachedCases: number
  practiceAreas: OperationalSnapshotDistribution
  cities: OperationalSnapshotDistribution
  workloadLevel: WorkloadLevel
  generatedAt: string
}

export type OperationalOpportunityType =
  | 'CITY_GROWTH'
  | 'SPECIALTY_GROWTH'
  | 'HIGH_BACKLOG'
  | 'PROFESSIONAL_OVERLOAD'
  | 'LOW_COVERAGE'
  | 'HIGH_SLA_RISK'
  | 'HIGH_DEMAND'
  | 'CAPACITY_IMBALANCE'

export type OperationalOpportunitySeverity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type OperationalOpportunityAffectedEntity =
  | { kind: 'office'; id: string }
  | { kind: 'city'; id: string }
  | { kind: 'practice_area'; id: string }
  | { kind: 'professional'; id: string }

export type OperationalOpportunityEvidenceValue =
  | string
  | number
  | boolean
  | null

export type OperationalOpportunityEvidence = Record<string, OperationalOpportunityEvidenceValue>

export type OperationalOpportunity = {
  id: string
  tenantId: number
  entityId: string
  type: OperationalOpportunityType
  severity: OperationalOpportunitySeverity
  title: string
  description: string
  affectedEntity: OperationalOpportunityAffectedEntity
  evidence: OperationalOpportunityEvidence
  score: number
  generatedAt: string
}

export type OperationalIntelligenceResponse = {
  status: 'ready'
  officeId: string
  tenantId: number
  generatedAt: string
  snapshot: OperationalSnapshot
  signals: []
  timeline: []
  regional: RegionalProjection[]
  specialties: SpecialtyProjection[]
  workload: ProfessionalWorkloadProjection[]
  opportunities: OperationalOpportunity[]
  compatibility: {
    firstResponseMinutesDerived: false
    slaStatusDerived: false
    waitingForDerived: false
    archivedCasesExcluded: true
  }
}

export type ExecutiveDashboardResponse = {
  generatedAt: string
  officeState: ExecutiveOfficeState
  morningBrief: MorningBrief
  officeHealth: OfficeHealth
  decisionCenter: DecisionCenterResult
  executiveFeed: ExecutiveFeed
  growth: GrowthIntelligenceResponse
  operational: OperationalIntelligenceResponse
}

export type {
  AdminGrowthConfidence,
  GrowthIntelligenceResponse,
  AdminGrowthPriority,
}
