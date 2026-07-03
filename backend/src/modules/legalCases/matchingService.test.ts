import assert from 'node:assert/strict'
import test from 'node:test'

import { createObservabilityService } from '../../services/observabilityService.js'

import { MatchingService, resolveCaseData } from './matchingService.js'

test('resolveCaseData prioritizes practice_area over metadata.practiceArea', () => {
  const result = resolveCaseData({
    id: 'case-1',
    priority: 'normal',
    practice_area: 'Direito Trabalhista',
    client_display_city: null,
    client_canonical_city: null,
    client_search_key: null,
    centelha_context: {
      practiceArea: 'Direito Previdenciario',
    },
    metadata: {
      practiceArea: 'Direito Civil',
      city: 'Contagem',
    },
  })

  assert.equal(result.category, 'direito trabalhista')
})

test('resolveCaseData prioritizes structured city over metadata city and location', () => {
  const result = resolveCaseData({
    id: 'case-2',
    priority: 'high',
    practice_area: 'Direito Trabalhista',
    client_display_city: 'Belo Horizonte',
    client_canonical_city: 'BELO HORIZONTE',
    client_search_key: 'joao|5531999999999|belo horizonte',
    centelha_context: {
      city: 'Betim',
      location: {
        city: 'Nova Lima',
      },
    },
    metadata: {
      city: 'Contagem',
      location: {
        city: 'Sabara',
      },
    },
  })

  assert.equal(result.city, 'belo horizonte')
  assert.equal(result.searchKey, 'joao|5531999999999|belo horizonte')
})

test('resolveCaseData keeps metadata as fallback when structured fields are absent', () => {
  const result = resolveCaseData({
    id: 'case-3',
    priority: 'low',
    practice_area: null,
    client_display_city: null,
    client_canonical_city: null,
    client_search_key: null,
    centelha_context: {
      practiceArea: 'Direito Empresarial',
      city: 'Betim',
      state: 'MG',
    },
    metadata: {
      practiceArea: 'Direito do Consumidor',
      city: 'Contagem',
      state: 'MG',
    },
  })

  assert.equal(result.category, 'direito do consumidor')
  assert.equal(result.city, 'contagem')
  assert.equal(result.state, 'mg')
})

test('resolveCaseData keeps centelhaContext as final fallback for legacy cases', () => {
  const result = resolveCaseData({
    id: 'case-4',
    priority: 'urgent',
    practice_area: null,
    client_display_city: null,
    client_canonical_city: null,
    client_search_key: null,
    centelha_context: {
      category: 'Direito Tributario',
      location: {
        city: 'Uberlandia',
        state: 'MG',
      },
    },
    metadata: {},
  })

  assert.equal(result.category, 'direito tributario')
  assert.equal(result.city, 'uberlandia')
  assert.equal(result.state, 'mg')
})

function createFakeDb(args: {
  caseRow?: Record<string, unknown> | null
  professionals?: Record<string, unknown>[]
  fallbackProfessionals?: Record<string, unknown>[]
  learningSignals?: Record<string, unknown>[]
  failOnGet?: boolean
}) {
  return {
    dialect: 'sqlite',
    async get<T>(sql: string) {
      if (args.failOnGet) {
        throw new Error('unexpected_db_error')
      }
      if (sql.includes('FROM cases')) {
        return (args.caseRow ?? null) as T
      }
      if (sql.includes('COUNT(*) AS total')) {
        return { total: 0 } as T
      }
      return null as T
    },
    async all<T>(sql: string) {
      if (sql.includes('FROM learning_events')) {
        return (args.learningSignals ?? []) as T
      }
      if (sql.includes('FROM professionals') && sql.includes('LEFT JOIN professional_profiles')) {
        return (args.professionals ?? []) as T
      }
      if (sql.includes('FROM professionals')) {
        return (args.fallbackProfessionals ?? []) as T
      }
      return [] as T
    },
    async run() {
      return undefined
    },
  }
}

