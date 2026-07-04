import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { buildLegalBetaServer } from '../../server.legal-beta.js'

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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-operational-intelligence-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-operational-intelligence-kid'
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
  process.env.JWT_SECRET = 'legal-beta-operational-intelligence-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-operational-intelligence.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-operational-intelligence'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-operational-intelligence'
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
  return response.json() as { accessToken: string }
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  }
}

async function createOffice(app: AppWithContext, accessToken: string, name: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/escritorios/criar',
    headers: authHeaders(accessToken),
    payload: {
      name,
      primaryColor: '#123456',
    },
  })

  assert.equal(response.statusCode, 201)
  return response.json() as { officeId: string }
}

async function createCaseFixtures(args: {
  db: BackendDatabase
  tenantId: number
  officeId: string
}) {
  const repository = createCaseRepository(args.db)

  await repository.createCase({
    tenantId: args.tenantId,
    entityId: args.officeId,
    title: 'Caso trabalhista aberto',
    status: 'open',
    priority: 'normal',
    practiceArea: 'Direito Trabalhista',
    leadProfessionalId: 'prof-1',
    openedAt: '2026-07-01T08:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente A',
      canonicalName: 'cliente-a',
      displayPhone: '31999990001',
      canonicalPhone: '5531999990001',
      displayEmail: 'cliente-a@example.com',
      canonicalEmail: 'cliente-a@example.com',
      displayCity: 'Belo Horizonte',
      canonicalCity: 'Belo Horizonte',
      searchKey: 'cliente-a',
    },
  })

  await repository.createCase({
    tenantId: args.tenantId,
    entityId: args.officeId,
    title: 'Caso despachado',
    status: 'dispatched',
    priority: 'urgent',
    practiceArea: 'Direito Civil',
    leadProfessionalId: 'prof-2',
    openedAt: '2026-07-01T10:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente B',
      canonicalName: 'cliente-b',
      displayWhatsapp: '31999990002',
      canonicalWhatsapp: '5531999990002',
      displayCity: 'Contagem',
      canonicalCity: 'Contagem',
      searchKey: 'cliente-b',
    },
  })

  await repository.createCase({
    tenantId: args.tenantId,
    entityId: args.officeId,
    title: 'Caso encerrado',
    status: 'closed',
    priority: 'high',
    practiceArea: 'Direito Tributario',
    leadProfessionalId: 'prof-1',
    openedAt: '2026-07-01T09:00:00.000Z',
    closedAt: '2026-07-02T09:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente C',
      canonicalName: 'cliente-c',
      displayEmail: 'cliente-c@example.com',
      canonicalEmail: 'cliente-c@example.com',
      displayCity: 'Betim',
      canonicalCity: 'Betim',
      searchKey: 'cliente-c',
    },
  })

  await repository.createCase({
    tenantId: args.tenantId,
    entityId: args.officeId,
    title: 'Caso arquivado',
    status: 'archived',
    priority: 'low',
    practiceArea: 'Direito do Consumidor',
    leadProfessionalId: 'prof-3',
    openedAt: '2026-07-01T07:00:00.000Z',
    closedAt: '2026-07-01T08:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente D',
      canonicalName: 'cliente-d',
      displayPhone: '31999990004',
      canonicalPhone: '5531999990004',
      displayCity: 'Sabara',
      canonicalCity: 'Sabara',
      searchKey: 'cliente-d',
    },
  })
}

