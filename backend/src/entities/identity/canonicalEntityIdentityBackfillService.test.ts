import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createTestEntity } from '../../brain/flowmind/testUtils.js'
import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createEntityRepository } from '../../repositories/entityRepository.js'
import { mapEntityProfileToPublicProfile } from '../../services/publicProfileMapper.js'
import { resolveObjectiveFromEntityProfile } from '../../services/flowMindService.js'
import { createOrchestratorCommand } from '../../orchestrator/orchestratorCore.js'
import { runWithMutationAuthority } from '../../sovereignty/authorityBoundary.js'
import {
  createCanonicalEntityIdentityBackfillService,
} from './canonicalEntityIdentityBackfillService.js'

async function createHarness(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  return {
    db,
    repository: createEntityRepository(db),
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

async function createEntityUnderAuthority(
  repository: ReturnType<typeof createEntityRepository>,
  input: Parameters<ReturnType<typeof createEntityRepository>['createEntity']>[0],
) {
  return runWithMutationAuthority({
    source: 'backend/src/entities/identity/canonicalEntityIdentityBackfillService.test.ts#createEntityUnderAuthority',
    viaExecutor: true,
  }, () => repository.createEntity(input))
}

test('dry_run writes nothing and reports missing canonical identity rows', async () => {
  const harness = await createHarness('flowmind-entity-identity-dry-run-')

  try {
    const entity = createTestEntity()
    entity.canonicalIdentity = undefined
    await createEntityUnderAuthority(harness.repository, {
      id: entity.id,
      ownerId: 'user:5:tenant:9',
      ownerUserId: 5,
      ownerTenantId: 9,
      createdAt: '2026-05-10T12:00:00.000Z',
      entityProfile: entity,
    })

    const service = createCanonicalEntityIdentityBackfillService({
      repository: harness.repository,
      now: () => '2026-05-10T12:01:00.000Z',
    })
    const report = await service.run('dry_run')
    const stored = await harness.repository.getEntityById(entity.id)

    assert.equal(report.scanned, 1)
    assert.equal(report.backfilled, 1)
    assert.equal(report.skipped, 0)
    assert.equal(report.conflicts, 0)
    assert.equal(stored?.entityProfile.canonicalIdentity, undefined)
  } finally {
    await harness.cleanup()
  }
})

test('apply backfills missing canonical identity and preserves owner lineage', async () => {
  const harness = await createHarness('flowmind-entity-identity-apply-')

  try {
    const entity = createTestEntity()
    entity.canonicalIdentity = undefined
    await createEntityUnderAuthority(harness.repository, {
      id: entity.id,
      ownerId: 'user:7:tenant:13',
      ownerUserId: 7,
      ownerTenantId: 13,
      createdAt: '2026-05-10T12:00:00.000Z',
      entityProfile: entity,
    })

    const service = createCanonicalEntityIdentityBackfillService({
      repository: harness.repository,
      now: () => '2026-05-10T12:02:00.000Z',
    })
    const report = await service.run('apply')
    const stored = await harness.repository.getEntityById(entity.id)

    assert.equal(report.backfilled, 1)
    assert.ok(stored?.entityProfile.canonicalIdentity)
    assert.equal(stored?.id, entity.id)
    assert.equal(stored?.entityProfile.id, entity.id)
    assert.equal(stored?.entityProfile.canonicalIdentity?.identity.entityId, entity.id)
    assert.equal(stored?.ownerUserId, 7)
    assert.equal(stored?.ownerTenantId, 13)
    assert.equal(stored?.entityProfile.canonicalIdentity?.identity.identityVersion, 1)
    assert.match(stored?.entityProfile.canonicalIdentity?.identity.canonicalSlug ?? '', /^[a-z0-9-]+-[a-f0-9]{10}$/)
  } finally {
    await harness.cleanup()
  }
})

test('existing canonical identity is skipped and not overwritten silently', async () => {
  const harness = await createHarness('flowmind-entity-identity-skip-')

  try {
    const entity = createTestEntity()
    const beforeVersion = entity.canonicalIdentity?.identity.identityVersion

    await createEntityUnderAuthority(harness.repository, {
      id: entity.id,
      ownerId: 'user:7:tenant:1',
      ownerUserId: 7,
      ownerTenantId: 1,
      createdAt: '2026-04-19T12:00:00.000Z',
      entityProfile: entity,
    })

    const service = createCanonicalEntityIdentityBackfillService({
      repository: harness.repository,
      now: () => '2026-05-10T12:03:00.000Z',
    })
    const report = await service.run('apply')
    const stored = await harness.repository.getEntityById(entity.id)

    assert.equal(report.skipped, 1)
    assert.equal(report.backfilled, 0)
    assert.equal(stored?.entityProfile.canonicalIdentity?.identity.identityVersion, beforeVersion)
    assert.equal(stored?.entityProfile.canonicalIdentity?.identity.canonicalSlug, entity.canonicalIdentity?.identity.canonicalSlug)
  } finally {
    await harness.cleanup()
  }
})

test('deterministic reconstruction is stable and runtime/public readers consume canonical identity after backfill', async () => {
  const harness = await createHarness('flowmind-entity-identity-runtime-')

  try {
    const entity = createTestEntity()
    entity.canonicalIdentity = undefined
    entity.export = {
      ...entity.export,
      formatsEnabled: [],
    }
    entity.context = {
      ...entity.context,
      styleAnswers: {
        ...entity.context.styleAnswers,
        languageStyle: 'calmo',
      },
    }
    await createEntityUnderAuthority(harness.repository, {
      id: entity.id,
      ownerId: 'user:8:tenant:21',
      ownerUserId: 8,
      ownerTenantId: 21,
      createdAt: '2026-05-10T12:00:00.000Z',
      entityProfile: entity,
    })

    const service = createCanonicalEntityIdentityBackfillService({
      repository: harness.repository,
      now: () => '2026-05-10T12:04:00.000Z',
    })

    const firstApply = await service.run('apply')
    const secondDryRun = await service.run('dry_run')
    const stored = (await harness.repository.getEntityById(entity.id))!.entityProfile

    assert.equal(firstApply.backfilled, 1)
    assert.equal(secondDryRun.skipped, 1)

    const publicProfile = mapEntityProfileToPublicProfile({
      entity: stored as unknown as Record<string, unknown>,
    })
    assert.equal(publicProfile.name, stored.canonicalIdentity?.identity.canonicalName)
    assert.equal(publicProfile.canonicalSlug, stored.canonicalIdentity?.identity.canonicalSlug)

    stored.canonicalIdentity!.persona.responseBehaviorProfile.primaryObjective = 'educate'
    stored.canonicalIdentity!.persona.communicationStyle = 'technical'
    const objective = resolveObjectiveFromEntityProfile(stored, createOrchestratorCommand({
      type: 'command',
      name: 'start_birth',
      source: 'user',
    }))
    assert.equal(objective?.type, 'educate')
  } finally {
    await harness.cleanup()
  }
})
