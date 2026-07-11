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
  ExecutiveMemoryCaptureExecutionService,
  ExecutiveMemoryCaptureOrchestrator,
  ExecutiveMemoryCaptureTriggerService,
  ExecutiveMemoryOfficeDiscoveryService,
  ExecutiveMetrics,
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

  const firstExecution = runtime.createExecutionService({
    nextCaptureCycleId() {
      cycleIdCalls += 1
      return 'cycle-1'
    },
  })
  const secondExecution = runtime.createExecutionService({
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

  const execution = runtime.createExecution()

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

  const first = runtime.createExecution()
  const second = runtime.createExecution()

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
  const execution = runtime.createExecution()

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

    const page = await runtime.officeDiscoveryService.listEligibleOffices()
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

test('two runtime compositions create independent service instances', () => {
  const first = createExecutiveMemoryRuntime(createDependencies())
  const second = createExecutiveMemoryRuntime(createDependencies())

  assert.notEqual(first.officeDiscoveryService, second.officeDiscoveryService)
  assert.notEqual(first.atomicCaptureService, second.atomicCaptureService)
  assert.notEqual(first.orchestrator, second.orchestrator)
  assert.notEqual(first.triggerService, second.triggerService)
  assert.notEqual(first.metrics, second.metrics)
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
