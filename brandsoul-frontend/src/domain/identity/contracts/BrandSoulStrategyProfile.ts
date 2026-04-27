export type BrandSoulDominantStrategy = 'balanced' | 'support' | 'exploration' | 'conversion' | 'caution'

export type BrandSoulStrategyBias = {
  supportBias: number
  explorationBias: number
  conversionBias: number
  cautionBias: number
}

export type BrandSoulStrategyProfile = {
  strategyBias: BrandSoulStrategyBias
  dominantStrategy: BrandSoulDominantStrategy
  adaptationConfidence: number
  lastStrategyUpdateAt: string
}