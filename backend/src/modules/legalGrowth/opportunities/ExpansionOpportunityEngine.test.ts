import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { OPPORTUNITIES_GENERATED_TOTAL } from '../GrowthMetrics.js'
import type { GrowthContext, GrowthProfessionalContext } from '../index.js'
import type { GrowthRecommendation } from '../GrowthTypes.js'
import type { GrowthScoreProjection } from '../scoring/GrowthScoreProjection.js'
import {
  buildExpansionOpportunities,
  createExpansionOpportunityEngine,
} from './ExpansionOpportunityEngine.js'

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

function createProfessionals(items: GrowthProfessionalContext[]): GrowthProfessionalContext[] {
  return items
}

function basePeriod() {
  return {
    label: '2026-07',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T23:59:59.999Z',
    granularity: 'month' as const,
  }
}

function counterCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customCounters)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value, 0)
}

function baseScore(overrides: Partial<GrowthScoreProjection> = {}): GrowthScoreProjection {
  return {
    id: overrides.id ?? 'score-1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    value: overrides.value ?? 80,
    demandScore: overrides.demandScore ?? 80,
    coverageScore: overrides.coverageScore ?? 100,
    capacityScore: overrides.capacityScore ?? 70,
    slaScore: overrides.slaScore ?? 80,
    trendScore: overrides.trendScore ?? 100,
    priority: overrides.priority ?? 'critical',
    confidence: overrides.confidence ?? 'high',
    evidenceIds: overrides.evidenceIds ?? ['score-e1'],
  }
}

function baseRecommendation(overrides: Partial<GrowthRecommendation> = {}): GrowthRecommendation {
  return {
    id: overrides.id ?? 'rec-1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    type: overrides.type ?? 'expand_specialty',
    priority: overrides.priority ?? 'critical',
    confidence: overrides.confidence ?? 'high',
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    title: overrides.title ?? 'Expandir especialidade',
    description: overrides.description ?? 'Descricao',
    expectedImpact: overrides.expectedImpact ?? 'Impacto',
    evidenceIds: overrides.evidenceIds ?? ['rec-e1'],
  }
}

function buildInput(overrides: Partial<Parameters<typeof buildExpansionOpportunities>[0]> = {}) {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    scores: overrides.scores ?? [baseScore()],
    recommendations: overrides.recommendations ?? [baseRecommendation()],
    entityProfile: overrides.entityProfile,
  }
}

test('expansion opportunity engine maps expand_specialty to adicionar_especialidade', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [baseRecommendation({ type: 'expand_specialty' })],
    scores: [baseScore({ value: 78, priority: 'high' })],
  }))

  assert.equal(result.projections[0]?.type, 'adicionar_especialidade')
})

test('expansion opportunity engine maps expand_city to expandir_raio', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [baseRecommendation({ type: 'expand_city', specialty: undefined })],
    scores: [baseScore({ value: 78, priority: 'high', specialty: undefined })],
  }))

  assert.equal(result.projections[0]?.type, 'expandir_raio')
})

test('expansion opportunity engine maps improve_coverage to contratar_associado', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [baseRecommendation({ type: 'improve_coverage', priority: 'high' })],
    scores: [baseScore({ value: 65, priority: 'high' })],
  }))

  assert.equal(result.projections[0]?.type, 'contratar_associado')
})

test('expansion opportunity engine maps improve_conversion to criar_campanha_regional', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [baseRecommendation({ type: 'improve_conversion', priority: 'medium' })],
    scores: [baseScore({ value: 55, priority: 'medium' })],
  }))

  assert.equal(result.projections[0]?.type, 'criar_campanha_regional')
})

test('expansion opportunity engine maps monitor with score >= 50 to fortalecer_presenca', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [baseRecommendation({ type: 'monitor', priority: 'medium' })],
    scores: [baseScore({ value: 55, priority: 'medium' })],
  }))

  assert.equal(result.projections[0]?.type, 'fortalecer_presenca')
})

test('expansion opportunity engine adds abrir_landing_page when score is high with city and specialty', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [baseRecommendation({ type: 'expand_specialty' })],
    scores: [baseScore({ value: 82, priority: 'critical' })],
  }))

  const types = result.projections.map((projection) => projection.type)
  assert.equal(types.includes('abrir_landing_page'), true)
  assert.equal(types.includes('adicionar_especialidade'), true)
})

test('expansion opportunity engine generates auditable evidence', () => {
  const result = buildExpansionOpportunities(buildInput())

  assert.equal(result.projections[0]?.evidenceIds.includes('rec-e1'), true)
  assert.equal(result.evidence[0]?.source, 'legal_growth')
})

test('growth pipeline includes opportunities after recommendations', () => {
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
        leadProfessionalId: 'professional-1',
        centelhaContext: {},
        metadata: {},
        createdAt: '2026-07-05T08:00:00.000Z',
        updatedAt: '2026-07-05T09:00:00.000Z',
      },
    ],
    professionals: createProfessionals([
      { id: 'professional-1', city: 'Belo Horizonte', specialties: ['Direito Civil'], status: 'active' },
    ]),
  }))

  assert.equal(snapshot.recommendations.length, 1)
  assert.equal(snapshot.opportunities.length >= 1, true)
  assert.equal(snapshot.metadata.evidence.length >= 12, true)
})

test('without recommendations opportunities remain empty', () => {
  const result = buildExpansionOpportunities(buildInput({
    recommendations: [],
  }))

  assert.deepEqual(result.projections, [])
  assert.deepEqual(result.evidence, [])
})

test('expansion opportunity engine does not import modules growth or market-signals', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/opportunities/ExpansionOpportunityEngine.ts')
  const contents = await readFile(filePath, 'utf-8')

  assert.equal(contents.includes('modules/growth'), false)
  assert.equal(contents.includes('market-signals'), false)
})

test('expansion opportunity engine records generated opportunities metric', () => {
  const observability = createObservabilityService()
  const engine = createExpansionOpportunityEngine(observability)

  engine.build(buildInput())

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(counterCount(snapshot, OPPORTUNITIES_GENERATED_TOTAL) >= 1, true)
})
