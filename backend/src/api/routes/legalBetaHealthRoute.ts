import type { FastifyInstance } from 'fastify'

import type { AssetStorageService } from '../../services/assetStorageService.js'
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
    let storageReady = false

    try {
      const row = await getConnection(app).get<{ ok: number }>('SELECT 1 AS ok')
      dbReady = Number(row?.ok ?? 0) === 1
    } catch {
      dbReady = false
    }

    try {
      const result = await getAssetStorageService(app).healthCheck()
      storageReady = result.ready
    } catch {
      storageReady = false
    }

    return {
      status: dbReady ? 'ok' : 'degraded',
      service: 'brandsoul-legal-beta-backend',
      timestamp: new Date().toISOString(),
      components: {
        db: { ready: dbReady },
        storage: { ready: storageReady },
      },
    }
  })
}
