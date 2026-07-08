import type { GrowthDemandProjection, GrowthTerritoryProjection } from '../legalGrowth/GrowthTypes.js'
import type {
  ExecutiveDecision,
  ExecutiveDecisionPriority,
  ExecutiveDecisionType,
} from './DecisionCenterTypes.js'
import type {
  ExecutiveTimeline,
  ExecutiveTimelineCategory,
  ExecutiveTimelineEngineInput,
  ExecutiveTimelineEvidence,
  ExecutiveTimelineImportance,
  ExecutiveTimelineItem,
  ExecutiveTimelineTemporalKind,
} from './ExecutiveTimelineTypes.js'

const DEFAULT_LIMIT = 10
const MIN_LIMIT = 1
const MAX_LIMIT = 30

type CandidateTimelineItem = ExecutiveTimelineItem & {
  deduplicationKey: string
  specificityRank: number
}

function importanceRank(importance: ExecutiveTimelineImportance) {
  switch (importance) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
    default:
      return 1
  }
}

function categoryRank(category: ExecutiveTimelineCategory) {
  switch (category) {
    case 'sla':
      return 7
    case 'capacity':
      return 6
    case 'operations':
      return 5
    case 'health':
      return 4
    case 'decision':
      return 3
    case 'growth':
      return 2
    case 'coverage':
    default:
      return 1
  }
}

function decisionPriorityRank(priority: ExecutiveDecisionPriority) {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
    default:
      return 1
  }
}

function sanitizeLimit(limit: number | undefined) {
  if (!Number.isInteger(limit) || !limit || limit < MIN_LIMIT || limit > MAX_LIMIT) {
    return DEFAULT_LIMIT
  }

  return limit
}

function sortTimelineItems(items: CandidateTimelineItem[]) {
  const hasOccurredAt = items.some((item) => typeof item.occurredAt === 'string')

  return [...items].sort((left, right) => {
    if (hasOccurredAt) {
      const leftOccurredAt = left.occurredAt ?? ''
      const rightOccurredAt = right.occurredAt ?? ''
      if (leftOccurredAt !== rightOccurredAt) {
        return rightOccurredAt.localeCompare(leftOccurredAt)
      }
    }

    const importanceDifference = importanceRank(right.importance) - importanceRank(left.importance)
    if (importanceDifference !== 0) {
      return importanceDifference
    }

    const categoryDifference = categoryRank(right.category) - categoryRank(left.category)
    if (categoryDifference !== 0) {
      return categoryDifference
    }

    if (right.evidence.length !== left.evidence.length) {
      return right.evidence.length - left.evidence.length
    }

    return left.id.localeCompare(right.id)
  })
}

function chooseDeduplicated(left: CandidateTimelineItem, right: CandidateTimelineItem) {
  const importanceDifference = importanceRank(right.importance) - importanceRank(left.importance)
  if (importanceDifference !== 0) {
    return importanceDifference > 0 ? right : left
  }

  const specificityDifference = right.specificityRank - left.specificityRank
  if (specificityDifference !== 0) {
    return specificityDifference > 0 ? right : left
  }

  if (right.evidence.length !== left.evidence.length) {
    return right.evidence.length > left.evidence.length ? right : left
  }

  return left.sourceKey.localeCompare(right.sourceKey) <= 0 ? left : right
}

function deduplicate(items: CandidateTimelineItem[]) {
  const deduplicated = new Map<string, CandidateTimelineItem>()

  for (const item of items) {
    const current = deduplicated.get(item.deduplicationKey)
    if (!current) {
      deduplicated.set(item.deduplicationKey, item)
      continue
    }

    deduplicated.set(item.deduplicationKey, chooseDeduplicated(current, item))
  }

  return Array.from(deduplicated.values())
}

function createCandidate(
  args: Omit<CandidateTimelineItem, 'evidence'> & {
    evidence: ExecutiveTimelineEvidence[]
  },
): CandidateTimelineItem {
  return {
    ...args,
    evidence: args.evidence.map((item) => ({ ...item })),
  }
}

function buildHealthCriticalEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.officeHealth.level !== 'critical') {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:health:critical',
    category: 'health',
    importance: 'critical',
    temporalKind: 'observed',
    title: 'A saúde do escritório exige ação imediata',
    summary: input.officeHealth.explanation,
    evidence: [
      {
        key: 'health_score',
        value: input.officeHealth.score,
        description: `O score executivo atual está em ${input.officeHealth.score}.`,
      },
      ...input.officeHealth.warnings.slice(0, 2).map((warning) => ({
        key: warning.key,
        value: warning.weight,
        description: warning.summary,
      })),
    ],
    suggestedAction: 'Concentrar a coordenação executiva nos riscos operacionais antes de expandir a exposição do escritório.',
    source: 'office_health',
    sourceKey: 'health_critical',
    deduplicationKey: 'health:critical',
    specificityRank: 4,
  })
}

function buildHealthExcellentEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.officeHealth.level !== 'excellent') {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:health:excellent',
    category: 'health',
    importance: 'low',
    temporalKind: 'observed',
    title: 'O escritório opera em condição executiva excelente',
    summary: input.officeHealth.explanation,
    evidence: [
      {
        key: 'health_score',
        value: input.officeHealth.score,
        description: `O score executivo atual está em ${input.officeHealth.score}.`,
      },
      ...input.officeHealth.positives.slice(0, 2).map((driver) => ({
        key: driver.key,
        value: driver.weight,
        description: driver.summary,
      })),
    ],
    source: 'office_health',
    sourceKey: 'health_excellent',
    deduplicationKey: 'health:excellent',
    specificityRank: 3,
  })
}

function buildSlaBreachedEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.operational.snapshot.slaBreachedCases <= 0) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:sla:breached',
    category: 'sla',
    importance: 'critical',
    temporalKind: 'observed',
    title: 'Casos com SLA vencido explicam a pressão atual',
    summary: `Existem ${input.operational.snapshot.slaBreachedCases} casos com SLA vencido afetando diretamente a qualidade operacional.`,
    evidence: [
      {
        key: 'sla_breached_cases',
        value: input.operational.snapshot.slaBreachedCases,
        description: `A leitura atual identificou ${input.operational.snapshot.slaBreachedCases} casos com SLA vencido.`,
      },
    ],
    suggestedAction: 'Priorizar os casos vencidos antes de ampliar a operação.',
    source: 'operational',
    sourceKey: 'sla_breached_cases',
    deduplicationKey: 'sla:breached',
    specificityRank: 4,
  })
}

function buildSlaWarningEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.operational.snapshot.slaBreachedCases > 0 || input.operational.snapshot.slaWarningCases <= 0) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:sla:warning',
    category: 'sla',
    importance: 'high',
    temporalKind: 'observed',
    title: 'Casos em alerta de SLA merecem atenção próxima',
    summary: `Existem ${input.operational.snapshot.slaWarningCases} casos em alerta operacional, o que ajuda a explicar a necessidade de coordenação agora.`,
    evidence: [
      {
        key: 'sla_warning_cases',
        value: input.operational.snapshot.slaWarningCases,
        description: `A leitura atual identificou ${input.operational.snapshot.slaWarningCases} casos em alerta de SLA.`,
      },
    ],
    suggestedAction: 'Reordenar o acompanhamento antes que os alertas avancem para vencimento.',
    source: 'operational',
    sourceKey: 'sla_warning_cases',
    deduplicationKey: 'sla:warning',
    specificityRank: 3,
  })
}

function buildNoCriticalSlaEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.operational.snapshot.slaBreachedCases > 0 || input.operational.snapshot.slaWarningCases > 0) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:sla:stable',
    category: 'sla',
    importance: 'low',
    temporalKind: 'observed',
    title: 'A operação não apresenta sinais críticos de SLA',
    summary: 'A leitura executiva atual não identificou casos vencidos nem casos em alerta de SLA.',
    evidence: [
      {
        key: 'sla_breached_cases',
        value: input.operational.snapshot.slaBreachedCases,
        description: 'Nenhum caso com SLA vencido foi identificado na leitura atual.',
      },
      {
        key: 'sla_warning_cases',
        value: input.operational.snapshot.slaWarningCases,
        description: 'Nenhum caso em alerta de SLA foi identificado na leitura atual.',
      },
    ],
    source: 'operational',
    sourceKey: 'sla_stable',
    deduplicationKey: 'sla:stable',
    specificityRank: 1,
  })
}

function buildNoActiveProfessionalsEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (!(input.operational.snapshot.openCases > 0 && input.operational.snapshot.activeProfessionals === 0)) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:capacity:no_active_professionals',
    category: 'capacity',
    importance: 'critical',
    temporalKind: 'observed',
    title: 'Casos abertos sem profissionais ativos explicam o risco atual',
    summary: `Existem ${input.operational.snapshot.openCases} casos abertos sem profissionais ativos para absorver a carga operacional.`,
    evidence: [
      {
        key: 'open_cases',
        value: input.operational.snapshot.openCases,
        description: `A operação mantém ${input.operational.snapshot.openCases} casos abertos no momento.`,
      },
      {
        key: 'active_professionals',
        value: input.operational.snapshot.activeProfessionals,
        description: 'Nenhum profissional ativo está disponível na leitura atual.',
      },
    ],
    suggestedAction: 'Reforçar capacidade antes de aceitar nova pressão operacional.',
    source: 'operational',
    sourceKey: 'no_active_professionals',
    deduplicationKey: 'capacity:no_active_professionals',
    specificityRank: 5,
  })
}

function buildCapacityAdequateEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (!(input.operational.snapshot.activeProfessionals > 0 && input.operational.snapshot.openCases <= input.operational.snapshot.activeProfessionals * 3)) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:capacity:adequate',
    category: 'capacity',
    importance: 'low',
    temporalKind: 'observed',
    title: 'A capacidade atual sustenta a carga operacional',
    summary: 'A relação entre casos ativos e profissionais ativos indica capacidade suficiente para a operação atual.',
    evidence: [
      {
        key: 'open_cases',
        value: input.operational.snapshot.openCases,
        description: `A operação acompanha ${input.operational.snapshot.openCases} casos ativos.`,
      },
      {
        key: 'active_professionals',
        value: input.operational.snapshot.activeProfessionals,
        description: `A leitura atual identifica ${input.operational.snapshot.activeProfessionals} profissionais ativos.`,
      },
    ],
    source: 'operational',
    sourceKey: 'capacity_adequate',
    deduplicationKey: 'capacity:adequate',
    specificityRank: 1,
  })
}

function buildBacklogPressureEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.operational.snapshot.activeProfessionals === 0) {
    return null
  }

  if (input.operational.snapshot.backlog <= input.operational.snapshot.activeProfessionals * 7) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:operations:backlog_pressure',
    category: 'operations',
    importance: 'high',
    temporalKind: 'observed',
    title: 'O backlog atual pressiona a execução do escritório',
    summary: `O backlog de ${input.operational.snapshot.backlog} casos supera a faixa confortável para ${input.operational.snapshot.activeProfessionals} profissionais ativos.`,
    evidence: [
      {
        key: 'backlog',
        value: input.operational.snapshot.backlog,
        description: `O backlog atual está em ${input.operational.snapshot.backlog} casos.`,
      },
      {
        key: 'active_professionals',
        value: input.operational.snapshot.activeProfessionals,
        description: `A operação conta com ${input.operational.snapshot.activeProfessionals} profissionais ativos.`,
      },
    ],
    suggestedAction: 'Revisar a distribuição de casos antes de adicionar nova pressão operacional.',
    source: 'operational',
    sourceKey: 'backlog_pressure',
    deduplicationKey: 'operations:backlog_pressure',
    specificityRank: 4,
  })
}

function buildBacklogHealthyEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (!(input.operational.snapshot.activeProfessionals > 0 && input.operational.snapshot.backlog <= input.operational.snapshot.activeProfessionals * 4)) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:operations:backlog_healthy',
    category: 'operations',
    importance: 'low',
    temporalKind: 'observed',
    title: 'O backlog permanece dentro de uma faixa saudável',
    summary: 'A relação entre backlog e capacidade ativa permanece compatível com a operação atual.',
    evidence: [
      {
        key: 'backlog',
        value: input.operational.snapshot.backlog,
        description: `O backlog atual está em ${input.operational.snapshot.backlog} casos.`,
      },
      {
        key: 'active_professionals',
        value: input.operational.snapshot.activeProfessionals,
        description: `A operação conta com ${input.operational.snapshot.activeProfessionals} profissionais ativos.`,
      },
    ],
    source: 'operational',
    sourceKey: 'backlog_healthy',
    deduplicationKey: 'operations:backlog_healthy',
    specificityRank: 1,
  })
}

function buildExpansionOpportunitiesEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.growth.summary.expansionOpportunities <= 0) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:growth:expansion_opportunities',
    category: 'growth',
    importance: 'medium',
    temporalKind: 'observed',
    title: 'Oportunidades de expansão explicam a pressão de crescimento',
    summary: `A inteligência de crescimento identificou ${input.growth.summary.expansionOpportunities} oportunidades de expansão com evidência suficiente para avaliação executiva.`,
    evidence: [
      {
        key: 'expansion_opportunities',
        value: input.growth.summary.expansionOpportunities,
        description: `Existem ${input.growth.summary.expansionOpportunities} oportunidades de expansão no snapshot atual.`,
      },
    ],
    suggestedAction: 'Revisar as oportunidades priorizadas no centro de decisões.',
    source: 'growth',
    sourceKey: 'expansion_opportunities',
    deduplicationKey: 'growth:expansion_opportunities',
    specificityRank: 3,
  })
}

