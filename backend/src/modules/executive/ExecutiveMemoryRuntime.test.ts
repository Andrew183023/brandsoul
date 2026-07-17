import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createBackendNativeAuthStoreRepository } from '../../auth/repositories/backendNativeAuthStoreRepository.js'
import type { EntityProfileDocument } from '../../domain/entityProfile.js'
import { createDatabaseConnection, initializeDatabase, type BackendDatabase } from '../../db/index.js'
import { EntityRepository } from '../../repositories/entityRepository.js'
import { createObservabilityService } from '../../services/observabilityService.js'
import {
  ExecutiveMemoryAtomicCaptureService,
  EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX,
  EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL,
  ExecutiveMemoryCaptureExecutionService,
  ExecutiveMemoryCaptureOrchestrator,
  ExecutiveMemoryCaptureTriggerService,
  ExecutiveMemoryOperationalInvocationForbiddenError,
  ExecutiveMemoryOperationalInvocationService,
  ExecutiveMemoryOfficeDiscoveryService,
  ExecutiveMetrics,
  ExecutiveMemoryOperationalRunService,
  createExecutiveMemoryRuntime,
} from './index.js'
import { buildExecutiveMemoryProjection } from './ExecutiveMemoryProjection.js'

type RuntimeDependenciesOverrides = {
  db?: BackendDatabase
  observability?: ReturnType<typeof createObservabilityService>
  clock?: {
    now(): Date
  }
  timer?: {
    now(): number
  }
  captureCycleIdSource?: {
    nextCaptureCycleId(): string
  }
  captureCycleIdSourceDependencies?: {
    generateUuid?: () => string
  }
  entityRepository?: {
    getEntityById(officeId: string): Promise<{ entityProfile: EntityProfileDocument } | null>
  }
  caseRepository?: {
    listCasesByEntity(tenantId: number, officeId: string): Promise<Array<{ id: string }>>
  }
  officeProfessionalService?: {
    listOfficeProfessionals(
      tenantId: number,
      officeId: string,
    ): Promise<Array<{
      id: string
      officeId?: string
      city?: string
      status: 'active' | 'inactive' | 'suspended'
      specialties: string[]
    }>>
  }
  growthIntelligenceService?: {
    build(input: {
      tenantId: number
      officeId: string
      cases: Array<{ id: string }>
      professionals: Array<{
        id: string
        officeId?: string
        city?: string
        status: 'active' | 'inactive' | 'suspended'
        specialties: string[]
      }>
      entityProfile?: EntityProfileDocument | null
      generatedAt?: string
    }): Promise<{
      status: 'ready'
      officeId: string
      tenantId: number
      generatedAt: string
      summary: {
        averageGrowthScore: number | null
        criticalRecommendations: number
        expansionOpportunities: number
        totalCoverageGaps: number
        eligibleLandingCandidates: number
      }
      snapshot: Record<string, unknown>
      compatibility: {
        professionalsIncluded: boolean
        entityProfileIncluded: boolean
        landingCandidatesPreparedOnly: true
      }
    }>
  }
  operationalIntelligenceService?: {
    build(input: {
      tenantId: number
      officeId: string
      cases: Array<{ id: string }>
      generatedAt?: string
    }): Promise<{
      status: 'ready'
      officeId: string
      tenantId: number
      generatedAt: string
      snapshot: {
        openCases: number
        backlog: number
        activeProfessionals: number
        slaBreachedCases: number
        slaWarningCases: number
      }
      signals: []
      timeline: []
      regional: []
      specialties: []
      workload: []
      opportunities: []
      compatibility: {
        firstResponseMinutesDerived: false
        slaStatusDerived: false
        waitingForDerived: false
        archivedCasesExcluded: true
      }
    }>
  }
}

function createFakeDb() {
  const calls = {
    run: 0,
    get: 0,
    all: 0,
    exec: 0,
    transaction: 0,
    close: 0,
  }

  const db: BackendDatabase = {
    dialect: 'sqlite',
    async run() {
      calls.run += 1
      return {}
    },
    async get() {
      calls.get += 1
      return undefined
    },
    async all() {
      calls.all += 1
      return [] as never
    },
    async exec() {
      calls.exec += 1
    },
    async transaction() {
      calls.transaction += 1
      throw new Error('transaction should not run during composition')
    },
    async close() {
      calls.close += 1
    },
  }

  return { db, calls }
}

