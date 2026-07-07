import type { MorningBrief, MorningBriefEngineInput, MorningBriefItem, MorningBriefTone } from './MorningBriefTypes.js'

function resolveTitle(level: MorningBriefEngineInput['officeHealth']['level']) {
  switch (level) {
    case 'excellent':
      return 'Seu escritorio esta em excelente condicao hoje.'
    case 'good':
      return 'Seu escritorio esta saudavel hoje.'
    case 'attention':
      return 'Seu escritorio precisa de atencao hoje.'
    case 'critical':
      return 'Seu escritorio exige acao imediata hoje.'
    default:
      return 'Seu escritorio pede leitura executiva hoje.'
  }
}

function resolveTone(level: MorningBriefEngineInput['officeHealth']['level']): MorningBriefTone {
  switch (level) {
    case 'excellent':
    case 'good':
      return 'positive'
    case 'attention':
      return 'attention'
    case 'critical':
      return 'critical'
    default:
      return 'neutral'
  }
}

function buildSlaSummary(input: MorningBriefEngineInput) {
  if (input.operational.snapshot.slaBreachedCases > 0) {
    return `Existem ${input.operational.snapshot.slaBreachedCases} casos com SLA vencido exigindo resposta imediata.`
  }
  if (input.operational.snapshot.slaWarningCases > 0) {
    return `Existem ${input.operational.snapshot.slaWarningCases} casos em alerta de SLA.`
  }
  return 'Nao ha sinais criticos de SLA.'
}

function buildTopPriority(input: MorningBriefEngineInput) {
  return input.decisionCenter.decisions[0]?.title
    ?? 'Monitorar a operacao e aguardar novos sinais.'
}

function buildSummary(input: MorningBriefEngineInput, topPriority: string) {
  const stateSentence = (() => {
    switch (input.officeHealth.level) {
      case 'excellent':
        return 'O escritorio esta em excelente condicao e combina saude operacional com espaco para crescimento.'
      case 'good':
        return 'O escritorio esta saudavel e possui base suficiente para executar as proximas prioridades.'
      case 'attention':
        return 'O escritorio apresenta pontos de atencao que exigem coordenacao executiva hoje.'
      case 'critical':
      default:
        return 'O escritorio apresenta sinais criticos e precisa de intervencao executiva imediata.'
    }
  })()

  return [
    stateSentence,
    `A decisao mais importante hoje e ${topPriority}.`,
    buildSlaSummary(input),
  ].join(' ')
}

function buildItems(input: MorningBriefEngineInput): MorningBriefItem[] {
  return [
    {
      key: 'health_score',
      label: 'Score de saude',
      value: input.officeHealth.score,
      summary: `O escritorio inicia o dia com score de saude ${input.officeHealth.score}.`,
    },
    {
      key: 'active_cases',
      label: 'Casos ativos',
      value: input.operational.snapshot.openCases,
      summary: `Existem ${input.operational.snapshot.openCases} casos ativos em acompanhamento.`,
    },
    {
      key: 'backlog',
      label: 'Backlog',
      value: input.operational.snapshot.backlog,
      summary: `O backlog atual esta em ${input.operational.snapshot.backlog} casos.`,
    },
    {
      key: 'sla',
      label: 'SLA',
      value: input.operational.snapshot.slaBreachedCases > 0
        ? `breach:${input.operational.snapshot.slaBreachedCases}`
        : input.operational.snapshot.slaWarningCases > 0
          ? `warning:${input.operational.snapshot.slaWarningCases}`
          : 'ok',
      summary: buildSlaSummary(input),
    },
    {
      key: 'growth_opportunities',
      label: 'Oportunidades de crescimento',
      value: input.growth.summary.expansionOpportunities,
      summary: `A inteligencia de crescimento aponta ${input.growth.summary.expansionOpportunities} oportunidades de expansao.`,
    },
    {
      key: 'decisions_count',
      label: 'Decisoes executivas',
      value: input.decisionCenter.decisions.length,
      summary: `O centro de decisao consolidou ${input.decisionCenter.decisions.length} decisoes executivas para hoje.`,
    },
  ]
}

export class MorningBriefEngine {
  build(input: MorningBriefEngineInput): MorningBrief {
    const title = resolveTitle(input.officeHealth.level)
    const tone = resolveTone(input.officeHealth.level)
    const topPriority = buildTopPriority(input)

    return {
      title,
      tone,
      summary: buildSummary(input, topPriority),
      topPriority,
      items: buildItems(input),
      generatedAt: input.generatedAt ?? input.growth.generatedAt,
    }
  }
}

export function createMorningBriefEngine() {
  return new MorningBriefEngine()
}
