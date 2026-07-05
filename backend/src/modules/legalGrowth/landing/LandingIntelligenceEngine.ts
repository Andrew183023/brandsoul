import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type {
  GrowthConfidence,
  GrowthOpportunity,
  GrowthPriority,
  GrowthRecommendation,
  GrowthScoreProjection,
} from '../GrowthTypes.js'
import type {
  LandingIntelligenceEngineInput,
  LandingIntelligenceProjection,
} from './LandingIntelligenceTypes.js'
import type { LandingIntelligenceEngineResult } from './LandingIntelligenceProjection.js'

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

function buildCandidateId(args: {
  tenantId: number
  officeId: string
  city?: string
  specialty?: string
}) {
  return [
    args.tenantId,
    args.officeId,
    args.city ?? 'unknown',
    args.specialty ?? 'unknown',
  ].join(':')
}

function calculateSeoScore(growthScore: number) {
  if (growthScore >= 80) {
    return 80
  }
  if (growthScore >= 70) {
    return 60
  }
  return 40
}

function priorityRank(priority: GrowthPriority) {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function confidenceRank(confidence: GrowthConfidence) {
  switch (confidence) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function findRecommendation(
  input: LandingIntelligenceEngineInput,
  score: GrowthScoreProjection,
): GrowthRecommendation | undefined {
  const normalizedCity = normalizeCity(score.city)
  const normalizedSpecialty = normalizeSpecialty(score.specialty)

  return input.recommendations.find((recommendation) => {
    return (
      normalizeCity(recommendation.city) === normalizedCity
      && normalizeSpecialty(recommendation.specialty) === normalizedSpecialty
    )
  })
}

function findOpportunityMatches(
  input: LandingIntelligenceEngineInput,
  score: GrowthScoreProjection,
): GrowthOpportunity[] {
  const normalizedCity = normalizeCity(score.city)
  const normalizedSpecialty = normalizeSpecialty(score.specialty)

  return input.opportunities.filter((opportunity) => {
    return (
      normalizeCity(opportunity.city) === normalizedCity
      && normalizeSpecialty(opportunity.specialty) === normalizedSpecialty
    )
  })
}

function buildReason(args: {
  score: GrowthScoreProjection
  recommendation?: GrowthRecommendation
  opportunities: GrowthOpportunity[]
}) {
  if (!args.score.city || !args.score.specialty) {
    return 'cidade_ou_especialidade_ausente'
  }

  if (args.opportunities.some((opportunity) => opportunity.type === 'abrir_landing_page')) {
    return 'oportunidade_explicita_de_landing'
  }

  if (args.score.value >= 70) {
    return 'score_elevado_com_recorte_valido'
  }

  if (args.recommendation) {
    return `recomendacao_${args.recommendation.type}`
  }

  return 'score_abaixo_do_limiar'
}

function buildEvidenceForProjection(
  projection: LandingIntelligenceProjection,
  generatedAt: string,
): GrowthEvidence[] {
  return [
    {
      id: `${projection.id}:landing_candidate`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: projection.reason,
      weight: projection.eligible ? 0.9 : 0.4,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      metric: 'landing_candidate',
      value: projection.growthScore,
      createdAt: generatedAt,
    },
  ]
}

export function buildLandingIntelligence(
  input: LandingIntelligenceEngineInput,
): LandingIntelligenceEngineResult {
  if (input.scores.length === 0) {
    return {
      projections: [],
      evidence: [],
    }
  }

  const projections: LandingIntelligenceProjection[] = []
  const evidence: GrowthEvidence[] = []

  for (const score of input.scores) {
    const recommendation = findRecommendation(input, score)
    const opportunities = findOpportunityMatches(input, score)
    const hasCityAndSpecialty = Boolean(score.city && score.specialty)
    const eligible = hasCityAndSpecialty
      && (
        opportunities.some((opportunity) => opportunity.type === 'abrir_landing_page')
        || score.value >= 70
      )

    const projection: LandingIntelligenceProjection = {
      id: buildCandidateId({
        tenantId: score.tenantId,
        officeId: score.officeId,
        city: score.city,
        specialty: score.specialty,
      }),
      officeId: score.officeId,
      tenantId: score.tenantId,
      period: score.period,
      city: score.city,
      specialty: score.specialty,
      growthScore: score.value,
      seoScore: calculateSeoScore(score.value),
      priority: opportunities.reduce<GrowthPriority>((current, opportunity) => {
        return priorityRank(opportunity.priority) > priorityRank(current) ? opportunity.priority : current
      }, recommendation?.priority ?? score.priority),
      confidence: opportunities.reduce<GrowthConfidence>((current, opportunity) => {
        return confidenceRank(opportunity.confidence) > confidenceRank(current) ? opportunity.confidence : current
      }, recommendation?.confidence ?? score.confidence),
      eligible,
      reason: buildReason({
        score,
        recommendation,
        opportunities,
      }),
      evidenceIds: [
        ...score.evidenceIds,
        ...(recommendation?.evidenceIds ?? []),
        ...opportunities.flatMap((opportunity) => opportunity.evidenceIds),
      ],
    }

    const projectionEvidence = buildEvidenceForProjection(projection, input.period.endsAt)
    projection.evidenceIds = [...projection.evidenceIds, ...projectionEvidence.map((entry) => entry.id)]
    projections.push(projection)
    evidence.push(...projectionEvidence)
  }

  projections.sort((left, right) => {
    if ((left.city ?? '') !== (right.city ?? '')) {
      return (left.city ?? '').localeCompare(right.city ?? '', 'pt-BR')
    }

    return (left.specialty ?? '').localeCompare(right.specialty ?? '', 'pt-BR')
  })

  return {
    projections,
    evidence,
  }
}

export class LandingIntelligenceEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: LandingIntelligenceEngineInput): LandingIntelligenceEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildLandingIntelligence(input)
      this.metrics.recordLandingIntelligenceBuildTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      this.metrics.recordLandingIntelligenceBuildTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createLandingIntelligenceEngine(observability?: ObservabilityService) {
  return new LandingIntelligenceEngine(observability)
}
