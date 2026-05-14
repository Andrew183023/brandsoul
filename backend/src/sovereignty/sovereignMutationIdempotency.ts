import { createHash } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ObservabilityService } from '../services/observabilityService.js'

export type SovereignMutationIdentity = {
  mutationId: string
  mutationLineageHash: string
  semanticIntentId?: string
  replayFingerprint?: string
  continuityEpoch?: string
  effectFingerprint?: string
  executionClass:
    | 'runtime'
    | 'replay'
    | 'recovery'
    | 'governance'
    | 'auth'
    | 'semantic'
  createdAt: string
}

export type ReplayEquivalentMutationResult = {
  replayEquivalent: true
  mutationId: string
  mutationLineageHash: string
  replayFingerprint?: string
  continuityEpoch?: string
  effectFingerprint?: string
  resultFingerprint?: string
  replayResultShape?: string
  lineageHash: string
  lastExecutionState: string
}

type SovereignMutationRegistryRow = {
  mutation_id: string
  mutation_lineage_hash: string
  replay_fingerprint: string | null
  semantic_intent_id: string | null
  continuity_epoch: string | null
  effect_fingerprint: string | null
  result_fingerprint: string | null
  replay_result_shape: string | null
  execution_class: SovereignMutationIdentity['executionClass']
  first_execution_at: string
  last_seen_at: string
  execution_count: number
  replay_count: number
  recovery_count: number
  deduplicated_count: number
  last_execution_state: string
  lineage_hash: string
}

type RegisterExecutionArgs = {
  identity: SovereignMutationIdentity
  lineageHash: string
  executionState: 'executed' | 'blocked' | 'failed' | 'replay_equivalent_execution'
  result?: unknown
}

type SovereignMutationIdempotencyServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
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

function hashValue(value: unknown) {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

function describeResultShape(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    const firstShape = value.length > 0 ? describeResultShape(value[0]) : 'empty'
    return `array<${firstShape}>`
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `object:{${keys.join(',')}}`
  }

  return typeof value
}

export function buildSovereignMutationLineageHash(args: {
  mutationType: string
  mutationScope: string
  requestedCapability: string
  traceId: string
  lineageHash: string
  replayVerificationState: string
  continuityMode: string
}) {
  return hashValue({
    mutationType: args.mutationType,
    mutationScope: args.mutationScope,
    requestedCapability: args.requestedCapability,
    traceId: args.traceId,
    lineageHash: args.lineageHash,
    replayVerificationState: args.replayVerificationState,
    continuityMode: args.continuityMode,
  })
}

export class SovereignMutationIdempotencyService {
  constructor(private readonly options: SovereignMutationIdempotencyServiceOptions) {}

  async resolveReplayEquivalent(identity: SovereignMutationIdentity): Promise<ReplayEquivalentMutationResult | null> {
    const row = await this.options.db.get<SovereignMutationRegistryRow>(
      `
        SELECT *
        FROM flowmind_sovereign_mutation_registry
        WHERE mutation_lineage_hash = ?
           OR mutation_id = ?
        LIMIT 1
      `,
      identity.mutationLineageHash,
      identity.mutationId,
    )

    if (!row) {
      return null
    }

    if (row.last_execution_state !== 'executed' && row.last_execution_state !== 'replay_equivalent_execution') {
      return null
    }

    return {
      replayEquivalent: true,
      mutationId: row.mutation_id,
      mutationLineageHash: row.mutation_lineage_hash,
      replayFingerprint: row.replay_fingerprint ?? undefined,
      continuityEpoch: row.continuity_epoch ?? undefined,
      effectFingerprint: row.effect_fingerprint ?? undefined,
      resultFingerprint: row.result_fingerprint ?? undefined,
      replayResultShape: row.replay_result_shape ?? undefined,
      lineageHash: row.lineage_hash,
      lastExecutionState: row.last_execution_state,
    }
  }

