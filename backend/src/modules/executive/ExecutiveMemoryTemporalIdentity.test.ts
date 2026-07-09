import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildExecutiveMemoryObservationFingerprint,
  buildExecutiveMemoryObservationId,
  buildExecutiveMemoryObservationIdentity,
  buildExecutiveMemoryObservationIdentityFromProjection,
} from './ExecutiveMemoryTemporalIdentity.js'
import { EXECUTIVE_MEMORY_OBSERVATION_IDENTITY_VERSION } from './ExecutiveMemoryTemporalIdentityTypes.js'

function createIdentityInput(overrides?: Partial<{
  projectionVersion: number
  tenantId: number
  officeId: string
  captureCycleId: string
  contentFingerprint: string
  capturedAt: string
  sourceFingerprint: string
}>) {
  return {
    projectionVersion: overrides?.projectionVersion ?? 1,
    tenantId: overrides?.tenantId ?? 7,
    officeId: overrides?.officeId ?? 'office-1',
    captureCycleId: overrides?.captureCycleId ?? 'capture-cycle-1',
    contentFingerprint: overrides?.contentFingerprint ?? 'content-fingerprint-a',
    capturedAt: overrides?.capturedAt ?? '2026-07-10T10:00:00.000Z',
    sourceFingerprint: overrides?.sourceFingerprint ?? 'source-fingerprint-1',
  }
}

test('buildExecutiveMemoryObservationIdentity returns the formal observation boundary', () => {
  const input = createIdentityInput()

  const identity = buildExecutiveMemoryObservationIdentity({
    projectionVersion: input.projectionVersion,
    tenantId: input.tenantId,
    officeId: input.officeId,
    captureCycleId: input.captureCycleId,
    contentFingerprint: input.contentFingerprint,
  })

  assert.deepEqual(identity, {
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'content-fingerprint-a',
  })
})

test('observation identity can be derived from a projection boundary plus capture cycle id', () => {
  const input = createIdentityInput()

  const identity = buildExecutiveMemoryObservationIdentityFromProjection({
    projection: {
      projectionVersion: input.projectionVersion,
      tenantId: input.tenantId,
      officeId: input.officeId,
      contentFingerprint: input.contentFingerprint,
    },
    captureCycleId: input.captureCycleId,
  })

  assert.deepEqual(identity, {
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'content-fingerprint-a',
  })
})

test('observation fingerprint is deterministic for the same state and cycle', () => {
  const input = createIdentityInput()

  const first = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: input.projectionVersion,
    tenantId: input.tenantId,
    officeId: input.officeId,
    captureCycleId: input.captureCycleId,
    contentFingerprint: input.contentFingerprint,
  })
  const second = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: input.projectionVersion,
    tenantId: input.tenantId,
    officeId: input.officeId,
    captureCycleId: input.captureCycleId,
    contentFingerprint: input.contentFingerprint,
  })

  assert.equal(first, second)
})

test('same state with different cycles produces different observation fingerprints', () => {
  const baseline = createIdentityInput()

  const first = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: baseline.contentFingerprint,
  })
  const second = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: 'capture-cycle-2',
    contentFingerprint: baseline.contentFingerprint,
  })

  assert.notEqual(first, second)
})

test('different state within the same cycle produces different observation fingerprints', () => {
  const baseline = createIdentityInput()

  const first = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: 'content-fingerprint-a',
  })
  const second = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: 'content-fingerprint-b',
  })

  assert.notEqual(first, second)
})

test('tenant office and projection version participate in observation identity', () => {
  const baseline = createIdentityInput()

  const baseFingerprint = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: baseline.contentFingerprint,
  })

  assert.notEqual(
    baseFingerprint,
    buildExecutiveMemoryObservationFingerprint({
      projectionVersion: 2,
      tenantId: baseline.tenantId,
      officeId: baseline.officeId,
      captureCycleId: baseline.captureCycleId,
      contentFingerprint: baseline.contentFingerprint,
    }),
  )
  assert.notEqual(
    baseFingerprint,
    buildExecutiveMemoryObservationFingerprint({
      projectionVersion: baseline.projectionVersion,
      tenantId: 8,
      officeId: baseline.officeId,
      captureCycleId: baseline.captureCycleId,
      contentFingerprint: baseline.contentFingerprint,
    }),
  )
  assert.notEqual(
    baseFingerprint,
    buildExecutiveMemoryObservationFingerprint({
      projectionVersion: baseline.projectionVersion,
      tenantId: baseline.tenantId,
      officeId: 'office-2',
      captureCycleId: baseline.captureCycleId,
      contentFingerprint: baseline.contentFingerprint,
    }),
  )
})

