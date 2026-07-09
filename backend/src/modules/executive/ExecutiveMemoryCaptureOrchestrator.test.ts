import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryCaptureOrchestrator,
  createExecutiveMemoryCaptureOrchestrator,
} from './ExecutiveMemoryCaptureOrchestrator.js'

function createOfficeHealth() {
  return {
    score: 82,
    level: 'good' as const,
    explanation: 'Office health is stable.',
    positives: [],
    warnings: [],
    opportunities: [],
    drivers: [],
  }
}

function createDecisionCenter() {
  return {
    decisions: [
      {
        id: 'decision:expand',
        type: 'expand' as const,
        title: 'Expandir',
        priority: 'high' as const,
        impact: 'high' as const,
        confidence: 88,
        explanation: 'Expandir com segurança.',
        evidence: [],
        recommendedActions: ['Priorizar expansão.'],
        blockingFactors: [],
      },
    ],
  }
}

function createExecutiveTimeline() {
  return {
    items: [
      {
        id: 'executive_timeline:growth:expansion',
        category: 'growth' as const,
        importance: 'high' as const,
        temporalKind: 'observed' as const,
        title: 'Expansão observada',
        summary: 'Existe oportunidade observada.',
        evidence: [
          {
            key: 'growth_opportunities',
            description: 'Oportunidades preservadas.',
            value: 0,
          },
        ],
        source: 'growth' as const,
        sourceKey: 'expansion',
      },
    ],
    totalDetected: 1,
    totalPublished: 1,
    generatedAt: '2026-07-08T10:00:00.000Z',
  }
}

function createGrowth() {
  return {
    status: 'ready' as const,
    officeId: 'office-1',
    tenantId: 7,
    generatedAt: '2026-07-08T11:00:00.000Z',
    summary: {
      expansionOpportunities: 2,
      averageGrowthScore: 81,
      eligibleLandingCandidates: 1,
      totalCoverageGaps: 0,
    },
    snapshot: {},
    compatibility: {
      professionalsIncluded: true,
      entityProfileIncluded: true,
      landingCandidatesPreparedOnly: true as const,
    },
  }
}

function createOperational() {
  return {
    status: 'ready' as const,
    officeId: 'office-1',
    tenantId: 7,
    generatedAt: '2026-07-08T11:00:00.000Z',
    snapshot: {
      openCases: 4,
      activeProfessionals: 2,
      backlog: 5,
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
      firstResponseMinutesDerived: false,
      slaStatusDerived: false,
      waitingForDerived: false,
      archivedCasesExcluded: true as const,
    },
  }
}

function createDependencies() {
  const calls: string[] = []
  const cases = [{ id: 'case-1' }]
  const professionals = [{
    id: 'professional-1',
    officeId: 'office-1',
    city: 'Sao Paulo',
    status: 'active' as const,
    specialties: ['civil'],
  }]
  const entity = {
    entityProfile: {
      metadata: {
        businessConfig: {
          businessType: 'legal',
          officeName: 'Rocha Lima Advocacia',
        },
      },
    },
  }
  const growth = createGrowth()
  const operational = createOperational()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenter()
  const executiveTimeline = createExecutiveTimeline()
  const captureResult = {
    created: true,
    snapshotId: 'executive_memory_snapshot:7:office-1:fingerprint',
    tenantId: 7,
    officeId: 'office-1',
    projectionVersion: 1,
    capturedAt: '2026-07-08T11:00:00.000Z',
    contentFingerprint: 'fingerprint',
    sourceFingerprint: 'source-fingerprint',
  }

  return {
    calls,
    cases,
    professionals,
    entity,
    growth,
    operational,
    officeHealth,
    decisionCenter,
    executiveTimeline,
    captureResult,
    dependencies: {
      entityRepository: {
        async getEntityById(officeId: string) {
          calls.push(`entity:${officeId}`)
          return entity
        },
      },
      caseRepository: {
        async listCasesByEntity(tenantId: number, officeId: string) {
          calls.push(`cases:${tenantId}:${officeId}`)
          return cases
        },
      },
      officeProfessionalService: {
        async listOfficeProfessionals(tenantId: number, officeId: string) {
          calls.push(`professionals:${tenantId}:${officeId}`)
          return professionals
        },
      },
      growthIntelligenceService: {
        build(input: unknown) {
          calls.push('growth')
          return growth
        },
      },
      operationalIntelligenceService: {
        build(input: unknown) {
          calls.push('operational')
          return operational
        },
      },
      officeHealthEngine: {
        build(input: unknown) {
          calls.push('officeHealth')
          return officeHealth
        },
      },
      decisionCenterEngine: {
        build(input: unknown) {
          calls.push('decisionCenter')
          return decisionCenter
        },
      },
      executiveTimelineEngine: {
        build(input: unknown) {
          calls.push('timeline')
          return executiveTimeline
        },
      },
      memoryCaptureService: {
        async capture(input: unknown) {
          calls.push('capture')
          return captureResult
        },
      },
      officeDiscoveryService: {
        async listEligibleOffices() {
          calls.push('discovery')
          return {
            items: [
              { tenantId: 7, officeId: 'office-1' },
              { tenantId: 8, officeId: 'office-2' },
            ],
            nextCursor: 'office-2',
          }
        },
      },
    },
  }
}

