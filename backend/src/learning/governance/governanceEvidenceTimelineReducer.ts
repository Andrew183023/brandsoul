import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import type {
  GovernanceEvidenceTimelineEvent,
  GovernanceTimelineSeverity,
} from '../persistence/GovernanceEvidenceTimelineEvent.js'

type GovernanceEvidenceTimelineReducerInput = {
  current: AdaptiveEquilibriumEvidenceEvent
  previous: AdaptiveEquilibriumEvidenceEvent | null
  eventSequence: number
  context: {
    replayCollapseDetected: boolean
    replayCollapseSignals: string[]
    instabilityRiskClassification: 'safe' | 'caution' | 'unsafe'
    saturationRatio: number
    reinforcementLoopIntensity: number
    equilibriumScore: number
  }
}

type GovernanceEvidenceHistoryReducersInput = {
  events: GovernanceEvidenceTimelineEvent[]
}

export type GovernanceEvidenceHistoryReducers = {
  transitions: {
    totalTransitions: number
    safeToCaution: number
    cautionToUnsafe: number
    unsafeToCaution: number
    cautionToSafe: number
    unsafeToSafe: number
    safeToUnsafe: number
  }
  recommendationEvolution: {
    sequence: Array<{
      timestamp: string
      recommendation: 'do_not_rollout'
      classification: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
    }>
  }
  milestones: {
    totalMilestones: number
    latestMilestoneAt: string | null
    milestoneEventIds: string[]
  }
  eventTypeTotals: Record<GovernanceEvidenceTimelineEvent['eventType'], number>
}

function clampMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(6))))
}

function classifyTransitionSeverity(args: {
  previous: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
  current: AdaptiveEquilibriumEvidenceEvent['governanceClassification']
}): GovernanceTimelineSeverity {
  if (args.previous === args.current) {
    return 'LOW'
  }

  if (args.previous === 'SAFE' && args.current === 'UNSAFE') {
    return 'CRITICAL'
  }

  if (args.previous === 'UNSAFE' && args.current === 'SAFE') {
    return 'MEDIUM'
  }

  if (args.current === 'UNSAFE') {
    return 'HIGH'
  }

  return 'MEDIUM'
}

function pushEvent(args: {
  events: Omit<GovernanceEvidenceTimelineEvent, 'eventId'>[]
  input: Omit<GovernanceEvidenceTimelineEvent, 'eventId'>
}) {
  args.events.push({
    ...args.input,
    triggerFactors: [...new Set(args.input.triggerFactors)].sort((left, right) => left.localeCompare(right)),
  })
}

function classificationTransitionCode(previous: string, current: string) {
  return `${previous.toLowerCase()}_to_${current.toLowerCase()}`
}

export function reduceGovernanceEvidenceTimelineEvents(input: GovernanceEvidenceTimelineReducerInput) {
  const events: Array<Omit<GovernanceEvidenceTimelineEvent, 'eventId'>> = []
  const current = input.current
  const previous = input.previous

  const base = {
    timestamp: current.generatedAt,
    classification: current.governanceClassification,
    recommendation: current.recommendation,
    replayFingerprint: current.replayFingerprint,
    sourceEvidenceId: current.evidenceId,
  } as const

  if (!previous) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'evidence_milestone',
        severity: 'LOW',
        triggerFactors: ['initial_governance_timeline_event'],
        longitudinalWindow: 'long',
      },
    })
  }

  if (previous && previous.governanceClassification !== current.governanceClassification) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'classification_transition',
        severity: classifyTransitionSeverity({
          previous: previous.governanceClassification,
          current: current.governanceClassification,
        }),
        triggerFactors: [
          'classification_changed',
          classificationTransitionCode(previous.governanceClassification, current.governanceClassification),
        ],
        longitudinalWindow: 'long',
      },
    })
  }

  if (previous && previous.recommendation !== current.recommendation) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'recommendation_evolution',
        severity: 'MEDIUM',
        triggerFactors: ['recommendation_changed'],
        longitudinalWindow: 'medium',
      },
    })
  }

  if (input.context.replayCollapseDetected) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'replay_collapse',
        severity: 'CRITICAL',
        triggerFactors: input.context.replayCollapseSignals.length > 0
          ? input.context.replayCollapseSignals
          : ['replay_collapse_detected'],
        longitudinalWindow: 'short',
      },
    })
  }

  if (input.context.instabilityRiskClassification !== 'safe') {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'instability_spike',
        severity: input.context.instabilityRiskClassification === 'unsafe' ? 'CRITICAL' : 'HIGH',
        triggerFactors: [
          'instability_risk_spike',
          `instability_${input.context.instabilityRiskClassification}`,
        ],
        longitudinalWindow: 'short',
      },
    })
  }

  if (clampMetric(input.context.saturationRatio) >= 0.3) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'saturation_spike',
        severity: input.context.saturationRatio >= 0.5 ? 'HIGH' : 'MEDIUM',
        triggerFactors: ['saturation_persistence_spike'],
        longitudinalWindow: 'medium',
      },
    })
  }

  if (clampMetric(input.context.reinforcementLoopIntensity) >= 0.35) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'reinforcement_escalation',
        severity: input.context.reinforcementLoopIntensity >= 0.55 ? 'HIGH' : 'MEDIUM',
        triggerFactors: ['reinforcement_loop_escalation'],
        longitudinalWindow: 'medium',
      },
    })
  }

  if (clampMetric(input.context.equilibriumScore) < 0.7) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'equilibrium_degradation',
        severity: input.context.equilibriumScore < 0.55 ? 'HIGH' : 'MEDIUM',
        triggerFactors: ['equilibrium_score_degrading'],
        longitudinalWindow: 'long',
      },
    })
  }

  if (
    previous
    && clampMetric(current.replayDegradationPersistence) > clampMetric(previous.replayDegradationPersistence) + 0.03
  ) {
    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'replay_degradation_evolution',
        severity: current.replayDegradationPersistence >= 0.35 ? 'HIGH' : 'MEDIUM',
        triggerFactors: ['replay_degradation_increasing'],
        longitudinalWindow: 'long',
      },
    })
  }

  if (current.sustainedEquilibriumEvidence || input.eventSequence % 25 === 0) {
    const triggerFactors = current.sustainedEquilibriumEvidence
      ? ['sustained_equilibrium_evidence_reached']
      : ['periodic_governance_milestone']

    pushEvent({
      events,
      input: {
        ...base,
        eventType: 'evidence_milestone',
        severity: current.sustainedEquilibriumEvidence ? 'LOW' : 'MEDIUM',
        triggerFactors,
        longitudinalWindow: 'long',
      },
    })
  }

  return events
}

