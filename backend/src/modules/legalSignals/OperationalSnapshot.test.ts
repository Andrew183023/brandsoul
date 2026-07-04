import assert from 'node:assert/strict'
import test from 'node:test'

import { buildOperationalSnapshot, createOperationalSnapshotBuilder } from './OperationalSnapshotBuilder.js'
import { createOperationalSnapshotRepository } from './OperationalSnapshotRepository.js'

test('operational snapshot calculates deterministic office projection rules', () => {
  const snapshot = buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-03T10:00:00.000Z',
    cases: [
      {
        caseId: 'case-1',
        status: 'open',
        assignedProfessionalId: 'prof-1',
        practiceArea: 'family_law',
        city: 'Belo Horizonte',
        firstResponseMinutes: 30,
        slaStatus: 'warning',
      },
      {
        caseId: 'case-2',
        status: 'assigned',
        assignedProfessionalId: 'prof-1',
        practiceArea: 'family_law',
        city: 'Belo Horizonte',
        firstResponseMinutes: 10,
        slaStatus: 'ok',
      },
      {
        caseId: 'case-3',
        status: 'in_progress',
        assignedProfessionalId: 'prof-2',
        practiceArea: 'labor_law',
        city: 'Contagem',
        firstResponseMinutes: 20,
        slaStatus: 'breach',
      },
      {
        caseId: 'case-4',
        status: 'closed',
        assignedProfessionalId: 'prof-2',
        practiceArea: 'labor_law',
        city: 'Contagem',
        resolutionHours: 48,
        firstResponseMinutes: 15,
        slaStatus: 'breach',
      },
      {
        caseId: 'case-5',
        status: 'closed',
        practiceArea: 'consumer_law',
        city: 'Betim',
        resolutionHours: 24,
      },
      {
        caseId: 'case-6',
        status: 'pending',
        assignedProfessionalId: null,
        practiceArea: null,
        city: 'Belo Horizonte',
        firstResponseMinutes: null,
        slaStatus: 'warning',
      },
    ],
  })

  assert.equal(snapshot.openCases, 4)
  assert.equal(snapshot.closedCases, 2)
  assert.equal(snapshot.backlog, 4)
  assert.equal(snapshot.activeProfessionals, 2)
  assert.equal(snapshot.averageResolutionHours, 36)
  assert.equal(snapshot.averageFirstResponseMinutes, 18.75)
  assert.equal(snapshot.slaWarningCases, 2)
  assert.equal(snapshot.slaBreachedCases, 1)
  assert.deepEqual(snapshot.casesPerProfessional, {
    'prof-1': 2,
    'prof-2': 1,
  })
  assert.deepEqual(snapshot.casesPerPracticeArea, {
    family_law: 2,
    labor_law: 1,
  })
  assert.deepEqual(snapshot.casesPerCity, {
    'Belo Horizonte': 3,
    Contagem: 1,
  })
})

test('operational snapshot ignores invalid numeric metrics and stays deterministic', () => {
  const builder = createOperationalSnapshotBuilder()
  const input = {
    tenantId: 11,
    entityId: 'office-2',
    builtAt: '2026-07-03T11:00:00.000Z',
    cases: [
      {
        caseId: 'case-1',
        status: 'closed' as const,
        resolutionHours: Number.NaN,
        firstResponseMinutes: Number.POSITIVE_INFINITY,
      },
      {
        caseId: 'case-2',
        status: 'open' as const,
        firstResponseMinutes: 12,
      },
    ],
  }

  const first = builder.build(input)
  const second = builder.build(input)

  assert.deepEqual(first, second)
  assert.equal(first.averageResolutionHours, null)
  assert.equal(first.averageFirstResponseMinutes, 12)
})

test('operational snapshot repository upserts by tenant and entity without persistence side effects', () => {
  const repository = createOperationalSnapshotRepository()

  const first = buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-03T12:00:00.000Z',
    cases: [],
  })
  const second = buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-1',
    builtAt: '2026-07-03T13:00:00.000Z',
    cases: [
      {
        caseId: 'case-1',
        status: 'open',
      },
    ],
  })

  repository.upsert(first)
  repository.upsert(second)

  assert.equal(repository.list().length, 1)
  assert.deepEqual(repository.get(11, 'office-1'), second)
})

test('operational snapshot builder has no UI or browser dependency', () => {
  assert.equal('window' in globalThis, false)
  assert.equal('document' in globalThis, false)

  const snapshot = buildOperationalSnapshot({
    tenantId: 11,
    entityId: 'office-3',
    builtAt: '2026-07-03T14:00:00.000Z',
    cases: [],
  })

  assert.equal(snapshot.openCases, 0)
  assert.equal(snapshot.closedCases, 0)
})
