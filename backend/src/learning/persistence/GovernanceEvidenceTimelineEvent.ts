import { createHash } from 'node:crypto'

import type { AdaptiveEquilibriumGovernanceClassification } from './AdaptiveEquilibriumEvidenceEvent.js'

export type GovernanceTimelineEventType =
  | 'classification_transition'
  | 'recommendation_evolution'
  | 'replay_collapse'
  | 'instability_spike'
  | 'saturation_spike'
  | 'reinforcement_escalation'
  | 'equilibrium_degradation'
  | 'replay_degradation_evolution'
  | 'evidence_milestone'
  | 'override_activation'

export type GovernanceTimelineSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type GovernanceTimelineLongitudinalWindow = 'short' | 'medium' | 'long'

export type GovernanceEvidenceTimelineEvent = {
  eventId: string
  eventType: GovernanceTimelineEventType
  timestamp: string
  classification: AdaptiveEquilibriumGovernanceClassification
  recommendation: 'do_not_rollout'
  severity: GovernanceTimelineSeverity
  triggerFactors: string[]
  replayFingerprint: string
  longitudinalWindow: GovernanceTimelineLongitudinalWindow
  sourceEvidenceId: string
}

export type AppendGovernanceEvidenceTimelineEventInput = Omit<GovernanceEvidenceTimelineEvent, 'eventId'> & {
  eventId?: string
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

export function buildGovernanceEvidenceTimelineEventId(input: Omit<AppendGovernanceEvidenceTimelineEventInput, 'eventId'>) {
  const digest = createHash('sha256')
    .update(stableStringify({
      eventType: input.eventType,
      timestamp: input.timestamp,
      classification: input.classification,
      recommendation: input.recommendation,
      severity: input.severity,
      triggerFactors: [...input.triggerFactors].sort((left, right) => left.localeCompare(right)),
      replayFingerprint: input.replayFingerprint,
      longitudinalWindow: input.longitudinalWindow,
      sourceEvidenceId: input.sourceEvidenceId,
    }))
    .digest('hex')
    .slice(0, 36)

  return `governance-evidence-timeline:${digest}`
}