function createDependencies(overrides: RuntimeDependenciesOverrides = {}) {
  const observability = overrides.observability ?? createObservabilityService()

  return {
    db: overrides.db ?? createFakeDb().db,
    observability,
    clock: overrides.clock ?? {
      now() {
        return new Date('2026-07-10T12:00:00.000Z')
      },
    },
    timer: overrides.timer ?? {
      now() {
        return 100
      },
    },
    captureCycleIdSource: overrides.captureCycleIdSource,
    captureCycleIdSourceDependencies: overrides.captureCycleIdSourceDependencies,
    entityRepository: overrides.entityRepository ?? {
      async getEntityById() {
        return {
          entityProfile: {
            metadata: {
              businessConfig: {
                businessType: 'legal',
              },
            },
          } as EntityProfileDocument,
        }
      },
    },
    caseRepository: overrides.caseRepository ?? {
      async listCasesByEntity() {
        return []
      },
    },
    officeProfessionalService: overrides.officeProfessionalService ?? {
      async listOfficeProfessionals() {
        return []
      },
    },
    growthIntelligenceService: overrides.growthIntelligenceService ?? {
      async build(input) {
        return {
          status: 'ready' as const,
          officeId: input.officeId,
          tenantId: input.tenantId,
          generatedAt: input.generatedAt ?? '2026-07-10T12:00:00.000Z',
          summary: {
            averageGrowthScore: 82,
            criticalRecommendations: 0,
            expansionOpportunities: 1,
            totalCoverageGaps: 0,
            eligibleLandingCandidates: 1,
          },
          snapshot: {},
          compatibility: {
            professionalsIncluded: true,
            entityProfileIncluded: Boolean(input.entityProfile),
            landingCandidatesPreparedOnly: true as const,
          },
        }
      },
    },
    operationalIntelligenceService: overrides.operationalIntelligenceService ?? {
      async build(input) {
        return {
          status: 'ready' as const,
          officeId: input.officeId,
          tenantId: input.tenantId,
          generatedAt: input.generatedAt ?? '2026-07-10T12:00:00.000Z',
          snapshot: {
            openCases: 0,
            backlog: 0,
            activeProfessionals: 1,
            slaBreachedCases: 0,
            slaWarningCases: 0,
          },
          signals: [],
          timeline: [],
          regional: [],
          specialties: [],
          workload: [],
          opportunities: [],
          compatibility: {
            firstResponseMinutesDerived: false as const,
            slaStatusDerived: false as const,
            waitingForDerived: false as const,
            archivedCasesExcluded: true as const,
          },
        }
      },
    },
  }
}

