import { aggregateSignals } from '../../services/socialSignalEngine.js'
import type { SocialSignalRecord as DomainSocialSignalRecord } from '../socialSignal.js'

type JsonRecord = Record<string, unknown>

type GrowthEventRecord = {
  id?: string
  entityId: string
  ownerId?: string
  actorId?: string
  type: string
  timestamp: string
  referralId?: string
  metadata: JsonRecord
}

type ReferralRecord = {
  id: string
  ownerId?: string
  inviterEntityId: string
  invitedUserId?: string
  invitedIdentifier?: string
  conversionStatus: string
  inviteSentAt?: string
  inviteAcceptedAt?: string
  convertedAt?: string
  createdEntityId?: string
  metadata?: JsonRecord
}

type EntityRecord = {
  id: string
}

type ExportRecord = {
  id?: string
  fileUrl?: string
}

type SocialSignalRecord = DomainSocialSignalRecord

type GrowthCounts = {
  entityCreated: number
  exportShared: number
  exportViewed: number
  entityFollowed: number
  entityInteracted: number
  returnVisit: number
  entityDiscovered: number
  invitesSent: number
  invitesAccepted: number
  entitiesCreatedFromInvite: number
}

type GrowthRates = {
  shareRate: number
  conversionRate: number
  viralCoefficient: number
  retentionD1: number
  retentionD7: number
  returnVisitRate: number
}

type GrowthSignal = {
  schemaVersion: 1
  entityId: string
  type: string
  score: number
  createdAt: string
}

type ViralTrigger = {
  schemaVersion: 1
  entityId: string
  type: string
  confidence: number
  reason: string
  createdAt: string
}

export type GrowthMetrics = {
  schemaVersion: 1
  entityId: string
  counts: GrowthCounts
  rates: GrowthRates
  momentumScore: number
  engagementScore: number
  discoveryBoost: number
  signals: GrowthSignal[]
  triggers: ViralTrigger[]
  updatedAt: string
}

type GrowthRepositoryLike = {
  logGrowthEvent(input: {
    entityId: string
    ownerId?: string
    actorId?: string
    type: string
    timestamp?: string
    referralId?: string
    metadata: JsonRecord
  }): Promise<GrowthEventRecord>
  createReferral(input: {
    ownerId?: string
    inviterEntityId: string
    invitedUserId?: string
    invitedIdentifier?: string
    metadata: JsonRecord
  }): Promise<ReferralRecord>
  acceptReferral(referralId: string, invitedUserId?: string): Promise<ReferralRecord | null | undefined>
  markReferralConverted(referralId: string, createdEntityId: string): Promise<ReferralRecord | null | undefined>
  getGrowthEvents(entityId: string, limit?: number): Promise<GrowthEventRecord[]>
  listReferralsByInviter(entityId: string): Promise<ReferralRecord[]>
  listReferralsByOwner(ownerId: string): Promise<ReferralRecord[]>
}

type EntityRepositoryLike = {
  getEntitiesByOwnerId(ownerId: string): Promise<EntityRecord[]>
  listEntities(limit?: number): Promise<EntityRecord[]>
}

type EntityExportRepositoryLike = {
  getExports(entityId: string): Promise<ExportRecord[]>
}

type SocialSignalRepositoryLike = {
  getSignals(entityId: string, limit?: number): Promise<SocialSignalRecord[]>
}

type TrackGrowthEventInput = {
  entityId: string
  ownerId?: string
  actorId?: string
  type: string
  timestamp?: string
  referralId?: string
  metadata?: JsonRecord
}

type CreateReferralInput = {
  ownerId?: string
  inviterEntityId: string
  invitedUserId?: string
  invitedIdentifier?: string
  metadata?: JsonRecord
}

type AttachExportViralLayerInput = {
  entityId: string
  exportId: string
  publicBaseUrl: string
  metadata?: JsonRecord
}

type TrackDiscoveryExposureInput = {
  ownerId?: string
  actorId?: string
  items: Array<{
    entityId: string
    score: number
  }>
  query?: JsonRecord
}

type DetectGrowthOpportunitiesInput = {
  entityId: string
  engagementScore: number
}

type SignalAggregate = ReturnType<typeof aggregateSignals> & {
  engagementScore?: number
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max)
}

function getAggregateEngagementScore(aggregate: SignalAggregate): number {
  return typeof aggregate.engagementScore === 'number' ? aggregate.engagementScore : 0
}

