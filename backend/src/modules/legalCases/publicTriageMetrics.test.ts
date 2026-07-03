import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../../db/index.js'
import type { SovereignMutationCommandService } from '../../orchestrator/sovereignMutationCommandService.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { buildLegalBetaServer } from '../../server.legal-beta.js'
import { runSeedMutation } from '../../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    sovereignMutationCommandService: SovereignMutationCommandService
    observability: {
      getMetricsSnapshot(): {
        customCounters: Record<string, number>
        customCounterSeries: Record<string, number>
      }
    }
  }
}

type Harness = {
  app: AppWithContext
  close(): Promise<void>
}

function createEntityProfileFixture(id: string): EntityProfile {
  return {
    id,
    social: {
      publicName: 'Ana Rocha Advocacia',
    },
    metadata: {
      createdAt: '2026-06-28T10:00:00.000Z',
      notes: [],
      businessConfig: {
        businessType: 'legal',
        officeName: 'Ana Rocha Advocacia',
      },
    },
  } as unknown as EntityProfile
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-public-triage-metrics-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
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
  process.env.JWT_SECRET = 'public-triage-metrics-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'public-triage-metrics.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-public-triage-metrics'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-public-triage-metrics'
  process.env.AUTH_ACTIVE_KID = 'public-triage-metrics-kid'
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildLegalBetaServer() as AppWithContext

  await runSeedMutation(async () => {
    await app.backendContext.entityRepository.createEntity({
      id: 'office-public-triage-metrics-1',
      ownerId: 'user:100:tenant:11',
      ownerUserId: 100,
      ownerTenantId: 11,
      entityProfile: createEntityProfileFixture('office-public-triage-metrics-1'),
    })
  }, 'backend/src/modules/legalCases/publicTriageMetrics.test.ts#createHarness')

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

function buildValidPayload(requestId: string) {
  return {
    requestId,
    userMessage: 'Fui desligado e preciso entender meus direitos trabalhistas.',
    triage: {
      clientName: 'João da Silva',
      city: 'Belo Horizonte',
      practiceArea: 'Direito Trabalhista',
      context: 'Fui desligado e preciso entender meus direitos trabalhistas.',
      urgency: 'planned',
      objective: 'Receber orientação sobre verbas rescisórias e próximos passos.',
      contactPreference: 'WhatsApp',
      contactValue: '31999998888',
    },
    businessContext: {
      officeName: 'Ana Rocha Advocacia',
    },
  }
}

test('public triage funnel metrics cover invalid and created requests without PII leakage', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const invalidResponse = await harness.app.inject({
      method: 'POST',
      url: '/public/escritorios/office-public-triage-metrics-1/triagem',
      payload: {
        requestId: 'triage-invalid-1',
        userMessage: 'Resumo curto',
        triage: {
          clientName: '  ',
          city: 'Belo Horizonte',
          practiceArea: 'Direito Trabalhista',
          objective: 'Objetivo válido para teste.',
          urgency: 'planned',
          contactPreference: 'WhatsApp',
          contactValue: '31999998888',
        },
      },
    })

    assert.equal(invalidResponse.statusCode, 400)

    let snapshot = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.public_triage_requests_total, 1)
    assert.equal(snapshot.customCounters.public_triage_invalid_total, 1)
    assert.equal(snapshot.customCounters.public_triage_valid_total ?? 0, 0)
    assert.equal(snapshot.customCounters.public_triage_case_created_total ?? 0, 0)
    assert.equal(
      snapshot.customCounterSeries['public_triage_requests_total{result=received,source=public_triage,tenant_id=11}'],
      1,
    )
    assert.equal(
      snapshot.customCounterSeries['public_triage_invalid_total{reason=validation_required,result=invalid,source=public_triage,tenant_id=11}'],
      1,
    )

    const validResponse = await harness.app.inject({
      method: 'POST',
      url: '/public/escritorios/office-public-triage-metrics-1/triagem',
      payload: buildValidPayload('triage-valid-1'),
    })

    assert.equal(validResponse.statusCode, 201)

    snapshot = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.public_triage_requests_total, 2)
    assert.equal(snapshot.customCounters.public_triage_invalid_total, 1)
    assert.equal(snapshot.customCounters.public_triage_valid_total, 1)
    assert.equal(snapshot.customCounters.public_triage_case_created_total, 1)
    assert.equal(
      snapshot.customCounterSeries['public_triage_valid_total{result=valid,source=public_triage,tenant_id=11}'],
      1,
    )
    assert.equal(
      snapshot.customCounterSeries['public_triage_case_created_total{entity_id=office-public-triage-metrics-1,result=created,source=public_triage,tenant_id=11}'],
      1,
    )

    const serializedSeries = JSON.stringify(snapshot.customCounterSeries)
    assert.equal(serializedSeries.includes('João da Silva'), false)
    assert.equal(serializedSeries.includes('31999998888'), false)
    assert.equal(serializedSeries.includes('5531999998888'), false)
    assert.equal(serializedSeries.includes('Belo Horizonte'), false)
  } finally {
    await harness.close()
  }
})