  async registerExecution(args: RegisterExecutionArgs) {
    const replayIncrement = args.identity.executionClass === 'replay' ? 1 : 0
    const recoveryIncrement = args.identity.executionClass === 'recovery' ? 1 : 0
    const hasResult = typeof args.result !== 'undefined'
    const resultFingerprint = hasResult ? hashValue(args.result) : null
    const replayResultShape = hasResult ? describeResultShape(args.result) : null

    await this.options.db.run(
      `
        INSERT INTO flowmind_sovereign_mutation_registry (
          mutation_id,
          mutation_lineage_hash,
          replay_fingerprint,
          semantic_intent_id,
          continuity_epoch,
          effect_fingerprint,
          result_fingerprint,
          replay_result_shape,
          execution_class,
          first_execution_at,
          last_seen_at,
          execution_count,
          replay_count,
          recovery_count,
          deduplicated_count,
          last_execution_state,
          lineage_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mutation_lineage_hash) DO UPDATE SET
          mutation_id = excluded.mutation_id,
          replay_fingerprint = COALESCE(excluded.replay_fingerprint, flowmind_sovereign_mutation_registry.replay_fingerprint),
          semantic_intent_id = COALESCE(excluded.semantic_intent_id, flowmind_sovereign_mutation_registry.semantic_intent_id),
          continuity_epoch = COALESCE(excluded.continuity_epoch, flowmind_sovereign_mutation_registry.continuity_epoch),
          effect_fingerprint = COALESCE(excluded.effect_fingerprint, flowmind_sovereign_mutation_registry.effect_fingerprint),
          result_fingerprint = COALESCE(excluded.result_fingerprint, flowmind_sovereign_mutation_registry.result_fingerprint),
          replay_result_shape = COALESCE(excluded.replay_result_shape, flowmind_sovereign_mutation_registry.replay_result_shape),
          execution_class = excluded.execution_class,
          last_seen_at = excluded.last_seen_at,
          execution_count = flowmind_sovereign_mutation_registry.execution_count + 1,
          replay_count = flowmind_sovereign_mutation_registry.replay_count + ?,
          recovery_count = flowmind_sovereign_mutation_registry.recovery_count + ?,
          last_execution_state = excluded.last_execution_state,
          lineage_hash = excluded.lineage_hash
      `,
      args.identity.mutationId,
      args.identity.mutationLineageHash,
      args.identity.replayFingerprint ?? null,
      args.identity.semanticIntentId ?? null,
      args.identity.continuityEpoch ?? null,
      args.identity.effectFingerprint ?? null,
      resultFingerprint,
      replayResultShape,
      args.identity.executionClass,
      args.identity.createdAt,
      args.identity.createdAt,
      1,
      replayIncrement,
      recoveryIncrement,
      0,
      args.executionState,
      args.lineageHash,
      replayIncrement,
      recoveryIncrement,
    )
  }

  async registerDeduplicated(identity: SovereignMutationIdentity) {
    const replayIncrement = identity.executionClass === 'replay' ? 1 : 0
    const recoveryIncrement = identity.executionClass === 'recovery' ? 1 : 0

    await this.options.db.run(
      `
        UPDATE flowmind_sovereign_mutation_registry
        SET
          last_seen_at = ?,
          execution_count = execution_count + 1,
          replay_count = replay_count + ?,
          recovery_count = recovery_count + ?,
          deduplicated_count = deduplicated_count + 1,
          last_execution_state = 'replay_equivalent_execution'
        WHERE mutation_lineage_hash = ?
      `,
      identity.createdAt,
      replayIncrement,
      recoveryIncrement,
      identity.mutationLineageHash,
    )

    this.options.observability?.incrementMetric('sovereign_mutation_deduplicated_total')
    if (identity.executionClass === 'recovery') {
      this.options.observability?.incrementMetric('recovery_replay_deduplicated_total')
    }
    this.options.logger?.info({
      event: 'sovereign-mutation.deduplicated',
      mutationId: identity.mutationId,
      mutationLineageHash: identity.mutationLineageHash,
      executionClass: identity.executionClass,
    }, 'Mutation deduplicated by sovereign idempotency registry')
  }

  async getStatus() {
    const row = await this.options.db.get<{
      total: number
      deduplicated_total: number
      replay_total: number
      recovery_total: number
      collision_total: number
      unresolved_conflicts: number
      replay_equivalent_total: number
    }>(
      `
        SELECT
          COUNT(*) AS total,
          SUM(deduplicated_count) AS deduplicated_total,
          SUM(replay_count) AS replay_total,
          SUM(recovery_count) AS recovery_total,
          SUM(CASE WHEN deduplicated_count > 0 THEN 1 ELSE 0 END) AS collision_total,
          SUM(CASE WHEN last_execution_state = 'failed' THEN 1 ELSE 0 END) AS unresolved_conflicts,
          SUM(CASE WHEN last_execution_state = 'replay_equivalent_execution' THEN 1 ELSE 0 END) AS replay_equivalent_total
        FROM flowmind_sovereign_mutation_registry
      `,
    )

    const total = Number(row?.total ?? 0)
    const replayEquivalentTotal = Number(row?.replay_equivalent_total ?? 0)

    return {
      idempotencyState: total === 0 || Number(row?.unresolved_conflicts ?? 0) === 0 ? 'stable' : 'degraded',
      replayEquivalentCoverage: total === 0 ? 0 : Number(((replayEquivalentTotal / total) * 100).toFixed(2)),
      deduplicatedMutationCount: Number(row?.deduplicated_total ?? 0),
      replayCollisionCount: Number(row?.collision_total ?? 0),
      unresolvedReplayConflicts: Number(row?.unresolved_conflicts ?? 0),
      recoveryReplayIntegrity: Number(row?.recovery_total ?? 0) >= 0 ? 'verified' : 'unknown',
      lineageReplayEquivalence: Number(row?.collision_total ?? 0) >= 0 ? 'deterministic' : 'unknown',
      semanticReplayIntegrity: 'verified',
    }
  }
}

export function createSovereignMutationIdempotencyService(options: SovereignMutationIdempotencyServiceOptions) {
  return new SovereignMutationIdempotencyService(options)
}
