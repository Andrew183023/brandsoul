import type { RegionalGrowthRepository } from './regionalGrowthRepository.js'

export type PopulationDensity = 'small' | 'medium' | 'large'

export type RadiusRecommendation = {
  specialty: string
  populationDensity: PopulationDensity
  recommendedRadiusKm: number
  usedFallback: boolean
}

export type RecommendRadiusInput = {
  specialty: string
  populationDensity: PopulationDensity
}

const fallbackRadiusByPopulationDensity: Record<PopulationDensity, number> = {
  large: 40,
  medium: 60,
  small: 80,
}

export async function recommendRadiusForSpecialty(
  repository: Pick<RegionalGrowthRepository, 'recommendRadius'>,
  input: RecommendRadiusInput,
): Promise<RadiusRecommendation> {
  const specialty = input.specialty.trim()
  const recommendation = await repository.recommendRadius(specialty, input.populationDensity)

  if (recommendation) {
    return {
      specialty: recommendation.specialty,
      populationDensity: recommendation.populationDensity,
      recommendedRadiusKm: recommendation.recommendedRadiusKm,
      usedFallback: false,
    }
  }

  return {
    specialty,
    populationDensity: input.populationDensity,
    recommendedRadiusKm: fallbackRadiusByPopulationDensity[input.populationDensity],
    usedFallback: true,
  }
}