async function createSqliteHarness(prefix: string) {
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
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function createProjection() {
  return buildExecutiveMemoryProjection({
    tenantId: 7,
    officeId: 'office-1',
    capturedAt: '2026-07-10T12:00:00.000Z',
    sourceGrowthGeneratedAt: '2026-07-10T12:00:00.000Z',
    sourceOperationalGeneratedAt: '2026-07-10T12:00:00.000Z',
    officeHealth: {
      score: 80,
      level: 'good',
      explanation: 'Office health is stable.',
      positives: [],
      warnings: [],
      opportunities: [],
      drivers: [],
    },
    decisionCenter: {
      decisions: [],
    },
    executiveTimeline: {
      items: [],
      totalDetected: 0,
      totalPublished: 0,
      generatedAt: '2026-07-10T12:00:00.000Z',
    },
  })
}

test('factory returns a valid executive memory runtime', () => {
  const dependencies = createDependencies()
  const runtime = createExecutiveMemoryRuntime(dependencies)

  assert.equal(runtime.officeDiscoveryService instanceof ExecutiveMemoryOfficeDiscoveryService, true)
  assert.equal(runtime.atomicCaptureService instanceof ExecutiveMemoryAtomicCaptureService, true)
  assert.equal(runtime.orchestrator instanceof ExecutiveMemoryCaptureOrchestrator, true)
  assert.equal(runtime.triggerService instanceof ExecutiveMemoryCaptureTriggerService, true)
  assert.equal(runtime.metrics instanceof ExecutiveMetrics, true)
  assert.equal(runtime.operationalRunService instanceof ExecutiveMemoryOperationalRunService, true)
  assert.equal(runtime.operationalInvocationService instanceof ExecutiveMemoryOperationalInvocationService, true)
  assert.equal(typeof runtime.createExecution, 'function')
  assert.equal(typeof runtime.createExecutionService, 'function')
})

test('composition is side-effect free and does not mutate dependencies', () => {
  const fakeDb = createFakeDb()
  const dependencies = createDependencies({ db: fakeDb.db })
  const before = structuredClone({
    hasTimer: Boolean(dependencies.timer),
    hasObservability: Boolean(dependencies.observability),
  })

  const runtime = createExecutiveMemoryRuntime(dependencies)

  assert.ok(runtime)
  assert.deepEqual(fakeDb.calls, {
    run: 0,
    get: 0,
    all: 0,
    exec: 0,
    transaction: 0,
    close: 0,
  })
  assert.deepEqual({
    hasTimer: Boolean(dependencies.timer),
    hasObservability: Boolean(dependencies.observability),
  }, before)
})

test('composition does not generate captureCycleId values or call trigger run and createExecutionService returns independent instances', () => {
  const dependencies = createDependencies()
  const runtime = createExecutiveMemoryRuntime(dependencies)
  let cycleIdCalls = 0

  const firstExecution = runtime.createExecutionService(7, {
    nextCaptureCycleId() {
      cycleIdCalls += 1
      return 'cycle-1'
    },
  })
  const secondExecution = runtime.createExecutionService(8, {
    nextCaptureCycleId() {
      cycleIdCalls += 1
      return 'cycle-2'
    },
  })

  assert.equal(firstExecution instanceof ExecutiveMemoryCaptureExecutionService, true)
  assert.equal(secondExecution instanceof ExecutiveMemoryCaptureExecutionService, true)
  assert.notEqual(firstExecution, secondExecution)
  assert.equal(cycleIdCalls, 0)
})

test('composition exposes a shared operational run service without creating executions or consuming ids', () => {
  let uuidCalls = 0
  const runtime = createExecutiveMemoryRuntime(createDependencies({
    captureCycleIdSourceDependencies: {
      generateUuid() {
        uuidCalls += 1
        return '123e4567-e89b-42d3-a456-426614174000'
      },
    },
  }))

  assert.equal(runtime.operationalRunService instanceof ExecutiveMemoryOperationalRunService, true)
  assert.equal(runtime.operationalRunService, runtime.operationalRunService)
  assert.equal(runtime.operationalInvocationService instanceof ExecutiveMemoryOperationalInvocationService, true)
  assert.equal(runtime.operationalInvocationService, runtime.operationalInvocationService)
  assert.equal(uuidCalls, 0)
})

test('createExecution uses the runtime default source without consuming ids during composition or execution creation', () => {
  let uuidCalls = 0
  const runtime = createExecutiveMemoryRuntime(createDependencies({
    captureCycleIdSourceDependencies: {
      generateUuid() {
        uuidCalls += 1
        return '123e4567-e89b-42d3-a456-426614174000'
      },
    },
  }))

  assert.equal(uuidCalls, 0)

  const execution = runtime.createExecution(7)

  assert.equal(execution instanceof ExecutiveMemoryCaptureExecutionService, true)
  assert.equal(uuidCalls, 0)
  assert.deepEqual(execution.getState(), {
    status: 'idle',
    captureCycleId: undefined,
    cursor: undefined,
    totals: {
      processed: 0,
      captured: 0,
      created: 0,
      failed: 0,
    },
    lastBatch: undefined,
  })
})

test('createExecution consumes exactly one id on start and different executions keep independent lifecycle and ids', async () => {
  const runtime = createExecutiveMemoryRuntime(createDependencies({
    captureCycleIdSourceDependencies: {
      generateUuid: (() => {
        const values = [
          '123e4567-e89b-42d3-a456-426614174000',
          '123e4567-e89b-42d3-a456-426614174001',
        ]
        return () => {
          const next = values.shift()
          if (!next) {
            throw new Error('uuid exhausted')
          }

          return next
        }
      })(),
    },
  }))

  const first = runtime.createExecution(7)
  const second = runtime.createExecution(8)

  assert.notEqual(first, second)
  assert.equal(first.getState().status, 'idle')
  assert.equal(second.getState().status, 'idle')

  const firstResult = await first.start()

  assert.equal(
    firstResult.captureCycleId,
    `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174000`,
  )
  assert.equal(second.getState().status, 'idle')

  const secondResult = await second.start()

  assert.equal(
    secondResult.captureCycleId,
    `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174001`,
  )
})

test('custom runtime captureCycleIdSource is respected by createExecution and continue reuses the same id', async () => {
  const runtime = createExecutiveMemoryRuntime(createDependencies({
    captureCycleIdSource: {
      nextCaptureCycleId() {
        return 'cycle-custom-1'
      },
    },
  }))
  const execution = runtime.createExecution(7)

  const firstState = await execution.start()
  const continueState = await execution.continueExecution()

  assert.equal(firstState.captureCycleId, 'cycle-custom-1')
  assert.equal(continueState.captureCycleId, 'cycle-custom-1')
})

test('office discovery uses the provided database and atomic capture uses the provided database', async () => {
  const harness = await createSqliteHarness('executive-memory-runtime-')

  try {
    const user = await harness.authRepository.createUser({
      name: 'Owner',
      email: 'owner@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await harness.authRepository.createTenant({
      name: 'Tenant 7',
      slug: 'tenant-7',
      businessModel: 'hybrid',
      isActive: true,
    })

    assert.ok(user)
    assert.ok(tenant)

    await harness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await harness.entityRepository.createEntity({
      id: 'office-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: harness.db,
      entityRepository: harness.entityRepository,
    }))

    const page = await runtime.officeDiscoveryService.listEligibleOffices({ tenantId: tenant.id })
    assert.deepEqual(page.items, [{ tenantId: tenant.id, officeId: 'office-1' }])

    const captured = await runtime.atomicCaptureService.capture({
      projection: createProjection(),
      captureCycleId: 'capture-cycle-1',
    })
    assert.equal(captured.snapshotId.length > 0, true)
    assert.equal(captured.observationId.length > 0, true)
  } finally {
    await harness.cleanup()
  }
})

