import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'
import { createCaseRepository } from '../../modules/legalCases/caseRepository.js'
import type { ExecutiveDashboardApplicationService } from '../../modules/executive/index.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { buildLegalBetaServer } from '../../server.legal-beta.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    executiveDashboardApplicationService?: Pick<ExecutiveDashboardApplicationService, 'build'>
  }
}

type Harness = {
  app: AppWithContext
  close(): Promise<void>
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-executive-dashboard-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-executive-dashboard-kid'
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
  process.env.JWT_SECRET = 'legal-beta-executive-dashboard-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-executive-dashboard.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-executive-dashboard'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-executive-dashboard'
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
}

function createMockDashboard() {
  return {
    generatedAt: '2026-07-06T12:00:00.000Z',
    officeState: {
      officeId: 'office-1',
      tenantId: 11,
      growthStatus: 'ready',
      operationalStatus: 'ready',
    },
    morningBrief: {
      title: 'Seu escritorio esta saudavel hoje.',
      tone: 'positive',
      summary: 'Resumo.',
      topPriority: 'Expandir',
      items: [],
      generatedAt: '2026-07-06T12:00:00.000Z',
    },
    officeHealth: {
      score: 84,
      level: 'good',
      explanation: 'Saudavel.',
      positives: [],
      warnings: [],
      opportunities: [],
      drivers: [],
    },
    decisionCenter: {
      decisions: [],
    },
    executiveFeed: {
      items: [],
      totalDetected: 0,
      totalPublished: 0,
      generatedAt: '2026-07-06T12:00:00.000Z',
    },
    executiveTimeline: {
      items: [],
      totalDetected: 0,
      totalPublished: 0,
      generatedAt: '2026-07-06T12:00:00.000Z',
    },
    growth: {
      status: 'ready',
      officeId: 'office-1',
      tenantId: 11,
      generatedAt: '2026-07-06T12:00:00.000Z',
      summary: {
        totalDemand: 0,
        totalTerritories: 0,
        totalCoverageGaps: 0,
        overloadedProfessionals: 0,
        constrainedProfessionals: 0,
        expansionOpportunities: 0,
        landingCandidates: 0,
        eligibleLandingCandidates: 0,
        recommendations: 0,
        criticalRecommendations: 0,
        averageGrowthScore: null,
        highestPriority: null,
        generatedAt: '2026-07-06T12:00:00.000Z',
      },
      snapshot: {
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: 'all_time',
          startsAt: '1970-01-01T00:00:00.000Z',
          endsAt: '9999-12-31T23:59:59.999Z',
          granularity: 'custom',
        },
        generatedAt: '2026-07-06T12:00:00.000Z',
        demand: { items: [] },
        territories: [],
        coverage: [],
        capacity: [],
        scores: [],
        recommendations: [],
        opportunities: [],
        landingCandidates: [],
        metadata: {
          deterministic: true,
          foundationVersion: 'g7.0',
          evidence: [],
        },
      },
      compatibility: {
        professionalsIncluded: true,
        entityProfileIncluded: false,
        landingCandidatesPreparedOnly: true,
      },
    },
    operational: {
      status: 'ready',
      officeId: 'office-1',
      tenantId: 11,
      generatedAt: '2026-07-06T12:00:00.000Z',
      snapshot: {
        tenantId: 11,
        entityId: 'office-1',
        builtAt: '2026-07-06T12:00:00.000Z',
        openCases: 0,
        closedCases: 0,
        backlog: 0,
        activeProfessionals: 0,
        averageResolutionHours: null,
        averageFirstResponseMinutes: null,
        slaWarningCases: 0,
        slaBreachedCases: 0,
        casesPerProfessional: {},
        casesPerPracticeArea: {},
        casesPerCity: {},
      },
      signals: [],
      timeline: [],
      regional: [],
      specialties: [],
      workload: [],
      opportunities: [],
      compatibility: {
        firstResponseMinutesDerived: false,
        slaStatusDerived: false,
        waitingForDerived: false,
        archivedCasesExcluded: true,
      },
    },
  }
}

test('GET /admin/escritorios/:id/executive-dashboard requires authentication', { concurrency: false }, async () => {
  const harness = await createHarness()
  try {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/escritorios/office-unknown/executive-dashboard',
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await harness.close()
  }
})

