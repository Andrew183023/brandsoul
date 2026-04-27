import { clampFlowMindConfidence, type FlowMindDecision } from '../types/flowMindDecision.js'

export type CognitiveObjective = {
  type: 'sell' | 'engage' | 'educate' | 'convert'
  priority: number
  constraints?: unknown[]
}

const objectiveActionMap: Record<CognitiveObjective['type'], string> = {
  sell: 'sell',
  engage: 'guide',
  educate: 'inform',
  convert: 'sell',
}

export function applyCognitiveObjectiveToDecision(
  decision: FlowMindDecision,
  objective: CognitiveObjective | undefined,
): FlowMindDecision {
  if (!objective) {
    return decision
  }

  const preferredAction = objectiveActionMap[objective.type]
  const objectiveAligned = decision.action === preferredAction
  const confidenceBoost = objectiveAligned ? 0.04 * Math.min(objective.priority, 1) : 0

  return {
    ...decision,
    confidence: clampFlowMindConfidence(decision.confidence + confidenceBoost),
    metadata: {
      ...decision.metadata,
      cognitiveObjective: objective,
      objectiveAlignment: objectiveAligned ? 'aligned' : 'tracked',
      preferredObjectiveAction: preferredAction,
    },
  }
}