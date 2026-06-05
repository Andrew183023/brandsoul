import { pathToFileURL } from 'node:url'

import { bootstrapAuth } from './bootstrap/bootstrapAuth.js'
import { bootstrapCoreRuntime } from './bootstrap/bootstrapCore.js'
import { registerObservabilityHooks } from './api/middleware/observability.js'
import { registerLegalBetaApi } from './api/index.legal-beta.js'
import { createEntityRepository } from './repositories/entityRepository.js'
import { createAssetStorageService, getAssetStorageConfig } from './services/assetStorageService.js'
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
  const {
    app,
    connection,
    observability,
  } = await bootstrapCoreRuntime()

  const auth = await bootstrapAuth({
    connection,
    observability,
    logger: app.log,
  })

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
      config: auth.authConfig,
      authIdentityStoreRepository: auth.authIdentityStoreRepository,
      legacyAuthStoreRepository: auth.legacyAuthStoreRepository,
      backendNativeAuthStoreRepository: auth.backendNativeAuthStoreRepository,
      signingKeyRepository: auth.signingKeyRepository,
      refreshSessionRepository: auth.refreshSessionRepository,
      signingKeyService: auth.signingKeyService,
      tokenService: auth.tokenService,
      authService: auth.authService,
      authSovereignMutationService: auth.authSovereignMutationService,
      jwksService: auth.jwksService,
      authObservabilityService: auth.authObservabilityService,
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
