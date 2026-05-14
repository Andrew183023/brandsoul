import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { enforceAdaptiveInfluenceProductionPolicy } from './adaptiveInfluencePolicy.js'

const DEFAULT_PASSWORD_RESET_URL_BASE = 'http://localhost:5173/reset-password'
const DEFAULT_LEGAL_MARKETPLACE_ENTITY_ID = 'entity-flow-core-group-req-moklcdyz-rbs437-6q7un3'
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const DEFAULT_ADAPTIVE_INFLUENCE_BOUNDED_MIN = 0.75
const DEFAULT_ADAPTIVE_INFLUENCE_BOUNDED_MAX = 1.35
const DEFAULT_ADAPTIVE_INFLUENCE_MIN_SAMPLE_REQUIREMENT = 3
const ADAPTIVE_INFLUENCE_MIN_BOUND = 0.5
const ADAPTIVE_INFLUENCE_MAX_BOUND = 1.5
const ADAPTIVE_INFLUENCE_MODES = new Set(['off', 'shadow_compare', 'live_rank_only'])
const ADAPTIVE_INFLUENCE_ALLOWED_SCOPES = new Set(['signal', 'category', 'entity'])
const DEFAULT_ADAPTIVE_INFLUENCE_SCOPES: AdaptiveInfluenceScope[] = ['signal', 'category', 'entity']

const SUPPORTED_ASSET_STORAGE_PROVIDERS = new Set(['local', 's3', 'r2', 'gcs'])
let runtimeEnvLoaded = false

export type AdaptiveInfluenceMode = 'off' | 'shadow_compare' | 'live_rank_only'
export type AdaptiveInfluenceScope = 'signal' | 'category' | 'entity'
export type RuntimeDeploymentEnvironment = 'production' | 'staging' | 'development' | 'test'
export type TestRuntimeMode = 'isolated' | 'full'
export type RenderDeployMode = 'local' | 'preview' | 'production' | 'ci-test'

export type AdaptiveInfluenceEnvConfig = {
  enabled: boolean
  mode: AdaptiveInfluenceMode
  rolloutPercentage: number
  killSwitchEnabled: boolean
  minimumSampleRequirement: number
  allowedScopes: AdaptiveInfluenceScope[]
  boundedMin: number
  boundedMax: number
}

function readBooleanLikeEnv(name: string, fallback: boolean) {
  const rawValue = readTrimmedEnv(name).toLowerCase()
  if (!rawValue) {
    return fallback
  }

  if (['1', 'true', 'yes', 'on'].includes(rawValue)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(rawValue)) {
    return false
  }

  return fallback
}

function shouldLoadRuntimeEnv() {
  if (readBooleanLikeEnv('FLOWMIND_TEST_ENV_ISOLATION', false)) {
    return false
  }

  if (readBooleanLikeEnv('FLOWMIND_SKIP_DOTENV', false)) {
    return false
  }

  return true
}

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

  if (!shouldLoadRuntimeEnv()) {
    runtimeEnvLoaded = true
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

function parseBooleanEnv(name: string, fallback: boolean) {
  const rawValue = readTrimmedEnv(name)
  if (!rawValue) {
    return fallback
  }

  const lowered = rawValue.toLowerCase()
  if (lowered === 'true') {
    return true
  }

  if (lowered === 'false') {
    return false
  }

  throw new Error(`${name} must be "true" or "false".`)
}

function parseFiniteNumberEnv(name: string, fallback: number) {
  const rawValue = readTrimmedEnv(name)
  if (!rawValue) {
    return fallback
  }

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`)
  }

  return parsed
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = parseFiniteNumberEnv(name, fallback)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer >= 1.`)
  }

  return value
}

function parseAdaptiveInfluenceMode() {
  const rawValue = readTrimmedEnv('ADAPTIVE_INFLUENCE_MODE').toLowerCase()
  const mode = (rawValue || 'off') as AdaptiveInfluenceMode

  if (!ADAPTIVE_INFLUENCE_MODES.has(mode)) {
    throw new Error('ADAPTIVE_INFLUENCE_MODE must be one of off, shadow_compare, live_rank_only.')
  }

  return mode
}

function parseAdaptiveInfluenceScopes() {
  const rawValue = readTrimmedEnv('ADAPTIVE_INFLUENCE_ALLOWED_SCOPES').toLowerCase()
  if (!rawValue) {
    return [...DEFAULT_ADAPTIVE_INFLUENCE_SCOPES]
  }

  const scopes = Array.from(new Set(
    rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ))

  if (scopes.length === 0) {
    throw new Error('ADAPTIVE_INFLUENCE_ALLOWED_SCOPES cannot be empty when provided.')
  }

  for (const scope of scopes) {
    if (!ADAPTIVE_INFLUENCE_ALLOWED_SCOPES.has(scope)) {
      throw new Error('ADAPTIVE_INFLUENCE_ALLOWED_SCOPES contains invalid scope. Allowed values: signal, category, entity.')
    }
  }

  return scopes as AdaptiveInfluenceScope[]
}

