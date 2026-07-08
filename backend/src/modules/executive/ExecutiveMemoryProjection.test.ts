import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildExecutiveMemoryProjection,
} from './ExecutiveMemoryProjection.js'
import {
  EXECUTIVE_MEMORY_PROJECTION_VERSION,
  type ExecutiveMemoryProjectionInput,
} from './ExecutiveMemoryProjectionTypes.js'

function createInput(): ExecutiveMemoryProjectionInput {
  return {
    tenantId: 11,
    officeId: 'office-1',
    capturedAt: '2026-07-08T12:00:00.000Z',
    sourceGrowthGeneratedAt: '2026-07-08T11:00:00.000Z',
    sourceOperationalGeneratedAt: '2026-07-08T11:30:00.000Z',
    officeHealth: {
      score: 84,
      level: 'good',
      explanation: 'O escritorio apresenta boa capacidade operacional.',
      positives: [
        {
          key: 'capacity_available',
          title: 'Capacidade disponivel',
          impact: 'positive',
          weight: 8,
          summary: 'Nao existem profissionais sobrecarregados.',
        },
      ],
      warnings: [
        {
          key: 'coverage_gap',
          title: 'Cobertura parcial',
          impact: 'negative',
          weight: 5,
          summary: 'Existe uma lacuna regional relevante.',
        },
      ],
      opportunities: [
        {
          key: 'expansion_signal',
          title: 'Expansao viavel',
          impact: 'positive',
          weight: 6,
          summary: 'Ha oportunidade de expansao com risco controlado.',
        },
      ],
      drivers: [
        {
          key: 'capacity_available',
          title: 'Capacidade disponivel',
          impact: 'positive',
          weight: 8,
          summary: 'Nao existem profissionais sobrecarregados.',
        },
        {
          key: 'coverage_gap',
          title: 'Cobertura parcial',
          impact: 'negative',
          weight: 5,
          summary: 'Existe uma lacuna regional relevante.',
        },
      ],
    },
    decisionCenter: {
      decisions: [
        {
          id: 'decision:expand',
          type: 'expand',
          title: 'Expandir em regiao aderente',
          priority: 'high',
          impact: 'high',
          confidence: 82,
          explanation: 'A saude executiva permite absorver nova demanda.',
          evidence: [
            {
              key: 'expansion_opportunities',
              label: 'Oportunidades de expansao',
              value: 2,
              summary: 'Existem 2 oportunidades de expansao identificadas.',
            },
            {
              key: 'conversion_flag',
              label: 'Conversao',
              value: false,
              summary: 'Nao existe bloqueio de conversao neste momento.',
            },
            {
              key: 'no_value_summary',
              label: 'Resumo',
              summary: 'Evidencia sem valor numerico.',
            },
          ],
          recommendedActions: ['Priorizar a regiao com maior aderencia.'],
          blockingFactors: ['Acompanhar cobertura regional.'],
        },
        {
          id: 'decision:wait',
          type: 'wait',
          title: 'Esperar estabilizacao local',
          priority: 'medium',
          impact: 'low',
          confidence: 60,
          explanation: 'Aguardando sinal mais consistente.',
          evidence: [],
          recommendedActions: [],
          blockingFactors: [],
        },
      ],
    },
    executiveTimeline: {
      items: [
        {
          id: 'executive_timeline:sla:warning',
          category: 'sla',
          importance: 'high',
          temporalKind: 'observed',
          title: 'Casos em alerta de SLA merecem atencao proxima',
          summary: 'Existem casos em alerta operacional.',
          evidence: [
            {
              key: 'sla_warning_cases',
              value: 0,
              description: 'A leitura atual identificou zero casos vencidos e alertas rastreados.',
            },
            {
              key: 'coverage_present',
              value: false,
              description: 'Nao ha cobertura completa para todas as frentes.',
            },
            {
              key: 'no_value',
              description: 'A evidência textual continua relevante sem valor numerico.',
            },
            {
              key: 'null_value',
              value: null,
              description: 'Valor nulo deve ser preservado quando explicito.',
            },
          ],
          suggestedAction: 'Revisar os casos em alerta antes de expandir.',
          occurredAt: '2026-07-08T10:15:00.000Z',
          source: 'operational',
          sourceKey: 'sla_warning_cases',
        },
        {
          id: 'executive_timeline:growth:opportunity',
          category: 'growth',
          importance: 'medium',
          temporalKind: 'trend',
          title: 'Oportunidades de expansao foram identificadas',
          summary: 'A inteligencia de crescimento encontrou oportunidades relevantes.',
          evidence: [
            {
              key: 'expansion_opportunities',
              value: 2,
              description: 'Existem 2 oportunidades de expansao identificadas.',
            },
          ],
          source: 'growth',
          sourceKey: 'expansion_opportunities',
        },
      ],
      totalDetected: 2,
      totalPublished: 2,
      generatedAt: '2026-07-08T11:45:00.000Z',
    },
  }
}