test('MatchingService emits started and completed metrics with reason=matched', async () => {
  const observability = createObservabilityService()
  const db = createFakeDb({
    caseRow: {
      id: 'case-1',
      entity_id: 'office-1',
      priority: 'high',
      practice_area: 'Direito Trabalhista',
      client_display_city: 'Belo Horizonte',
      client_canonical_city: 'belo horizonte',
      client_search_key: 'joao|5531999999999|belo horizonte',
      centelha_context: {},
      metadata: {},
    },
    professionals: [
      {
        professional_id: 'prof-1',
        user_id: 10,
        display_name: 'Dra. Ana',
        status: 'active',
        specialties: JSON.stringify(['direito trabalhista']),
        availability: JSON.stringify({ active: true, available: true }),
        profile_metadata: JSON.stringify({ city: 'Belo Horizonte' }),
        professional_metadata: JSON.stringify({ loginCapable: true }),
      },
    ],
  })

  const service = new MatchingService(db as never, observability)
  const result = await service.matchCaseToProfessionals(11, 'case-1')

  assert.equal(result.length, 1)
  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_matching_started_total, 1)
  assert.equal(snapshot.customCounters.legal_matching_completed_total, 1)
  assert.equal(snapshot.customCounters.legal_matching_failed_total ?? 0, 0)
  assert.equal(
    snapshot.customCounterSeries['legal_matching_started_total{entity_id=unknown,pipeline=case_matching,result=started,tenant_id=11}'],
    1,
  )
  assert.equal(
    snapshot.customCounterSeries['legal_matching_completed_total{entity_id=office-1,pipeline=case_matching,reason=matched,result=success,tenant_id=11}'],
    1,
  )
})

test('MatchingService emits completed metric with reason=no_match when no candidate is found', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  const observability = createObservabilityService()
  const db = createFakeDb({
    caseRow: {
      id: 'case-2',
      entity_id: 'office-2',
      priority: 'normal',
      practice_area: 'Direito Tributario',
      client_display_city: 'Recife',
      client_canonical_city: 'recife',
      client_search_key: null,
      centelha_context: {},
      metadata: {},
    },
    professionals: [],
  })

  try {
    const service = new MatchingService(db as never, observability)
    const result = await service.matchCaseToProfessionals(22, 'case-2')

    assert.deepEqual(result, [])
    const snapshot = observability.getMetricsSnapshot()
    assert.equal(snapshot.customCounters.legal_matching_started_total, 1)
    assert.equal(snapshot.customCounters.legal_matching_completed_total, 1)
    assert.equal(
      snapshot.customCounterSeries['legal_matching_completed_total{entity_id=office-2,pipeline=case_matching,reason=no_match,result=success,tenant_id=22}'],
      1,
    )
  } finally {
    process.env.NODE_ENV = previousNodeEnv
  }
})

test('MatchingService emits failed metric on technical exception', async () => {
  const observability = createObservabilityService()
  const db = createFakeDb({
    failOnGet: true,
  })

  const service = new MatchingService(db as never, observability)
  const result = await service.matchCaseToProfessionals(33, 'case-3')

  assert.deepEqual(result, [])
  const snapshot = observability.getMetricsSnapshot()
  assert.equal(snapshot.customCounters.legal_matching_started_total, 1)
  assert.equal(snapshot.customCounters.legal_matching_failed_total, 1)
  assert.equal(snapshot.customCounters.legal_matching_completed_total ?? 0, 0)
  assert.equal(
    snapshot.customCounterSeries['legal_matching_failed_total{entity_id=unknown,pipeline=case_matching,reason=exception,result=failed,tenant_id=33}'],
    1,
  )
})

test('MatchingService keeps working without observability', async () => {
  const db = createFakeDb({
    caseRow: null,
  })

  const service = new MatchingService(db as never)
  const result = await service.matchCaseToProfessionals(44, 'case-4')
  assert.deepEqual(result, [])
})
