import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createObservabilityService } from '../../../services/observabilityService.js'
import { createGrowthPipeline } from '../GrowthPipeline.js'
import { LANDING_INTELLIGENCE_BUILD_MS } from '../GrowthMetrics.js'
import type { GrowthContext, GrowthProfessionalContext } from '../index.js'
import type { GrowthOpportunity, GrowthRecommendation } from '../GrowthTypes.js'
import type { GrowthScoreProjection } from '../scoring/GrowthScoreProjection.js'
import { buildLandingIntelligence, createLandingIntelligenceEngine } from './LandingIntelligenceEngine.js'

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

function timingCount(snapshot: ReturnType<ReturnType<typeof createObservabilityService>['getMetricsSnapshot']>, metric: string) {
  return Object.entries(snapshot.customTimings)
    .filter(([key]) => key === metric || key.startsWith(`${metric}{`))
    .reduce((total, [, value]) => total + value.count, 0)
}

function basePeriod() {
  return {
    label: '2026-07',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-31T23:59:59.999Z',
    granularity: 'month' as const,
  }
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

function baseOpportunity(overrides: Partial<GrowthOpportunity> = {}): GrowthOpportunity {
  return {
    id: overrides.id ?? 'opp-1',
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    type: overrides.type ?? 'abrir_landing_page',
    score: overrides.score ?? 80,
    priority: overrides.priority ?? 'critical',
    confidence: overrides.confidence ?? 'high',
    city: overrides.city ?? 'Belo Horizonte',
    specialty: overrides.specialty ?? 'Direito Civil',
    expectedImpact: overrides.expectedImpact ?? 'Impacto',
    justification: overrides.justification ?? 'Justificativa',
    requiredActions: overrides.requiredActions ?? ['acao'],
    evidenceIds: overrides.evidenceIds ?? ['opp-e1'],
  }
}

function buildInput(overrides: Partial<Parameters<typeof buildLandingIntelligence>[0]> = {}) {
  return {
    officeId: overrides.officeId ?? 'office-1',
    tenantId: overrides.tenantId ?? 11,
    period: overrides.period ?? basePeriod(),
    opportunities: overrides.opportunities ?? [baseOpportunity()],
    scores: overrides.scores ?? [baseScore()],
    recommendations: overrides.recommendations ?? [baseRecommendation()],
    entityProfile: overrides.entityProfile,
  }
}

test('landing intelligence marks candidate as eligible when opportunity is abrir_landing_page', () => {
  const result = buildLandingIntelligence(buildInput())

  assert.equal(result.projections[0]?.eligible, true)
  assert.equal(result.projections[0]?.reason, 'oportunidade_explicita_de_landing')
})

test('landing intelligence marks candidate as eligible when growthScore is high with city and specialty', () => {
  const result = buildLandingIntelligence(buildInput({
    opportunities: [],
    scores: [baseScore({ value: 72, priority: 'high' })],
  }))

  assert.equal(result.projections[0]?.eligible, true)
  assert.equal(result.projections[0]?.reason, 'score_elevado_com_recorte_valido')
})

test('landing intelligence calculates prepared seoScore deterministically', () => {
  const high = buildLandingIntelligence(buildInput({
    scores: [baseScore({ value: 82 })],
  })).projections[0]
  const medium = buildLandingIntelligence(buildInput({
    opportunities: [],
    scores: [baseScore({ value: 72 })],
  })).projections[0]
  const low = buildLandingIntelligence(buildInput({
    opportunities: [],
    scores: [baseScore({ value: 50, priority: 'medium' })],
  })).projections[0]

  assert.equal(high?.seoScore, 80)
  assert.equal(medium?.seoScore, 60)
  assert.equal(low?.seoScore, 40)
})

test('landing intelligence is not eligible without city or specialty', () => {
  const result = buildLandingIntelligence(buildInput({
    opportunities: [baseOpportunity({ city: undefined, specialty: undefined })],
    scores: [baseScore({ city: undefined as unknown as string, specialty: undefined })],
    recommendations: [baseRecommendation({ city: undefined, specialty: undefined })],
  }))

  assert.equal(result.projections[0]?.eligible, false)
  assert.equal(result.projections[0]?.reason, 'cidade_ou_especialidade_ausente')
})

test('landing intelligence carries evidence ids and adds auditable evidence', () => {
  const result = buildLandingIntelligence(buildInput())

  assert.equal(result.projections[0]?.evidenceIds.includes('score-e1'), true)
  assert.equal(result.projections[0]?.evidenceIds.includes('rec-e1'), true)
  assert.equal(result.projections[0]?.evidenceIds.includes('opp-e1'), true)
  assert.equal(result.evidence[0]?.source, 'legal_growth')
})

test('growth pipeline includes landingCandidates after opportunities', () => {
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

  assert.equal(snapshot.opportunities.length >= 1, true)
  assert.equal(snapshot.landingCandidates.length, 1)
  assert.equal(snapshot.metadata.evidence.length >= 13, true)
})

test('without scores landing intelligence remains empty', () => {
  const result = buildLandingIntelligence(buildInput({
    scores: [],
  }))

  assert.deepEqual(result.projections, [])
  assert.deepEqual(result.evidence, [])
})

test('landing intelligence engine has no browser dependency and no forbidden imports', async () => {
  const filePath = path.resolve('src/modules/legalGrowth/landing/LandingIntelligenceEngine.ts')
  const contents = await readFile(filePath, 'utf-8')

  assert.equal(contents.includes('modules/growth'), false)
  assert.equal(contents.includes('market-signals'), false)
  assert.equal(contents.includes('window.'), false)
  assert.equal(contents.includes('document.'), false)
})

test('landing intelligence engine can be instantiated deterministically', () => {
  const engine = createLandingIntelligenceEngine()
  const first = engine.build(buildInput())
  const second = engine.build(buildInput())

  assert.deepEqual(first, second)
})

test('landing intelligence engine records timing metrics when observability is provided', () => {
  const observability = createObservabilityService()
  const engine = createLandingIntelligenceEngine(observability)

  engine.build(buildInput())

  const snapshot = observability.getMetricsSnapshot()
  assert.equal(timingCount(snapshot, LANDING_INTELLIGENCE_BUILD_MS), 1)
})
