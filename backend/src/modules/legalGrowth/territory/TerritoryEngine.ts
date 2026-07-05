import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type { GrowthMetricTrend, GrowthTerritoryProjection } from '../GrowthTypes.js'
import type { DemandProjectionItem } from '../demand/DemandProjection.js'
import type {
  TerritoryAggregate,
  TerritoryCoverageCompatibility,
  TerritoryCoverageResult,
  TerritoryEngineInput,
  TerritoryRecommendation,
} from './TerritoryTypes.js'
import type { TerritoryEngineResult } from './TerritoryProjection.js'

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

function createAggregateFromItem(item: DemandProjectionItem): TerritoryAggregate {
  return {
    officeId: item.officeId,
    tenantId: item.tenantId,
    period: item.period,
    city: item.city,
    totalCasesCount: 0,
    specialties: new Set<string>(),
    demandItemCount: 0,
    trendCounts: {
      up: 0,
      down: 0,
      stable: 0,
      unknown: 0,
    },
  }
}

function aggregateDemandItems(items: DemandProjectionItem[]) {
  const aggregates = new Map<string, TerritoryAggregate>()

  for (const item of items) {
    const key = item.city
    const aggregate = aggregates.get(key) ?? createAggregateFromItem(item)

    aggregate.totalCasesCount += item.casesCount
    aggregate.demandItemCount += 1
    aggregate.specialties.add(item.specialty)
    aggregate.trendCounts[item.trend] += 1

    aggregates.set(key, aggregate)
  }

  return aggregates
}

function resolveTrend(trendCounts: TerritoryAggregate['trendCounts']): GrowthMetricTrend {
  if (trendCounts.up > trendCounts.down && trendCounts.up > 0) {
    return 'up'
  }
  if (trendCounts.down > trendCounts.up && trendCounts.down > 0) {
    return 'down'
  }
  if (trendCounts.stable > 0 || (trendCounts.up > 0 && trendCounts.down > 0)) {
    return 'stable'
  }
  return 'unknown'
}

function trendToScore(trend: GrowthMetricTrend) {
  switch (trend) {
    case 'up':
      return 100
    case 'stable':
      return 50
    case 'down':
      return 0
    case 'unknown':
    default:
      return 25
  }
}

function calculateDemandScore(totalCasesCount: number) {
  return clampScore(Math.min(100, totalCasesCount * 20))
}

function calculateCoverage(args: {
  city: string
  specialties: Set<string>
  professionals?: TerritoryEngineInput['professionals']
}): TerritoryCoverageResult {
  const activeProfessionals = (args.professionals ?? []).filter((professional) => professional.status === 'active')
  if (!args.professionals || args.professionals.length === 0 || activeProfessionals.length === 0) {
    return {
      score: 25,
      status: 'unknown',
      compatibility: {
        hasCityMatch: false,
        hasSpecialtyMatch: false,
        compatibleProfessionalsCount: 0,
      },
    }
  }

  const normalizedCity = normalizeCity(args.city)
  let hasCityMatch = false
  let hasSpecialtyMatch = false
  let compatibleProfessionalsCount = 0

  for (const professional of activeProfessionals) {
    const professionalCity = normalizeCity(professional.city)
    const professionalSpecialties = new Set(
      (professional.specialties ?? [])
        .map((specialty) => normalizeSpecialty(specialty))
        .filter((specialty): specialty is string => Boolean(specialty)),
    )

    const cityMatch = Boolean(normalizedCity && professionalCity === normalizedCity)
    const specialtyMatch = Array.from(args.specialties)
      .map((specialty) => normalizeSpecialty(specialty))
      .filter((specialty): specialty is string => Boolean(specialty))
      .some((specialty) => professionalSpecialties.has(specialty))

    if (cityMatch) {
      hasCityMatch = true
    }
    if (specialtyMatch) {
      hasSpecialtyMatch = true
    }
    if (cityMatch || specialtyMatch) {
      compatibleProfessionalsCount += 1
    }
  }

  const compatibility: TerritoryCoverageCompatibility = {
    hasCityMatch,
    hasSpecialtyMatch,
    compatibleProfessionalsCount,
  }

  if (hasCityMatch && hasSpecialtyMatch) {
    return { score: 100, status: 'covered', compatibility }
  }
  if (hasCityMatch || hasSpecialtyMatch) {
    return { score: 60, status: 'partial', compatibility }
  }
  return { score: 0, status: 'uncovered', compatibility }
}

