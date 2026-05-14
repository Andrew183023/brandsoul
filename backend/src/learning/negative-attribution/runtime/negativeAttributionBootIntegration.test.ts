import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import { buildServer } from '../../../server.js'
import { getInstitutionalSovereignMutationGate } from '../../../sovereignty/institutionalSovereignMutationGate.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    jobWorker: {
      stop(): Promise<void>
    }
    negativeOutcomeRepository: {
      appendNegativeOutcome(input: {
        outcomeType: 'proposal_rejected' | 'failed_execution' | 'opportunity_expired' | 'abandoned_execution' | 'no_response_timeout' | 'terminal_no_conversion'
        entityId: string
        marketSignalId: string
        opportunityId: string
        proposalId: string
        executionId: string
        category: string
        signalKeyword: string
        detectedAt: string
        reason: string
        metadata?: Record<string, unknown>
      }): Promise<{ outcomeId: string }>
    }
    negativeAttributionRepository: {
      listNegativeAttributions(limit?: number): Promise<Array<{
        attributionId: string
        outcomeId: string
        proposalId: string | null
        executionId: string | null
        entityId: string | null
        lineageQuality: 'complete' | 'partial' | 'synthetic' | 'missing'
      }>>
    }
    negativeAttributionRuntime: {
      refresh(): Promise<unknown>
      getStatus(): {
        started: boolean
        ready: boolean
        warming: boolean
        error: boolean
        lastRunAt: string | null
        lastAttributedOutcomeId: string | null
        attributionCount: number
        lastError: string | null
      }
    }
    terminalFailureDetectionRuntime: {
      getStatus(): {
        started: boolean
        error: boolean
      }
    }
    shadowProposalConfidenceRuntime: {
      getSnapshot(now?: Date): {
        runtime: {
          advisoryOnly: true
          mutatesLiveProposalConfidence: false
        }
      }
    }
    flowMindApprovalQueue: {
      enqueue(input: {
        approvalId: string
        entityId: string
        proposalId: string
        actionType: string
        rationale: string
        payload: Record<string, unknown>
        requestedAt: string
        expiresAt?: string
      }): Promise<void>
      list(filters?: { status?: 'pending' | 'approved' | 'rejected' | 'expired', limit?: number }): Promise<Array<{ approvalId: string }>>
    }
  }
}

async function createPersistentHarness(workspace: string) {
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'negative-attribution-boot-test-kid'
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

  process.env.JWT_SECRET = 'negative-attribution-boot-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'runtime.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-negative-attribution-boot'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-negative-attribution-boot'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()
  assert.doesNotThrow(() => getInstitutionalSovereignMutationGate())

  return {
    app,
    async close() {
      await app.close()

      if (typeof previousEnv.jwtSecret === 'undefined') {
        delete process.env.JWT_SECRET
      } else {
        process.env.JWT_SECRET = previousEnv.jwtSecret
      }

      if (typeof previousEnv.sqliteFile === 'undefined') {
        delete process.env.SQLITE_FILE
      } else {
        process.env.SQLITE_FILE = previousEnv.sqliteFile
      }

      if (typeof previousEnv.assetStorageDir === 'undefined') {
        delete process.env.ASSET_STORAGE_DIR
      } else {
        process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      }

      if (typeof previousEnv.authIssuer === 'undefined') {
        delete process.env.AUTH_ISSUER
      } else {
        process.env.AUTH_ISSUER = previousEnv.authIssuer
      }

      if (typeof previousEnv.authAudience === 'undefined') {
        delete process.env.AUTH_AUDIENCE
      } else {
        process.env.AUTH_AUDIENCE = previousEnv.authAudience
      }

      if (typeof previousEnv.authKid === 'undefined') {
        delete process.env.AUTH_ACTIVE_KID
      } else {
        process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      }

      if (typeof previousEnv.authPrivateKeyRef === 'undefined') {
        delete process.env.AUTH_PRIVATE_KEY_REF
      } else {
        process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      }

      if (typeof previousEnv.authPublicKeyPath === 'undefined') {
        delete process.env.AUTH_PUBLIC_KEY_PATH
      } else {
        process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
      }
    },
  }
}