test('operationalRunService uses the productive chain and stays passive until run is called', async () => {
  const harness = await createSqliteHarness('executive-memory-runtime-operational-run-')

  try {
    const user = await harness.authRepository.createUser({
      name: 'Owner',
      email: 'owner-runtime-run@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await harness.authRepository.createTenant({
      name: 'Tenant 8',
      slug: 'tenant-8',
      businessModel: 'hybrid',
      isActive: true,
    })

    await harness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await harness.entityRepository.createEntity({
      id: 'office-runtime-run-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const observability = createObservabilityService()
    let uuidCalls = 0
    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: harness.db,
      observability,
      entityRepository: harness.entityRepository,
      captureCycleIdSourceDependencies: {
        generateUuid() {
          uuidCalls += 1
          return '123e4567-e89b-42d3-a456-426614174000'
        },
      },
    }))

    assert.equal(uuidCalls, 0)

    const result = await runtime.operationalRunService.run({
      tenantId: tenant.id,
      maxBatches: 1,
      limit: 5,
    })

    assert.equal(uuidCalls, 1)
    assert.equal(result.status, 'completed')
    assert.equal(
      result.captureCycleId,
      `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174000`,
    )
    assert.equal(result.batchesExecuted, 1)
    assert.deepEqual(result.totals, {
      processed: 1,
      captured: 1,
      created: 1,
      failed: 0,
    })
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_snapshots')),
      1,
    )
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_observations')),
      1,
    )
    assert.equal(
      observability.getMetricsSnapshot().customCounters[EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL],
      2,
    )
  } finally {
    await harness.cleanup()
  }
})

