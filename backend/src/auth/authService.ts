import { randomUUID } from 'node:crypto'

import bcrypt from 'bcryptjs'
import type { BackendDatabase } from '../db/index.js'
import { getEmailFrom, getPasswordResetExpiryMinutes, getPasswordResetUrlBase, getResendApiKey } from '../config/env.js'
import type { ObservabilityService } from '../services/observabilityService.js'
import type { AuthConfig } from './authConfig.js'
import { AuthError } from './authErrors.js'
import type { AuthPrincipal, AuthTokenBundle, RequestClientContext } from './authTypes.js'
import { toPublicTenant, toPublicUser } from './authTypes.js'
import { createAccessAuditRepository } from './repositories/accessAuditRepository.js'
import { LegacyAuthStoreRepository } from './repositories/legacyAuthStoreRepository.js'
import { createRefreshSessionRepository } from './repositories/refreshSessionRepository.js'
import { createSigningKeyRepository } from './repositories/signingKeyRepository.js'
import { createRefreshSessionService } from './refreshSessionService.js'
import { SigningKeyService } from './signingKeyService.js'
import { TokenService, verifyPassword } from './tokenService.js'

export class AuthService {
  constructor(
    private readonly db: BackendDatabase,
    private readonly config: AuthConfig,
    private readonly legacyAuthStoreRepository: LegacyAuthStoreRepository,
    private readonly signingKeyService: SigningKeyService,
    private readonly tokenService: TokenService,
    private readonly observability: ObservabilityService,
  ) {}

  private createPasswordHash(password: string) {
    return bcrypt.hashSync(password, 10)
  }

  private buildUniqueTenantSlug = async (tenantName: string) => {
    const baseSlug = tenantName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'marca'

    let candidate = baseSlug
    let suffix = 1

    while (await this.legacyAuthStoreRepository.findTenantBySlug(candidate)) {
      suffix += 1
      candidate = `${baseSlug}-${suffix}`
    }

    return candidate
  }

