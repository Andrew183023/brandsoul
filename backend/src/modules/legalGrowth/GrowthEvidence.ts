import type {
  GrowthCityKey,
  GrowthOriginKey,
  GrowthPeriod,
  GrowthSpecialtyKey,
} from './GrowthTypes.js'

export type GrowthEvidenceType =
  | 'case_signal'
  | 'professional_signal'
  | 'office_signal'
  | 'territory_signal'
  | 'capacity_signal'
  | 'coverage_signal'
  | 'derived_metric'

export type GrowthEvidence = {
  id: string
  type: GrowthEvidenceType
  source: GrowthOriginKey
  description: string
  weight: number
  period: GrowthPeriod
  city?: GrowthCityKey
  specialty?: GrowthSpecialtyKey
  professionalId?: string
  metric?: string
  value?: number
  createdAt: string
}
