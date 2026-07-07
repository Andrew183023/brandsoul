import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import type { GrowthIntelligenceResponse } from '../legalGrowth/growthIntelligenceService.js'
import type { OperationalIntelligenceResponse } from '../legalSignals/operationalIntelligenceService.js'
import type { DecisionCenterResult } from './DecisionCenterTypes.js'
import type { ExecutiveFeed } from './ExecutiveFeedTypes.js'
import {
  DECISION_CENTER_BUILD_MS,
  EXECUTIVE_FEED_BUILD_MS,
  EXECUTIVE_FEED_GENERATED_TOTAL,
  OFFICE_HEALTH_BUILD_MS,
} from './ExecutiveMetrics.js'
import type { MorningBrief } from './MorningBriefTypes.js'
import type { OfficeHealth } from './OfficeHealthTypes.js'
import {
  createExecutiveDashboardService,
  mapExecutiveDashboard,
} from './index.js'

function timingCount(
  snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>,
  metricName: string,
) {
  return Object.keys(snapshot.customTimings).filter((key) => key.startsWith(`${metricName}{`)).length
}

function createGrowthIntelligenceResponse(): GrowthIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-05T15:00:00.000Z',
    summary: {
      totalDemand: 5,
      totalTerritories: 2,
      totalCoverageGaps: 1,
      overloadedProfessionals: 0,
      constrainedProfessionals: 1,
      expansionOpportunities: 1,
      landingCandidates: 1,
      eligibleLandingCandidates: 1,
      recommendations: 2,
      criticalRecommendations: 1,
      averageGrowthScore: 72,
      highestPriority: 'high',
      generatedAt: '2026-07-05T15:00:00.000Z',
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
      generatedAt: '2026-07-05T15:00:00.000Z',
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

function createOperationalIntelligenceResponse(): OperationalIntelligenceResponse {
  return {
    status: 'ready',
    officeId: 'office-1',
    tenantId: 11,
    generatedAt: '2026-07-05T15:00:00.000Z',
    snapshot: {
      tenantId: 11,
      entityId: 'office-1',
      builtAt: '2026-07-05T15:00:00.000Z',
      openCases: 3,
      closedCases: 2,
      backlog: 3,
      activeProfessionals: 2,
      averageResolutionHours: 18,
      averageFirstResponseMinutes: null,
      slaWarningCases: 0,
      slaBreachedCases: 0,
      casesPerProfessional: {
        'prof-1': 2,
      },
      casesPerPracticeArea: {
        civil: 3,
      },
      casesPerCity: {
        'Belo Horizonte': 5,
      },
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

function createOfficeHealth(): OfficeHealth {
  return {
    score: 84,
    level: 'good',
    explanation: 'O escritorio apresenta boa saude executiva.',
    positives: [
      {
        key: 'backlog_healthy',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece compativel com a capacidade operacional.',
      },
    ],
    warnings: [],
    opportunities: [
      {
        key: 'expansion_opportunities',
        title: 'Oportunidades de expansao identificadas',
        impact: 'positive',
        weight: 5,
        summary: 'Existem oportunidades concretas de expansao.',
      },
    ],
    drivers: [
      {
        key: 'backlog_healthy',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece compativel com a capacidade operacional.',
      },
      {
        key: 'expansion_opportunities',
        title: 'Oportunidades de expansao identificadas',
        impact: 'positive',
        weight: 5,
        summary: 'Existem oportunidades concretas de expansao.',
      },
    ],
  }
}

function createDecisionCenterResult(): DecisionCenterResult {
  return {
    decisions: [
      {
        id: 'decision-expand',
        type: 'expand',
        title: 'Expandir com controle operacional',
        priority: 'high',
        impact: 'high',
        confidence: 82,
        explanation: 'Existem oportunidades de crescimento e saude suficiente para expandir.',
        evidence: [
          {
            key: 'expansion_opportunities',
            label: 'Oportunidades de expansao',
            value: 1,
            summary: 'Existe uma oportunidade valida de expansao.',
          },
        ],
        recommendedActions: [
          'Priorizar a oportunidade de maior aderencia.',
        ],
        blockingFactors: [],
      },
    ],
  }
}

function createMorningBrief(): MorningBrief {
  return {
    title: 'Seu escritorio esta saudavel hoje.',
    tone: 'positive',
    summary: 'O escritorio esta saudavel e a principal prioridade hoje e expandir com controle operacional. Nao ha sinais criticos de SLA.',
    topPriority: 'Expandir com controle operacional',
    items: [
      {
        key: 'health_score',
        label: 'Score de saude',
        value: 84,
        summary: 'O escritorio inicia o dia com score de saude 84.',
      },
    ],
    generatedAt: '2026-07-05T15:00:00.000Z',
  }
}

function createExecutiveFeed(): ExecutiveFeed {
  return {
    items: [
      {
        id: 'feed:growth:expansion_opportunities',
        category: 'growth',
        severity: 'opportunity',
        title: 'Existem oportunidades de expansao em aberto',
        summary: 'A inteligencia de crescimento identificou oportunidades de expansao para o escritorio.',
        evidence: [
          {
            key: 'expansion_opportunities',
            label: 'Oportunidades de expansao',
            value: 1,
            summary: 'Existe uma oportunidade de expansao identificada.',
          },
        ],
        suggestedAction: 'Revisar as oportunidades identificadas e priorizar a de maior aderencia.',
        source: 'growth',
        sourceKey: 'expansion_opportunities',
      },
    ],
    totalDetected: 1,
    totalPublished: 1,
    generatedAt: '2026-07-05T15:00:00.000Z',
  }
}

test('executive dashboard service composes the DTO with officeHealth decisionCenter morningBrief and executiveFeed and calls all engines once', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()
  const morningBrief = createMorningBrief()
  const executiveFeed = createExecutiveFeed()
  let officeHealthCallCount = 0
  let decisionCenterCallCount = 0
  let morningBriefCallCount = 0
  let executiveFeedCallCount = 0
  const executionOrder: string[] = []
  const service = createExecutiveDashboardService({
    officeHealthEngine: {
      build(input) {
        executionOrder.push('health')
        officeHealthCallCount += 1
        assert.equal(input.growth, growth)
        assert.equal(input.operational, operational)
        return officeHealth
      },
    },
    decisionCenterEngine: {
      build(input) {
        executionOrder.push('decision')
        decisionCenterCallCount += 1
        assert.equal(input.growth, growth)
        assert.equal(input.operational, operational)
        assert.equal(input.officeHealth, officeHealth)
        return decisionCenter
      },
    },
    morningBriefEngine: {
      build(input) {
        executionOrder.push('brief')
        morningBriefCallCount += 1
        assert.equal(input.growth, growth)
        assert.equal(input.operational, operational)
        assert.equal(input.officeHealth, officeHealth)
        assert.equal(input.decisionCenter, decisionCenter)
        return morningBrief
      },
    },
    executiveFeedEngine: {
      build(input) {
        executionOrder.push('feed')
        executiveFeedCallCount += 1
        assert.equal(input.growth, growth)
        assert.equal(input.operational, operational)
        assert.equal(input.officeHealth, officeHealth)
        assert.equal(input.decisionCenter, decisionCenter)
        return executiveFeed
      },
    },
  })

  const dashboard = service.build({
    growth,
    operational,
  })

  assert.deepEqual(dashboard, {
    generatedAt: '2026-07-05T15:00:00.000Z',
    officeState: {
      officeId: 'office-1',
      tenantId: 11,
      growthStatus: 'ready',
      operationalStatus: 'ready',
    },
    morningBrief,
    officeHealth,
    decisionCenter,
    executiveFeed,
    growth,
    operational,
  })
  assert.equal(officeHealthCallCount, 1)
  assert.equal(decisionCenterCallCount, 1)
  assert.equal(morningBriefCallCount, 1)
  assert.equal(executiveFeedCallCount, 1)
  assert.deepEqual(executionOrder, ['health', 'decision', 'brief', 'feed'])
  assert.equal(dashboard.morningBrief, morningBrief)
  assert.equal(dashboard.officeHealth, officeHealth)
  assert.equal(dashboard.decisionCenter, decisionCenter)
  assert.equal(dashboard.executiveFeed, executiveFeed)
  assert.equal(dashboard.growth, growth)
  assert.equal(dashboard.operational, operational)
})

test('executive dashboard service is deterministic for identical inputs', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()
  const morningBrief = createMorningBrief()
  const executiveFeed = createExecutiveFeed()
  const service = createExecutiveDashboardService({
    officeHealthEngine: {
      build() {
        return officeHealth
      },
    },
    decisionCenterEngine: {
      build() {
        return decisionCenter
      },
    },
    morningBriefEngine: {
      build() {
        return morningBrief
      },
    },
    executiveFeedEngine: {
      build() {
        return executiveFeed
      },
    },
  })

  const first = service.build({ growth, operational })
  const second = service.build({ growth, operational })

  assert.deepEqual(first, second)
})

test('executive dashboard service does not mutate received payloads', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()
  const morningBrief = createMorningBrief()
  const executiveFeed = createExecutiveFeed()
  const service = createExecutiveDashboardService({
    officeHealthEngine: {
      build() {
        return officeHealth
      },
    },
    decisionCenterEngine: {
      build() {
        return decisionCenter
      },
    },
    morningBriefEngine: {
      build() {
        return morningBrief
      },
    },
    executiveFeedEngine: {
      build() {
        return executiveFeed
      },
    },
  })
  const growthBefore = structuredClone(growth)
  const operationalBefore = structuredClone(operational)

  void service.build({ growth, operational })

  assert.deepEqual(growth, growthBefore)
  assert.deepEqual(operational, operationalBefore)
})

test('executive dashboard service records executive timings and feed totals without leaking PII labels', () => {
  const observability = createObservabilityService()
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()
  const morningBrief = createMorningBrief()
  const executiveFeed = createExecutiveFeed()
  const service = createExecutiveDashboardService({
    observability,
    officeHealthEngine: {
      build() {
        return officeHealth
      },
    },
    decisionCenterEngine: {
      build() {
        return decisionCenter
      },
    },
    morningBriefEngine: {
      build() {
        return morningBrief
      },
    },
    executiveFeedEngine: {
      build() {
        return executiveFeed
      },
    },
  })

  const dashboard = service.build({ growth, operational })
  const snapshot = observability.getMetricsSnapshot()
  const serialized = JSON.stringify({
    counters: snapshot.customCounterSeries,
    timings: snapshot.customTimings,
  })

  assert.equal(dashboard.executiveFeed, executiveFeed)
  assert.equal(timingCount(snapshot, OFFICE_HEALTH_BUILD_MS), 1)
  assert.equal(timingCount(snapshot, DECISION_CENTER_BUILD_MS), 1)
  assert.equal(timingCount(snapshot, EXECUTIVE_FEED_BUILD_MS), 1)
  assert.equal(snapshot.customCounters[EXECUTIVE_FEED_GENERATED_TOTAL], executiveFeed.totalPublished)
  assert.equal(serialized.includes('officeId'), false)
  assert.equal(serialized.includes('tenantId'), false)
  assert.equal(serialized.includes('userId'), false)
  assert.equal(serialized.includes('caseId'), false)
  assert.equal(serialized.includes('requestId'), false)
  assert.equal(serialized.includes('email'), false)
  assert.equal(serialized.includes('phone'), false)
})

test('executive dashboard mapper preserves explicit generatedAt officeHealth decisionCenter morningBrief and executiveFeed references without calculating', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()
  const morningBrief = createMorningBrief()
  const executiveFeed = createExecutiveFeed()

  const dashboard = mapExecutiveDashboard({
    growth,
    operational,
    officeHealth,
    decisionCenter,
    morningBrief,
    executiveFeed,
    generatedAt: '2026-07-05T16:00:00.000Z',
  })

  assert.equal(dashboard.generatedAt, '2026-07-05T16:00:00.000Z')
  assert.equal(dashboard.morningBrief, morningBrief)
  assert.equal(dashboard.officeHealth, officeHealth)
  assert.equal(dashboard.decisionCenter, decisionCenter)
  assert.equal(dashboard.executiveFeed, executiveFeed)
  assert.equal(dashboard.growth, growth)
  assert.equal(dashboard.operational, operational)
})

test('executive dashboard mapper throws when decisionCenter is absent', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()

  assert.throws(() => mapExecutiveDashboard({
    growth,
    operational,
    officeHealth,
  }), /decisionCenter/)
})

test('executive dashboard mapper throws when morningBrief is absent', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()

  assert.throws(() => mapExecutiveDashboard({
    growth,
    operational,
    officeHealth,
    decisionCenter,
  }), /morningBrief/)
})

test('executive dashboard mapper throws when executiveFeed is absent', () => {
  const growth = createGrowthIntelligenceResponse()
  const operational = createOperationalIntelligenceResponse()
  const officeHealth = createOfficeHealth()
  const decisionCenter = createDecisionCenterResult()
  const morningBrief = createMorningBrief()

  assert.throws(() => mapExecutiveDashboard({
    growth,
    operational,
    officeHealth,
    decisionCenter,
    morningBrief,
  }), /executiveFeed/)
})

test('executive dashboard service uses performance.now and does not use Date.now for observability timing', () => {
  const source = readFileSync(
    path.resolve('src/modules/executive/ExecutiveDashboardService.ts'),
    'utf8',
  )

  assert.equal(source.includes('Date.now('), false)
  assert.equal(source.includes('performance.now('), true)
})