test('GET /escritorios/:id/inteligencia-operacional requires authentication', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-unknown/inteligencia-operacional',
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/inteligencia-operacional returns 404 when office does not exist', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.operational@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-missing/inteligencia-operacional',
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 404)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/inteligencia-operacional returns 403 when office is not owned', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.owned@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })
    const other = await registerOwner(harness.app, {
      name: 'Bruno Lima',
      email: 'bruno.lima.foreign@example.com',
      tenantName: 'Bruno Lima Consultoria',
    })

    const office = await createOffice(harness.app, owner.accessToken, 'Rocha & Lima Legal')
    const response = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${office.officeId}/inteligencia-operacional`,
      headers: authHeaders(other.accessToken),
    })

    assert.equal(response.statusCode, 403)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/inteligencia-operacional returns deterministic operational intelligence and excludes archived cases', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.happy@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })
    const office = await createOffice(harness.app, owner.accessToken, 'Rocha & Lima Legal')
    const entity = await harness.app.backendContext.entityRepository.getEntityById<{ ownerTenantId?: number }>(office.officeId)
    assert.equal(typeof entity?.ownerTenantId, 'number')

    await createCaseFixtures({
      db: harness.app.backendContext.connection,
      tenantId: entity?.ownerTenantId as number,
      officeId: office.officeId,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${office.officeId}/inteligencia-operacional`,
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as {
      status: string
      officeId: string
      tenantId: number
      generatedAt: string
      snapshot: {
        openCases: number
        closedCases: number
        backlog: number
        activeProfessionals: number
        casesPerProfessional: Record<string, number>
        casesPerPracticeArea: Record<string, number>
        casesPerCity: Record<string, number>
      }
      signals: unknown[]
      timeline: unknown[]
      regional: unknown[]
      specialties: unknown[]
      workload: Array<{
        professionalId: string
        activeCases: number
        workloadLevel: string
      }>
      opportunities: unknown[]
      compatibility: {
        firstResponseMinutesDerived: boolean
        slaStatusDerived: boolean
        archivedCasesExcluded: boolean
      }
    }

    assert.equal(body.status, 'ready')
    assert.equal(body.officeId, office.officeId)
    assert.equal(body.tenantId, entity?.ownerTenantId)
    assert.equal(typeof body.generatedAt, 'string')
    assert.equal(Array.isArray(body.signals), true)
    assert.equal(Array.isArray(body.timeline), true)
    assert.equal(body.signals.length, 0)
    assert.equal(body.timeline.length, 0)
    assert.equal(Array.isArray(body.regional), true)
    assert.equal(Array.isArray(body.specialties), true)
    assert.equal(Array.isArray(body.workload), true)
    assert.equal(Array.isArray(body.opportunities), true)

    assert.equal(body.snapshot.openCases, 2)
    assert.equal(body.snapshot.closedCases, 1)
    assert.equal(body.snapshot.backlog, 2)
    assert.equal(body.snapshot.activeProfessionals, 2)
    assert.deepEqual(body.snapshot.casesPerProfessional, {
      'prof-1': 1,
      'prof-2': 1,
    })
    assert.deepEqual(body.snapshot.casesPerPracticeArea, {
      'Direito Civil': 1,
      'Direito Trabalhista': 1,
    })
    assert.deepEqual(body.snapshot.casesPerCity, {
      'Belo Horizonte': 1,
      Contagem: 1,
    })

    assert.equal(body.compatibility.firstResponseMinutesDerived, false)
    assert.equal(body.compatibility.slaStatusDerived, false)
    assert.equal(body.compatibility.archivedCasesExcluded, true)

    const workloadIds = body.workload.map((entry) => entry.professionalId).sort()
    assert.deepEqual(workloadIds, ['prof-1', 'prof-2'])
    assert.ok(body.workload.some((entry) => entry.professionalId === 'prof-2' && entry.activeCases === 1))

    const responseText = response.body
    assert.equal(responseText.includes('Cliente A'), false)
    assert.equal(responseText.includes('Cliente B'), false)
    assert.equal(responseText.includes('cliente-a@example.com'), false)
    assert.equal(responseText.includes('5531999990001'), false)
    assert.equal(responseText.includes('Sabara'), false)

    const shapeKeys = Object.keys(body).sort()
    assert.deepEqual(shapeKeys, [
      'compatibility',
      'generatedAt',
      'officeId',
      'opportunities',
      'regional',
      'signals',
      'snapshot',
      'specialties',
      'status',
      'tenantId',
      'timeline',
      'workload',
    ])
  } finally {
    await harness.close()
  }
})
