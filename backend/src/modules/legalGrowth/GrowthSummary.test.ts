import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'
import {
  buildGrowthSummary,
  createGrowthIntelligenceService,
  GROWTH_DASHBOARD_TOTAL_MS,
  GROWTH_SUMMARY_BUILD_MS,
  type GrowthSnapshot,
} from './index.js'

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

function createSnapshot(overrides: Partial<GrowthSnapshot> = {}): GrowthSnapshot {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    generatedAt: overrides.generatedAt ?? '2026-07-05T12:00:00.000Z',
    demand: overrides.demand ?? { items: [] },
    territories: overrides.territories ?? [],
    coverage: overrides.coverage ?? [],
    capacity: overrides.capacity ?? [],
    scores: overrides.scores ?? [],
    recommendations: overrides.recommendations ?? [],
    opportunities: overrides.opportunities ?? [],
    landingCandidates: overrides.landingCandidates ?? [],
    metadata: overrides.metadata ?? {
      deterministic: true,
      foundationVersion: 'g7.0',
      evidence: [],
    },
  }
}

test('growth summary is empty for an empty snapshot', () => {
  const summary = buildGrowthSummary(createSnapshot())

  assert.deepEqual(summary, {
    totalDemand: 0,
    totalTerritories: 0,
    totalCoverageGaps: 0,
    overloadedProfessionals: 0,
    constrainedProfessionals: 0,
    expansionOpportunities: 0,
    landingCandidates: 0,
    eligibleLandingCandidates: 0,
    recommendations: 0,
    criticalRecommendations: 0,
    averageGrowthScore: null,
    highestPriority: null,
    generatedAt: '2026-07-05T12:00:00.000Z',
  })
})

test('growth summary sums totalDemand correctly', () => {
  const summary = buildGrowthSummary(createSnapshot({
    demand: {
      items: [
        {
          id: 'd1',
          officeId: 'office-1',
          tenantId: 11,
          period: {
            label: '2026-07',
            startsAt: '2026-07-01T00:00:00.000Z',
            endsAt: '2026-07-31T23:59:59.999Z',
            granularity: 'month',
          },
          city: 'Belo Horizonte',
          specialty: 'Direito Civil',
          origin: 'public_triage',
          casesCount: 3,
          leadsCount: 3,
          conversionRate: 1,
          backlogCount: 2,
          averageResolutionHours: null,
          slaRiskScore: 20,
          score: 3,
          trend: 'up',
          evidenceIds: [],
        },
        {
          id: 'd2',
          officeId: 'office-1',
          tenantId: 11,
          period: {
            label: '2026-07',
            startsAt: '2026-07-01T00:00:00.000Z',
            endsAt: '2026-07-31T23:59:59.999Z',
            granularity: 'month',
          },
          city: 'Contagem',
          specialty: 'Direito Trabalhista',
          origin: 'referral',
          casesCount: 4,
          leadsCount: 5,
          conversionRate: 0.8,
          backlogCount: 2,
          averageResolutionHours: 12,
          slaRiskScore: 10,
          score: 4,
          trend: 'stable',
          evidenceIds: [],
        },
      ],
    },
  }))

  assert.equal(summary.totalDemand, 7)
})

test('growth summary counts coverage gaps and overloaded constrained professionals', () => {
  const summary = buildGrowthSummary(createSnapshot({
    coverage: [
      {
        id: 'c1',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Belo Horizonte',
        specialty: 'Direito Civil',
        status: 'partial',
        professionalsCount: 1,
        activeProfessionalsCount: 1,
        compatibleProfessionalsCount: 0,
        capacityStatus: 'constrained',
        capacityScore: 25,
        gapType: 'specialty_uncovered',
        evidenceIds: [],
      },
      {
        id: 'c2',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Betim',
        specialty: 'Direito Civil',
        status: 'covered',
        professionalsCount: 1,
        activeProfessionalsCount: 1,
        compatibleProfessionalsCount: 1,
        capacityStatus: 'balanced',
        capacityScore: 50,
        gapType: 'none',
        evidenceIds: [],
      },
      {
        id: 'c3',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Sabara',
        specialty: 'Direito Civil',
        status: 'unknown',
        professionalsCount: 0,
        activeProfessionalsCount: 0,
        compatibleProfessionalsCount: 0,
        capacityStatus: 'unknown',
        capacityScore: 0,
        gapType: 'unknown',
        evidenceIds: [],
      },
    ],
    capacity: [
      {
        id: 'p1',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        professionalId: 'prof-1',
        workloadCount: 9,
        backlogCount: 9,
        openCasesCount: 9,
        closedCasesCount: 0,
        averageResolutionHours: null,
        capacityScore: 10,
        capacityStatus: 'overloaded',
        recommendation: 'contratar',
        evidenceIds: [],
      },
      {
        id: 'p2',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        professionalId: 'prof-2',
        workloadCount: 6,
        backlogCount: 6,
        openCasesCount: 6,
        closedCasesCount: 0,
        averageResolutionHours: null,
        capacityScore: 40,
        capacityStatus: 'constrained',
        recommendation: 'reduzir_demanda',
        evidenceIds: [],
      },
    ],
  }))

  assert.equal(summary.totalCoverageGaps, 1)
  assert.equal(summary.overloadedProfessionals, 1)
  assert.equal(summary.constrainedProfessionals, 1)
})

