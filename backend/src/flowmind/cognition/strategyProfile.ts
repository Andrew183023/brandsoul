export type FlowMindStrategyProfile = {
  dominantStrategy: string
  adaptationConfidence: number
  strategyBias: {
    supportBias: number
    explorationBias: number
    conversionBias: number
    cautionBias: number
  }
}

export function createDefaultFlowMindStrategyProfile(): FlowMindStrategyProfile {
  return {
    dominantStrategy: 'balanced-guidance',
    adaptationConfidence: 0.34,
    strategyBias: {
      supportBias: 0.5,
      explorationBias: 0.4,
      conversionBias: 0.36,
      cautionBias: 0.48,
    },
  }
}