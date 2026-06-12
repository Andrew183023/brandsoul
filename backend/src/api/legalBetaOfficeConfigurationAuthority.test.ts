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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-office-config-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-office-config-kid'
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
  process.env.JWT_SECRET = 'legal-beta-office-config-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-office-config.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-office-config'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-office-config'
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

async function registerOwner(app: AppWithContext) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      name: 'Ana Rocha',
      email: 'ana.rocha@example.com',
      password: 'SenhaSegura123',
      tenant_name: 'Ana Rocha Advocacia',
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

test('legal beta office configuration update uses authority boundary and returns 200', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const accessToken = await registerOwner(harness.app)

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/escritorios/criar',
      headers: authHeaders(accessToken),
      payload: {
        name: 'Rocha & Lima Legal',
        primaryColor: '#123456',
      },
    })

    assert.equal(createResponse.statusCode, 201)
    const createBody = createResponse.json() as { officeId: string }

    const updateResponse = await harness.app.inject({
      method: 'POST',
      url: `/escritorios/${createBody.officeId}/configuracao`,
      headers: authHeaders(accessToken),
      payload: {
        businessConfig: {
          businessType: 'legal',
          officeName: 'Rocha & Lima Legal Atualizado',
          institutionalDescription: 'Atendimento empresarial e trabalhista.',
          legalAreas: ['trabalhista', 'empresarial'],
          servedCities: ['Sao Paulo'],
        },
      },
    })

    assert.equal(updateResponse.statusCode, 200)
    const updateBody = updateResponse.json() as {
      status: string
      officeId: string
      businessConfig: {
        officeName?: string
        institutionalDescription?: string
        legalAreas?: string[]
      }
    }
    assert.equal(updateBody.status, 'ready')
    assert.equal(updateBody.officeId, createBody.officeId)
    assert.equal(updateBody.businessConfig.officeName, 'Rocha & Lima Legal Atualizado')
    assert.equal(updateBody.businessConfig.institutionalDescription, 'Atendimento empresarial e trabalhista.')

    const storedOffice = await harness.app.backendContext.entityRepository.getEntityById(createBody.officeId)
    const metadata = (storedOffice?.entityProfile as { metadata?: { businessConfig?: {
      officeName?: string
      institutionalDescription?: string
      legalAreas?: string[]
      servedCities?: string[]
    } } })?.metadata

    assert.equal(metadata?.businessConfig?.officeName, 'Rocha & Lima Legal Atualizado')
    assert.equal(metadata?.businessConfig?.institutionalDescription, 'Atendimento empresarial e trabalhista.')
    assert.deepEqual(metadata?.businessConfig?.legalAreas, ['trabalhista', 'empresarial'])
    assert.deepEqual(metadata?.businessConfig?.servedCities, ['Sao Paulo'])

    const attestation = await harness.app.backendContext.connection.get<{
      total: number
    }>(
      `
        SELECT COUNT(*) AS total
        FROM flowmind_semantic_mutation_attestation
        WHERE intent_type = 'legal.office.configure'
          AND intent_id = ?
      `,
      `legal-office-configure:${createBody.officeId}:1:1`,
    )

    assert.equal(Number(attestation?.total ?? 0), 1)
  } finally {
    await harness.close()
  }
})
