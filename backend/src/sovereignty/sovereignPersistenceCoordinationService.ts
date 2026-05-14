import { createHash } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ObservabilityService } from '../services/observabilityService.js'

export type SovereignPersistenceContext = {
  operationId: string

  persistenceDomain:
    | 'governance'
    | 'replay'
    | 'semantic'
    | 'auth'
    | 'checkpoint'
    | 'queue'
    | 'runtime'
    | 'entity'

  mutationLineageHash?: string

  replayFingerprint?: string

  continuityEpoch?: string

  executionPriority:
    | 'critical'
    | 'high'
    | 'normal'
    | 'background'

  executionClass:
    | 'runtime'
    | 'replay'
    | 'recovery'
    | 'governance'
    | 'auth'

  replayRelevant: boolean
  continuityRelevant: boolean
  recoveryRelevant: boolean

  actorId?: string

  requestedAt: string
}

export type PersistenceLeaseState = {
  persistenceDomain: SovereignPersistenceContext['persistenceDomain']
  ownerOperationId: string
  acquiredAt: string
  expiresAt: string
  leaseLineageHash: string
  continuityEpoch?: string
  replayFingerprint?: string
  mutationLineageHash?: string
}

type ExecuteCoordinatedOperationArgs<T> = {
  context: SovereignPersistenceContext
  work: () => Promise<T>
}

type SovereignPersistenceCoordinationServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
  leaseDurationMs?: number
  starvationThresholdMs?: number
}

type QueueState =
  | 'queued'
  | 'started'
  | 'completed'
  | 'failed'
  | 'retry'
  | 'lease_acquired'
  | 'lease_conflict'
  | 'deduplicated'

type QueueItem<T> = {
  context: SovereignPersistenceContext
  sequence: number
  enqueuedAtMs: number
  resolve: (value: T) => void
  reject: (error: unknown) => void
  work: () => Promise<T>
}

type RetryExhaustionEvent = {
  operationId: string
  persistenceDomain: SovereignPersistenceContext['persistenceDomain']
  attempts: number
  observedAt: string
  errorMessage: string
}

const DEFAULT_LEASE_DURATION_MS = 15_000
const DEFAULT_STARVATION_THRESHOLD_MS = 5_000
const MAX_EXHAUSTION_HISTORY = 32

let installedService: SovereignPersistenceCoordinationService | null = null

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isSqliteBusyError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('sqlite_busy')
    || message.includes('database is locked')
    || message.includes('busy')
}

function priorityWeight(context: SovereignPersistenceContext) {
  const base = context.executionPriority === 'critical'
    ? 40
    : context.executionPriority === 'high'
      ? 30
      : context.executionPriority === 'normal'
        ? 20
        : 10

  const recoveryBoost = context.executionClass === 'recovery' || context.recoveryRelevant ? 20 : 0
  const replayBoost = context.executionClass === 'replay' || context.replayRelevant ? 10 : 0
  const continuityBoost = context.continuityRelevant ? 5 : 0

  return base + recoveryBoost + replayBoost + continuityBoost
}

function toIso(valueMs: number) {
  return new Date(valueMs).toISOString()
}

function sortQueueItems(left: QueueItem<unknown>, right: QueueItem<unknown>) {
  const byPriority = priorityWeight(right.context) - priorityWeight(left.context)
  if (byPriority !== 0) {
    return byPriority
  }

  return left.sequence - right.sequence
}

function buildReplayDedupKey(context: SovereignPersistenceContext) {
  if (!context.replayRelevant && context.executionClass !== 'replay') {
    return null
  }

  return [
    context.persistenceDomain,
    context.replayFingerprint ?? '',
    context.mutationLineageHash ?? '',
    context.continuityEpoch ?? '',
  ].join(':')
}

export class SovereignPersistenceCoordinationService {
  private readonly leaseDurationMs: number
  private readonly starvationThresholdMs: number
  private readonly queueByDomain = new Map<SovereignPersistenceContext['persistenceDomain'], QueueItem<unknown>[]>()
  private readonly activeDomains = new Set<SovereignPersistenceContext['persistenceDomain']>()
  private readonly activeLeases = new Map<SovereignPersistenceContext['persistenceDomain'], PersistenceLeaseState>()
  private readonly inFlightReplayDedup = new Map<string, Promise<unknown>>()
  private sequence = 0

