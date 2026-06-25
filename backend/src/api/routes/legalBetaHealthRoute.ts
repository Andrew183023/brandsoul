import type { FastifyInstance } from 'fastify'

import type { AssetStorageService } from '../../services/assetStorageService.js'
import type { AssetStorageHealth } from '../../services/assetStorageService.js'
import type { BackendDatabase } from '../../db/index.js'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
    assetStorageService: AssetStorageService
  }
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function getAssetStorageService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.assetStorageService
}

export async function registerLegalBetaHealthRoute(app: FastifyInstance) {
  app.get('/health', async () => {
    let dbReady = false
    let storage: AssetStorageHealth = {
      ready: false,
      status: 'failed',
      detail: 'Storage health check did not run.',
    }

    try {
      const row = await getConnection(app).get<{ ok: number }>('SELECT 1 AS ok')
      dbReady = Number(row?.ok ?? 0) === 1
    } catch {
      dbReady = false
    }

    try {
      storage = await getAssetStorageService(app).healthCheck()
    } catch (error) {
      storage = {
        ready: false,
        status: 'failed',
        detail: error instanceof Error ? error.message : 'Unknown storage health error.',
      }
    }

    const status = !dbReady
      ? 'degraded'
      : storage.status === 'failed'
        ? 'failed'
        : storage.status === 'degraded'
          ? 'degraded'
          : 'ok'

    return {
      status,
      service: 'brandsoul-legal-beta-backend',
      timestamp: new Date().toISOString(),
      components: {
        db: { ready: dbReady },
        storage,
      },
    }
  })
}
