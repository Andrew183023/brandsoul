import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import type { JobWorker } from '../jobs/index.js'
import type { MultiEntityRegistry } from '../orchestrator/multiEntityRegistry.js'
import type { FlowMindApprovalQueue } from '../orchestrator/approvalQueue.js'
import type { FlowMindCommandTransactionService } from '../orchestrator/flowMindCommandTransactionService.js'
import { createEntityEventLogRepository, type EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import { buildServer } from '../server.js'
import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    multiEntityRegistry: MultiEntityRegistry
    flowMindApprovalQueue: FlowMindApprovalQueue
    eventLogRepository: EntityEventLogRepository
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
      getEntityById(id: string): Promise<{ id: string, entityProfile: { metadata: { updatedAt?: string, createdAt?: string } } } | null>
    }
    entityCognitiveMemoryStore: {
      get(entityId: string): Promise<{ episodicMemory: { entries: Array<{ id: string }> } } | null>
    }
    flowMindExecutionLedgerRepository: {
      getByCommandId(commandId: string): Promise<{ status: string, errorCode?: string, errorMessage?: string } | null>
    }
    flowMindCommandTransactionService: FlowMindCommandTransactionService
    flowMindService?: {
      evaluateOrchestratorCommand(input: unknown): Promise<unknown>
    }
    sovereignMutationCommandService: {
      submitCommand(input: unknown): Promise<unknown>
    }
    jobWorker: JobWorker
  }
}

