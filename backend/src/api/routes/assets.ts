import type { FastifyInstance } from 'fastify'

import type { AssetStorageService } from '../../services/assetStorageService.js'
import { createRateLimit } from '../middleware/rateLimit.js'

type BackendContext = FastifyInstance & {
  backendContext: {
    assetStorageService: AssetStorageService
  }
}

function getAssetStorageService(app: FastifyInstance) {
  return (app as BackendContext).backendContext.assetStorageService
}

const assetReadRateLimit = createRateLimit({
  namespace: 'assets-read',
  max: 240,
  windowMs: 60_000,
  key: 'ip',
})

export async function registerAssetRoutes(app: FastifyInstance) {
  app.get('/assets/*', { preHandler: assetReadRateLimit }, async (request, reply) => {
    const key = (request.params as { '*': string })['*']

    if (!key || key.includes('..')) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ASSET_NOT_FOUND',
          message: 'Asset not found.',
        },
      })
    }

    const asset = await getAssetStorageService(app).readAsset(key)
    if (!asset) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ASSET_NOT_FOUND',
          message: 'Asset not found.',
        },
      })
    }

    reply.header('Content-Type', asset.contentType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return reply.send(asset.buffer)
  })
}