test('operationalInvocationService uses the productive authorized chain and stays passive until invoke is called', async () => {
  const harness = await createSqliteHarness('executive-memory-runtime-operational-invocation-')

  try {
    const user = await harness.authRepository.createUser({
      name: 'Owner',
      email: 'owner-runtime-invocation@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await harness.authRepository.createTenant({
      name: 'Tenant 11',
      slug: 'tenant-11',
      businessModel: 'hybrid',
      isActive: true,
    })

    await harness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await harness.entityRepository.createEntity({
      id: 'office-runtime-invocation-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const observability = createObservabilityService()
    let uuidCalls = 0
    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: harness.db,
      observability,
      entityRepository: harness.entityRepository,
      captureCycleIdSourceDependencies: {
        generateUuid() {
          uuidCalls += 1
          return '123e4567-e89b-42d3-a456-426614174100'
        },
      },
    }))

    assert.equal(uuidCalls, 0)
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_snapshots')),
      0,
    )
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_observations')),
      0,
    )

    const result = await runtime.operationalInvocationService.invoke({
      actor: {
        actorId: `user:${user.id}`,
        tenantId: tenant.id,
        roles: ['admin'],
      },
      tenantId: tenant.id,
      maxBatches: 1,
      limit: 5,
    })

    assert.equal(uuidCalls, 1)
    assert.equal(result.status, 'completed')
    assert.equal(
      result.captureCycleId,
      `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174100`,
    )
    assert.deepEqual(result.totals, {
      processed: 1,
      captured: 1,
      created: 1,
      failed: 0,
    })
    assert.equal(result.batchesExecuted, 1)
    assert.equal('executionState' in result, false)
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_snapshots')),
      1,
    )
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_observations')),
      1,
    )
    assert.equal(
      observability.getMetricsSnapshot().customCounters[EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL],
      2,
    )
  } finally {
    await harness.cleanup()
  }
})

test('operationalInvocationService denies forbidden actors without executing or consuming ids', async () => {
  const harness = await createSqliteHarness('executive-memory-runtime-operational-invocation-denied-')

  try {
    const user = await harness.authRepository.createUser({
      name: 'Owner',
      email: 'owner-runtime-invocation-denied@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await harness.authRepository.createTenant({
      name: 'Tenant 12',
      slug: 'tenant-12',
      businessModel: 'hybrid',
      isActive: true,
    })

    await harness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await harness.entityRepository.createEntity({
      id: 'office-runtime-invocation-denied-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const observability = createObservabilityService()
    let uuidCalls = 0
    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: harness.db,
      observability,
      entityRepository: harness.entityRepository,
      captureCycleIdSourceDependencies: {
        generateUuid() {
          uuidCalls += 1
          return '123e4567-e89b-42d3-a456-426614174101'
        },
      },
    }))

    await assert.rejects(
      () => runtime.operationalInvocationService.invoke({
        actor: {
          actorId: `user:${user.id}`,
          tenantId: tenant.id,
          roles: ['client'],
        },
        tenantId: tenant.id,
      }),
      ExecutiveMemoryOperationalInvocationForbiddenError,
    )

    assert.equal(uuidCalls, 0)
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_snapshots')),
      0,
    )
    assert.equal(
      readCount(await harness.db.get('SELECT COUNT(*) AS count FROM executive_memory_observations')),
      0,
    )
    assert.equal(
      observability.getMetricsSnapshot().customCounters[EXECUTIVE_MEMORY_OPERATIONAL_RUNS_TOTAL] ?? 0,
      0,
    )
  } finally {
    await harness.cleanup()
  }
})

