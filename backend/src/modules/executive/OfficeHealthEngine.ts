import type { GrowthSummary } from '../legalGrowth/GrowthSummary.js'
import type { OperationalSnapshot } from '../legalSignals/OperationalSnapshot.js'

import type { OfficeHealth, OfficeHealthDriver, OfficeHealthEngineInput } from './OfficeHealthTypes.js'

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function resolveLevel(score: number): OfficeHealth['level'] {
  if (score >= 90) {
    return 'excellent'
  }
  if (score >= 80) {
    return 'good'
  }
  if (score >= 60) {
    return 'attention'
  }
  return 'critical'
}

function createDriver(driver: OfficeHealthDriver): OfficeHealthDriver {
  return { ...driver }
}

function driverScoreImpact(driver: OfficeHealthDriver) {
  switch (driver.impact) {
    case 'positive':
      return driver.weight
    case 'negative':
      return -driver.weight
    case 'neutral':
    default:
      return 0
  }
}

function buildGrowthDrivers(summary: GrowthSummary): OfficeHealthDriver[] {
  const drivers: OfficeHealthDriver[] = []

  if (summary.averageGrowthScore === null) {
    drivers.push(createDriver({
      key: 'growth_score_unavailable',
      title: 'Crescimento sem histórico consolidado',
      impact: 'neutral',
      weight: 0,
      summary: 'O score médio de crescimento ainda não possui base suficiente para influenciar a saúde do escritório.',
    }))
  } else if (summary.averageGrowthScore >= 80) {
    drivers.push(createDriver({
      key: 'growth_score_strong',
      title: 'Crescimento consistente',
      impact: 'positive',
      weight: 12,
      summary: 'O score médio de crescimento permanece alto e sustenta uma leitura favorável do escritório.',
    }))
  } else if (summary.averageGrowthScore >= 60) {
    drivers.push(createDriver({
      key: 'growth_score_stable',
      title: 'Crescimento estável',
      impact: 'positive',
      weight: 6,
      summary: 'O score médio de crescimento segue estável, com espaço para melhorar a execução comercial.',
    }))
  } else {
    drivers.push(createDriver({
      key: 'growth_score_low',
      title: 'Crescimento abaixo do ideal',
      impact: 'negative',
      weight: 12,
      summary: 'O score médio de crescimento está abaixo do ideal e reduz a margem de expansão do escritório.',
    }))
  }

  if (summary.criticalRecommendations > 0) {
    drivers.push(createDriver({
      key: 'critical_recommendations',
      title: 'Recomendações críticas em aberto',
      impact: 'negative',
      weight: Math.min(16, 8 + (summary.criticalRecommendations * 2)),
      summary: `Existem ${summary.criticalRecommendations} recomendações críticas exigindo atenção imediata.`,
    }))
  }

  if (summary.expansionOpportunities > 0) {
    drivers.push(createDriver({
      key: 'expansion_opportunities',
      title: 'Oportunidades de expansão identificadas',
      impact: 'positive',
      weight: Math.min(8, 4 + summary.expansionOpportunities),
      summary: `Foram identificadas ${summary.expansionOpportunities} oportunidades concretas de expansão com base na inteligência atual.`,
    }))
  }

  if (summary.totalCoverageGaps > 0) {
    drivers.push(createDriver({
      key: 'coverage_gaps',
      title: 'Cobertura regional incompleta',
      impact: 'negative',
      weight: Math.min(12, 4 + (summary.totalCoverageGaps * 2)),
      summary: `Existem ${summary.totalCoverageGaps} lacunas de cobertura regional ou por especialidade que merecem acompanhamento.`,
    }))
  }

  return drivers
}