function buildCoverageGapsEvent(input: ExecutiveTimelineEngineInput): CandidateTimelineItem | null {
  if (input.growth.summary.totalCoverageGaps <= 0) {
    return null
  }

  return createCandidate({
    id: 'executive_timeline:coverage:gaps',
    category: 'coverage',
    importance: 'medium',
    temporalKind: 'observed',
    title: 'Lacunas de cobertura ajudam a explicar a oportunidade atual',
    summary: `A leitura de growth identificou ${input.growth.summary.totalCoverageGaps} lacunas de cobertura regional ou por especialidade.`,
    evidence: [
      {
        key: 'coverage_gaps',
        value: input.growth.summary.totalCoverageGaps,
        description: `Existem ${input.growth.summary.totalCoverageGaps} lacunas de cobertura registradas no snapshot atual.`,
      },
    ],
    suggestedAction: 'Avaliar se as lacunas exigem reforço de cobertura ou redistribuição.',
    source: 'growth',
    sourceKey: 'coverage_gaps',
    deduplicationKey: 'coverage:gaps',
    specificityRank: 3,
  })
}

function collectTrendSignals<T extends { trend: 'up' | 'down' | 'stable' | 'unknown' }>(
  items: T[],
  trend: 'up' | 'down',
) {
  return items.filter((item) => item.trend === trend)
}

function buildGrowthTrendEvent(
  input: ExecutiveTimelineEngineInput,
  trend: 'up' | 'down',
): CandidateTimelineItem | null {
  const demandSignals = collectTrendSignals(input.growth.snapshot.demand.items, trend)
  const territorySignals = collectTrendSignals(input.growth.snapshot.territories, trend)

  if (demandSignals.length === 0 && territorySignals.length === 0) {
    return null
  }

  const firstDemand = demandSignals[0]
  const firstTerritory = territorySignals[0]
  const periodLabel = input.growth.snapshot.period.label
  const descriptionPrefix = trend === 'up'
    ? 'A inteligência de crescimento marca tendência explícita de avanço no período analisado.'
    : 'A inteligência de crescimento marca tendência explícita de desaceleração no período analisado.'

  return createCandidate({
    id: `executive_timeline:growth:demand_trend_${trend}`,
    category: 'growth',
    importance: trend === 'up' ? 'medium' : 'high',
    temporalKind: 'trend',
    title: trend === 'up'
      ? 'A demanda mostra tendência explícita de crescimento'
      : 'A demanda mostra tendência explícita de desaceleração',
    summary: `${descriptionPrefix} O sinal vem do snapshot de growth do período "${periodLabel}".`,
    evidence: [
      {
        key: 'demand_trend_count',
        value: demandSignals.length,
        description: `Foram identificadas ${demandSignals.length} frentes de demanda com tendência "${trend}".`,
      },
      {
        key: 'territory_trend_count',
        value: territorySignals.length,
        description: `Foram identificadas ${territorySignals.length} projeções territoriais com tendência "${trend}".`,
      },
      ...(firstDemand ? [{
        key: 'demand_trend_sample',
        value: `${firstDemand.city}:${firstDemand.specialty}`,
        description: `Exemplo de frente sinalizada: ${firstDemand.city} / ${firstDemand.specialty}.`,
      }] : []),
      ...(firstTerritory ? [{
        key: 'territory_trend_sample',
        value: firstTerritory.city,
        description: `Exemplo territorial sinalizado: ${firstTerritory.city}.`,
      }] : []),
    ],
    suggestedAction: trend === 'up'
      ? 'Revisar se a capacidade e a cobertura acompanham essa tendência explícita de growth.'
      : 'Revisar se a desaceleração exige proteção operacional ou ajuste de prioridade.',
    source: 'growth',
    sourceKey: `growth_trend_${trend}`,
    deduplicationKey: `growth:trend:${trend}`,
    specificityRank: 2,
  })
}

function mapDecisionImportance(priority: ExecutiveDecisionPriority): ExecutiveTimelineImportance {
  switch (priority) {
    case 'critical':
      return 'critical'
    case 'high':
      return 'high'
    case 'medium':
      return 'medium'
    case 'low':
    default:
      return 'low'
  }
}

