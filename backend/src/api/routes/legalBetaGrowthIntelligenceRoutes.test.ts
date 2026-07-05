import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import {
  GROWTH_DASHBOARD_REQUESTS_TOTAL,
} from '../../modules/legalGrowth/GrowthMetrics.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import type { ObservabilityService } from '../../services/observabilityService.js'
import { buildLegalBetaServer } from '../../server.legal-beta.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    observability: ObservabilityService
  }
}

type Harness = {
  app: AppWithContext
  close(): Promise<void>
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-growth-intelligence-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-growth-intelligence-kid'
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
  process.env.JWT_SECRET = 'legal-beta-growth-intelligence-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-growth-intelligence.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-growth-intelligence'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-growth-intelligence'
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
    source: 'public_triage',
    practiceArea: 'Direito Trabalhista',
    leadProfessionalId: 'prof-1',
    openedAt: '2026-07-01T08:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente Sigiloso A',
      canonicalName: 'cliente-sigiloso-a',
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
    source: 'referral',
    practiceArea: 'Direito Civil',
    leadProfessionalId: 'prof-2',
    openedAt: '2026-07-01T10:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente Sigiloso B',
      canonicalName: 'cliente-sigiloso-b',
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
    source: 'public_triage',
    practiceArea: 'Direito Tributario',
    leadProfessionalId: 'prof-1',
    openedAt: '2026-07-01T09:00:00.000Z',
    closedAt: '2026-07-02T09:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente Sigiloso C',
      canonicalName: 'cliente-sigiloso-c',
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
    source: 'public_triage',
    practiceArea: 'Direito do Consumidor',
    leadProfessionalId: 'prof-3',
    openedAt: '2026-07-01T07:00:00.000Z',
    closedAt: '2026-07-01T08:00:00.000Z',
    contactIdentity: {
      displayName: 'Cliente Sigiloso D',
      canonicalName: 'cliente-sigiloso-d',
      displayPhone: '31999990004',
      canonicalPhone: '5531999990004',
      displayCity: 'Sabara',
      canonicalCity: 'Sabara',
      searchKey: 'cliente-d',
    },
  })
}

