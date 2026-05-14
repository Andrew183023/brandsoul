import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { buildServer } from '../server.js'
import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import {
  createDistributedSovereigntyService,
  type SovereignNodeIdentity,
} from './distributedSovereigntyService.js'

async function createHarness() {
  const db = await createDatabaseConnection({ provider: 'sqlite', sqliteFile: ':memory:' })
  await initializeDatabase(db)

  let tick = 0
  const now = () => {
    const second = String(tick).padStart(2, '0')
    tick += 1
    return `2026-05-14T19:00:${second}.000Z`
  }

  const service = createDistributedSovereigntyService({
    db,
    now,
    consensusMode: 'single_writer',
    defaultNodeIdentity: {
      institutionalPlaneId: 'institutional-plane:test',
      lineagePlaneId: 'lineage-plane:test',
      replayPlaneId: 'replay-plane:test',
      authorityPlaneId: 'authority-plane:writer-a',
      persistencePlaneId: 'persistence-plane:writer-a',
    },
  })

  return {
    db,
    service,
    now,
    async close() {
      await db.close()
    },
  }
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-distributed-sovereignty-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'distributed-sovereignty-test-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    jwtSecret: process.env.JWT_SECRET,
    sqliteFile: process.env.SQLITE_FILE,
    assetStorageDir: process.env.ASSET_STORAGE_DIR,
    authIssuer: process.env.AUTH_ISSUER,
    authAudience: process.env.AUTH_AUDIENCE,
    authKid: process.env.AUTH_ACTIVE_KID,
    authPrivateKeyRef: process.env.AUTH_PRIVATE_KEY_REF,
    authPublicKeyPath: process.env.AUTH_PUBLIC_KEY_PATH,
    distributedNodeId: process.env.DISTRIBUTED_SOVEREIGN_NODE_ID,
  }

  process.env.JWT_SECRET = 'distributed-sovereignty-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'distributed-sovereignty.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-distributed-sovereignty'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-distributed-sovereignty'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile
  process.env.DISTRIBUTED_SOVEREIGN_NODE_ID = 'node:admin-status'

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as unknown as {
    backendContext: {
      jobWorker: { stop(): Promise<void> }
      auth: {
        authIdentityStoreRepository: {
          createUser(input: {
            name: string
            email: string
            passwordHash: string
            isActive?: boolean
          }): Promise<{ id: number } | null>
          createTenant(input: {
            name: string
            slug: string
            businessModel: 'product' | 'service' | 'hybrid' | 'professional'
            plan?: string
            isActive?: boolean
          }): Promise<{ id: number } | null>
          createMembership(input: {
            userId: number
            tenantId: number
            role: string
            isActive?: boolean
          }): Promise<{ id: number; role: string } | null>
        }
      }
    }
    close(): Promise<void>
    inject: (input: Record<string, unknown>) => Promise<{ statusCode: number, json(): any }>
  }
  await app.backendContext.jobWorker.stop()

  const fixtureModuleUrl = pathToFileURL(path.resolve(process.cwd(), 'test', 'hermeticAuthFixture.ts')).href
  const {
    createHermeticAdminUser,
    createHermeticAccessToken,
    seedTenantMembership,
  } = await import(fixtureModuleUrl) as {
    createHermeticAdminUser: (args: {
      authStore: {
        createUser(input: {
          name: string
          email: string
          passwordHash: string
          isActive?: boolean
        }): Promise<{ id: number } | null>
      }
      userName?: string
      userEmail?: string
    }) => Promise<{ id: number }>
    seedTenantMembership: (args: {
      authStore: {
        createTenant(input: {
          name: string
          slug: string
          businessModel: 'product' | 'service' | 'hybrid' | 'professional'
          plan?: string
          isActive?: boolean
        }): Promise<{ id: number } | null>
        createMembership(input: {
          userId: number
          tenantId: number
          role: string
          isActive?: boolean
        }): Promise<{ id: number; role: string } | null>
      }
      userId: number
      tenantName?: string
      tenantSlug?: string
      membershipRole?: string
    }) => Promise<{ tenant: { id: number }; membership: { role: string } }>
    createHermeticAccessToken: (args: {
      userId: number
      tenantId: number
      roles?: string[]
      privateKeyPem: string
      kid: string
      issuer?: string
      audience?: string
    }) => Promise<string>
  }

  const authUser = await createHermeticAdminUser({
    authStore: app.backendContext.auth.authIdentityStoreRepository,
    userName: 'Distributed Sovereignty Test Admin',
    userEmail: 'distributed-sovereignty-admin@brandsoul.local',
  })
  const authMembership = await seedTenantMembership({
    authStore: app.backendContext.auth.authIdentityStoreRepository,
    userId: authUser.id,
    tenantName: 'Distributed Sovereignty Tenant',
    tenantSlug: 'distributed-sovereignty-tenant',
    membershipRole: 'owner',
  })

  return {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    authFixture: {
      userId: authUser.id,
      tenantId: authMembership.tenant.id,
      role: authMembership.membership.role,
      createAccessToken: () => createHermeticAccessToken({
        userId: authUser.id,
        tenantId: authMembership.tenant.id,
        roles: [authMembership.membership.role],
        privateKeyPem: privateKey,
        kid: configuredKid,
        issuer: 'brandsoul-auth-distributed-sovereignty',
        audience: 'brandsoul-api-distributed-sovereignty',
      }),
    },
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousEnv.jwtSecret === 'undefined') delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousEnv.jwtSecret
      if (typeof previousEnv.sqliteFile === 'undefined') delete process.env.SQLITE_FILE
      else process.env.SQLITE_FILE = previousEnv.sqliteFile
      if (typeof previousEnv.assetStorageDir === 'undefined') delete process.env.ASSET_STORAGE_DIR
      else process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      if (typeof previousEnv.authIssuer === 'undefined') delete process.env.AUTH_ISSUER
      else process.env.AUTH_ISSUER = previousEnv.authIssuer
      if (typeof previousEnv.authAudience === 'undefined') delete process.env.AUTH_AUDIENCE
      else process.env.AUTH_AUDIENCE = previousEnv.authAudience
      if (typeof previousEnv.authKid === 'undefined') delete process.env.AUTH_ACTIVE_KID
      else process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      if (typeof previousEnv.authPrivateKeyRef === 'undefined') delete process.env.AUTH_PRIVATE_KEY_REF
      else process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      if (typeof previousEnv.authPublicKeyPath === 'undefined') delete process.env.AUTH_PUBLIC_KEY_PATH
      else process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
      if (typeof previousEnv.distributedNodeId === 'undefined') delete process.env.DISTRIBUTED_SOVEREIGN_NODE_ID
      else process.env.DISTRIBUTED_SOVEREIGN_NODE_ID = previousEnv.distributedNodeId
    },
  }
}