function parseBoundedValue(name: string, fallback: number) {
  const value = parseFiniteNumberEnv(name, fallback)

  if (value < ADAPTIVE_INFLUENCE_MIN_BOUND || value > ADAPTIVE_INFLUENCE_MAX_BOUND) {
    throw new Error(`${name} must be between ${ADAPTIVE_INFLUENCE_MIN_BOUND} and ${ADAPTIVE_INFLUENCE_MAX_BOUND}.`)
  }

  return value
}

export function getAdaptiveInfluenceEnvConfig(): AdaptiveInfluenceEnvConfig {
  const enabled = parseBooleanEnv('ADAPTIVE_INFLUENCE_ENABLED', false)
  const mode = parseAdaptiveInfluenceMode()
  const rolloutPercentageRaw = parseFiniteNumberEnv('ADAPTIVE_INFLUENCE_ROLLOUT_PERCENTAGE', 0)
  const killSwitchEnabled = parseBooleanEnv('ADAPTIVE_INFLUENCE_KILL_SWITCH', false)
  const minimumSampleRequirement = parsePositiveIntegerEnv(
    'ADAPTIVE_INFLUENCE_MIN_SAMPLE_REQUIREMENT',
    DEFAULT_ADAPTIVE_INFLUENCE_MIN_SAMPLE_REQUIREMENT,
  )
  const allowedScopes = parseAdaptiveInfluenceScopes()
  const boundedMin = parseBoundedValue('ADAPTIVE_INFLUENCE_BOUNDED_MIN', DEFAULT_ADAPTIVE_INFLUENCE_BOUNDED_MIN)
  const boundedMax = parseBoundedValue('ADAPTIVE_INFLUENCE_BOUNDED_MAX', DEFAULT_ADAPTIVE_INFLUENCE_BOUNDED_MAX)

  if (boundedMin > boundedMax) {
    throw new Error('ADAPTIVE_INFLUENCE_BOUNDED_MIN must be less than or equal to ADAPTIVE_INFLUENCE_BOUNDED_MAX.')
  }

  if (mode === 'shadow_compare' && enabled !== true) {
    throw new Error('ADAPTIVE_INFLUENCE_MODE=shadow_compare requires ADAPTIVE_INFLUENCE_ENABLED=true.')
  }

  enforceAdaptiveInfluenceProductionPolicy({
    enabled,
    mode,
    source: 'startup',
  })

  const rolloutPercentage = Math.max(0, Math.min(100, Math.trunc(rolloutPercentageRaw)))

  return {
    enabled,
    mode,
    rolloutPercentage,
    killSwitchEnabled,
    minimumSampleRequirement,
    allowedScopes,
    boundedMin,
    boundedMax,
  }
}

export function getLongitudinalObservationMode() {
  return parseBooleanEnv('LONGITUDINAL_OBSERVATION_MODE', false)
}

export function getReplayIdentityFreezeOverrideEnabled() {
  return parseBooleanEnv('REPLAY_IDENTITY_FREEZE_ALLOW_OVERRIDE', false)
}

export function getRuntimeDeploymentEnvironment(): RuntimeDeploymentEnvironment {
  const rawValue = readTrimmedEnv('NODE_ENV').toLowerCase()
  if (rawValue === 'production') {
    return 'production'
  }

  if (rawValue === 'staging') {
    return 'staging'
  }

  if (rawValue === 'test') {
    return 'test'
  }

  return 'development'
}

export function getTestRuntimeMode(): TestRuntimeMode {
  const value = readTrimmedEnv('TEST_RUNTIME_MODE').toLowerCase()
  return value === 'full' ? 'full' : 'isolated'
}

export function isIsolatedTestRuntimeMode() {
  return getRuntimeDeploymentEnvironment() === 'test' && getTestRuntimeMode() === 'isolated'
}

export function getRenderDeployMode(): RenderDeployMode {
  const value = readTrimmedEnv('RENDER_DEPLOY_MODE').toLowerCase()
  if (value === 'production') {
    return 'production'
  }

  if (value === 'preview') {
    return 'preview'
  }

  if (value === 'ci-test') {
    return 'ci-test'
  }

  return 'local'
}

export function assertRenderDeploySafety() {
  if (getRuntimeDeploymentEnvironment() === 'test' && getRenderDeployMode() === 'production') {
    throw new Error('RENDER_DEPLOY_MODE=production is forbidden when NODE_ENV=test.')
  }
}

export function getHighRiskGovernanceMode() {
  return parseBooleanEnv('HIGH_RISK_GOVERNANCE_MODE', false)
}

export function getReplayIdentityOverrideUntil() {
  const value = readTrimmedEnv('REPLAY_IDENTITY_OVERRIDE_UNTIL')
  return value || undefined
}

export function getReplayIdentityOverrideReason() {
  const value = readTrimmedEnv('REPLAY_IDENTITY_OVERRIDE_REASON')
  return value || undefined
}

export function getReplayIdentityOverrideApprover() {
  const value = readTrimmedEnv('REPLAY_IDENTITY_OVERRIDE_APPROVER')
  return value || undefined
}

export function getReplayIdentityObservationConfigLockHash() {
  const value = readTrimmedEnv('REPLAY_IDENTITY_OBSERVATION_CONFIG_LOCK_HASH')
  return value || undefined
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
  assertRenderDeploySafety()
  getJwtSecret()
  getAdaptiveInfluenceEnvConfig()

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
