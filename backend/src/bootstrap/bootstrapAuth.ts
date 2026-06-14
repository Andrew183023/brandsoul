import type { FastifyBaseLogger } from 'fastify'

import { getAuthConfig } from '../auth/authConfig.js'
import { createAuthService } from '../auth/authService.js'
import { createAuthSovereignMutationService } from '../auth/authSovereignMutationService.js'
import { createAuthObservabilityService } from '../auth/authObservabilityService.js'
import { createJwksService } from '../auth/jwksService.js'
import { createBackendNativeAuthStoreRepository } from '../auth/repositories/backendNativeAuthStoreRepository.js'
import { createDualAuthStoreAdapter } from '../auth/repositories/dualAuthStoreAdapter.js'
import { createLegacyAuthStoreRepository } from '../auth/repositories/legacyAuthStoreRepository.js'
import { createRefreshSessionRepository } from '../auth/repositories/refreshSessionRepository.js'
import { createSigningKeyRepository } from '../auth/repositories/signingKeyRepository.js'
import { createSigningKeyService } from '../auth/signingKeyService.js'
import { createTokenService } from '../auth/tokenService.js'
import { assertLegalBetaAuthModeAllowed } from './legalBetaAuthModeGuard.js'

export async function bootstrapAuth(args: {
  connection: Parameters<typeof createBackendNativeAuthStoreRepository>[0]
  observability: Parameters<typeof createAuthObservabilityService>[0]
  logger: FastifyBaseLogger
}) {
  const authConfig = getAuthConfig()
  assertLegalBetaAuthModeAllowed({
    authStoreMode: authConfig.authStoreMode,
    nodeEnv: process.env.NODE_ENV,
    renderDeployMode: process.env.RENDER_DEPLOY_MODE,
    logger: args.logger,
  })
  const legacyAuthStoreRepository = createLegacyAuthStoreRepository(authConfig.legacyAuthDbPath)
  const backendNativeAuthStoreRepository = createBackendNativeAuthStoreRepository(args.connection)
  const refreshSessionRepository = createRefreshSessionRepository(args.connection)
  const signingKeyRepository = createSigningKeyRepository(args.connection)
  const authObservabilityService = createAuthObservabilityService(
    args.observability,
    refreshSessionRepository,
    signingKeyRepository,
    args.logger,
  )
  const signingKeyService = createSigningKeyService(signingKeyRepository, authConfig)
  await signingKeyService.syncConfiguredKey()
  const tokenService = createTokenService(authConfig, signingKeyService)
  const authIdentityStoreRepository = createDualAuthStoreAdapter(
    legacyAuthStoreRepository,
    backendNativeAuthStoreRepository,
    {
      mode: authConfig.authStoreMode,
      logger: args.logger,
      observability: args.observability,
    },
  )
  const authSovereignMutationService = createAuthSovereignMutationService({
    db: args.connection,
    observability: args.observability,
    logger: args.logger,
  })
  const authService = createAuthService(
    args.connection,
    authConfig,
    authIdentityStoreRepository,
    signingKeyService,
    tokenService,
    args.observability,
    authSovereignMutationService,
  )
  const jwksService = createJwksService(signingKeyService, tokenService)

  return {
    authConfig,
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
  }
}
