import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import {
  EXECUTIVE_DASHBOARD_BUILD_MS,
  EXECUTIVE_DASHBOARD_REQUESTS_TOTAL,
} from './ExecutiveMetrics.js'
import type { ExecutiveDashboard } from './ExecutiveDashboardTypes.js'
import { createExecutiveDashboardApplicationService } from './executiveDashboardApplicationService.js'

function timingCount(
  snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>,
  metricName: string,
) {
  return Object.keys(snapshot.customTimings).filter((key) => key.startsWith(`${metricName}{`)).length
}

function createGrowthResponse(): GrowthIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T12:00:00.000Z',
    summary: {
      totalDemand: 1,
      totalTerritories: 1,
      totalCoverageGaps: 0,
      overloadedProfessionals: 0,
      constrainedProfessionals: 0,
      expansionOpportunities: 1,
      landingCandidates: 1,
      eligibleLandingCandidates: 1,
      recommendations: 1,
      criticalRecommendations: 0,
      averageGrowthScore: 82,
      highestPriority: 'high',
      generatedAt: '2026-07-06T12:00:00.000Z',
    },
    snapshot: {
      officeId: 'office-1',
      tenantId: 11,
      period: {
        label: 'all_time',
        startsAt: '1970-01-01T00:00:00.000Z',
        endsAt: '9999-12-31T23:59:59.999Z',
        granularity: 'custom',
      },
      generatedAt: '2026-07-06T12:00:00.000Z',
      demand: { items: [] },
      territories: [],
      coverage: [],
      capacity: [],
      scores: [],
      recommendations: [],
      opportunities: [],
      landingCandidates: [],
      metadata: {
        deterministic: true,
        foundationVersion: 'g7.0',
        evidence: [],
      },
    },
    compatibility: {
      professionalsIncluded: true,
      entityProfileIncluded: false,
      landingCandidatesPreparedOnly: true,
    },
  }
}

function createOperationalResponse(): OperationalIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T12:00:00.000Z',
    snapshot: {
      tenantId: 11,
      entityId: 'office-1',
      builtAt: '2026-07-06T12:00:00.000Z',
      openCases: 1,
      closedCases: 0,
      backlog: 1,
      activeProfessionals: 1,
      averageResolutionHours: null,
      averageFirstResponseMinutes: null,
      slaWarningCases: 0,
      slaBreachedCases: 0,
      casesPerProfessional: {},
      casesPerPracticeArea: {},
      casesPerCity: {},
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
      archivedCasesExcluded: true,
    },
  }
}

function createDashboard(growth: GrowthIntelligenceResponse, operational: OperationalIntelligenceResponse): ExecutiveDashboard {
  return {
    generatedAt: '2026-07-06T12:00:00.000Z',
    officeState: {
      officeId: 'office-1',
      tenantId: 11,
      growthStatus: 'ready',
      operationalStatus: 'ready',
    },
    morningBrief: {
      title: 'Seu escritorio esta saudavel hoje.',
      tone: 'positive',
      summary: 'Resumo.',
      topPriority: 'Expandir',
      items: [],
      generatedAt: '2026-07-06T12:00:00.000Z',
    },
    officeHealth: {
      score: 84,
      level: 'good',
      explanation: 'Saudavel.',
      positives: [],
      warnings: [],
      opportunities: [],
      drivers: [],
    },
    decisionCenter: { decisions: [] },
    executiveFeed: {
      items: [],
      totalDetected: 0,
      totalPublished: 0,
      generatedAt: '2026-07-06T12:00:00.000Z',
    },
    growth,
    operational,
  }
}

