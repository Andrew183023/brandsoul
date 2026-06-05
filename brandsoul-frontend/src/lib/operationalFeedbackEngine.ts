import type { ProfessionalReadinessSnapshot } from './professionalReadiness'

export type OperationalFeedbackTone = 'critical' | 'warning' | 'neutral' | 'positive'

export type OperationalFeedbackItem = {
  id: 'capacity' | 'sla' | 'coverage' | 'priority' | 'team' | 'intake' | 'publication'
  label: string
  valueLabel: string
  impact: string
  tone: OperationalFeedbackTone
}

export type OperationalFeedbackSignals = {
  maxCapacity?: string
  avgResponseMinutes?: string
  responseWindowLabel?: string
  servedCities?: string
  legalAreas?: string
  priorityRules?: string
  intakeCriteria?: string
  professionalReadiness?: ProfessionalReadinessSnapshot
  heroMessage?: string
  intakeMessage?: string
  availabilityMessage?: string
  channels?: string[]
}

export type OperationalFeedbackSnapshot = {
  deterministic: true
  summary: string
  items: OperationalFeedbackItem[]
}

function parsePositiveInt(value?: string) {
  const normalized = (value ?? '').trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

function parseCsvCount(value?: string) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .length
}

function hasUrgencyHighPriority(value?: string) {
  const normalized = (value ?? '').toLowerCase()
  if (!normalized) {
    return false
  }

  return [
    'urgencia alta',
    'urgência alta',
    'prioridade alta',
    'prioritaria',
    'prioritária',
    'critica',
    'crítica',
  ].some((token) => normalized.includes(token))
}

function resolveCapacityFeedback(maxCapacity?: string): OperationalFeedbackItem {
  const capacity = parsePositiveInt(maxCapacity)

  if (typeof capacity !== 'number') {
    return {
      id: 'capacity',
      label: 'Capacidade',
      valueLabel: 'Nao informada',
      impact: 'Sem capacidade definida, a operacao pode receber volume acima do suportado.',
      tone: 'warning',
    }
  }

  if (capacity <= 6) {
    return {
      id: 'capacity',
      label: 'Capacidade',
      valueLabel: `${capacity} casos`,
      impact: 'Capacidade baixa para fila ativa; recomenda-se priorizacao rigorosa de entrada.',
      tone: 'warning',
    }
  }

  if (capacity <= 20) {
    return {
      id: 'capacity',
      label: 'Capacidade',
      valueLabel: `${capacity} casos`,
      impact: 'Capacidade enxuta e operacional para escritorio pequeno com controle de fila.',
      tone: 'neutral',
    }
  }

  return {
    id: 'capacity',
    label: 'Capacidade',
    valueLabel: `${capacity} casos`,
    impact: 'Capacidade ampliada para absorver mais demanda sem bloquear novas entradas.',
    tone: 'positive',
  }
}

function resolveSlaFeedback(avgResponseMinutes?: string, responseWindowLabel?: string): OperationalFeedbackItem {
  const avgMinutes = parsePositiveInt(avgResponseMinutes)
  const responseWindow = (responseWindowLabel ?? '').trim()

  if (typeof avgMinutes !== 'number') {
    return {
      id: 'sla',
      label: 'SLA',
      valueLabel: responseWindow || 'Nao informado',
      impact: responseWindow
        ? 'Janela textual configurada sem media numerica de resposta; monitore consistencia operacional.'
        : 'Sem SLA numerico, a expectativa de retorno fica opaca para cliente e equipe.',
      tone: responseWindow ? 'neutral' : 'warning',
    }
  }

  if (avgMinutes >= 240) {
    return {
      id: 'sla',
      label: 'SLA',
      valueLabel: `${avgMinutes} min`,
      impact: 'Resposta lenta para primeiros retornos; risco de queda de conversao em casos urgentes.',
      tone: 'warning',
    }
  }

  if (avgMinutes <= 120) {
    return {
      id: 'sla',
      label: 'SLA',
      valueLabel: `${avgMinutes} min`,
      impact: 'Resposta rapida para triagem inicial, com boa previsibilidade de retorno.',
      tone: 'positive',
    }
  }

  return {
    id: 'sla',
    label: 'SLA',
    valueLabel: `${avgMinutes} min`,
    impact: 'Janela de resposta moderada; avalie ajuste se houver foco em urgencias.',
    tone: 'neutral',
  }
}