test('executive memory projection builds the minimum persisted contract', () => {
  const projection = buildExecutiveMemoryProjection(createInput())

  assert.equal(projection.projectionVersion, EXECUTIVE_MEMORY_PROJECTION_VERSION)
  assert.equal(projection.tenantId, 11)
  assert.equal(projection.officeId, 'office-1')
  assert.equal(projection.capturedAt, '2026-07-08T12:00:00.000Z')
  assert.equal(projection.sourceGrowthGeneratedAt, '2026-07-08T11:00:00.000Z')
  assert.equal(projection.sourceOperationalGeneratedAt, '2026-07-08T11:30:00.000Z')
  assert.equal(typeof projection.contentFingerprint, 'string')
  assert.equal(typeof projection.sourceFingerprint, 'string')
})

test('executive memory projection uses explicit allowlists for office health, decision center, and timeline', () => {
  const input = createInput() as ExecutiveMemoryProjectionInput & {
    officeHealth: ExecutiveMemoryProjectionInput['officeHealth'] & { internalStage?: string }
    decisionCenter: ExecutiveMemoryProjectionInput['decisionCenter'] & { internalStage?: string }
    executiveTimeline: ExecutiveMemoryProjectionInput['executiveTimeline'] & { internalStage?: string }
  }

  input.officeHealth.internalStage = 'should-not-persist'
  input.decisionCenter.internalStage = 'should-not-persist'
  input.executiveTimeline.internalStage = 'should-not-persist'
  ;(input.officeHealth.drivers[0] as { debugHint?: string }).debugHint = 'ignore'
  ;(input.decisionCenter.decisions[0] as { internalPriorityScore?: number }).internalPriorityScore = 999
  ;(input.executiveTimeline.items[0] as { debugContext?: string }).debugContext = 'ignore'

  const projection = buildExecutiveMemoryProjection(input)
  const serialized = JSON.stringify(projection)

  assert.equal(serialized.includes('internalStage'), false)
  assert.equal(serialized.includes('debugHint'), false)
  assert.equal(serialized.includes('internalPriorityScore'), false)
  assert.equal(serialized.includes('debugContext'), false)
  assert.deepEqual(projection.officeHealth.drivers[0], {
    key: 'capacity_available',
    title: 'Capacidade disponivel',
    impact: 'positive',
    weight: 8,
    summary: 'Nao existem profissionais sobrecarregados.',
  })
  assert.deepEqual(projection.decisionCenter.decisions[0].evidence[0], {
    key: 'expansion_opportunities',
    label: 'Oportunidades de expansao',
    value: 2,
    summary: 'Existem 2 oportunidades de expansao identificadas.',
  })
  assert.deepEqual(projection.executiveTimeline.items[0].evidence[0], {
    key: 'sla_warning_cases',
    value: 0,
    description: 'A leitura atual identificou zero casos vencidos e alertas rastreados.',
  })
})

