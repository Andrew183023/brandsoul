import type { RegionalSignalRecord } from './regionalSignalsRepository.js'

export type GrowthRecommendationPriority = 'critical' | 'high' | 'medium' | 'low'

export type GrowthRecommendation = {
  id: string
  city: string
  specialty: string
  priority: GrowthRecommendationPriority
  signalScore: number
  recommendedChannel?: string
  recommendedAudience?: string
  recommendedIntentStage?: string
  recommendedSearchIntent?: string
  recommendedRadiusKm?: number
  recommendedBudgetDaily: number
  reason: string
}

function getPriority(signalScore: number): GrowthRecommendationPriority {
  if (signalScore >= 300) {
    return 'critical'
  }
  if (signalScore >= 150) {
    return 'high'
  }
  if (signalScore >= 50) {
    return 'medium'
  }
  return 'low'
}

function getRecommendedBudgetDaily(priority: GrowthRecommendationPriority) {
  switch (priority) {
    case 'critical':
      return 100
    case 'high':
      return 50
    case 'medium':
      return 20
    case 'low':
    default:
      return 5
  }
}

function getReason(signal: RegionalSignalRecord) {
  if (signal.signalScore <= 1 && signal.leads === 0 && signal.cases === 0) {
    return 'Oportunidade inicial baseada em campanha configurada.'
  }
  if (signal.urgentLeads > 0) {
    return 'Há demanda urgente nesta região.'
  }
  if (signal.cases > 0) {
    return 'Já existem casos convertidos nesta oportunidade.'
  }
  if (signal.leads > 0) {
    return 'Já existem leads capturados para esta oportunidade.'
  }
  return 'Sinal regional identificado para expansão.'
}

function getPriorityWeight(priority: GrowthRecommendationPriority) {
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

export function buildGrowthRecommendations(signals: RegionalSignalRecord[]): GrowthRecommendation[] {
  return signals
    .map((signal) => {
      const priority = getPriority(signal.signalScore)
      return {
        id: signal.id,
        city: signal.city,
        specialty: signal.specialty,
        priority,
        signalScore: signal.signalScore,
        recommendedChannel: signal.bestChannel,
        recommendedAudience: signal.bestAudienceName,
        recommendedIntentStage: signal.bestIntentStage,
        recommendedSearchIntent: signal.bestSearchIntent,
        recommendedRadiusKm: signal.bestRecommendedRadiusKm,
        recommendedBudgetDaily: getRecommendedBudgetDaily(priority),
        reason: getReason(signal),
      }
    })
    .sort((left, right) => {
      const priorityDelta = getPriorityWeight(right.priority) - getPriorityWeight(left.priority)
      if (priorityDelta !== 0) {
        return priorityDelta
      }
      if (right.signalScore !== left.signalScore) {
        return right.signalScore - left.signalScore
      }
      const cityDelta = left.city.localeCompare(right.city, 'pt-BR')
      if (cityDelta !== 0) {
        return cityDelta
      }
      return left.specialty.localeCompare(right.specialty, 'pt-BR')
    })
}
