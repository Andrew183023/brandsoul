type BillingPlan = string

type BillingRecord = {
  userId: number
  tenantId: number
  plan: BillingPlan
  subscriptionState: string
  updatedAt?: string
  metadata?: Record<string, unknown> | null
}

type AssignPlanInput = {
  userId: number
  tenantId: number
  plan: BillingPlan
  subscriptionState?: string
  metadata?: Record<string, unknown>
}

type BillingRepositoryLike = {
  getBillingRecord(userId: number, tenantId: number): Promise<BillingRecord | null | undefined>
  upsertBillingRecord(input: {
    userId: number
    tenantId: number
    plan: BillingPlan
    subscriptionState: string
    metadata?: Record<string, unknown>
  }): Promise<BillingRecord>
}

export class BillingService {
  constructor(private readonly repository: BillingRepositoryLike) {}

  async getSubscription(userId: number, tenantId: number): Promise<BillingRecord | null | undefined> {
    return this.repository.getBillingRecord(userId, tenantId)
  }

  async assignPlan(input: AssignPlanInput): Promise<BillingRecord> {
    return this.repository.upsertBillingRecord({
      userId: input.userId,
      tenantId: input.tenantId,
      plan: input.plan,
      subscriptionState: input.subscriptionState ?? 'active',
      metadata: input.metadata,
    })
  }
}

export function createBillingService(repository: BillingRepositoryLike) {
  return new BillingService(repository)
}
