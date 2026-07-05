import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type {
  GrowthCapacityProjection,
  GrowthConfidence,
  GrowthCoverageProjection,
  GrowthPriority,
  GrowthRecommendation,
  GrowthScoreProjection,
  GrowthTerritoryProjection,
} from '../GrowthTypes.js'
import type { RecommendationEngineResult, RecommendationProjection } from './RecommendationProjection.js'
import type { RecommendationDecision, RecommendationEngineInput } from './RecommendationTypes.js'

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

function buildRecommendationId(args: {
  tenantId: number
  officeId: string
  type: GrowthRecommendation['type']
  city?: string
  specialty?: string
}) {
  return [
    args.tenantId,
    args.officeId,
    args.type,
    args.city ?? 'all',
    args.specialty ?? 'all',
  ].join(':')
}

function findDemandItem(input: RecommendationEngineInput, score: GrowthScoreProjection) {
  const normalizedCity = normalizeCity(score.city)
  const normalizedSpecialty = normalizeSpecialty(score.specialty)

  return input.demand.items.find((item) => {
    return (
      normalizeCity(item.city) === normalizedCity
      && normalizeSpecialty(item.specialty) === normalizedSpecialty
    )
  })
}

function findTerritory(input: RecommendationEngineInput, score: GrowthScoreProjection): GrowthTerritoryProjection | undefined {
  const normalizedCity = normalizeCity(score.city)
  return input.territories.find((territory) => normalizeCity(territory.city) === normalizedCity)
}

function findCoverage(input: RecommendationEngineInput, score: GrowthScoreProjection): GrowthCoverageProjection | undefined {
  const normalizedCity = normalizeCity(score.city)
  const normalizedSpecialty = normalizeSpecialty(score.specialty)

  return input.coverage.find((coverage) => {
    return (
      normalizeCity(coverage.city) === normalizedCity
      && normalizeSpecialty(coverage.specialty) === normalizedSpecialty
    )
  })
}

function findCapacityMatches(input: RecommendationEngineInput, score: GrowthScoreProjection): GrowthCapacityProjection[] {
  const normalizedCity = normalizeCity(score.city)
  const normalizedSpecialty = normalizeSpecialty(score.specialty)

  return input.capacity.filter((capacity) => {
    const cityMatches = !normalizedCity || normalizeCity(capacity.city) === normalizedCity
    const specialtyMatches = !normalizedSpecialty || normalizeSpecialty(capacity.specialty) === normalizedSpecialty
    return cityMatches && specialtyMatches
  })
}

