import { createHash } from 'node:crypto'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import {
  buildAdaptiveEvidenceCompatibilitySummary,
  type AdaptiveEvidenceCompatibilitySummary,
} from '../persistence/adaptiveEvidenceContract.js'
import {
  deriveEpistemicConfidenceMetadata,
  type EpistemicConfidenceMetadata,
} from './epistemicConfidence.js'
import {
  reduceReplayCollapseSummary,
  reduceReplayConsistencyBuckets,
  reduceReplayDegradationDeltas,
  reduceReplayRollingAverages,
  reduceReplayTimeSeries,
  reduceReplayVariance,
  type ReplayGraphCollapseSummary,
  type ReplayGraphConsistencyBucket,
  type ReplayGraphDegradationDeltaPoint,
  type ReplayGraphHistoricalPoint,
  type ReplayGraphRollingAverage,
  type ReplayGraphVariancePoint,
} from './replayTrendReducers.js'

export type ReplayConsistencyGraphPayload = {
  generatedAt: string
  aggregationArchitecture: {
    observationOnly: true
    derivedOnly: true
    noMutation: true
    noRollout: true
    noAdaptiveExecution: true
    noGovernanceMutation: true
    replaySafe: true
    deterministic: true
  }
  compatibility: AdaptiveEvidenceCompatibilitySummary
  epistemicConfidence: EpistemicConfidenceMetadata
  graph: {
    historyLimit: number
    timeSeries: ReplayGraphHistoricalPoint[]
    rollingAverages: ReplayGraphRollingAverage[]
    degradationDeltas: ReplayGraphDegradationDeltaPoint[]
    collapseSummary: ReplayGraphCollapseSummary
    replayConsistencyBuckets: ReplayGraphConsistencyBucket[]
    replayVariance: ReplayGraphVariancePoint[]
  }
  payloadFingerprint: string
}

type ReplayConsistencyGraphServiceDependencies = {
  listEvidenceChronological: (args?: { limit?: number }) => Promise<AdaptiveEquilibriumEvidenceEvent[]>
  now?: () => string
}

export type BuildReplayConsistencyGraphInput = {
  historyLimit?: number
  rollingHours?: number[]
  replayConsistencyBucketCount?: number
}

const DEFAULT_HISTORY_LIMIT = 720

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

function normalizeHistoryLimit(limit?: number) {
  return Math.max(1, Math.min(10_000, Math.trunc(limit ?? DEFAULT_HISTORY_LIMIT)))
}

function sortChronological(events: AdaptiveEquilibriumEvidenceEvent[]) {
  return [...events].sort((left, right) => {
    const byTime = left.generatedAt.localeCompare(right.generatedAt)
    if (byTime !== 0) {
      return byTime
    }

    return left.evidenceId.localeCompare(right.evidenceId)
  })
}

export type ReplayConsistencyGraphService = {
  buildReplayGraphs: (input?: BuildReplayConsistencyGraphInput) => Promise<ReplayConsistencyGraphPayload>
}

export function createReplayConsistencyGraphService(
  dependencies: ReplayConsistencyGraphServiceDependencies,
): ReplayConsistencyGraphService {
  const now = dependencies.now ?? (() => new Date().toISOString())

  return {
    async buildReplayGraphs(input = {}) {
      const historyLimit = normalizeHistoryLimit(input.historyLimit)
      const events = sortChronological(await dependencies.listEvidenceChronological({ limit: historyLimit }))
      const generatedAt = now()
      const anchorIso = events[events.length - 1]?.generatedAt ?? generatedAt

      const timeSeries = reduceReplayTimeSeries(events)
      const rollingAverages = reduceReplayRollingAverages({
        timeSeries,
        nowIso: anchorIso,
        rollingHours: input.rollingHours,
      })
      const degradationDeltas = reduceReplayDegradationDeltas(timeSeries)
      const collapseSummary = reduceReplayCollapseSummary({
        timeSeries,
        rollingAverages,
      })
      const replayConsistencyBuckets = reduceReplayConsistencyBuckets({
        timeSeries,
        bucketCount: input.replayConsistencyBucketCount,
      })
      const replayVariance = reduceReplayVariance(timeSeries)

      const graph = {
        historyLimit,
        timeSeries,
        rollingAverages,
        degradationDeltas,
        collapseSummary,
        replayConsistencyBuckets,
        replayVariance,
      }
      const compatibility = buildAdaptiveEvidenceCompatibilitySummary(events)
      const epistemicConfidence = deriveEpistemicConfidenceMetadata(events)

      const stablePayloadForFingerprint = {
        aggregationArchitecture: {
          observationOnly: true as const,
          derivedOnly: true as const,
          noMutation: true as const,
          noRollout: true as const,
          noAdaptiveExecution: true as const,
          noGovernanceMutation: true as const,
          replaySafe: true as const,
          deterministic: true as const,
        },
        compatibility,
        epistemicConfidence,
        graph,
      }

      const payloadFingerprint = createHash('sha256')
        .update(stableStringify(stablePayloadForFingerprint))
        .digest('hex')

      return {
        generatedAt,
        aggregationArchitecture: {
          observationOnly: true,
          derivedOnly: true,
          noMutation: true,
          noRollout: true,
          noAdaptiveExecution: true,
          noGovernanceMutation: true,
          replaySafe: true,
          deterministic: true,
        },
        compatibility,
        epistemicConfidence,
        graph,
        payloadFingerprint,
      }
    },
  }
}
