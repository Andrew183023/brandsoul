import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { TERRITORY_PROJECTION_MS } from '../GrowthMetrics.js'
import type { GrowthContext } from '../GrowthContext.js'
import type { GrowthProfessionalContext } from '../index.js'
import type { DemandProjection } from '../demand/DemandProjection.js'
import { buildTerritoryProjections, createTerritoryEngine } from './TerritoryEngine.js'

function createDemandProjection(items: DemandProjection['items']): DemandProjection {
  return { items }
}

function createProfessionals(items: GrowthProfessionalContext[]): GrowthProfessionalContext[] {
  return items
}

function createContext(overrides: Partial<GrowthContext> = {}): GrowthContext {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    now: overrides.now ?? '2026-07-31T23:59:59.999Z',
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: overrides.cases,
    professionals: overrides.professionals,
    entityProfile: overrides.entityProfile,
  }
}

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

test('territory engine creates territory projections from city demand', () => {
  const result = buildTerritoryProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        casesCount: 2,
        leadsCount: 2,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 50,
        score: 2,
        trend: 'up',
        evidenceIds: ['e1'],
      },
    ]),
  })

  assert.equal(result.projections.length, 1)
  assert.equal(result.projections[0]?.city, 'Belo Horizonte')
})

test('territory engine sums demand from multiple specialties in the same city', () => {
  const result = buildTerritoryProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        casesCount: 2,
        leadsCount: 2,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 50,
        score: 2,
        trend: 'up',
        evidenceIds: ['e1'],
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
        city: 'Belo Horizonte',
        specialty: 'Direito Trabalhista',
        origin: 'portal',
        casesCount: 1,
        leadsCount: 1,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 100,
        score: 1,
        trend: 'stable',
        evidenceIds: ['e2'],
      },
    ]),
  })

  assert.equal(result.projections[0]?.demandScore, 60)
})

test('territory engine calculates deterministic demandScore', () => {
  const result = buildTerritoryProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        city: 'Contagem',
        specialty: 'Direito Civil',
        origin: 'unknown',
        casesCount: 8,
        leadsCount: 8,
        conversionRate: 1,
        backlogCount: 4,
        averageResolutionHours: null,
        slaRiskScore: 50,
        score: 8,
        trend: 'stable',
        evidenceIds: ['e1'],
      },
    ]),
  })

  assert.equal(result.projections[0]?.demandScore, 100)
})

test('territory engine calculates coverageStatus with compatible active professional', () => {
  const result = buildTerritoryProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        casesCount: 2,
        leadsCount: 2,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 50,
        score: 2,
        trend: 'up',
        evidenceIds: ['e1'],
      },
    ]),
    professionals: createProfessionals([
      {
        id: 'prof-1',
        city: 'Belo Horizonte',
        specialties: ['Direito Civil'],
        status: 'active',
      },
    ]),
  })

  assert.equal(result.projections[0]?.coverageStatus, 'covered')
  assert.equal(result.projections[0]?.coverageScore, 100)
})

test('territory engine returns unknown when there are no professionals', () => {
  const result = buildTerritoryProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        city: 'Betim',
        specialty: 'Direito Civil',
        origin: 'unknown',
        casesCount: 1,
        leadsCount: 1,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 100,
        score: 1,
        trend: 'unknown',
        evidenceIds: ['e1'],
      },
    ]),
  })

  assert.equal(result.projections[0]?.coverageStatus, 'unknown')
})

test('territory engine generates evidence ids and auditable evidence', () => {
  const result = buildTerritoryProjections({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        city: 'Betim',
        specialty: 'Direito Civil',
        origin: 'unknown',
        casesCount: 1,
        leadsCount: 1,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 100,
        score: 1,
        trend: 'unknown',
        evidenceIds: ['e1'],
      },
    ]),
  })

  assert.equal(result.projections[0]?.evidenceIds.length, 2)
  assert.equal(result.evidence[0]?.type, 'territory_signal')
  assert.equal(result.evidence[0]?.source, 'legal_growth')
})

test('pipeline includes territories after demand', () => {
  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext({
    cases: [
      {
        id: 'case-1',
        tenantId: 11,
        entityId: 'office-1',
        title: 'Case',
        status: 'open',
        priority: 'normal',
        practiceArea: 'Direito Civil',
        source: 'public_triage',
        openedAt: '2026-07-05T08:00:00.000Z',
        clientCanonicalCity: 'Belo Horizonte',
        centelhaContext: {},
        metadata: {},
        createdAt: '2026-07-05T08:00:00.000Z',
        updatedAt: '2026-07-05T09:00:00.000Z',
      },
    ],
    professionals: createProfessionals([
      {
        id: 'prof-1',
        city: 'Belo Horizonte',
        specialties: ['Direito Civil'],
        status: 'active',
      },
    ]),
  }))

  assert.equal(snapshot.territories.length, 1)
  assert.equal(snapshot.metadata.evidence.length >= 4, true)
})

test('without demand territories remain empty', () => {
  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext({ cases: [] }))
  assert.deepEqual(snapshot.territories, [])
})

test('territory engine does not import modules/growth or market-signals', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/territory/TerritoryEngine.ts')
  const source = await readFile(filePath, 'utf-8')
  assert.equal(source.includes('modules/growth'), false)
  assert.equal(source.includes('market-signals'), false)
})

test('territory engine records timing when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createTerritoryEngine(observability)

  engine.build({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    demand: createDemandProjection([
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
        casesCount: 1,
        leadsCount: 1,
        conversionRate: 1,
        backlogCount: 1,
        averageResolutionHours: null,
        slaRiskScore: 100,
        score: 1,
        trend: 'up',
        evidenceIds: ['e1'],
      },
    ]),
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, TERRITORY_PROJECTION_MS), 1)
})
