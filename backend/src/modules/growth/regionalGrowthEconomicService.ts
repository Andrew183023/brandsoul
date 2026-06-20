import type { BackendDatabase } from '../../db/index.js'
import { createEconomicMemoryRepository } from '../../persistence/economic/economicMemoryRepository.js'

export type GrowthEconomicSummary = {
  totalAttributedRevenue: number
  averageConversionRate: number
  totalEconomicMemories: number
  totalOpportunities: number
  topRevenueCategory?: string
  topRevenueSignal?: string
  averageOpportunityScore: number
}

type BuildGrowthEconomicSummaryParams = {
  db: BackendDatabase
  entityId: string
}

type OpportunitySummaryRow = {
  total_opportunities: number
  average_opportunity_score: number | null
}

function buildZeroSummary(): GrowthEconomicSummary {
  return {
    totalAttributedRevenue: 0,
    averageConversionRate: 0,
    totalEconomicMemories: 0,
    totalOpportunities: 0,
    averageOpportunityScore: 0,
  }
}

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('no such table')
    || message.includes('does not exist')
    || message.includes('undefined table')
    || message.includes('relation')
}

export async function buildGrowthEconomicSummary(
  params: BuildGrowthEconomicSummaryParams,
): Promise<GrowthEconomicSummary> {
  try {
    const economicRepository = createEconomicMemoryRepository(params.db)
    const allEntityMemory = await economicRepository.listEconomicMemoryByScope('entity', 2000)
    const relevantMemory = allEntityMemory.filter((record) => record.entityId === params.entityId)

    const totalAttributedRevenue = relevantMemory.reduce((sum, record) => sum + record.totalRevenue, 0)
    const totalSampleCount = relevantMemory.reduce((sum, record) => sum + record.sampleCount, 0)
    const weightedConversion = relevantMemory.reduce((sum, record) => sum + (record.averageConversion * record.sampleCount), 0)
    const averageConversionRate = totalSampleCount > 0 ? weightedConversion / totalSampleCount : 0

    let topRevenueCategory: string | undefined
    let topRevenueCategoryValue = -1
    let topRevenueSignal: string | undefined
    let topRevenueSignalValue = -1

    const revenueByCategory = new Map<string, number>()
    const revenueBySignal = new Map<string, number>()

    for (const record of relevantMemory) {
      revenueByCategory.set(record.category, (revenueByCategory.get(record.category) ?? 0) + record.totalRevenue)
      revenueBySignal.set(record.signalKeyword, (revenueBySignal.get(record.signalKeyword) ?? 0) + record.totalRevenue)
    }

    for (const [category, totalRevenue] of revenueByCategory.entries()) {
      if (totalRevenue > topRevenueCategoryValue) {
        topRevenueCategoryValue = totalRevenue
        topRevenueCategory = category
      }
    }

    for (const [signalKeyword, totalRevenue] of revenueBySignal.entries()) {
      if (totalRevenue > topRevenueSignalValue) {
        topRevenueSignalValue = totalRevenue
        topRevenueSignal = signalKeyword
      }
    }

    let totalOpportunities = 0
    let averageOpportunityScore = 0

    try {
      const opportunitySummary = await params.db.get<OpportunitySummaryRow>(
        `
          SELECT
            COUNT(*) AS total_opportunities,
            AVG(opportunity_score) AS average_opportunity_score
          FROM flowmind_opportunities
          WHERE top_entity_id = ?
        `,
        params.entityId,
      )

      totalOpportunities = Number(opportunitySummary?.total_opportunities ?? 0)
      averageOpportunityScore = Number(opportunitySummary?.average_opportunity_score ?? 0)
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error
      }
    }

    return {
      totalAttributedRevenue,
      averageConversionRate,
      totalEconomicMemories: relevantMemory.length,
      totalOpportunities,
      topRevenueCategory,
      topRevenueSignal,
      averageOpportunityScore,
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return buildZeroSummary()
    }

    return buildZeroSummary()
  }
}
