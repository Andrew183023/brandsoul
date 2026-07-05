import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type { GrowthOpportunity, GrowthRecommendation, GrowthScoreProjection } from '../GrowthTypes.js'
import type {
  ExpansionOpportunityEngineResult,
  ExpansionOpportunityProjection,
} from './ExpansionOpportunityProjection.js'
import type {
  ExpansionOpportunityDecision,
  ExpansionOpportunityEngineInput,
} from './ExpansionOpportunityTypes.js'

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

function buildOpportunityId(args: {
  tenantId: number
  officeId: string
  type: GrowthOpportunity['type']
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

function findScoreForRecommendation(input: ExpansionOpportunityEngineInput, recommendation: GrowthRecommendation) {
  const normalizedCity = normalizeCity(recommendation.city)
  const normalizedSpecialty = normalizeSpecialty(recommendation.specialty)

  return input.scores.find((score) => {
    return (
      normalizeCity(score.city) === normalizedCity
      && normalizeSpecialty(score.specialty) === normalizedSpecialty
    )
  })
}

function buildDecision(args: {
  recommendation: GrowthRecommendation
  score: GrowthScoreProjection
}): ExpansionOpportunityDecision[] {
  const decisions: ExpansionOpportunityDecision[] = []

  if (args.recommendation.type === 'expand_specialty' && args.score.value >= 75) {
    decisions.push({
      type: 'adicionar_especialidade',
      expectedImpact: 'Expandir a oferta jurídica em um nicho já validado por demanda e operação.',
      justification: 'A recomendação de expandir especialidade já supera o limiar operacional de expansão.',
      requiredActions: [
        'validar disponibilidade técnica interna',
        'definir escopo comercial da especialidade',
        'preparar materiais operacionais da nova oferta',
      ],
    })
  }

  if (args.recommendation.type === 'expand_city' && args.score.value >= 75) {
    decisions.push({
      type: 'expandir_raio',
      expectedImpact: 'Ampliar presença operacional em território com alto potencial confirmado.',
      justification: 'A cidade já apresenta score forte e recomendação explícita de expansão territorial.',
      requiredActions: [
        'mapear cidades limítrofes de atendimento',
        'revisar cobertura operacional de deslocamento',
        'ajustar mensagem comercial para o novo raio',
      ],
    })
  }

  if (args.recommendation.type === 'improve_coverage') {
    decisions.push({
      type: 'contratar_associado',
      expectedImpact: 'Reduzir gargalos de cobertura e destravar absorção da demanda existente.',
      justification: 'O gap atual de cobertura indica necessidade objetiva de ampliar capacidade jurídica.',
      requiredActions: [
        'identificar perfil profissional necessário',
        'priorizar cidade ou especialidade crítica',
        'planejar onboarding operacional',
      ],
    })
  }

  if (args.recommendation.type === 'improve_conversion') {
    decisions.push({
      type: 'criar_campanha_regional',
      expectedImpact: 'Aumentar aproveitamento comercial da demanda já capturada na região.',
      justification: 'Há volume de leads suficiente com conversão abaixo do esperado.',
      requiredActions: [
        'revisar proposta de valor regional',
        'segmentar mensagem por cidade e especialidade',
        'planejar campanha controlada de aquisição',
      ],
    })
  }

  if (args.recommendation.type === 'monitor' && args.score.value >= 50) {
    decisions.push({
      type: 'fortalecer_presenca',
      expectedImpact: 'Elevar reconhecimento local antes de uma expansão estrutural maior.',
      justification: 'O score sugere potencial moderado que ainda pede presença incremental.',
      requiredActions: [
        'reforçar presença institucional na cidade',
        'acompanhar evolução de demanda e cobertura',
        'reavaliar score no próximo ciclo',
      ],
    })
  }

  if (args.score.value >= 70 && args.recommendation.city && args.recommendation.specialty) {
    decisions.push({
      type: 'abrir_landing_page',
      expectedImpact: 'Capturar demanda qualificada com comunicação dedicada por cidade e especialidade.',
      justification: 'O score alto com recorte territorial e temático suporta uma landing dedicada.',
      requiredActions: [
        'definir proposta da landing por especialidade',
        'organizar CTA e prova social locais',
        'preparar publicação futura sem automação nesta fase',
      ],
    })
  }

  return decisions
}

function buildEvidenceForOpportunity(opportunity: GrowthOpportunity, generatedAt: string): GrowthEvidence[] {
  return [
    {
      id: `${opportunity.id}:opportunity`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: opportunity.justification,
      weight: 0.95,
      period: opportunity.period,
      city: opportunity.city,
      specialty: opportunity.specialty,
      metric: 'opportunity_score',
      value: opportunity.score,
      createdAt: generatedAt,
    },
  ]
}

function dedupeOpportunities(opportunities: ExpansionOpportunityProjection[]) {
  const unique = new Map<string, ExpansionOpportunityProjection>()

  for (const opportunity of opportunities) {
    const existing = unique.get(opportunity.id)
    if (!existing || opportunity.score > existing.score) {
      unique.set(opportunity.id, opportunity)
    }
  }

  return [...unique.values()]
}

export function buildExpansionOpportunities(input: ExpansionOpportunityEngineInput): ExpansionOpportunityEngineResult {
  if (input.recommendations.length === 0 || input.scores.length === 0) {
    return {
      projections: [],
      evidence: [],
    }
  }

  const provisional: ExpansionOpportunityProjection[] = []

  for (const recommendation of input.recommendations) {
    const score = findScoreForRecommendation(input, recommendation)
    if (!score) {
      continue
    }

    const decisions = buildDecision({
      recommendation,
      score,
    })

    for (const decision of decisions) {
      provisional.push({
        id: buildOpportunityId({
          tenantId: recommendation.tenantId,
          officeId: recommendation.officeId,
          type: decision.type,
          city: recommendation.city,
          specialty: recommendation.specialty,
        }),
        officeId: recommendation.officeId,
        tenantId: recommendation.tenantId,
        period: recommendation.period,
        type: decision.type,
        score: score.value,
        priority: recommendation.priority,
        confidence: recommendation.confidence,
        city: recommendation.city,
        specialty: recommendation.specialty,
        expectedImpact: decision.expectedImpact,
        justification: decision.justification,
        requiredActions: decision.requiredActions,
        evidenceIds: [...recommendation.evidenceIds],
      })
    }
  }

  const projections = dedupeOpportunities(provisional).sort((left, right) => {
    if ((left.city ?? '') !== (right.city ?? '')) {
      return (left.city ?? '').localeCompare(right.city ?? '', 'pt-BR')
    }
    if ((left.specialty ?? '') !== (right.specialty ?? '')) {
      return (left.specialty ?? '').localeCompare(right.specialty ?? '', 'pt-BR')
    }
    return left.type.localeCompare(right.type, 'pt-BR')
  })

  const evidence: GrowthEvidence[] = []
  for (const opportunity of projections) {
    const opportunityEvidence = buildEvidenceForOpportunity(opportunity, input.period.endsAt)
    opportunity.evidenceIds = [...opportunity.evidenceIds, ...opportunityEvidence.map((entry) => entry.id)]
    evidence.push(...opportunityEvidence)
  }

  return {
    projections,
    evidence,
  }
}

export class ExpansionOpportunityEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: ExpansionOpportunityEngineInput): ExpansionOpportunityEngineResult {
    const result = buildExpansionOpportunities(input)
    this.metrics.recordOpportunitiesGenerated({
      tenantId: input.tenantId,
      officeId: input.officeId,
      count: result.projections.length,
    })
    return result
  }
}

export function createExpansionOpportunityEngine(observability?: ObservabilityService) {
  return new ExpansionOpportunityEngine(observability)
}