function determineRecommendation(args: {
  coverageStatus: TerritoryCoverageResult['status']
  demandScore: number
}) : TerritoryRecommendation {
  if (args.coverageStatus === 'unknown') {
    return 'sem_dados_suficientes'
  }
  if (args.coverageStatus === 'uncovered' || args.coverageStatus === 'partial') {
    return 'expandir_cobertura'
  }
  if (args.demandScore >= 60) {
    return 'fortalecer_presenca'
  }
  return 'monitorar_demanda'
}

function buildEvidenceForProjection(projection: GrowthTerritoryProjection, generatedAt: string): GrowthEvidence[] {
  return [
    {
      id: `${projection.id}:territory_demand`,
      type: 'territory_signal',
      source: 'legal_growth',
      description: `Pressao territorial em ${projection.city} com score de demanda ${projection.demandScore}.`,
      weight: 1,
      period: projection.period,
      city: projection.city,
      metric: 'demand_score',
      value: projection.demandScore,
      createdAt: generatedAt,
    },
    {
      id: `${projection.id}:territory_coverage`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: `Cobertura territorial em ${projection.city} classificada como ${projection.coverageStatus}.`,
      weight: 0.8,
      period: projection.period,
      city: projection.city,
      metric: 'coverage_score',
      value: projection.coverageScore,
      createdAt: generatedAt,
    },
  ]
}

export function buildTerritoryProjections(input: TerritoryEngineInput): TerritoryEngineResult {
  const aggregates = aggregateDemandItems(input.demand.items)
  const projections: GrowthTerritoryProjection[] = []
  const evidence: GrowthEvidence[] = []

  for (const aggregate of aggregates.values()) {
    const demandScore = calculateDemandScore(aggregate.totalCasesCount)
    const trend = resolveTrend(aggregate.trendCounts)
    const trendScore = trendToScore(trend)
    const coverage = calculateCoverage({
      city: aggregate.city,
      specialties: aggregate.specialties,
      professionals: input.professionals,
    })
    const competitionScore = 0
    const growthScore = clampScore((demandScore * 0.5) + ((100 - coverage.score) * 0.3) + (trendScore * 0.2))
    const recommendation = determineRecommendation({
      coverageStatus: coverage.status,
      demandScore,
    })

    const projection: GrowthTerritoryProjection = {
      id: [aggregate.tenantId, aggregate.officeId, aggregate.city].join(':'),
      officeId: aggregate.officeId,
      tenantId: aggregate.tenantId,
      period: aggregate.period,
      city: aggregate.city,
      demandScore,
      coverageScore: coverage.score,
      competitionScore,
      growthScore,
      coverageStatus: coverage.status,
      trend,
      recommendation,
      evidenceIds: [],
    }

    const projectionEvidence = buildEvidenceForProjection(projection, input.period.endsAt)
    projection.evidenceIds = projectionEvidence.map((entry) => entry.id)
    projections.push(projection)
    evidence.push(...projectionEvidence)
  }

  projections.sort((left, right) => left.city.localeCompare(right.city, 'pt-BR'))

  return {
    projections,
    evidence,
  }
}

export class TerritoryEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: TerritoryEngineInput): TerritoryEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildTerritoryProjections(input)
      this.metrics.recordTerritoryProjectionTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      this.metrics.recordTerritoryProjectionTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createTerritoryEngine(observability?: ObservabilityService) {
  return new TerritoryEngine(observability)
}
