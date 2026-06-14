import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertLegalBetaAuthModeAllowed,
  LEGAL_BETA_LEGACY_AUTH_MODE_FORBIDDEN,
} from './legalBetaAuthModeGuard.js'

function createLogger() {
  const entries: Array<Record<string, unknown>> = []

  return {
    entries,
    logger: {
      error(payload: Record<string, unknown>, message: string) {
        entries.push({
          level: 'error',
          payload,
          message,
        })
      },
    },
  }
}

test('production + legacy_only throws LEGAL_BETA_LEGACY_AUTH_MODE_FORBIDDEN', () => {
  const { logger, entries } = createLogger()

  assert.throws(
    () => assertLegalBetaAuthModeAllowed({
      authStoreMode: 'legacy_only',
      nodeEnv: 'production',
      renderDeployMode: 'staging',
      logger,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.name, LEGAL_BETA_LEGACY_AUTH_MODE_FORBIDDEN)
      assert.equal((error as Error & { code?: string }).code, LEGAL_BETA_LEGACY_AUTH_MODE_FORBIDDEN)
      return true
    },
  )

  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.payload?.event, 'legal-beta.auth-mode.forbidden')
})

test('test + legacy_only is allowed', () => {
  assert.doesNotThrow(() => assertLegalBetaAuthModeAllowed({
    authStoreMode: 'legacy_only',
    nodeEnv: 'test',
    renderDeployMode: 'ci-test',
  }))
})

test('production + dual_write_native_read is allowed', () => {
  assert.doesNotThrow(() => assertLegalBetaAuthModeAllowed({
    authStoreMode: 'dual_write_native_read',
    nodeEnv: 'production',
    renderDeployMode: 'staging',
  }))
})

test('production + native_only is allowed', () => {
  assert.doesNotThrow(() => assertLegalBetaAuthModeAllowed({
    authStoreMode: 'native_only',
    nodeEnv: 'production',
    renderDeployMode: 'production',
  }))
})
