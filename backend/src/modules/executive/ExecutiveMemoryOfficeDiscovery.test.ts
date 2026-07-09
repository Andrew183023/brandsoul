import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createBackendNativeAuthStoreRepository } from '../../auth/repositories/backendNativeAuthStoreRepository.js'
import { EntityRepository } from '../../repositories/entityRepository.js'
import {
  createExecutiveMemoryOfficeDiscoveryService,
} from './ExecutiveMemoryOfficeDiscovery.js'

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
    authRepository: createBackendNativeAuthStoreRepository(db),
    entityRepository: new EntityRepository(db),
    discovery: createExecutiveMemoryOfficeDiscoveryService(db),
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function createLegalEntityProfile(overrides?: {
  lifecycleStatus?: string
  businessType?: 'legal' | 'services'
  officeName?: string
}): EntityProfile {
  return {
    metadata: {
      businessConfig: {
        businessType: overrides?.businessType ?? 'legal',
        officeName: overrides?.officeName ?? 'Rocha Lima Advocacia',
      },
      lifecycle: {
        status: overrides?.lifecycleStatus ?? 'active',
      },
    },
  } as EntityProfile
}

async function createOwnedOffice(args: {
  harness: Awaited<ReturnType<typeof createHarness>>
  officeId: string
  tenantNameSuffix?: string
  officeName?: string
  businessType?: 'legal' | 'services'
  lifecycleStatus?: string
  userIsActive?: boolean
  tenantIsActive?: boolean
  membershipIsActive?: boolean
}) {
  const user = await args.harness.authRepository.createUser({
    name: `User ${args.officeId}`,
    email: `${args.officeId}@example.com`,
    passwordHash: 'hash',
    isActive: args.userIsActive ?? true,
  })
  const tenant = await args.harness.authRepository.createTenant({
    name: `Tenant ${args.tenantNameSuffix ?? args.officeId}`,
    slug: `tenant-${args.tenantNameSuffix ?? args.officeId}`,
    businessModel: 'hybrid',
    isActive: args.tenantIsActive ?? true,
  })

  assert.ok(user)
  assert.ok(tenant)

  await args.harness.authRepository.createMembership({
    userId: user.id,
    tenantId: tenant.id,
    role: 'owner',
    isActive: args.membershipIsActive ?? true,
  })

  await args.harness.entityRepository.createEntity({
    id: args.officeId,
    ownerId: `user:${user.id}:tenant:${tenant.id}`,
    ownerUserId: user.id,
    ownerTenantId: tenant.id,
    entityProfile: createLegalEntityProfile({
      lifecycleStatus: args.lifecycleStatus,
      businessType: args.businessType,
      officeName: args.officeName,
    }),
  })

  return { user, tenant }
}

test('returns only legal offices with active canonical ownership', async () => {
  const harness = await createHarness('executive-memory-office-discovery-eligible-')

  try {
    const owned = await createOwnedOffice({
      harness,
      officeId: 'office-legal-1',
    })

    await createOwnedOffice({
      harness,
      officeId: 'office-services-1',
      businessType: 'services',
    })
    await createOwnedOffice({
      harness,
      officeId: 'office-archived-1',
      lifecycleStatus: 'archived',
    })
    await createOwnedOffice({
      harness,
      officeId: 'office-inactive-user-1',
      userIsActive: false,
    })
    await createOwnedOffice({
      harness,
      officeId: 'office-inactive-tenant-1',
      tenantIsActive: false,
    })
    await createOwnedOffice({
      harness,
      officeId: 'office-inactive-membership-1',
      membershipIsActive: false,
    })
    await harness.entityRepository.createEntity({
      id: 'office-orphan-1',
      ownerId: 'user:999:tenant:888',
      ownerUserId: 999,
      ownerTenantId: 888,
      entityProfile: createLegalEntityProfile(),
    })

    const page = await harness.discovery.listEligibleOffices()

    assert.deepEqual(page, {
      items: [
        {
          tenantId: owned.tenant.id,
          officeId: 'office-legal-1',
        },
      ],
    })
  } finally {
    await harness.cleanup()
  }
})

test('excludes deleted and invalid lifecycle states', async () => {
  const harness = await createHarness('executive-memory-office-discovery-lifecycle-')

  try {
    await createOwnedOffice({
      harness,
      officeId: 'office-deleted-1',
      lifecycleStatus: 'deleted',
    })
    await createOwnedOffice({
      harness,
      officeId: 'office-invalid-1',
      lifecycleStatus: 'invalid',
    })

    const page = await harness.discovery.listEligibleOffices()
    assert.deepEqual(page.items, [])
  } finally {
    await harness.cleanup()
  }
})

test('returns only tenantId and officeId without PII', async () => {
  const harness = await createHarness('executive-memory-office-discovery-boundary-')

  try {
    const owned = await createOwnedOffice({
      harness,
      officeId: 'office-legal-1',
      officeName: 'Nome Sensivel',
    })

    const page = await harness.discovery.listEligibleOffices()

    assert.deepEqual(page.items[0], {
      tenantId: owned.tenant.id,
      officeId: 'office-legal-1',
    })
    assert.deepEqual(Object.keys(page.items[0] ?? {}).sort(), ['officeId', 'tenantId'])
    assert.equal(JSON.stringify(page).includes('Nome Sensivel'), false)
    assert.equal(JSON.stringify(page).includes('@example.com'), false)
    assert.equal(JSON.stringify(page).includes('phone'), false)
  } finally {
    await harness.cleanup()
  }
})