test('executive memory projection preserves 0, false, and null while omitting undefined evidence values', () => {
  const projection = buildExecutiveMemoryProjection(createInput())

  assert.equal(projection.decisionCenter.decisions[0].evidence[1].value, false)
  assert.equal('value' in projection.decisionCenter.decisions[0].evidence[2], false)
  assert.equal(projection.executiveTimeline.items[0].evidence[0].value, 0)
  assert.equal(projection.executiveTimeline.items[0].evidence[1].value, false)
  assert.equal('value' in projection.executiveTimeline.items[0].evidence[2], false)
  assert.equal(projection.executiveTimeline.items[0].evidence[3].value, null)
})

test('executive memory projection preserves order for decisions, timeline items, and evidence arrays', () => {
  const projection = buildExecutiveMemoryProjection(createInput())

  assert.deepEqual(
    projection.decisionCenter.decisions.map((decision) => decision.id),
    ['decision:expand', 'decision:wait'],
  )
  assert.deepEqual(
    projection.executiveTimeline.items.map((item) => item.id),
    ['executive_timeline:sla:warning', 'executive_timeline:growth:opportunity'],
  )
  assert.deepEqual(
    projection.executiveTimeline.items[0].evidence.map((evidence) => evidence.key),
    ['sla_warning_cases', 'coverage_present', 'no_value', 'null_value'],
  )
})

test('executive memory projection preserves timeline generatedAt in output but excludes it from content fingerprint', () => {
  const input = createInput()
  const updatedTimeline = createInput()
  updatedTimeline.executiveTimeline.generatedAt = '2026-07-08T11:59:00.000Z'

  const first = buildExecutiveMemoryProjection(input)
  const second = buildExecutiveMemoryProjection(updatedTimeline)

  assert.equal(first.executiveTimeline.generatedAt, '2026-07-08T11:45:00.000Z')
  assert.equal(second.executiveTimeline.generatedAt, '2026-07-08T11:59:00.000Z')
  assert.equal(first.contentFingerprint, second.contentFingerprint)
})

test('executive memory projection is deterministic and does not mutate input', () => {
  const input = createInput()
  const before = structuredClone(input)

  const first = buildExecutiveMemoryProjection(input)
  const second = buildExecutiveMemoryProjection(input)

  assert.deepEqual(input, before)
  assert.deepEqual(first, second)
  assert.notEqual(first.officeHealth, input.officeHealth)
  assert.notEqual(first.decisionCenter.decisions, input.decisionCenter.decisions)
  assert.notEqual(first.executiveTimeline.items, input.executiveTimeline.items)
})

test('executive memory content fingerprint is stable across capturedAt changes and source changes, but source fingerprint is not', () => {
  const baseline = createInput()
  const capturedAtChanged = createInput()
  const sourceChanged = createInput()

  capturedAtChanged.capturedAt = '2026-07-08T13:00:00.000Z'
  sourceChanged.sourceGrowthGeneratedAt = '2026-07-08T12:30:00.000Z'
  sourceChanged.sourceOperationalGeneratedAt = '2026-07-08T12:35:00.000Z'

  const baselineProjection = buildExecutiveMemoryProjection(baseline)
  const capturedAtProjection = buildExecutiveMemoryProjection(capturedAtChanged)
  const sourceProjection = buildExecutiveMemoryProjection(sourceChanged)

  assert.equal(baselineProjection.contentFingerprint, capturedAtProjection.contentFingerprint)
  assert.equal(baselineProjection.contentFingerprint, sourceProjection.contentFingerprint)
  assert.equal(baselineProjection.sourceFingerprint, capturedAtProjection.sourceFingerprint)
  assert.notEqual(baselineProjection.sourceFingerprint, sourceProjection.sourceFingerprint)
})

