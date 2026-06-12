import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { buildLegalBetaServer } from '../server.legal-beta.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
  }
}

type Harness = {
  app: AppWithContext
  close(): Promise<void>
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-office-admin-read-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-office-admin-read-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    SQLITE_FILE: process.env.SQLITE_FILE,
    ASSET_STORAGE_DIR: process.env.ASSET_STORAGE_DIR,
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
    AUTH_ACTIVE_KID: process.env.AUTH_ACTIVE_KID,
    AUTH_PRIVATE_KEY_REF: process.env.AUTH_PRIVATE_KEY_REF,
    AUTH_PUBLIC_KEY_PATH: process.env.AUTH_PUBLIC_KEY_PATH,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  }

  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'legal-beta-office-admin-read-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-office-admin-read.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-office-admin-read'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-office-admin-read'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildLegalBetaServer() as AppWithContext

  return {
    app,
    async close() {
      await app.close()
      await app.backendContext.connection.close()
      await rm(workspace, { recursive: true, force: true })
      for (const [key, value] of Object.entries(previousEnv)) {
        if (typeof value === 'undefined') {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    },
  }
}

async function registerOwner(app: AppWithContext, args: {
  name: string
  email: string
  tenantName: string
}) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: args.name,
      email: args.email,
      password: 'SenhaSegura123',
      tenant_name: args.tenantName,
      business_model: 'professional',
    },
  })

  assert.equal(response.statusCode, 200)
  return (response.json() as { accessToken: string }).accessToken
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  }
}

test('GET /escritorios/:id/configuracao requires ownership in legal beta', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const ownerAccessToken = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })
    const otherAccessToken = await registerOwner(harness.app, {
      name: 'Bruno Lima',
      email: 'bruno.lima@example.com',
      tenantName: 'Bruno Lima Consultoria',
    })

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/escritorios/criar',
      headers: authHeaders(ownerAccessToken),
      payload: {
        name: 'Rocha & Lima Legal',
        primaryColor: '#123456',
      },
    })

    assert.equal(createResponse.statusCode, 201)
    const { officeId } = createResponse.json() as { officeId: string }

    const anonymousResponse = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${officeId}/configuracao`,
    })
    assert.equal(anonymousResponse.statusCode, 401)

    const foreignResponse = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${officeId}/configuracao`,
      headers: authHeaders(otherAccessToken),
    })
    assert.ok([403, 404].includes(foreignResponse.statusCode))

    const ownerResponse = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${officeId}/configuracao`,
      headers: authHeaders(ownerAccessToken),
    })

    assert.equal(ownerResponse.statusCode, 200)
    const body = ownerResponse.json() as {
      status: string
      officeId: string
      businessConfig: {
        businessType?: string
        officeName?: string
      } | null
    }
    assert.equal(body.status, 'ready')
    assert.equal(body.officeId, officeId)
    assert.equal(body.businessConfig?.businessType, 'legal')
    assert.equal(body.businessConfig?.officeName, 'Rocha & Lima Legal')
  } finally {
    await harness.close()
  }
})
