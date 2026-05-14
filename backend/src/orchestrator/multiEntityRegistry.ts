import type { BackendDatabase } from '../db/index.js'
import type { FlowMindAutonomyLevel } from '../services/flowMindPort.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type MultiEntityLifecycleState = 'proposed' | 'sandbox' | 'internal-active' | 'public-active' | 'rollback' | 'archived'
export type MultiEntityRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type MultiEntityMemoryStatus = 'cold' | 'warming' | 'stable' | 'degraded'

export type MultiEntityRollbackState = {
  active: boolean
  reason?: string
  since?: string
}

export type MultiEntityInternalGoalType =
  | 'generate_leads'
  | 'expand_presence'
  | 'create_entities'
  | 'optimize_performance'

export type MultiEntityGoalRecord = Record<string, unknown> & {
  type: MultiEntityInternalGoalType | 'create_entity'
  priority?: number
  impact?: number
  urgency?: number
  historicalSuccess?: number
  approvalRequired?: boolean
  enabled?: boolean
}

export type MultiEntityOutcomeStatus = 'success' | 'failure' | 'neutral'

export type MultiEntityActionRecord = {
  actionId: string
  goalType: MultiEntityInternalGoalType
  actionType: string
  confidence: number
  opportunityScore: number
  executedAt: string
  context?: Record<string, unknown>
}

export type MultiEntityOutcomeRecord = {
  outcomeId: string
  actionId?: string
  status: MultiEntityOutcomeStatus
  impactScore: number
  conversionEffect: number
  observedAt: string
  signalType: string
  context?: Record<string, unknown>
}

export type MultiEntityDecisionSnapshot = Record<string, unknown> & {
  lastActions?: MultiEntityActionRecord[]
  lastOutcomes?: MultiEntityOutcomeRecord[]
}

export type MultiEntityRegistryRecord = {
  entityId: string
  entityType: string
  market: string
  lifecycleState: MultiEntityLifecycleState
  autonomyLevel: FlowMindAutonomyLevel
  riskLevel: MultiEntityRiskLevel
  memoryStatus: MultiEntityMemoryStatus
  activeGoals: Array<Record<string, unknown>>
  operatingConstraints: Record<string, unknown>
  healthScore: number
  leadGenerationScore: number
  memoryConfidence: number
  autonomyReadiness: number
  riskScore: number
  actionQueue: Array<Record<string, unknown>>
  lastActions: MultiEntityActionRecord[]
  lastOutcomes: MultiEntityOutcomeRecord[]
  lastDecisionSnapshot?: MultiEntityDecisionSnapshot
  rollbackState: MultiEntityRollbackState
  createdAt: string
  updatedAt: string
}

export type RegisterMultiEntityInput = Omit<MultiEntityRegistryRecord, 'createdAt' | 'updatedAt' | 'lastActions' | 'lastOutcomes'> & {
  lastActions?: MultiEntityActionRecord[]
  lastOutcomes?: MultiEntityOutcomeRecord[]
  createdAt?: string
  updatedAt?: string
}

export type UpdateMultiEntityStateInput = {
  entityId: string
  entityType?: string
  market?: string
  lifecycleState?: MultiEntityLifecycleState
  autonomyLevel?: FlowMindAutonomyLevel
  riskLevel?: MultiEntityRiskLevel
  memoryStatus?: MultiEntityMemoryStatus
  activeGoals?: Array<Record<string, unknown>>
  operatingConstraints?: Record<string, unknown>
  healthScore?: number
  leadGenerationScore?: number
  memoryConfidence?: number
  autonomyReadiness?: number
  riskScore?: number
  actionQueue?: Array<Record<string, unknown>>
  lastActions?: MultiEntityActionRecord[]
  lastOutcomes?: MultiEntityOutcomeRecord[]
  lastDecisionSnapshot?: MultiEntityDecisionSnapshot
  rollbackState?: MultiEntityRollbackState
  updatedAt?: string
}

export type ListMultiEntityFilters = {
  lifecycleState?: MultiEntityLifecycleState
  autonomyLevel?: FlowMindAutonomyLevel
  riskLevel?: MultiEntityRiskLevel
}

