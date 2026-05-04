import { aggregateSignals } from './socialSignalEngine.js'
import type { SocialSignalRecord as DomainSocialSignalRecord } from '../domain/socialSignal.js'

type JsonRecord = Record<string, unknown>

type EntityRecord = {
  id: string
  ownerId?: string
  entityProfile: JsonRecord
}

type EventRecord = {
  type: string
  timestamp?: string
}

type ExportRecord = {
  fileUrl?: string
}

type RelationshipRecord = {
  sourceEntityId: string
  targetEntityId: string
}

type SocialSignalRecord = DomainSocialSignalRecord

type SignalAggregate = ReturnType<typeof aggregateSignals> & {
  totalSignals?: number
  engagementScore?: number
  entityScore?: number
}

type GrowthMetrics = {
  engagementScore?: number
  discoveryBoost?: number
  rates?: {
    shareRate?: number
    returnVisitRate?: number
    viralCoefficient?: number
  }
}

type PublicProfile = {
  schemaVersion: number
  entityId: string
  name: string
  species: string
  avatarExportRef?: string
  tagline?: string
  behaviorTone?: string
  evolutionLevel: number
  trustScore: number
  lastActiveAt?: string
  publicStats: {
    interactions: number
    exports: number
    shares: number
    returns: number
  }
}

type RecommendationItem = {
  entityId: string
  score: number
  reasons: string[]
  publicProfile: PublicProfile
}

type RecommendEntitiesQuery = {
  ownerId?: string
  referenceEntityId?: string
  species?: string
  category?: string
  limit?: number
}

type TrendingEntitiesQuery = {
  ownerId?: string
  species?: string
  category?: string
  limit?: number
}

type EntityRepositoryLike = {
  listEntities(limit?: number): Promise<EntityRecord[]>
}

type EventLogRepositoryLike = {
  getRecentEvents(entityId: string, limit?: number): Promise<EventRecord[]>
}

type EntityExportRepositoryLike = {
  getExports(entityId: string): Promise<ExportRecord[]>
}

type EntityRelationshipRepositoryLike = {
  getConnections(entityId: string): Promise<RelationshipRecord[]>
}

type FeedRecord = {
  entityId: string
}

type GlobalFeedRepositoryLike = {
  getFeed(limit?: number): Promise<FeedRecord[]>
}

type SocialSignalRepositoryLike = {
  getSignals(entityId: string, limit?: number): Promise<SocialSignalRecord[]>
}

type GrowthEngineLike = {
  getEntityMetrics(entityId: string): Promise<GrowthMetrics | undefined>
}

type DiscoveryEngineArgs = {
  entityRepository: EntityRepositoryLike
  eventLogRepository: EventLogRepositoryLike
  entityExportRepository: EntityExportRepositoryLike
  entityRelationshipRepository: EntityRelationshipRepositoryLike
  globalFeedRepository: GlobalFeedRepositoryLike
  socialSignalRepository: SocialSignalRepositoryLike
  growthEngine?: GrowthEngineLike
}

type Candidate = {
  entity: EntityRecord
  publicProfile: PublicProfile
  events: EventRecord[]
  exports: ExportRecord[]
  relationships: RelationshipRecord[]
  signals: SocialSignalRecord[]
  signalAggregate: SignalAggregate
  growthMetrics?: GrowthMetrics
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max)
}

function getSignalAggregateTotal(aggregate: SignalAggregate): number {
  if (typeof aggregate.totalSignals === 'number') {
    return aggregate.totalSignals
  }

  return Object.values(aggregate.counts).reduce((total, count) => total + count, 0)
}

function getSignalAggregateEngagementScore(aggregate: SignalAggregate): number {
  if (typeof aggregate.engagementScore === 'number') {
    return aggregate.engagementScore
  }

  const totalSignals = Math.max(1, getSignalAggregateTotal(aggregate))
  const score =
    aggregate.weightedCounts.viewed * 0.04 +
    aggregate.weightedCounts.interacted * 0.24 +
    aggregate.weightedCounts.exported * 0.2 +
    aggregate.weightedCounts.shared * 0.28 +
    aggregate.weightedCounts.followed * 0.24

  return clamp(score / totalSignals)
}

function getSignalAggregateEntityScore(aggregate: SignalAggregate): number {
  if (typeof aggregate.entityScore === 'number') {
    return aggregate.entityScore
  }

  const totalSignals = Math.max(1, getSignalAggregateTotal(aggregate))
  const engagementScore = getSignalAggregateEngagementScore(aggregate)
  const momentum =
    aggregate.weightedCounts.interacted * 0.22 +
    aggregate.weightedCounts.exported * 0.2 +
    aggregate.weightedCounts.shared * 0.32 +
    aggregate.weightedCounts.followed * 0.26

  return clamp(engagementScore * 0.55 + (momentum / totalSignals) * 0.45)
}

