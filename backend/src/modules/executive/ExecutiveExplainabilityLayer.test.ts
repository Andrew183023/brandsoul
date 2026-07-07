import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { createExecutiveExplainabilityLayer } from './index.js'

test('executive explainability layer explains office health with positive and negative drivers', () => {
  const layer = createExecutiveExplainabilityLayer()

  const explanation = layer.explainOfficeHealth({
    score: 82,
    level: 'good',
    drivers: [
      {
        key: 'backlog_healthy',
        title: 'Backlog saudavel',
        impact: 'positive',
        weight: 8,
        summary: 'O backlog permanece compativel com a capacidade operacional.',
      },
      {
        key: 'sla_breaches',
        title: 'SLA vencido em andamento',
        impact: 'negative',
        weight: 15,
        summary: 'Ha casos com SLA vencido exigindo atencao imediata.',
      },
    ],
  })

  assert.equal(explanation.subject, 'office_health')
  assert.equal(explanation.title.includes('Saude do escritorio'), true)
  assert.equal(explanation.summary.includes('score 82'), true)
  assert.equal(explanation.reasons.length, 2)
  assert.deepEqual(explanation.evidence, [
    {
      key: 'backlog_healthy',
      label: 'Backlog saudavel',
      value: 8,
      impact: 'positive',
      summary: 'O backlog permanece compativel com a capacidade operacional.',
    },
    {
      key: 'sla_breaches',
      label: 'SLA vencido em andamento',
      value: 15,
      impact: 'negative',
      summary: 'Ha casos com SLA vencido exigindo atencao imediata.',
    },
  ])
})

test('executive explainability layer explains recommendation with evidence', () => {
  const layer = createExecutiveExplainabilityLayer()

  const explanation = layer.explainRecommendation({
    id: 'rec-1',
    title: 'Expandir cobertura',
    description: 'A cobertura regional ainda apresenta lacunas relevantes.',
    priority: 'high',
    expectedImpact: 'Melhorar a presenca regional e reduzir perdas de demanda.',
    evidence: ['Lacuna de cobertura em Contagem', 'Demanda crescente em Direito Civil'],
  })

  assert.equal(explanation.subject, 'recommendation')
  assert.equal(explanation.title, 'Expandir cobertura')
  assert.equal(
    explanation.summary,
    'Expandir cobertura. A cobertura regional ainda apresenta lacunas relevantes. Melhorar a presenca regional e reduzir perdas de demanda..',
  )
  assert.equal(explanation.reasons.some((reason) => reason.includes('prioridade alta')), true)
  assert.equal(explanation.evidence.length, 2)
})

test('executive explainability layer explains opportunity with region and specialty', () => {
  const layer = createExecutiveExplainabilityLayer()

  const explanation = layer.explainOpportunity({
    id: 'opp-1',
    title: 'Expandir raio de atuacao',
    region: 'Belo Horizonte',
    specialty: 'Direito Civil',
    priority: 'medium',
    expectedImpact: 'Aumentar a captura de demanda em uma regiao aquecida.',
    evidence: ['Alta demanda em Belo Horizonte'],
  })

  assert.equal(explanation.subject, 'opportunity')
  assert.equal(explanation.summary.includes('Belo Horizonte'), true)
  assert.equal(explanation.summary.includes('Direito Civil'), true)
  assert.equal(explanation.reasons.some((reason) => reason.includes('prioridade media')), true)
  assert.equal(explanation.evidence[0]?.value, 'Belo Horizonte')
  assert.equal(explanation.evidence[1]?.value, 'Direito Civil')
})

test('executive explainability layer is deterministic and does not mutate inputs', () => {
  const layer = createExecutiveExplainabilityLayer()
  const input = {
    id: 'rec-2',
    title: 'Monitorar crescimento',
    description: 'Os sinais atuais ainda pedem acompanhamento.',
    priority: 'low',
    expectedImpact: 'Evitar movimentos precipitados.',
    evidence: ['Crescimento estavel'],
  }
  const before = structuredClone(input)

  const first = layer.explainRecommendation(input)
  const second = layer.explainRecommendation(input)

  assert.deepEqual(first, second)
  assert.deepEqual(input, before)
})

test('executive explainability layer uses safe fallbacks for empty optional fields', () => {
  const layer = createExecutiveExplainabilityLayer()

  const recommendation = layer.explainRecommendation({
    id: 'rec-empty',
  })
  const opportunity = layer.explainOpportunity({
    id: 'opp-empty',
  })

  assert.equal(recommendation.title, 'Recomendacao executiva')
  assert.equal(recommendation.evidence.length >= 1, true)
  assert.equal(opportunity.title, 'Oportunidade executiva')
  assert.equal(opportunity.summary.includes('regiao nao informada'), true)
  assert.equal(opportunity.summary.includes('especialidade nao informada'), true)
})

test('executive explainability layer remains independent from database, HTTP, Fastify, React and browser APIs', async () => {
  const source = await readFile(
    path.resolve('src/modules/executive/ExecutiveExplainabilityLayer.ts'),
    'utf8',
  )

  assert.equal(source.includes('from \'react\''), false)
  assert.equal(source.includes('Fastify'), false)
  assert.equal(source.includes('fetch('), false)
  assert.equal(source.includes('axios'), false)
  assert.equal(source.includes('window.'), false)
  assert.equal(source.includes('document.'), false)
  assert.equal(source.includes('SELECT '), false)
  assert.equal(source.includes('INSERT '), false)
  assert.equal(source.includes('UPDATE '), false)
  assert.equal(source.includes('DELETE '), false)
})