test('orders results deterministically by officeId ascending', async () => {
  const harness = await createHarness('executive-memory-office-discovery-order-')

  try {
    const officeB = await createOwnedOffice({
      harness,
      officeId: 'office-b',
      tenantNameSuffix: 'b',
    })
    const officeA = await createOwnedOffice({
      harness,
      officeId: 'office-a',
      tenantNameSuffix: 'a',
    })
    const officeC = await createOwnedOffice({
      harness,
      officeId: 'office-c',
      tenantNameSuffix: 'c',
    })

    const first = await harness.discovery.listEligibleOffices()
    const second = await harness.discovery.listEligibleOffices()

    assert.deepEqual(first, second)
    assert.deepEqual(first.items, [
      { tenantId: officeA.tenant.id, officeId: 'office-a' },
      { tenantId: officeB.tenant.id, officeId: 'office-b' },
      { tenantId: officeC.tenant.id, officeId: 'office-c' },
    ])
  } finally {
    await harness.cleanup()
  }
})

test('supports cursor pagination across eligible offices', async () => {
  const harness = await createHarness('executive-memory-office-discovery-pagination-')

  try {
    const officeA = await createOwnedOffice({ harness, officeId: 'office-a' })
    const officeB = await createOwnedOffice({ harness, officeId: 'office-b' })
    const officeC = await createOwnedOffice({ harness, officeId: 'office-c' })

    const first = await harness.discovery.listEligibleOffices({ limit: 2 })
    const second = await harness.discovery.listEligibleOffices({
      limit: 2,
      cursor: first.nextCursor,
    })
    const final = await harness.discovery.listEligibleOffices({
      limit: 2,
      cursor: second.nextCursor,
    })

    assert.deepEqual(first, {
      items: [
        { tenantId: officeA.tenant.id, officeId: 'office-a' },
        { tenantId: officeB.tenant.id, officeId: 'office-b' },
      ],
      nextCursor: 'office-b',
    })
    assert.deepEqual(second, {
      items: [
        { tenantId: officeC.tenant.id, officeId: 'office-c' },
      ],
    })
    assert.deepEqual(final, {
      items: [],
    })
  } finally {
    await harness.cleanup()
  }
})

test('cursor pagination skips ineligible offices and still returns the requested limit when possible', async () => {
  const harness = await createHarness('executive-memory-office-discovery-cursor-scan-')

  try {
    const officeA = await createOwnedOffice({ harness, officeId: 'office-a' })
    await createOwnedOffice({
      harness,
      officeId: 'office-b',
      businessType: 'services',
    })
    const officeC = await createOwnedOffice({ harness, officeId: 'office-c' })

    const page = await harness.discovery.listEligibleOffices({ limit: 2 })

    assert.deepEqual(page, {
      items: [
        { tenantId: officeA.tenant.id, officeId: 'office-a' },
        { tenantId: officeC.tenant.id, officeId: 'office-c' },
      ],
      nextCursor: 'office-c',
    })
  } finally {
    await harness.cleanup()
  }
})

test('returns an empty page for an empty database', async () => {
  const harness = await createHarness('executive-memory-office-discovery-empty-')

  try {
    const page = await harness.discovery.listEligibleOffices()
    assert.deepEqual(page, { items: [] })
  } finally {
    await harness.cleanup()
  }
})

test('normalizes limit with default minimum maximum and invalid fallbacks', async () => {
  const harness = await createHarness('executive-memory-office-discovery-limit-')

  try {
    for (let index = 0; index < 25; index += 1) {
      await createOwnedOffice({
        harness,
        officeId: `office-${String(index).padStart(2, '0')}`,
        tenantNameSuffix: String(index),
      })
    }

    const defaultPage = await harness.discovery.listEligibleOffices()
    const minimumPage = await harness.discovery.listEligibleOffices({ limit: 1 })
    const maximumPage = await harness.discovery.listEligibleOffices({ limit: 100 })
    const invalidPages = await Promise.all([
      harness.discovery.listEligibleOffices({ limit: 0 }),
      harness.discovery.listEligibleOffices({ limit: -1 }),
      harness.discovery.listEligibleOffices({ limit: 1.5 }),
      harness.discovery.listEligibleOffices({ limit: Number.NaN }),
      harness.discovery.listEligibleOffices({ limit: Number.POSITIVE_INFINITY }),
      harness.discovery.listEligibleOffices({ limit: 101 }),
    ])

    assert.equal(defaultPage.items.length, 20)
    assert.equal(minimumPage.items.length, 1)
    assert.equal(maximumPage.items.length, 25)
    for (const page of invalidPages) {
      assert.equal(page.items.length, 20)
    }
  } finally {
    await harness.cleanup()
  }
})

test('treats blank cursor as an initial page request', async () => {
  const harness = await createHarness('executive-memory-office-discovery-blank-cursor-')

  try {
    const office = await createOwnedOffice({ harness, officeId: 'office-a' })
    const page = await harness.discovery.listEligibleOffices({ cursor: '   ' })

    assert.deepEqual(page, {
      items: [
        { tenantId: office.tenant.id, officeId: 'office-a' },
      ],
    })
  } finally {
    await harness.cleanup()
  }
})

test('module remains structurally isolated from forbidden dependencies', async () => {
  const source = await readFile(
    path.resolve('backend/src/modules/executive/ExecutiveMemoryOfficeDiscovery.ts'),
    'utf8',
  )

  assert.equal(
    /Date\.now|new Date|performance\.now|Math\.random|crypto\.randomUUID|uuid|fetch|axios|fastify|react|window|document|localStorage|sessionStorage|ExecutiveDashboardService|ExecutiveDashboardApplicationService|ExecutiveMemoryCaptureService|ExecutiveMemoryRepository|growthIntelligenceService|operationalIntelligenceService|executiveDashboardRoutes|brandsoul-frontend|job/i.test(source),
    false,
  )
  assert.equal(/\bany\b/.test(source), false)
})