function countEvents(events: GrowthEventRecord[], type: string): number {
  return events.filter((event) => event.type === type).length
}

function hasEventAfter(events: GrowthEventRecord[], type: string, thresholdMs: number): number {
  const created = events.find((event) => event.type === 'entity_created')
  if (!created) {
    return 0
  }

  const createdAt = new Date(created.timestamp).getTime()
  const matched = events.some(
    (event) => event.type === type && new Date(event.timestamp).getTime() - createdAt >= thresholdMs,
  )

  return matched ? 1 : 0
}

function buildSignals(entityId: string, metrics: Omit<GrowthMetrics, 'schemaVersion' | 'entityId' | 'signals' | 'triggers' | 'updatedAt'>, now: string): GrowthSignal[] {
  const signals: GrowthSignal[] = []

  if (metrics.engagementScore >= 0.42) {
    signals.push({ schemaVersion: 1, entityId, type: 'engagement_high', score: metrics.engagementScore, createdAt: now })
  }

  if (metrics.rates.shareRate >= 0.22) {
    signals.push({ schemaVersion: 1, entityId, type: 'share_opportunity', score: metrics.rates.shareRate, createdAt: now })
  }

  if (metrics.discoveryBoost >= 0.35) {
    signals.push({ schemaVersion: 1, entityId, type: 'visibility_boost', score: metrics.discoveryBoost, createdAt: now })
  }

  if (metrics.counts.entityInteracted >= 3) {
    signals.push({
      schemaVersion: 1,
      entityId,
      type: 'invite_candidate',
      score: clamp(metrics.counts.entityInteracted / 8),
      createdAt: now,
    })
  }

  if (metrics.counts.returnVisit > 0 || metrics.rates.retentionD1 > 0) {
    signals.push({
      schemaVersion: 1,
      entityId,
      type: 'return_loop',
      score: Math.max(metrics.rates.retentionD1, metrics.rates.returnVisitRate),
      createdAt: now,
    })
  }

  if (metrics.counts.entityDiscovered >= 3) {
    signals.push({
      schemaVersion: 1,
      entityId,
      type: 'discovery_hot',
      score: clamp(metrics.counts.entityDiscovered / 10),
      createdAt: now,
    })
  }

  return signals
}

function buildTriggers(entityId: string, metrics: Omit<GrowthMetrics, 'schemaVersion' | 'entityId' | 'signals' | 'triggers' | 'updatedAt'>, now: string): ViralTrigger[] {
  const triggers: ViralTrigger[] = []

  if (metrics.engagementScore >= 0.45) {
    triggers.push({
      schemaVersion: 1,
      entityId,
      type: 'suggest_share',
      confidence: clamp(metrics.engagementScore * 0.95),
      reason: 'High engagement indicates a good moment to suggest sharing.',
      createdAt: now,
    })
  }

  if (metrics.counts.exportViewed > 0 || metrics.counts.exportShared >= 0) {
    triggers.push({
      schemaVersion: 1,
      entityId,
      type: 'attach_share_cta',
      confidence: 0.72,
      reason: 'Generated exports should carry a share path by default.',
      createdAt: now,
    })
  }

  if (metrics.discoveryBoost >= 0.38) {
    triggers.push({
      schemaVersion: 1,
      entityId,
      type: 'boost_visibility',
      confidence: clamp(metrics.discoveryBoost),
      reason: 'Current growth momentum justifies additional discovery visibility.',
      createdAt: now,
    })
  }

  if (metrics.counts.entityInteracted >= 3 && metrics.counts.entityFollowed > 0) {
    triggers.push({
      schemaVersion: 1,
      entityId,
      type: 'suggest_invite',
      confidence: clamp(0.42 + metrics.rates.conversionRate * 0.28 + metrics.rates.shareRate * 0.18),
      reason: 'Repeated interaction and follow activity indicate invite potential.',
      createdAt: now,
    })
  }

  if (metrics.counts.returnVisit > 0 || metrics.rates.retentionD1 > 0 || metrics.rates.retentionD7 > 0) {
    triggers.push({
      schemaVersion: 1,
      entityId,
      type: 'schedule_reengagement',
      confidence: clamp(0.38 + metrics.rates.returnVisitRate * 0.32 + metrics.rates.retentionD7 * 0.24),
      reason: 'Return signals justify a light re-engagement loop.',
      createdAt: now,
    })
  }

  return triggers
}

