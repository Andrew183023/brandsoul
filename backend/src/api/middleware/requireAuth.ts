import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthContext } from '../../auth/authTypes.js'
export type { AuthContext } from '../../auth/authTypes.js'
import { AuthError } from '../../auth/authErrors.js'

type BackendContext = {
  backendContext: {
    auth: {
      tokenService: {
        verifyAccessToken(token: string): Promise<AuthContext>
      }
    }
    observability: {
      increment(name: 'auth_failures' | 'auth_token_validation_failed', value?: number): void
    }
  }
}

function readBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return null
  }

  return authorization.slice('bearer '.length).trim() || null
}

function getTokenService(request: FastifyRequest) {
  return ((request.server as FastifyRequest['server'] & BackendContext).backendContext.auth.tokenService)
}

function getObservability(request: FastifyRequest) {
  return ((request.server as FastifyRequest['server'] & BackendContext).backendContext.observability)
}

export function getRequestAuth(request: FastifyRequest): AuthContext | undefined {
  return request.auth
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = readBearerToken(request)
  if (!token) {
    request.log.warn({
      event: 'auth.failed',
      traceId: request.traceId ?? request.id,
      reason: 'missing_bearer',
    }, 'Authentication required')
    return reply.status(401).send({
      status: 'failed',
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      },
    })
  }

  try {
    request.auth = await getTokenService(request).verifyAccessToken(token)
  } catch (error) {
    getObservability(request).increment('auth_failures')
    getObservability(request).increment('auth_token_validation_failed')
    request.log.warn({
      event: 'auth.failed',
      traceId: request.traceId ?? request.id,
      reason: 'invalid_token',
      message: error instanceof Error ? error.message : 'Invalid or expired token.',
    }, 'Authentication failed')
    const authError = error instanceof AuthError ? error : AuthError.invalidToken()
    return reply.status(401).send({
      status: 'failed',
      error: {
        code: authError.code,
        message: authError.message,
      },
    })
  }
}

export async function optionalAuth(request: FastifyRequest) {
  const token = readBearerToken(request)
  if (!token) {
    return
  }

  try {
    request.auth = await getTokenService(request).verifyAccessToken(token)
  } catch {
    request.auth = undefined
  }
}
