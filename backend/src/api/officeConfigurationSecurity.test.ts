import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { JobWorker } from '../jobs/index.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { buildServer } from '../server.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    entityRepository: EntityRepository
    jobWorker: JobWorker
  }
}

async function createAccessToken(userId: number, tenantId: number, privateKeyPem: string, kid: string) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(userId),
    tenant_id: String(tenantId),
    roles: ['owner'],
    ver: 1,
    jti: `office-config-security-${userId}-${tenantId}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-office-config-security')
    .setAudience('brandsoul-api-office-config-security')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-office-config-security-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'office-config-security-kid'
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

  process.env.JWT_SECRET = 'office-config-security-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'office-config-security.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-office-config-security'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-office-config-security'
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

function createEntityProfileFixture(id: string): EntityProfile {
  return {
    id,
    social: {
      publicName: 'Ferreira Rocha Advocacia',
    },
    metadata: {
      createdAt: '2026-06-03T10:00:00.000Z',
      notes: [],
      businessConfig: {
        businessType: 'legal',
        officeName: 'Ferreira Rocha Advocacia',
        institutionalDescription: 'Atendimento trabalhista e civel para PMEs.',
        legalAreas: ['Trabalhista', 'Civel'],
        servedCities: ['Sao Paulo', 'Campinas'],
        channels: {
          email: 'interno@ferreirarocha.example',
          phone: '+55 11 99999-0000',
        },
        team: [
          {
            id: 'prof-owner-1',
            name: 'Dra. Ana Rocha',
            email: 'ana@ferreirarocha.example',
            phone: '+55 11 99999-1111',
            status: 'active',
            isResponsible: true,
            isPublic: true,
          },
        ],
      },
    },
  } as unknown as EntityProfile
}

async function seedEntity(app: AppWithContext) {
  await runSeedMutation(
    () => app.backendContext.entityRepository.createEntity({
      id: 'office-real-1',
      ownerId: 'user:7:tenant:11',
      ownerUserId: 7,
      ownerTenantId: 11,
      entityProfile: createEntityProfileFixture('office-real-1'),
    }),
    'backend/src/api/officeConfigurationSecurity.test.ts#seedEntity',
  )
}

test('GET /escritorios/:id/configuracao rejects anonymous access', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app)
    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-real-1/configuracao',
    })

    assert.ok([401, 403].includes(response.statusCode))
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/configuracao rejects authenticated non-owners', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app)
    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-real-1/configuracao',
      headers: {
        authorization: `Bearer ${await createAccessToken(8, 12, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 403)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/configuracao returns configuration for the authenticated office owner', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app)
    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-real-1/configuracao',
      headers: {
        authorization: `Bearer ${await createAccessToken(7, 11, harness.privateKeyPem, harness.configuredKid)}`,
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().officeId, 'office-real-1')
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/publico returns the sanitized public office projection', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedEntity(harness.app)
    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-real-1/publico',
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as { businessConfig?: Record<string, unknown> | null }
    const serialized = JSON.stringify(body)
    assert.equal((body.businessConfig ?? {})['officeName'], 'Ferreira Rocha Advocacia')
    assert.equal((body.businessConfig ?? {})['channels'], undefined)
    assert.equal((body.businessConfig ?? {})['team'], undefined)
    assert.match(serialized, /Ferreira Rocha Advocacia/)
    assert.doesNotMatch(serialized, /interno@ferreirarocha\.example/)
    assert.doesNotMatch(serialized, /\+55 11 99999-0000/)
    assert.doesNotMatch(serialized, /isResponsible/)
    assert.doesNotMatch(serialized, /"status":/)
  } finally {
    await harness.close()
  }
})
