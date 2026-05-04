type JsonRecord = Record<string, unknown>

type PlanName = 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE'
type EntitlementFeature = 'sendMessage' | 'export' | 'flowMindAction' | 'memory' | 'social'
type EntitlementStatus = 'allowed' | 'limited' | 'blocked'

type BillingRecord = {
  plan?: string
  subscriptionState?: string
}

type UsageMetrics = {
  messagesCount: number
  exportsCount: number
  socialInteractions: number
  flowMindActions: number
  memoryUsage: number
  entitiesCount: number
}

type UsageByOwner = Partial<UsageMetrics>

type UsageByEntity = {
  metrics?: Partial<UsageMetrics>
} | null

type QuotaLimits = {
  maxMessages: number
  maxExports: number
  maxEntities: number
  maxMemoryDepth: number
  maxFlowMindIntensity: number
}

type UpgradeSignal = {
  reason: string
  blockedFeature: EntitlementFeature
  suggestedPlan: Exclude<PlanName, 'FREE'> | 'PRO'
  urgencyLevel: 'low' | 'medium' | 'high'
}

type PricingSnapshot = {
  plan: PlanName
  subscriptionState: string
  usage: UsageMetrics
  limits: QuotaLimits
  softLimitReached: Record<EntitlementFeature, boolean>
  hardLimitReached: Record<EntitlementFeature, boolean>
  upgradeSignals: UpgradeSignal[]
}

type Entitlement = {
  feature: EntitlementFeature
  status: EntitlementStatus
  reason?: string
  upgradeRequired?: boolean
  suggestedPlan?: PlanName
  remaining: number
  upgradeSignal?: UpgradeSignal
}

type MonetizationEntityLike = {
  relational?: {
    userMemory?: {
      knownPreferences?: unknown[]
      lastInteractions?: unknown[]
    }
    timelineLog?: {
      entries?: unknown[]
    }
  }
} | null

type GetPricingSnapshotInput = {
  userId: number
  tenantId: number
  entityId?: string
  entity?: MonetizationEntityLike
}

type EnsureEntityBaselineInput = {
  entityId: string
  ownerUserId: number
  ownerTenantId: number
  entitiesCount?: number
  memoryUsage?: number
}

type IncrementUsageInput = {
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

type MonetizationRepositoryLike = {
  getBillingRecord(userId: number, tenantId: number): Promise<BillingRecord | null | undefined>
  getUsageByOwner(userId: number, tenantId: number): Promise<UsageByOwner | null | undefined>
  getUsageByEntity(entityId: string): Promise<UsageByEntity>
  upsertEntityBaseline(input: EnsureEntityBaselineInput): Promise<unknown>
  incrementUsage(input: IncrementUsageInput): Promise<unknown>
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max)
}

function determineCurrentPlan(input?: { billing?: BillingRecord | null; plan?: string }): PlanName {
  const raw = String(input?.billing?.plan ?? input?.plan ?? 'FREE').trim().toUpperCase()
  if (raw === 'PRO') return 'PRO'
  if (raw === 'BUSINESS') return 'BUSINESS'
  if (raw === 'ENTERPRISE') return 'ENTERPRISE'
  return 'FREE'
}

function resolveSubscriptionState(input?: { billing?: BillingRecord | null }): string {
  return input?.billing?.subscriptionState ?? 'inactive'
}

function resolveQuotaLimits(plan: PlanName): QuotaLimits {
  if (plan === 'ENTERPRISE') {
    return { maxMessages: 50_000, maxExports: 10_000, maxEntities: 5_000, maxMemoryDepth: 1_000, maxFlowMindIntensity: 100 }
  }
  if (plan === 'BUSINESS') {
    return { maxMessages: 10_000, maxExports: 2_000, maxEntities: 300, maxMemoryDepth: 320, maxFlowMindIntensity: 92 }
  }
  if (plan === 'PRO') {
    return { maxMessages: 2_000, maxExports: 400, maxEntities: 40, maxMemoryDepth: 120, maxFlowMindIntensity: 76 }
  }
  return { maxMessages: 300, maxExports: 40, maxEntities: 5, maxMemoryDepth: 40, maxFlowMindIntensity: 52 }
}

function deriveMemoryUsage(entity: MonetizationEntityLike): number {
  if (!entity) {
    return 0
  }

  const preferences = entity.relational?.userMemory?.knownPreferences?.length ?? 0
  const interactions = entity.relational?.userMemory?.lastInteractions?.length ?? 0
  const timelineNotes = entity.relational?.timelineLog?.entries?.length ?? 0
  return preferences + interactions + timelineNotes
}