function calculateConfidence(args: {
  coverage?: GrowthCoverageProjection
  territory?: GrowthTerritoryProjection
  capacityMatches: GrowthCapacityProjection[]
}): GrowthConfidence {
  const availability = [
    Boolean(args.coverage),
    Boolean(args.territory),
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

function buildDecision(args: {
  score: GrowthScoreProjection
  demandItem: NonNullable<ReturnType<typeof findDemandItem>>
  coverage?: GrowthCoverageProjection
  capacityMatches: GrowthCapacityProjection[]
}): RecommendationDecision {
  const capacityStatuses = new Set(args.capacityMatches.map((projection) => projection.capacityStatus))

  if (
    args.score.value >= 80
    && (args.coverage?.status === 'covered' || args.coverage?.status === 'partial')
    && (capacityStatuses.has('available') || capacityStatuses.has('balanced'))
  ) {
    if (normalizeSpecialty(args.score.specialty)) {
      return {
        type: 'expand_specialty',
        title: `Expandir especialidade em ${args.score.city}`,
        description: `A especialidade ${args.score.specialty} apresenta score alto com cobertura operacional suficiente.`,
        expectedImpact: 'Aumentar a capacidade comercial e capturar demanda qualificada na especialidade.',
      }
    }

    return {
      type: 'expand_city',
      title: `Expandir atuação em ${args.score.city}`,
      description: `A cidade ${args.score.city} apresenta score alto com cobertura operacional suficiente.`,
      expectedImpact: 'Aumentar presença territorial e absorver crescimento de demanda local.',
    }
  }

  if ((args.coverage?.status === 'uncovered' || args.coverage?.status === 'partial') && args.score.value >= 60) {
    return {
      type: 'improve_coverage',
      title: `Melhorar cobertura em ${args.score.city}`,
      description: `A cobertura atual para ${args.score.specialty ?? 'a operação local'} ainda é insuficiente para a demanda observada.`,
      expectedImpact: 'Reduzir gaps operacionais e melhorar aproveitamento da demanda existente.',
    }
  }

  if (capacityStatuses.has('overloaded') || capacityStatuses.has('constrained')) {
    return {
      type: 'rebalance_capacity',
      title: `Rebalancear capacidade em ${args.score.city}`,
      description: `A capacidade atual para ${args.score.specialty ?? 'a operação local'} está pressionada.`,
      expectedImpact: 'Distribuir carga operacional e reduzir risco de saturação.',
    }
  }

  if (args.demandItem.conversionRate < 0.4 && args.demandItem.leadsCount >= 3) {
    return {
      type: 'improve_conversion',
      title: `Melhorar conversão em ${args.score.city}`,
      description: `A demanda existente ainda converte abaixo do esperado em ${args.score.specialty ?? 'operações locais'}.`,
      expectedImpact: 'Elevar conversão comercial e transformar leads atuais em casos fechados.',
    }
  }

  return {
    type: 'monitor',
    title: `Monitorar ${args.score.city}${args.score.specialty ? ` / ${args.score.specialty}` : ''}`,
    description: 'Os sinais atuais sugerem acompanhamento contínuo antes de uma ação estrutural maior.',
    expectedImpact: 'Manter vigilância operacional e validar tendência antes de expandir.',
  }
}

function buildEvidenceForRecommendation(recommendation: GrowthRecommendation, generatedAt: string): GrowthEvidence[] {
  return [
    {
      id: `${recommendation.id}:recommendation`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: recommendation.description,
      weight: 0.9,
      period: recommendation.period,
      city: recommendation.city,
      specialty: recommendation.specialty,
      metric: 'recommendation_priority',
      value: recommendation.priority === 'critical'
        ? 100
        : recommendation.priority === 'high'
          ? 75
          : recommendation.priority === 'medium'
            ? 50
            : 25,
      createdAt: generatedAt,
    },
  ]
}

function dedupeRecommendations(recommendations: RecommendationProjection[]) {
  const unique = new Map<string, RecommendationProjection>()

  for (const recommendation of recommendations) {
    const existing = unique.get(recommendation.id)
    if (!existing) {
      unique.set(recommendation.id, recommendation)
      continue
    }

    const currentRank = recommendation.priority === 'critical'
      ? 4
      : recommendation.priority === 'high'
        ? 3
        : recommendation.priority === 'medium'
          ? 2
          : 1
    const existingRank = existing.priority === 'critical'
      ? 4
      : existing.priority === 'high'
        ? 3
        : existing.priority === 'medium'
          ? 2
          : 1

    if (currentRank > existingRank) {
      unique.set(recommendation.id, recommendation)
    }
  }

  return [...unique.values()]
}

export function buildRecommendations(input: RecommendationEngineInput): RecommendationEngineResult {
  if (input.scores.length === 0) {
    return {
      projections: [],
      evidence: [],
    }
  }

  const provisional: RecommendationProjection[] = []

  for (const score of input.scores) {
    const demandItem = findDemandItem(input, score)
    if (!demandItem) {
      continue
    }

    const territory = findTerritory(input, score)
    const coverage = findCoverage(input, score)
    const capacityMatches = findCapacityMatches(input, score)
    const decision = buildDecision({
      score,
      demandItem,
      coverage,
      capacityMatches,
    })

    provisional.push({
      id: buildRecommendationId({
        tenantId: score.tenantId,
        officeId: score.officeId,
        type: decision.type,
        city: score.city,
        specialty: score.specialty,
      }),
      officeId: score.officeId,
      tenantId: score.tenantId,
      period: score.period,
      type: decision.type,
      priority: score.priority,
      confidence: calculateConfidence({
        coverage,
        territory,
        capacityMatches,
      }),
      city: score.city,
      specialty: score.specialty,
      title: decision.title,
      description: decision.description,
      expectedImpact: decision.expectedImpact,
      evidenceIds: [...score.evidenceIds],
    })
  }

  const projections = dedupeRecommendations(provisional).sort((left, right) => {
    if ((left.city ?? '') !== (right.city ?? '')) {
      return (left.city ?? '').localeCompare(right.city ?? '', 'pt-BR')
    }
    if ((left.specialty ?? '') !== (right.specialty ?? '')) {
      return (left.specialty ?? '').localeCompare(right.specialty ?? '', 'pt-BR')
    }
    return left.type.localeCompare(right.type, 'pt-BR')
  })

  const evidence: GrowthEvidence[] = []
  for (const recommendation of projections) {
    const recommendationEvidence = buildEvidenceForRecommendation(recommendation, input.period.endsAt)
    recommendation.evidenceIds = [...recommendation.evidenceIds, ...recommendationEvidence.map((entry) => entry.id)]
    evidence.push(...recommendationEvidence)
  }

  return {
    projections,
    evidence,
  }
}

export class RecommendationEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: RecommendationEngineInput): RecommendationEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildRecommendations(input)
      this.metrics.recordRecommendationBuildTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      this.metrics.recordRecommendationBuildTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createRecommendationEngine(observability?: ObservabilityService) {
  return new RecommendationEngine(observability)
}
