type JsonRecord = Record<string, unknown>

type UsageMetrics = {
  messagesCount: number
  exportsCount: number
  socialInteractions: number
  flowMindActions: number
  memoryUsage: number
  entitiesCount: number
}

export type BillingRecord = {
  userId: number
  tenantId: number
  plan: string
  subscriptionState: string
  updatedAt: string
  metadata?: JsonRecord
}

export type UsageByEntityRecord = {
  entityId: string
  ownerUserId: number
  ownerTenantId: number
  updatedAt: string
  metrics: UsageMetrics
}

export type UpsertBillingRecordInput = {
  userId: number
  tenantId: number
  plan: string
  subscriptionState: string
  metadata?: JsonRecord
}

export type UpsertEntityBaselineInput = {
  entityId: string
  ownerUserId: number
  ownerTenantId: number
  memoryUsage?: number
  entitiesCount?: number
}

export type IncrementUsageInput = {
  entityId: string
  ownerUserId: number
  ownerTenantId: number
  messagesCount?: number
  exportsCount?: number
  socialInteractions?: number
  flowMindActions?: number
  memoryUsage?: number
  entitiesCount?: number
}

function emptyUsage(): UsageMetrics {
  return {
    messagesCount: 0,
    exportsCount: 0,
    socialInteractions: 0,
    flowMindActions: 0,
    memoryUsage: 0,
    entitiesCount: 0,
  }
}

function createBillingKey(userId: number, tenantId: number) {
  return `${userId}:${tenantId}`
}

export class MonetizationRepository {
  private readonly billingRecords = new Map<string, BillingRecord>()
  private readonly entityUsage = new Map<string, UsageByEntityRecord>()

  constructor(_db?: unknown) {}

  async getBillingRecord(userId: number, tenantId: number): Promise<BillingRecord | null> {
    return this.billingRecords.get(createBillingKey(userId, tenantId)) ?? null
  }

  async upsertBillingRecord(input: UpsertBillingRecordInput): Promise<BillingRecord> {
    const now = new Date().toISOString()
    const record: BillingRecord = {
      userId: input.userId,
      tenantId: input.tenantId,
      plan: input.plan,
      subscriptionState: input.subscriptionState,
      updatedAt: now,
      metadata: input.metadata,
    }

    this.billingRecords.set(createBillingKey(input.userId, input.tenantId), record)
    return record
  }

  async getUsageByEntity(entityId: string): Promise<UsageByEntityRecord | null> {
    return this.entityUsage.get(entityId) ?? null
  }

  async getUsageByOwner(userId: number, tenantId: number): Promise<UsageMetrics> {
    const rows = Array.from(this.entityUsage.values()).filter(
      (row) => row.ownerUserId === userId && row.ownerTenantId === tenantId,
    )

    if (rows.length === 0) {
      return emptyUsage()
    }

    return {
      messagesCount: rows.reduce((total, row) => total + row.metrics.messagesCount, 0),
      exportsCount: rows.reduce((total, row) => total + row.metrics.exportsCount, 0),
      socialInteractions: rows.reduce((total, row) => total + row.metrics.socialInteractions, 0),
      flowMindActions: rows.reduce((total, row) => total + row.metrics.flowMindActions, 0),
      memoryUsage: rows.reduce((total, row) => total + row.metrics.memoryUsage, 0),
      entitiesCount: rows.reduce((max, row) => Math.max(max, row.metrics.entitiesCount), 0),
    }
  }

  async upsertEntityBaseline(input: UpsertEntityBaselineInput): Promise<void> {
    const now = new Date().toISOString()
    const existing = await this.getUsageByEntity(input.entityId)
    const metrics = existing?.metrics ?? emptyUsage()

    this.entityUsage.set(input.entityId, {
      entityId: input.entityId,
      ownerUserId: input.ownerUserId,
      ownerTenantId: input.ownerTenantId,
      updatedAt: now,
      metrics: {
        messagesCount: metrics.messagesCount,
        exportsCount: metrics.exportsCount,
        socialInteractions: metrics.socialInteractions,
        flowMindActions: metrics.flowMindActions,
        memoryUsage: input.memoryUsage ?? metrics.memoryUsage,
        entitiesCount: input.entitiesCount ?? metrics.entitiesCount,
      },
    })
  }

  async incrementUsage(input: IncrementUsageInput): Promise<UsageByEntityRecord> {
    const existing = await this.getUsageByEntity(input.entityId)
    const metrics = existing?.metrics ?? emptyUsage()
    const now = new Date().toISOString()

    const next: UsageMetrics = {
      messagesCount: metrics.messagesCount + (input.messagesCount ?? 0),
      exportsCount: metrics.exportsCount + (input.exportsCount ?? 0),
      socialInteractions: metrics.socialInteractions + (input.socialInteractions ?? 0),
      flowMindActions: metrics.flowMindActions + (input.flowMindActions ?? 0),
      memoryUsage: input.memoryUsage ?? metrics.memoryUsage,
      entitiesCount: Math.max(metrics.entitiesCount, input.entitiesCount ?? metrics.entitiesCount ?? 0),
    }

    const record: UsageByEntityRecord = {
      entityId: input.entityId,
      ownerUserId: input.ownerUserId,
      ownerTenantId: input.ownerTenantId,
      updatedAt: now,
      metrics: next,
    }

    this.entityUsage.set(input.entityId, record)
    return record
  }
}

export function createMonetizationRepository(db?: unknown) {
  return new MonetizationRepository(db)
}