test('captureOffice loads canonical data once and captures executive memory once', async () => {
  const harness = createDependencies()
  const growthInputs: Array<Record<string, unknown>> = []
  const operationalInputs: Array<Record<string, unknown>> = []
  const officeHealthInputs: Array<Record<string, unknown>> = []
  const decisionInputs: Array<Record<string, unknown>> = []
  const timelineInputs: Array<Record<string, unknown>> = []
  const captureInputs: Array<Record<string, unknown>> = []

  const orchestrator = createExecutiveMemoryCaptureOrchestrator({
    ...harness.dependencies,
    growthIntelligenceService: {
      build(input) {
        growthInputs.push(input as Record<string, unknown>)
        harness.calls.push('growth')
        return harness.growth
      },
    },
    operationalIntelligenceService: {
      build(input) {
        operationalInputs.push(input as Record<string, unknown>)
        harness.calls.push('operational')
        return harness.operational
      },
    },
    officeHealthEngine: {
      build(input) {
        officeHealthInputs.push(input as Record<string, unknown>)
        harness.calls.push('officeHealth')
        return harness.officeHealth
      },
    },
    decisionCenterEngine: {
      build(input) {
        decisionInputs.push(input as Record<string, unknown>)
        harness.calls.push('decisionCenter')
        return harness.decisionCenter
      },
    },
    executiveTimelineEngine: {
      build(input) {
        timelineInputs.push(input as Record<string, unknown>)
        harness.calls.push('timeline')
        return harness.executiveTimeline
      },
    },
    memoryCaptureService: {
      async capture(input) {
        captureInputs.push(input as Record<string, unknown>)
        harness.calls.push('capture')
        return harness.captureResult
      },
    },
  })

  const result = await orchestrator.captureOffice({
    tenantId: 7,
    officeId: 'office-1',
    capturedAt: '2026-07-08T11:00:00.000Z',
  })

  assert.deepEqual(result, {
    status: 'captured',
    created: true,
    tenantId: 7,
    officeId: 'office-1',
    capturedAt: '2026-07-08T11:00:00.000Z',
    snapshotId: 'executive_memory_snapshot:7:office-1:fingerprint',
    contentFingerprint: 'fingerprint',
    sourceFingerprint: 'source-fingerprint',
  })
  assert.deepEqual(harness.calls, [
    'entity:office-1',
    'cases:7:office-1',
    'professionals:7:office-1',
    'growth',
    'operational',
    'officeHealth',
    'decisionCenter',
    'timeline',
    'capture',
  ])
  assert.deepEqual(growthInputs, [{
    tenantId: 7,
    officeId: 'office-1',
    cases: harness.cases,
    professionals: harness.professionals,
    entityProfile: harness.entity.entityProfile,
    generatedAt: '2026-07-08T11:00:00.000Z',
  }])
  assert.deepEqual(operationalInputs, [{
    tenantId: 7,
    officeId: 'office-1',
    cases: harness.cases,
    generatedAt: '2026-07-08T11:00:00.000Z',
  }])
  assert.equal(officeHealthInputs[0]?.growth, harness.growth)
  assert.equal(officeHealthInputs[0]?.operational, harness.operational)
  assert.equal(decisionInputs[0]?.officeHealth, harness.officeHealth)
  assert.equal(timelineInputs[0]?.officeHealth, harness.officeHealth)
  assert.equal(timelineInputs[0]?.decisionCenter, harness.decisionCenter)
  assert.equal(timelineInputs[0]?.generatedAt, '2026-07-08T11:00:00.000Z')
  assert.equal(captureInputs[0]?.officeHealth, harness.officeHealth)
  assert.equal(captureInputs[0]?.decisionCenter, harness.decisionCenter)
  assert.equal(captureInputs[0]?.executiveTimeline, harness.executiveTimeline)
  assert.equal(captureInputs[0]?.sourceGrowthGeneratedAt, harness.growth.generatedAt)
  assert.equal(captureInputs[0]?.sourceOperationalGeneratedAt, harness.operational.generatedAt)
  assert.equal('growth' in (captureInputs[0] ?? {}), false)
  assert.equal('operational' in (captureInputs[0] ?? {}), false)
  assert.equal('morningBrief' in (captureInputs[0] ?? {}), false)
  assert.equal('executiveFeed' in (captureInputs[0] ?? {}), false)
})

