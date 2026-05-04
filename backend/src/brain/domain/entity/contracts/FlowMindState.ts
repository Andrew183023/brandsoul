import type { EntityAction } from './EntityAction.js'
import type { EntityIntent } from './EntityIntent.js'

export type FlowMindDecisionState = {
  schemaVersion: 1
  entityId: string
  awarenessLevel: number
  contextConfidence: number
  decisionConfidence: number
  lastDecisionAt?: string
  activeIntent?: string
  state: 'idle' | 'thinking' | 'acting'
}

export type FlowMindDecisionTrace = Record<string, unknown>

export type FlowMindDecisionOutput = {
  state: FlowMindDecisionState
  context: Record<string, unknown>
  entityIntent: EntityIntent
  entityAction: EntityAction
  intent: string
  confidence: number
  reason: string
  upgradeSignal?: Record<string, unknown>
  trace: FlowMindDecisionTrace
}