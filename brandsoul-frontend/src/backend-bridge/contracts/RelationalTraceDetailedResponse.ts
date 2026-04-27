import type { DashboardDeprecatedFallback } from './DashboardSparkStateResponse'

export type RelationalTraceDetailedGuardrail = {
  key: string
  label: string
  tone: 'neutral' | 'warning' | 'cooling'
}

export type RelationalTraceItemDetailed = {
  traceId: string
  eventId: string
  eventType: string
  occurredAt: string
  context?: {
    interactionType?: string
    topic?: string
    intent?: string
    actorId?: string
  }
  deltas: {
    binding?: number
    xp?: number
    continuity?: number
    returnCount?: number
    shareCount?: number
  }
  beforeAfter?: {
    binding?: [number, number]
    xp?: [number, number]
    continuity?: [number, number]
  }
  guardrails?: {
    capApplied?: boolean
    decayApplied?: boolean
    spamMitigated?: boolean
    coalescingApplied?: boolean
    items: RelationalTraceDetailedGuardrail[]
  }
  lineage?: {
    commandId?: string
    decisionTraceId?: string
    actionType?: string
  }
  summary?: string
  interpretiveExplanation?: string
}

export type RelationalTraceDetailedResponse = {
  entityId: string
  items: RelationalTraceItemDetailed[]
  deprecatedFallbacks: DashboardDeprecatedFallback[]
}