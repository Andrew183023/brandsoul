import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryCaptureService,
  createExecutiveMemoryCaptureService,
  type ExecutiveMemoryCaptureInput,
} from './ExecutiveMemoryCaptureService.js'
import type { ExecutiveMemoryProjection } from './ExecutiveMemoryProjectionTypes.js'
import type { SaveExecutiveMemorySnapshotResult } from './ExecutiveMemoryRepository.js'

function createInput(): ExecutiveMemoryCaptureInput {
  return {
    tenantId: 11,
    officeId: 'office-1',
    capturedAt: '2026-07-08T10:00:00.000Z',
    sourceGrowthGeneratedAt: '2026-07-08T09:00:00.000Z',
    sourceOperationalGeneratedAt: '2026-07-08T09:30:00.000Z',
    officeHealth: {
      score: 84,
      level: 'good',
      explanation: 'O escritório mantém boa condição operacional.',
      positives: [
        {
          key: 'healthy_backlog',
          title: 'Backlog saudável',
          impact: 'positive',
          weight: 8,
          summary: 'O backlog permanece equilibrado.',
        },
      ],
      warnings: [
        {
          key: 'coverage_attention',
          title: 'Cobertura regional',
          impact: 'negative',
          weight: 5,
          summary: 'Existe atenção em cobertura regional.',
        },
      ],
      opportunities: [
        {
          key: 'regional_expansion',
          title: 'Expansão regional',
          impact: 'positive',
          weight: 6,
          summary: 'Há oportunidade de expansão.',
        },
      ],
      drivers: [
        {
          key: 'healthy_backlog',
          title: 'Backlog saudável',
          impact: 'positive',
          weight: 8,
          summary: 'O backlog permanece equilibrado.',
        },
        {
          key: 'coverage_attention',
          title: 'Cobertura regional',
          impact: 'negative',
          weight: 5,
          summary: 'Existe atenção em cobertura regional.',
        },
      ],
    },
    decisionCenter: {
      decisions: [
        {
          id: 'decision:expand',
          type: 'expand',
          title: 'Expandir com controle',
          priority: 'high',
          impact: 'high',
          confidence: 81,
          explanation: 'Há oportunidade clara de expansão.',
          evidence: [
            {
              key: 'expansion_opportunities',
              label: 'Oportunidades de expansão',
              value: 2,
              summary: 'Existem duas oportunidades de expansão.',
            },
          ],
          recommendedActions: ['Revisar a oportunidade prioritária.'],
          blockingFactors: [],
        },
      ],
    },
    executiveTimeline: {
      items: [
        {
          id: 'executive_timeline:growth:expansion_opportunities',
          category: 'growth',
          importance: 'high',
          temporalKind: 'observed',
          title: 'Oportunidades de expansão identificadas',
          summary: 'A inteligência executiva encontrou oportunidade clara de expansão.',
          evidence: [
            {
              key: 'growth_opportunities',
              value: 0,
              description: 'A contagem atual foi preservada.',
            },
            {
              key: 'backlog_pressure',
              value: false,
              description: 'Não há pressão operacional neste sinal.',
            },
          ],
          suggestedAction: 'Revisar a oportunidade prioritária.',
          occurredAt: '2026-07-08T09:45:00.000Z',
          source: 'growth',
          sourceKey: 'expansion_opportunities',
        },
      ],
      totalDetected: 1,
      totalPublished: 1,
      generatedAt: '2026-07-08T09:50:00.000Z',
    },
  }
}