function resolveCoverageFeedback(servedCities?: string, legalAreas?: string): OperationalFeedbackItem {
  const cityCount = parseCsvCount(servedCities)
  const areaCount = parseCsvCount(legalAreas)

  if (cityCount === 0) {
    return {
      id: 'coverage',
      label: 'Cobertura',
      valueLabel: '0 cidades',
      impact: 'Sem cidade principal definida, a cobertura operacional fica indefinida para discovery.',
      tone: 'critical',
    }
  }

  if (cityCount === 1) {
    return {
      id: 'coverage',
      label: 'Cobertura',
      valueLabel: `${cityCount} cidade`,
      impact: areaCount > 0
        ? 'Cobertura local focalizada com especialidade definida para ativacao inicial.'
        : 'Cobertura local ativa; informe especialidade para melhorar aderencia de descoberta.',
      tone: 'neutral',
    }
  }

  if (cityCount <= 5) {
    return {
      id: 'coverage',
      label: 'Cobertura',
      valueLabel: `${cityCount} cidades`,
      impact: 'Cobertura regional expandida com potencial de aumento de entrada em multiplas praças.',
      tone: 'positive',
    }
  }

  return {
    id: 'coverage',
    label: 'Cobertura',
    valueLabel: `${cityCount} cidades`,
    impact: 'Cobertura multi-cidade ampla; garanta equipe e SLA compativeis com a expansao.',
    tone: 'warning',
  }
}

function resolvePriorityFeedback(priorityRules?: string, intakeCriteria?: string): OperationalFeedbackItem {
  const priority = (priorityRules ?? '').trim()
  const intake = (intakeCriteria ?? '').trim()

  if (hasUrgencyHighPriority(priority)) {
    return {
      id: 'priority',
      label: 'Prioridade',
      valueLabel: 'Urgencia alta',
      impact: 'Fila priorizada para urgencias altas conforme regra declarada.',
      tone: 'positive',
    }
  }

  if (priority.length > 0) {
    return {
      id: 'priority',
      label: 'Prioridade',
      valueLabel: 'Regra customizada',
      impact: 'Fila com prioridade customizada; valide alinhamento com capacidade e SLA.',
      tone: 'neutral',
    }
  }

  if (intake.length > 0) {
    return {
      id: 'priority',
      label: 'Prioridade',
      valueLabel: 'Sem regra explicita',
      impact: 'Intake ativo sem prioridade declarada; fila tende a seguir ordem de chegada.',
      tone: 'warning',
    }
  }

  return {
    id: 'priority',
    label: 'Prioridade',
    valueLabel: 'Nao configurada',
    impact: 'Sem intake e sem prioridade definidos, aumenta risco de configuracao cega da fila.',
    tone: 'critical',
  }
}

function resolveTeamFeedback(professionalReadiness?: ProfessionalReadinessSnapshot): OperationalFeedbackItem {
  if (!professionalReadiness?.isKnown) {
    return {
      id: 'team',
      label: 'Equipe',
      valueLabel: 'Em verificacao',
      impact: 'A leitura profissional ainda esta em atualizacao antes de confirmar a prontidao publica.',
      tone: 'warning',
    }
  }

  const teamCount = professionalReadiness.totalProfessionals
  const hasResponsible = professionalReadiness.hasResponsibleProfessional
  const hasOab = professionalReadiness.hasOabCredential

  if (teamCount === 0) {
    return {
      id: 'team',
      label: 'Equipe',
      valueLabel: 'Nao cadastrada',
      impact: 'Sem profissionais ativos, a operacao ainda nao sustenta atribuicao e confianca publica.',
      tone: 'warning',
    }
  }

  if (!hasResponsible) {
    return {
      id: 'team',
      label: 'Equipe',
      valueLabel: `${teamCount} profissional${teamCount === 1 ? '' : 'is'}`,
      impact: 'Existe equipe ativa, mas ainda falta definir quem responde publicamente pelo escritorio.',
      tone: 'warning',
    }
  }

  if (!hasOab) {
    return {
      id: 'team',
      label: 'Equipe',
      valueLabel: `${teamCount} profissional${teamCount === 1 ? '' : 'is'}`,
      impact: 'A equipe ativa ja existe, mas o perfil profissional ainda precisa informar OAB para sustentar confianca.',
      tone: 'warning',
    }
  }

  if (teamCount === 1) {
    return {
      id: 'team',
      label: 'Equipe',
      valueLabel: '1 profissional',
      impact: 'Profissional responsavel definido; a continuidade operacional ainda depende de disponibilidade individual.',
      tone: 'warning',
    }
  }

  if (teamCount <= 4) {
    return {
      id: 'team',
      label: 'Equipe',
      valueLabel: `${teamCount} profissionais`,
      impact: 'Equipe enxuta com possibilidade de distribuicao inicial de fila.',
      tone: 'neutral',
    }
  }

  return {
    id: 'team',
    label: 'Equipe',
    valueLabel: `${teamCount} profissionais`,
    impact: 'Equipe ampliada com melhor margem para cobertura e SLA em horarios estendidos.',
    tone: 'positive',
  }
}

