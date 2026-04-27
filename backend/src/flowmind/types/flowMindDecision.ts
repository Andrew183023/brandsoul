export type FlowMindDecisionSource = 'heuristic-base' | 'adaptive-core'

export type FlowMindTerminalAuthority = 'heuristic-fallback' | 'adaptive-core'

export type FlowMindResponsePlan = {
  kind: string
  topic: string
  intentGoal?: string
  requiredData?: string[]
  constraints?: string[]
  optionalCloseStyle?: string
}

export type FlowMindDecision = {
  intent: string
  action: string
  confidence: number
  responsePlan: FlowMindResponsePlan
  statePatch?: Record<string, unknown>
  memoryCandidates?: unknown[]
  memoryInfluence?: unknown
  cognitiveStateInfluence?: unknown
  behaviorFeedbackInfluence?: unknown
  metadata?: Record<string, unknown>
}

export function clampFlowMindConfidence(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}