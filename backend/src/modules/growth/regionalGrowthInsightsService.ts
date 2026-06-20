import type { RegionalSignalRecord } from './regionalSignalsRepository.js'

export type GrowthInsightRankItem = {
  label: string
  score: number
}

export type GrowthInsights = {
  totalSignals: number
  totalVisits: number
  totalLeads: number
  totalCases: number
  totalUrgentLeads: number
  averageSignalScore: number
  leadToCaseRate: number
  topCities: GrowthInsightRankItem[]
  topSpecialties: GrowthInsightRankItem[]
  topChannels: GrowthInsightRankItem[]
  topAudiences: GrowthInsightRankItem[]
  topIntentStages: GrowthInsightRankItem[]
  topSearchIntents: GrowthInsightRankItem[]
  expansionScore: number
}

function rankBySignalScore(values: Map<string, number>) {
  return Array.from(values.entries())
    .map(([label, score]) => ({ label, score }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.label.localeCompare(right.label, 'pt-BR')
    })
}

function addScore(target: Map<string, number>, label: string | undefined, score: number) {
  const normalized = label?.trim()
  if (!normalized) {
    return
  }

  target.set(normalized, (target.get(normalized) ?? 0) + score)
}

export function buildGrowthInsights(signals: RegionalSignalRecord[]): GrowthInsights {
  const topCities = new Map<string, number>()
  const topSpecialties = new Map<string, number>()
  const topChannels = new Map<string, number>()
  const topAudiences = new Map<string, number>()
  const topIntentStages = new Map<string, number>()
  const topSearchIntents = new Map<string, number>()

  let totalVisits = 0
  let totalLeads = 0
  let totalCases = 0
  let totalUrgentLeads = 0
  let totalSignalScore = 0

  for (const signal of signals) {
    totalVisits += signal.visits
    totalLeads += signal.leads
    totalCases += signal.cases
    totalUrgentLeads += signal.urgentLeads
    totalSignalScore += signal.signalScore

    addScore(topCities, signal.city, signal.signalScore)
    addScore(topSpecialties, signal.specialty, signal.signalScore)
    addScore(topChannels, signal.bestChannel, signal.signalScore)
    addScore(topAudiences, signal.bestAudienceName, signal.signalScore)
    addScore(topIntentStages, signal.bestIntentStage, signal.signalScore)
    addScore(topSearchIntents, signal.bestSearchIntent, signal.signalScore)
  }

  return {
    totalSignals: signals.length,
    totalVisits,
    totalLeads,
    totalCases,
    totalUrgentLeads,
    averageSignalScore: signals.length > 0 ? totalSignalScore / signals.length : 0,
    leadToCaseRate: totalLeads > 0 ? totalCases / totalLeads : 0,
    topCities: rankBySignalScore(topCities),
    topSpecialties: rankBySignalScore(topSpecialties),
    topChannels: rankBySignalScore(topChannels),
    topAudiences: rankBySignalScore(topAudiences),
    topIntentStages: rankBySignalScore(topIntentStages),
    topSearchIntents: rankBySignalScore(topSearchIntents),
    expansionScore: totalSignalScore + (totalUrgentLeads * 25) + (totalCases * 50),
  }
}
