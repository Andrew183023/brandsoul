import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const DEFAULT_PASSWORD_RESET_URL_BASE = 'http://localhost:5173/reset-password'
const DEFAULT_LEGAL_MARKETPLACE_ENTITY_ID = 'entity-flow-core-group-req-moklcdyz-rbs437-6q7un3'
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const SUPPORTED_ASSET_STORAGE_PROVIDERS = new Set(['local', 's3', 'r2', 'gcs'])
let runtimeEnvLoaded = false

function loadEnvFile(filePath: string, override = false) {
  if (!existsSync(filePath)) {
    return
  }

  dotenv.config({
    path: filePath,
    override,
  })
}

export function loadRuntimeEnv() {
  if (runtimeEnvLoaded) {
    return
  }

  const cwd = process.cwd()
  loadEnvFile(path.join(cwd, '.env'))
  loadEnvFile(path.join(cwd, '.env.local'), true)
  runtimeEnvLoaded = true
}

loadRuntimeEnv()

function readTrimmedEnv(name: string) {
  return process.env[name]?.trim() ?? ''
}

export function getRequiredEnv(name: string) {
  const value = readTrimmedEnv(name)
  if (!value) {
    throw new Error(`${name} environment variable is required.`)
  }

  return value
}

export function getJwtSecret() {
  return getRequiredEnv('JWT_SECRET')
}

export function getPasswordResetUrlBase() {
  return readTrimmedEnv('PASSWORD_RESET_URL_BASE') || DEFAULT_PASSWORD_RESET_URL_BASE
}

export function getLegalMarketplaceEntityId() {
  return readTrimmedEnv('LEGAL_MARKETPLACE_ENTITY_ID') || DEFAULT_LEGAL_MARKETPLACE_ENTITY_ID
}

export function getLegalCaseDispatchTimeoutSeconds() {
  const fallback = process.env.NODE_ENV === 'production' ? 30 : 300
  const rawValue = Number(readTrimmedEnv('LEGAL_CASE_DISPATCH_TIMEOUT_SECONDS'))
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return fallback
  }

  return Math.round(rawValue)
}

export function getCorsOrigins() {
  const rawValue = readTrimmedEnv('CORS_ORIGINS') || readTrimmedEnv('FRONTEND_ORIGINS')

  if (!rawValue) {
    return DEFAULT_CORS_ORIGINS
  }

  const origins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS
}

export function getPasswordResetExpiryMinutes() {
  const rawValue = Number(readTrimmedEnv('PASSWORD_RESET_EXPIRE_MINUTES'))
  if (!Number.isFinite(rawValue)) {
    return 15
  }

  return Math.min(30, Math.max(15, rawValue))
}

export function getResendApiKey() {
  return readTrimmedEnv('RESEND_API_KEY')
}

export function getEmailFrom() {
  return readTrimmedEnv('EMAIL_FROM')
}

export function validateRuntimeConfig() {
  getJwtSecret()

  const assetStorageProvider = readTrimmedEnv('ASSET_STORAGE_PROVIDER').toLowerCase()
  if (assetStorageProvider && !SUPPORTED_ASSET_STORAGE_PROVIDERS.has(assetStorageProvider)) {
    throw new Error(
      `ASSET_STORAGE_PROVIDER must be one of ${Array.from(SUPPORTED_ASSET_STORAGE_PROVIDERS).join(', ')}.`,
    )
  }

  if (assetStorageProvider && assetStorageProvider !== 'local') {
    throw new Error(`ASSET_STORAGE_PROVIDER="${assetStorageProvider}" is not supported yet. Only "local" is wired right now.`)
  }

  const resendApiKey = getResendApiKey()
  const emailFrom = getEmailFrom()
  if (Boolean(resendApiKey) !== Boolean(emailFrom)) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be configured together or both omitted.')
  }
}