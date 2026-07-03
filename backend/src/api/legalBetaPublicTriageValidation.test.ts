import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { generateKeyPairSync } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { BackendDatabase } from '../db/index.js'
import { hashPublicTriageIdentityKey } from '../modules/legalCases/legalPublicTriageSpamPolicy.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { buildLegalBetaServer } from '../server.legal-beta.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    sovereignMutationCommandService: {
      submitPortfolioPublicTriageCaptureInTransaction: (...args: unknown[]) => Promise<unknown>
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-triage-validation-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-triage-validation-kid'
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
  process.env.JWT_SECRET = 'legal-beta-triage-validation-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-triage-validation.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-triage-validation'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-triage-validation'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildLegalBetaServer() as AppWithContext

  await runSeedMutation(async () => {
    await app.backendContext.entityRepository.createEntity({
      id: 'office-validation-1',
      ownerId: 'user:100:tenant:11',
      ownerUserId: 100,
      ownerTenantId: 11,
      entityProfile: createEntityProfileFixture('office-validation-1'),
    })
  }, 'backend/src/api/legalBetaPublicTriageValidation.test.ts#createHarness')

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

async function countRows(db: BackendDatabase, table: string) {
  const row = await db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`)
  return Number(row?.total ?? 0)
}

function buildValidPayload() {
  return {
    requestId: 'triage-validation-1',
    userMessage: 'Fui demitido sem receber verbas rescisórias.',
    businessContext: {
      businessType: 'legal',
      officeName: 'Ana Rocha Advocacia',
    },
    triage: {
      clientName: 'João da Silva',
      city: 'Belo Horizonte',
      practiceArea: 'Direito Trabalhista',
      context: 'Fui demitido sem receber verbas rescisórias.',
      urgency: 'planned',
      objective: 'Entender meus direitos e próximos passos.',
      contactPreference: 'WhatsApp',
      contactValue: '31999998888',
    },
  }
}

function buildVariantPayload(args: {
  requestId: string
  contactValue?: string
  objective?: string
  userMessage?: string
}) {
  const base = buildValidPayload()
  return {
    ...base,
    requestId: args.requestId,
    userMessage: args.userMessage ?? base.userMessage,
    triage: {
      ...base.triage,
      contactValue: args.contactValue ?? base.triage.contactValue,
      objective: args.objective ?? base.triage.objective,
      context: args.objective ?? base.triage.context,
    },
  }
}

async function insertSpamAllowEvent(args: {
  db: BackendDatabase
  entityId: string
  requestId: string
  ipKey?: string
  contactKey?: string
  reason?: string
}) {
  const now = new Date().toISOString()
  await args.db.run(
    `
      INSERT INTO public_triage_spam_events (
        id,
        tenant_id,
        entity_id,
        ip_key,
        contact_key,
        fingerprint,
        request_id,
        reason,
        decision,
        created_at,
        expires_at,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    `spam-${args.requestId}`,
    11,
    args.entityId,
    args.ipKey ?? null,
    args.contactKey ?? null,
    null,
    args.requestId,
    args.reason ?? 'attempt_allowed',
    'allow',
    now,
    new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    '{}',
  )
}

test('public legal-beta triage blocks invalid payloads before persistence and accepts a valid direct request', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const db = harness.app.backendContext.connection
    const route = '/public/escritorios/office-validation-1/triagem'

    const invalidPayloads = [
      {},
      { userMessage: 'Contexto mínimo sem triage.' },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, clientName: '   ' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, contactValue: '   ' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, city: ' ' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, practiceArea: ' ' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, objective: 'curto' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, urgency: 'panic' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, contactPreference: 'telegram' } },
      { ...buildValidPayload(), triage: { ...buildValidPayload().triage, contactPreference: 'email', contactValue: '31999998888' } },
      { ...buildValidPayload(), userMessage: 'x'.repeat(3001) },
    ]

    for (const payload of invalidPayloads) {
      const response = await harness.app.inject({
        method: 'POST',
        url: route,
        headers: {
          'content-type': 'application/json',
        },
        payload,
      })

      assert.equal(response.statusCode, 400)
      const body = response.json() as {
        error: string
        message: string
        requestId?: string
        fields: Array<{ field: string; code: string; message: string }>
      }
      assert.equal(body.error, 'invalid_intake')
      assert.ok(Array.isArray(body.fields))
      assert.ok(typeof body.requestId === 'string' && body.requestId.length > 0)
      if (payload?.triage?.contactPreference === 'email') {
        assert.ok(body.fields.some((field) => field.field === 'contactValue' && field.code === 'invalid_contact'))
      }

      assert.equal(await countRows(db, 'entity_portfolio_lead_signal'), 0)
      assert.equal(await countRows(db, 'entity_portfolio_lead'), 0)
      assert.equal(await countRows(db, 'entity_portfolio_lead_intake'), 0)
      assert.equal(await countRows(db, 'cases'), 0)
      assert.equal(await countRows(db, 'case_portal_access_tokens'), 0)
    }

    const validResponse = await harness.app.inject({
      method: 'POST',
      url: route,
      headers: {
        'content-type': 'application/json',
      },
      payload: buildValidPayload(),
    })

    assert.equal(validResponse.statusCode, 201)
    const validBody = validResponse.json() as {
      status: 'ready'
      leadId: string
      intakeId: string
      caseId: string
      portalUrl: string
      actionResult: {
        caseId: string
      }
    }
    assert.equal(validBody.status, 'ready')
    assert.ok(validBody.leadId)
    assert.ok(validBody.intakeId)
    assert.ok(validBody.caseId)
    assert.ok(validBody.portalUrl)
    assert.equal(validBody.actionResult.caseId, validBody.caseId)

    assert.equal(await countRows(db, 'entity_portfolio_lead_signal'), 1)
    assert.equal(await countRows(db, 'entity_portfolio_lead'), 1)
    assert.equal(await countRows(db, 'entity_portfolio_lead_intake'), 1)
    assert.equal(await countRows(db, 'cases'), 1)
    assert.equal(await countRows(db, 'case_portal_access_tokens'), 1)
  } finally {
    await harness.close()
  }
})

