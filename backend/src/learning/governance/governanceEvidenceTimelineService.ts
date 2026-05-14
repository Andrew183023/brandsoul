import { createHash } from 'node:crypto'

import type { AdaptiveEquilibriumEvidenceEvent } from '../persistence/AdaptiveEquilibriumEvidenceEvent.js'
import type { GovernanceEvidenceTimelineRepository } from '../persistence/governanceEvidenceTimelineRepository.js'
import {
  buildAdaptiveEvidenceCompatibilitySummary,
  type AdaptiveEvidenceCompatibilitySummary,
} from '../persistence/adaptiveEvidenceContract.js'
import {
  deriveEpistemicConfidenceMetadata,
  type EpistemicConfidenceMetadata,
} from '../observability/epistemicConfidence.js'
import {
  reduceGovernanceEvidenceHistory,
  reduceGovernanceEvidenceTimelineEvents,
  type GovernanceEvidenceHistoryReducers,
} from './governanceEvidenceTimelineReducer.js'
import { appendGovernanceTimelineEventsWithSovereignAuthority } from '../persistence/sovereignAdaptiveAppend.js'

type GovernanceTimelineAppendInput = {
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

type GovernanceTimelineHistoryInput = {
  page?: number
  pageSize?: number
  historyLimit?: number
}

export type GovernanceTimelineHistoryPayload = {
  generatedAt: string
  compatibility: AdaptiveEvidenceCompatibilitySummary
  epistemicConfidence: EpistemicConfidenceMetadata
  reducers: GovernanceEvidenceHistoryReducers
  events: Awaited<ReturnType<GovernanceEvidenceTimelineRepository['listEventsPaginated']>>
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  replaySafePayload: {
    payloadFingerprint: string
    deterministic: true
    appendOnly: true
    observabilityOnly: true
  }
}

type GovernanceEvidenceTimelineServiceDependencies = {
  repository: GovernanceEvidenceTimelineRepository
  listEvidenceChronological: (args?: { limit?: number }) => Promise<AdaptiveEquilibriumEvidenceEvent[]>
  now?: () => string
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

function buildPayloadFingerprint(payload: unknown) {
  return createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 40)
}

function buildStablePayloadForFingerprint(payload: Pick<
  GovernanceTimelineHistoryPayload,
  'compatibility' | 'epistemicConfidence' | 'reducers' | 'events' | 'pagination'
>) {
  return {
    compatibility: payload.compatibility,
    epistemicConfidence: payload.epistemicConfidence,
    reducers: payload.reducers,
    events: payload.events,
    pagination: payload.pagination,
  }
}

export class GovernanceEvidenceTimelineService {
  constructor(private readonly dependencies: GovernanceEvidenceTimelineServiceDependencies) {}

  async appendDerivedEvents(input: GovernanceTimelineAppendInput) {
    const derived = reduceGovernanceEvidenceTimelineEvents(input)
    const results = await appendGovernanceTimelineEventsWithSovereignAuthority({
      repository: this.dependencies.repository,
      inputs: derived,
      authority: {
        source: 'backend/src/learning/governance/governanceEvidenceTimelineService.ts#appendDerivedEvents',
      },
    })

    return {
      derivedCount: derived.length,
      insertedCount: results.filter((result) => result.inserted).length,
      events: results.map((result) => result.event),
    }
  }

  async buildHistory(input: GovernanceTimelineHistoryInput = {}): Promise<GovernanceTimelineHistoryPayload> {
    const page = Math.max(1, Math.trunc(input.page ?? 1))
    const pageSize = Math.max(1, Math.min(500, Math.trunc(input.pageSize ?? 50)))
    const offset = (page - 1) * pageSize
    const historyLimit = Math.max(10, Math.min(10_000, Math.trunc(input.historyLimit ?? 1000)))

    const [total, events, chronological, evidenceChronological] = await Promise.all([
      this.dependencies.repository.countEvents(),
      this.dependencies.repository.listEventsPaginated({ limit: pageSize, offset }),
      this.dependencies.repository.listEventsChronological({ limit: historyLimit }),
      this.dependencies.listEvidenceChronological({ limit: historyLimit }),
    ])

    const reducers = reduceGovernanceEvidenceHistory({ events: chronological })
    const compatibility = buildAdaptiveEvidenceCompatibilitySummary(evidenceChronological)
    const epistemicConfidence = deriveEpistemicConfidenceMetadata(evidenceChronological)
    const generatedAt = this.dependencies.now?.() ?? new Date().toISOString()

    const payloadWithoutFingerprint: Omit<GovernanceTimelineHistoryPayload, 'replaySafePayload'> = {
      generatedAt,
      compatibility,
      epistemicConfidence,
      reducers,
      events,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }

    return {
      ...payloadWithoutFingerprint,
      replaySafePayload: {
        payloadFingerprint: buildPayloadFingerprint(buildStablePayloadForFingerprint(payloadWithoutFingerprint)),
        deterministic: true,
        appendOnly: true,
        observabilityOnly: true,
      },
    }
  }
}

export function createGovernanceEvidenceTimelineService(dependencies: GovernanceEvidenceTimelineServiceDependencies) {
  return new GovernanceEvidenceTimelineService(dependencies)
}
