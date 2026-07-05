export type GrowthPeriodGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export type GrowthPeriod = {
  label: string
  startsAt: string
  endsAt: string
  granularity: GrowthPeriodGranularity
}

export type GrowthCityKey = string
export type GrowthSpecialtyKey = string
export type GrowthOriginKey = string
export type GrowthScoreValue = number

export type GrowthPriority = 'low' | 'medium' | 'high' | 'critical'
export type GrowthConfidence = 'low' | 'medium' | 'high'

export type GrowthRecommendationType =
  | 'expand_city'
  | 'expand_specialty'
  | 'improve_coverage'
  | 'rebalance_capacity'
  | 'improve_conversion'
  | 'monitor'

export type GrowthOpportunityType =
  | 'abrir_landing_page'
  | 'contratar_associado'
  | 'expandir_raio'
  | 'adicionar_especialidade'
  | 'criar_campanha_regional'
  | 'fortalecer_presenca'

export type GrowthMetricTrend = 'up' | 'down' | 'stable' | 'unknown'
export type GrowthCoverageStatus = 'covered' | 'partial' | 'uncovered' | 'unknown'
export type GrowthCapacityStatus = 'available' | 'balanced' | 'constrained' | 'overloaded' | 'unknown'
export type GrowthCoverageGapType =
  | 'none'
  | 'city_uncovered'
  | 'specialty_uncovered'
  | 'low_capacity'
  | 'unknown'

export type GrowthDemandProjection = {
  items: Array<{
    id: string
    officeId: string
    tenantId: number
    period: GrowthPeriod
    city: GrowthCityKey
    specialty: GrowthSpecialtyKey
    origin: GrowthOriginKey
    casesCount: number
    leadsCount: number
    conversionRate: number
    backlogCount: number
    averageResolutionHours: number | null
    slaRiskScore: number
    score: GrowthScoreValue
    trend: GrowthMetricTrend
    evidenceIds: string[]
  }>
}

export type GrowthTerritoryProjection = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  city: GrowthCityKey
  demandScore: GrowthScoreValue
  coverageScore: GrowthScoreValue
  competitionScore: GrowthScoreValue
  growthScore: GrowthScoreValue
  coverageStatus: GrowthCoverageStatus
  trend: GrowthMetricTrend
  recommendation: 'fortalecer_presenca' | 'expandir_cobertura' | 'monitorar_demanda' | 'sem_dados_suficientes'
  evidenceIds: string[]
}

export type GrowthCoverageProjection = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  city: GrowthCityKey
  specialty: GrowthSpecialtyKey
  status: GrowthCoverageStatus
  professionalsCount: number
  activeProfessionalsCount: number
  compatibleProfessionalsCount: number
  capacityStatus: GrowthCapacityStatus
  capacityScore: GrowthScoreValue
  gapType: GrowthCoverageGapType
  evidenceIds: string[]
}

export type GrowthCapacityProjection = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  city?: GrowthCityKey
  specialty?: GrowthSpecialtyKey
  professionalId?: string
  workloadCount: number
  backlogCount: number
  openCasesCount: number
  closedCasesCount: number
  averageResolutionHours: number | null
  capacityScore: GrowthScoreValue
  capacityStatus: GrowthCapacityStatus
  recommendation:
    | 'pode_crescer'
    | 'manter'
    | 'reduzir_demanda'
    | 'contratar'
    | 'sem_dados_suficientes'
  evidenceIds: string[]
}

export type GrowthScoreProjection = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  city: GrowthCityKey
  specialty?: GrowthSpecialtyKey
  value: GrowthScoreValue
  demandScore: GrowthScoreValue
  coverageScore: GrowthScoreValue
  capacityScore: GrowthScoreValue
  slaScore: GrowthScoreValue
  trendScore: GrowthScoreValue
  priority: GrowthPriority
  confidence: GrowthConfidence
  evidenceIds: string[]
}

export type GrowthScoreCard = GrowthScoreProjection

export type GrowthRecommendation = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  type: GrowthRecommendationType
  priority: GrowthPriority
  confidence: GrowthConfidence
  city?: GrowthCityKey
  specialty?: GrowthSpecialtyKey
  title: string
  description: string
  expectedImpact: string
  evidenceIds: string[]
}

export type GrowthOpportunity = {
  id: string
  officeId: string
  tenantId: number
  period: GrowthPeriod
  type: GrowthOpportunityType
  score: GrowthScoreValue
  priority: GrowthPriority
  confidence: GrowthConfidence
  city?: GrowthCityKey
  specialty?: GrowthSpecialtyKey
  expectedImpact: string
  justification: string
  requiredActions: string[]
  evidenceIds: string[]
}
