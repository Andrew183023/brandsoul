import type { FastifyInstance } from 'fastify'

import type { JobQueue } from '../../jobs/index.js'
import type { AssetStorageService } from '../../services/assetStorageService.js'
import type { BackendDatabase } from '../../db/index.js'
import { requireAuth } from '../middleware/requireAuth.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    assetStorageService: AssetStorageService
    jobQueue: JobQueue
  }
}

export async function registerHealthRoute(app: FastifyInstance) {
  // Public liveness/readiness endpoint.
  app.get('/health', async () => {
    const context = (app as FastifyInstance & BackendContext).backendContext
    let dbReady = false
    let storage

    try {
      const row = await context.connection.get<{ ok: number }>('SELECT 1 AS ok')
      dbReady = Number(row?.ok ?? 0) === 1
    } catch {
      dbReady = false
    }

    try {
      storage = await context.assetStorageService.healthCheck()
    } catch (error) {
      storage = {
        ready: false,
        detail: error instanceof Error ? error.message : 'Unknown storage health error.',
      }
    }

    const queue = await context.jobQueue.getHealthSnapshot()
    const ready = dbReady && storage.ready && queue.ready

    return {
      status: ready ? 'ok' : 'degraded',
      service: 'brandsoul-backend',
      timestamp: new Date().toISOString(),
      components: {
        api: {
          ready: true,
        },
        db: {
          ready: dbReady,
        },
        storage,
        queue,
      },
    }
  })

  // Queue health is operational-only.
  app.get('/health/jobs', { preHandler: requireAuth }, async () => {
    const context = (app as FastifyInstance & BackendContext).backendContext
    const queue = await context.jobQueue.getHealthSnapshot()

    return {
      status: queue.ready ? 'ok' : 'degraded',
      service: 'brandsoul-backend-jobs',
      timestamp: new Date().toISOString(),
      queue,
    }
  })
}
