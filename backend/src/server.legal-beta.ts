import { pathToFileURL } from 'node:url'
import Fastify from 'fastify'

import { registerObservabilityHooks } from './api/middleware/observability.js'
import { registerLegalBetaApi } from './api/index.legal-beta.js'
import { createAuthService } from './auth/authService.js'
import { createAuthSovereignMutationService } from './auth/authSovereignMutationService.js'
import { getAuthConfig } from './auth/authConfig.js'
import { createAuthObservabilityService } from './auth/authObservabilityService.js'
import { createJwksService } from './auth/jwksService.js'
import { createBackendNativeAuthStoreRepository } from './auth/repositories/backendNativeAuthStoreRepository.js'
import { createDualAuthStoreAdapter } from './auth/repositories/dualAuthStoreAdapter.js'
import { createLegacyAuthStoreRepository } from './auth/repositories/legacyAuthStoreRepository.js'
import { createRefreshSessionRepository } from './auth/repositories/refreshSessionRepository.js'
import { createSigningKeyRepository } from './auth/repositories/signingKeyRepository.js'
import { createSigningKeyService } from './auth/signingKeyService.js'
import { createTokenService } from './auth/tokenService.js'
import { getCorsOrigins, validateRuntimeConfig } from './config/env.js'
import { createDatabaseConnection, getDatabaseConfig, initializeDatabase } from './db/index.js'
import { createEntityRepository } from './repositories/entityRepository.js'
import { createAssetStorageService, getAssetStorageConfig } from './services/assetStorageService.js'
import { createObservabilityService } from './services/observabilityService.js'
import {
  createInstitutionalSovereignMutationGate,
  installInstitutionalSovereignMutationGate,
} from './sovereignty/institutionalSovereignMutationGate.js'
import {
  createSemanticMutationExecutor,
  installSemanticMutationExecutor,
} from './sovereignty/semanticMutationExecutor.js'
import { setSovereignMutationBoundaryEnforcement } from './sovereignty/authorityBoundary.js'

export async function buildLegalBetaServer() {
  validateRuntimeConfig()

  const allowedCorsOrigins = new Set(getCorsOrigins())
  const app = Fastify({
    logger: true,
    bodyLimit: 15 * 1024 * 1024,
  })

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin

    if (origin && allowedCorsOrigins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin)
      reply.header('Vary', 'Origin')
      reply.header('Access-Control-Allow-Credentials', 'true')
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-tenant-id, x-case-claim-token')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    }

    if (request.method === 'OPTIONS') {
      return reply.status(204).send()
    }
  })

  const connection = await createDatabaseConnection(getDatabaseConfig())
  await initializeDatabase(connection)
  const observability = createObservabilityService()
  const authConfig = getAuthConfig()
  const legacyAuthStoreRepository = createLegacyAuthStoreRepository(authConfig.legacyAuthDbPath)
  const backendNativeAuthStoreRepository = createBackendNativeAuthStoreRepository(connection)
  const refreshSessionRepository = createRefreshSessionRepository(connection)
  const signingKeyRepository = createSigningKeyRepository(connection)
  const authObservabilityService = createAuthObservabilityService(
    observability,
    refreshSessionRepository,
    signingKeyRepository,
    app.log,
  )
  const signingKeyService = createSigningKeyService(signingKeyRepository, authConfig)
  await signingKeyService.syncConfiguredKey()
  const tokenService = createTokenService(authConfig, signingKeyService)
  const authIdentityStoreRepository = createDualAuthStoreAdapter(
    legacyAuthStoreRepository,
    backendNativeAuthStoreRepository,
    {
      mode: authConfig.authStoreMode,
      logger: app.log,
      observability,
    },
  )
  const authSovereignMutationService = createAuthSovereignMutationService({
    db: connection,
    observability,
    logger: app.log,
  })
  const authService = createAuthService(
    connection,
    authConfig,
    authIdentityStoreRepository,
    signingKeyService,
    tokenService,
    observability,
    authSovereignMutationService,
    app.log,
  )
  const jwksService = createJwksService(signingKeyService, tokenService)

  installInstitutionalSovereignMutationGate(createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    logger: app.log,
  }))
  installSemanticMutationExecutor(createSemanticMutationExecutor({
    db: connection,
    observability,
    logger: app.log,
  }))
  setSovereignMutationBoundaryEnforcement(true)

  const entityRepository = createEntityRepository(connection)
  const assetStorageService = createAssetStorageService(getAssetStorageConfig(process.cwd()))

  app.decorate('backendContext', {
    connection,
    db: { provider: 'legal-beta' as const },
    observability,
    entityRepository,
    assetStorageService,
    auth: {
      config: authConfig,
      authIdentityStoreRepository,
      legacyAuthStoreRepository,
      backendNativeAuthStoreRepository,
      signingKeyRepository,
      refreshSessionRepository,
      signingKeyService,
      tokenService,
      authService,
      authSovereignMutationService,
      jwksService,
      authObservabilityService,
    },
  })

  await registerObservabilityHooks(app)
  await registerLegalBetaApi(app)

  return app
}

async function main() {
  const app = await buildLegalBetaServer()
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen({ port, host })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
