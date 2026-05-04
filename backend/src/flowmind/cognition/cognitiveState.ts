export type FlowMindCognitiveState = {
  stability: number
  adaptationMomentum: number
  engagement: number
}

export function createDefaultFlowMindCognitiveState(): FlowMindCognitiveState {
  return {
    stability: 0.5,
    adaptationMomentum: 0.32,
    engagement: 0.4,
  }
}