export class GrowthEngine {
  constructor(
    private readonly growthRepository: GrowthRepositoryLike,
    private readonly entityRepository: EntityRepositoryLike,
    private readonly entityExportRepository: EntityExportRepositoryLike,
    private readonly socialSignalRepository: SocialSignalRepositoryLike,
  ) {}

  async trackEvent(input: TrackGrowthEventInput): Promise<GrowthEventRecord> {
    return this.growthRepository.logGrowthEvent({
      ...input,
      metadata: input.metadata ?? {},
    })
  }

  async createReferral(input: CreateReferralInput): Promise<ReferralRecord> {
    const referral = await this.growthRepository.createReferral({
      ownerId: input.ownerId,
      inviterEntityId: input.inviterEntityId,
      invitedUserId: input.invitedUserId,
      invitedIdentifier: input.invitedIdentifier,
      metadata: input.metadata ?? {},
    })

    await this.trackEvent({
      entityId: input.inviterEntityId,
      ownerId: input.ownerId,
      type: 'invite_sent',
      referralId: referral.id,
      metadata: {
        invitedUserId: input.invitedUserId ?? '',
        invitedIdentifier: input.invitedIdentifier ?? '',
      },
    })

    return referral
  }

  async acceptReferral(referralId: string, invitedUserId?: string): Promise<ReferralRecord | null> {
    const referral = await this.growthRepository.acceptReferral(referralId, invitedUserId)
    if (!referral) {
      return null
    }

    await this.trackEvent({
      entityId: referral.inviterEntityId,
      ownerId: referral.ownerId,
      type: 'invite_accepted',
      referralId: referral.id,
      metadata: {
        invitedUserId: invitedUserId ?? referral.invitedUserId ?? '',
      },
    })

    return referral
  }

  async markEntityCreatedFromReferral(referralId: string, createdEntityId: string): Promise<ReferralRecord | null> {
    const referral = await this.growthRepository.markReferralConverted(referralId, createdEntityId)
    if (!referral) {
      return null
    }

    await this.trackEvent({
      entityId: referral.inviterEntityId,
      ownerId: referral.ownerId,
      type: 'entity_created_from_invite',
      referralId: referral.id,
      metadata: {
        createdEntityId,
      },
    })

    return referral
  }

  attachExportViralLayer(input: AttachExportViralLayerInput): JsonRecord {
    return {
      ...(input.metadata ?? {}),
      viralLayer: {
        watermark: 'Made with BrandSoul',
        branding: 'BrandSoul Entity',
        entityLink: `${input.publicBaseUrl}/entity/${input.entityId}`,
        exportLink: `${input.publicBaseUrl}/entity/${input.entityId}/export/${input.exportId}`,
        cta: {
          label: 'Meet this entity',
          kind: 'share',
          href: `${input.publicBaseUrl}/entity/${input.entityId}`,
        },
      },
    }
  }

