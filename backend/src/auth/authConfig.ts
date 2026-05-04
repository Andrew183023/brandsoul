import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function readTrimmedEnv(name: string) {
  return process.env[name]?.trim() ?? ''
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = readTrimmedEnv(name).toLowerCase()
  if (!value) {
    return fallback
  }

  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function readIntegerEnv(name: string, fallback: number) {
  const rawValue = readTrimmedEnv(name)
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function resolveDefaultLegacyAuthDbPath() {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  return path.join(path.dirname(backendRoot), 'brandsoul', 'data', 'brandsoul.db')
}

export type AuthConfig = {
  issuer: string
  audience: string
  accessTokenTtlSeconds: number
  refreshTokenTtlDays: number
  clockToleranceSeconds: number
  configuredKid: string
  configuredPrivateKeyRef: string
  configuredPublicKeyPath: string
  legacyAuthDbPath: string
}

export function getAuthConfig(): AuthConfig {
  return {
    issuer: readTrimmedEnv('AUTH_ISSUER') || 'brandsoul-auth',
    audience: readTrimmedEnv('AUTH_AUDIENCE') || 'brandsoul-api',
    accessTokenTtlSeconds: readIntegerEnv('AUTH_ACCESS_TOKEN_TTL_SECONDS', 600),
    refreshTokenTtlDays: readIntegerEnv('AUTH_REFRESH_TOKEN_TTL_DAYS', 14),
    clockToleranceSeconds: readIntegerEnv('AUTH_CLOCK_TOLERANCE_SECONDS', 60),
    configuredKid: readTrimmedEnv('AUTH_ACTIVE_KID'),
    configuredPrivateKeyRef: readTrimmedEnv('AUTH_PRIVATE_KEY_REF') || readTrimmedEnv('AUTH_PRIVATE_KEY_PATH'),
    configuredPublicKeyPath: readTrimmedEnv('AUTH_PUBLIC_KEY_PATH'),
    legacyAuthDbPath: readTrimmedEnv('BRANDSOUL_DB_PATH') || resolveDefaultLegacyAuthDbPath(),
  }
}

export function isAuthConfigured(config = getAuthConfig()) {
  return Boolean(
    config.configuredKid
      && config.configuredPrivateKeyRef
      && config.configuredPublicKeyPath
      && existsSync(config.configuredPublicKeyPath),
  )
}