function countEvents(events: EventRecord[], type: string): number {
  return events.filter((event) => event.type === type).length
}

function mapEntityProfileToPublicProfile(args: {
  entity: JsonRecord
  events?: EventRecord[]
  exports?: ExportRecord[]
}): PublicProfile {
  const entity = args.entity
  const social = asRecord(entity.social)
  const finalForm = asRecord(entity.finalForm)
  const identity = asRecord(finalForm.identity)
  const relational = asRecord(entity.relational)
  const behaviorState = asRecord(relational.behaviorState)
  const progression = asRecord(relational.progression)
  const binding = asRecord(relational.binding)
  const userMemory = asRecord(relational.userMemory)
  const timelineLog = asRecord(relational.timelineLog)
  const exports = args.exports ?? []
  const events = args.events ?? []
  const interactions =
    countEvents(events, 'interaction.message') +
    countEvents(events, 'interaction.reply') +
    countEvents(events, 'interaction.click')
  const exportCount = exports.length || countEvents(events, 'export.downloaded')
  const shares = countEvents(events, 'share.triggered')
  const returns = countEvents(events, 'return.visit')
  const trustScore = Math.min(
    1,
    readNumber(binding.bindingStrength) * 0.45 +
      readNumber(userMemory.memoryConfidence) * 0.25 +
      readNumber(behaviorState.affinityScore) * 0.2 +
      Math.min(returns, 5) * 0.02,
  )

  return {
    schemaVersion: 1,
    entityId: String(entity.id),
    name: readString(identity.name) ?? readString(social.publicName) ?? readString(entity.id) ?? 'Unknown Entity',
    species: readString(asRecord(entity.manifestation).mode) ?? 'unknown',
    avatarExportRef: exports[0]?.fileUrl ?? undefined,
    tagline: readString(identity.socialLine) ?? readString(identity.openingLine) ?? readString(identity.manifesto),
    behaviorTone: readString(behaviorState.behavioralTemperature) ?? readString(asRecord(entity.context).languageStyle),
    evolutionLevel: readNumber(progression.level),
    trustScore,
    lastActiveAt:
      readString(userMemory.lastActiveAt) ??
      readString(timelineLog.lastEventAt) ??
      readString(asRecord(entity.metadata).updatedAt),
    publicStats: {
      interactions,
      exports: exportCount,
      shares,
      returns,
    },
  }
}

function computeTagOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) {
    return 0
  }

  const bSet = new Set(b)
  const overlap = a.filter((item) => bSet.has(item)).length
  return clamp(overlap / Math.max(a.length, b.length))
}

function uniqueReasons(reasons: Array<string | undefined>): string[] {
  return Array.from(new Set(reasons.filter((reason): reason is string => Boolean(reason))))
}

export class DiscoveryEngine {
  constructor(
    private readonly entityRepository: EntityRepositoryLike,
    private readonly eventLogRepository: EventLogRepositoryLike,
    private readonly entityExportRepository: EntityExportRepositoryLike,
    private readonly entityRelationshipRepository: EntityRelationshipRepositoryLike,
    private readonly globalFeedRepository: GlobalFeedRepositoryLike,
    private readonly socialSignalRepository: SocialSignalRepositoryLike,
    private readonly growthEngine?: GrowthEngineLike,
  ) {}

  private async mapCandidate(entity: EntityRecord): Promise<Candidate> {
    const [events, exports, relationships, signals, growthMetrics] = await Promise.all([
      this.eventLogRepository.getRecentEvents(entity.id, 100),
      this.entityExportRepository.getExports(entity.id),
      this.entityRelationshipRepository.getConnections(entity.id),
      this.socialSignalRepository.getSignals(entity.id, 200),
      this.growthEngine?.getEntityMetrics(entity.id) ?? Promise.resolve(undefined),
    ])

    return {
      entity,
      publicProfile: mapEntityProfileToPublicProfile({
        entity: entity.entityProfile,
        events,
        exports,
      }),
      events,
      exports,
      relationships,
      signals,
      signalAggregate: aggregateSignals(signals, entity.id),
      growthMetrics,
    }
  }