function calculateUsage(input?: { trackedUsage?: Partial<UsageMetrics> | null; entity?: MonetizationEntityLike }): UsageMetrics {
  return {
    messagesCount: input?.trackedUsage?.messagesCount ?? 0,
    exportsCount: input?.trackedUsage?.exportsCount ?? 0,
    socialInteractions: input?.trackedUsage?.socialInteractions ?? 0,
    flowMindActions: input?.trackedUsage?.flowMindActions ?? 0,
    memoryUsage: input?.trackedUsage?.memoryUsage ?? deriveMemoryUsage(input?.entity ?? null),
    entitiesCount: input?.trackedUsage?.entitiesCount ?? 1,
  }
}

function buildUpgradeSignal(feature: EntitlementFeature, plan: PlanName, usage: number, limit: number): UpgradeSignal {
  const urgency = usage >= limit ? 'high' : usage >= limit * 0.85 ? 'medium' : 'low'
  const suggestedPlan: UpgradeSignal['suggestedPlan'] = plan === 'FREE' ? 'PRO' : plan === 'PRO' ? 'BUSINESS' : 'ENTERPRISE'

  if (feature === 'export') {
    return {
      reason: 'Export volume reached the current plan threshold.',
      blockedFeature: feature,
      suggestedPlan,
      urgencyLevel: urgency,
    }
  }

  if (feature === 'memory') {
    return {
      reason: 'Entity memory depth is nearing the current plan ceiling.',
      blockedFeature: feature,
      suggestedPlan,
      urgencyLevel: urgency,
    }
  }

  return {
    reason: 'Usage is approaching the current plan capacity.',
    blockedFeature: feature,
    suggestedPlan,
    urgencyLevel: urgency,
  }
}

function buildPricingSnapshot(input?: {
  billing?: BillingRecord | null
  plan?: string
  trackedUsage?: Partial<UsageMetrics> | null
  entity?: MonetizationEntityLike
}): PricingSnapshot {
  const plan = determineCurrentPlan({ plan: input?.plan, billing: input?.billing })
  const limits = resolveQuotaLimits(plan)
  const usage = calculateUsage({ trackedUsage: input?.trackedUsage, entity: input?.entity })

  const softLimitReached = {
    sendMessage: usage.messagesCount >= limits.maxMessages * 0.8,
    export: usage.exportsCount >= limits.maxExports * 0.8,
    social: usage.socialInteractions >= limits.maxMessages * 0.3,
    flowMindAction: usage.flowMindActions >= limits.maxMessages * 0.5,
    memory: usage.memoryUsage >= limits.maxMemoryDepth * 0.8,
  }

  const hardLimitReached = {
    sendMessage: usage.messagesCount >= limits.maxMessages,
    export: usage.exportsCount >= limits.maxExports,
    social: usage.socialInteractions >= limits.maxMessages,
    flowMindAction: usage.flowMindActions >= limits.maxMessages,
    memory: usage.memoryUsage >= limits.maxMemoryDepth,
  }

  const upgradeSignals: UpgradeSignal[] = []
  const signalInputs: Array<[EntitlementFeature, number, number]> = [
    ['sendMessage', usage.messagesCount, limits.maxMessages],
    ['export', usage.exportsCount, limits.maxExports],
    ['memory', usage.memoryUsage, limits.maxMemoryDepth],
    ['flowMindAction', usage.flowMindActions, limits.maxMessages],
    ['social', usage.socialInteractions, limits.maxMessages],
  ]

  for (const [feature, current, limit] of signalInputs) {
    if (current >= limit * 0.8) {
      upgradeSignals.push(buildUpgradeSignal(feature, plan, current, limit))
    }
  }

  return {
    plan,
    subscriptionState: resolveSubscriptionState({ billing: input?.billing }),
    usage,
    limits,
    softLimitReached,
    hardLimitReached,
    upgradeSignals,
  }
}

function remaining(current: number, limit: number): number {
  return Math.max(0, limit - current)
}

function suggestPlan(currentPlan: PlanName): PlanName {
  if (currentPlan === 'FREE') return 'PRO'
  if (currentPlan === 'PRO') return 'BUSINESS'
  return 'ENTERPRISE'
}

