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
  workspace: string
  close(): Promise<void>
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-office-create-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-office-create-kid'
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
  process.env.JWT_SECRET = 'legal-beta-office-create-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-office-create.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-office-create'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-office-create'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildLegalBetaServer() as AppWithContext

  return {
    app,
    workspace,
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
  const body = response.json() as { accessToken: string }
  assert.ok(body.accessToken)
  return body.accessToken
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  }
}

test('legal beta office creation uses authority boundary and lists the created office', { concurrency: false }, async () => {
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
    const createBody = createResponse.json() as {
      status: string
      officeId: string
      officeName: string
    }
    assert.equal(createBody.status, 'ready')
    assert.equal(createBody.officeName, 'Rocha & Lima Legal')

    const storedOffice = await harness.app.backendContext.entityRepository.getEntityById(createBody.officeId)
    assert.ok(storedOffice)
    assert.equal(storedOffice?.ownerUserId !== undefined, true)
    assert.equal(storedOffice?.ownerTenantId !== undefined, true)
    assert.equal(storedOffice?.ownerId?.startsWith('user:'), true)

    const metadata = (storedOffice?.entityProfile as { metadata?: { businessConfig?: { businessType?: string; officeName?: string } } })?.metadata
    assert.equal(metadata?.businessConfig?.businessType, 'legal')
    assert.equal(metadata?.businessConfig?.officeName, 'Rocha & Lima Legal')

    const listResponse = await harness.app.inject({
      method: 'GET',
      url: '/me/escritorios',
      headers: authHeaders(accessToken),
    })

    assert.equal(listResponse.statusCode, 200)
    const listBody = listResponse.json() as {
      status: string
      offices: Array<{ officeId: string; officeName: string }>
    }
    assert.equal(listBody.status, 'ready')
    assert.equal(listBody.offices.some((office) => office.officeId === createBody.officeId), true)
    assert.equal(listBody.offices.some((office) => office.officeName === 'Rocha & Lima Legal'), true)

    const secondCreateResponse = await harness.app.inject({
      method: 'POST',
      url: '/escritorios/criar',
      headers: authHeaders(accessToken),
      payload: {
        name: 'Ferreira Rocha Advocacia',
      },
    })

    assert.equal(secondCreateResponse.statusCode, 201)
    const secondCreateBody = secondCreateResponse.json() as {
      officeId: string
    }

    await harness.app.backendContext.connection.run(
      `
        INSERT INTO seo_landing_pages (
          id, campaign_id, tenant_id, entity_id, slug, city, specialty,
          title, meta_desc, content_html, published, leads_received,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      `,
      'seo-landing-bh-previdenciario',
      'campaign-bh-previdenciario',
      String(storedOffice?.ownerTenantId ?? 0),
      createBody.officeId,
      '/p/belo-horizonte/advogado-previdenciario',
      'Belo Horizonte',
      'advogado-previdenciario',
      'Advogado Previdenciário em Belo Horizonte | Atendimento Online e Presencial',
      'Precisa de advogado previdenciário em Belo Horizonte? Faça uma triagem segura e receba orientação inicial.',
      '<h1>Landing SEO</h1>',
      '2026-06-24T12:00:00.000Z',
      '2026-06-24T12:00:00.000Z',
    )

    const sitemapResponse = await harness.app.inject({
      method: 'GET',
      url: '/sitemap.xml',
      headers: {
        host: 'brandsoul-legal-platform.onrender.com',
        'x-forwarded-proto': 'https',
      },
    })

    assert.equal(sitemapResponse.statusCode, 200)
    assert.match(String(sitemapResponse.headers['content-type'] ?? ''), /^application\/xml\b/)

    const sitemapXml = sitemapResponse.body
    assert.match(sitemapXml, /^\<\?xml version="1\.0" encoding="UTF-8"\?\>/)
    assert.match(sitemapXml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.match(sitemapXml, /<loc>https:\/\/brandsoul-legal-platform\.onrender\.com\/<\/loc>/)
    assert.match(
      sitemapXml,
      /<loc>https:\/\/brandsoul-legal-platform\.onrender\.com\/p\/belo-horizonte\/advogado-previdenciario<\/loc>/,
    )
    assert.match(
      sitemapXml,
      new RegExp(`<loc>https://brandsoul-legal-platform\\.onrender\\.com/escritorios/${createBody.officeId}</loc>`),
    )
    assert.match(
      sitemapXml,
      new RegExp(`<loc>https://brandsoul-legal-platform\\.onrender\\.com/escritorios/${secondCreateBody.officeId}</loc>`),
    )

    const uniqueLocations = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1])
    assert.equal(uniqueLocations.length, new Set(uniqueLocations).size)

    const robotsResponse = await harness.app.inject({
      method: 'GET',
      url: '/robots.txt',
    })
    assert.equal(robotsResponse.statusCode, 200)
    assert.match(String(robotsResponse.headers['content-type'] ?? ''), /^text\/plain\b/)
    assert.match(robotsResponse.body, /^User-agent: \*$/m)
    assert.match(robotsResponse.body, /^Allow: \/$/m)
    assert.match(robotsResponse.body, /^Sitemap:/m)
    assert.match(
      robotsResponse.body,
      /^Sitemap: https:\/\/brandsoul-legal-platform\.onrender\.com\/sitemap\.xml$/m,
    )
  } finally {
    await harness.close()
  }
})