export type MultiEntityRegistryMetrics = {
  totalEntities: number
  activeEntities: number
  autonomousActionsToday: number
  entitiesUnderRollback: number
  promotionCandidates: number
  highRiskPendingApproval: number
}

function parseJsonRecord<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeGoalType(value: unknown): MultiEntityInternalGoalType {
  if (value === 'create_entity' || value === 'create_entities') {
    return 'create_entities'
  }
  if (value === 'expand_presence' || value === 'optimize_performance' || value === 'generate_leads') {
    return value
  }
  return 'optimize_performance'
}

function normalizeGoalReference(value: unknown): MultiEntityInternalGoalType {
  return normalizeGoalType(value)
}

function normalizeOutcomeStatus(value: unknown): MultiEntityOutcomeStatus {
  if (value === 'success' || value === 'failure' || value === 'neutral') {
    return value
  }
  return 'neutral'
}

function normalizeActionRecords(input: unknown): MultiEntityActionRecord[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .map((entry, index) => ({
      actionId: typeof entry.actionId === 'string' ? entry.actionId : `action-${index}`,
      goalType: normalizeGoalReference(entry.goalType),
      actionType: typeof entry.actionType === 'string' ? entry.actionType : 'observe_context',
      confidence: clamp(asFiniteNumber(entry.confidence, 0.5)),
      opportunityScore: clamp(asFiniteNumber(entry.opportunityScore, 0.5)),
      executedAt: typeof entry.executedAt === 'string' ? entry.executedAt : '1970-01-01T00:00:00.000Z',
      context: typeof entry.context === 'object' && entry.context !== null && !Array.isArray(entry.context)
        ? entry.context as Record<string, unknown>
        : {},
    }))
    .sort((left, right) => right.executedAt.localeCompare(left.executedAt))
    .slice(0, 8)
}

function normalizeOutcomeRecords(input: unknown): MultiEntityOutcomeRecord[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .map((entry, index) => ({
      outcomeId: typeof entry.outcomeId === 'string' ? entry.outcomeId : `outcome-${index}`,
      actionId: typeof entry.actionId === 'string' ? entry.actionId : undefined,
      status: normalizeOutcomeStatus(entry.status),
      impactScore: clamp(asFiniteNumber(entry.impactScore, 0.5)),
      conversionEffect: clamp(asFiniteNumber(entry.conversionEffect, 0), -1, 1),
      observedAt: typeof entry.observedAt === 'string' ? entry.observedAt : '1970-01-01T00:00:00.000Z',
      signalType: typeof entry.signalType === 'string' ? entry.signalType : 'unknown',
      context: typeof entry.context === 'object' && entry.context !== null && !Array.isArray(entry.context)
        ? entry.context as Record<string, unknown>
        : {},
    }))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 8)
}

function normalizeDecisionSnapshot(
  snapshot: unknown,
  lastActions?: MultiEntityActionRecord[],
  lastOutcomes?: MultiEntityOutcomeRecord[],
): MultiEntityDecisionSnapshot | undefined {
  const base = typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot)
    ? { ...(snapshot as Record<string, unknown>) }
    : {}
  const normalizedLastActions = normalizeActionRecords(lastActions ?? base.lastActions)
  const normalizedLastOutcomes = normalizeOutcomeRecords(lastOutcomes ?? base.lastOutcomes)

  if (Object.keys(base).length === 0 && normalizedLastActions.length === 0 && normalizedLastOutcomes.length === 0) {
    return undefined
  }

  return {
    ...base,
    lastActions: normalizedLastActions,
    lastOutcomes: normalizedLastOutcomes,
  }
}

function buildDefaultGoal(type: MultiEntityInternalGoalType): MultiEntityGoalRecord {
  switch (type) {
    case 'generate_leads':
      return {
        type,
        priority: 0.78,
        impact: 0.82,
        urgency: 0.7,
        historicalSuccess: 0.55,
        enabled: true,
      }
    case 'expand_presence':
      return {
        type,
        priority: 0.68,
        impact: 0.72,
        urgency: 0.56,
        historicalSuccess: 0.5,
        enabled: true,
      }
    case 'create_entities':
      return {
        type,
        priority: 0.5,
        impact: 0.88,
        urgency: 0.42,
        historicalSuccess: 0.45,
        enabled: true,
        approvalRequired: true,
      }
    case 'optimize_performance':
    default:
      return {
        type,
        priority: 0.74,
        impact: 0.76,
        urgency: 0.62,
        historicalSuccess: 0.58,
        enabled: true,
      }
  }
}

