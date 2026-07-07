import type {
  ExecutiveDecision,
  ExecutiveDecisionPriority,
  ExecutiveDecisionType,
} from './DecisionCenterTypes.js'
import type {
  ExecutiveFeed,
  ExecutiveFeedCategory,
  ExecutiveFeedEngineInput,
  ExecutiveFeedEvidence,
  ExecutiveFeedItem,
  ExecutiveFeedSeverity,
} from './ExecutiveFeedTypes.js'

const DEFAULT_LIMIT = 5
const MIN_LIMIT = 1
const MAX_LIMIT = 20

type CandidateFeedItem = ExecutiveFeedItem & {
  deduplicationKey: string
  executivePriorityRank: number
}

function severityRank(severity: ExecutiveFeedSeverity) {
  switch (severity) {
    case 'critical':
      return 5
    case 'warning':
      return 4
    case 'opportunity':
      return 3
    case 'positive':
      return 2
    case 'info':
    default:
      return 1
  }
}

function categoryRank(category: ExecutiveFeedCategory) {
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

function sortFeedItems(items: CandidateFeedItem[]) {
  return [...items].sort((left, right) => {
    const severityDifference = severityRank(right.severity) - severityRank(left.severity)
    if (severityDifference !== 0) {
      return severityDifference
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

function chooseDeduplicated(left: CandidateFeedItem, right: CandidateFeedItem) {
  const severityDifference = severityRank(right.severity) - severityRank(left.severity)
  if (severityDifference !== 0) {
    return severityDifference > 0 ? right : left
  }

  const priorityDifference = right.executivePriorityRank - left.executivePriorityRank
  if (priorityDifference !== 0) {
    return priorityDifference > 0 ? right : left
  }

  if (right.evidence.length !== left.evidence.length) {
    return right.evidence.length > left.evidence.length ? right : left
  }

  return left.id.localeCompare(right.id) <= 0 ? left : right
}

function deduplicate(items: CandidateFeedItem[]) {
  const deduplicated = new Map<string, CandidateFeedItem>()

  for (const item of items) {
    const existing = deduplicated.get(item.deduplicationKey)
    if (!existing) {
      deduplicated.set(item.deduplicationKey, item)
      continue
    }

    deduplicated.set(item.deduplicationKey, chooseDeduplicated(existing, item))
  }

  return Array.from(deduplicated.values())
}

function createCandidate(args: Omit<CandidateFeedItem, 'executivePriorityRank'> & {
  executivePriority?: ExecutiveDecisionPriority
}): CandidateFeedItem {
  return {
    ...args,
    evidence: args.evidence.map((item) => ({ ...item })),
    executivePriorityRank: args.executivePriority
      ? decisionPriorityRank(args.executivePriority)
      : 0,
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

function mapDecisionSeverity(decision: ExecutiveDecision): ExecutiveFeedSeverity {
  switch (decision.type) {
    case 'expand':
    case 'invest':
      return 'opportunity'
    case 'wait':
      return decision.priority === 'critical' ? 'critical' : 'warning'
    case 'hire':
      return decision.priority === 'critical' ? 'critical' : 'warning'
    case 'redistribute':
    default:
      return 'warning'
  }
}

function mapDecisionAction(decision: ExecutiveDecision) {
  return decision.recommendedActions[0]
}

function buildDecisionEvent(decision: ExecutiveDecision): CandidateFeedItem {
  return createCandidate({
    id: `feed:decision:${decision.type}`,
    category: 'decision',
    severity: mapDecisionSeverity(decision),
    title: decision.title,
    summary: decision.explanation,
    evidence: decision.evidence.map((item) => ({ ...item })),
    suggestedAction: mapDecisionAction(decision),
    source: 'decision_center',
    sourceKey: decision.type,
    deduplicationKey: `decision:${decision.type}`,
    executivePriority: decision.priority,
  })
}

function buildHealthCriticalEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.officeHealth.level !== 'critical') {
    return null
  }

  return createCandidate({
    id: 'feed:health:critical',
    category: 'health',
    severity: 'critical',
    title: 'A saude do escritorio exige acao imediata',
    summary: input.officeHealth.explanation,
    evidence: [
      {
        key: 'health_score',
        label: 'Score de saude',
        value: input.officeHealth.score,
        summary: `O escritorio apresenta score de saude ${input.officeHealth.score}.`,
      },
      ...input.officeHealth.warnings.slice(0, 2).map((warning) => ({
        key: warning.key,
        label: warning.title,
        value: warning.weight,
        summary: warning.summary,
      })),
    ],
    suggestedAction: 'Revisar imediatamente os principais riscos operacionais antes de ampliar a exposicao do escritorio.',
    source: 'office_health',
    sourceKey: 'critical',
    deduplicationKey: 'health:critical',
  })
}

function buildHealthExcellentEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.officeHealth.level !== 'excellent') {
    return null
  }

  return createCandidate({
    id: 'feed:health:excellent',
    category: 'health',
    severity: 'positive',
    title: 'O escritorio alcancou excelente condicao operacional',
    summary: input.officeHealth.explanation,
    evidence: [
      {
        key: 'health_score',
        label: 'Score de saude',
        value: input.officeHealth.score,
        summary: `O escritorio apresenta score de saude ${input.officeHealth.score}.`,
      },
      ...(input.officeHealth.positives.slice(0, 2).map((driver) => ({
        key: driver.key,
        label: driver.title,
        value: driver.weight,
        summary: driver.summary,
      }))),
    ],
    source: 'office_health',
    sourceKey: 'excellent',
    deduplicationKey: 'health:excellent',
  })
}

function buildSlaBreachedEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.operational.snapshot.slaBreachedCases <= 0) {
    return null
  }

  return createCandidate({
    id: 'feed:sla:breached',
    category: 'sla',
    severity: 'critical',
    title: 'Existem casos com SLA vencido',
    summary: `A operacao possui ${input.operational.snapshot.slaBreachedCases} casos com SLA vencido exigindo resposta imediata.`,
    evidence: [
      {
        key: 'sla_breached_cases',
        label: 'Casos com SLA vencido',
        value: input.operational.snapshot.slaBreachedCases,
        summary: `Existem ${input.operational.snapshot.slaBreachedCases} casos com SLA vencido no escritorio.`,
      },
    ],
    suggestedAction: 'Priorizar imediatamente os casos com SLA vencido.',
    source: 'operational',
    sourceKey: 'sla_breached_cases',
    deduplicationKey: 'sla:breached',
  })
}

function buildSlaWarningEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.operational.snapshot.slaBreachedCases > 0 || input.operational.snapshot.slaWarningCases <= 0) {
    return null
  }

  return createCandidate({
    id: 'feed:sla:warning',
    category: 'sla',
    severity: 'warning',
    title: 'Existem casos em risco de SLA',
    summary: `A operacao possui ${input.operational.snapshot.slaWarningCases} casos em alerta de SLA.`,
    evidence: [
      {
        key: 'sla_warning_cases',
        label: 'Casos em alerta de SLA',
        value: input.operational.snapshot.slaWarningCases,
        summary: `Existem ${input.operational.snapshot.slaWarningCases} casos em alerta de SLA no escritorio.`,
      },
    ],
    suggestedAction: 'Revisar os casos em alerta antes que avancem para vencimento de SLA.',
    source: 'operational',
    sourceKey: 'sla_warning_cases',
    deduplicationKey: 'sla:warning',
  })
}

function buildNoActiveProfessionalsEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (!(input.operational.snapshot.openCases > 0 && input.operational.snapshot.activeProfessionals === 0)) {
    return null
  }

  return createCandidate({
    id: 'feed:capacity:no_active_professionals',
    category: 'capacity',
    severity: 'critical',
    title: 'Existem casos abertos sem profissionais ativos',
    summary: `O escritorio possui ${input.operational.snapshot.openCases} casos abertos sem profissionais ativos para absorver a carga.`,
    evidence: [
      {
        key: 'open_cases',
        label: 'Casos abertos',
        value: input.operational.snapshot.openCases,
        summary: `Existem ${input.operational.snapshot.openCases} casos abertos no escritorio.`,
      },
      {
        key: 'active_professionals',
        label: 'Profissionais ativos',
        value: input.operational.snapshot.activeProfessionals,
        summary: 'Nao ha profissionais ativos disponiveis para assumir a carga atual.',
      },
    ],
    suggestedAction: 'Reforcar imediatamente a capacidade profissional antes de assumir nova demanda.',
    source: 'operational',
    sourceKey: 'no_active_professionals',
    deduplicationKey: 'capacity:no_active_professionals',
  })
}

function buildBacklogPressureEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.operational.snapshot.activeProfessionals === 0) {
    return null
  }
  if (input.operational.snapshot.backlog <= input.operational.snapshot.activeProfessionals * 7) {
    return null
  }

  return createCandidate({
    id: 'feed:operations:backlog_pressure',
    category: 'operations',
    severity: 'warning',
    title: 'O backlog esta pressionado',
    summary: `O backlog de ${input.operational.snapshot.backlog} casos supera a faixa confortavel para ${input.operational.snapshot.activeProfessionals} profissionais ativos.`,
    evidence: [
      {
        key: 'backlog',
        label: 'Backlog',
        value: input.operational.snapshot.backlog,
        summary: `O backlog atual esta em ${input.operational.snapshot.backlog} casos.`,
      },
      {
        key: 'active_professionals',
        label: 'Profissionais ativos',
        value: input.operational.snapshot.activeProfessionals,
        summary: `A operacao conta com ${input.operational.snapshot.activeProfessionals} profissionais ativos.`,
      },
    ],
    suggestedAction: 'Revisar a distribuicao de casos entre os profissionais ativos.',
    source: 'operational',
    sourceKey: 'backlog_pressure',
    deduplicationKey: 'operations:backlog_pressure',
  })
}

function buildExpansionOpportunitiesEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.growth.summary.expansionOpportunities <= 0) {
    return null
  }

  return createCandidate({
    id: 'feed:growth:expansion_opportunities',
    category: 'growth',
    severity: 'opportunity',
    title: 'Existem oportunidades de expansao em aberto',
    summary: `A inteligencia de crescimento identificou ${input.growth.summary.expansionOpportunities} oportunidades de expansao para o escritorio.`,
    evidence: [
      {
        key: 'expansion_opportunities',
        label: 'Oportunidades de expansao',
        value: input.growth.summary.expansionOpportunities,
        summary: `Existem ${input.growth.summary.expansionOpportunities} oportunidades de expansao identificadas.`,
      },
    ],
    suggestedAction: 'Revisar as oportunidades identificadas e priorizar a de maior aderencia.',
    source: 'growth',
    sourceKey: 'expansion_opportunities',
    deduplicationKey: 'growth:expansion_opportunity',
  })
}

function buildCoverageGapsEvent(input: ExecutiveFeedEngineInput): CandidateFeedItem | null {
  if (input.growth.summary.totalCoverageGaps <= 0) {
    return null
  }

  return createCandidate({
    id: 'feed:coverage:gaps',
    category: 'coverage',
    severity: 'warning',
    title: 'Existem lacunas de cobertura relevantes',
    summary: `A inteligencia detectou ${input.growth.summary.totalCoverageGaps} lacunas de cobertura regional ou por especialidade.`,
    evidence: [
      {
        key: 'coverage_gaps',
        label: 'Lacunas de cobertura',
        value: input.growth.summary.totalCoverageGaps,
        summary: `Existem ${input.growth.summary.totalCoverageGaps} lacunas de cobertura que merecem avaliacao.`,
      },
    ],
    suggestedAction: 'Avaliar cobertura profissional nas regioes ou especialidades descobertas.',
    source: 'growth',
    sourceKey: 'coverage_gaps',
    deduplicationKey: 'coverage:coverage_gap',
  })
}

function buildDecisionEvents(input: ExecutiveFeedEngineInput, options: {
  hasHealthCritical: boolean
  hasSlaCritical: boolean
  hasNoActiveProfessionals: boolean
  hasBacklogPressure: boolean
}) {
  const grouped = new Map<ExecutiveDecisionType, ExecutiveDecision[]>()

  for (const decision of input.decisionCenter.decisions) {
    if (!(decision.priority === 'critical' || decision.priority === 'high')) {
      continue
    }

    const list = grouped.get(decision.type) ?? []
    list.push(decision)
    grouped.set(decision.type, list)
  }

  const items: CandidateFeedItem[] = []

  for (const [type, decisions] of grouped.entries()) {
    if (
      (type === 'wait' && (options.hasHealthCritical || options.hasSlaCritical))
      || (type === 'hire' && options.hasNoActiveProfessionals)
      || (type === 'redistribute' && options.hasBacklogPressure)
    ) {
      continue
    }

    const decision = consolidateDecisionGroup(decisions)
    items.push(buildDecisionEvent(decision))
  }

  return items
}

export class ExecutiveFeedEngine {
  build(input: ExecutiveFeedEngineInput): ExecutiveFeed {
    const limit = sanitizeLimit(input.limit)
    const noActiveProfessionals = input.operational.snapshot.openCases > 0
      && input.operational.snapshot.activeProfessionals === 0
    const backlogPressure = !noActiveProfessionals
      && input.operational.snapshot.activeProfessionals > 0
      && input.operational.snapshot.backlog > input.operational.snapshot.activeProfessionals * 7
    const healthCritical = input.officeHealth.level === 'critical'
    const slaCritical = input.operational.snapshot.slaBreachedCases > 0

    const candidates = [
      buildHealthCriticalEvent(input),
      buildHealthExcellentEvent(input),
      buildSlaBreachedEvent(input),
      buildSlaWarningEvent(input),
      buildNoActiveProfessionalsEvent(input),
      buildBacklogPressureEvent(input),
      buildExpansionOpportunitiesEvent(input),
      buildCoverageGapsEvent(input),
      ...buildDecisionEvents(input, {
        hasHealthCritical: healthCritical,
        hasSlaCritical: slaCritical,
        hasNoActiveProfessionals: noActiveProfessionals,
        hasBacklogPressure: backlogPressure,
      }),
    ].filter((item): item is CandidateFeedItem => item !== null)

    const deduplicated = deduplicate(candidates)
    const ordered = sortFeedItems(deduplicated)
    const items = ordered.slice(0, limit).map(({ deduplicationKey: _deduplicationKey, executivePriorityRank: _executivePriorityRank, ...item }) => item)

    return {
      items,
      totalDetected: deduplicated.length,
      totalPublished: items.length,
      generatedAt: input.generatedAt ?? input.growth.generatedAt,
    }
  }
}

export function createExecutiveFeedEngine() {
  return new ExecutiveFeedEngine()
}
