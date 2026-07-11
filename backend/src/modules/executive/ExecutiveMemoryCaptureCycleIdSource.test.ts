import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { ExecutiveMemoryCaptureCycleIdSource } from './ExecutiveMemoryCaptureExecutionService.js'
import {
  CryptoExecutiveMemoryCaptureCycleIdSource,
  EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX,
  createExecutiveMemoryCaptureCycleIdSource,
} from './ExecutiveMemoryCaptureCycleIdSource.js'

function createUuidGenerator(values: string[]) {
  const calls: string[] = []
  const queue = [...values]

  return {
    calls,
    generateUuid() {
      const next = queue.shift()
      if (!next) {
        throw new Error('uuid generator exhausted')
      }

      calls.push(next)
      return next
    },
  }
}

test('factory returns a valid capture cycle id source implementation', () => {
  const source = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => '123e4567-e89b-42d3-a456-426614174000',
  })

  assert.equal(source instanceof CryptoExecutiveMemoryCaptureCycleIdSource, true)
})

test('source implements the executive memory capture cycle id source contract', () => {
  const source: ExecutiveMemoryCaptureCycleIdSource = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => '123e4567-e89b-42d3-a456-426614174000',
  })

  assert.equal(typeof source.nextCaptureCycleId, 'function')
})

test('one call generates exactly one id and preserves prefix plus uuid format', () => {
  const harness = createUuidGenerator(['123e4567-e89b-42d3-a456-426614174000'])
  const source = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: harness.generateUuid,
  })

  const cycleId = source.nextCaptureCycleId()

  assert.deepEqual(harness.calls, ['123e4567-e89b-42d3-a456-426614174000'])
  assert.equal(
    cycleId,
    `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174000`,
  )
})

test('two calls invoke the uuid generator twice and do not keep internal counters', () => {
  const harness = createUuidGenerator([
    '123e4567-e89b-42d3-a456-426614174000',
    '123e4567-e89b-42d3-a456-426614174001',
  ])
  const source = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: harness.generateUuid,
  })

  const first = source.nextCaptureCycleId()
  const second = source.nextCaptureCycleId()

  assert.deepEqual(harness.calls, [
    '123e4567-e89b-42d3-a456-426614174000',
    '123e4567-e89b-42d3-a456-426614174001',
  ])
  assert.equal(
    first,
    `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174000`,
  )
  assert.equal(
    second,
    `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:123e4567-e89b-42d3-a456-426614174001`,
  )
})

test('result stays opaque and does not contain whitespace tenant office timestamp cursor or payload data', () => {
  const source = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => '123e4567-e89b-42d3-a456-426614174000',
  })

  const cycleId = source.nextCaptureCycleId()

  assert.equal(/\s/.test(cycleId), false)
  assert.equal(cycleId.includes('tenant'), false)
  assert.equal(cycleId.includes('office'), false)
  assert.equal(cycleId.includes('cursor'), false)
  assert.equal(cycleId.includes('contentFingerprint'), false)
  assert.equal(cycleId.includes('sourceFingerprint'), false)
  assert.equal(cycleId.includes('2026-'), false)
})

test('empty and whitespace uuid outputs are rejected', () => {
  const emptySource = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => '',
  })
  const whitespaceSource = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => '   ',
  })

  assert.throws(() => emptySource.nextCaptureCycleId(), /uuid/)
  assert.throws(() => whitespaceSource.nextCaptureCycleId(), /uuid/)
})

test('invalid uuid output is rejected and generator errors are propagated', () => {
  const invalidSource = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => 'not-a-uuid',
  })
  const error = new Error('uuid boom')
  const failingSource = createExecutiveMemoryCaptureCycleIdSource({
    generateUuid: () => {
      throw error
    },
  })

  assert.throws(() => invalidSource.nextCaptureCycleId(), /valid UUID/)
  assert.throws(() => failingSource.nextCaptureCycleId(), error)
})

test('dependencies are not mutated', () => {
  const dependencies = {
    generateUuid: () => '123e4567-e89b-42d3-a456-426614174000',
  }
  const before = structuredClone({
    hasGenerator: typeof dependencies.generateUuid === 'function',
  })

  const source = createExecutiveMemoryCaptureCycleIdSource(dependencies)
  source.nextCaptureCycleId()

  assert.deepEqual({
    hasGenerator: typeof dependencies.generateUuid === 'function',
  }, before)
})

test('productive cycle id source stays isolated from forbidden dependencies and primitives', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'backend/src/modules/executive/ExecutiveMemoryCaptureCycleIdSource.ts'),
    'utf-8',
  )

  assert.equal(
    /Date\.now|new Date|performance\.now|Math\.random|setTimeout|setInterval|process\.env|Fastify|fetch|axios|scheduler|cron|job|cursor|tenantId|officeId|contentFingerprint|sourceFingerprint|userId|window|document|localStorage|sessionStorage|\bany\b/i.test(source),
    false,
  )
  assert.equal(/repository|createDatabaseConnection|initializeDatabase|frontend|http/i.test(source), false)
  assert.equal(source.includes("from 'node:crypto'"), true)
  assert.equal(source.includes('randomUUID'), true)
})
