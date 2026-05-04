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

export type FlowMindMemoryReadRef = {
  scope: 'entity'
  entityId: string
  segments: Array<'episodic' | 'policy' | 'strategy' | 'adaptive' | 'historical' | 'cognitive'>
  version: string
}

export type FlowMindMemoryWriteOperation = {
  op: 'replace_memory'
  entityId: string
  nextMemory: Record<string, unknown>
}

export type FlowMindExpectedStateChange = {
  target: 'memory'
  entityId: string
  change: 'replace_memory'
}

export type FlowMindDecisionV2 = {
  intent: string
  action: string
  confidence: number
  decisionHash: string
  responsePlan: FlowMindResponsePlan
  actionPayload: Record<string, unknown>
  memoryReadSet: FlowMindMemoryReadRef[]
  memoryWritePlan: FlowMindMemoryWriteOperation[]
  expectedStateChanges: FlowMindExpectedStateChange[]
  statePatch?: Record<string, unknown>
  memoryCandidates?: unknown[]
  memoryInfluence?: unknown
  cognitiveStateInfluence?: unknown
  behaviorFeedbackInfluence?: unknown
  metadata?: Record<string, unknown>
}

export type FlowMindDecisionSeed = {
  intent: string
  action: string
  confidence: number
  responsePlan: FlowMindResponsePlan
  actionPayload?: Record<string, unknown>
  memoryReadSet?: FlowMindMemoryReadRef[]
  memoryWritePlan?: FlowMindMemoryWriteOperation[]
  expectedStateChanges?: FlowMindExpectedStateChange[]
  decisionHash?: string
  statePatch?: Record<string, unknown>
  memoryCandidates?: unknown[]
  memoryInfluence?: unknown
  cognitiveStateInfluence?: unknown
  behaviorFeedbackInfluence?: unknown
  metadata?: Record<string, unknown>
}

export type FlowMindDecision = FlowMindDecisionV2

export function clampFlowMindConfidence(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}
