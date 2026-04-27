type JobStatus = 'pending' | 'running' | 'retrying' | 'failed' | 'completed'

type JobRecord<TPayload = Record<string, unknown>, TResult = unknown> = {
  id: string
  type: string
  status: JobStatus
  payload: TPayload
  result?: TResult
  error?: {
    message: string
  }
  attempts: number
  maxAttempts: number
  retryCount: number
  availableAt: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  lastDurationMs?: number
  traceId?: string
  entityId?: string
}

type JobHealthSnapshot = {
  ready: boolean
  pending: number
  running: number
  retrying: number
  failed: number
  completed: number
  total: number
  avgDurationMs: number
  maxDurationMs: number
  failureRate: number
  retryCount: number
  activeWorkers: number
}

type EnqueueOptions = {
  traceId?: string
  entityId?: string
}

type ExportRenderPayload = {
  entityId: string
  ownerId?: string
  exportId: string
  format: string
  createdAt?: string
  metadata?: Record<string, unknown>
  fileUrl?: string
  publicBaseUrl?: string
  assetBase64?: string
  contentType?: string
  fileName?: string
  assetKind?: 'original' | 'preview' | 'thumbnail' | 'avatar'
}

type SocialSignalIngestPayload = {
  entityId: string
  ownerId?: string
  type: string
  timestamp?: string
  weight?: number
  source?: string
  actorId?: string
  metadata?: Record<string, unknown>
}

type DiscoveryRebuildPayload = {
  ownerId?: string
  category?: string
  species?: string
  limit?: number
}

type EntityReplayPayload = {
  entityId: string
}

type FlowMindExecutionPayload = {
  entityId: string
  commandName: string
  context?: Record<string, unknown>
}

type CreateJobsContextArgs = {
  db?: unknown
  assetStorageService?: unknown
  entityExportRepository?: unknown
  socialSignalEngine?: unknown
  globalFeedEngine?: unknown
  monetizationService?: unknown
  discoveryEngine?: unknown
  growthEngine?: unknown
  orchestratorSnapshotRepository?: unknown
  observability?: unknown
  logger?: {
    info?: (payload: Record<string, unknown>, message?: string) => void
  }
}

function createJobId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class JobQueue {
  private readonly jobs = new Map<string, JobRecord>()

  private started = false

  async start() {
    this.started = true
  }

  async stop() {
    this.started = false
  }

  async enqueue<TPayload extends Record<string, unknown>>(type: string, payload: TPayload, options?: EnqueueOptions) {
    const now = new Date().toISOString()
    const job: JobRecord<TPayload> = {
      id: createJobId(),
      type,
      status: 'pending',
      payload,
      attempts: 0,
      maxAttempts: 3,
      retryCount: 0,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
      traceId: options?.traceId,
      entityId: options?.entityId,
    }

    this.jobs.set(job.id, job)
    return job
  }

  async getJob(id: string) {
    return this.jobs.get(id) ?? null
  }

  async listJobs(limit = 50) {
    return Array.from(this.jobs.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
  }

  async getHealthSnapshot(): Promise<JobHealthSnapshot> {
    const jobs = Array.from(this.jobs.values())
    const counts = {
      pending: jobs.filter((job) => job.status === 'pending').length,
      running: jobs.filter((job) => job.status === 'running').length,
      retrying: jobs.filter((job) => job.status === 'retrying').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
    }
    const completedDurations = jobs
      .map((job) => job.lastDurationMs)
      .filter((value): value is number => typeof value === 'number')
    const avgDurationMs = completedDurations.length > 0
      ? completedDurations.reduce((total, value) => total + value, 0) / completedDurations.length
      : 0
    const maxDurationMs = completedDurations.length > 0 ? Math.max(...completedDurations) : 0
    const terminalCount = counts.failed + counts.completed

    return {
      ready: this.started || jobs.length >= 0,
      pending: counts.pending,
      running: counts.running,
      retrying: counts.retrying,
      failed: counts.failed,
      completed: counts.completed,
      total: jobs.length,
      avgDurationMs,
      maxDurationMs,
      failureRate: terminalCount > 0 ? counts.failed / terminalCount : 0,
      retryCount: jobs.reduce((total, job) => total + job.retryCount, 0),
      activeWorkers: 0,
    }
  }
}

export class JobProducer {
  constructor(private readonly queue: JobQueue) {}

  enqueueExportRender(payload: ExportRenderPayload, options?: EnqueueOptions) {
    return this.queue.enqueue('EXPORT_RENDER', payload, options)
  }

  enqueueSocialSignalIngest(payload: SocialSignalIngestPayload, options?: EnqueueOptions) {
    return this.queue.enqueue('SOCIAL_SIGNAL_INGEST', payload, options)
  }

  enqueueDiscoveryRebuild(payload: DiscoveryRebuildPayload, options?: EnqueueOptions) {
    return this.queue.enqueue('DISCOVERY_REBUILD', payload, options)
  }

  enqueueEntityReplay(payload: EntityReplayPayload, options?: EnqueueOptions) {
    return this.queue.enqueue('ENTITY_REPLAY', payload, options)
  }

  enqueueFlowMindExecution(payload: FlowMindExecutionPayload, options?: EnqueueOptions) {
    return this.queue.enqueue('FLOWMIND_EXECUTION', payload, options)
  }
}

export class JobWorker {
  constructor(
    private readonly queue: JobQueue,
    private readonly logger?: CreateJobsContextArgs['logger'],
  ) {}

  async start() {
    await this.queue.start()
    this.logger?.info?.({
      event: 'jobs.worker.started',
      mode: 'minimal-in-memory',
    }, 'Jobs worker started')
  }

  async stop() {
    await this.queue.stop()
    this.logger?.info?.({
      event: 'jobs.worker.stopped',
      mode: 'minimal-in-memory',
    }, 'Jobs worker stopped')
  }
}

export function createJobsContext(context: CreateJobsContextArgs) {
  const jobQueue = new JobQueue()
  const jobProducer = new JobProducer(jobQueue)
  const jobWorker = new JobWorker(jobQueue, context.logger)

  return {
    jobQueue,
    jobProducer,
    jobWorker,
  }
}