export function normalizeRegistryGoals(input: Array<Record<string, unknown>> | undefined): MultiEntityGoalRecord[] {
  const merged = new Map<MultiEntityInternalGoalType, MultiEntityGoalRecord>()
  for (const type of ['generate_leads', 'expand_presence', 'create_entities', 'optimize_performance'] as MultiEntityInternalGoalType[]) {
    merged.set(type, buildDefaultGoal(type))
  }

  for (const rawGoal of input ?? []) {
    const type = normalizeGoalType(rawGoal.type)
    const existing = merged.get(type) ?? buildDefaultGoal(type)
    merged.set(type, {
      ...existing,
      ...rawGoal,
      type,
      priority: clamp(asFiniteNumber(rawGoal.priority, asFiniteNumber(existing.priority, 0.5))),
      impact: clamp(asFiniteNumber(rawGoal.impact, asFiniteNumber(existing.impact, 0.5))),
      urgency: clamp(asFiniteNumber(rawGoal.urgency, asFiniteNumber(existing.urgency, 0.5))),
      historicalSuccess: clamp(asFiniteNumber(rawGoal.historicalSuccess, asFiniteNumber(existing.historicalSuccess, 0.5))),
      enabled: rawGoal.enabled !== false,
      approvalRequired: rawGoal.approvalRequired === true || existing.approvalRequired === true,
    })
  }

  return Array.from(merged.values()).sort((left, right) => (
    asFiniteNumber(right.priority, 0) - asFiniteNumber(left.priority, 0)
  ))
}