test('capturedAt and sourceFingerprint do not participate in observation identity', () => {
  const baseline = createIdentityInput()
  const first = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: baseline.contentFingerprint,
  })
  const second = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: baseline.contentFingerprint,
  })

  assert.equal(first, second)
  assert.notEqual(baseline.capturedAt, '2026-07-10T11:00:00.000Z')
  assert.notEqual(baseline.sourceFingerprint, 'source-fingerprint-2')
})

test('observation id is deterministic and changes with the observation fingerprint', () => {
  const baseline = createIdentityInput()

  const first = buildExecutiveMemoryObservationId({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: baseline.contentFingerprint,
  })
  const second = buildExecutiveMemoryObservationId({
    projectionVersion: baseline.projectionVersion,
    tenantId: baseline.tenantId,
    officeId: baseline.officeId,
    captureCycleId: baseline.captureCycleId,
    contentFingerprint: 'content-fingerprint-b',
  })

  assert.notEqual(first, second)
  assert.match(first, /^executive_memory_observation:7:office-1:[a-f0-9]{64}$/)
})

test('A to B to A across distinct cycles produces three distinct observations', () => {
  const observationA1 = buildExecutiveMemoryObservationId({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  })
  const observationB = buildExecutiveMemoryObservationId({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-2',
    contentFingerprint: 'state-b',
  })
  const observationA2 = buildExecutiveMemoryObservationId({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-3',
    contentFingerprint: 'state-a',
  })

  assert.notEqual(observationA1, observationB)
  assert.notEqual(observationB, observationA2)
  assert.notEqual(observationA1, observationA2)
})

test('retry with the same state and same cycle produces the same observation identity', () => {
  const firstFingerprint = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  })
  const secondFingerprint = buildExecutiveMemoryObservationFingerprint({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  })
  const firstId = buildExecutiveMemoryObservationId({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  })
  const secondId = buildExecutiveMemoryObservationId({
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  })

  assert.equal(firstFingerprint, secondFingerprint)
  assert.equal(firstId, secondId)
})

test('fail-fast rejects invalid observation identity inputs and does not mutate input', () => {
  const invalidTenant = {
    projectionVersion: 1,
    tenantId: 0,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  }
  const invalidVersion = {
    projectionVersion: 0,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  }
  const invalidOffice = {
    projectionVersion: 1,
    tenantId: 7,
    officeId: '   ',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  }
  const invalidCycle = {
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: '   ',
    contentFingerprint: 'state-a',
  }
  const invalidContent = {
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: '   ',
  }
  const valid = {
    projectionVersion: 1,
    tenantId: 7,
    officeId: 'office-1',
    captureCycleId: 'capture-cycle-1',
    contentFingerprint: 'state-a',
  }
  const before = structuredClone(valid)

  assert.throws(() => buildExecutiveMemoryObservationIdentity(invalidTenant), /tenantId/)
  assert.throws(() => buildExecutiveMemoryObservationIdentity(invalidVersion), /projectionVersion/)
  assert.throws(() => buildExecutiveMemoryObservationIdentity(invalidOffice), /officeId/)
  assert.throws(() => buildExecutiveMemoryObservationIdentity(invalidCycle), /captureCycleId/)
  assert.throws(() => buildExecutiveMemoryObservationIdentity(invalidContent), /contentFingerprint/)
  assert.doesNotThrow(() => buildExecutiveMemoryObservationIdentity(valid))
  assert.deepEqual(valid, before)
})

test('identity version constant remains explicit', () => {
  assert.equal(EXECUTIVE_MEMORY_OBSERVATION_IDENTITY_VERSION, 1)
})

test('temporal identity implementation remains structurally isolated', async () => {
  const source = await readFile(new URL('./ExecutiveMemoryTemporalIdentity.ts', import.meta.url), 'utf-8')

  assert.equal(
    /db\/|repository|trigger|fastify|fetch|axios|react|window|document|localStorage|sessionStorage|Date\.now|new Date|performance\.now|Math\.random|randomUUID|setInterval|setTimeout|cron|\bany\b/.test(source),
    false,
  )
  assert.equal(source.includes("../../orchestrator/flowMindHashing.js") || source.includes('../../orchestrator/flowMindHashing.js'), true)
  assert.equal(/\.\.\.projection|\.\.\.input|\.\.\.executive/.test(source), false)
})