function createProjection(): ExecutiveMemoryProjection {
  return {
    projectionVersion: 1,
    tenantId: 11,
    officeId: 'office-1',
    capturedAt: '2026-07-08T10:00:00.000Z',
    sourceGrowthGeneratedAt: '2026-07-08T09:00:00.000Z',
    sourceOperationalGeneratedAt: '2026-07-08T09:30:00.000Z',
    officeHealth: {
      score: 84,
      level: 'good',
      explanation: 'O escritório mantém boa condição operacional.',
      positives: [
        {
          key: 'healthy_backlog',
          title: 'Backlog saudável',
          impact: 'positive',
          weight: 8,
          summary: 'O backlog permanece equilibrado.',
        },
      ],
      warnings: [
        {
          key: 'coverage_attention',
          title: 'Cobertura regional',
          impact: 'negative',
          weight: 5,
          summary: 'Existe atenção em cobertura regional.',
        },
      ],
      opportunities: [
        {
          key: 'regional_expansion',
          title: 'Expansão regional',
          impact: 'positive',
          weight: 6,
          summary: 'Há oportunidade de expansão.',
        },
      ],
      drivers: [
        {
          key: 'healthy_backlog',
          title: 'Backlog saudável',
          impact: 'positive',
          weight: 8,
          summary: 'O backlog permanece equilibrado.',
        },
      ],
    },
    decisionCenter: {
      decisions: [
        {
          id: 'decision:expand',
          type: 'expand',
          title: 'Expandir com controle',
          priority: 'high',
          impact: 'high',
          confidence: 81,
          explanation: 'Há oportunidade clara de expansão.',
          evidence: [
            {
              key: 'expansion_opportunities',
              label: 'Oportunidades de expansão',
              value: 2,
              summary: 'Existem duas oportunidades de expansão.',
            },
          ],
          recommendedActions: ['Revisar a oportunidade prioritária.'],
          blockingFactors: [],
        },
      ],
    },
    executiveTimeline: {
      items: [
        {
          id: 'executive_timeline:growth:expansion_opportunities',
          category: 'growth',
          importance: 'high',
          temporalKind: 'observed',
          title: 'Oportunidades de expansão identificadas',
          summary: 'A inteligência executiva encontrou oportunidade clara de expansão.',
          evidence: [
            {
              key: 'growth_opportunities',
              value: 0,
              description: 'A contagem atual foi preservada.',
            },
            {
              key: 'backlog_pressure',
              value: false,
              description: 'Não há pressão operacional neste sinal.',
            },
          ],
          suggestedAction: 'Revisar a oportunidade prioritária.',
          occurredAt: '2026-07-08T09:45:00.000Z',
          source: 'growth',
          sourceKey: 'expansion_opportunities',
        },
      ],
      totalDetected: 1,
      totalPublished: 1,
      generatedAt: '2026-07-08T09:50:00.000Z',
    },
    contentFingerprint: 'content-fingerprint-1',
    sourceFingerprint: 'source-fingerprint-1',
  }
}

function createSavedSnapshotResult(overrides?: Partial<SaveExecutiveMemorySnapshotResult>): SaveExecutiveMemorySnapshotResult {
  return {
    created: overrides?.created ?? true,
    record: {
      id: 'executive_memory_snapshot:11:office-1:content-fingerprint-1',
      tenantId: 11,
      officeId: 'office-1',
      projectionVersion: 1,
      capturedAt: '2026-07-08T10:00:00.000Z',
      sourceGrowthGeneratedAt: '2026-07-08T09:00:00.000Z',
      sourceOperationalGeneratedAt: '2026-07-08T09:30:00.000Z',
      contentFingerprint: 'content-fingerprint-1',
      sourceFingerprint: 'source-fingerprint-1',
      officeHealth: createProjection().officeHealth,
      decisionCenter: createProjection().decisionCenter,
      executiveTimeline: createProjection().executiveTimeline,
      createdAt: '2026-07-08T10:00:01.000Z',
    },
  }
}

test('capture calls projectionBuilder and repository exactly once with exact values', async () => {
  const input = createInput()
  const before = JSON.stringify(input)
  const projection = createProjection()
  const saved = createSavedSnapshotResult()
  const calls: string[] = []
  let projectionBuilderInput: ExecutiveMemoryCaptureInput | null = null
  let repositoryProjection: ExecutiveMemoryProjection | null = null

  const service = createExecutiveMemoryCaptureService({
    projectionBuilder(receivedInput) {
      calls.push('projection')
      projectionBuilderInput = receivedInput
      return projection
    },
    repository: {
      async saveSnapshot(receivedProjection) {
        calls.push('repository')
        repositoryProjection = receivedProjection
        return saved
      },
    },
  })

  const result = await service.capture(input)

  assert.deepEqual(calls, ['projection', 'repository'])
  assert.equal(projectionBuilderInput, input)
  assert.equal(repositoryProjection, projection)
  assert.deepEqual(result, {
    created: true,
    snapshotId: saved.record.id,
    tenantId: saved.record.tenantId,
    officeId: saved.record.officeId,
    projectionVersion: saved.record.projectionVersion,
    capturedAt: saved.record.capturedAt,
    contentFingerprint: saved.record.contentFingerprint,
    sourceFingerprint: saved.record.sourceFingerprint,
  })
  assert.equal(JSON.stringify(input), before)
})