function mapRow(row?: {
  entity_id: string
  entity_type: string
  market: string
  lifecycle_state: string
  autonomy_level: string
  risk_level: string
  memory_status: string
  active_goals_json: string
  operating_constraints_json: string
  health_score: number
  lead_generation_score: number
  memory_confidence: number
  autonomy_readiness: number
  risk_score: number
  action_queue_json: string
  last_decision_snapshot_json: string | null
  rollback_state_json: string
  created_at: string
  updated_at: string
}): MultiEntityRegistryRecord | null {
  if (!row) {
    return null
  }

  return {
    entityId: row.entity_id,
    entityType: row.entity_type,
    market: row.market,
    lifecycleState: row.lifecycle_state as MultiEntityLifecycleState,
    autonomyLevel: row.autonomy_level as FlowMindAutonomyLevel,
    riskLevel: row.risk_level as MultiEntityRiskLevel,
    memoryStatus: row.memory_status as MultiEntityMemoryStatus,
    activeGoals: normalizeRegistryGoals(parseJsonRecord<Array<Record<string, unknown>>>(row.active_goals_json, [])),
    operatingConstraints: parseJsonRecord(row.operating_constraints_json, {}),
    healthScore: clamp(row.health_score),
    leadGenerationScore: clamp(row.lead_generation_score),
    memoryConfidence: clamp(row.memory_confidence),
    autonomyReadiness: clamp(row.autonomy_readiness),
    riskScore: clamp(row.risk_score),
    actionQueue: parseJsonRecord(row.action_queue_json, []),
    lastActions: normalizeActionRecords(parseJsonRecord<Record<string, unknown> | undefined>(row.last_decision_snapshot_json, undefined)?.lastActions),
    lastOutcomes: normalizeOutcomeRecords(parseJsonRecord<Record<string, unknown> | undefined>(row.last_decision_snapshot_json, undefined)?.lastOutcomes),
    lastDecisionSnapshot: normalizeDecisionSnapshot(parseJsonRecord(row.last_decision_snapshot_json, undefined)),
    rollbackState: parseJsonRecord(row.rollback_state_json, { active: false }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class MultiEntityRegistry {
  constructor(private readonly db: BackendDatabase) {}

  async registerEntity(input: RegisterMultiEntityInput): Promise<MultiEntityRegistryRecord> {
    traceMutation({
      source: 'backend/src/orchestrator/multiEntityRegistry.ts#registerEntity',
      type: 'registry',
      targetId: input.entityId,
      whatChanged: 'upsert orchestrator registry entry',
    })
    const createdAt = input.createdAt ?? new Date().toISOString()
    const updatedAt = input.updatedAt ?? createdAt

    await this.db.run(
      `
        INSERT INTO entity_orchestrator_registry (
          entity_id,
          entity_type,
          market,
          lifecycle_state,
          autonomy_level,
          risk_level,
          memory_status,
          active_goals_json,
          operating_constraints_json,
          health_score,
          lead_generation_score,
          memory_confidence,
          autonomy_readiness,
          risk_score,
          action_queue_json,
          last_decision_snapshot_json,
          rollback_state_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity_id) DO UPDATE SET
          entity_type = excluded.entity_type,
          market = excluded.market,
          lifecycle_state = excluded.lifecycle_state,
          autonomy_level = excluded.autonomy_level,
          risk_level = excluded.risk_level,
          memory_status = excluded.memory_status,
          active_goals_json = excluded.active_goals_json,
          operating_constraints_json = excluded.operating_constraints_json,
          health_score = excluded.health_score,
          lead_generation_score = excluded.lead_generation_score,
          memory_confidence = excluded.memory_confidence,
          autonomy_readiness = excluded.autonomy_readiness,
          risk_score = excluded.risk_score,
          action_queue_json = excluded.action_queue_json,
          last_decision_snapshot_json = excluded.last_decision_snapshot_json,
          rollback_state_json = excluded.rollback_state_json,
          updated_at = excluded.updated_at
      `,
      input.entityId,
      input.entityType,
      input.market,
      input.lifecycleState,
      input.autonomyLevel,
      input.riskLevel,
      input.memoryStatus,
      JSON.stringify(normalizeRegistryGoals(input.activeGoals ?? [])),
      JSON.stringify(input.operatingConstraints ?? {}),
      clamp(input.healthScore),
      clamp(input.leadGenerationScore),
      clamp(input.memoryConfidence),
      clamp(input.autonomyReadiness),
      clamp(input.riskScore),
      JSON.stringify(input.actionQueue ?? []),
      JSON.stringify(normalizeDecisionSnapshot(input.lastDecisionSnapshot, input.lastActions, input.lastOutcomes) ?? null),
      JSON.stringify(input.rollbackState ?? { active: false }),
      createdAt,
      updatedAt,
    )

    const record = await this.getEntityById(input.entityId)
    if (!record) {
      throw new Error(`Failed to register entity ${input.entityId}.`)
    }

    return record
  }

  async updateEntityState(input: UpdateMultiEntityStateInput): Promise<MultiEntityRegistryRecord | null> {
    traceMutation({
      source: 'backend/src/orchestrator/multiEntityRegistry.ts#updateEntityState',
      type: 'registry',
      targetId: input.entityId,
      whatChanged: 'update orchestrator registry state',
    })
    const existing = await this.getEntityById(input.entityId)
    if (!existing) {
      return null
    }

    return this.registerEntity({
      ...existing,
      entityType: input.entityType ?? existing.entityType,
      market: input.market ?? existing.market,
      lifecycleState: input.lifecycleState ?? existing.lifecycleState,
      autonomyLevel: input.autonomyLevel ?? existing.autonomyLevel,
      riskLevel: input.riskLevel ?? existing.riskLevel,
      memoryStatus: input.memoryStatus ?? existing.memoryStatus,
      activeGoals: normalizeRegistryGoals(input.activeGoals ?? existing.activeGoals),
      operatingConstraints: input.operatingConstraints ?? existing.operatingConstraints,
      healthScore: input.healthScore ?? existing.healthScore,
      leadGenerationScore: input.leadGenerationScore ?? existing.leadGenerationScore,
      memoryConfidence: input.memoryConfidence ?? existing.memoryConfidence,
      autonomyReadiness: input.autonomyReadiness ?? existing.autonomyReadiness,
      riskScore: input.riskScore ?? existing.riskScore,
      actionQueue: input.actionQueue ?? existing.actionQueue,
      lastActions: input.lastActions ?? existing.lastActions,
      lastOutcomes: input.lastOutcomes ?? existing.lastOutcomes,
      lastDecisionSnapshot: typeof input.lastDecisionSnapshot === 'undefined'
        ? existing.lastDecisionSnapshot
        : input.lastDecisionSnapshot,
      rollbackState: input.rollbackState ?? existing.rollbackState,
      createdAt: existing.createdAt,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    })
  }

  async getEntityById(entityId: string): Promise<MultiEntityRegistryRecord | null> {
    const row = await this.db.get<{
      entity_id: string
      entity_type: string
      market: string
      lifecycle_state: string
      autonomy_level: string
      risk_level: string
      memory_status: string
      active_goals_json: string
      operating_constraints_json: string
      health_score: number
      lead_generation_score: number
      memory_confidence: number
      autonomy_readiness: number
      risk_score: number
      action_queue_json: string
      last_decision_snapshot_json: string | null
      rollback_state_json: string
      created_at: string
      updated_at: string
    }>(
      `
        SELECT *
        FROM entity_orchestrator_registry
        WHERE entity_id = ?
        LIMIT 1
      `,
      entityId,
    )

    return mapRow(row)
  }

  async listEntities(filters: ListMultiEntityFilters = {}): Promise<MultiEntityRegistryRecord[]> {
    const rows = await this.db.all<Array<{
      entity_id: string
      entity_type: string
      market: string
      lifecycle_state: string
      autonomy_level: string
      risk_level: string
      memory_status: string
      active_goals_json: string
      operating_constraints_json: string
      health_score: number
      lead_generation_score: number
      memory_confidence: number
      autonomy_readiness: number
      risk_score: number
      action_queue_json: string
      last_decision_snapshot_json: string | null
      rollback_state_json: string
      created_at: string
      updated_at: string
    }>>(
      `
        SELECT *
        FROM entity_orchestrator_registry
        WHERE (? IS NULL OR lifecycle_state = ?)
          AND (? IS NULL OR autonomy_level = ?)
          AND (? IS NULL OR risk_level = ?)
        ORDER BY updated_at DESC
      `,
      filters.lifecycleState ?? null,
      filters.lifecycleState ?? null,
      filters.autonomyLevel ?? null,
      filters.autonomyLevel ?? null,
      filters.riskLevel ?? null,
      filters.riskLevel ?? null,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is MultiEntityRegistryRecord => row !== null)
  }

  async getMetrics(): Promise<MultiEntityRegistryMetrics> {
    const entities = await this.listEntities()
    const todayPrefix = new Date().toISOString().slice(0, 10)

    return {
      totalEntities: entities.length,
      activeEntities: entities.filter((entity) => entity.lifecycleState === 'internal-active' || entity.lifecycleState === 'public-active' || entity.lifecycleState === 'sandbox').length,
      autonomousActionsToday: entities.reduce((count, entity) => count + entity.actionQueue.filter((entry) => typeof entry.executedAt === 'string' && entry.executedAt.startsWith(todayPrefix)).length, 0),
      entitiesUnderRollback: entities.filter((entity) => entity.rollbackState.active).length,
      promotionCandidates: entities.filter((entity) => entity.autonomyReadiness >= 0.7 && !entity.rollbackState.active).length,
      highRiskPendingApproval: entities.filter((entity) => entity.riskLevel === 'high' || entity.riskLevel === 'critical').filter((entity) => entity.activeGoals.some((goal) => goal.approvalRequired === true)).length,
    }
  }

  async listIncidents(): Promise<Array<Pick<MultiEntityRegistryRecord, 'entityId' | 'rollbackState' | 'riskLevel' | 'updatedAt'>>> {
    const entities = await this.listEntities()
    return entities
      .filter((entity) => entity.rollbackState.active)
      .map((entity) => ({
        entityId: entity.entityId,
        rollbackState: entity.rollbackState,
        riskLevel: entity.riskLevel,
        updatedAt: entity.updatedAt,
      }))
  }
}

export function createMultiEntityRegistry(db: BackendDatabase) {
  return new MultiEntityRegistry(db)
}