test('captureOffice preserves input object and accepts explicit capturedAt only', async () => {
  const harness = createDependencies()
  const orchestrator = createExecutiveMemoryCaptureOrchestrator(harness.dependencies)
  const input = {
    tenantId: 7,
    officeId: 'office-1',
    capturedAt: '2026-07-08T11:00:00.000Z',
  }
  const before = structuredClone(input)

  await orchestrator.captureOffice(input)

  assert.deepEqual(input, before)
})

test('captureOffice propagates entity cases growth operational executive and capture failures', async () => {
  const base = createDependencies()
  const officeInput = {
    tenantId: 7,
    officeId: 'office-1',
    capturedAt: '2026-07-08T11:00:00.000Z',
  }

  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator({
      ...base.dependencies,
      caseRepository: {
        async listCasesByEntity() {
          throw new Error('cases failed')
        },
      },
    }).captureOffice(officeInput),
    /cases failed/,
  )

  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator({
      ...base.dependencies,
      growthIntelligenceService: {
        build() {
          throw new Error('growth failed')
        },
      },
    }).captureOffice(officeInput),
    /growth failed/,
  )

  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator({
      ...base.dependencies,
      operationalIntelligenceService: {
        build() {
          throw new Error('operational failed')
        },
      },
    }).captureOffice(officeInput),
    /operational failed/,
  )

  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator({
      ...base.dependencies,
      officeHealthEngine: {
        build() {
          throw new Error('executive failed')
        },
      },
    }).captureOffice(officeInput),
    /executive failed/,
  )

  let captureCalled = false
  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator({
      ...base.dependencies,
      officeHealthEngine: {
        build() {
          throw new Error('executive failed')
        },
      },
      memoryCaptureService: {
        async capture() {
          captureCalled = true
          return base.captureResult
        },
      },
    }).captureOffice(officeInput),
    /executive failed/,
  )
  assert.equal(captureCalled, false)

  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator({
      ...base.dependencies,
      memoryCaptureService: {
        async capture() {
          throw new Error('capture failed')
        },
      },
    }).captureOffice(officeInput),
    /capture failed/,
  )
})

test('captureOffice uses null entityProfile when entity is absent', async () => {
  const harness = createDependencies()
  const growthInputs: Array<Record<string, unknown>> = []
  const orchestrator = createExecutiveMemoryCaptureOrchestrator({
    ...harness.dependencies,
    entityRepository: {
      async getEntityById() {
        return null
      },
    },
    growthIntelligenceService: {
      build(input) {
        growthInputs.push(input as Record<string, unknown>)
        return harness.growth
      },
    },
  })

  await orchestrator.captureOffice({
    tenantId: 7,
    officeId: 'office-1',
    capturedAt: '2026-07-08T11:00:00.000Z',
  })

  assert.equal(growthInputs[0]?.entityProfile, null)
})

test('captureOffice rejects blank officeId and capturedAt', async () => {
  const harness = createDependencies()
  const orchestrator = createExecutiveMemoryCaptureOrchestrator(harness.dependencies)

  await assert.rejects(
    orchestrator.captureOffice({
      tenantId: 7,
      officeId: '   ',
      capturedAt: '2026-07-08T11:00:00.000Z',
    }),
    /officeId/,
  )

  await assert.rejects(
    orchestrator.captureOffice({
      tenantId: 7,
      officeId: 'office-1',
      capturedAt: '   ',
    }),
    /capturedAt/,
  )
})

