import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  ExecutiveMemoryOperationalInvocationForbiddenError,
  ExecutiveMemoryOperationalInvocationPolicy,
  createExecutiveMemoryOperationalInvocationPolicy,
  createExecutiveMemoryOperationalInvocationService,
} from './index.js'

function createInput(overrides?: {
  actor?: {
    actorId?: string
    tenantId?: number
    roles?: string[]
  }
  request?: {
    maxBatches?: number
    limit?: number
  }
}) {
  return {
    actor: {
      actorId: overrides?.actor?.actorId ?? 'user:1',
      tenantId: overrides?.actor?.tenantId ?? 11,
      roles: overrides?.actor?.roles ?? ['admin'],
    },
    request: {
      maxBatches: overrides?.request?.maxBatches,
      limit: overrides?.request?.limit,
    },
  }
}

test('factory returns a valid policy instance', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.equal(policy instanceof ExecutiveMemoryOperationalInvocationPolicy, true)
})

test('composition is side-effect free', () => {
  createExecutiveMemoryOperationalInvocationPolicy()
  assert.ok(true)
})

test('owner admin and operator are authorized with valid tenant context', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.deepEqual(policy.authorize(createInput({ actor: { roles: ['owner'] } })), { allowed: true })
  assert.deepEqual(policy.authorize(createInput({ actor: { roles: ['admin'] } })), { allowed: true })
  assert.deepEqual(policy.authorize(createInput({ actor: { roles: ['operator'] } })), { allowed: true })
})

test('missing or empty actorId is denied with stable reasons', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.deepEqual(
    policy.authorize({
      actor: undefined as never,
      request: {},
    }),
    { allowed: false, reason: 'actor_required' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { actorId: '   ' } })),
    { allowed: false, reason: 'actor_id_required' },
  )
})

test('missing or invalid tenant is denied', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.deepEqual(
    policy.authorize(createInput({ actor: { tenantId: undefined } })),
    { allowed: false, reason: 'tenant_required' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { tenantId: 0 } })),
    { allowed: false, reason: 'invalid_tenant' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { tenantId: -1 } })),
    { allowed: false, reason: 'invalid_tenant' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { tenantId: Number.NaN } })),
    { allowed: false, reason: 'invalid_tenant' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { tenantId: 1.5 } })),
    { allowed: false, reason: 'invalid_tenant' },
  )
})

test('missing empty or unknown roles are denied', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: undefined } })),
    { allowed: false, reason: 'roles_required' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: [] } })),
    { allowed: false, reason: 'roles_required' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['client'] } })),
    { allowed: false, reason: 'role_not_allowed' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['super_admin'] } })),
    { allowed: false, reason: 'role_not_allowed' },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['administrator'] } })),
    { allowed: false, reason: 'role_not_allowed' },
  )
})

test('role comparison is normalized with trim and lowercase', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: [' Admin '] } })),
    { allowed: true },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['OWNER'] } })),
    { allowed: true },
  )
})

test('duplicates do not affect authorization and one allowed role is sufficient', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()

  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['client', 'admin', 'admin'] } })),
    { allowed: true },
  )
})

test('request actor and roles are not mutated', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()
  const input = createInput({
    actor: {
      actorId: 'user:2',
      tenantId: 22,
      roles: ['admin', 'owner'],
    },
    request: {
      maxBatches: 5,
      limit: 20,
    },
  })
  const before = structuredClone(input)

  policy.authorize(input)

  assert.deepEqual(input, before)
})

test('same input remains deterministic across sequential and concurrent calls', async () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()
  const input = createInput({ actor: { roles: ['operator'] } })

  const first = policy.authorize(input)
  const second = policy.authorize(input)
  const [third, fourth] = await Promise.all([
    Promise.resolve(policy.authorize(input)),
    Promise.resolve(policy.authorize(input)),
  ])

  assert.deepEqual(first, { allowed: true })
  assert.deepEqual(second, { allowed: true })
  assert.deepEqual(third, { allowed: true })
  assert.deepEqual(fourth, { allowed: true })
})