function buildEmptyTypeTotals(): Record<GovernanceEvidenceTimelineEvent['eventType'], number> {
  return {
    classification_transition: 0,
    recommendation_evolution: 0,
    replay_collapse: 0,
    instability_spike: 0,
    saturation_spike: 0,
    reinforcement_escalation: 0,
    equilibrium_degradation: 0,
    replay_degradation_evolution: 0,
    evidence_milestone: 0,
    override_activation: 0,
  }
}

export function reduceGovernanceEvidenceHistory(input: GovernanceEvidenceHistoryReducersInput): GovernanceEvidenceHistoryReducers {
  const sorted = [...input.events].sort((left, right) => {
    const byTime = left.timestamp.localeCompare(right.timestamp)
    if (byTime !== 0) {
      return byTime
    }

    return left.eventId.localeCompare(right.eventId)
  })

  const transitions = {
    totalTransitions: 0,
    safeToCaution: 0,
    cautionToUnsafe: 0,
    unsafeToCaution: 0,
    cautionToSafe: 0,
    unsafeToSafe: 0,
    safeToUnsafe: 0,
  }

  for (const event of sorted) {
    if (event.eventType !== 'classification_transition') {
      continue
    }

    transitions.totalTransitions += 1
    const triggerFactors = new Set(event.triggerFactors)
    if (triggerFactors.has('safe_to_caution')) {
      transitions.safeToCaution += 1
    }
    if (triggerFactors.has('caution_to_unsafe')) {
      transitions.cautionToUnsafe += 1
    }
    if (triggerFactors.has('unsafe_to_caution')) {
      transitions.unsafeToCaution += 1
    }
    if (triggerFactors.has('caution_to_safe')) {
      transitions.cautionToSafe += 1
    }
    if (triggerFactors.has('unsafe_to_safe')) {
      transitions.unsafeToSafe += 1
    }
    if (triggerFactors.has('safe_to_unsafe')) {
      transitions.safeToUnsafe += 1
    }
  }

  const recommendationEvolution = sorted
    .filter((event) => event.eventType === 'recommendation_evolution' || event.eventType === 'classification_transition')
    .map((event) => ({
      timestamp: event.timestamp,
      recommendation: event.recommendation,
      classification: event.classification,
    }))

  const milestoneEvents = sorted.filter((event) => event.eventType === 'evidence_milestone')
  const eventTypeTotals = buildEmptyTypeTotals()
  for (const event of sorted) {
    eventTypeTotals[event.eventType] += 1
  }

  return {
    transitions,
    recommendationEvolution: {
      sequence: recommendationEvolution,
    },
    milestones: {
      totalMilestones: milestoneEvents.length,
      latestMilestoneAt: milestoneEvents[milestoneEvents.length - 1]?.timestamp ?? null,
      milestoneEventIds: milestoneEvents.map((event) => event.eventId),
    },
    eventTypeTotals,
  }
}

export const GOVERNANCE_TIMELINE_REPLAY_SAFE_MODE = 'append-only-observability' as const