function resolveIntakeFeedback(intakeCriteria?: string): OperationalFeedbackItem {
  const intake = (intakeCriteria ?? '').trim()

  if (!intake) {
    return {
      id: 'intake',
      label: 'Intake',
      valueLabel: 'Nao definido',
      impact: 'Sem criterio de intake, aumenta risco de entrada despadronizada de casos.',
      tone: 'warning',
    }
  }

  if (intake.length < 40) {
    return {
      id: 'intake',
      label: 'Intake',
      valueLabel: 'Basico',
      impact: 'Intake basico ativo; detalhe requisitos para reduzir triagem incompleta.',
      tone: 'neutral',
    }
  }

  return {
    id: 'intake',
    label: 'Intake',
    valueLabel: 'Estruturado',
    impact: 'Intake estruturado reduz retrabalho e melhora aderencia da triagem inicial.',
    tone: 'positive',
  }
}

function resolvePublicationFeedback(args: {
  heroMessage?: string
  intakeMessage?: string
  availabilityMessage?: string
  channels?: string[]
}): OperationalFeedbackItem {
  const messageCount = [args.heroMessage, args.intakeMessage, args.availabilityMessage]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0)
    .length
  const channelsCount = (args.channels ?? []).map((value) => value.trim()).filter((value) => value.length > 0).length

  if (messageCount === 0 && channelsCount === 0) {
    return {
      id: 'publication',
      label: 'Publicacao',
      valueLabel: 'Nao iniciada',
      impact: 'Sem mensagens e sem canais, nao ha base para leitura publica consistente.',
      tone: 'critical',
    }
  }

  if (messageCount < 3 || channelsCount === 0) {
    return {
      id: 'publication',
      label: 'Publicacao',
      valueLabel: 'Minima',
      impact: 'Publicacao operacional minima ativa; complete mensagens e canais para maturidade total.',
      tone: 'neutral',
    }
  }

  return {
    id: 'publication',
    label: 'Publicacao',
    valueLabel: 'Completa',
    impact: 'Mensagem publica consolidada com canais ativos e previsibilidade operacional.',
    tone: 'positive',
  }
}

export function buildOperationalFeedbackSnapshot(signals: OperationalFeedbackSignals): OperationalFeedbackSnapshot {
  const items: OperationalFeedbackItem[] = [
    resolveCapacityFeedback(signals.maxCapacity),
    resolveSlaFeedback(signals.avgResponseMinutes, signals.responseWindowLabel),
    resolveCoverageFeedback(signals.servedCities, signals.legalAreas),
    resolvePriorityFeedback(signals.priorityRules, signals.intakeCriteria),
    resolveTeamFeedback(signals.professionalReadiness),
    resolveIntakeFeedback(signals.intakeCriteria),
    resolvePublicationFeedback({
      heroMessage: signals.heroMessage,
      intakeMessage: signals.intakeMessage,
      availabilityMessage: signals.availabilityMessage,
      channels: signals.channels,
    }),
  ]

  const criticalCount = items.filter((item) => item.tone === 'critical').length
  const warningCount = items.filter((item) => item.tone === 'warning').length

  const summary = criticalCount > 0
    ? `Existem ${criticalCount} impacto(s) critico(s) com risco operacional imediato.`
    : warningCount > 0
      ? `Existem ${warningCount} impacto(s) de atencao antes de ampliar operacao.`
      : 'Configuracao operacional consistente com impacto monitorado em tempo real.'

  return {
    deterministic: true,
    summary,
    items,
  }
}