test('growth summary calculates averageGrowthScore and highestPriority', () => {
  const summary = buildGrowthSummary(createSnapshot({
    scores: [
      {
        id: 's1',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Belo Horizonte',
        specialty: 'Direito Civil',
        value: 71,
        demandScore: 80,
        coverageScore: 60,
        capacityScore: 70,
        slaScore: 80,
        trendScore: 60,
        priority: 'high',
        confidence: 'high',
        evidenceIds: [],
      },
      {
        id: 's2',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Contagem',
        specialty: 'Direito Trabalhista',
        value: 80,
        demandScore: 100,
        coverageScore: 60,
        capacityScore: 70,
        slaScore: 90,
        trendScore: 60,
        priority: 'critical',
        confidence: 'medium',
        evidenceIds: [],
      },
    ],
    recommendations: [
      {
        id: 'r1',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        type: 'monitor',
        priority: 'medium',
        confidence: 'low',
        title: 'Monitorar',
        description: 'Monitorar demanda',
        expectedImpact: 'baixo',
        evidenceIds: [],
      },
      {
        id: 'r2',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        type: 'expand_city',
        priority: 'critical',
        confidence: 'high',
        city: 'Contagem',
        title: 'Expandir',
        description: 'Expandir cidade',
        expectedImpact: 'alto',
        evidenceIds: [],
      },
    ],
    opportunities: [
      {
        id: 'o1',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        type: 'abrir_landing_page',
        score: 80,
        priority: 'high',
        confidence: 'high',
        city: 'Contagem',
        specialty: 'Direito Trabalhista',
        expectedImpact: 'alto',
        justification: 'justificado',
        requiredActions: [],
        evidenceIds: [],
      },
    ],
    landingCandidates: [
      {
        id: 'l1',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Contagem',
        specialty: 'Direito Trabalhista',
        growthScore: 80,
        seoScore: 80,
        priority: 'high',
        confidence: 'high',
        eligible: true,
        reason: 'oportunidade_explicita_de_landing',
        evidenceIds: [],
      },
      {
        id: 'l2',
        officeId: 'office-1',
        tenantId: 11,
        period: {
          label: '2026-07',
          startsAt: '2026-07-01T00:00:00.000Z',
          endsAt: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        city: 'Betim',
        specialty: 'Direito Civil',
        growthScore: 60,
        seoScore: 40,
        priority: 'medium',
        confidence: 'medium',
        eligible: false,
        reason: 'score_abaixo_do_limiar',
        evidenceIds: [],
      },
    ],
  }))

  assert.equal(summary.averageGrowthScore, 76)
  assert.equal(summary.highestPriority, 'critical')
  assert.equal(summary.recommendations, 2)
  assert.equal(summary.criticalRecommendations, 1)
  assert.equal(summary.expansionOpportunities, 1)
  assert.equal(summary.landingCandidates, 2)
  assert.equal(summary.eligibleLandingCandidates, 1)
})

test('growth intelligence service includes summary derived from snapshot', () => {
  const service = createGrowthIntelligenceService()

  const response = service.build({
    tenantId: 11,
    officeId: 'office-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
    cases: [],
    professionals: [],
    entityProfile: null,
  })

  assert.deepEqual(response.summary, buildGrowthSummary(response.snapshot))
  assert.equal(response.summary.generatedAt, response.generatedAt)
})

test('growth intelligence service records summary and dashboard total timing', () => {
  const observability = createObservabilityService()
  const service = createGrowthIntelligenceService({ observability })

  service.build({
    tenantId: 11,
    officeId: 'office-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
    cases: [],
    professionals: [],
    entityProfile: null,
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, GROWTH_SUMMARY_BUILD_MS), 1)
  assert.equal(timingCount(snapshot, GROWTH_DASHBOARD_TOTAL_MS), 1)
})

test('growth summary implementation does not import legacy growth or market signals modules', async () => {
  const source = await readFile(
    path.resolve('src/modules/legalGrowth/GrowthSummary.ts'),
    'utf-8',
  )

  assert.equal(source.includes('modules/growth'), false)
  assert.equal(source.includes('market-signals'), false)
})