test('captureDiscoveredBatch processes offices sequentially preserves order cursor and totals', async () => {
  const harness = createDependencies()
  const processed: string[] = []
  const orchestrator = createExecutiveMemoryCaptureOrchestrator({
    ...harness.dependencies,
    memoryCaptureService: {
      async capture(input) {
        const captureInput = input as { officeId: string; tenantId: number; capturedAt: string }
        processed.push(`${captureInput.tenantId}:${captureInput.officeId}:${captureInput.capturedAt}`)
        return {
          ...harness.captureResult,
          tenantId: captureInput.tenantId,
          officeId: captureInput.officeId,
          snapshotId: `snapshot:${captureInput.officeId}`,
          contentFingerprint: `content:${captureInput.officeId}`,
          sourceFingerprint: `source:${captureInput.officeId}`,
          created: captureInput.officeId === 'office-1',
        }
      },
    },
  })

  const result = await orchestrator.captureDiscoveredBatch({
    limit: 2,
    cursor: 'office-0',
    capturedAt: '2026-07-08T11:00:00.000Z',
  })

  assert.deepEqual(processed, [
    '7:office-1:2026-07-08T11:00:00.000Z',
    '8:office-2:2026-07-08T11:00:00.000Z',
  ])
  assert.deepEqual(result, {
    items: [
      {
        tenantId: 7,
        officeId: 'office-1',
        status: 'captured',
        created: true,
        snapshotId: 'snapshot:office-1',
        contentFingerprint: 'content:office-1',
        sourceFingerprint: 'source:office-1',
      },
      {
        tenantId: 8,
        officeId: 'office-2',
        status: 'captured',
        created: false,
        snapshotId: 'snapshot:office-2',
        contentFingerprint: 'content:office-2',
        sourceFingerprint: 'source:office-2',
      },
    ],
    nextCursor: 'office-2',
    totals: {
      processed: 2,
      captured: 2,
      created: 1,
      failed: 0,
    },
  })
})

test('captureDiscoveredBatch continues on item error and sanitizes error payloads', async () => {
  const harness = createDependencies()
  const orchestrator = createExecutiveMemoryCaptureOrchestrator({
    ...harness.dependencies,
    memoryCaptureService: {
      async capture(input) {
        const officeId = (input as { officeId: string }).officeId
        if (officeId === 'office-2') {
          throw new Error('sensitive internal payload')
        }

        return harness.captureResult
      },
    },
  })

  const result = await orchestrator.captureDiscoveredBatch({
    capturedAt: '2026-07-08T11:00:00.000Z',
  })

  assert.deepEqual(result, {
    items: [
      {
        tenantId: 7,
        officeId: 'office-1',
        status: 'captured',
        created: true,
        snapshotId: 'executive_memory_snapshot:7:office-1:fingerprint',
        contentFingerprint: 'fingerprint',
        sourceFingerprint: 'source-fingerprint',
      },
      {
        tenantId: 8,
        officeId: 'office-2',
        status: 'error',
        error: 'Executive memory capture failed.',
      },
    ],
    nextCursor: 'office-2',
    totals: {
      processed: 2,
      captured: 1,
      created: 1,
      failed: 1,
    },
  })
  assert.equal(JSON.stringify(result).includes('sensitive internal payload'), false)
})

test('captureDiscoveredBatch requires officeDiscoveryService and capturedAt', async () => {
  const harness = createDependencies()
  const withoutDiscovery = createExecutiveMemoryCaptureOrchestrator({
    ...harness.dependencies,
    officeDiscoveryService: undefined,
  })

  await assert.rejects(
    withoutDiscovery.captureDiscoveredBatch({
      capturedAt: '2026-07-08T11:00:00.000Z',
    }),
    /officeDiscoveryService/,
  )

  await assert.rejects(
    createExecutiveMemoryCaptureOrchestrator(harness.dependencies).captureDiscoveredBatch({
      capturedAt: '   ',
    }),
    /capturedAt/,
  )
})

test('factory creates orchestrator instance', () => {
  const harness = createDependencies()
  const orchestrator = createExecutiveMemoryCaptureOrchestrator(harness.dependencies)

  assert.equal(orchestrator instanceof ExecutiveMemoryCaptureOrchestrator, true)
})

test('module remains structurally isolated from forbidden dependencies', async () => {
  const source = await readFile(
    path.resolve('backend/src/modules/executive/ExecutiveMemoryCaptureOrchestrator.ts'),
    'utf8',
  )

  assert.equal(
    /Date\.now|new Date|performance\.now|Math\.random|crypto\.randomUUID|uuid|fetch|axios|fastify|react|window|document|localStorage|sessionStorage|createDatabaseConnection|initializeDatabase|executiveDashboardRoutes|brandsoul-frontend|\bany\b/i.test(source),
    false,
  )
  assert.equal(source.includes('ExecutiveDashboardApplicationService'), false)
  assert.equal(source.includes('ExecutiveDashboardService'), false)
  assert.equal(source.includes('userId'), false)
  assert.equal(source.includes('request'), false)
})
