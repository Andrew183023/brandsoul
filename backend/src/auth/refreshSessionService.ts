import { randomUUID } from 'node:crypto'

import { AuthError } from './authErrors.js'
import type { RequestClientContext, RefreshSessionRecord } from './authTypes.js'
import { RefreshSessionRepository } from './repositories/refreshSessionRepository.js'
import { TokenService } from './tokenService.js'

type CreateRefreshSessionArgs = {
  userId: number
  tenantId: number
  parentSessionId?: string
  familyId?: string
  clientContext?: RequestClientContext
}

export class RefreshSessionService {
  constructor(
    private readonly repository: RefreshSessionRepository,
    private readonly tokenService: TokenService,
    private readonly refreshTokenTtlDays: number,
  ) {}

  async createRefreshSession(args: CreateRefreshSessionArgs) {
    const rawToken = this.tokenService.generateOpaqueRefreshToken()
    const now = new Date()
    const issuedAt = now.toISOString()
    const expiresAt = new Date(now.getTime() + this.refreshTokenTtlDays * 24 * 60 * 60_000).toISOString()
    const session = await this.repository.create({
      id: randomUUID(),
      familyId: args.familyId ?? randomUUID(),
      parentSessionId: args.parentSessionId,
      userId: args.userId,
      tenantId: args.tenantId,
      tokenHash: this.tokenService.hashOpaqueToken(rawToken),
      tokenFingerprint: this.tokenService.fingerprintOpaqueToken(rawToken),
      status: 'active',
      issuedAt,
      expiresAt,
      createdByIp: args.clientContext?.ip,
      createdByUserAgent: args.clientContext?.userAgent,
      authVersion: 1,
    })

    return {
      rawToken,
      session,
    }
  }

  async getSessionForRefreshToken(rawRefreshToken: string) {
    const tokenHash = this.tokenService.hashOpaqueToken(rawRefreshToken)
    const session = await this.repository.findByTokenHash(tokenHash)
    if (!session) {
      throw AuthError.invalidRefreshToken()
    }

    const now = new Date().toISOString()
    if (session.expiresAt <= now || session.status === 'expired') {
      await this.repository.markExpired(session.id, now)
      throw AuthError.refreshExpired()
    }

    if (session.status === 'rotated' || session.status === 'reuse_detected') {
      await this.repository.revokeFamily(session.familyId, 'reuse_detected', now)
      throw AuthError.refreshReuseDetected()
    }

    if (session.status === 'revoked') {
      throw AuthError.sessionRevoked()
    }

    if (session.status !== 'active') {
      throw AuthError.invalidRefreshToken()
    }

    return session
  }

  async rotateRefreshSession(currentSession: RefreshSessionRecord, clientContext?: RequestClientContext) {
    const next = await this.createRefreshSession({
      userId: currentSession.userId,
      tenantId: currentSession.tenantId,
      familyId: currentSession.familyId,
      parentSessionId: currentSession.id,
      clientContext,
    })
    const now = new Date().toISOString()

    await this.repository.markRotated(currentSession.id, {
      replacedBySessionId: next.session.id,
      rotatedAt: now,
      lastUsedAt: now,
      lastUsedIp: clientContext?.ip,
      lastUsedUserAgent: clientContext?.userAgent,
    })
    await this.repository.attachParentSession(next.session.id, currentSession.id)

    return next
  }

  async revokeRefreshSession(rawRefreshToken: string, reason: 'logout' | 'admin_revoked' = 'logout') {
    const tokenHash = this.tokenService.hashOpaqueToken(rawRefreshToken)
    const session = await this.repository.findByTokenHash(tokenHash)
    if (!session) {
      return null
    }

    await this.repository.revokeSession(session.id, reason, new Date().toISOString())
    return session
  }

  async revokeAllSessionsForUser(userId: number, tenantId: number, reason: 'logout_global' | 'admin_revoked' = 'logout_global') {
    await this.repository.revokeAllForUser(userId, tenantId, reason, new Date().toISOString())
  }
}

export function createRefreshSessionService(repository: RefreshSessionRepository, tokenService: TokenService, refreshTokenTtlDays: number) {
  return new RefreshSessionService(repository, tokenService, refreshTokenTtlDays)
}