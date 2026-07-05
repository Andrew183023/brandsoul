import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type { GrowthCoverageProjection, GrowthCoverageStatus, GrowthCapacityStatus } from '../GrowthTypes.js'
import type { DemandProjectionItem } from '../demand/DemandProjection.js'
import type { TerritoryProjection } from '../territory/TerritoryProjection.js'
import type {
  CoverageCompatibility,
  CoverageEngineInput,
  CoverageEvaluation,
  CoverageGapType,
} from './CoverageTypes.js'
import type { CoverageEngineResult } from './CoverageProjection.js'

function normalizeText(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function normalizeCity(value: string | undefined | null) {
  return normalizeText(value)?.toLowerCase()
}

function normalizeSpecialty(value: string | undefined | null) {
  return normalizeText(value)?.toLowerCase()
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function buildProjectionId(args: {
  tenantId: number
  officeId: string
  city: string
  specialty: string
}) {
  return [args.tenantId, args.officeId, args.city, args.specialty].join(':')
}

function calculateCapacityStatus(compatibleProfessionalsCount: number): GrowthCapacityStatus {
  if (compatibleProfessionalsCount <= 0) {
    return 'overloaded'
  }
  if (compatibleProfessionalsCount === 1) {
    return 'constrained'
  }
  if (compatibleProfessionalsCount === 2) {
    return 'balanced'
  }
  return 'available'
}

function calculateCompatibility(args: {
  city: string
  specialty: string
  professionals?: CoverageEngineInput['professionals']
}): CoverageCompatibility {
  const professionals = args.professionals ?? []
  const activeProfessionals = professionals.filter((professional) => professional.status === 'active')
  const normalizedCity = normalizeCity(args.city)
  const normalizedSpecialty = normalizeSpecialty(args.specialty)

  let hasCityMatch = false
  let hasSpecialtyMatch = false
  let compatibleProfessionalsCount = 0

  for (const professional of activeProfessionals) {
    const professionalCity = normalizeCity(professional.city)
    const specialtyMatch = (professional.specialties ?? [])
      .map((specialty) => normalizeSpecialty(specialty))
      .filter((specialty): specialty is string => Boolean(specialty))
      .includes(normalizedSpecialty ?? '')
    const cityMatch = Boolean(normalizedCity && professionalCity === normalizedCity)

    if (cityMatch) {
      hasCityMatch = true
    }
    if (specialtyMatch) {
      hasSpecialtyMatch = true
    }
    if (cityMatch && specialtyMatch) {
      compatibleProfessionalsCount += 1
    }
  }

  return {
    professionalsCount: professionals.length,
    activeProfessionalsCount: activeProfessionals.length,
    compatibleProfessionalsCount,
    hasCityMatch,
    hasSpecialtyMatch,
  }
}

function evaluateCoverage(item: DemandProjectionItem, professionals?: CoverageEngineInput['professionals']): CoverageEvaluation {
  const compatibility = calculateCompatibility({
    city: item.city,
    specialty: item.specialty,
    professionals,
  })

  if (!professionals || professionals.length === 0) {
    return {
      status: 'unknown',
      capacityStatus: 'unknown',
      capacityScore: 0,
      gapType: 'unknown',
      compatibility,
    }
  }

  const capacityStatus = calculateCapacityStatus(compatibility.compatibleProfessionalsCount)
  const capacityScore = clampScore(compatibility.compatibleProfessionalsCount * 25)

  let status: GrowthCoverageStatus
  let gapType: CoverageGapType

  if (compatibility.hasCityMatch && compatibility.hasSpecialtyMatch) {
    status = 'covered'
    gapType = compatibility.compatibleProfessionalsCount <= 1 ? 'low_capacity' : 'none'
  } else if (compatibility.hasCityMatch && !compatibility.hasSpecialtyMatch) {
    status = 'partial'
    gapType = 'specialty_uncovered'
  } else if (!compatibility.hasCityMatch && compatibility.hasSpecialtyMatch) {
    status = 'partial'
    gapType = 'city_uncovered'
  } else {
    status = 'uncovered'
    gapType = 'specialty_uncovered'
  }

  return {
    status,
    capacityStatus,
    capacityScore,
    gapType,
    compatibility,
  }
}

function buildEvidenceForProjection(projection: GrowthCoverageProjection, generatedAt: string): GrowthEvidence[] {
  return [
    {
      id: `${projection.id}:coverage_status`,
      type: 'coverage_signal',
      source: 'legal_growth',
      description: `Cobertura ${projection.status} em ${projection.city} / ${projection.specialty}.`,
      weight: 1,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      metric: 'coverage_status',
      value: projection.compatibleProfessionalsCount,
      createdAt: generatedAt,
    },
    {
      id: `${projection.id}:capacity_score`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: `Capacidade ${projection.capacityStatus} com score ${projection.capacityScore} em ${projection.city} / ${projection.specialty}.`,
      weight: 0.8,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      metric: 'capacity_score',
      value: projection.capacityScore,
      createdAt: generatedAt,
    },
  ]
}

function buildTerritoryCitySet(territories: TerritoryProjection[]) {
  return new Set(territories.map((territory) => territory.city))
}

export function buildCoverageProjections(input: CoverageEngineInput): CoverageEngineResult {
  const projections: GrowthCoverageProjection[] = []
  const evidence: GrowthEvidence[] = []
  const territoryCities = buildTerritoryCitySet(input.territories)

  for (const item of input.demand.items) {
    if (!territoryCities.has(item.city)) {
      continue
    }

    const evaluation = evaluateCoverage(item, input.professionals)
    const projection: GrowthCoverageProjection = {
      id: buildProjectionId({
        tenantId: item.tenantId,
        officeId: item.officeId,
        city: item.city,
        specialty: item.specialty,
      }),
      officeId: item.officeId,
      tenantId: item.tenantId,
      period: item.period,
      city: item.city,
      specialty: item.specialty,
      status: evaluation.status,
      professionalsCount: evaluation.compatibility.professionalsCount,
      activeProfessionalsCount: evaluation.compatibility.activeProfessionalsCount,
      compatibleProfessionalsCount: evaluation.compatibility.compatibleProfessionalsCount,
      capacityStatus: evaluation.capacityStatus,
      capacityScore: evaluation.capacityScore,
      gapType: evaluation.gapType,
      evidenceIds: [],
    }

    const projectionEvidence = buildEvidenceForProjection(projection, input.period.endsAt)
    projection.evidenceIds = projectionEvidence.map((entry) => entry.id)
    projections.push(projection)
    evidence.push(...projectionEvidence)
  }

  projections.sort((left, right) => {
    if (left.city !== right.city) {
      return left.city.localeCompare(right.city, 'pt-BR')
    }
    return left.specialty.localeCompare(right.specialty, 'pt-BR')
  })

  return {
    projections,
    evidence,
  }
}

export class CoverageEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: CoverageEngineInput): CoverageEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildCoverageProjections(input)
      this.metrics.recordCoverageProjectionTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      this.metrics.recordCoverageProjectionTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createCoverageEngine(observability?: ObservabilityService) {
  return new CoverageEngine(observability)
}