test('executive memory content fingerprint changes when health, decisions, or timeline change', () => {
  const baseline = buildExecutiveMemoryProjection(createInput())

  const healthChangedInput = createInput()
  healthChangedInput.officeHealth.score = 55

  const decisionChangedInput = createInput()
  decisionChangedInput.decisionCenter.decisions[0].title = 'Expandir com urgencia'

  const timelineChangedInput = createInput()
  timelineChangedInput.executiveTimeline.items[0].summary = 'Resumo alterado'

  assert.notEqual(baseline.contentFingerprint, buildExecutiveMemoryProjection(healthChangedInput).contentFingerprint)
  assert.notEqual(baseline.contentFingerprint, buildExecutiveMemoryProjection(decisionChangedInput).contentFingerprint)
  assert.notEqual(baseline.contentFingerprint, buildExecutiveMemoryProjection(timelineChangedInput).contentFingerprint)
})

test('executive memory content fingerprint ignores non-allowlisted fields', () => {
  const baseline = buildExecutiveMemoryProjection(createInput())
  const input = createInput() as ExecutiveMemoryProjectionInput & {
    officeHealth: ExecutiveMemoryProjectionInput['officeHealth'] & { internalOnly?: string }
    decisionCenter: ExecutiveMemoryProjectionInput['decisionCenter'] & { internalOnly?: string }
    executiveTimeline: ExecutiveMemoryProjectionInput['executiveTimeline'] & { internalOnly?: string }
  }

  input.officeHealth.internalOnly = 'debug'
  input.decisionCenter.internalOnly = 'debug'
  input.executiveTimeline.internalOnly = 'debug'

  const projection = buildExecutiveMemoryProjection(input)
  assert.equal(baseline.contentFingerprint, projection.contentFingerprint)
})

test('executive memory projection rejects missing required boundary fields', () => {
  const missingTenant = createInput()
  const missingOffice = createInput()
  const missingCapturedAt = createInput()
  const missingGrowthGeneratedAt = createInput()
  const missingOperationalGeneratedAt = createInput()

  missingTenant.tenantId = 0
  missingOffice.officeId = '   '
  missingCapturedAt.capturedAt = '   '
  missingGrowthGeneratedAt.sourceGrowthGeneratedAt = '   '
  missingOperationalGeneratedAt.sourceOperationalGeneratedAt = '   '

  assert.throws(() => buildExecutiveMemoryProjection(missingTenant), /tenantId/)
  assert.throws(() => buildExecutiveMemoryProjection(missingOffice), /officeId/)
  assert.throws(() => buildExecutiveMemoryProjection(missingCapturedAt), /capturedAt/)
  assert.throws(() => buildExecutiveMemoryProjection(missingGrowthGeneratedAt), /sourceGrowthGeneratedAt/)
  assert.throws(() => buildExecutiveMemoryProjection(missingOperationalGeneratedAt), /sourceOperationalGeneratedAt/)
})

test('executive memory fingerprints are stable hexadecimal strings', () => {
  const projection = buildExecutiveMemoryProjection(createInput())

  assert.match(projection.contentFingerprint, /^[a-f0-9]{64}$/)
  assert.match(projection.sourceFingerprint, /^[a-f0-9]{64}$/)
})

test('executive memory projection implementation avoids prohibited dependencies and blind spreads', async () => {
  const source = await readFile(new URL('./ExecutiveMemoryProjection.ts', import.meta.url), 'utf-8')

  assert.equal(/prisma|fastify|react|window|document|localStorage|sessionStorage|fetch|axios|Date\.now|new Date|performance\.now|Math\.random|crypto\.randomUUID|setTimeout|setInterval|observability/.test(source), false)
  assert.equal(/\bany\b/.test(source), false)
  assert.equal(/\.\.\.input|\.\.\.officeHealth|\.\.\.decisionCenter|\.\.\.executiveTimeline/.test(source), false)
})