test('GET /escritorios/:id/growth-intelligence requires authentication', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-unknown/growth-intelligence',
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/growth-intelligence returns 404 when office does not exist', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.growth@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/escritorios/office-missing/growth-intelligence',
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 404)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/growth-intelligence returns 403 when office is not owned', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const owner = await registerOwner(harness.app, {
      name: 'Owner Growth',
      email: 'owner.growth@example.com',
      tenantName: 'Owner Growth Office',
    })
    const outsider = await registerOwner(harness.app, {
      name: 'Outsider Growth',
      email: 'outsider.growth@example.com',
      tenantName: 'Outsider Growth Office',
    })
    const created = await createOffice(harness.app, owner.accessToken, 'Growth Office')

    const response = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${created.officeId}/growth-intelligence`,
      headers: authHeaders(outsider.accessToken),
    })

    assert.equal(response.statusCode, 403)
  } finally {
    await harness.close()
  }
})

test('GET /escritorios/:id/growth-intelligence returns deterministic growth snapshot without leaking PII and increments metrics', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const owner = await registerOwner(harness.app, {
      name: 'Marina Lima',
      email: 'marina.lima.growth@example.com',
      tenantName: 'Marina Lima Advocacia',
    })
    const created = await createOffice(harness.app, owner.accessToken, 'Growth Intelligence Office')
    const officeRecord = await harness.app.backendContext.entityRepository.getEntityById(created.officeId)
    assert.ok(officeRecord)
    const tenantId = officeRecord.ownerTenantId ?? 0
    assert.ok(tenantId > 0)

    const tables = await harness.app.backendContext.connection.all(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
)
console.log("TABLES", tables)

const casesInfo = await harness.app.backendContext.connection.all(
  "PRAGMA table_info(cases)",
)
console.log(
  "CASES_COLUMNS",
  casesInfo.map((row: any) => row.name),
  casesInfo.length,
)

try {
  await createCaseFixtures({
      db: harness.app.backendContext.connection,
      tenantId,
      officeId: created.officeId,
    })
} catch (error) {
  console.error('FIXTURE_ERROR', error)
  const casesInfo = await harness.app.backendContext.connection.all(
    "PRAGMA table_info(cases)",
  )
  console.error(
    'CASES_COLUMNS',
    casesInfo.map((row: any) => row.name),
    casesInfo.length,
  )
  throw error
}

    const response = await harness.app.inject({
      method: 'GET',
      url: `/escritorios/${created.officeId}/growth-intelligence`,
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json() as {
      status: string
      officeId: string
      tenantId: number
      generatedAt: string
      summary: {
        totalDemand: number
        totalTerritories: number
        totalCoverageGaps: number
        overloadedProfessionals: number
        constrainedProfessionals: number
        expansionOpportunities: number
        landingCandidates: number
        eligibleLandingCandidates: number
        recommendations: number
        criticalRecommendations: number
        averageGrowthScore: number | null
        highestPriority: 'low' | 'medium' | 'high' | 'critical' | null
        generatedAt: string
      }
      snapshot: {
        officeId: string
        tenantId: number
        demand: { items: Array<{ city: string; specialty: string; casesCount: number; backlogCount: number }> }
        territories: unknown[]
        coverage: unknown[]
        capacity: unknown[]
        scores: unknown[]
        recommendations: unknown[]
        opportunities: unknown[]
        landingCandidates: unknown[]
        metadata: { evidence: unknown[] }
      }
      compatibility: {
        professionalsIncluded: boolean
        entityProfileIncluded: boolean
        landingCandidatesPreparedOnly: boolean
      }
    }

    assert.equal(payload.status, 'ready')
    assert.equal(payload.officeId, created.officeId)
    assert.equal(payload.tenantId, tenantId)
    assert.equal(typeof payload.summary, 'object')
    assert.equal(payload.snapshot.officeId, created.officeId)
    assert.equal(payload.snapshot.tenantId, tenantId)
    assert.equal(typeof payload.generatedAt, 'string')
    assert.equal(payload.summary.generatedAt, payload.generatedAt)
    assert.equal(payload.summary.totalDemand >= 0, true)
    assert.equal(payload.summary.totalTerritories >= 0, true)
    assert.equal(payload.summary.recommendations, payload.snapshot.recommendations.length)
    assert.equal(payload.summary.expansionOpportunities, payload.snapshot.opportunities.length)
    assert.equal(payload.summary.landingCandidates, payload.snapshot.landingCandidates.length)
    assert.equal(Array.isArray(payload.snapshot.demand.items), true)
    assert.equal(Array.isArray(payload.snapshot.territories), true)
    assert.equal(Array.isArray(payload.snapshot.coverage), true)
    assert.equal(Array.isArray(payload.snapshot.capacity), true)
    assert.equal(Array.isArray(payload.snapshot.scores), true)
    assert.equal(Array.isArray(payload.snapshot.recommendations), true)
    assert.equal(Array.isArray(payload.snapshot.opportunities), true)
    assert.equal(Array.isArray(payload.snapshot.landingCandidates), true)
    assert.equal(Array.isArray(payload.snapshot.metadata.evidence), true)
    assert.equal(payload.compatibility.professionalsIncluded, true)
    assert.equal(payload.compatibility.entityProfileIncluded, true)
    assert.equal(payload.compatibility.landingCandidatesPreparedOnly, true)
    assert.equal(payload.snapshot.demand.items.some((item) => item.city === 'Sabara'), false)
    assert.equal(payload.snapshot.demand.items.some((item) => item.specialty === 'Direito do Consumidor'), false)
    assert.equal(payload.snapshot.demand.items.some((item) => item.specialty === 'Direito Civil'), true)

    const serialized = JSON.stringify(payload)
    assert.equal(serialized.includes('Cliente Sigiloso'), false)
    assert.equal(serialized.includes('cliente-a@example.com'), false)
    assert.equal(serialized.includes('31999990001'), false)
    assert.equal(serialized.includes('5531999990001'), false)
    assert.equal(serialized.includes('cliente-sigiloso-a'), false)

    const metrics = harness.app.backendContext.observability.getMetricsSnapshot()
    assert.equal(metrics.customCounters[GROWTH_DASHBOARD_REQUESTS_TOTAL], 1)
  } finally {
    await harness.close()
  }
})

test('growth dashboard route implementation does not import legacy growth or market signals modules', { concurrency: false }, async () => {
  const routeSource = await readFile(
    path.resolve('src/api/routes/legalBetaGrowthIntelligenceRoutes.ts'),
    'utf-8',
  )
  const serviceSource = await readFile(
    path.resolve('src/modules/legalGrowth/growthIntelligenceService.ts'),
    'utf-8',
  )

  assert.equal(routeSource.includes('modules/growth'), false)
  assert.equal(routeSource.includes('market-signals'), false)
  assert.equal(serviceSource.includes('modules/growth'), false)
  assert.equal(serviceSource.includes('market-signals'), false)
})
