import type { FastifyBaseLogger } from 'fastify'

import type { AuthStoreMode } from '../auth/authConfig.js'

type LegalBetaAuthModeGuardArgs = {
  authStoreMode: AuthStoreMode
  nodeEnv?: string
  renderDeployMode?: string
  logger?: Pick<FastifyBaseLogger, 'error'>
}

const FORBIDDEN_ERROR_CODE = 'LEGAL_BETA_LEGACY_AUTH_MODE_FORBIDDEN'
const FORBIDDEN_ERROR_MESSAGE = 'Legal Beta cannot run with AUTH_STORE_MODE=legacy_only outside local/test because legacy auth IDs can collide with persisted entity ownership. Use dual_write_native_read or native_only.'

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function isLegalBetaLegacyAuthAllowed(args: Pick<LegalBetaAuthModeGuardArgs, 'nodeEnv' | 'renderDeployMode'>) {
  const nodeEnv = normalize(args.nodeEnv)
  const renderDeployMode = normalize(args.renderDeployMode)

  return nodeEnv === 'test'
    || nodeEnv === 'development'
    || renderDeployMode === 'local'
}

export function assertLegalBetaAuthModeAllowed(args: LegalBetaAuthModeGuardArgs) {
  if (args.authStoreMode !== 'legacy_only') {
    return
  }

  if (isLegalBetaLegacyAuthAllowed(args)) {
    return
  }

  args.logger?.error({
    event: 'legal-beta.auth-mode.forbidden',
    authStoreMode: args.authStoreMode,
    nodeEnv: args.nodeEnv ?? '',
    renderDeployMode: args.renderDeployMode ?? '',
  }, FORBIDDEN_ERROR_MESSAGE)

  const error = new Error(FORBIDDEN_ERROR_MESSAGE) as Error & { code?: string }
  error.name = FORBIDDEN_ERROR_CODE
  error.code = FORBIDDEN_ERROR_CODE
  throw error
}

export const LEGAL_BETA_LEGACY_AUTH_MODE_FORBIDDEN = FORBIDDEN_ERROR_CODE