test('GET /admin/escritorios/:id/executive-dashboard returns 404 when office does not exist', { concurrency: false }, async () => {
  const harness = await createHarness()
  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.executive@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/escritorios/office-missing/executive-dashboard',
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 404)
  } finally {
    await harness.close()
  }
})

test('GET /admin/escritorios/:id/executive-dashboard returns 403 when office is not owned', { concurrency: false }, async () => {
  const harness = await createHarness()
  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.executive.owner@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })
    const intruder = await registerOwner(harness.app, {
      name: 'Bruno Lima',
      email: 'bruno.lima.executive@example.com',
      tenantName: 'Bruno Lima Advocacia',
    })
    const office = await createOffice(harness.app, owner.accessToken, 'Rocha & Lima')

    const response = await harness.app.inject({
      method: 'GET',
      url: `/admin/escritorios/${office.officeId}/executive-dashboard`,
      headers: authHeaders(intruder.accessToken),
    })

    assert.equal(response.statusCode, 403)
  } finally {
    await harness.close()
  }
})

test('GET /admin/escritorios/:id/executive-dashboard calls the application service and ignores tenantId from client', { concurrency: false }, async () => {
  const harness = await createHarness()
  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.executive.call@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })
    const office = await createOffice(harness.app, owner.accessToken, 'Rocha & Lima')
    const dashboard = createMockDashboard()
    let callCount = 0

    harness.app.backendContext.executiveDashboardApplicationService = {
      async build(input) {
        callCount += 1
        assert.equal(input.officeId, office.officeId)
        assert.equal(input.tenantId, dashboard.officeState.tenantId)
        return {
          ...dashboard,
          officeState: {
            ...dashboard.officeState,
            officeId: office.officeId,
          },
          growth: {
            ...dashboard.growth,
            officeId: office.officeId,
          },
          operational: {
            ...dashboard.operational,
            officeId: office.officeId,
          },
        }
      },
    }

    const response = await harness.app.inject({
      method: 'GET',
      url: `/admin/escritorios/${office.officeId}/executive-dashboard?tenantId=999`,
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json() as ReturnType<typeof createMockDashboard>
    assert.equal(callCount, 1)
    assert.equal(payload.officeState.officeId, office.officeId)
    assert.notEqual(payload.officeState.tenantId, 999)
  } finally {
    await harness.close()
  }
})

test('GET /admin/escritorios/:id/executive-dashboard returns the full executive payload without leaking PII', { concurrency: false }, async () => {
  const harness = await createHarness()
  try {
    const owner = await registerOwner(harness.app, {
      name: 'Ana Rocha',
      email: 'ana.rocha.executive.full@example.com',
      tenantName: 'Ana Rocha Advocacia',
    })
    const office = await createOffice(harness.app, owner.accessToken, 'Rocha & Lima')
    await createCaseFixtures({
      db: harness.app.backendContext.connection,
      tenantId: 1,
      officeId: office.officeId,
    })

    const response = await harness.app.inject({
      method: 'GET',
      url: `/admin/escritorios/${office.officeId}/executive-dashboard`,
      headers: authHeaders(owner.accessToken),
    })

    assert.equal(response.statusCode, 200)
    const payload = response.json() as Record<string, unknown>

    assert.equal(typeof payload.generatedAt, 'string')
    assert.equal(typeof payload.officeState, 'object')
    assert.equal(typeof payload.officeHealth, 'object')
    assert.equal(typeof payload.decisionCenter, 'object')
    assert.equal(typeof payload.morningBrief, 'object')
    assert.equal(typeof payload.executiveFeed, 'object')
    assert.equal(typeof payload.executiveTimeline, 'object')
    assert.equal(typeof payload.growth, 'object')
    assert.equal(typeof payload.operational, 'object')

    const serialized = JSON.stringify(payload).toLowerCase()
    assert.equal(serialized.includes('cliente sigiloso'), false)
    assert.equal(serialized.includes('cliente-a@example.com'), false)
    assert.equal(serialized.includes('31999990001'), false)
    assert.equal(serialized.includes('5531999990001'), false)
  } finally {
    await harness.close()
  }
})
