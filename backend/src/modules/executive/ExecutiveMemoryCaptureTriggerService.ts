import type { ExecutiveMemoryCaptureOrchestrator } from './ExecutiveMemoryCaptureOrchestrator.js'

export interface ExecutiveMemoryCaptureTriggerInput {
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
}

export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_DEFAULT_BATCH_LIMIT = 25
export const EXECUTIVE_MEMORY_CAPTURE_TRIGGER_MAX_BATCH_LIMIT = 100

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

export class ExecutiveMemoryCaptureTriggerService {
  private running = false

  constructor(private readonly dependencies: ExecutiveMemoryCaptureTriggerServiceDependencies) {}

  async run(
    input: ExecutiveMemoryCaptureTriggerInput = {},
  ): Promise<ExecutiveMemoryCaptureTriggerResult> {
    if (this.running) {
      return {
        status: 'already_running',
      }
    }

    this.running = true

    try {
      const startedAt = this.dependencies.clock.now().toISOString()
      const batchResult = await this.dependencies.orchestrator.captureDiscoveredBatch({
        capturedAt: startedAt,
        cursor: input.cursor,
        limit: normalizeLimit(input.limit),
      })
      const finishedAt = this.dependencies.clock.now().toISOString()

      return {
        status: 'completed',
        startedAt,
        finishedAt,
        nextCursor: batchResult.nextCursor,
        totals: batchResult.totals,
      }
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
