import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from './db/index.js'
import type { ExecutiveMemoryRuntime } from './modules/executive/index.js'
import { ExecutiveMemoryCaptureTriggerService } from './modules/executive/index.js'
import { buildLegalBetaServer } from './server.legal-beta.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    executiveMemoryRuntime: ExecutiveMemoryRuntime
  }
}

type Harness = {
  app: AppWithContext
  close(): Promise<void>
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-executive-memory-runtime-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-executive-memory-runtime-kid'
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
  process.env.JWT_SECRET = 'legal-beta-executive-memory-runtime-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-executive-memory-runtime.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-executive-memory-runtime'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-executive-memory-runtime'
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

function readCount(row: unknown): number {
  if (!row || typeof row !== 'object') {
    return 0
  }

  const count = Reflect.get(row, 'count')
  if (typeof count === 'number') {
    return count
  }

  if (typeof count === 'string') {
    const parsed = Number(count)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

async function readTableCount(db: BackendDatabase, tableName: string) {
  const row = await db.get(`SELECT COUNT(*) AS count FROM ${tableName}`)
  return readCount(row)
}

test('buildLegalBetaServer composes executive memory runtime once per app without bootstrap side effects', { concurrency: false }, async () => {
  let triggerRunCalls = 0
  const originalRun = ExecutiveMemoryCaptureTriggerService.prototype.run
  ExecutiveMemoryCaptureTriggerService.prototype.run = async function patchedRun(...args) {
    triggerRunCalls += 1
    return originalRun.apply(this, args)
  }

  const harness = await createHarness()

  try {
    const { app } = harness
    const runtime = app.backendContext.executiveMemoryRuntime

    assert.ok(runtime)
    assert.ok(runtime.officeDiscoveryService)
    assert.ok(runtime.atomicCaptureService)
    assert.ok(runtime.orchestrator)
    assert.ok(runtime.triggerService)
    assert.ok(runtime.metrics)
    assert.equal(app.backendContext.executiveMemoryRuntime, runtime)
    assert.equal(triggerRunCalls, 0)
    assert.equal(await readTableCount(app.backendContext.connection, 'executive_memory_snapshots'), 0)
    assert.equal(await readTableCount(app.backendContext.connection, 'executive_memory_observations'), 0)

    const routes = app.printRoutes()
    assert.equal(routes.includes('executive-memory'), false)
  } finally {
    ExecutiveMemoryCaptureTriggerService.prototype.run = originalRun
    await harness.close()
  }
})

test('buildLegalBetaServer creates a distinct executive memory runtime per app instance', { concurrency: false }, async () => {
  const firstHarness = await createHarness()
  const secondHarness = await createHarness()

  try {
    assert.notEqual(
      firstHarness.app.backendContext.executiveMemoryRuntime,
      secondHarness.app.backendContext.executiveMemoryRuntime,
    )
  } finally {
    await secondHarness.close()
    await firstHarness.close()
  }
})

test('server.legal-beta runtime wiring stays side-effect free and non-operational', { concurrency: false }, async () => {
  const source = await readFile(new URL('./server.legal-beta.ts', import.meta.url), 'utf-8')

  assert.equal(source.includes('createExecutiveMemoryRuntime'), true)
  assert.equal(source.includes('executiveMemoryRuntime'), true)
  assert.equal(source.includes('triggerService.run('), false)
  assert.equal(source.includes('captureDiscoveredBatch('), false)
  assert.equal(source.includes('captureOffice('), false)
  assert.equal(source.includes('setInterval('), false)
  assert.equal(source.includes('setTimeout('), false)
  assert.equal(source.includes('randomUUID'), false)
  assert.equal(source.includes('Math.random'), false)
  assert.equal(source.includes('cron'), false)
  assert.equal(source.includes('scheduler'), false)
})