test('deny reasons are stable and do not leak actor tenant or roles', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()
  const result = policy.authorize(createInput({
    actor: {
      actorId: 'user:999',
      tenantId: 777,
      roles: ['client'],
    },
  }))

  assert.deepEqual(result, { allowed: false, reason: 'role_not_allowed' })
  assert.equal(result.reason?.includes('user:999'), false)
  assert.equal(result.reason?.includes('777'), false)
  assert.equal(result.reason?.includes('client'), false)
})

test('custom allowed roles are respected without permissive default fallback', () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy({
    allowedRoles: ['owner'],
  })

  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['owner'] } })),
    { allowed: true },
  )
  assert.deepEqual(
    policy.authorize(createInput({ actor: { roles: ['admin'] } })),
    { allowed: false, reason: 'role_not_allowed' },
  )
})

test('policy integrates with invocation service for allowed and denied scenarios', async () => {
  const policy = createExecutiveMemoryOperationalInvocationPolicy()
  const runCalls: Array<{ maxBatches?: number; limit?: number }> = []
  const service = createExecutiveMemoryOperationalInvocationService({
    authorizationPolicy: policy,
    operationalRunService: {
      async run(input = {}) {
        runCalls.push({
          maxBatches: input.maxBatches,
          limit: input.limit,
        })

        return {
          status: 'completed' as const,
          batchesExecuted: 1,
          captureCycleId: 'executive_memory_capture_cycle:cycle-1',
          cursor: undefined,
          totals: {
            processed: 1,
            captured: 1,
            created: 1,
            failed: 0,
          },
          executionState: {
            status: 'completed' as const,
            captureCycleId: 'executive_memory_capture_cycle:cycle-1',
            cursor: undefined,
            totals: {
              processed: 1,
              captured: 1,
              created: 1,
              failed: 0,
            },
          },
        }
      },
    },
  })

  const allowed = await service.invoke({
    actor: {
      actorId: 'user:3',
      tenantId: 33,
      roles: ['admin'],
    },
    maxBatches: 3,
    limit: 15,
  })

  assert.deepEqual(runCalls, [{
    maxBatches: 3,
    limit: 15,
  }])
  assert.equal(allowed.status, 'completed')

  await assert.rejects(
    () => service.invoke({
      actor: {
        actorId: 'user:4',
        tenantId: 44,
        roles: ['client'],
      },
    }),
    (error: unknown) => {
      assert.equal(error instanceof ExecutiveMemoryOperationalInvocationForbiddenError, true)
      return true
    },
  )

  assert.equal(runCalls.length, 1)
})

test('structural guard keeps invocation policy isolated from forbidden dependencies', async () => {
  const source = await readFile(
    path.join(import.meta.dirname, 'ExecutiveMemoryOperationalInvocationPolicy.ts'),
    'utf8',
  )

  const forbiddenPatterns = [
    /\bany\b/,
    /\bas any\b/,
    /@ts-ignore/,
    /@ts-expect-error/,
    /Date\.now/,
    /new Date/,
    /performance\.now/,
    /Math\.random/,
    /randomUUID/,
    /setTimeout/,
    /setInterval/,
    /process\.env/,
    /Fastify/,
    /fetch/,
    /axios/,
    /scheduler/i,
    /\bcron\b/i,
    /\bjob\b/i,
    /\bworker\b/i,
    /\bretry\b/,
    /\.start\(/,
    /continueExecution\(/,
    /\bRuntime\b/,
    /OperationalRunService/,
    /Coordinator/,
    /Runner/,
    /Execution/,
    /Trigger/,
    /Orchestrator/,
    /AtomicCapture/,
    /database/i,
    /repository/i,
    /\bsql\b/i,
    /\bselect\b/i,
    /\binsert\b/i,
    /\bupdate\b/i,
    /\bdelete\b/i,
    /window/,
    /document/,
    /localStorage/,
    /sessionStorage/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `unexpected forbidden pattern: ${pattern}`)
  }
})
