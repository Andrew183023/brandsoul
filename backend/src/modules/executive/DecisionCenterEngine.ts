import type {
  DecisionCenterEngineInput,
  DecisionCenterResult,
  ExecutiveDecision,
  ExecutiveDecisionEvidence,
  ExecutiveDecisionImpact,
  ExecutiveDecisionPriority,
} from './DecisionCenterTypes.js'

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function priorityRank(priority: ExecutiveDecisionPriority) {
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

function impactRank(impact: ExecutiveDecisionImpact) {
  switch (impact) {
    case 'very_high':
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

function createDecision(args: {
  id: string
  type: ExecutiveDecision['type']
  title: string
  priority: ExecutiveDecisionPriority
  impact: ExecutiveDecisionImpact
  positiveSignals?: number
  evidence: ExecutiveDecisionEvidence[]
  explanation: string
  recommendedActions: string[]
  blockingFactors?: string[]
}): ExecutiveDecision {
  const blockingFactors = args.blockingFactors ?? []
  const positiveSignals = args.positiveSignals ?? 0
  const confidence = clampConfidence(70 + (positiveSignals * 6) - (blockingFactors.length * 10))

  return {
    id: args.id,
    type: args.type,
    title: args.title,
    priority: args.priority,
    impact: args.impact,
    confidence,
    explanation: args.explanation,
    evidence: args.evidence.map((item) => ({ ...item })),
    recommendedActions: [...args.recommendedActions],
    blockingFactors: [...blockingFactors],
  }
}

function hasWarning(input: DecisionCenterEngineInput, key: string) {
  return input.officeHealth.warnings.some((warning) => warning.key === key)
}

function sortDecisions(decisions: ExecutiveDecision[]) {
  return [...decisions].sort((left, right) => {
    const priorityDifference = priorityRank(right.priority) - priorityRank(left.priority)
    if (priorityDifference !== 0) {
      return priorityDifference
    }

    const impactDifference = impactRank(right.impact) - impactRank(left.impact)
    if (impactDifference !== 0) {
      return impactDifference
    }

    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence
    }

    return left.type.localeCompare(right.type)
  })
}

export class DecisionCenterEngine {
  build(input: DecisionCenterEngineInput): DecisionCenterResult {
    const decisions: ExecutiveDecision[] = []
    const {
      growth,
      operational,
      officeHealth,
    } = input

    const backlogPressure = operational.snapshot.backlog > (operational.snapshot.activeProfessionals * 7)
    const capacityWarning = hasWarning(input, 'capacity_stressed')
    const backlogWarning = hasWarning(input, 'backlog_pressure')
    const capacityPressed = backlogPressure || capacityWarning || backlogWarning

    if (growth.summary.expansionOpportunities > 0 && officeHealth.score >= 70) {
      const multipleOpportunities = growth.summary.expansionOpportunities > 1
      decisions.push(createDecision({
        id: 'decision-expand',
        type: 'expand',
        title: 'Expandir com controle operacional',
        priority: officeHealth.score >= 80 ? 'high' : 'medium',
        impact: multipleOpportunities ? 'high' : 'medium',
        positiveSignals: multipleOpportunities ? 3 : 2,
        evidence: [
          {
            key: 'expansion_opportunities',
            label: 'Oportunidades de expansao',
            value: growth.summary.expansionOpportunities,
            summary: `Existem ${growth.summary.expansionOpportunities} oportunidades de expansao identificadas pela inteligencia de crescimento.`,
          },
          {
            key: 'office_health_score',
            label: 'Saude do escritorio',
            value: officeHealth.score,
            summary: `O escritorio apresenta score de saude ${officeHealth.score}, suficiente para absorver nova expansao com controle.`,
          },
        ],
        explanation: 'Recomendamos expandir porque existem oportunidades concretas de crescimento e o escritorio mantem saude operacional suficiente para absorver nova demanda.',
        recommendedActions: [
          'Priorizar a oportunidade de expansao com maior aderencia operacional.',
          'Validar a capacidade disponivel antes de abrir nova frente comercial.',
        ],
        blockingFactors: capacityPressed ? ['A operacao ainda apresenta pressao de capacidade em pontos especificos.'] : [],
      }))
    }

    if (officeHealth.level === 'critical' || operational.snapshot.slaBreachedCases > 0) {
      decisions.push(createDecision({
        id: 'decision-wait',
        type: 'wait',
        title: 'Segurar expansao e corrigir a operacao',
        priority: 'critical',
        impact: 'high',
        positiveSignals: 1,
        evidence: [
          {
            key: 'office_health_level',
            label: 'Nivel de saude executiva',
            value: officeHealth.level,
            summary: `O escritorio esta classificado como ${officeHealth.level}.`,
          },
          {
            key: 'sla_breached_cases',
            label: 'Casos com SLA vencido',
            value: operational.snapshot.slaBreachedCases,
            summary: `Existem ${operational.snapshot.slaBreachedCases} casos com SLA vencido na operacao atual.`,
          },
        ],
        explanation: 'Recomendamos aguardar movimentos de expansao porque a operacao ainda apresenta sinais criticos que precisam ser corrigidos antes de assumir nova carga.',
        recommendedActions: [
          'Corrigir os casos com SLA vencido antes de ampliar a exposicao comercial.',
          'Revisar backlog e capacidade antes de iniciar novos investimentos.',
        ],
        blockingFactors: [
          officeHealth.level === 'critical' ? 'Saude executiva em nivel critico.' : '',
          operational.snapshot.slaBreachedCases > 0 ? 'Existem casos com SLA vencido.' : '',
        ].filter((item) => item.length > 0),
      }))
    }

    if (capacityPressed) {
      decisions.push(createDecision({
        id: 'decision-redistribute',
        type: 'redistribute',
        title: 'Redistribuir a carga operacional',
        priority: backlogPressure ? 'high' : 'medium',
        impact: backlogPressure ? 'very_high' : 'high',
        positiveSignals: 1,
        evidence: [
          {
            key: 'backlog',
            label: 'Backlog atual',
            value: operational.snapshot.backlog,
            summary: `O backlog atual esta em ${operational.snapshot.backlog} casos.`,
          },
          {
            key: 'active_professionals',
            label: 'Profissionais ativos',
            value: operational.snapshot.activeProfessionals,
            summary: `A operacao conta com ${operational.snapshot.activeProfessionals} profissionais ativos para distribuir a carga.`,
          },
        ],
        explanation: 'Recomendamos redistribuir a operacao porque o backlog e os sinais de capacidade indicam pressao acima do nivel confortavel.',
        recommendedActions: [
          'Rebalancear a distribuicao de casos entre os profissionais ativos.',
          'Priorizar os casos mais urgentes antes de assumir novas frentes.',
        ],
        blockingFactors: backlogPressure ? ['O backlog atual excede a faixa confortavel para a equipe ativa.'] : [],
      }))
    }

    if (
      (operational.snapshot.activeProfessionals === 0 && operational.snapshot.openCases > 0)
      || (operational.snapshot.backlog > 0 && capacityPressed && operational.snapshot.activeProfessionals <= 1)
    ) {
      decisions.push(createDecision({
        id: 'decision-hire',
        type: 'hire',
        title: 'Reforcar capacidade com contratacao',
        priority: operational.snapshot.activeProfessionals === 0 ? 'critical' : 'high',
        impact: 'very_high',
        positiveSignals: officeHealth.score >= 70 ? 2 : 1,
        evidence: [
          {
            key: 'open_cases',
            label: 'Casos abertos',
            value: operational.snapshot.openCases,
            summary: `Existem ${operational.snapshot.openCases} casos abertos demandando capacidade operacional.`,
          },
          {
            key: 'active_professionals',
            label: 'Profissionais ativos',
            value: operational.snapshot.activeProfessionals,
            summary: `A operacao conta atualmente com ${operational.snapshot.activeProfessionals} profissionais ativos.`,
          },
        ],
        explanation: 'Recomendamos contratar porque a carga operacional atual nao encontra capacidade suficiente para manter o ritmo com seguranca.',
        recommendedActions: [
          'Abrir reforco de capacidade para absorver a carga atual.',
          'Usar contratacao ou alocacao adicional para estabilizar a operacao.',
        ],
        blockingFactors: officeHealth.level === 'critical'
          ? ['A operacao ainda precisa de estabilizacao paralela para capturar o ganho da contratacao.']
          : [],
      }))
    }

    if (
      (growth.summary.averageGrowthScore ?? 0) >= 80
      && growth.summary.eligibleLandingCandidates > 0
      && officeHealth.score >= 80
    ) {
      decisions.push(createDecision({
        id: 'decision-invest',
        type: 'invest',
        title: 'Investir em aceleradores de crescimento',
        priority: 'high',
        impact: growth.summary.eligibleLandingCandidates > 1 ? 'very_high' : 'high',
        positiveSignals: 4,
        evidence: [
          {
            key: 'average_growth_score',
            label: 'Score medio de crescimento',
            value: growth.summary.averageGrowthScore,
            summary: `O score medio de crescimento esta em ${growth.summary.averageGrowthScore}.`,
          },
          {
            key: 'eligible_landing_candidates',
            label: 'Candidatos elegiveis para landing',
            value: growth.summary.eligibleLandingCandidates,
            summary: `Existem ${growth.summary.eligibleLandingCandidates} candidatos elegiveis para iniciativas de crescimento preparado.`,
          },
          {
            key: 'office_health_score',
            label: 'Saude do escritorio',
            value: officeHealth.score,
            summary: `A saude executiva atual do escritorio esta em ${officeHealth.score} pontos.`,
          },
        ],
        explanation: 'Recomendamos investir porque o crescimento esta forte, ha ativos preparados para captura de demanda e a operacao segue saudavel.',
        recommendedActions: [
          'Priorizar investimento nas frentes com maior aderencia comercial.',
          'Executar o proximo ciclo de crescimento sem comprometer a disciplina operacional.',
        ],
        blockingFactors: [],
      }))
    }

    return {
      decisions: sortDecisions(decisions),
    }
  }
}

export function createDecisionCenterEngine() {
  return new DecisionCenterEngine()
}
