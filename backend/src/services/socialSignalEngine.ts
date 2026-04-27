import type { JsonObject } from '../domain/entityProfile.js'
import type { GlobalFeedEngine } from './globalFeedEngine.js'
import type { SocialSignalAggregate, SocialSignalRecord, SocialSignalType } from '../domain/socialSignal.js'
import type { SocialSignalRepository } from '../repositories/socialSignalRepository.js'

const SIGNAL_TYPES: SocialSignalType[] = ['viewed', 'interacted', 'exported', 'shared', 'followed']

type SignalTrustLevel = 'anonymous' | 'authenticated' | 'system'

type AggregateComputationInput = {
  weightedCounts: Record<SocialSignalType, number>
  totalSignals: number
  engagementScore?: number
}

type ComputedSocialSignalAggregate = SocialSignalAggregate & {
  totalSignals: number
  strongestSignal?: SocialSignalType
  engagementScore: number
  entityScore: number
  lastSignalAt?: string
}

function createEmptyCounts(): Record<SocialSignalType, number> {
  return {
    viewed: 0,
    interacted: 0,
    exported: 0,
    shared: 0,
    followed: 0,
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function getDefaultWeight(type: SocialSignalType) {
  if (type === 'followed') return 0.78
  if (type === 'shared') return 0.7
  if (type === 'exported') return 0.62
  if (type === 'interacted') return 0.48
  return 0.18
}

function resolveSignalTrustLevel(signal: Pick<SocialSignalRecord, 'actorId' | 'metadata'>): SignalTrustLevel {
  const explicitTrust = signal.metadata?._signalTrust
  if (explicitTrust === 'anonymous' || explicitTrust === 'authenticated' || explicitTrust === 'system') {
    return explicitTrust
  }

  if (signal.actorId?.startsWith('anon:')) {
    return 'anonymous'
  }

  if (signal.actorId?.startsWith('user:')) {
    return 'authenticated'
  }

  return 'system'
}

function getSignalTrustWeightMultiplier(signal: Pick<SocialSignalRecord, 'type' | 'actorId' | 'metadata'>) {
  const trustLevel = resolveSignalTrustLevel(signal)
  if (trustLevel === 'anonymous') {
    return signal.type === 'viewed' ? 0.25 : 0.1
  }

  return 1
}

function resolveStrongestSignal(weightedCounts: Record<SocialSignalType, number>) {
  return SIGNAL_TYPES.reduce<SocialSignalType | undefined>((strongest, type) => {
    if (!strongest || weightedCounts[type] > weightedCounts[strongest]) {
      return weightedCounts[type] > 0 ? type : strongest
    }
    return strongest
  }, undefined)
}

export function normalizeSocialSignalType(type: string): SocialSignalType {
  if (type === 'view') return 'viewed'
  if (type === 'click' || type === 'interaction') return 'interacted'
  if (type === 'share') return 'shared'
  if (type === 'follow') return 'followed'
  if (type === 'export.downloaded' || type === 'exported') return 'exported'
  return type as SocialSignalType
}

export function computeEngagementScore(aggregate: AggregateComputationInput) {
  const score =
    aggregate.weightedCounts.viewed * 0.04 +
    aggregate.weightedCounts.interacted * 0.24 +
    aggregate.weightedCounts.exported * 0.2 +
    aggregate.weightedCounts.shared * 0.28 +
    aggregate.weightedCounts.followed * 0.24

  return clamp(score / Math.max(1, aggregate.totalSignals))
}

export function computeEntityScore(aggregate: Required<AggregateComputationInput>) {
  const momentum =
    aggregate.weightedCounts.interacted * 0.22 +
    aggregate.weightedCounts.exported * 0.2 +
    aggregate.weightedCounts.shared * 0.32 +
    aggregate.weightedCounts.followed * 0.26

  return clamp(aggregate.engagementScore * 0.55 + momentum / Math.max(1, aggregate.totalSignals) * 0.45)
}

export function aggregateSignals(signals: SocialSignalRecord[], entityId?: string): SocialSignalAggregate {
  const relevantSignals = entityId ? signals.filter((signal) => signal.entityId === entityId) : signals
  const counts = createEmptyCounts()
  const weightedCounts = createEmptyCounts()
  let lastSignalAt: string | undefined

  for (const signal of relevantSignals) {
    counts[signal.type] += 1
    weightedCounts[signal.type] += clamp((signal.weight ?? getDefaultWeight(signal.type)) * getSignalTrustWeightMultiplier(signal))

    if (!lastSignalAt || new Date(signal.timestamp).getTime() > new Date(lastSignalAt).getTime()) {
      lastSignalAt = signal.timestamp
    }
  }

  const aggregate: ComputedSocialSignalAggregate = {
    entityId: entityId ?? 'all',
    total: relevantSignals.length,
    counts,
    weightedCounts,
    totalSignals: relevantSignals.length,
    strongestType: resolveStrongestSignal(weightedCounts),
    strongestSignal: resolveStrongestSignal(weightedCounts),
    engagementScore: 0,
    entityScore: 0,
    lastSignalAt,
  }

  aggregate.engagementScore = computeEngagementScore(aggregate)
  aggregate.entityScore = computeEntityScore(aggregate)

  return aggregate
}

export class SocialSignalEngine {
  constructor(
    private readonly repository: SocialSignalRepository,
    private readonly globalFeedEngine?: GlobalFeedEngine,
  ) {}

  async registerSignal(args: {
    entityId: string
    ownerId?: string
    type: string
    timestamp?: string
    weight?: number
    source?: string
    actorId?: string
    metadata?: Record<string, unknown>
  }) {
    const signal = await this.repository.registerSignal({
      entityId: args.entityId,
      ownerId: args.ownerId,
      type: normalizeSocialSignalType(args.type),
      timestamp: args.timestamp,
      weight: args.weight ?? getDefaultWeight(normalizeSocialSignalType(args.type)),
      source: args.source,
      actorId: args.actorId,
      metadata: (args.metadata ?? {}) as JsonObject,
    })

    if (this.globalFeedEngine && signal.type !== 'viewed') {
      await this.globalFeedEngine.publishFromSocialSignal(signal)
    }

    return signal
  }

  async registerSignalIfActorAbsentSince(args: {
    entityId: string
    ownerId?: string
    type: string
    timestamp?: string
    weight?: number
    source?: string
    actorId?: string
    metadata?: Record<string, unknown>
  }, since: string) {
    return this.repository.registerSignalIfActorAbsentSince({
      entityId: args.entityId,
      ownerId: args.ownerId,
      type: normalizeSocialSignalType(args.type),
      timestamp: args.timestamp,
      weight: args.weight ?? getDefaultWeight(normalizeSocialSignalType(args.type)),
      source: args.source,
      actorId: args.actorId,
      metadata: (args.metadata ?? {}) as JsonObject,
    }, since)
  }

  async aggregateSignals(entityId: string, limit = 200) {
    const signals = await this.repository.getSignals(entityId, limit)
    return aggregateSignals(signals, entityId)
  }

  async getViewerState(entityId: string, actorId?: string) {
    if (!actorId) {
      return {
        followed: false,
      }
    }

    return {
      followed: await this.repository.hasSignalByActor(entityId, 'followed', actorId),
    }
  }

  async hasSignalByActor(entityId: string, type: SocialSignalType, actorId: string) {
    return this.repository.hasSignalByActor(entityId, type, actorId)
  }

  async countSignalsByActorSince(entityId: string, actorId: string, since: string, type?: SocialSignalType) {
    return this.repository.countSignalsByActorSince(entityId, actorId, since, type)
  }
}

export function createSocialSignalEngine(repository: SocialSignalRepository, globalFeedEngine?: GlobalFeedEngine) {
  return new SocialSignalEngine(repository, globalFeedEngine)
}
