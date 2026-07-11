import type { FastifyInstance } from 'fastify'

import type { ExecutiveMemoryRuntime } from '../../modules/executive/index.js'
import {
  createExecutiveMemoryOperationalInvocationAdapter,
  ExecutiveMemoryOperationalInvocationForbiddenError,
} from '../../modules/executive/index.js'
import { createRateLimit } from '../middleware/rateLimit.js'
import { getRequestAuth, requireAuth } from '../middleware/requireAuth.js'

type BackendContext = {
  backendContext: {
    executiveMemoryRuntime: Pick<ExecutiveMemoryRuntime, 'operationalInvocationService'>
  }
}

type OperationalInvocationBody = {
  maxBatches?: number
  limit?: number
}

const privateWriteRateLimit = createRateLimit({
  namespace: 'legal-beta-executive-memory-operational-invocation-write',
  max: 30,
  windowMs: 60_000,
  key: 'user',
})

const ALLOWED_BODY_KEYS = new Set(['maxBatches', 'limit'])
const INVALID_REQUEST_CODE = 'INVALID_EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_REQUEST'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRuntime(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.executiveMemoryRuntime
}

function buildInvalidRequestError(message: string) {
  return {
    status: 'failed' as const,
    error: {
      code: INVALID_REQUEST_CODE,
      message,
    },
  }
}

function readOptionalInteger(value: unknown, fieldName: 'maxBatches' | 'limit') {
  if (typeof value === 'undefined') {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Executive memory operational invocation request requires ${fieldName} to be an integer when provided.`)
  }

  return value
}

function parseRequestBody(body: unknown): OperationalInvocationBody {
  if (typeof body === 'undefined') {
    return {}
  }

  if (!isPlainObject(body)) {
    throw new Error('Executive memory operational invocation request body must be an object.')
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      throw new Error(`Executive memory operational invocation request does not allow "${key}".`)
    }
  }

  return {
    maxBatches: readOptionalInteger(body.maxBatches, 'maxBatches'),
    limit: readOptionalInteger(body.limit, 'limit'),
  }
}

export async function registerLegalBetaExecutiveMemoryOperationalInvocationRoutes(app: FastifyInstance) {
  const adapter = createExecutiveMemoryOperationalInvocationAdapter({
    operationalInvocationService: getRuntime(app).operationalInvocationService,
  })

  app.post<{ Body: unknown }>(
    '/admin/executive-memory/run',
    { preHandler: [requireAuth, privateWriteRateLimit] },
    async (request, reply) => {
      const auth = getRequestAuth(request)
      if (!auth) {
        return reply.status(401).send({
          status: 'failed',
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required.',
          },
        })
      }

      let body: OperationalInvocationBody
      try {
        body = parseRequestBody(request.body)
      } catch (error) {
        return reply.status(400).send(
          buildInvalidRequestError(
            error instanceof Error
              ? error.message
              : 'Executive memory operational invocation request is invalid.',
          ),
        )
      }

      try {
        const result = await adapter.invoke({
          principal: auth,
          maxBatches: body.maxBatches,
          limit: body.limit,
        })

        return reply.send(result)
      } catch (error) {
        if (error instanceof ExecutiveMemoryOperationalInvocationForbiddenError) {
          return reply.status(403).send({
            status: 'failed',
            error: {
              code: error.code,
              message: error.message,
            },
          })
        }

        throw error
      }
    },
  )
}
