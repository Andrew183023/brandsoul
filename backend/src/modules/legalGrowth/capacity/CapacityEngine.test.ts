import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import type { CaseRecord } from '../../legalCases/caseTypes.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { CAPACITY_PROJECTION_MS } from '../GrowthMetrics.js'
import type { GrowthContext, GrowthProfessionalContext } from '../index.js'
import { buildCapacityProjections, createCapacityEngine } from './CapacityEngine.js'

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

function createCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: overrides.id ?? 'case-1',
    tenantId: overrides.tenantId ?? 11,
    entityId: overrides.entityId ?? 'office-1',
    title: overrides.title ?? 'Case',
    description: overrides.description,
    status: overrides.status ?? 'open',
    priority: overrides.priority ?? 'normal',
    practiceArea: overrides.practiceArea ?? 'Direito Civil',
    source: overrides.source ?? 'public_triage',
    openedAt: overrides.openedAt ?? '2026-07-05T08:00:00.000Z',
    closedAt: overrides.closedAt,
    archivedAt: overrides.archivedAt,
    resolutionReason: overrides.resolutionReason,
    leadProfessionalId: overrides.leadProfessionalId ?? 'p1',
    clientDisplayName: overrides.clientDisplayName,
    clientCanonicalName: overrides.clientCanonicalName,
    clientDisplayPhone: overrides.clientDisplayPhone,
    clientCanonicalPhone: overrides.clientCanonicalPhone,
    clientDisplayWhatsapp: overrides.clientDisplayWhatsapp,
    clientCanonicalWhatsapp: overrides.clientCanonicalWhatsapp,
    clientDisplayEmail: overrides.clientDisplayEmail,
    clientCanonicalEmail: overrides.clientCanonicalEmail,
    clientDisplayCity: overrides.clientDisplayCity,
    clientCanonicalCity: overrides.clientCanonicalCity ?? 'Belo Horizonte',
    clientSearchKey: overrides.clientSearchKey,
    centelhaContext: overrides.centelhaContext ?? {},
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? '2026-07-05T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-05T09:00:00.000Z',
    caseNumber: overrides.caseNumber,
    createdByUserId: overrides.createdByUserId,
  }
}

function createProfessionals(items: GrowthProfessionalContext[]): GrowthProfessionalContext[] {
  return items
}

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

function buildInput(overrides: Partial<Parameters<typeof buildCapacityProjections>[0]> = {}) {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? {
      label: '2026-07',
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: '2026-07-31T23:59:59.999Z',
      granularity: 'month',
    },
    cases: overrides.cases,
    professionals: overrides.professionals,
    demand: overrides.demand ?? { items: [] },
    coverage: overrides.coverage ?? [],
    entityProfile: overrides.entityProfile,
  }
}

function createOpenCases(count: number, args: {
  professionalId: string
  city?: string
  specialty?: string
  prefix: string
}): CaseRecord[] {
  return Array.from({ length: count }, (_, index) => createCase({
    id: `${args.prefix}-${index + 1}`,
    leadProfessionalId: args.professionalId,
    clientCanonicalCity: args.city ?? 'Belo Horizonte',
    practiceArea: args.specialty ?? 'Direito Civil',
    status: 'open',
  }))
}

test('capacity engine calculates capacity by professional', () => {
  const result = buildCapacityProjections(buildInput({
    cases: [
      ...createOpenCases(2, { professionalId: 'p1', prefix: 'p1' }),
      ...createOpenCases(4, { professionalId: 'p2', prefix: 'p2', city: 'Contagem', specialty: 'Direito Trabalhista' }),
    ],
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
      { id: 'p2', city: 'Contagem', specialties: ['Direito Trabalhista'], status: 'active' },
    ]),
  }))

  assert.equal(result.projections.length, 2)
  assert.deepEqual(
    result.projections.map((projection) => projection.professionalId).sort(),
    ['p1', 'p2'],
  )
})