test('shared operationalInvocationService authorizes admin owner and operator and keeps concurrent invocations independent', async () => {
  const harness = await createSqliteHarness('executive-memory-runtime-operational-invocation-concurrent-')

  try {
    const user = await harness.authRepository.createUser({
      name: 'Owner',
      email: 'owner-runtime-invocation-concurrent@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await harness.authRepository.createTenant({
      name: 'Tenant 13',
      slug: 'tenant-13',
      businessModel: 'hybrid',
      isActive: true,
    })

    await harness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await harness.entityRepository.createEntity({
      id: 'office-runtime-invocation-concurrent-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const uuidValues = [
      '123e4567-e89b-42d3-a456-426614174110',
      '123e4567-e89b-42d3-a456-426614174111',
      '123e4567-e89b-42d3-a456-426614174112',
      '123e4567-e89b-42d3-a456-426614174113',
      '123e4567-e89b-42d3-a456-426614174114',
    ]
    let uuidCalls = 0
    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: harness.db,
      entityRepository: harness.entityRepository,
      captureCycleIdSourceDependencies: {
        generateUuid() {
          uuidCalls += 1
          const next = uuidValues.shift()
          if (!next) {
            throw new Error('uuid exhausted')
          }

          return next
        },
      },
    }))

    for (const role of ['admin', 'owner', 'operator'] as const) {
      const result = await runtime.operationalInvocationService.invoke({
        actor: {
          actorId: `user:${user.id}`,
          tenantId: tenant.id,
          roles: [role],
        },
        tenantId: tenant.id,
        maxBatches: 1,
        limit: 5,
      })

      assert.equal(result.status, 'completed')
      assert.equal(result.captureCycleId?.startsWith(EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX), true)
    }

    const [first, second] = await Promise.all([
      runtime.operationalInvocationService.invoke({
        actor: {
          actorId: `user:${user.id}`,
          tenantId: tenant.id,
          roles: ['admin'],
        },
        tenantId: tenant.id,
        maxBatches: 1,
        limit: 5,
      }),
      runtime.operationalInvocationService.invoke({
        actor: {
          actorId: `user:${user.id}`,
          tenantId: tenant.id,
          roles: ['owner'],
        },
        tenantId: tenant.id,
        maxBatches: 1,
        limit: 5,
      }),
    ])

    assert.deepEqual(
      [first.status, second.status].sort(),
      ['already_running', 'completed'],
    )
    assert.equal(first.captureCycleId?.startsWith(EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX), true)
    assert.equal(second.captureCycleId?.startsWith(EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX), true)
    assert.notEqual(first.captureCycleId, second.captureCycleId)

    const uuidCallsBeforeDenied = uuidCalls

    await assert.rejects(
      () => Promise.all([
        runtime.operationalInvocationService.invoke({
          actor: {
            actorId: `user:${user.id}`,
            tenantId: tenant.id,
            roles: ['client'],
          },
          tenantId: tenant.id,
        }),
        runtime.operationalInvocationService.invoke({
          actor: {
            actorId: `user:${user.id}`,
            tenantId: tenant.id,
            roles: ['client'],
          },
          tenantId: tenant.id,
        }),
      ]),
      ExecutiveMemoryOperationalInvocationForbiddenError,
    )

    assert.equal(uuidCalls, uuidCallsBeforeDenied)
  } finally {
    await harness.cleanup()
  }
})

test('shared operationalRunService keeps sequential and concurrent runs independent', async () => {
  const sequentialHarness = await createSqliteHarness('executive-memory-runtime-operational-sequential-')

  try {
    const user = await sequentialHarness.authRepository.createUser({
      name: 'Owner',
      email: 'owner-runtime-seq@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await sequentialHarness.authRepository.createTenant({
      name: 'Tenant 9',
      slug: 'tenant-9',
      businessModel: 'hybrid',
      isActive: true,
    })

    await sequentialHarness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await sequentialHarness.entityRepository.createEntity({
      id: 'office-runtime-seq-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const uuidValues = [
      '123e4567-e89b-42d3-a456-426614174010',
      '123e4567-e89b-42d3-a456-426614174011',
      '123e4567-e89b-42d3-a456-426614174012',
    ]
    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: sequentialHarness.db,
      entityRepository: sequentialHarness.entityRepository,
      captureCycleIdSourceDependencies: {
        generateUuid() {
          const next = uuidValues.shift()
          if (!next) {
            throw new Error('uuid exhausted')
          }

          return next
        },
      },
    }))

    const first = await runtime.operationalRunService.run({ tenantId: tenant.id, maxBatches: 1, limit: 5 })
    const second = await runtime.operationalRunService.run({ tenantId: tenant.id, maxBatches: 1, limit: 5 })

    assert.notEqual(first.captureCycleId, second.captureCycleId)
    assert.equal(first.status, 'completed')
    assert.equal(second.status, 'completed')
  } finally {
    await sequentialHarness.cleanup()
  }

  const concurrentHarness = await createSqliteHarness('executive-memory-runtime-operational-concurrent-')

  try {
    const user = await concurrentHarness.authRepository.createUser({
      name: 'Owner',
      email: 'owner-runtime-concurrent@example.com',
      passwordHash: 'hash',
      isActive: true,
    })
    const tenant = await concurrentHarness.authRepository.createTenant({
      name: 'Tenant 10',
      slug: 'tenant-10',
      businessModel: 'hybrid',
      isActive: true,
    })

    await concurrentHarness.authRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      isActive: true,
    })
    await concurrentHarness.entityRepository.createEntity({
      id: 'office-runtime-concurrent-1',
      ownerId: `user:${user.id}:tenant:${tenant.id}`,
      ownerUserId: user.id,
      ownerTenantId: tenant.id,
      entityProfile: {
        metadata: {
          businessConfig: {
            businessType: 'legal',
          },
          lifecycle: {
            status: 'active',
          },
        },
      } as EntityProfileDocument,
    })

    const uuidValues = [
      '123e4567-e89b-42d3-a456-426614174020',
      '123e4567-e89b-42d3-a456-426614174021',
    ]
    const runtime = createExecutiveMemoryRuntime(createDependencies({
      db: concurrentHarness.db,
      entityRepository: concurrentHarness.entityRepository,
      captureCycleIdSourceDependencies: {
        generateUuid() {
          const next = uuidValues.shift()
          if (!next) {
            throw new Error('uuid exhausted')
          }

          return next
        },
      },
    }))

    const [first, second] = await Promise.all([
      runtime.operationalRunService.run({ tenantId: tenant.id, maxBatches: 1, limit: 5 }),
      runtime.operationalRunService.run({ tenantId: tenant.id, maxBatches: 1, limit: 5 }),
    ])

    assert.equal(first.captureCycleId?.startsWith(EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX), true)
    assert.equal(second.captureCycleId?.startsWith(EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX), true)
    assert.notEqual(first.captureCycleId, second.captureCycleId)
    assert.deepEqual(
      [first.status, second.status].sort(),
      ['already_running', 'completed'],
    )
  } finally {
    await concurrentHarness.cleanup()
  }
})