  private computeScore(args: {
    candidate: Candidate
    reference?: Candidate
    feedBoost: number
  }): number {
    const candidateEntity = args.candidate.entity.entityProfile
    const referenceEntity = args.reference?.entity.entityProfile
    const candidateSocial = asRecord(candidateEntity.social)
    const candidateBehavior = asRecord(asRecord(candidateEntity.relational).behaviorState)
    const candidateProgression = asRecord(asRecord(candidateEntity.relational).progression)
    const candidateBinding = asRecord(asRecord(candidateEntity.relational).binding)
    const candidateTags = Array.isArray(candidateSocial.tags)
      ? candidateSocial.tags.filter((tag): tag is string => typeof tag === 'string')
      : []

    const popularity = clamp(
      args.candidate.publicProfile.publicStats.interactions * 0.02 +
        args.candidate.publicProfile.publicStats.exports * 0.08 +
        args.candidate.publicProfile.publicStats.shares * 0.12 +
        args.candidate.publicProfile.publicStats.returns * 0.05 +
        getSignalAggregateEntityScore(args.candidate.signalAggregate) * 0.18 +
        (args.candidate.growthMetrics?.rates?.shareRate ?? 0) * 0.12,
    )

    const activity = clamp(
      (args.candidate.events.length / 20) * 0.33 +
        args.feedBoost * 0.2 +
        getSignalAggregateEngagementScore(args.candidate.signalAggregate) * 0.22 +
        (args.candidate.growthMetrics?.engagementScore ?? 0) * 0.15 +
        (args.candidate.growthMetrics?.rates?.returnVisitRate ?? 0) * 0.1,
    )

    const evolution = clamp(readNumber(candidateProgression.level) / 10)
    const growthBoost = clamp(
      (args.candidate.growthMetrics?.discoveryBoost ?? 0) * 0.6 +
        (args.candidate.growthMetrics?.rates?.viralCoefficient ?? 0) * 0.4,
    )

    let speciesSimilarity = 0
    let behaviorAffinity = clamp(readNumber(candidateBinding.bindingStrength) * 0.45 + readNumber(candidateBehavior.affinityScore) * 0.55)
    let interestProximity = 0
    let connected = 0

    if (referenceEntity) {
      const referenceSocial = asRecord(referenceEntity.social)
      const referenceBehavior = asRecord(asRecord(referenceEntity.relational).behaviorState)
      const referenceTags = Array.isArray(referenceSocial.tags)
        ? referenceSocial.tags.filter((tag): tag is string => typeof tag === 'string')
        : []

      speciesSimilarity =
        readString(asRecord(referenceEntity.manifestation).mode) === readString(asRecord(candidateEntity.manifestation).mode) ? 1 : 0

      interestProximity = computeTagOverlap(referenceTags, candidateTags)

      behaviorAffinity = clamp(
        behaviorAffinity * 0.5 +
          (readString(referenceBehavior.behavioralTemperature) === readString(candidateBehavior.behavioralTemperature) ? 0.22 : 0) +
          (readString(referenceBehavior.relationshipMode) === readString(candidateBehavior.relationshipMode) ? 0.18 : 0),
      )

      connected = args.candidate.relationships.some(
        (relationship) => relationship.sourceEntityId === referenceEntity.id || relationship.targetEntityId === referenceEntity.id,
      )
        ? 1
        : 0
    }

    return clamp(
      behaviorAffinity * 0.24 +
        speciesSimilarity * 0.16 +
        interestProximity * 0.18 +
        popularity * 0.16 +
        activity * 0.12 +
        evolution * 0.08 +
        connected * 0.04 +
        growthBoost * 0.1,
    )
  }

  private resolveReasons(args: {
    candidate: Candidate
    reference?: Candidate
    score: number
    feedBoost: number
  }): string[] {
    const candidateEntity = args.candidate.entity.entityProfile
    const candidateBehavior = asRecord(asRecord(candidateEntity.relational).behaviorState)
    const candidateProgression = asRecord(asRecord(candidateEntity.relational).progression)

    const reasons = uniqueReasons([
      readNumber(candidateBehavior.affinityScore) >= 0.4 ? 'behavior-affinity' : undefined,
      args.reference &&
      readString(asRecord(args.reference.entity.entityProfile.manifestation).mode) === readString(asRecord(candidateEntity.manifestation).mode)
        ? 'same-species'
        : undefined,
      args.reference
        ? computeTagOverlap(
            readStringArray(asRecord(args.reference.entity.entityProfile.social).tags),
            readStringArray(asRecord(candidateEntity.social).tags),
          ) >= 0.25
          ? 'interest-proximity'
          : undefined
        : undefined,
      args.candidate.publicProfile.publicStats.shares > 0 ||
      args.candidate.publicProfile.publicStats.exports > 1 ||
      getSignalAggregateEntityScore(args.candidate.signalAggregate) >= 0.42
        ? 'popular'
        : undefined,
      args.feedBoost >= 0.28 || args.candidate.events.length >= 4 || getSignalAggregateEngagementScore(args.candidate.signalAggregate) >= 0.28
        ? 'active'
        : undefined,
      (args.candidate.growthMetrics?.engagementScore ?? 0) >= 0.42 ? 'high-engagement' : undefined,
      (args.candidate.growthMetrics?.rates?.shareRate ?? 0) >= 0.18 ? 'share-velocity' : undefined,
      (args.candidate.growthMetrics?.rates?.returnVisitRate ?? 0) >= 0.12 ? 'returning' : undefined,
      readNumber(candidateProgression.level) >= 2 ? 'evolved' : undefined,
      args.reference &&
      args.candidate.relationships.some(
        (relationship) => relationship.sourceEntityId === args.reference?.entity.id || relationship.targetEntityId === args.reference?.entity.id,
      )
        ? 'connected'
        : undefined,
    ])

    return reasons.length ? reasons : args.score >= 0.35 ? ['active'] : []
  }

