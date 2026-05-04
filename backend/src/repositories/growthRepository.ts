type JsonRecord = Record<string, unknown>

export type GrowthEventRecord = {
  id: string
  entityId: string
  ownerId?: string
  type: string
  timestamp: string
  actorId?: string
  referralId?: string
  metadata: JsonRecord
}

export type ReferralRecord = {
  id: string
  ownerId?: string
  inviterEntityId: string
  invitedUserId?: string
  invitedIdentifier?: string
  conversionStatus: string
  inviteSentAt: string
  inviteAcceptedAt?: string
  convertedAt?: string
  createdEntityId?: string
  metadata: JsonRecord
}

export type LogGrowthEventInput = {
  id?: string
  entityId: string
  ownerId?: string
  type: string
  timestamp?: string
  actorId?: string
  referralId?: string
  metadata?: JsonRecord
}

export type CreateReferralInput = {
  id?: string
  ownerId?: string
  inviterEntityId: string
  invitedUserId?: string
  invitedIdentifier?: string
  metadata?: JsonRecord
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sortByTimestampDesc<T extends { timestamp: string }>(left: T, right: T) {
  return right.timestamp.localeCompare(left.timestamp)
}

function sortReferralsByInviteSentAtDesc(left: ReferralRecord, right: ReferralRecord) {
  return right.inviteSentAt.localeCompare(left.inviteSentAt)
}

export class GrowthRepository {
  private readonly growthEvents = new Map<string, GrowthEventRecord>()
  private readonly referrals = new Map<string, ReferralRecord>()

  constructor(_db?: unknown) {}

  async logGrowthEvent(input: LogGrowthEventInput): Promise<GrowthEventRecord> {
    const record: GrowthEventRecord = {
      id: input.id ?? createId('grow'),
      entityId: input.entityId,
      ownerId: input.ownerId,
      type: input.type,
      timestamp: input.timestamp ?? new Date().toISOString(),
      actorId: input.actorId,
      referralId: input.referralId,
      metadata: input.metadata ?? {},
    }

    this.growthEvents.set(record.id, record)
    return record
  }

  async getGrowthEvents(entityId: string, limit = 200): Promise<GrowthEventRecord[]> {
    return Array.from(this.growthEvents.values())
      .filter((event) => event.entityId === entityId)
      .sort(sortByTimestampDesc)
      .slice(0, limit)
  }

  async getOwnerGrowthEvents(ownerId: string, limit = 1000): Promise<GrowthEventRecord[]> {
    return Array.from(this.growthEvents.values())
      .filter((event) => event.ownerId === ownerId)
      .sort(sortByTimestampDesc)
      .slice(0, limit)
  }

  async createReferral(input: CreateReferralInput): Promise<ReferralRecord> {
    const referral: ReferralRecord = {
      id: input.id ?? createId('ref'),
      ownerId: input.ownerId,
      inviterEntityId: input.inviterEntityId,
      invitedUserId: input.invitedUserId,
      invitedIdentifier: input.invitedIdentifier,
      conversionStatus: 'pending',
      inviteSentAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    }

    this.referrals.set(referral.id, referral)
    return referral
  }

  async getReferralById(referralId: string): Promise<ReferralRecord | null> {
    return this.referrals.get(referralId) ?? null
  }

  async acceptReferral(referralId: string, invitedUserId?: string): Promise<ReferralRecord | null> {
    const existing = await this.getReferralById(referralId)
    if (!existing) {
      return null
    }

    const updated: ReferralRecord = {
      ...existing,
      conversionStatus: 'accepted',
      invitedUserId: invitedUserId ?? existing.invitedUserId,
      inviteAcceptedAt: new Date().toISOString(),
    }

    this.referrals.set(referralId, updated)
    return updated
  }

  async markReferralConverted(referralId: string, createdEntityId: string): Promise<ReferralRecord | null> {
    const existing = await this.getReferralById(referralId)
    if (!existing) {
      return null
    }

    const updated: ReferralRecord = {
      ...existing,
      conversionStatus: 'converted',
      createdEntityId,
      convertedAt: new Date().toISOString(),
    }

    this.referrals.set(referralId, updated)
    return updated
  }

  async listReferralsByInviter(inviterEntityId: string): Promise<ReferralRecord[]> {
    return Array.from(this.referrals.values())
      .filter((referral) => referral.inviterEntityId === inviterEntityId)
      .sort(sortReferralsByInviteSentAtDesc)
  }

  async listReferralsByOwner(ownerId: string): Promise<ReferralRecord[]> {
    return Array.from(this.referrals.values())
      .filter((referral) => referral.ownerId === ownerId)
      .sort(sortReferralsByInviteSentAtDesc)
  }
}

export function createGrowthRepository(db?: unknown) {
  return new GrowthRepository(db)
}
