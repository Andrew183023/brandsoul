import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type {
  GrowthCapacityProjection,
  GrowthConfidence,
  GrowthCoverageProjection,
  GrowthCoverageStatus,
  GrowthDemandProjection,
  GrowthMetricTrend,
  GrowthPriority,
  GrowthScoreProjection as BaseGrowthScoreProjection,
  GrowthTerritoryProjection,
} from '../GrowthTypes.js'
import type { GrowthScoreEngineResult, GrowthScoreProjection } from './GrowthScoreProjection.js'
import type { GrowthScoreComponentSet, GrowthScoreEngineInput } from './GrowthScoreTypes.js'

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

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

function buildProjectionId(args: {
  tenantId: number
  officeId: string
  city: string
  specialty?: string
}) {
  return [
    args.tenantId,
    args.officeId,
    args.city,
    args.specialty ?? 'all',
  ].join(':')
}

function mapCoverageStatusToScore(status: GrowthCoverageStatus | undefined) {
  switch (status) {
    case 'covered':
      return 100
    case 'partial':
      return 60
    case 'uncovered':
      return 20
    default:
      return 40
  }
}

function mapTrendToScore(trend: GrowthMetricTrend) {
  switch (trend) {
    case 'up':
      return 100
    case 'stable':
      return 60
    case 'down':
      return 20
    default:
      return 40
  }
}

function mapValueToPriority(value: number): GrowthPriority {
  if (value >= 80) {
    return 'critical'
  }
  if (value >= 65) {
    return 'high'
  }
  if (value >= 40) {
    return 'medium'
  }
  return 'low'
}

function calculateConfidence(args: {
  territory?: GrowthTerritoryProjection
  coverage?: GrowthCoverageProjection
  capacityMatches: GrowthCapacityProjection[]
}): GrowthConfidence {
  const availability = [
    Boolean(args.territory),
    Boolean(args.coverage),
    args.capacityMatches.length > 0,
  ].filter(Boolean).length

  if (availability >= 3) {
    return 'high'
  }
  if (availability === 2) {
    return 'medium'
  }
  return 'low'
}

function findTerritory(
  territories: GrowthTerritoryProjection[],
  city: string,
): GrowthTerritoryProjection | undefined {
  const normalizedCity = normalizeCity(city)
  return territories.find((territory) => normalizeCity(territory.city) === normalizedCity)
}

function findCoverage(
  coverage: GrowthCoverageProjection[],
  city: string,
  specialty: string,
): GrowthCoverageProjection | undefined {
  const normalizedCity = normalizeCity(city)
  const normalizedSpecialty = normalizeSpecialty(specialty)
  return coverage.find((projection) => {
    return (
      normalizeCity(projection.city) === normalizedCity
      && normalizeSpecialty(projection.specialty) === normalizedSpecialty
    )
  })
}

function findCapacityMatches(
  capacity: GrowthCapacityProjection[],
  city: string,
  specialty: string,
): GrowthCapacityProjection[] {
  const normalizedCity = normalizeCity(city)
  const normalizedSpecialty = normalizeSpecialty(specialty)

  return capacity.filter((projection) => {
    const cityMatches = !normalizedCity || normalizeCity(projection.city) === normalizedCity
    const specialtyMatches = !normalizedSpecialty || normalizeSpecialty(projection.specialty) === normalizedSpecialty
    return cityMatches && specialtyMatches
  })
}

function calculateCapacityScore(capacityMatches: GrowthCapacityProjection[]) {
  if (capacityMatches.length === 0) {
    return 40
  }

  const total = capacityMatches.reduce((sum, projection) => sum + projection.capacityScore, 0)
  return clampScore(total / capacityMatches.length)
}

function calculateDemandScore(item: GrowthDemandProjection['items'][number], territory?: GrowthTerritoryProjection) {
  return territory?.demandScore ?? clampScore(item.casesCount * 20)
}

function calculateSlaScore(item: GrowthDemandProjection['items'][number]) {
  return clampScore(100 - item.slaRiskScore)
}

function calculateGrowthValue(components: GrowthScoreComponentSet) {
  return clampScore(
    (components.demandScore * 0.30)
      + (components.coverageScore * 0.25)
      + (components.capacityScore * 0.20)
      + (components.slaScore * 0.15)
      + (components.trendScore * 0.10),
  )
}

function buildEvidenceForProjection(projection: BaseGrowthScoreProjection, generatedAt: string): GrowthEvidence[] {
  return [
    {
      id: `${projection.id}:growth_score`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: `Growth score ${projection.value} para ${projection.city}${projection.specialty ? ` / ${projection.specialty}` : ''}.`,
      weight: 1,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      metric: 'growth_score',
      value: projection.value,
      createdAt: generatedAt,
    },
    {
      id: `${projection.id}:capacity_component`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: `Componente de capacidade ${projection.capacityScore} para ${projection.city}${projection.specialty ? ` / ${projection.specialty}` : ''}.`,
      weight: 0.7,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      metric: 'capacity_component',
      value: projection.capacityScore,
      createdAt: generatedAt,
    },
  ]
}

export function buildGrowthScoreProjections(input: GrowthScoreEngineInput): GrowthScoreEngineResult {
  if (input.demand.items.length === 0) {
    return {
      projections: [],
      evidence: [],
    }
  }

  const projections: GrowthScoreProjection[] = []
  const evidence: GrowthEvidence[] = []

  for (const item of input.demand.items) {
    const territory = findTerritory(input.territories, item.city)
    const coverage = findCoverage(input.coverage, item.city, item.specialty)
    const capacityMatches = findCapacityMatches(input.capacity, item.city, item.specialty)

    const components: GrowthScoreComponentSet = {
      demandScore: calculateDemandScore(item, territory),
      coverageScore: mapCoverageStatusToScore(coverage?.status),
      capacityScore: calculateCapacityScore(capacityMatches),
      slaScore: calculateSlaScore(item),
      trendScore: mapTrendToScore(item.trend),
    }

    const value = calculateGrowthValue(components)
    const projection: GrowthScoreProjection = {
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
      value,
      demandScore: components.demandScore,
      coverageScore: components.coverageScore,
      capacityScore: components.capacityScore,
      slaScore: components.slaScore,
      trendScore: components.trendScore,
      priority: mapValueToPriority(value),
      confidence: calculateConfidence({
        territory,
        coverage,
        capacityMatches,
      }),
      evidenceIds: [],
    }

    const projectionEvidence = buildEvidenceForProjection(projection, input.period.endsAt)
    projection.evidenceIds = [...item.evidenceIds, ...projectionEvidence.map((entry) => entry.id)]
    projections.push(projection)
    evidence.push(...projectionEvidence)
  }

  projections.sort((left, right) => {
    if (left.city !== right.city) {
      return left.city.localeCompare(right.city, 'pt-BR')
    }

    return (left.specialty ?? '').localeCompare(right.specialty ?? '', 'pt-BR')
  })

  return {
    projections,
    evidence,
  }
}

export class GrowthScoreEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: GrowthScoreEngineInput): GrowthScoreEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildGrowthScoreProjections(input)
      this.metrics.recordGrowthScoreBuildTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      this.metrics.recordGrowthScoreBuildTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createGrowthScoreEngine(observability?: ObservabilityService) {
  return new GrowthScoreEngine(observability)
}