  async recommendEntities(query: RecommendEntitiesQuery) {
    const entities = await this.entityRepository.listEntities(250)
    const reference = query.referenceEntityId ? entities.find((entity) => entity.id === query.referenceEntityId) : undefined
    const mappedReference = reference ? await this.mapCandidate(reference) : undefined
    const feed = await this.globalFeedRepository.getFeed(200)

    const candidates = await Promise.all(
      entities
        .filter((entity) => entity.id !== query.referenceEntityId)
        .filter((entity) => !query.ownerId || entity.ownerId === query.ownerId || asRecord(entity.entityProfile.social).visibility === 'public')
        .filter((entity) => !query.species || readString(asRecord(entity.entityProfile.manifestation).mode) === query.species)
        .filter((entity) => !query.category || readString(asRecord(entity.entityProfile.social).category) === query.category)
        .map(async (entity): Promise<RecommendationItem> => {
          const candidate = await this.mapCandidate(entity)
          const feedBoost = clamp(feed.filter((item) => item.entityId === entity.id).length / 6)
          const score = this.computeScore({
            candidate,
            reference: mappedReference,
            feedBoost,
          })

          return {
            entityId: entity.id,
            score,
            reasons: this.resolveReasons({
              candidate,
              reference: mappedReference,
              score,
              feedBoost,
            }),
            publicProfile: candidate.publicProfile,
          }
        }),
    )

    return {
      query,
      items: candidates.sort((a, b) => b.score - a.score).slice(0, query.limit ?? 20),
    }
  }

  async trendingEntities(query: TrendingEntitiesQuery = {}) {
    const feed = await this.globalFeedRepository.getFeed(300)
    const entities = await this.entityRepository.listEntities(250)

    const items = await Promise.all(
      entities
        .filter((entity) => !query.ownerId || entity.ownerId === query.ownerId || asRecord(entity.entityProfile.social).visibility === 'public')
        .filter((entity) => !query.species || readString(asRecord(entity.entityProfile.manifestation).mode) === query.species)
        .filter((entity) => !query.category || readString(asRecord(entity.entityProfile.social).category) === query.category)
        .map(async (entity): Promise<RecommendationItem> => {
          const candidate = await this.mapCandidate(entity)
          const feedBoost = clamp(feed.filter((item) => item.entityId === entity.id).length / 8)
          const progression = asRecord(asRecord(entity.entityProfile.relational).progression)
          const score = clamp(
            feedBoost * 0.3 +
              candidate.publicProfile.trustScore * 0.22 +
              Math.min(1, candidate.publicProfile.publicStats.interactions / 20) * 0.18 +
              Math.min(1, candidate.publicProfile.publicStats.shares / 8) * 0.14 +
              Math.min(1, readNumber(progression.level) / 10) * 0.1 +
                getSignalAggregateEntityScore(candidate.signalAggregate) * 0.06,
          )

          return {
            entityId: entity.id,
            score,
            reasons: this.resolveReasons({
              candidate,
              score,
              feedBoost,
            }),
            publicProfile: candidate.publicProfile,
          }
        }),
    )

    return {
      query,
      items: items.sort((a, b) => b.score - a.score).slice(0, query.limit ?? 20),
    }
  }
}

export function createDiscoveryEngine(args: DiscoveryEngineArgs) {
  return new DiscoveryEngine(
    args.entityRepository,
    args.eventLogRepository,
    args.entityExportRepository,
    args.entityRelationshipRepository,
    args.globalFeedRepository,
    args.socialSignalRepository,
    args.growthEngine,
  )
}