async function createAccessToken(args: {
  userId: number
  tenantId: number
  roles: string[]
  privateKeyPem: string
  kid: string
}) {
  const privateKey = await importPKCS8(args.privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(args.userId),
    tenant_id: String(args.tenantId),
    roles: args.roles,
    ver: 1,
    jti: `orchestrator-admin-${args.userId}-${args.tenantId}-${args.roles.join('-')}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer('brandsoul-auth-orchestrator-admin')
    .setAudience('brandsoul-api-orchestrator-admin')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-orchestrator-admin-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'orchestrator-admin-test-kid'
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

  process.env.JWT_SECRET = 'orchestrator-admin-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'orchestrator-admin.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-orchestrator-admin'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-orchestrator-admin'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

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

async function seedApproval(args: {
  app: AppWithContext
  approvalId: string
  entityId?: string
  actionType?: string
  status?: 'pending' | 'approved' | 'rejected' | 'expired'
  expiresAt?: string
}) {
  const now = '2026-05-03T10:30:00.000Z'
  await runWithMutationAuthority({
    source: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedApproval',
    viaExecutor: true,
  }, async () => {
    await args.app.backendContext.flowMindApprovalQueue.enqueue({
      approvalId: args.approvalId,
      entityId: args.entityId ?? 'entity-rollback',
      proposalId: `${args.approvalId}-proposal`,
      actionType: args.actionType ?? 'create_entity',
      rationale: 'Review autonomous create_entity proposal.',
      payload: {
        proposal: {
          proposalId: `${args.approvalId}-proposal`,
          riskClassification: 'high',
        },
      },
      requestedAt: now,
      expiresAt: args.expiresAt,
    })

    if (args.status && args.status !== 'pending') {
      await args.app.backendContext.flowMindApprovalQueue.resolve({
        approvalId: args.approvalId,
        status: args.status,
        resolvedAt: '2026-05-03T10:35:00.000Z',
        resolvedBy: 'user:99',
      })
    }
  })
}

async function seedRegistryData(registry: MultiEntityRegistry) {
  await runWithMutationAuthority({
    source: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedRegistryData',
    viaExecutor: true,
  }, async () => {
    await registry.registerEntity({
      entityId: 'entity-rollback',
      entityType: 'internal-sandbox',
      market: 'legal',
      lifecycleState: 'rollback',
      autonomyLevel: 'partial',
      riskLevel: 'high',
      memoryStatus: 'degraded',
      activeGoals: [{ type: 'create_entity', approvalRequired: true }],
      operatingConstraints: { isolation: 'strict' },
      healthScore: 0.32,
      leadGenerationScore: 0.11,
      memoryConfidence: 0.24,
      autonomyReadiness: 0.71,
      riskScore: 0.84,
      actionQueue: [{ type: 'create_entity_failed', executedAt: '2026-05-03T10:20:00.000Z' }],
      lastDecisionSnapshot: { reason: 'degraded-signal' },
      rollbackState: {
        active: true,
        reason: 'degraded-signal',
        since: '2026-05-03T10:15:00.000Z',
      },
      createdAt: '2026-05-03T10:00:00.000Z',
      updatedAt: '2026-05-03T10:20:00.000Z',
    })

    await registry.registerEntity({
      entityId: 'entity-sandbox',
      entityType: 'internal-sandbox',
      market: 'legal',
      lifecycleState: 'sandbox',
      autonomyLevel: 'manual',
      riskLevel: 'low',
      memoryStatus: 'stable',
      activeGoals: [],
      operatingConstraints: {},
      healthScore: 0.61,
      leadGenerationScore: 0.45,
      memoryConfidence: 0.59,
      autonomyReadiness: 0.75,
      riskScore: 0.18,
      actionQueue: [{ type: 'observe', executedAt: '2026-05-03T10:21:00.000Z' }],
      lastDecisionSnapshot: { reason: 'stable' },
      rollbackState: { active: false },
      createdAt: '2026-05-03T10:01:00.000Z',
      updatedAt: '2026-05-03T10:21:00.000Z',
    })
  })
}

async function seedOwnedOrchestratorEntity(app: AppWithContext, entityId = 'entity-command-route') {
  const entity = createTestEntity()
  entity.id = entityId
  entity.metadata.createdAt = '2026-05-03T11:00:00.000Z'
  entity.metadata.updatedAt = '2026-05-03T11:00:00.000Z'

  await runWithMutationAuthority({
    source: 'backend/src/api/orchestratorAdminRoutes.test.ts#seedOwnedOrchestratorEntity',
    viaExecutor: true,
  }, async () => {
    await app.backendContext.entityRepository.createEntity({
      id: entity.id,
      ownerId: 'user:1:tenant:1',
      ownerUserId: 1,
      ownerTenantId: 1,
      entityProfile: entity,
      createdAt: entity.metadata.createdAt,
      updatedAt: entity.metadata.updatedAt,
    })

    await app.backendContext.multiEntityRegistry.registerEntity({
      entityId: entity.id,
      entityType: 'internal-sandbox',
      market: 'legal',
      lifecycleState: 'sandbox',
      autonomyLevel: 'partial',
      riskLevel: 'low',
      memoryStatus: 'stable',
      activeGoals: [],
      operatingConstraints: {},
      healthScore: 0.62,
      leadGenerationScore: 0.4,
      memoryConfidence: 0.58,
      autonomyReadiness: 0.69,
      riskScore: 0.21,
      actionQueue: [],
      rollbackState: { active: false },
      createdAt: entity.metadata.createdAt,
      updatedAt: entity.metadata.updatedAt,
    })
  })

  return entity.id
}

test('approval admin endpoints reject unauthenticated access', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    for (const url of ['/admin/approvals', '/admin/approvals/approval-1', '/admin/approvals/approval-1/approve', '/admin/approvals/approval-1/reject']) {
      const response = await harness.app.inject({
        method: url.endsWith('/approve') || url.endsWith('/reject') ? 'POST' : 'GET',
        url,
      })

      assert.equal(response.statusCode, 401)
      assert.equal(response.json().error.code, 'AUTH_REQUIRED')
    }
  } finally {
    await harness.close()
  }
})

test('client account is forbidden from approval governance endpoints', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedRegistryData(harness.app.backendContext.multiEntityRegistry)
    await seedApproval({ app: harness.app, approvalId: 'approval-client-forbidden' })
    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/approvals',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 1,
          tenantId: 1,
          roles: ['client'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 403)
    assert.equal(response.json().error.code, 'APPROVAL_ACCESS_DENIED')
  } finally {
    await harness.close()
  }
})

test('admin can list approval items', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedRegistryData(harness.app.backendContext.multiEntityRegistry)
    await seedApproval({ app: harness.app, approvalId: 'approval-list-1' })
    await seedApproval({ app: harness.app, approvalId: 'approval-list-2', actionType: 'launch_campaign' })
    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/approvals',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 2,
          tenantId: 1,
          roles: ['admin'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(Array.isArray(body.approvals), true)
    assert.equal(body.approvals.length, 2)
    assert.equal(body.approvals[0].id, 'approval-list-2')
    assert.equal(body.approvals[0].riskLevel, 'high')
    assert.equal(body.approvals[0].status, 'pending')
  } finally {
    await harness.close()
  }
})

test('admin can approve approval items and write audit events', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-approve' })
    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-approve/approve',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 3,
          tenantId: 1,
          roles: ['admin'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(body.approval.id, 'approval-approve')
    assert.equal(body.approval.status, 'approved')
    assert.equal(body.approval.decidedByUserId, 3)
    const events = await harness.app.backendContext.eventLogRepository.getRecentEvents('entity-rollback', 10)
    assert.equal(events.some((event) => event.type === 'flowmind.approval.approved'), true)
  } finally {
    await harness.close()
  }
})

test('admin can reject approval items and write audit events', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-reject' })
    const response = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-reject/reject',
      headers: {
        authorization: `Bearer ${await createAccessToken({
          userId: 4,
          tenantId: 1,
          roles: ['owner'],
          privateKeyPem: harness.privateKeyPem,
          kid: harness.configuredKid,
        })}`,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().approval.status, 'rejected')
    const events = await harness.app.backendContext.eventLogRepository.getRecentEvents('entity-rollback', 10)
    assert.equal(events.some((event) => event.type === 'flowmind.approval.rejected'), true)
  } finally {
    await harness.close()
  }
})

test('double approve returns the same final state', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-idempotent' })
    const token = await createAccessToken({
      userId: 5,
      tenantId: 1,
      roles: ['operator'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const first = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-idempotent/approve',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    const second = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-idempotent/approve',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.equal(first.json().approval.status, 'approved')
    assert.equal(second.json().approval.status, 'approved')
    assert.equal(first.json().approval.decidedAt, second.json().approval.decidedAt)
  } finally {
    await harness.close()
  }
})

test('rejected approval cannot be approved later', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedApproval({ app: harness.app, approvalId: 'approval-rejected-later' })
    const rejectToken = await createAccessToken({
      userId: 6,
      tenantId: 1,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const rejected = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-rejected-later/reject',
      headers: {
        authorization: `Bearer ${rejectToken}`,
      },
    })
    const approvedLater = await harness.app.inject({
      method: 'POST',
      url: '/admin/approvals/approval-rejected-later/approve',
      headers: {
        authorization: `Bearer ${rejectToken}`,
      },
    })

    assert.equal(rejected.statusCode, 200)
    assert.equal(approvedLater.statusCode, 409)
    assert.equal(approvedLater.json().error.code, 'APPROVAL_TERMINAL_STATE_LOCKED')
    assert.equal(approvedLater.json().approval.status, 'rejected')
  } finally {
    await harness.close()
  }
})

test('POST /orchestrator/:entityId/command executes through sovereign command and updates event, memory, and registry', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app)
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-route-1',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(body.command.commandId, 'orchestrator-command-route-1')
    assert.equal(body.event.causedByCommandId, 'orchestrator-command-route-1')

    const events = await harness.app.backendContext.eventLogRepository.getRecentEvents(entityId, 10)
    assert.equal(events.some((event) => event.causedByCommandId === 'orchestrator-command-route-1'), true)

    const memory = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    assert.notEqual(memory, null)

    const registryEntry = await harness.app.backendContext.multiEntityRegistry.getEntityById(entityId)
    assert.equal(registryEntry?.lastDecisionSnapshot?.commandId, 'orchestrator-command-route-1')
  } finally {
    await harness.close()
  }
})

test('orchestrator command route does not call deprecated flowMindCommandTransactionService.execute directly', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-adapter')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const originalExecute = harness.app.backendContext.flowMindCommandTransactionService.execute.bind(harness.app.backendContext.flowMindCommandTransactionService)
    harness.app.backendContext.flowMindCommandTransactionService.execute = async () => {
      throw new Error('OLD_PATH_USED')
    }

    try {
      const response = await harness.app.inject({
        method: 'POST',
        url: `/orchestrator/${entityId}/command`,
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': 'orchestrator-command-route-2',
        },
        payload: {
          type: 'command',
          name: 'start_birth',
        },
      })

      assert.equal(response.statusCode, 200)
      assert.equal(response.json().status, 'ready')
    } finally {
      harness.app.backendContext.flowMindCommandTransactionService.execute = originalExecute
    }
  } finally {
    await harness.close()
  }
})

test('orchestrator command route is idempotent for the same command id', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-idempotent')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const first = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-route-idempotent',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })
    const eventCountAfterFirst = (await harness.app.backendContext.eventLogRepository.getRecentEvents(entityId, 20)).length

    const second = await harness.app.inject({
      method: 'POST',
      url: `/orchestrator/${entityId}/command`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'orchestrator-command-route-idempotent',
      },
      payload: {
        type: 'command',
        name: 'start_birth',
      },
    })
    const eventCountAfterSecond = (await harness.app.backendContext.eventLogRepository.getRecentEvents(entityId, 20)).length

    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.equal(first.json().idempotent ?? false, false)
    assert.equal(second.json().idempotent, true)
    assert.equal(eventCountAfterSecond, eventCountAfterFirst)
  } finally {
    await harness.close()
  }
})

test('orchestrator command route records ledger failure and does not claim success when FlowMind evaluation fails', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedOwnedOrchestratorEntity(harness.app, 'entity-command-route-failure')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['owner'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    assert.ok(harness.app.backendContext.flowMindService)
    const originalEvaluate = harness.app.backendContext.flowMindService.evaluateOrchestratorCommand.bind(harness.app.backendContext.flowMindService)
    harness.app.backendContext.flowMindService.evaluateOrchestratorCommand = async () => {
      throw {
        statusCode: 500,
        code: 'FLOWMIND_INJECTED_FAILURE',
        message: 'Injected FlowMind failure.',
      }
    }

    try {
      const response = await harness.app.inject({
        method: 'POST',
        url: `/orchestrator/${entityId}/command`,
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': 'orchestrator-command-route-failure',
        },
        payload: {
          type: 'command',
          name: 'start_birth',
        },
      })

      assert.equal(response.statusCode, 500)
      assert.equal(response.json().status, 'failed')
      assert.equal(response.json().error.code, 'FLOWMIND_INJECTED_FAILURE')

      const ledger = await harness.app.backendContext.flowMindExecutionLedgerRepository.getByCommandId('orchestrator-command-route-failure')
      assert.equal(ledger?.status, 'failed')
      assert.equal(ledger?.errorCode, 'FLOWMIND_INJECTED_FAILURE')
    } finally {
      harness.app.backendContext.flowMindService.evaluateOrchestratorCommand = originalEvaluate
    }
  } finally {
    await harness.close()
  }
})
