import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import { buildLegalBetaServer } from '../server.legal-beta.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
  }
}

type Harness = {
  app: AppWithContext
  close(): Promise<void>
}

async function createHarness(): Promise<Harness> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-legal-beta-replay-quarantine-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'legal-beta-replay-quarantine-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    RENDER_DEPLOY_MODE: process.env.RENDER_DEPLOY_MODE,
    JWT_SECRET: process.env.JWT_SECRET,
    SQLITE_FILE: process.env.SQLITE_FILE,
    ASSET_STORAGE_DIR: process.env.ASSET_STORAGE_DIR,
    AUTH_ISSUER: process.env.AUTH_ISSUER,
    AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
    AUTH_ACTIVE_KID: process.env.AUTH_ACTIVE_KID,
    AUTH_PRIVATE_KEY_REF: process.env.AUTH_PRIVATE_KEY_REF,
    AUTH_PUBLIC_KEY_PATH: process.env.AUTH_PUBLIC_KEY_PATH,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    INTERNAL_ADMIN_TOKEN: process.env.INTERNAL_ADMIN_TOKEN,
  }

  process.env.NODE_ENV = 'test'
  process.env.RENDER_DEPLOY_MODE = 'ci-test'
  process.env.JWT_SECRET = 'legal-beta-replay-quarantine-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'legal-beta-replay-quarantine.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-legal-beta-replay-quarantine'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-legal-beta-replay-quarantine'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.CORS_ORIGIN = 'http://localhost:5174'
  process.env.INTERNAL_ADMIN_TOKEN = 'internal-replay-quarantine-token'

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

async function seedReplayRow(connection: BackendDatabase, replayFingerprint: string, payloadSnapshot: string) {
  const replayResultId = `replay-${randomUUID()}`
  const semanticIntentId = `auth-register:seed-${randomUUID()}`
  await connection.run(
    `
      INSERT INTO flowmind_semantic_replay_result (
        replay_result_id,
        replay_fingerprint,
        semantic_intent_id,
        mutation_lineage_hash,
        result_shape_hash,
        payload_snapshot,
        semantic_integrity,
        replay_result_state,
        lineage_hash,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    replayResultId,
    replayFingerprint,
    semanticIntentId,
    `lineage:${randomUUID()}`,
    'shape:seed',
    payloadSnapshot,
    'partial',
    'fallback-safe',
    `continuity:${randomUUID()}`,
    new Date().toISOString(),
  )

  return {
    replayResultId,
    semanticIntentId,
  }
}

test('replay quarantine action rejects requests without internal token', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/internal/admin/replay/quarantine',
      payload: {
        replayFingerprint: 'fingerprint-unauthorized',
        reason: 'test unauthorized access',
      },
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await harness.close()
  }
})

test('replay quarantine action marks replay invalid without deleting payload snapshot', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const replayFingerprint = 'fingerprint-quarantine-test'
    const payloadSnapshot = '{"user":{"id":1},"tenant":{"id":2},"membership":{"role":"owner"}}'
    const seeded = await seedReplayRow(harness.app.backendContext.connection, replayFingerprint, payloadSnapshot)

    const response = await harness.app.inject({
      method: 'POST',
      url: '/internal/admin/replay/quarantine',
      headers: {
        'x-internal-admin-token': 'internal-replay-quarantine-token',
        'content-type': 'application/json',
      },
      payload: {
        replayFingerprint,
        reason: 'quarantine corrupted staging replay',
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as {
      matchedRows: number
      quarantinedRows: number
      replayFingerprints: string[]
      affectedIntentIds: string[]
    }
    assert.equal(body.matchedRows, 1)
    assert.equal(body.quarantinedRows, 1)
    assert.deepEqual(body.replayFingerprints, [replayFingerprint])
    assert.deepEqual(body.affectedIntentIds, [seeded.semanticIntentId])

    const rows = await harness.app.backendContext.connection.all<Array<{
      replay_result_id: string
      payload_snapshot: string
      semantic_integrity: string
      replay_result_state: string
    }>>(
      `
        SELECT replay_result_id, payload_snapshot, semantic_integrity, replay_result_state
        FROM flowmind_semantic_replay_result
        WHERE replay_fingerprint = ?
        ORDER BY created_at ASC
      `,
      replayFingerprint,
    )

    assert.equal(rows.length, 2)
    assert.equal(rows[0]?.replay_result_id, seeded.replayResultId)
    assert.equal(rows[0]?.payload_snapshot, payloadSnapshot)
    assert.equal(rows[0]?.semantic_integrity, 'partial')
    assert.equal(rows[0]?.replay_result_state, 'fallback-safe')
    assert.equal(rows[1]?.payload_snapshot, payloadSnapshot)
    assert.equal(rows[1]?.semantic_integrity, 'invalid')
    assert.equal(rows[1]?.replay_result_state, 'invalid')
  } finally {
    await harness.close()
  }
})