function evaluateEntitlement(feature: EntitlementFeature, snapshot: PricingSnapshot): Entitlement {
  const { usage, limits, hardLimitReached, softLimitReached } = snapshot

  if (feature === 'sendMessage') {
    if (hardLimitReached.sendMessage) {
      return {
        feature,
        status: 'blocked',
        reason: 'Message quota reached for current plan.',
        upgradeRequired: true,
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: 0,
        upgradeSignal: snapshot.upgradeSignals.find((signal) => signal.blockedFeature === feature),
      }
    }
    if (softLimitReached.sendMessage) {
      return {
        feature,
        status: 'limited',
        reason: 'Message quota is approaching the current plan limit.',
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: remaining(usage.messagesCount, limits.maxMessages),
      }
    }
    return { feature, status: 'allowed', remaining: remaining(usage.messagesCount, limits.maxMessages) }
  }

  if (feature === 'export') {
    if (hardLimitReached.export) {
      return {
        feature,
        status: 'blocked',
        reason: 'Export quota reached for current plan.',
        upgradeRequired: true,
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: 0,
        upgradeSignal: snapshot.upgradeSignals.find((signal) => signal.blockedFeature === feature),
      }
    }
    if (softLimitReached.export) {
      return {
        feature,
        status: 'limited',
        reason: 'Export quota is approaching the current plan limit.',
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: remaining(usage.exportsCount, limits.maxExports),
      }
    }
    return { feature, status: 'allowed', remaining: remaining(usage.exportsCount, limits.maxExports) }
  }

  if (feature === 'memory') {
    if (hardLimitReached.memory) {
      return {
        feature,
        status: 'blocked',
        reason: 'Memory depth exceeded for the current plan.',
        upgradeRequired: true,
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: 0,
        upgradeSignal: snapshot.upgradeSignals.find((signal) => signal.blockedFeature === feature),
      }
    }
    if (softLimitReached.memory) {
      return {
        feature,
        status: 'limited',
        reason: 'Memory depth is close to the plan ceiling.',
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: remaining(usage.memoryUsage, limits.maxMemoryDepth),
      }
    }
    return { feature, status: 'allowed', remaining: remaining(usage.memoryUsage, limits.maxMemoryDepth) }
  }

  if (feature === 'flowMindAction') {
    if (hardLimitReached.flowMindAction) {
      return {
        feature,
        status: 'blocked',
        reason: 'FlowMind action quota reached for current plan.',
        upgradeRequired: true,
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: 0,
        upgradeSignal: snapshot.upgradeSignals.find((signal) => signal.blockedFeature === feature),
      }
    }
    if (softLimitReached.flowMindAction) {
      return {
        feature,
        status: 'limited',
        reason: 'FlowMind action quota is approaching the plan limit.',
        suggestedPlan: suggestPlan(snapshot.plan),
        remaining: remaining(usage.flowMindActions, limits.maxMessages),
      }
    }
    return { feature, status: 'allowed', remaining: remaining(usage.flowMindActions, limits.maxMessages) }
  }

  if (hardLimitReached.social) {
    return {
      feature,
      status: 'blocked',
      reason: 'Social interactions exceeded the current plan allowance.',
      upgradeRequired: true,
      suggestedPlan: suggestPlan(snapshot.plan),
      remaining: 0,
      upgradeSignal: snapshot.upgradeSignals.find((signal) => signal.blockedFeature === feature),
    }
  }

  if (softLimitReached.social) {
    return {
      feature,
      status: 'limited',
      reason: 'Social interactions are nearing the current allowance.',
      suggestedPlan: suggestPlan(snapshot.plan),
      remaining: remaining(usage.socialInteractions, limits.maxMessages),
    }
  }

  return { feature, status: 'allowed', remaining: remaining(usage.socialInteractions, limits.maxMessages) }
}

export class MonetizationService {
  constructor(private readonly repository: MonetizationRepositoryLike) {}

  async getPricingSnapshot(input: GetPricingSnapshotInput): Promise<PricingSnapshot> {
    const [billing, ownerUsage, entityUsage] = await Promise.all([
      this.repository.getBillingRecord(input.userId, input.tenantId),
      this.repository.getUsageByOwner(input.userId, input.tenantId),
      input.entityId ? this.repository.getUsageByEntity(input.entityId) : Promise.resolve(null),
    ])

    return buildPricingSnapshot({
      billing,
      trackedUsage: {
        ...(ownerUsage ?? {}),
        ...((entityUsage?.metrics ?? {}) as Partial<UsageMetrics>),
      },
      entity: input.entity ?? null,
    })
  }

  async ensureEntityBaseline(input: EnsureEntityBaselineInput) {
    return this.repository.upsertEntityBaseline(input)
  }

  async incrementUsage(input: IncrementUsageInput) {
    return this.repository.incrementUsage(input)
  }

  async getEntitlements(input: GetPricingSnapshotInput) {
    const snapshot = await this.getPricingSnapshot(input)
    const entitlements: Entitlement[] = [
      evaluateEntitlement('sendMessage', snapshot),
      evaluateEntitlement('export', snapshot),
      evaluateEntitlement('flowMindAction', snapshot),
      evaluateEntitlement('memory', snapshot),
      evaluateEntitlement('social', snapshot),
    ]

    return {
      snapshot,
      entitlements,
    }
  }
}

export function createMonetizationService(repository: MonetizationRepositoryLike) {
  return new MonetizationService(repository)
}
