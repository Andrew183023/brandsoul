import type {
  ExecutiveExplainOfficeHealthInput,
  ExecutiveExplainOpportunityInput,
  ExecutiveExplainRecommendationInput,
  ExecutiveExplanation,
  ExecutiveExplanationEvidence,
} from './ExecutiveExplainabilityTypes.js'

function normalizeText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function humanizePriority(priority: string | undefined) {
  switch (priority) {
    case 'critical':
      return 'prioridade critica'
    case 'high':
      return 'prioridade alta'
    case 'medium':
      return 'prioridade media'
    case 'low':
      return 'prioridade baixa'
    default:
      return 'prioridade nao informada'
  }
}

function levelLabel(level: ExecutiveExplainOfficeHealthInput['level']) {
  switch (level) {
    case 'excellent':
      return 'excelente'
    case 'good':
      return 'boa'
    case 'attention':
      return 'em atencao'
    case 'critical':
    default:
      return 'critica'
  }
}

function buildEvidenceFromReasons(reasons: string[]): ExecutiveExplanationEvidence[] {
  return reasons.map((reason, index) => ({
    key: `reason_${index + 1}`,
    label: `Razao ${index + 1}`,
    summary: reason,
  }))
}

export class ExecutiveExplainabilityLayer {
  explainOfficeHealth(input: ExecutiveExplainOfficeHealthInput): ExecutiveExplanation {
    const positiveDrivers = input.drivers.filter((driver) => driver.impact === 'positive')
    const negativeDrivers = input.drivers.filter((driver) => driver.impact === 'negative')
    const neutralDrivers = input.drivers.filter((driver) => driver.impact === 'neutral')
    const reasons = [
      ...positiveDrivers.map((driver) => driver.summary),
      ...negativeDrivers.map((driver) => driver.summary),
      ...neutralDrivers.map((driver) => driver.summary),
    ]
    const evidence: ExecutiveExplanationEvidence[] = input.drivers.map((driver) => ({
      key: driver.key,
      label: driver.title,
      value: driver.weight,
      impact: driver.impact,
      summary: driver.summary,
    }))

    const positiveSummary = positiveDrivers.length > 0
      ? positiveDrivers.slice(0, 2).map((driver) => driver.summary).join(' ')
      : 'Nao ha vetores positivos relevantes consolidados neste momento.'
    const warningSummary = negativeDrivers.length > 0
      ? negativeDrivers.slice(0, 2).map((driver) => driver.summary).join(' ')
      : 'Nao existem sinais criticos imediatos na leitura executiva atual.'

    return {
      subject: 'office_health',
      title: `Saude do escritorio ${levelLabel(input.level)}`,
      summary: `O escritorio apresenta saude executiva ${levelLabel(input.level)} com score ${input.score}. ${positiveSummary} ${warningSummary}`.trim(),
      reasons,
      evidence,
    }
  }

  explainRecommendation(input: ExecutiveExplainRecommendationInput): ExecutiveExplanation {
    const title = normalizeText(input.title, 'Recomendacao executiva')
    const description = normalizeText(
      input.description,
      'A recomendacao foi mantida porque os sinais atuais ainda justificam acompanhamento executivo.',
    )
    const expectedImpact = normalizeText(
      input.expectedImpact,
      'O impacto esperado ainda depende de validacao executiva.',
    )
    const priority = humanizePriority(input.priority)
    const reasons = [
      description,
      `A recomendacao foi classificada com ${priority}.`,
      `Impacto esperado: ${expectedImpact}.`,
      ...(input.evidence ?? []).map((item) => `Evidencia considerada: ${item}.`),
    ]

    return {
      subject: 'recommendation',
      title,
      summary: `${title}. ${description} ${expectedImpact}.`.trim(),
      reasons,
      evidence: (input.evidence?.length ?? 0) > 0
        ? input.evidence!.map((item, index) => ({
          key: `${input.id}_evidence_${index + 1}`,
          label: `Evidencia ${index + 1}`,
          summary: item,
        }))
        : buildEvidenceFromReasons([description, expectedImpact]),
    }
  }

  explainOpportunity(input: ExecutiveExplainOpportunityInput): ExecutiveExplanation {
    const title = normalizeText(input.title, 'Oportunidade executiva')
    const region = normalizeText(input.region, 'regiao nao informada')
    const specialty = normalizeText(input.specialty, 'especialidade nao informada')
    const expectedImpact = normalizeText(
      input.expectedImpact,
      'O impacto potencial ainda depende de validacao adicional.',
    )
    const priority = humanizePriority(input.priority)
    const reasons = [
      `A oportunidade se concentra em ${region}.`,
      `Especialidade associada: ${specialty}.`,
      `Classificacao executiva: ${priority}.`,
      `Impacto esperado: ${expectedImpact}.`,
      ...(input.evidence ?? []).map((item) => `Evidencia considerada: ${item}.`),
    ]

    return {
      subject: 'opportunity',
      title,
      summary: `${title}. A oportunidade esta associada a ${region} e ${specialty}. ${expectedImpact}.`.trim(),
      reasons,
      evidence: [
        {
          key: `${input.id}_region`,
          label: 'Regiao',
          value: region,
          summary: `A oportunidade foi associada a ${region}.`,
        },
        {
          key: `${input.id}_specialty`,
          label: 'Especialidade',
          value: specialty,
          summary: `A oportunidade considera ${specialty} como foco principal.`,
        },
        ...((input.evidence ?? []).map((item, index) => ({
          key: `${input.id}_evidence_${index + 1}`,
          label: `Evidencia ${index + 1}`,
          summary: item,
        }))),
      ],
    }
  }
}

export function createExecutiveExplainabilityLayer() {
  return new ExecutiveExplainabilityLayer()
}