async function registerNode(service: ReturnType<typeof createDistributedSovereigntyService>, overrides: Partial<SovereignNodeIdentity> = {}) {
  return service.registerNode({
    nodeId: overrides.nodeId,
    nodeClass: overrides.nodeClass,
    institutionalPlaneId: overrides.institutionalPlaneId,
    lineagePlaneId: overrides.lineagePlaneId,
    replayPlaneId: overrides.replayPlaneId,
    authorityPlaneId: overrides.authorityPlaneId,
    persistencePlaneId: overrides.persistencePlaneId,
    nodeEpoch: overrides.nodeEpoch,
    registeredAt: overrides.registeredAt,
  })
}

test('sovereign node registration deterministic', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    const first = harness.service.buildSovereignNodeIdentity({
      nodeId: 'node:deterministic',
      registeredAt: '2026-05-14T19:00:00.000Z',
      nodeEpoch: 'epoch:1',
    })
    const second = harness.service.buildSovereignNodeIdentity({
      nodeId: 'node:deterministic',
      registeredAt: '2026-05-14T19:00:00.000Z',
      nodeEpoch: 'epoch:1',
    })

    assert.deepEqual(first, second)

    const registered = await harness.service.registerNode({
      nodeId: 'node:deterministic',
      registeredAt: '2026-05-14T19:00:00.000Z',
      nodeEpoch: 'epoch:1',
    })
    assert.equal(registered.startupAttestationHash, first.startupAttestationHash)
  } finally {
    await harness.close()
  }
})

test('distributed lineage ordering monotonic', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:lineage-a' })
    const first = await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:lineage-a',
      continuityEpoch: 'continuity:1',
      mutationLineageHash: 'mutation:a',
    })
    const second = await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:lineage-a',
      continuityEpoch: 'continuity:1',
      mutationLineageHash: 'mutation:b',
    })

    assert.equal(first.distributedSequence, 1)
    assert.equal(second.distributedSequence, 2)
  } finally {
    await harness.close()
  }
})