function buildOperationalDrivers(snapshot: OperationalSnapshot): OfficeHealthDriver[] {
  const drivers: OfficeHealthDriver[] = []
  const overloadedThreshold = snapshot.activeProfessionals > 0
    ? snapshot.activeProfessionals * 4
    : 0
  const attentionThreshold = snapshot.activeProfessionals > 0
    ? snapshot.activeProfessionals * 7
    : 0

  if (snapshot.slaBreachedCases > 0) {
    drivers.push(createDriver({
      key: 'sla_breaches',
      title: 'SLA vencido em andamento',
      impact: 'negative',
      weight: Math.min(20, 12 + (snapshot.slaBreachedCases * 3)),
      summary: `Há ${snapshot.slaBreachedCases} casos com SLA vencido, o que pressiona diretamente a saúde operacional.`,
    }))
  } else if (snapshot.slaWarningCases > 0) {
    drivers.push(createDriver({
      key: 'sla_warnings',
      title: 'SLA em zona de atenção',
      impact: 'negative',
      weight: Math.min(10, 4 + (snapshot.slaWarningCases * 2)),
      summary: `Existem ${snapshot.slaWarningCases} casos em alerta de SLA que exigem monitoramento próximo.`,
    }))
  } else {
    drivers.push(createDriver({
      key: 'sla_healthy',
      title: 'SLA sob controle',
      impact: 'positive',
      weight: 10,
      summary: 'Não existem sinais críticos de SLA neste momento.',
    }))
  }

  if (snapshot.activeProfessionals === 0 && snapshot.openCases > 0) {
    drivers.push(createDriver({
      key: 'no_active_professionals',
      title: 'Sem profissionais ativos para a carga atual',
      impact: 'negative',
      weight: 18,
      summary: 'O escritório possui casos abertos, mas não apresenta capacidade profissional ativa suficiente.',
    }))
  } else if (snapshot.backlog <= overloadedThreshold) {
    drivers.push(createDriver({
      key: 'backlog_healthy',
      title: 'Backlog saudável',
      impact: 'positive',
      weight: 8,
      summary: 'O backlog permanece compatível com a capacidade operacional atualmente ativa.',
    }))
  } else if (snapshot.backlog <= attentionThreshold) {
    drivers.push(createDriver({
      key: 'backlog_attention',
      title: 'Backlog em observação',
      impact: 'neutral',
      weight: 0,
      summary: 'O backlog ainda é administrável, mas já exige atenção para evitar sobrecarga futura.',
    }))
  } else {
    drivers.push(createDriver({
      key: 'backlog_pressure',
      title: 'Backlog pressionado',
      impact: 'negative',
      weight: 12,
      summary: 'O volume de backlog está acima do patamar confortável para a capacidade atual do escritório.',
    }))
  }

  if (snapshot.activeProfessionals > 0 && snapshot.openCases <= snapshot.activeProfessionals * 3) {
    drivers.push(createDriver({
      key: 'capacity_adequate',
      title: 'Capacidade operacional adequada',
      impact: 'positive',
      weight: 8,
      summary: 'A distribuição atual de casos indica boa capacidade operacional do escritório.',
    }))
  } else if (snapshot.activeProfessionals > 0 && snapshot.openCases <= snapshot.activeProfessionals * 5) {
    drivers.push(createDriver({
      key: 'capacity_stable',
      title: 'Capacidade estável',
      impact: 'neutral',
      weight: 0,
      summary: 'A capacidade segue estável, mas há pouco espaço para absorver novas pressões sem ajustes.',
    }))
  } else if (snapshot.openCases > 0) {
    drivers.push(createDriver({
      key: 'capacity_stressed',
      title: 'Capacidade pressionada',
      impact: 'negative',
      weight: 10,
      summary: 'A quantidade de casos abertos pressiona a capacidade operacional disponível.',
    }))
  }

  return drivers
}

function buildExplanation(level: OfficeHealth['level'], positives: OfficeHealthDriver[], warnings: OfficeHealthDriver[], opportunities: OfficeHealthDriver[]) {
  const opening = (() => {
    switch (level) {
      case 'excellent':
        return 'O escritório apresenta saúde executiva excelente.'
      case 'good':
        return 'O escritório apresenta boa saúde executiva.'
      case 'attention':
        return 'O escritório opera com saúde executiva em atenção.'
      case 'critical':
      default:
        return 'O escritório apresenta sinais críticos de saúde executiva.'
    }
  })()

  const positiveSummary = positives.length > 0
    ? `Pontos positivos: ${positives.slice(0, 2).map((driver) => driver.summary).join(' ')}`
    : 'Não há vetores positivos relevantes consolidados neste momento.'
  const warningSummary = warnings.length > 0
    ? `Pontos de atenção: ${warnings.slice(0, 2).map((driver) => driver.summary).join(' ')}`
    : 'Não existem alertas executivos relevantes no momento.'
  const opportunitySummary = opportunities.length > 0
    ? `Oportunidades: ${opportunities.slice(0, 1).map((driver) => driver.summary).join(' ')}`
    : 'Não há oportunidades executivas destacadas nesta leitura.'

  return `${opening} ${positiveSummary} ${warningSummary} ${opportunitySummary}`.trim()
}

export class OfficeHealthEngine {
  build(input: OfficeHealthEngineInput): OfficeHealth {
    const growthDrivers = buildGrowthDrivers(input.growth.summary)
    const operationalDrivers = buildOperationalDrivers(input.operational.snapshot)
    const drivers = [...growthDrivers, ...operationalDrivers]
    const score = clampScore(
      70 + drivers.reduce((total, driver) => total + driverScoreImpact(driver), 0),
    )
    const level = resolveLevel(score)
    const positives = drivers.filter((driver) => driver.impact === 'positive')
    const warnings = drivers.filter((driver) => driver.impact === 'negative')
    const opportunities = growthDrivers.filter((driver) =>
      driver.key === 'expansion_opportunities' || driver.key === 'growth_score_strong',
    )

    return {
      score,
      level,
      explanation: buildExplanation(level, positives, warnings, opportunities),
      positives,
      warnings,
      opportunities,
      drivers,
    }
  }
}

export function createOfficeHealthEngine() {
  return new OfficeHealthEngine()
}
