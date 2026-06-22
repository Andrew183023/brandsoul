import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { JobWorker } from '../jobs/index.js'
import type { BackendDatabase } from '../db/index.js'
import type { EntityRepository } from '../repositories/entityRepository.js'
import { buildServer } from '../server.js'
import { runSeedMutation } from '../sovereignty/sovereignTestMutationHarness.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    entityRepository: EntityRepository
    jobWorker: JobWorker
  }
}

type Harness = {
  app: AppWithContext
  privateKeyPem: string
  configuredKid: string
  close(): Promise<void>
}

async function createAccessToken(
  userId: number,
  tenantId: number,
  role: 'owner' | 'admin' | 'lawyer' | 'client',
  privateKeyPem: string,
  kid: string,
) {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(userId),
    tenant_id: String(tenantId),
    roles: [role],
    ver: 1,
    jti: `canonical-office-routes-${role}-${userId}-${tenantId}-${randomUUID()}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setIssuer('brandsoul-auth-canonical-office-routes')
    .setAudience('brandsoul-api-canonical-office-routes')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  }
}

function createEntityProfileFixture(id: string): EntityProfile {
  return {
    id,
    social: {
      publicName: 'Ana Rocha Advocacia',
    },
    metadata: {
      createdAt: '2026-06-03T10:00:00.000Z',
      notes: [],
      businessConfig: {
        businessType: 'legal',
        officeName: 'Ana Rocha Advocacia',
      },
    },
  } as unknown as EntityProfile
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-canonical-office-routes-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'canonical-office-routes-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    SQLITE_FILE: process.env.SQLITE_FILE,
    ASSET_STORAGE_DIR: process.env.ASSET_STORAGE_DIR,
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
    AUTH_ACTIVE_KID: process.env.AUTH_ACTIVE_KID,
    AUTH_PRIVATE_KEY_REF: process.env.AUTH_PRIVATE_KEY_REF,
    AUTH_PUBLIC_KEY_PATH: process.env.AUTH_PUBLIC_KEY_PATH,
  }

  process.env.JWT_SECRET = 'canonical-office-routes-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'canonical-office-routes.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-canonical-office-routes'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-canonical-office-routes'
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

async function seedOfficeRuntime(harness: Harness) {
  const db = harness.app.backendContext.connection
  const repository = harness.app.backendContext.entityRepository
  const now = '2026-06-03T10:00:00.000Z'

  await runSeedMutation(async () => {
    await repository.createEntity({
      id: 'office-real-1',
      ownerId: 'user:100:tenant:11',
      ownerUserId: 100,
      ownerTenantId: 11,
      entityProfile: createEntityProfileFixture('office-real-1'),
    })
  }, 'backend/src/api/canonicalOfficeRoutes.test.ts#seedOfficeRuntime')

  await db.run(
    `
      INSERT INTO flow_auth_user (
        id, legacy_source, legacy_id, name, email, password_hash, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    100,
    'test',
    100,
    'Ana Rocha',
    'owner@brandsoul.local',
    'not-used-in-tests',
    1,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO flow_auth_tenant (
        id, legacy_source, legacy_id, name, slug, business_model, plan, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    11,
    'test',
    11,
    'BrandSoul Legal Dev',
    'brandsoul-legal-dev',
    'hybrid',
    'starter',
    1,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO flow_auth_membership (
        id, legacy_source, legacy_id, user_id, tenant_id, role, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    1100,
    'test',
    1100,
    100,
    11,
    'owner',
    1,
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO professionals (
        id, tenant_id, user_id, external_ref, kind, status, display_name, primary_email, primary_phone, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'prof-owner-1',
    11,
    100,
    null,
    'human',
    'active',
    'Dra. Ana Rocha',
    'owner@brandsoul.local',
    null,
    JSON.stringify({ officeId: 'office-real-1' }),
    now,
    now,
  )

  await db.run(
    `
      INSERT INTO professional_profiles (
        id, tenant_id, professional_id, headline, bio, specialties, credentials, languages, availability, settings, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    'profile-owner-1',
    11,
    'prof-owner-1',
    'Advogada trabalhista',
    'Especialista em relacoes de trabalho.',
    JSON.stringify(['Direito Trabalhista']),
    JSON.stringify([]),
    JSON.stringify(['pt-BR']),
    JSON.stringify({ available: true }),
    JSON.stringify({}),
    JSON.stringify({ oabCredential: 'OAB/SP 123456', isResponsible: true, isPublic: true }),
    now,
    now,
  )
}

test('public triage, portal projection and lifecycle transitions stay canonical', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await seedOfficeRuntime(harness)
    const ownerToken = await createAccessToken(100, 11, 'owner', harness.privateKeyPem, harness.configuredKid)

    const triageResponse = await harness.app.inject({
      method: 'POST',
      url: '/public/escritorios/office-real-1/triagem',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        requestId: 'triage-a',
        userMessage: 'Preciso de ajuda com verbas rescisorias.',
        businessContext: {
          businessType: 'legal',
          officeName: 'Ana Rocha Advocacia',
        },
        triage: {
          context: 'Fui desligado sem pagamento correto.',
          urgency: 'planned',
          objective: 'Entender meus direitos.',
          contactPreference: 'WhatsApp',
          contactValue: '11999990000',
          city: 'Sao Paulo',
          practiceArea: 'Direito Trabalhista',
        },
      },
    })

    assert.equal(triageResponse.statusCode, 201)
    const triageBody = triageResponse.json() as {
      requestId: string
      leadId: string
      intakeId: string
      caseId: string
      portalUrl: string
      actionResult: {
        caseId: string
        case: {
          id: string
          status: string
        }
        portalUrl: string
        portalAccess: { issuedAt: string; expiresAt: string }
      }
    }
    assert.equal(triageBody.requestId, 'triage-a')
    assert.ok(triageBody.leadId)
    assert.ok(triageBody.intakeId)
    assert.equal(triageBody.caseId, triageBody.actionResult.caseId)
    assert.equal(triageBody.portalUrl, triageBody.actionResult.portalUrl)
    assert.ok(triageBody.actionResult.caseId)
    assert.equal(triageBody.actionResult.case.id, triageBody.actionResult.caseId)
    assert.equal(triageBody.actionResult.case.status, 'open')
    assert.match(triageBody.actionResult.portalUrl, new RegExp(`^/portal/${triageBody.actionResult.caseId}/`))
    assert.ok(triageBody.actionResult.portalAccess.issuedAt)
    assert.ok(triageBody.actionResult.portalAccess.expiresAt)
    const portalPath = triageBody.actionResult.portalUrl.replace(/^\/portal\//, '/client/portal/')

    const createdCase = await harness.app.backendContext.connection.get<{ status: string }>(
      `SELECT status FROM cases WHERE id = ?`,
      triageBody.actionResult.caseId,
    )
    assert.equal(createdCase?.status, 'open')

    const linkedCase = await harness.app.backendContext.connection.get<{
      leadId?: string
      intakeId?: string
    }>(
      `
        SELECT
          json_extract(metadata, '$.leadId') AS leadId,
          json_extract(metadata, '$.intakeId') AS intakeId
        FROM cases
        WHERE id = ?
      `,
      triageBody.actionResult.caseId,
    )
    assert.equal(linkedCase?.leadId, triageBody.leadId)
    assert.equal(linkedCase?.intakeId, triageBody.intakeId)

    const leadCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM entity_portfolio_lead WHERE lead_id = ? AND entity_id = ?`,
      triageBody.leadId,
      'office-real-1',
    )
    const intakeCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM entity_portfolio_lead_intake WHERE intake_id = ? AND lead_id = ?`,
      triageBody.intakeId,
      triageBody.leadId,
    )
    assert.equal(Number(leadCount?.total ?? 0), 1)
    assert.equal(Number(intakeCount?.total ?? 0), 1)

    const assignmentCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM case_assignments WHERE case_id = ?`,
      triageBody.actionResult.caseId,
    )
    const dispatchCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM case_dispatches WHERE case_id = ?`,
      triageBody.actionResult.caseId,
    )
    assert.equal(Number(assignmentCount?.total ?? 0), 0)
    assert.equal(Number(dispatchCount?.total ?? 0), 0)

    const portalResponse = await harness.app.inject({
      method: 'GET',
      url: portalPath,
    })
    assert.equal(portalResponse.statusCode, 200)
    const portalBody = portalResponse.json() as {
      case: {
        status: string
        timeline: Array<{ label: string }>
      }
    }
    assert.equal(portalBody.case.status, 'open')
    assert.deepEqual(portalBody.case.timeline.map((event) => event.label), ['Triagem recebida'])

    const wrongPortalTokenResponse = await harness.app.inject({
      method: 'GET',
      url: `/client/portal/${triageBody.actionResult.caseId}/wrong-token`,
    })
    assert.ok([403, 404].includes(wrongPortalTokenResponse.statusCode))

    const replayResponse = await harness.app.inject({
      method: 'POST',
      url: '/public/escritorios/office-real-1/triagem',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        requestId: 'triage-a',
        userMessage: 'Preciso de ajuda com verbas rescisorias.',
        businessContext: {
          businessType: 'legal',
          officeName: 'Ana Rocha Advocacia',
        },
        triage: {
          context: 'Fui desligado sem pagamento correto.',
          urgency: 'planned',
          objective: 'Entender meus direitos.',
          contactPreference: 'WhatsApp',
          contactValue: '11999990000',
          city: 'Sao Paulo',
          practiceArea: 'Direito Trabalhista',
        },
      },
    })
    assert.equal(replayResponse.statusCode, 201)
    const replayBody = replayResponse.json() as {
      leadId: string
      intakeId: string
      caseId: string
      portalUrl: string
    }
    assert.equal(replayBody.leadId, triageBody.leadId)
    assert.equal(replayBody.intakeId, triageBody.intakeId)
    assert.equal(replayBody.caseId, triageBody.caseId)
    assert.match(replayBody.portalUrl, new RegExp(`^/portal/${triageBody.caseId}/`))

    const replayLeadCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM entity_portfolio_lead WHERE lead_id = ?`,
      triageBody.leadId,
    )
    const replayIntakeCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM entity_portfolio_lead_intake WHERE intake_id = ?`,
      triageBody.intakeId,
    )
    const replayCaseCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM cases
        WHERE tenant_id = ?
          AND entity_id = ?
          AND json_extract(metadata, '$.publicTriage.requestId') = ?
      `,
      11,
      'office-real-1',
      'triage-a',
    )
    assert.equal(Number(replayLeadCount?.total ?? 0), 1)
    assert.equal(Number(replayIntakeCount?.total ?? 0), 1)
    assert.equal(Number(replayCaseCount?.total ?? 0), 1)

    const sovereignAttestationCount = await harness.app.backendContext.connection.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM flowmind_sovereign_mutation_attestation
        WHERE mutation_type = 'portfolio.public-triage.capture'
          AND mutation_id = ?
      `,
      'public-triage-command:office-real-1:triage-a',
    )
    assert.equal(Number(sovereignAttestationCount?.total ?? 0) >= 1, true)

    const assignResponse = await harness.app.inject({
      method: 'POST',
      url: `/cases/${triageBody.actionResult.caseId}/assign`,
      headers: authHeaders(ownerToken),
      payload: {},
    })
    assert.equal(assignResponse.statusCode, 200)
    const assignedBody = assignResponse.json() as { case: { status: string; isAssigned: boolean; assignedProfessionalId?: string } }
    assert.equal(assignedBody.case.status, 'dispatched')
    assert.equal(assignedBody.case.isAssigned, true)
    assert.equal(assignedBody.case.assignedProfessionalId, 'prof-owner-1')

    const inProgressResponse = await harness.app.inject({
      method: 'POST',
      url: `/cases/${triageBody.actionResult.caseId}/status`,
      headers: authHeaders(ownerToken),
      payload: {
        status: 'in_progress',
      },
    })
    assert.equal(inProgressResponse.statusCode, 200)

    const onHoldResponse = await harness.app.inject({
      method: 'POST',
      url: `/cases/${triageBody.actionResult.caseId}/status`,
      headers: authHeaders(ownerToken),
      payload: {
        status: 'on_hold',
      },
    })
    assert.equal(onHoldResponse.statusCode, 200)

    const pausedPortalResponse = await harness.app.inject({
      method: 'GET',
      url: portalPath,
    })
    assert.equal(pausedPortalResponse.statusCode, 200)
    const pausedPortalBody = pausedPortalResponse.json() as {
      case: {
        status: string
        timeline: Array<{ label: string }>
      }
    }
    assert.equal(pausedPortalBody.case.status, 'on_hold')
    assert.ok(pausedPortalBody.case.timeline.some((event) => event.label === 'Atendimento pausado'))

    const closeResponse = await harness.app.inject({
      method: 'POST',
      url: `/cases/${triageBody.actionResult.caseId}/close`,
      headers: authHeaders(ownerToken),
      payload: {
        rating: 5,
        feedback: 'Resolvido.',
        closedBy: 'Ana',
      },
    })
    assert.equal(closeResponse.statusCode, 200)

    const duplicateCloseResponse = await harness.app.inject({
      method: 'POST',
      url: `/cases/${triageBody.actionResult.caseId}/close`,
      headers: authHeaders(ownerToken),
      payload: {
        rating: 5,
        feedback: 'Resolvido.',
        closedBy: 'Ana',
      },
    })
    assert.equal(duplicateCloseResponse.statusCode, 409)
  } finally {
    await harness.close()
  }
})