test('public legal-beta triage returns a sanitized operational error with requestId when case creation fails unexpectedly', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const route = '/public/escritorios/office-validation-1/triagem'
    const originalSubmit =
      harness.app.backendContext.sovereignMutationCommandService.submitPortfolioPublicTriageCaptureInTransaction

    harness.app.backendContext.sovereignMutationCommandService.submitPortfolioPublicTriageCaptureInTransaction = async () => {
      throw new Error('SQLITE_CONSTRAINT failed at /mnt/c/private/token-raw-value')
    }

    const response = await harness.app.inject({
      method: 'POST',
      url: route,
      headers: {
        'content-type': 'application/json',
      },
      payload: buildValidPayload(),
    })

    harness.app.backendContext.sovereignMutationCommandService.submitPortfolioPublicTriageCaptureInTransaction = originalSubmit

    assert.equal(response.statusCode, 500)
    const body = response.json() as {
      error: string
      message: string
      requestId?: string
    }
    assert.equal(body.error, 'triage_creation_failed')
    assert.equal(body.message, 'Não foi possível criar o atendimento agora. Tente novamente em instantes.')
    assert.equal(body.requestId, buildValidPayload().requestId)
    assert.equal(body.message.includes('SQLITE_CONSTRAINT'), false)
    assert.equal(response.body.includes('/mnt/c/private'), false)
    assert.equal(response.body.includes('token-raw-value'), false)
  } finally {
    await harness.close()
  }
})

test('public legal-beta triage returns 429 after repeated invalid payloads from the same IP', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const route = '/public/escritorios/office-validation-1/triagem'

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await harness.app.inject({
        method: 'POST',
        url: route,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        payload: {},
      })
      assert.equal(response.statusCode, 400)
    }

    const blockedResponse = await harness.app.inject({
      method: 'POST',
      url: route,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      payload: {},
    })

    assert.equal(blockedResponse.statusCode, 429)
    const body = blockedResponse.json() as {
      error: string
      requestId?: string
      retryAfterSeconds?: number
    }
    assert.equal(body.error, 'triage_rate_limited')
    assert.equal(typeof body.requestId, 'string')
    assert.equal(typeof body.retryAfterSeconds, 'number')
  } finally {
    await harness.close()
  }
})

test('public legal-beta triage blocks excessive attempts for the same canonical contact', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const route = '/public/escritorios/office-validation-1/triagem'

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await harness.app.inject({
        method: 'POST',
        url: route,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${20 + attempt}`,
        },
        payload: buildVariantPayload({
          requestId: `triage-contact-limit-${attempt}`,
          objective: `Objetivo distinto ${attempt} para evitar fingerprint igual.`,
        }),
      })
      assert.equal(response.statusCode, 201)
    }

    const blockedResponse = await harness.app.inject({
      method: 'POST',
      url: route,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.99',
      },
      payload: buildVariantPayload({
        requestId: 'triage-contact-limit-blocked',
        objective: 'Quarto objetivo distinto para disparar cooldown do mesmo contato.',
      }),
    })

    assert.equal(blockedResponse.statusCode, 429)
    const body = blockedResponse.json() as {
      error: string
      retryAfterSeconds?: number
    }
    assert.equal(body.error, 'triage_rate_limited')
    assert.equal(typeof body.retryAfterSeconds, 'number')
  } finally {
    await harness.close()
  }
})

test('public legal-beta triage blocks an IP already over the configured spam limit', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const route = '/public/escritorios/office-validation-1/triagem'
    const ipKey = hashPublicTriageIdentityKey('198.51.100.45')
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await insertSpamAllowEvent({
        db: harness.app.backendContext.connection,
        entityId: 'office-validation-1',
        requestId: `seed-ip-${attempt}`,
        ipKey,
      })
    }

    const blockedResponse = await harness.app.inject({
      method: 'POST',
      url: route,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.45',
      },
      payload: buildVariantPayload({
        requestId: 'triage-ip-limit-blocked',
        contactValue: '31999997777',
        objective: 'Objetivo distinto com outro contato para isolar limite por IP.',
      }),
    })

    assert.equal(blockedResponse.statusCode, 429)
    const body = blockedResponse.json() as { error: string }
    assert.equal(body.error, 'triage_rate_limited')
  } finally {
    await harness.close()
  }
})

test('public legal-beta triage blocks an office already over the configured spam limit', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const route = '/public/escritorios/office-validation-1/triagem'
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await insertSpamAllowEvent({
        db: harness.app.backendContext.connection,
        entityId: 'office-validation-1',
        requestId: `seed-office-${attempt}`,
      })
    }

    const blockedResponse = await harness.app.inject({
      method: 'POST',
      url: route,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.80',
      },
      payload: buildVariantPayload({
        requestId: 'triage-office-limit-blocked',
        contactValue: '31999996666',
        objective: 'Objetivo distinto para isolar limite por escritório.',
      }),
    })

    assert.equal(blockedResponse.statusCode, 429)
    const body = blockedResponse.json() as { error: string }
    assert.equal(body.error, 'triage_rate_limited')
  } finally {
    await harness.close()
  }
})
