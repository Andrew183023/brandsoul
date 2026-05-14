import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import type { JobWorker } from '../jobs/index.js'
import { buildServer } from '../server.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    runtimeGovernance: {
      registerStartupFailure(args: {
        subsystem: string
        criticality: 'critical' | 'degraded-allowed' | 'optional'
        message: string
      }): { action: 'fail-startup' | 'enter-degraded-mode' | 'continue-optional' }
    }
    institutionalContinuityGovernance: {
      registerPersistenceTruthfulnessFailure(args: {
        reason: string
        entityId?: string
        now?: string
      }): Promise<void>
    }
    sovereignMutationCommandService: {
      submitCommand(input: unknown): Promise<Record<string, unknown>>
    }
    entityRepository: {
      createEntity(input: {
        id: string
        ownerId?: string
        ownerUserId?: number
        ownerTenantId?: number
        entityProfile: unknown
        createdAt?: string
        updatedAt?: string
      }): Promise<unknown>
    }
    jobWorker: JobWorker
  }
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-sovereign-gate-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'sovereign-gate-test-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    jwtSecret: process.env.JWT_SECRET,
    sqliteFile: process.env.SQLITE_FILE,
    assetStorageDir: process.env.ASSET_STORAGE_DIR,
    authIssuer: process.env.AUTH_ISSUER,
    authAudience: process.env.AUTH_AUDIENCE,
    authKid: process.env.AUTH_ACTIVE_KID,
    authPrivateKeyRef: process.env.AUTH_PRIVATE_KEY_REF,
    authPublicKeyPath: process.env.AUTH_PUBLIC_KEY_PATH,
  }

  process.env.JWT_SECRET = 'sovereign-gate-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'sovereign-gate.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-sovereign-gate'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-sovereign-gate'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousEnv.jwtSecret === 'undefined') delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousEnv.jwtSecret
      if (typeof previousEnv.sqliteFile === 'undefined') delete process.env.SQLITE_FILE
      else process.env.SQLITE_FILE = previousEnv.sqliteFile
      if (typeof previousEnv.assetStorageDir === 'undefined') delete process.env.ASSET_STORAGE_DIR
      else process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      if (typeof previousEnv.authIssuer === 'undefined') delete process.env.AUTH_ISSUER
      else process.env.AUTH_ISSUER = previousEnv.authIssuer
      if (typeof previousEnv.authAudience === 'undefined') delete process.env.AUTH_AUDIENCE
      else process.env.AUTH_AUDIENCE = previousEnv.authAudience
      if (typeof previousEnv.authKid === 'undefined') delete process.env.AUTH_ACTIVE_KID
      else process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      if (typeof previousEnv.authPrivateKeyRef === 'undefined') delete process.env.AUTH_PRIVATE_KEY_REF
      else process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      if (typeof previousEnv.authPublicKeyPath === 'undefined') delete process.env.AUTH_PUBLIC_KEY_PATH
      else process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
    },
  }
}

test('direct submitCommand blocks high-risk command in degraded mode', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    harness.app.backendContext.runtimeGovernance.registerStartupFailure({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      message: 'synthetic degrade',
    })

    await assert.rejects(
      () => harness.app.backendContext.sovereignMutationCommandService.submitCommand({
        type: 'approval.resolve',
        commandId: 'sovereign-gate-block-high-risk',
        approvalId: 'approval-missing',
        status: 'approved',
        actorId: 'user:1',
        now: '2026-05-12T00:00:00.000Z',
      }),
      (error: unknown) => {
        const blocked = error as {
          code?: string
          runtimeMode?: string
          governanceDecision?: { allowed?: boolean }
          blockedCapabilities?: string[]
        }
        assert.equal(blocked.code, 'RUNTIME_GOVERNANCE_BLOCKED')
        assert.equal(blocked.runtimeMode, 'degraded')
        assert.equal(blocked.governanceDecision?.allowed, false)
        assert.ok(Array.isArray(blocked.blockedCapabilities))
        return true
      },
    )
  } finally {
    await harness.close()
  }
})

test('direct submitCommand blocks high-risk command when institutional continuity is untrusted', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await harness.app.backendContext.institutionalContinuityGovernance.registerPersistenceTruthfulnessFailure({
      reason: 'synthetic continuity failure',
      entityId: 'entity-unsafe',
      now: '2026-05-12T00:00:00.000Z',
    })

    await assert.rejects(
      () => harness.app.backendContext.sovereignMutationCommandService.submitCommand({
        type: 'approval.resolve',
        commandId: 'sovereign-gate-continuity-block',
        approvalId: 'approval-missing',
        status: 'approved',
        actorId: 'user:1',
        now: '2026-05-12T00:00:00.000Z',
      }),
      (error: unknown) => {
        const blocked = error as {
          code?: string
          continuityMode?: string
          continuityDecision?: { allowed?: boolean }
          blockedCapabilities?: string[]
        }
        assert.equal(blocked.code, 'INSTITUTIONAL_CONTINUITY_BLOCKED')
        assert.equal(blocked.continuityMode, 'continuity_untrusted')
        assert.equal(blocked.continuityDecision?.allowed, false)
        assert.ok(Array.isArray(blocked.blockedCapabilities))
        return true
      },
    )
  } finally {
    await harness.close()
  }
})

test('normal mode keeps approval.resolve behavior unchanged', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const result = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'approval.resolve',
      commandId: 'sovereign-gate-normal-approval-resolve',
      approvalId: 'approval-missing',
      status: 'approved',
      actorId: 'user:1',
      now: '2026-05-12T00:00:00.000Z',
    }) as {
      blockedReason?: string
      runtimeMode?: string
      governanceDecision?: { allowed?: boolean }
    }

    assert.equal(result.blockedReason, 'not_found')
    assert.equal(result.runtimeMode, 'normal')
    assert.equal(result.governanceDecision?.allowed, true)
  } finally {
    await harness.close()
  }
})

test('public mutation command is blocked in degraded mode by sovereign mutation gate', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await runSeedMutation(
      () => harness.app.backendContext.entityRepository.createEntity({
        id: 'entity-governance-low-risk',
        ownerUserId: 1,
        ownerTenantId: 1,
        ownerId: 'user:1:tenant:1',
        entityProfile: {
          ...createTestEntity(),
          id: 'entity-governance-low-risk',
        },
      }),
      'backend/src/orchestrator/sovereignMutationCommandService.test.ts#seedEntity',
    )

    harness.app.backendContext.runtimeGovernance.registerStartupFailure({
      subsystem: 'negative-attribution-runtime',
      criticality: 'degraded-allowed',
      message: 'synthetic degrade',
    })

    await assert.rejects(
      () => harness.app.backendContext.sovereignMutationCommandService.submitCommand({
        type: 'public.interaction.resolve',
        commandId: 'sovereign-gate-low-risk-allowed',
        entityId: 'entity-governance-low-risk',
        occurredAt: '2026-05-12T00:00:00.000Z',
        payload: {
          requestId: 'r1',
        },
      }),
      (error: unknown) => {
        const blocked = error as {
          code?: string
          attestation?: { runtimeMode?: string, governanceDecision?: string }
        }
        assert.equal(blocked.code, 'INSTITUTIONAL_SOVEREIGN_MUTATION_BLOCKED')
        assert.equal(blocked.attestation?.runtimeMode, 'degraded')
        assert.equal(blocked.attestation?.governanceDecision, 'blocked')
        return true
      },
    )
  } finally {
    await harness.close()
  }
})