async function appendSeedNegativeOutcome(app: AppWithContext, input: Parameters<AppWithContext['backendContext']['negativeOutcomeRepository']['appendNegativeOutcome']>[0]) {
  const seedId = `${input.proposalId}:${input.executionId}:${input.detectedAt}`

  return sovereignSeedMutation({
    authoritySource: 'backend/src/learning/negative-attribution/runtime/negativeAttributionBootIntegration.test.ts#appendSeedNegativeOutcome',
    mutationType: 'negative-outcome.seed.append',
    mutationScope: 'runtime',
    requestedCapability: 'adaptive.runtime.mutation',
    actor: 'runtime',
    traceId: `test-seed:negative-outcome:${seedId}`,
    work: () => app.backendContext.negativeOutcomeRepository.appendNegativeOutcome(input),
  })
}

let sovereignSeedMutationSequence = 0

async function sovereignSeedMutation<T>(args: {
  authoritySource: string
  mutationType: string
  mutationScope: 'governance' | 'replay' | 'checkpoint' | 'queue' | 'auth' | 'runtime' | 'entity' | 'memory'
  requestedCapability: string
  actor: 'runtime' | 'governance' | 'admin' | 'public' | 'recovery'
  traceId: string
  work: () => Promise<T>
}) {
  const seedOrdinal = ++sovereignSeedMutationSequence
  const mutationId = `${args.traceId}:${String(seedOrdinal).padStart(4, '0')}`
  let attested = false

  const result = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
    authoritySource: args.authoritySource,
    mutationId,
    context: {
      mutationType: args.mutationType,
      mutationScope: args.mutationScope,
      requestedCapability: args.requestedCapability,
      runtimeMode: 'normal',
      continuityMode: 'institutional_safe',
      replayVerificationState: 'verified',
      attestationIntegrity: 'verified',
      recoveryRequired: false,
      actor: args.actor,
      traceId: args.traceId,
    },
    onAttested: (attestation) => {
      attested = true
      assert.equal(attestation.governanceDecision, 'allowed')
      assert.equal(attestation.executed, true)
      assert.equal(attestation.persisted, true)
      assert.equal(attestation.mutationScope, args.mutationScope)
    },
    work: args.work,
  })

  assert.equal(attested, true)
  return result
}

async function seedPendingApproval(app: AppWithContext, approvalId: string) {
  const seedOrdinal = ++approvalSeedMutationSequence
  const mutationId = `test-approval-seed:${approvalId}:${String(seedOrdinal).padStart(4, '0')}`
  const traceId = `test-approval-seed:${approvalId}`
  let attested = false

  await getInstitutionalSovereignMutationGate().evaluateAndExecute({
    authoritySource: 'backend/src/learning/negative-attribution/runtime/negativeAttributionBootIntegration.test.ts#seedPendingApproval',
    mutationId,
    context: {
      mutationType: 'approval.seed',
      mutationScope: 'queue',
      requestedCapability: 'governance.approval',
      runtimeMode: 'normal',
      continuityMode: 'institutional_safe',
      replayVerificationState: 'verified',
      attestationIntegrity: 'verified',
      recoveryRequired: false,
      actor: 'governance',
      traceId,
    },
    onAttested: (attestation) => {
      attested = true
      assert.equal(attestation.mutationType, 'approval.seed')
      assert.equal(attestation.mutationScope, 'queue')
      assert.equal(attestation.executed, true)
      assert.equal(attestation.persisted, true)
    },
    work: async () => app.backendContext.flowMindApprovalQueue.enqueue({
      approvalId,
      entityId: 'entity-governance-safe',
      proposalId: `${approvalId}-proposal`,
      actionType: 'create_entity',
      rationale: 'governance must remain unchanged',
      payload: { proposal: { proposalId: `${approvalId}-proposal` } },
      requestedAt: '2026-05-08T10:00:00.000Z',
    }),
  })

  assert.equal(attested, true)
}

let approvalSeedMutationSequence = 0