test('distributed attestation persisted correctly', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:attestation-a' })
    const lineage = await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:attestation-a',
      continuityEpoch: 'continuity:1',
      attestationLineageHash: 'attestation-lineage:a',
    })

    const attestation = await harness.service.persistDistributedAttestation({
      nodeId: 'node:attestation-a',
      attestationPlane: 'continuity',
      lineageHash: lineage.distributedClockHash,
      continuityEpoch: 'continuity:1',
    })

    assert.equal(attestation.nodeId, 'node:attestation-a')
    assert.equal(attestation.attestationPlane, 'continuity')
  } finally {
    await harness.close()
  }
})

test('quorum state classification stable', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, {
      nodeId: 'node:primary-a',
      authorityPlaneId: 'authority-plane:writer-a',
      persistencePlaneId: 'persistence-plane:writer-a',
      replayPlaneId: 'replay-plane:a',
    })
    await registerNode(harness.service, {
      nodeId: 'node:observer-b',
      nodeClass: 'observer',
      authorityPlaneId: 'authority-plane:writer-b',
      persistencePlaneId: 'persistence-plane:writer-b',
      replayPlaneId: 'replay-plane:b',
    })

    const status = await harness.service.getStatus()
    assert.equal(status.quorumState.quorumHealth, 'healthy')
    assert.equal(status.quorumState.quorumContinuityState, 'verified')
  } finally {
    await harness.close()
  }
})

test('replay federation metadata deterministic', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:replay-a', replayPlaneId: 'replay-plane:a' })
    await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:replay-a',
      continuityEpoch: 'continuity:replay',
      replayFingerprint: 'replay:fp',
      mutationLineageHash: 'mutation:replay-a',
    })

    const first = await harness.service.exportReplayLineage({
      nodeId: 'node:replay-a',
      continuityEpoch: 'continuity:replay',
      replayFingerprint: 'replay:fp',
      federationEventId: 'export:1',
      createdAt: '2026-05-14T19:02:00.000Z',
    })
    const second = await harness.service.exportReplayLineage({
      nodeId: 'node:replay-a',
      continuityEpoch: 'continuity:replay',
      replayFingerprint: 'replay:fp',
      federationEventId: 'export:2',
      createdAt: '2026-05-14T19:02:01.000Z',
    })

    assert.deepEqual(first.replayPlaneSynchronizationMetadata.lineageIntegrityHash, second.replayPlaneSynchronizationMetadata.lineageIntegrityHash)
  } finally {
    await harness.close()
  }
})

test('distributed clock ordering stable', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:clock-a' })
    const first = await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:clock-a',
      continuityEpoch: 'continuity:clock',
      mutationLineageHash: 'mutation:clock-a',
      createdAt: '2026-05-14T19:03:00.000Z',
    })
    const second = await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:clock-a',
      continuityEpoch: 'continuity:clock',
      mutationLineageHash: 'mutation:clock-b',
      createdAt: '2026-05-14T19:03:01.000Z',
    })

    assert.notEqual(first.distributedClockHash, second.distributedClockHash)
    assert.equal(first.distributedSequence < second.distributedSequence, true)
  } finally {
    await harness.close()
  }
})

test('split-brain risk detected', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:split-a', authorityPlaneId: 'authority-plane:shared' })
    await registerNode(harness.service, { nodeId: 'node:split-b', authorityPlaneId: 'authority-plane:shared' })

    const status = await harness.service.getStatus()
    assert.equal(status.splitBrainRiskState.duplicateAuthorityPlaneDetected, true)
    assert.equal(status.quorumState.quorumHealth, 'split_brain_risk')
  } finally {
    await harness.close()
  }
})

test('duplicate authority plane detected', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:duplicate-a', authorityPlaneId: 'authority-plane:duplicate' })
    await registerNode(harness.service, { nodeId: 'node:duplicate-b', authorityPlaneId: 'authority-plane:duplicate' })

    const violations = await harness.service.getInvariantViolations()
    assert.equal(violations.includes('duplicate authority plane detected'), true)
  } finally {
    await harness.close()
  }
})

test('distributed recovery metadata persisted', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:recovery-a' })
    await harness.service.recordDistributedRecoveryEpoch({
      recoveryEpochId: 'recovery-epoch:1',
      nodeId: 'node:recovery-a',
      recoveryEpoch: 'distributed-recovery:1',
      continuityEpoch: 'continuity:recovery',
      recoveryState: 'recovery_complete',
      federatedCoordinationState: 'metadata_only',
      replayRestorationMarker: 'verified',
      metadata: { source: 'test' },
    })

    const status = await harness.service.getStatus()
    assert.equal(status.distributedRecoveryState.totalRecoveryEpochs, 1)
    assert.equal(status.distributedRecoveryState.latestRecoveryEpoch, 'distributed-recovery:1')
  } finally {
    await harness.close()
  }
})