test('capture propagates created=false from repository idempotent result', async () => {
  const service = createExecutiveMemoryCaptureService({
    projectionBuilder() {
      return createProjection()
    },
    repository: {
      async saveSnapshot() {
        return createSavedSnapshotResult({
          created: false,
        })
      },
    },
  })

  const result = await service.capture(createInput())

  assert.equal(result.created, false)
  assert.equal(result.snapshotId, 'executive_memory_snapshot:11:office-1:content-fingerprint-1')
  assert.equal(result.contentFingerprint, 'content-fingerprint-1')
  assert.equal(result.sourceFingerprint, 'source-fingerprint-1')
})

test('capture propagates projection builder error and does not call repository', async () => {
  let repositoryCalled = false
  const service = createExecutiveMemoryCaptureService({
    projectionBuilder() {
      throw new Error('projection_failure')
    },
    repository: {
      async saveSnapshot() {
        repositoryCalled = true
        return createSavedSnapshotResult()
      },
    },
  })

  await assert.rejects(() => service.capture(createInput()), /projection_failure/)
  assert.equal(repositoryCalled, false)
})

test('capture propagates repository error', async () => {
  const service = createExecutiveMemoryCaptureService({
    projectionBuilder() {
      return createProjection()
    },
    repository: {
      async saveSnapshot() {
        throw new Error('repository_failure')
      },
    },
  })

  await assert.rejects(() => service.capture(createInput()), /repository_failure/)
})

test('factory creates service with injected dependencies', async () => {
  const service = createExecutiveMemoryCaptureService({
    projectionBuilder() {
      return createProjection()
    },
    repository: {
      async saveSnapshot() {
        return createSavedSnapshotResult()
      },
    },
  })

  assert.equal(service instanceof ExecutiveMemoryCaptureService, true)
  const result = await service.capture(createInput())
  assert.equal(result.snapshotId.length > 0, true)
})

test('service preserves capturedAt from input via projection and does not recalculate executive state', async () => {
  const input = createInput()
  const projection = createProjection()
  let receivedInput: ExecutiveMemoryCaptureInput | null = null

  const service = createExecutiveMemoryCaptureService({
    projectionBuilder(builderInput) {
      receivedInput = builderInput
      return projection
    },
    repository: {
      async saveSnapshot(savedProjection) {
        assert.equal(savedProjection, projection)
        return createSavedSnapshotResult()
      },
    },
  })

  const result = await service.capture(input)

  assert.equal(receivedInput?.capturedAt, input.capturedAt)
  assert.equal(receivedInput?.officeHealth, input.officeHealth)
  assert.equal(receivedInput?.decisionCenter, input.decisionCenter)
  assert.equal(receivedInput?.executiveTimeline, input.executiveTimeline)
  assert.equal(result.capturedAt, projection.capturedAt)
})

test('capture is deterministic with same mocks and same input', async () => {
  const input = createInput()
  const projection = createProjection()
  const service = createExecutiveMemoryCaptureService({
    projectionBuilder() {
      return projection
    },
    repository: {
      async saveSnapshot() {
        return createSavedSnapshotResult()
      },
    },
  })

  const first = await service.capture(input)
  const second = await service.capture(input)

  assert.deepEqual(first, second)
})

test('capture service implementation avoids prohibited dependencies and direct infrastructure coupling', async () => {
  const source = await readFile(
    path.resolve('backend/src/modules/executive/ExecutiveMemoryCaptureService.ts'),
    'utf8',
  )

  assert.equal(source.includes('Date.now'), false)
  assert.equal(source.includes('new Date'), false)
  assert.equal(source.includes('performance.now'), false)
  assert.equal(source.includes('Math.random'), false)
  assert.equal(source.includes('crypto.randomUUID'), false)
  assert.equal(source.includes('createDatabaseConnection'), false)
  assert.equal(source.includes('initializeDatabase'), false)
  assert.equal(source.includes('ExecutiveDashboardService'), false)
  assert.equal(source.includes('executiveDashboardApplicationService'), false)
  assert.equal(source.includes('executiveDashboardRoutes'), false)
  assert.equal(source.includes('brandsoul-frontend'), false)
})