function consolidateDecisionGroup(decisions: ExecutiveDecision[]) {
  return [...decisions].sort((left, right) => {
    const priorityDifference = decisionPriorityRank(right.priority) - decisionPriorityRank(left.priority)
    if (priorityDifference !== 0) {
      return priorityDifference
    }

    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence
    }

    if (right.evidence.length !== left.evidence.length) {
      return right.evidence.length - left.evidence.length
    }

    return left.id.localeCompare(right.id)
  })[0]
}

function buildDecisionEvent(decision: ExecutiveDecision): CandidateTimelineItem {
  return createCandidate({
    id: `executive_timeline:decision:${decision.type}`,
    category: 'decision',
    importance: mapDecisionImportance(decision.priority),
    temporalKind: 'observed',
    title: decision.title,
    summary: decision.explanation,
    evidence: decision.evidence.map((item) => ({
      key: item.key,
      value: item.value,
      description: item.summary,
    })),
    suggestedAction: decision.recommendedActions[0],
    source: 'decision_center',
    sourceKey: decision.type,
    deduplicationKey: `decision:${decision.type}`,
    specificityRank: 2,
  })
}

function buildDecisionEvents(
  input: ExecutiveTimelineEngineInput,
  options: {
    hasHealthCritical: boolean
    hasSlaCritical: boolean
    hasNoActiveProfessionals: boolean
    hasBacklogPressure: boolean
    hasExpansionOpportunities: boolean
  },
) {
  const grouped = new Map<ExecutiveDecisionType, ExecutiveDecision[]>()

  for (const decision of input.decisionCenter.decisions) {
    if (!(decision.priority === 'critical' || decision.priority === 'high')) {
      continue
    }

    const list = grouped.get(decision.type) ?? []
    list.push(decision)
    grouped.set(decision.type, list)
  }

  const items: CandidateTimelineItem[] = []

  for (const [type, decisions] of grouped.entries()) {
    if (
      (type === 'wait' && (options.hasHealthCritical || options.hasSlaCritical))
      || (type === 'hire' && options.hasNoActiveProfessionals)
      || (type === 'redistribute' && options.hasBacklogPressure)
      || (type === 'expand' && options.hasExpansionOpportunities)
    ) {
      continue
    }

    items.push(buildDecisionEvent(consolidateDecisionGroup(decisions)))
  }

  return items
}

export class ExecutiveTimelineEngine {
  build(input: ExecutiveTimelineEngineInput): ExecutiveTimeline {
    const limit = sanitizeLimit(input.limit)
    const hasHealthCritical = input.officeHealth.level === 'critical'
    const hasSlaCritical = input.operational.snapshot.slaBreachedCases > 0
    const hasNoActiveProfessionals = input.operational.snapshot.openCases > 0
      && input.operational.snapshot.activeProfessionals === 0
    const hasBacklogPressure = !hasNoActiveProfessionals
      && input.operational.snapshot.activeProfessionals > 0
      && input.operational.snapshot.backlog > input.operational.snapshot.activeProfessionals * 7
    const hasExpansionOpportunities = input.growth.summary.expansionOpportunities > 0

    const candidates = [
      buildHealthCriticalEvent(input),
      buildHealthExcellentEvent(input),
      buildSlaBreachedEvent(input),
      buildSlaWarningEvent(input),
      buildNoCriticalSlaEvent(input),
      buildNoActiveProfessionalsEvent(input),
      buildCapacityAdequateEvent(input),
      buildBacklogPressureEvent(input),
      buildBacklogHealthyEvent(input),
      buildExpansionOpportunitiesEvent(input),
      buildCoverageGapsEvent(input),
      buildGrowthTrendEvent(input, 'up'),
      buildGrowthTrendEvent(input, 'down'),
      ...buildDecisionEvents(input, {
        hasHealthCritical,
        hasSlaCritical,
        hasNoActiveProfessionals,
        hasBacklogPressure,
        hasExpansionOpportunities,
      }),
    ].filter((item): item is CandidateTimelineItem => item !== null)

    const deduplicated = deduplicate(candidates)
    const ordered = sortTimelineItems(deduplicated)
    const items = ordered
      .slice(0, limit)
      .map(({ deduplicationKey: _deduplicationKey, specificityRank: _specificityRank, ...item }) => item)

    return {
      items,
      totalDetected: deduplicated.length,
      totalPublished: items.length,
      generatedAt: input.generatedAt ?? input.growth.generatedAt,
    }
  }
}

export function createExecutiveTimelineEngine() {
  return new ExecutiveTimelineEngine()
}