test('distributed lineage replay-safe', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:replay-safe-a' })
    const lineage = await harness.service.appendDistributedLineage({
      lineageId: 'lineage:replay-safe',
      originatingNodeId: 'node:replay-safe-a',
      continuityEpoch: 'continuity:replay-safe',
      replayFingerprint: 'replay:replay-safe',
      mutationLineageHash: 'mutation:replay-safe',
    })

    await harness.service.exportReplayLineage({
      nodeId: 'node:replay-safe-a',
      continuityEpoch: 'continuity:replay-safe',
      replayFingerprint: 'replay:replay-safe',
      federationEventId: 'export:replay-safe',
    })
    await harness.service.importReplayLineage({
      nodeId: 'node:replay-safe-a',
      sourceNodeId: 'node:replay-safe-a',
      continuityEpoch: 'continuity:replay-safe',
      replayFingerprint: 'replay:replay-safe',
      lineageIds: [lineage.lineageId],
      federationEventId: 'import:replay-safe',
    })

    const status = await harness.service.getStatus()
    assert.equal(status.replayFederationState.continuityVerified, true)
    assert.equal(status.distributedLineageIntegrity, 'verified')
  } finally {
    await harness.close()
  }
})

test('distributed continuity mismatch detected', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:mismatch-a' })
    await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:mismatch-a',
      continuityEpoch: 'continuity:mismatch-a',
      mutationLineageHash: 'mutation:mismatch-a',
    })
    await harness.service.persistDistributedAttestation({
      nodeId: 'node:mismatch-a',
      attestationPlane: 'continuity',
      lineageHash: 'lineage-hash:mismatch-a',
      continuityEpoch: 'continuity:mismatch-b',
    })

    const status = await harness.service.getStatus()
    assert.equal(status.splitBrainRiskState.continuityEpochMismatchDetected, true)
  } finally {
    await harness.close()
  }
})

test('distributed attestation lineage preserved', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:preserved-a' })
    const lineage = await harness.service.appendDistributedLineage({
      originatingNodeId: 'node:preserved-a',
      continuityEpoch: 'continuity:preserved',
      attestationLineageHash: 'attestation:preserved',
    })
    await harness.service.persistDistributedAttestation({
      nodeId: 'node:preserved-a',
      attestationPlane: 'semantic',
      lineageHash: lineage.distributedClockHash,
      continuityEpoch: 'continuity:preserved',
    })

    const status = await harness.service.getStatus()
    assert.equal(status.distributedContinuityState.attestationLineagePreserved, true)
  } finally {
    await harness.close()
  }
})

test('replay federation preserves continuity', { concurrency: false }, async () => {
  const harness = await createHarness()

  try {
    await registerNode(harness.service, { nodeId: 'node:federation-a', replayPlaneId: 'replay-plane:a' })
    await registerNode(harness.service, { nodeId: 'node:federation-b', replayPlaneId: 'replay-plane:b', authorityPlaneId: 'authority-plane:b', persistencePlaneId: 'persistence-plane:b' })
    const lineage = await harness.service.appendDistributedLineage({
      lineageId: 'lineage:federation-a',
      originatingNodeId: 'node:federation-a',
      continuityEpoch: 'continuity:federation',
      replayFingerprint: 'replay:federation',
      mutationLineageHash: 'mutation:federation-a',
    })

    await harness.service.exportReplayLineage({
      nodeId: 'node:federation-a',
      continuityEpoch: 'continuity:federation',
      replayFingerprint: 'replay:federation',
      federationEventId: 'export:federation',
    })
    const status = await harness.service.importReplayLineage({
      nodeId: 'node:federation-b',
      sourceNodeId: 'node:federation-a',
      continuityEpoch: 'continuity:federation',
      replayFingerprint: 'replay:federation',
      lineageIds: [lineage.lineageId],
      federationEventId: 'import:federation',
    })

    assert.equal(status.continuityVerified, true)
    assert.equal(status.federationState, 'synchronized')
  } finally {
    await harness.close()
  }
})

test('distributed sovereignty admin status stable', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const token = await harness.authFixture.createAccessToken()

    const response = await harness.app.inject({
      method: 'GET',
      url: '/admin/distributed-sovereignty/status',
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ready')
    assert.equal(body.distributedSovereigntyState.distributedFoundation, true)
    assert.equal(body.distributedSovereigntyState.consensusImplemented, false)
    assert.equal(body.quorumState.consensusMode, 'single_writer')
    assert.equal(typeof body.distributedLineageIntegrity, 'string')
  } finally {
    await harness.close()
  }
})