test('two runtime compositions create independent service instances', () => {
  const first = createExecutiveMemoryRuntime(createDependencies())
  const second = createExecutiveMemoryRuntime(createDependencies())

  assert.notEqual(first.officeDiscoveryService, second.officeDiscoveryService)
  assert.notEqual(first.atomicCaptureService, second.atomicCaptureService)
  assert.notEqual(first.orchestrator, second.orchestrator)
  assert.notEqual(first.triggerService, second.triggerService)
  assert.notEqual(first.metrics, second.metrics)
  assert.notEqual(first.operationalRunService, second.operationalRunService)
  assert.notEqual(first.operationalInvocationService, second.operationalInvocationService)
})

test('composition module does not import or instantiate legacy state-only capture service', async () => {
  const runtimePath = path.resolve(
    process.cwd(),
    'backend/src/modules/executive/ExecutiveMemoryRuntime.ts',
  )
  const source = await readFile(runtimePath, 'utf8')

  assert.equal(source.includes('ExecutiveMemoryCaptureService'), false)
  assert.equal(source.includes('createExecutiveMemoryCaptureService'), false)
})

test('composition module stays isolated from runtime execution and server wiring concerns', async () => {
  const runtimePath = path.resolve(
    process.cwd(),
    'backend/src/modules/executive/ExecutiveMemoryRuntime.ts',
  )
  const source = await readFile(runtimePath, 'utf8')

  const forbiddenPatterns = [
    'Fastify',
    'FastifyRequest',
    'FastifyReply',
    'server.ts',
    'server.legal-beta.ts',
    'registerApi',
    'registerLegalBetaApi',
    'listen(',
    'setInterval',
    'setTimeout',
    'cron',
    'scheduler',
    'jobs',
    '.authorize(',
    '.invoke(',
    '.run(',
    '.start(',
    'continueExecution(',
    'retry(',
    'trigger.run(',
    'captureDiscoveredBatch(',
    'captureOffice(',
    'Date.now',
    'Math.random',
    'randomUUID',
    'process.env',
    'createDatabaseConnection',
    'initializeDatabase',
    'connection.close',
    'frontend',
    'React',
    'window',
    'document',
    'localStorage',
    'sessionStorage',
  ]

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      source.includes(pattern),
      false,
      `Expected ExecutiveMemoryRuntime.ts not to include ${pattern}.`,
    )
  }
})