  private buildPasswordResetUrl(token: string) {
    const baseUrl = getPasswordResetUrlBase()
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}token=${encodeURIComponent(token)}`
  }

  private async sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = this.buildPasswordResetUrl(token)
    const resendApiKey = getResendApiKey()
    const emailFrom = getEmailFrom()

    if (!resendApiKey || !emailFrom) {
      console.info(`RESET LINK for ${email}: ${resetUrl}`)
      return
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [email],
          subject: 'Redefinir senha da sua conta BrandSoul',
          html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${resetUrl}">Clique aqui para continuar</a></p><p>Se voce nao solicitou isso, ignore este email.</p>`,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.warn(`Failed to send password reset email for ${email}: ${response.status} ${errorBody}`)
      }
    } catch (error) {
      console.warn(`Password reset email request failed for ${email}:`, error)
    }
  }

  private async issueTokenBundle(principal: AuthPrincipal, clientContext: RequestClientContext, flow: 'login' | 'refresh'): Promise<AuthTokenBundle> {
    const signingKey = await this.signingKeyService.getActiveSigningKey()

    return this.db.transaction(async (txDb) => {
      const refreshSessionService = createRefreshSessionService(
        createRefreshSessionRepository(txDb),
        this.tokenService,
        this.config.refreshTokenTtlDays,
      )
      const auditRepository = createAccessAuditRepository(txDb)
      const signingKeyRepository = createSigningKeyRepository(txDb)
      const refreshSession = await refreshSessionService.createRefreshSession({
        userId: principal.user.id,
        tenantId: principal.tenant.id,
        clientContext,
      })
      const issuedToken = await this.tokenService.issueAccessToken({
        principal,
        signingKey,
        sessionId: refreshSession.session.id,
      })

      await auditRepository.create({
        id: randomUUID(),
        jti: issuedToken.payload.jti,
        sessionId: refreshSession.session.id,
        userId: principal.user.id,
        tenantId: principal.tenant.id,
        kid: signingKey.kid,
        tokenVersion: issuedToken.payload.ver,
        issuedAt: new Date(issuedToken.payload.iat * 1000).toISOString(),
        expiresAt: new Date(issuedToken.payload.exp * 1000).toISOString(),
        audience: issuedToken.payload.aud,
        issuer: issuedToken.payload.iss,
        issuedByFlow: flow,
        issuedByIp: clientContext.ip,
        issuedByUserAgent: clientContext.userAgent,
      })
      await signingKeyRepository.incrementIssuedTokenCount(signingKey.id)

      this.observability.increment('auth_token_emitted')

      return {
        tokenType: 'Bearer' as const,
        accessToken: issuedToken.token,
        refreshToken: refreshSession.rawToken,
        expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
        token: issuedToken.token,
        user: toPublicUser(principal.user),
        tenant: toPublicTenant(principal.tenant),
      }
    })
  }

  private async resolvePrincipalByEmail(email: string, password: string): Promise<AuthPrincipal> {
    const user = await this.legacyAuthStoreRepository.findUserByEmail(email)
    if (!user?.isActive || !verifyPassword(password, user.passwordHash)) {
      this.observability.increment('auth_login_failure')
      this.observability.increment('auth_failures')
      throw AuthError.invalidCredentials()
    }

    const membership = await this.legacyAuthStoreRepository.findMembershipForUser(user.id)
    if (!membership) {
      this.observability.increment('auth_login_failure')
      this.observability.increment('auth_failures')
      throw AuthError.invalidCredentials()
    }

    const tenant = await this.legacyAuthStoreRepository.findTenantById(membership.tenantId)
    if (!tenant?.isActive) {
      this.observability.increment('auth_login_failure')
      this.observability.increment('auth_failures')
      throw AuthError.invalidCredentials()
    }

    return {
      user,
      tenant,
      membership,
      roles: [membership.role.trim().toLowerCase()],
    }
  }

  async login(email: string, password: string, clientContext: RequestClientContext): Promise<AuthTokenBundle> {
    if (!this.signingKeyService.isConfigured()) {
      throw AuthError.authNotConfigured()
    }

    const principal = await this.resolvePrincipalByEmail(email, password)
    const bundle = await this.issueTokenBundle(principal, clientContext, 'login')

    this.observability.increment('auth_login_success')
    return bundle
  }

  async register(input: {
    name: string
    email: string
    password: string
    tenantName?: string
    businessModel: 'product' | 'service' | 'hybrid' | 'professional'
    accountMode?: 'client' | 'owner'
  }, clientContext: RequestClientContext): Promise<AuthTokenBundle> {
    if (!this.signingKeyService.isConfigured()) {
      throw AuthError.authNotConfigured()
    }

    const normalizedName = input.name.trim()
    const normalizedEmail = input.email.trim().toLowerCase()
    const accountMode = input.accountMode === 'client' ? 'client' : 'owner'
    const normalizedTenantName = (input.tenantName ?? '').trim()
    const resolvedTenantName = accountMode === 'client'
      ? `Cliente ${normalizedName}`
      : normalizedTenantName

    if (
      normalizedName.length < 2
      || normalizedEmail.length < 5
      || input.password.length < 8
      || resolvedTenantName.length < 2
    ) {
      throw AuthError.invalidRegistration()
    }

    if (await this.legacyAuthStoreRepository.findUserByEmail(normalizedEmail)) {
      throw AuthError.emailAlreadyRegistered()
    }

    const tenantSlug = await this.buildUniqueTenantSlug(resolvedTenantName)
    const user = await this.legacyAuthStoreRepository.createUser({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: this.createPasswordHash(input.password),
    })
    if (!user) {
      throw AuthError.invalidRegistration('Unable to create user.')
    }

    const tenant = await this.legacyAuthStoreRepository.createTenant({
      name: resolvedTenantName,
      slug: tenantSlug,
      businessModel: accountMode === 'client' ? 'professional' : input.businessModel,
    })
    if (!tenant) {
      throw AuthError.invalidRegistration('Unable to create tenant.')
    }

    const membership = await this.legacyAuthStoreRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: accountMode === 'client' ? 'client' : 'owner',
    })
    if (!membership) {
      throw AuthError.invalidRegistration('Unable to create membership.')
    }

    const principal: AuthPrincipal = {
      user,
      tenant,
      membership,
      roles: [membership.role.trim().toLowerCase()],
    }

    const bundle = await this.issueTokenBundle(principal, clientContext, 'login')
    this.observability.increment('auth_login_success')
    return bundle
  }

  async refresh(rawRefreshToken: string, clientContext: RequestClientContext): Promise<AuthTokenBundle> {
    if (!this.signingKeyService.isConfigured()) {
      throw AuthError.authNotConfigured()
    }

    try {
      const lookupRefreshService = createRefreshSessionService(
        createRefreshSessionRepository(this.db),
        this.tokenService,
        this.config.refreshTokenTtlDays,
      )
      const currentSession = await lookupRefreshService.getSessionForRefreshToken(rawRefreshToken)
      const user = await this.legacyAuthStoreRepository.findUserById(currentSession.userId)
      const tenant = await this.legacyAuthStoreRepository.findTenantById(currentSession.tenantId)
      const membership = await this.legacyAuthStoreRepository.findMembershipForUser(currentSession.userId)

      if (!user?.isActive || !tenant?.isActive || !membership) {
        throw AuthError.sessionRevoked()
      }

      const principal: AuthPrincipal = {
        user,
        tenant,
        membership,
        roles: [membership.role.trim().toLowerCase()],
      }
      const signingKey = await this.signingKeyService.getActiveSigningKey()

      const bundle = await this.db.transaction(async (txDb) => {
        const refreshSessionService = createRefreshSessionService(
          createRefreshSessionRepository(txDb),
          this.tokenService,
          this.config.refreshTokenTtlDays,
        )
        const auditRepository = createAccessAuditRepository(txDb)
        const signingKeyRepository = createSigningKeyRepository(txDb)
        const transactionalCurrentSession = await refreshSessionService.getSessionForRefreshToken(rawRefreshToken)
        const nextSession = await refreshSessionService.rotateRefreshSession(transactionalCurrentSession, clientContext)
        const issuedToken = await this.tokenService.issueAccessToken({
          principal,
          signingKey,
          sessionId: nextSession.session.id,
        })

        await auditRepository.create({
          id: randomUUID(),
          jti: issuedToken.payload.jti,
          sessionId: nextSession.session.id,
          userId: principal.user.id,
          tenantId: principal.tenant.id,
          kid: signingKey.kid,
          tokenVersion: issuedToken.payload.ver,
          issuedAt: new Date(issuedToken.payload.iat * 1000).toISOString(),
          expiresAt: new Date(issuedToken.payload.exp * 1000).toISOString(),
          audience: issuedToken.payload.aud,
          issuer: issuedToken.payload.iss,
          issuedByFlow: 'refresh',
          issuedByIp: clientContext.ip,
          issuedByUserAgent: clientContext.userAgent,
        })
        await signingKeyRepository.incrementIssuedTokenCount(signingKey.id)

        this.observability.increment('auth_token_emitted')

        return {
          tokenType: 'Bearer' as const,
          accessToken: issuedToken.token,
          refreshToken: nextSession.rawToken,
          expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
          token: issuedToken.token,
          user: toPublicUser(principal.user),
          tenant: toPublicTenant(principal.tenant),
        }
      })

      this.observability.increment('auth_refresh_success')
      return bundle
    } catch (error) {
      this.observability.increment('auth_refresh_failure')
      this.observability.increment('auth_failures')
      if (error instanceof AuthError && error.code === 'refresh_reuse_detected') {
        this.observability.increment('auth_refresh_reuse_detected')
      }
      throw error
    }
  }

  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) {
      return
    }

    const refreshSessionService = createRefreshSessionService(
      createRefreshSessionRepository(this.db),
      this.tokenService,
      this.config.refreshTokenTtlDays,
    )
    await refreshSessionService.revokeRefreshSession(rawRefreshToken, 'logout')
    this.observability.increment('auth_logout')
  }

  async logoutAll(userId: number, tenantId: number) {
    const refreshSessionService = createRefreshSessionService(
      createRefreshSessionRepository(this.db),
      this.tokenService,
      this.config.refreshTokenTtlDays,
    )
    await refreshSessionService.revokeAllSessionsForUser(userId, tenantId, 'logout_global')
    this.observability.increment('auth_logout_all')
  }

  async getCurrentUser(userId: number) {
    const user = await this.legacyAuthStoreRepository.findUserById(userId)
    return user ? toPublicUser(user) : null
  }

  async getCurrentTenant(tenantId: number) {
    const tenant = await this.legacyAuthStoreRepository.findTenantById(tenantId)
    return tenant ? toPublicTenant(tenant) : null
  }

  async requestPasswordReset(email: string) {
    const user = await this.legacyAuthStoreRepository.findUserByEmail(email.trim().toLowerCase())
    if (!user) {
      return { message: 'Se existir uma conta com este email, enviaremos instruções.' }
    }

    const expiresAt = new Date(Date.now() + (getPasswordResetExpiryMinutes() * 60 * 1000)).toISOString()
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
    await this.legacyAuthStoreRepository.createPasswordResetToken({
      userId: user.id,
      token,
      expiresAt,
    })
    await this.sendPasswordResetEmail(user.email, token)

    return { message: 'Se existir uma conta com este email, enviaremos instruções.' }
  }

  async resetPasswordWithToken(token: string, newPassword: string) {
    if (newPassword.trim().length < 8) {
      throw AuthError.invalidResetToken()
    }

    const resetToken = await this.legacyAuthStoreRepository.findPasswordResetTokenByToken(token.trim())
    if (!resetToken || resetToken.usedAt) {
      throw AuthError.invalidResetToken()
    }

    if (new Date(resetToken.expiresAt).getTime() < Date.now()) {
      throw AuthError.invalidResetToken()
    }

    const user = await this.legacyAuthStoreRepository.findUserById(resetToken.userId)
    if (!user?.isActive) {
      throw AuthError.invalidResetToken()
    }

    await this.legacyAuthStoreRepository.updateUserPassword(user.id, this.createPasswordHash(newPassword))
    await this.legacyAuthStoreRepository.markPasswordResetTokenUsed(resetToken.id)
    return { message: 'Senha redefinida com sucesso' }
  }
}

export function createAuthService(
  db: BackendDatabase,
  config: AuthConfig,
  legacyAuthStoreRepository: LegacyAuthStoreRepository,
  signingKeyService: SigningKeyService,
  tokenService: TokenService,
  observability: ObservabilityService,
) {
  return new AuthService(db, config, legacyAuthStoreRepository, signingKeyService, tokenService, observability)
}