test('capacity engine calculates backlog and openCasesCount', () => {
  const result = buildCapacityProjections(buildInput({
    cases: [
      createCase({ id: 'open-1', leadProfessionalId: 'p1', status: 'open' }),
      createCase({ id: 'pending-1', leadProfessionalId: 'p1', status: 'pending' }),
      createCase({
        id: 'closed-1',
        leadProfessionalId: 'p1',
        status: 'closed',
        closedAt: '2026-07-06T08:00:00.000Z',
      }),
      createCase({
        id: 'archived-1',
        leadProfessionalId: 'p1',
        status: 'archived',
        archivedAt: '2026-07-06T09:00:00.000Z',
      }),
    ],
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  const projection = result.projections[0]
  assert.ok(projection)
  assert.equal(projection.workloadCount, 3)
  assert.equal(projection.backlogCount, 2)
  assert.equal(projection.openCasesCount, 2)
  assert.equal(projection.closedCasesCount, 1)
})

test('capacity engine classifies available balanced constrained and overloaded', () => {
  const result = buildCapacityProjections(buildInput({
    cases: [
      ...createOpenCases(2, { professionalId: 'p-available', prefix: 'available' }),
      ...createOpenCases(4, { professionalId: 'p-balanced', prefix: 'balanced' }),
      ...createOpenCases(7, { professionalId: 'p-constrained', prefix: 'constrained' }),
      ...createOpenCases(9, { professionalId: 'p-overloaded', prefix: 'overloaded' }),
    ],
    professionals: createProfessionals([
      { id: 'p-available', status: 'active', city: 'Belo Horizonte', specialties: ['Direito Civil'] },
      { id: 'p-balanced', status: 'active', city: 'Belo Horizonte', specialties: ['Direito Civil'] },
      { id: 'p-constrained', status: 'active', city: 'Belo Horizonte', specialties: ['Direito Civil'] },
      { id: 'p-overloaded', status: 'active', city: 'Belo Horizonte', specialties: ['Direito Civil'] },
    ]),
  }))

  const byProfessionalId = new Map(result.projections.map((projection) => [projection.professionalId, projection]))

  assert.equal(byProfessionalId.get('p-available')?.capacityStatus, 'available')
  assert.equal(byProfessionalId.get('p-available')?.recommendation, 'pode_crescer')
  assert.equal(byProfessionalId.get('p-balanced')?.capacityStatus, 'balanced')
  assert.equal(byProfessionalId.get('p-balanced')?.recommendation, 'manter')
  assert.equal(byProfessionalId.get('p-constrained')?.capacityStatus, 'constrained')
  assert.equal(byProfessionalId.get('p-constrained')?.recommendation, 'reduzir_demanda')
  assert.equal(byProfessionalId.get('p-overloaded')?.capacityStatus, 'overloaded')
  assert.equal(byProfessionalId.get('p-overloaded')?.recommendation, 'contratar')
})

test('capacity engine calculates averageResolutionHours using closed cases only', () => {
  const result = buildCapacityProjections(buildInput({
    cases: [
      createCase({
        id: 'closed-1',
        leadProfessionalId: 'p1',
        status: 'resolved',
        openedAt: '2026-07-01T08:00:00.000Z',
        closedAt: '2026-07-02T08:00:00.000Z',
      }),
      createCase({
        id: 'closed-2',
        leadProfessionalId: 'p1',
        status: 'closed',
        openedAt: '2026-07-03T08:00:00.000Z',
        closedAt: '2026-07-05T08:00:00.000Z',
      }),
      createCase({
        id: 'open-1',
        leadProfessionalId: 'p1',
        status: 'open',
      }),
    ],
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  assert.equal(result.projections[0]?.averageResolutionHours, 36)
})

test('capacity engine generates auditable evidence', () => {
  const result = buildCapacityProjections(buildInput({
    cases: createOpenCases(1, { professionalId: 'p1', prefix: 'p1' }),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  assert.equal(result.projections[0]?.evidenceIds.length, 2)
  assert.equal(result.evidence[0]?.type, 'capacity_signal')
  assert.equal(result.evidence[0]?.source, 'legal_growth')
  assert.equal(result.evidence[0]?.professionalId, 'p1')
})

test('growth pipeline includes capacity after coverage', () => {
  const pipeline = createGrowthPipeline()
  const snapshot = pipeline.build(createContext({
    cases: [
      createCase({
        id: 'case-1',
        leadProfessionalId: 'p1',
        status: 'open',
        practiceArea: 'Direito Civil',
        clientCanonicalCity: 'Belo Horizonte',
      }),
    ],
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  assert.equal(snapshot.territories.length, 1)
  assert.equal(snapshot.coverage.length, 1)
  assert.equal(snapshot.capacity.length, 1)
  assert.equal(snapshot.metadata.evidence.length >= 8, true)
})

test('capacity engine does not break without data', () => {
  const result = buildCapacityProjections(buildInput())
  assert.deepEqual(result.projections, [])
  assert.deepEqual(result.evidence, [])

  const snapshot = createGrowthPipeline().build(createContext())
  assert.deepEqual(snapshot.capacity, [])
})

test('capacity engine does not import modules growth or market-signals', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/capacity/CapacityEngine.ts')
  const contents = await readFile(filePath, 'utf-8')

  assert.equal(contents.includes('modules/growth'), false)
  assert.equal(contents.includes('market-signals'), false)
})

test('capacity engine records timing metrics when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createCapacityEngine(observability)

  engine.build(buildInput({
    cases: createOpenCases(1, { professionalId: 'p1', prefix: 'p1' }),
    professionals: createProfessionals([
      { id: 'p1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, CAPACITY_PROJECTION_MS), 1)
})