  private operationTotal = 0
  private retryTotal = 0
  private retryExhaustedTotal = 0
  private sqliteContentionTotal = 0
  private persistenceLeaseConflictTotal = 0
  private replaySerializationTotal = 0
  private recoveryPriorityExecutionTotal = 0
  private queueDrainedTotal = 0

  private lockStormCount = 0
  private starvationCount = 0
  private contentionLoopCount = 0

  private lastQueueLineageHash: string | null = null
  private lastReplayLineageHash: string | null = null
  private persistenceLineageIntegrity: 'verified' | 'drift_detected' = 'verified'
  private retryExhaustionHistory: RetryExhaustionEvent[] = []

  constructor(private readonly options: SovereignPersistenceCoordinationServiceOptions) {
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS
    this.starvationThresholdMs = options.starvationThresholdMs ?? DEFAULT_STARVATION_THRESHOLD_MS
  }

  async executeCoordinatedOperation<T>(args: ExecuteCoordinatedOperationArgs<T>): Promise<T> {
    this.operationTotal += 1
    this.options.observability?.incrementMetric('sovereign_persistence_operation_total')

    if (args.context.executionClass === 'recovery' || args.context.recoveryRelevant) {
      this.recoveryPriorityExecutionTotal += 1
      this.options.observability?.incrementMetric('recovery_priority_execution_total')
    }

    const replayDedupKey = buildReplayDedupKey(args.context)
    if (replayDedupKey) {
      const inFlight = this.inFlightReplayDedup.get(replayDedupKey)
      if (inFlight) {
        this.replaySerializationTotal += 1
        this.options.observability?.incrementMetric('replay_serialization_total')
        await this.appendQueueEvent(args.context, 'deduplicated', {
          replayDedupKey,
          message: 'replay operation deduplicated against in-flight key',
        })
        this.options.logger?.info({
          event: 'replay persistence coordinated',
          operationId: args.context.operationId,
          replayDedupKey,
        }, 'Replay persistence coordinated')
        return inFlight as Promise<T>
      }
    }

    const executionPromise = new Promise<T>((resolve, reject) => {
      const queue = this.queueByDomain.get(args.context.persistenceDomain) ?? []
      queue.push({
        context: args.context,
        sequence: this.sequence,
        enqueuedAtMs: Date.now(),
        resolve: (value) => resolve(value as T),
        reject,
        work: args.work as () => Promise<unknown>,
      })
      this.sequence += 1
      this.queueByDomain.set(args.context.persistenceDomain, queue)
    })

    if (replayDedupKey) {
      this.inFlightReplayDedup.set(replayDedupKey, executionPromise)
    }

    await this.appendQueueEvent(args.context, 'queued', {
      queueDepth: this.getTransactionalQueueDepth(),
      queueFairness: 'priority_then_fifo',
    })

    this.scheduleDomain(args.context.persistenceDomain)

    try {
      return await executionPromise
    } finally {
      if (replayDedupKey) {
        const current = this.inFlightReplayDedup.get(replayDedupKey)
        if (current === executionPromise) {
          this.inFlightReplayDedup.delete(replayDedupKey)
        }
      }
    }
  }

  adoptExternalLease(lease: PersistenceLeaseState) {
    const existing = this.activeLeases.get(lease.persistenceDomain)
    if (existing && Date.parse(existing.expiresAt) > Date.now()) {
      this.persistenceLeaseConflictTotal += 1
      this.options.observability?.incrementMetric('persistence_lease_conflict_total')
    }

    this.activeLeases.set(lease.persistenceDomain, lease)
  }

