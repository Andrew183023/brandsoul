import { performance } from 'node:perf_hooks'

import type { ExecutiveMemoryCaptureOrchestrator } from './ExecutiveMemoryCaptureOrchestrator.js'
import type { ExecutiveMemoryCaptureTriggerMetricsRecorder } from './ExecutiveMetrics.js'

export interface ExecutiveMemoryCaptureTriggerInput {
  tenantId: number
  captureCycleId: string
  cursor?: string
  limit?: number
}

export interface ExecutiveMemoryCaptureTriggerResult {
  status: 'completed' | 'already_running'
  startedAt?: string
  finishedAt?: string
  nextCursor?: string
  totals?: {
    processed: number
    captured: number
    created: number
    failed: number
  }
}

export interface ExecutiveMemoryCaptureTriggerClock {
  now(): Date
}

export interface ExecutiveMemoryCaptureTriggerServiceDependencies {
  orchestrator: Pick<ExecutiveMemoryCaptureOrchestrator, 'captureDiscoveredBatch'>
  clock: ExecutiveMemoryCaptureTriggerClock
  metrics?: ExecutiveMemoryCaptureTriggerMetricsRecorder
  timer?: {
    now(): number
  }
}

export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT = 25
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT = 100

export interface ExecutiveMemoryCaptureRetryPolicy {
  automaticRetryEnabled: false
  recommendedStrategy: 'external_controlled_retry'
  safeBecause: readonly string[]
  unsafeBecause: readonly string[]
}

export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_RETRY_POLICY: ExecutiveMemoryCaptureRetryPolicy = {
  automaticRetryEnabled: false,
  recommendedStrategy: 'external_controlled_retry',
  safeBecause: [
    'Repository idempotency is enforced by tenant, office and content fingerprint.',
    'The batch orchestrator already isolates per-office failures within a single run.',
    'External callers can decide retry cadence without changing trigger semantics.',
  ],
  unsafeBecause: [
    'Automatic retry loops here would hide repeated orchestration failures.',
    'Trigger-local retries could overlap future schedulers or command runners.',
    'Retry behavior belongs to the future caller that owns runtime policy.',
  ],
}

function normalizeLimit(limit?: number) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT
  }

  const normalized = Math.floor(limit)
  if (normalized < 1) {
    return EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT
  }

  if (normalized > EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT) {
    return EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT
  }

  return normalized
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory capture trigger service requires ${label}.`)
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Executive memory capture trigger service requires ${label}.`)
  }
}

export class ExecutiveMemoryCaptureTriggerService {
  private running = false

  constructor(private readonly dependencies: ExecutiveMemoryCaptureTriggerServiceDependencies) {}

  async run(
    input: ExecutiveMemoryCaptureTriggerInput,
  ): Promise<ExecutiveMemoryCaptureTriggerResult> {
    if (this.running) {
      this.dependencies.metrics?.recordExecutiveMemoryCaptureTriggerRun({
        status: 'already_running',
      })
      return {
        status: 'already_running',
      }
    }

    assertPositiveInteger(input.tenantId, 'tenantId')
    assertNonEmptyString(input.captureCycleId, 'captureCycleId')

    this.running = true
    let startedAtMonotonic: number | null = null

    try {
      startedAtMonotonic = (this.dependencies.timer ?? performance).now()
      const startedAt = this.dependencies.clock.now().toISOString()
      const batchResult = await this.dependencies.orchestrator.captureDiscoveredBatch({
        tenantId: input.tenantId,
        capturedAt: startedAt,
        captureCycleId: input.captureCycleId,
        cursor: input.cursor,
        limit: normalizeLimit(input.limit),
      })
      const finishedAt = this.dependencies.clock.now().toISOString()
      const durationMs = (this.dependencies.timer ?? performance).now() - startedAtMonotonic

      this.dependencies.metrics?.recordExecutiveMemoryCaptureTriggerRun({ status: 'completed' })
      this.dependencies.metrics?.recordExecutiveMemoryCaptureTriggerRunTiming({
        durationMs,
        status: 'completed',
      })
      this.dependencies.metrics?.recordExecutiveMemoryCaptureTriggerBatchTotals({
        status: 'completed',
        processed: batchResult.totals.processed,
        captured: batchResult.totals.captured,
        created: batchResult.totals.created,
        failed: batchResult.totals.failed,
      })

      return {
        status: 'completed',
        startedAt,
        finishedAt,
        nextCursor: batchResult.nextCursor,
        totals: batchResult.totals,
      }
    } catch (error) {
      this.dependencies.metrics?.recordExecutiveMemoryCaptureTriggerRun({ status: 'error' })
      if (startedAtMonotonic !== null) {
        this.dependencies.metrics?.recordExecutiveMemoryCaptureTriggerRunTiming({
          durationMs: (this.dependencies.timer ?? performance).now() - startedAtMonotonic,
          status: 'error',
        })
      }

      throw error
    } finally {
      this.running = false
    }
  }
}

export function createExecutiveMemoryCaptureTriggerService(
  dependencies: ExecutiveMemoryCaptureTriggerServiceDependencies,
) {
  return new ExecutiveMemoryCaptureTriggerService(dependencies)
}