test('negative attribution runtime boots, consumes negative outcomes once, classifies missing lineage, and leaves governance unchanged', { concurrency: false }, async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-negative-attribution-boot-'))

  try {
    const firstHarness = await createPersistentHarness(workspace)

    try {
      const initialStatus = firstHarness.app.backendContext.negativeAttributionRuntime.getStatus()
      assert.equal(initialStatus.started, true)
      assert.equal(initialStatus.error, false)
      assert.ok(initialStatus.ready || initialStatus.warming)
      assert.equal(firstHarness.app.backendContext.terminalFailureDetectionRuntime.getStatus().started, true)

      const failedExecutionOutcome = await appendSeedNegativeOutcome(firstHarness.app, {
        outcomeType: 'failed_execution',
        entityId: 'entity-1',
        marketSignalId: 'signal-1',
        opportunityId: 'opportunity-1',
        proposalId: 'proposal-1',
        executionId: 'execution-1',
        category: 'legal',
        signalKeyword: 'labor lawyer',
        detectedAt: '2026-05-08T10:05:00.000Z',
        reason: 'terminal execution failure',
        metadata: {
          completedAt: '2026-05-08T10:04:00.000Z',
        },
      })
      const missingLineageOutcome = await appendSeedNegativeOutcome(firstHarness.app, {
        outcomeType: 'opportunity_expired',
        entityId: 'unassigned',
        marketSignalId: 'unknown-signal',
        opportunityId: 'unknown-opportunity',
        proposalId: 'none',
        executionId: 'none',
        category: 'general',
        signalKeyword: 'generic trend',
        detectedAt: '2026-05-08T10:06:00.000Z',
        reason: 'expired without lineage',
      })

      await seedPendingApproval(firstHarness.app, 'approval-negative-attribution-governance-safe')
      await firstHarness.app.backendContext.negativeAttributionRuntime.refresh()

      const firstAttributions = await firstHarness.app.backendContext.negativeAttributionRepository.listNegativeAttributions()
      const firstStatus = firstHarness.app.backendContext.negativeAttributionRuntime.getStatus()
      const pendingApprovalsBeforeRestart = await firstHarness.app.backendContext.flowMindApprovalQueue.list({ status: 'pending' })
      const shadowState = firstHarness.app.backendContext.shadowProposalConfidenceRuntime.getSnapshot()

      assert.equal(firstAttributions.length, 2)
      assert.equal(firstStatus.attributionCount, 2)
      assert.equal(firstStatus.lastAttributedOutcomeId, missingLineageOutcome.outcomeId)
      assert.equal(firstStatus.lastError, null)
      assert.ok(firstStatus.lastRunAt)
      assert.ok(firstAttributions.some((item) => item.outcomeId === missingLineageOutcome.outcomeId && item.lineageQuality === 'missing'))
      assert.ok(firstAttributions.some((item) => item.outcomeId === failedExecutionOutcome.outcomeId && item.lineageQuality === 'complete'))
      assert.ok(pendingApprovalsBeforeRestart.some((item) => item.approvalId === 'approval-negative-attribution-governance-safe'))
      assert.equal(shadowState.runtime.advisoryOnly, true)
      assert.equal(shadowState.runtime.mutatesLiveProposalConfidence, false)
    } finally {
      await firstHarness.close()
    }

    const secondHarness = await createPersistentHarness(workspace)

    try {
      await secondHarness.app.backendContext.negativeAttributionRuntime.refresh()

      const secondAttributions = await secondHarness.app.backendContext.negativeAttributionRepository.listNegativeAttributions()
      const secondStatus = secondHarness.app.backendContext.negativeAttributionRuntime.getStatus()
      const pendingApprovalsAfterRestart = await secondHarness.app.backendContext.flowMindApprovalQueue.list({ status: 'pending' })

      assert.equal(secondAttributions.length, 2)
      assert.equal(secondStatus.attributionCount, 2)
      assert.equal(secondStatus.error, false)
      assert.ok(pendingApprovalsAfterRestart.some((item) => item.approvalId === 'approval-negative-attribution-governance-safe'))
    } finally {
      await secondHarness.close()
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