  async getStatus() {
    return {
      persistenceCoordinationState: {
        coordinated: true,
        operationTotal: this.operationTotal,
        queueFairnessPolicy: 'priority_then_fifo',
        deterministicExecutionOrdering: true,
      },
      sqliteContentionState: {
        sqliteContentionTotal: this.sqliteContentionTotal,
        lockStormDetected: this.lockStormCount > 0,
        lockStormCount: this.lockStormCount,
        starvationDetected: this.starvationCount > 0,
        starvationCount: this.starvationCount,
        contentionLoopDetected: this.contentionLoopCount > 0,
      },
      transactionalQueueState: {
        depth: this.getTransactionalQueueDepth(),
        drainedTotal: this.queueDrainedTotal,
        appendOnlyLineage: true,
        lastQueueLineageHash: this.lastQueueLineageHash,
      },
      replaySerializationState: {
        replaySerializationTotal: this.replaySerializationTotal,
        replayQueueDivergencePrevented: this.replaySerializationTotal > 0,
        lastReplayLineageHash: this.lastReplayLineageHash,
      },
      leaseCoordinationState: {
        leaseDurationMs: this.leaseDurationMs,
        leaseConflictTotal: this.persistenceLeaseConflictTotal,
        activeLeaseCount: this.activeLeases.size,
      },
      recoveryPriorityState: {
        recoveryPriorityExecutionTotal: this.recoveryPriorityExecutionTotal,
        recoveryStarvationDetected: false,
      },
      persistenceLineageIntegrity: this.persistenceLineageIntegrity,
      activePersistenceLeases: Array.from(this.activeLeases.values()).sort((left, right) => {
        const domainOrder = left.persistenceDomain.localeCompare(right.persistenceDomain)
        if (domainOrder !== 0) {
          return domainOrder
        }

        return left.ownerOperationId.localeCompare(right.ownerOperationId)
      }),
      retryExhaustionState: {
        retryExhausted: this.retryExhaustedTotal > 0,
        total: this.retryExhaustedTotal,
        recentExhaustions: this.retryExhaustionHistory,
      },
      metrics: {
        sovereign_persistence_operation_total: this.operationTotal,
        sovereign_persistence_retry_total: this.retryTotal,
        sovereign_persistence_retry_exhausted_total: this.retryExhaustedTotal,
        sqlite_contention_total: this.sqliteContentionTotal,
        persistence_lease_conflict_total: this.persistenceLeaseConflictTotal,
        replay_serialization_total: this.replaySerializationTotal,
        transactional_queue_depth: this.getTransactionalQueueDepth(),
        recovery_priority_execution_total: this.recoveryPriorityExecutionTotal,
      },
    }
  }

  private scheduleDomain(domain: SovereignPersistenceContext['persistenceDomain']) {
    if (this.activeDomains.has(domain)) {
      return
    }

    this.activeDomains.add(domain)
    void this.processDomainQueue(domain)
      .catch((error) => {
        this.options.logger?.error({
          event: 'sovereign-persistence.queue-processor-failed',
          domain,
          message: error instanceof Error ? error.message : 'unknown_error',
        }, 'Sovereign persistence queue processor failed')
      })
      .finally(() => {
        this.activeDomains.delete(domain)

        const pending = this.queueByDomain.get(domain)
        if (pending && pending.length > 0) {
          this.scheduleDomain(domain)
        }
      })
  }

  private async processDomainQueue(domain: SovereignPersistenceContext['persistenceDomain']) {
    const queue = this.queueByDomain.get(domain)
    if (!queue || queue.length === 0) {
      return
    }

    queue.sort((left, right) => sortQueueItems(left, right))
    const item = queue.shift()
    if (!item) {
      return
    }

    if (queue.length === 0) {
      this.queueByDomain.delete(domain)
    }

    const waitMs = Date.now() - item.enqueuedAtMs
    if (waitMs >= this.starvationThresholdMs) {
      this.starvationCount += 1
    }

    await this.appendQueueEvent(item.context, 'started', {
      waitMs,
      queueDepth: this.getTransactionalQueueDepth(),
    })

    try {
      const lease = await this.acquireLease(item.context)
      try {
        const result = await this.executeWithRetry(item)
        this.queueDrainedTotal += 1
        await this.appendQueueEvent(item.context, 'completed', {
          queueDepth: this.getTransactionalQueueDepth(),
          leaseLineageHash: lease.leaseLineageHash,
        })
        item.resolve(result)
      } finally {
        this.releaseLease(item.context.persistenceDomain, item.context.operationId)
      }
    } catch (error) {
      await this.appendQueueEvent(item.context, 'failed', {
        queueDepth: this.getTransactionalQueueDepth(),
        errorMessage: error instanceof Error ? error.message : 'unknown_error',
      })
      item.reject(error)
    }

    const next = this.queueByDomain.get(domain)
    if (next && next.length > 0) {
      await this.processDomainQueue(domain)
    }
  }