  async getEntityMetrics(entityId: string): Promise<GrowthMetrics> {
    const now = new Date().toISOString()
    const [events, signals, exports, referrals] = await Promise.all([
      this.growthRepository.getGrowthEvents(entityId, 500),
      this.socialSignalRepository.getSignals(entityId, 250),
      this.entityExportRepository.getExports(entityId),
      this.growthRepository.listReferralsByInviter(entityId),
    ])

    void referrals

    const aggregate = aggregateSignals(signals, entityId)
    const counts: GrowthCounts = {
      entityCreated: countEvents(events, 'entity_created'),
      exportShared: countEvents(events, 'export_shared'),
      exportViewed: countEvents(events, 'export_viewed'),
      entityFollowed: countEvents(events, 'entity_followed'),
      entityInteracted: countEvents(events, 'entity_interacted'),
      returnVisit: countEvents(events, 'return_visit'),
      entityDiscovered: countEvents(events, 'entity_discovered'),
      invitesSent: countEvents(events, 'invite_sent'),
      invitesAccepted: countEvents(events, 'invite_accepted'),
      entitiesCreatedFromInvite: countEvents(events, 'entity_created_from_invite'),
    }

    const shareRate = clamp(counts.exportShared / Math.max(1, exports.length || counts.exportViewed || 1))
    const conversionRate = clamp(counts.entitiesCreatedFromInvite / Math.max(1, counts.invitesSent))
    const returnVisitRate = clamp(
      counts.returnVisit / Math.max(1, counts.entityDiscovered + counts.exportViewed + counts.entityInteracted),
    )
    const retentionD1 = hasEventAfter(events, 'return_visit', 24 * 60 * 60 * 1_000)
    const retentionD7 = hasEventAfter(events, 'return_visit', 7 * 24 * 60 * 60 * 1_000)
    const viralCoefficient = clamp(
      shareRate * 0.42 +
        conversionRate * 0.34 +
        clamp(counts.invitesAccepted / Math.max(1, counts.invitesSent)) * 0.16 +
        clamp(counts.entityFollowed / Math.max(1, counts.entityDiscovered + 1)) * 0.08,
    )
    const aggregateEngagementScore = getAggregateEngagementScore(aggregate)
    const momentumScore = clamp(
      aggregateEngagementScore * 0.35 +
        shareRate * 0.2 +
        returnVisitRate * 0.16 +
        conversionRate * 0.16 +
        clamp(counts.entityDiscovered / 20) * 0.13,
    )
    const discoveryBoost = clamp(
      aggregateEngagementScore * 0.42 +
        shareRate * 0.24 +
        returnVisitRate * 0.18 +
        clamp(counts.entityDiscovered / 12) * 0.16,
    )

    const partialMetrics = {
      counts,
      rates: {
        shareRate,
        conversionRate,
        viralCoefficient,
        retentionD1,
        retentionD7,
        returnVisitRate,
      },
      momentumScore,
      engagementScore: aggregateEngagementScore,
      discoveryBoost,
    }

    return {
      schemaVersion: 1,
      entityId,
      ...partialMetrics,
      signals: buildSignals(entityId, partialMetrics, now),
      triggers: buildTriggers(entityId, partialMetrics, now),
      updatedAt: now,
    }
  }

  async getOwnerOverview(ownerId: string, limit = 10) {
    const entities = await this.entityRepository.getEntitiesByOwnerId(ownerId)
    const metrics = await Promise.all(entities.map((entity) => this.getEntityMetrics(entity.id)))
    const referrals = await this.growthRepository.listReferralsByOwner(ownerId)

    return {
      ownerId,
      trackedEntities: entities.length,
      topEntities: metrics
        .sort((a, b) => b.momentumScore - a.momentumScore)
        .slice(0, limit)
        .map((metric) => ({
          entityId: metric.entityId,
          momentumScore: metric.momentumScore,
          viralCoefficient: metric.rates.viralCoefficient,
          shareRate: metric.rates.shareRate,
          retentionD7: metric.rates.retentionD7,
        })),
      referralPerformance: {
        invitesSent: referrals.length,
        invitesAccepted: referrals.filter(
          (referral) => referral.conversionStatus === 'accepted' || referral.conversionStatus === 'converted',
        ).length,
        converted: referrals.filter((referral) => referral.conversionStatus === 'converted').length,
        conversionRate: clamp(
          referrals.filter((referral) => referral.conversionStatus === 'converted').length / Math.max(1, referrals.length),
        ),
      },
      generatedAt: new Date().toISOString(),
    }
  }

  async listTopEntities(limit = 20): Promise<GrowthMetrics[]> {
    const entities = await this.entityRepository.listEntities(limit * 4)
    const metrics = await Promise.all(entities.map((entity) => this.getEntityMetrics(entity.id)))

    return metrics.sort((a, b) => b.momentumScore - a.momentumScore).slice(0, limit)
  }

  async trackDiscoveryExposure(input: TrackDiscoveryExposureInput): Promise<void> {
    const topItems = input.items.slice(0, 6)
    await Promise.all(
      topItems.map((item) =>
        this.trackEvent({
          entityId: item.entityId,
          ownerId: input.ownerId,
          actorId: input.actorId,
          type: 'entity_discovered',
          metadata: {
            score: item.score,
            source: 'discover',
            ...(input.query ?? {}),
          },
        }),
      ),
    )
  }

  async detectFlowMindGrowthOpportunities(input: DetectGrowthOpportunitiesInput) {
    const metrics = await this.getEntityMetrics(input.entityId)
    const triggers = metrics.triggers.filter((trigger) => {
      if (trigger.type === 'suggest_share') {
        return input.engagementScore >= 0.4 || metrics.rates.shareRate < 0.32
      }

      return true
    })

    return {
      metrics,
      triggers,
    }
  }
}
