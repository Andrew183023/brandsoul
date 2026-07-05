import type { EntityProfileDocument } from '../../../domain/entityProfile.js'
import type { GrowthProfessionalContext } from '../GrowthContext.js'
import type { DemandProjection } from '../demand/DemandProjection.js'
import type { GrowthCoverageStatus, GrowthPeriod } from '../GrowthTypes.js'

export type TerritoryRecommendation =
  | 'fortalecer_presenca'
  | 'expandir_cobertura'
  | 'monitorar_demanda'
  | 'sem_dados_suficientes'

export type TerritoryCoverageCompatibility = {
  hasCityMatch: boolean
  hasSpecialtyMatch: boolean
  compatibleProfessionalsCount: number
}

export type TerritoryEngineInput = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  demand: DemandProjection
  professionals?: GrowthProfessionalContext[]
  entityProfile?: EntityProfileDocument | null
}

export type TerritoryAggregate = {
  officeId: string
  tenantId: number
  period: GrowthPeriod
  city: string
  totalCasesCount: number
  specialties: Set<string>
  demandItemCount: number
  trendCounts: Record<'up' | 'down' | 'stable' | 'unknown', number>
}

export type TerritoryCoverageResult = {
  score: number
  status: GrowthCoverageStatus
  compatibility: TerritoryCoverageCompatibility
}