  private async executeWithRetry<T>(item: QueueItem<T>) {
    const maxRetries = item.context.executionPriority === 'critical' ? 8 : 6
    let attempts = 0

    while (true) {
      try {
        return await item.work()
      } catch (error) {
        const busy = isSqliteBusyError(error)
        if (!busy) {
          throw error
        }

        attempts += 1
        this.retryTotal += 1
        this.sqliteContentionTotal += 1
        this.options.observability?.incrementMetric('sovereign_persistence_retry_total')
        this.options.observability?.incrementMetric('sqlite_contention_total')

        if (attempts >= 3) {
          this.lockStormCount += 1
        }
        if (attempts >= 4) {
          this.contentionLoopCount += 1
        }

        this.options.logger?.warn({
          event: 'sqlite busy mitigated',
          operationId: item.context.operationId,
          persistenceDomain: item.context.persistenceDomain,
          attempts,
          maxRetries,
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        }, 'SQLite busy mitigated')

        await this.appendQueueEvent(item.context, 'retry', {
          attempts,
          queueDepth: this.getTransactionalQueueDepth(),
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        })

        if (attempts >= maxRetries) {
          this.retryExhaustedTotal += 1
          this.options.observability?.incrementMetric('sovereign_persistence_retry_exhausted_total')
          this.recordRetryExhaustion({
            operationId: item.context.operationId,
            persistenceDomain: item.context.persistenceDomain,
            attempts,
            observedAt: new Date().toISOString(),
            errorMessage: error instanceof Error ? error.message : 'unknown_error',
          })

          this.options.logger?.error({
            event: 'retry exhausted',
            operationId: item.context.operationId,
            persistenceDomain: item.context.persistenceDomain,
            attempts,
          }, 'Retry exhausted')
          throw error
        }

        const backoffMs = Math.min(1_500, 25 * (2 ** Math.max(0, attempts - 1)))
        await sleep(backoffMs)
      }
    }
  }

  private async acquireLease(context: SovereignPersistenceContext) {
    const nowMs = Date.now()
    const existing = this.activeLeases.get(context.persistenceDomain)
    if (existing && Date.parse(existing.expiresAt) > nowMs && existing.ownerOperationId !== context.operationId) {
      this.persistenceLeaseConflictTotal += 1
      this.options.observability?.incrementMetric('persistence_lease_conflict_total')
      await this.appendQueueEvent(context, 'lease_conflict', {
        conflictingOwnerOperationId: existing.ownerOperationId,
        existingLeaseExpiresAt: existing.expiresAt,
      })
      this.options.logger?.warn({
        event: 'persistence lease conflict',
        operationId: context.operationId,
        persistenceDomain: context.persistenceDomain,
        conflictingOwnerOperationId: existing.ownerOperationId,
      }, 'Persistence lease conflict')
      await sleep(10)
    }

    const acquiredAt = toIso(nowMs)
    const expiresAt = toIso(nowMs + this.leaseDurationMs)
    const leaseLineageHash = hashValue({
      operationId: context.operationId,
      persistenceDomain: context.persistenceDomain,
      continuityEpoch: context.continuityEpoch ?? null,
      replayFingerprint: context.replayFingerprint ?? null,
      mutationLineageHash: context.mutationLineageHash ?? null,
      acquiredAt,
      expiresAt,
    })

    const lease: PersistenceLeaseState = {
      persistenceDomain: context.persistenceDomain,
      ownerOperationId: context.operationId,
      acquiredAt,
      expiresAt,
      leaseLineageHash,
      continuityEpoch: context.continuityEpoch,
      replayFingerprint: context.replayFingerprint,
      mutationLineageHash: context.mutationLineageHash,
    }
    this.activeLeases.set(context.persistenceDomain, lease)

    await this.appendQueueEvent(context, 'lease_acquired', {
      leaseLineageHash,
      leaseExpiresAt: expiresAt,
    })

    this.options.logger?.info({
      event: 'persistence lease acquired',
      operationId: context.operationId,
      persistenceDomain: context.persistenceDomain,
      leaseLineageHash,
      leaseExpiresAt: expiresAt,
    }, 'Persistence lease acquired')

    return lease
  }

  private releaseLease(domain: SovereignPersistenceContext['persistenceDomain'], operationId: string) {
    const lease = this.activeLeases.get(domain)
    if (!lease || lease.ownerOperationId !== operationId) {
      return
    }

    this.activeLeases.delete(domain)
  }

