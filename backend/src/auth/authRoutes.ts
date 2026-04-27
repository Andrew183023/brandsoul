import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { getRequestAuth, requireAuth } from '../api/middleware/requireAuth.js'
import { isAuthError, toAuthErrorResponse } from './authErrors.js'

type BackendContext = {
  backendContext: {
    auth: {
      authService: {
        register(input: { name: string; email: string; password: string; tenantName: string; businessModel: 'product' | 'service' | 'hybrid' | 'professional' }, clientContext: { ip?: string; userAgent?: string }): Promise<unknown>
        login(email: string, password: string, clientContext: { ip?: string; userAgent?: string }): Promise<unknown>
        requestPasswordReset(email: string): Promise<unknown>
        resetPasswordWithToken(token: string, newPassword: string): Promise<unknown>
        refresh(rawRefreshToken: string, clientContext: { ip?: string; userAgent?: string }): Promise<unknown>
        logout(rawRefreshToken?: string): Promise<void>
        logoutAll(userId: number, tenantId: number): Promise<void>
        getCurrentUser(userId: number): Promise<unknown>
        getCurrentTenant(tenantId: number): Promise<unknown>
      }
      jwksService: {
        getJwks(): Promise<{ keys: Array<Record<string, unknown>> }>
      }
    }
  }
}

function getAuthService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.auth.authService
}

function getJwksService(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.auth.jwksService
}

function getClientContext(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
  }
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (isAuthError(error)) {
    return reply.status(error.statusCode).send(toAuthErrorResponse(error))
  }

  return reply.status(500).send({
    status: 'failed',
    error: {
      code: 'internal_error',
      message: 'Authentication request failed.',
    },
  })
}

export async function registerAuthRoutes(app: FastifyInstance) {
  // New TypeScript auth authority. User and tenant resolution still depends on the legacy Python auth store during this migration phase.
  app.post<{
    Body: {
      name?: string
      email?: string
      password?: string
      tenant_name?: string
      business_model?: 'product' | 'service' | 'hybrid' | 'professional'
    }
  }>('/auth/register', async (request, reply) => {
    const name = request.body?.name?.trim() ?? ''
    const email = request.body?.email?.trim().toLowerCase() ?? ''
    const password = request.body?.password ?? ''
    const tenantName = request.body?.tenant_name?.trim() ?? ''
    const businessModel = request.body?.business_model ?? 'hybrid'

    if (!name || !email || !password || !tenantName) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'invalid_registration',
          message: 'name, email, password and tenant_name are required.',
        },
      })
    }

    try {
      const result = await getAuthService(app).register({
        name,
        email,
        password,
        tenantName,
        businessModel,
      }, getClientContext(request))
      return reply.send(result)
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post<{ Body: { email?: string; password?: string } }>('/auth/login', async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase()
    const password = request.body?.password ?? ''

    if (!email || !password) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'invalid_credentials',
          message: 'Email and password are required.',
        },
      })
    }

    try {
      const result = await getAuthService(app).login(email, password, getClientContext(request))
      return reply.send(result)
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post<{ Body: { refreshToken?: string } }>('/auth/refresh', async (request, reply) => {
    const refreshToken = request.body?.refreshToken?.trim()
    if (!refreshToken) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'invalid_refresh_token',
          message: 'refreshToken is required.',
        },
      })
    }

    try {
      const result = await getAuthService(app).refresh(refreshToken, getClientContext(request))
      return reply.send(result)
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post<{ Body: { refreshToken?: string } }>('/auth/logout', async (request, reply) => {
    try {
      await getAuthService(app).logout(request.body?.refreshToken?.trim())
      return reply.send({ status: 'ready' })
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post('/auth/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'invalid_token',
          message: 'Authentication required.',
        },
      })
    }

    try {
      await getAuthService(app).logoutAll(auth.userId, auth.tenantId)
      return reply.send({ status: 'ready' })
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'invalid_token',
          message: 'Authentication required.',
        },
      })
    }

    const user = await getAuthService(app).getCurrentUser(auth.userId)
    if (!user) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'invalid_token',
          message: 'User not available.',
        },
      })
    }

    return reply.send(user)
  })

  app.get('/tenant/me', { preHandler: requireAuth }, async (request, reply) => {
    const auth = getRequestAuth(request)
    if (!auth) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'invalid_token',
          message: 'Authentication required.',
        },
      })
    }

    const tenant = await getAuthService(app).getCurrentTenant(auth.tenantId)
    if (!tenant) {
      return reply.status(403).send({
        status: 'failed',
        error: {
          code: 'invalid_token',
          message: 'Tenant access denied.',
        },
      })
    }

    return reply.send(tenant)
  })

  app.get('/.well-known/jwks.json', async (_request, reply) => {
    try {
      return reply.send(await getJwksService(app).getJwks())
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post<{ Body: { email?: string } }>('/auth/forgot-password', async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase()
    if (!email) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'invalid_credentials',
          message: 'email is required.',
        },
      })
    }

    try {
      const result = await getAuthService(app).requestPasswordReset(email)
      return reply.send(result)
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })

  app.post<{ Body: { token?: string; new_password?: string } }>('/auth/reset-password', async (request, reply) => {
    const token = request.body?.token?.trim()
    const newPassword = request.body?.new_password ?? ''
    if (!token || !newPassword) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'invalid_reset_token',
          message: 'token and new_password are required.',
        },
      })
    }

    try {
      const result = await getAuthService(app).resetPasswordWithToken(token, newPassword)
      return reply.send(result)
    } catch (error) {
      return sendAuthError(reply, error)
    }
  })
}