test('application service calls growth operational and executive dashboard services once and returns the dashboard', async () => {
  const cases = [{ id: 'case-1' }]
  const professionals = [{ id: 'prof-1', status: 'active' as const, specialties: [], officeId: 'office-1', city: 'Belo Horizonte' }]
  const growth = createGrowthResponse()
  const operational = createOperationalResponse()
  const dashboard = createDashboard(growth, operational)
  let growthCalls = 0
  let operationalCalls = 0
  let executiveCalls = 0
  const observability = createObservabilityService()

  const service = createExecutiveDashboardApplicationService({
    observability,
    caseRepository: {
      async listCasesByEntity(tenantId, officeId) {
        assert.equal(tenantId, 11)
        assert.equal(officeId, 'office-1')
        return cases
      },
    },
    officeProfessionalService: {
      async listOfficeProfessionals(tenantId, officeId) {
        assert.equal(tenantId, 11)
        assert.equal(officeId, 'office-1')
        return professionals
      },
    },
    growthIntelligenceService: {
      build(input) {
        growthCalls += 1
        assert.equal(input.tenantId, 11)
        assert.equal(input.officeId, 'office-1')
        assert.equal(input.cases, cases)
        assert.equal(input.professionals, professionals)
        assert.equal(input.generatedAt, '2026-07-06T12:00:00.000Z')
        return growth
      },
    },
    operationalIntelligenceService: {
      build(input) {
        operationalCalls += 1
        assert.equal(input.tenantId, 11)
        assert.equal(input.officeId, 'office-1')
        assert.equal(input.cases, cases)
        assert.equal(input.generatedAt, '2026-07-06T12:00:00.000Z')
        return operational
      },
    },
    executiveDashboardService: {
      build(input) {
        executiveCalls += 1
        assert.equal(input.growth, growth)
        assert.equal(input.operational, operational)
        assert.equal(input.generatedAt, '2026-07-06T12:00:00.000Z')
        return dashboard
      },
    },
  })

  const result = await service.build({
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T12:00:00.000Z',
  })

  assert.equal(growthCalls, 1)
  assert.equal(operationalCalls, 1)
  assert.equal(executiveCalls, 1)
  assert.equal(result, dashboard)

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[EXECUTIVE_DASHBOARD_REQUESTS_TOTAL], 1)
  assert.equal(timingCount(snapshot, EXECUTIVE_DASHBOARD_BUILD_MS), 1)
})

test('application service preserves inputs and propagates growth errors', async () => {
  const input = {
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-06T12:00:00.000Z',
  }
  const before = structuredClone(input)
  const observability = createObservabilityService()

  const service = createExecutiveDashboardApplicationService({
    observability,
    caseRepository: {
      async listCasesByEntity() {
        return []
      },
    },
    officeProfessionalService: {
      async listOfficeProfessionals() {
        return []
      },
    },
    growthIntelligenceService: {
      build() {
        throw new Error('growth_failure')
      },
    },
    operationalIntelligenceService: {
      build() {
        return createOperationalResponse()
      },
    },
  })

  await assert.rejects(() => service.build(input), /growth_failure/)
  assert.deepEqual(input, before)

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters[EXECUTIVE_DASHBOARD_REQUESTS_TOTAL], 1)
  assert.equal(
    Object.keys(snapshot.customCounterSeries).some((key) =>
      key.includes('executive_dashboard_requests_total{source=executive_dashboard,status=error}'),
    ),
    true,
  )
  assert.equal(
    Object.keys(snapshot.customTimings).some((key) =>
      key.includes('executive_dashboard_build_ms{source=executive_dashboard,status=error}'),
    ),
    true,
  )
})

test('application service propagates operational errors', async () => {
  const service = createExecutiveDashboardApplicationService({
    caseRepository: {
      async listCasesByEntity() {
        return []
      },
    },
    officeProfessionalService: {
      async listOfficeProfessionals() {
        return []
      },
    },
    growthIntelligenceService: {
      build() {
        return createGrowthResponse()
      },
    },
    operationalIntelligenceService: {
      build() {
        throw new Error('operational_failure')
      },
    },
  })

  await assert.rejects(() => service.build({
    officeId: 'office-1',
    tenantId: 11,
  }), /operational_failure/)
})

test('executive dashboard application service uses performance.now and does not use Date.now for observability timing', () => {
  const source = readFileSync(
    path.resolve('src/modules/executive/executiveDashboardApplicationService.ts'),
    'utf8',
  )

  assert.equal(source.includes('Date.now('), false)
  assert.equal(source.includes('performance.now('), true)
})
