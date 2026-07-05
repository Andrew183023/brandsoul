import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import type { CaseRecord } from '../../legalCases/caseTypes.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { DEMAND_PROJECTION_MS } from '../GrowthMetrics.js'
import type { GrowthContext } from '../GrowthContext.js'
import { buildDemandProjection, createDemandEngine } from './DemandEngine.js'

function createCaseRecord(overrides: Partial<CaseRecord>): CaseRecord {
  return {
    id: overrides.id ?? 'case-1',
    tenantId: overrides.tenantId ?? 11,
    entityId: overrides.entityId ?? 'office-1',
    title: overrides.title ?? 'Case',
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 'normal',
    practiceArea: overrides.practiceArea,
    source: overrides.source,
    openedAt: overrides.openedAt ?? '2026-07-05T08:00:00.000Z',
    closedAt: overrides.closedAt,
    archivedAt: overrides.archivedAt,
    resolutionReason: overrides.resolutionReason,
    leadProfessionalId: overrides.leadProfessionalId,
    clientDisplayName: overrides.clientDisplayName,
    clientCanonicalName: overrides.clientCanonicalName,
    clientDisplayPhone: overrides.clientDisplayPhone,
    clientCanonicalPhone: overrides.clientCanonicalPhone,
    clientDisplayWhatsapp: overrides.clientDisplayWhatsapp,
    clientCanonicalWhatsapp: overrides.clientCanonicalWhatsapp,
    clientDisplayEmail: overrides.clientDisplayEmail,
    clientCanonicalEmail: overrides.clientCanonicalEmail,
    clientDisplayCity: overrides.clientDisplayCity,
    clientCanonicalCity: overrides.clientCanonicalCity,
    clientSearchKey: overrides.clientSearchKey,
    centelhaContext: overrides.centelhaContext ?? {},
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? '2026-07-05T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-05T09:00:00.000Z',
  }
}

function createContext(cases: CaseRecord[]): GrowthContext {
  return {
    officeId: 'office-1',
    tenantId: 11,
    now: '2026-07-31T23:59:59.999Z',
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases,
  }
}

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

test('demand engine builds demand by city and specialty', () => {
  const result = buildDemandProjection({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: [
      createCaseRecord({
        id: 'case-bh-1',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
        source: 'public_triage',
      }),
      createCaseRecord({
        id: 'case-bh-2',
        practiceArea: 'Direito Civil',
        clientDisplayCity: 'Belo Horizonte',
        source: 'public_triage',
      }),
      createCaseRecord({
        id: 'case-contagem-1',
        practiceArea: 'Direito Trabalhista',
        clientCanonicalCity: 'Contagem',
        source: 'portal',
      }),
    ],
  })

  assert.equal(result.projection.items.length, 2)
  assert.deepEqual(
    result.projection.items.map((item) => ({
      city: item.city,
      specialty: item.specialty,
      origin: item.origin,
      casesCount: item.casesCount,
    })),
    [
      {
        city: 'Belo Horizonte',
        specialty: 'Direito Civil',
        origin: 'public_triage',
        casesCount: 2,
      },
      {
        city: 'Contagem',
        specialty: 'Direito Trabalhista',
        origin: 'portal',
        casesCount: 1,
      },
    ],
  )
})

test('demand engine calculates backlog using non-closed cases', () => {
  const result = buildDemandProjection({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: [
      createCaseRecord({
        id: 'case-open',
        status: 'open',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
      }),
      createCaseRecord({
        id: 'case-pending',
        status: 'pending',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
      }),
      createCaseRecord({
        id: 'case-closed',
        status: 'closed',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
        closedAt: '2026-07-06T08:00:00.000Z',
      }),
    ],
  })

  assert.equal(result.projection.items[0]?.backlogCount, 2)
})

test('demand engine calculates averageResolutionHours for closed cases', () => {
  const result = buildDemandProjection({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: [
      createCaseRecord({
        id: 'case-closed-1',
        status: 'closed',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
        openedAt: '2026-07-01T08:00:00.000Z',
        closedAt: '2026-07-02T08:00:00.000Z',
      }),
      createCaseRecord({
        id: 'case-closed-2',
        status: 'resolved',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
        openedAt: '2026-07-01T08:00:00.000Z',
        closedAt: '2026-07-03T08:00:00.000Z',
      }),
    ],
  })

  assert.equal(result.projection.items[0]?.averageResolutionHours, 36)
})

test('demand engine uses unknown fallback for city specialty and origin', () => {
  const result = buildDemandProjection({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: [
      createCaseRecord({
        id: 'case-unknown',
        practiceArea: undefined,
        source: undefined,
        clientCanonicalCity: undefined,
        clientDisplayCity: undefined,
        clientSearchKey: undefined,
      }),
    ],
  })

  assert.equal(result.projection.items[0]?.city, 'unknown')
  assert.equal(result.projection.items[0]?.specialty, 'unknown')
  assert.equal(result.projection.items[0]?.origin, 'unknown')
})

test('demand engine generates auditable evidence entries', () => {
  const result = buildDemandProjection({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: [
      createCaseRecord({
        id: 'case-evidence',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
      }),
    ],
  })

  assert.equal(result.evidence.length, 2)
  assert.equal(result.evidence[0]?.type, 'case_signal')
  assert.equal(result.evidence[0]?.source, 'legal_cases')
  assert.equal(typeof result.evidence[0]?.description, 'string')
  assert.equal(result.evidence[0]?.weight, 1)
})

test('growth pipeline includes demand and evidence when cases are provided', () => {
  const pipeline = createGrowthPipeline()

  const snapshot = pipeline.build(createContext([
    createCaseRecord({
      id: 'case-pipeline',
      practiceArea: 'Direito Civil',
      clientCanonicalCity: 'Belo Horizonte',
      source: 'public_triage',
    }),
  ]))

  assert.equal(snapshot.demand.items.length, 1)
  assert.equal(snapshot.metadata.evidence.length >= 2, true)
  assert.equal(
    snapshot.metadata.evidence.some((entry) => entry.source === 'legal_cases'),
    true,
  )
  assert.equal(
    snapshot.metadata.evidence.some((entry) => entry.type === 'case_signal'),
    true,
  )
  assert.equal(snapshot.demand.items[0]?.city, 'Belo Horizonte')
})

test('growth pipeline remains empty when no cases are provided', () => {
  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext([]))

  assert.deepEqual(snapshot.demand.items, [])
  assert.deepEqual(snapshot.metadata.evidence, [])
})

test('demand engine does not import modules/growth or market-signals', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/demand/DemandEngine.ts')
  const source = await readFile(filePath, 'utf-8')

  assert.equal(source.includes('modules/growth'), false)
  assert.equal(source.includes('market-signals'), false)
})

test('demand engine records timing when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createDemandEngine(observability)

  engine.build({
    officeId: 'office-1',
    tenantId: 11,
    period: {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: [createCaseRecord({ id: 'case-metric' })],
  })

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, DEMAND_PROJECTION_MS), 1)
})