  private recordRetryExhaustion(event: RetryExhaustionEvent) {
    this.retryExhaustionHistory.push(event)
    if (this.retryExhaustionHistory.length > MAX_EXHAUSTION_HISTORY) {
      this.retryExhaustionHistory = this.retryExhaustionHistory.slice(-MAX_EXHAUSTION_HISTORY)
    }
  }

  private getTransactionalQueueDepth() {
    let depth = 0
    for (const queue of this.queueByDomain.values()) {
      depth += queue.length
    }

    return depth
  }

  private async appendQueueEvent(
    context: SovereignPersistenceContext,
    state: QueueState,
    details: {
      attempts?: number
      queueDepth?: number
      queueFairness?: 'priority_then_fifo'
      leaseLineageHash?: string
      leaseExpiresAt?: string
      conflictingOwnerOperationId?: string
      existingLeaseExpiresAt?: string
      replayDedupKey?: string
      message?: string
      errorMessage?: string
      waitMs?: number
    },
  ) {
    const queueLineageHash = hashValue({
      operationId: context.operationId,
      persistenceDomain: context.persistenceDomain,
      executionPriority: context.executionPriority,
      executionClass: context.executionClass,
      replayFingerprint: context.replayFingerprint ?? null,
      mutationLineageHash: context.mutationLineageHash ?? null,
      continuityEpoch: context.continuityEpoch ?? null,
      requestedAt: context.requestedAt,
      state,
    })
    this.lastQueueLineageHash = queueLineageHash
    if (context.replayRelevant) {
      this.lastReplayLineageHash = queueLineageHash
    }

    try {
      await this.options.db.run(
        `
          INSERT INTO flowmind_sovereign_persistence_queue (
            queue_event_id,
            operation_id,
            persistence_domain,
            execution_priority,
            execution_class,
            queue_state,
            queue_lineage_hash,
            lease_lineage_hash,
            mutation_lineage_hash,
            replay_fingerprint,
            continuity_epoch,
            retry_count,
            error_code,
            error_message,
            actor_id,
            requested_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        `${context.operationId}:${state}:${Date.now()}`,
        context.operationId,
        context.persistenceDomain,
        context.executionPriority,
        context.executionClass,
        state,
        queueLineageHash,
        details.leaseLineageHash ?? null,
        context.mutationLineageHash ?? null,
        context.replayFingerprint ?? null,
        context.continuityEpoch ?? null,
        details.attempts ?? 0,
        details.errorMessage ? 'SQLITE_BUSY' : null,
        details.errorMessage ?? null,
        context.actorId ?? null,
        context.requestedAt,
        new Date().toISOString(),
      )
    } catch (error) {
      if (isSqliteBusyError(error)) {
        this.sqliteContentionTotal += 1
        this.retryTotal += 1
      }
      this.options.logger?.warn({
        event: 'sovereign-persistence.queue-event-write-failed',
        operationId: context.operationId,
        state,
        message: error instanceof Error ? error.message : 'unknown_error',
      }, 'Failed to append sovereign persistence queue event')
      this.persistenceLineageIntegrity = 'drift_detected'
    }

    this.options.observability?.incrementMetric('transactional_queue_depth', this.getTransactionalQueueDepth())

    if (state === 'completed' && details.queueDepth === 0) {
      this.options.logger?.info({
        event: 'transactional queue drained',
        persistenceDomain: context.persistenceDomain,
        lastQueueLineageHash: this.lastQueueLineageHash,
      }, 'Transactional queue drained')
    }

    if (state === 'started') {
      this.options.logger?.info({
        event: 'sovereign write serialized',
        operationId: context.operationId,
        persistenceDomain: context.persistenceDomain,
        queueDepth: details.queueDepth ?? 0,
      }, 'Sovereign write serialized')
    }
  }
}

export function createSovereignPersistenceCoordinationService(options: SovereignPersistenceCoordinationServiceOptions) {
  return new SovereignPersistenceCoordinationService(options)
}

export function installSovereignPersistenceCoordinationService(service: SovereignPersistenceCoordinationService) {
  installedService = service
}

export function getSovereignPersistenceCoordinationService() {
  if (!installedService) {
    throw new Error('Sovereign persistence coordination service is not installed.')
  }

  return installedService
}