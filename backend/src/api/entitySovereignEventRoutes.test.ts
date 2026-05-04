import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { JobWorker } from '../jobs/index.js'
import type { EntityEventLogRepository } from '../repositories/entityEventLogRepository.js'
import type { EntityExportRepository } from '../repositories/entityExportRepository.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import type { GrowthRepository } from '../repositories/growthRepository.js'
import type { SovereignMutationCommandService } from '../orchestrator/sovereignMutationCommandService.js'
import { buildServer } from '../server.js'
import { createLegalCase } from '../services/publicInteractionActionService.js'
import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    entityRepository: EntityRepository
    entityExportRepository: EntityExportRepository
    eventLogRepository: EntityEventLogRepository
    growthRepository: GrowthRepository
    sovereignMutationCommandService: SovereignMutationCommandService
    jobWorker: JobWorker
  }
}

async function createAccessToken(args: {
  userId: number
  tenantId: number
  roles?: string[]
  privateKeyPem: string
  kid: string
}) {
  const privateKey = await importPKCS8(args.privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(args.userId),
    tenant_id: String(args.tenantId),
    roles: args.roles ?? ['owner'],
    ver: 1,
    jti: `entity-sovereign-events-${args.userId}-${args.tenantId}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer('brandsoul-auth-entity-sovereign-events')
    .setAudience('brandsoul-api-entity-sovereign-events')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-entity-sovereign-events-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'entity-sovereign-events-test-kid'
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

  process.env.JWT_SECRET = 'entity-sovereign-events-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'entity-sovereign-events.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-entity-sovereign-events'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-entity-sovereign-events'
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

async function seedOwnedEntity(app: AppWithContext, entityId: string) {
  const entity = createTestEntity()
  entity.id = entityId
  entity.metadata.createdAt = '2026-05-04T10:00:00.000Z'
  entity.metadata.updatedAt = '2026-05-04T10:00:00.000Z'
  entity.metadata.businessConfig = {
    businessType: 'legal',
    legalMode: { enabled: true },
  } as never

  await runWithMutationAuthority({
    source: 'backend/src/api/entitySovereignEventRoutes.test.ts#seedOwnedEntity',
    viaExecutor: true,
  }, async () => {
    await app.backendContext.entityRepository.createEntity({
      id: entityId,
      ownerId: 'user:5:tenant:8',
      ownerUserId: 5,
      ownerTenantId: 8,
      entityProfile: entity,
      createdAt: entity.metadata.createdAt,
      updatedAt: entity.metadata.updatedAt,
    })
  })

  return entity
}

test('POST /entity/:id/events appends the event through the sovereign command path', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedOwnedEntity(harness.app, 'entity-events-owned')
    const token = await createAccessToken({
      userId: 5,
      tenantId: 8,
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const response = await harness.app.inject({
      method: 'POST',
      url: '/entity/entity-events-owned/events',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        type: 'return.visit',
        payload: {
          summary: 'Viewer returned.',
        },
      },
    })

    assert.equal(response.statusCode, 201)
    assert.equal(response.json().event.type, 'return.visit')

    const growthEvents = await harness.app.backendContext.growthRepository.getGrowthEvents('entity-events-owned', 10)
    assert.equal(growthEvents.some((event) => event.type === 'return_visit'), true)
  } finally {
    await harness.close()
  }
})

test('GET /entity/:id/export/:exportId records public export views through the sovereign command path', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedOwnedEntity(harness.app, 'entity-export-owned')
    await harness.app.backendContext.entityExportRepository.logExport({
      id: 'exp-owned-1',
      entityId: 'entity-export-owned',
      format: 'square',
      fileUrl: 'https://example.com/export.png',
      createdAt: '2026-05-04T10:05:00.000Z',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/entity/entity-export-owned/export/exp-owned-1',
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().export.id, 'exp-owned-1')

    const growthEvents = await harness.app.backendContext.growthRepository.getGrowthEvents('entity-export-owned', 10)
    assert.equal(growthEvents.some((event) => event.type === 'export_viewed'), true)
  } finally {
    await harness.close()
  }
})

test('legacy legal case routes still emit assignment, message, and close events through sovereign commands', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entity = await seedOwnedEntity(harness.app, 'entity-legal-owned')
    const token = await createAccessToken({
      userId: 5,
      tenantId: 8,
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const recordedCommandTypes: string[] = []
    const originalSubmitCommand = harness.app.backendContext.sovereignMutationCommandService.submitCommand.bind(harness.app.backendContext.sovereignMutationCommandService)
    harness.app.backendContext.sovereignMutationCommandService.submitCommand = async (input) => {
      if (typeof input === 'object' && input && 'type' in input && typeof input.type === 'string') {
        recordedCommandTypes.push(input.type)
      }
      return originalSubmitCommand(input as Parameters<typeof originalSubmitCommand>[0])
    }
    const legalCase = await createLegalCase({
      entityId: entity.id,
      entityProfile: entity,
      repository: harness.app.backendContext.entityRepository,
      sovereignCommandService: harness.app.backendContext.sovereignMutationCommandService,
      slots: {
        description: 'Preciso de ajuda com um contrato de trabalho.',
        city: 'Sao Paulo',
        contact: 'cliente@example.com',
      },
      creatorActorId: 'user:5',
      creatorUserId: 5,
      creatorTenantId: 8,
      now: '2026-05-04T10:10:00.000Z',
    })

    const assign = await harness.app.inject({
      method: 'POST',
      url: `/cases/${legalCase.id}/assign`,
      headers: { authorization: `Bearer ${token}` },
      payload: { lawyerId: 'lawyer-1' },
    })
    assert.equal(assign.statusCode, 200)

    const message = await harness.app.inject({
      method: 'POST',
      url: `/cases/${legalCase.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { role: 'user', text: 'Tenho novos documentos.' },
    })
    assert.equal(message.statusCode, 200)

    const close = await harness.app.inject({
      method: 'POST',
      url: `/cases/${legalCase.id}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: 5, feedback: 'Resolvido', closedBy: 'cliente' },
    })
    assert.equal(close.statusCode, 200)

    assert.equal(recordedCommandTypes.includes('legal.case.assign'), true)
    assert.equal(recordedCommandTypes.includes('legal.case.message.append'), true)
    assert.equal(recordedCommandTypes.includes('legal.case.close'), true)
  } finally {
    await harness.close()
  }
})
