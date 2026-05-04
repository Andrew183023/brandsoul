export type AuthUserRecord = {
  id: number
  name: string
  email: string
  passwordHash: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type AuthTenantRecord = {
  id: number
  name: string
  slug: string
  businessModel: 'product' | 'service' | 'hybrid' | 'professional'
  plan: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type AuthMembershipRecord = {
  id: number
  userId: number
  tenantId: number
  role: string
  createdAt: string
}

export type AuthPublicUser = {
  id: number
  name: string
  email: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AuthPublicTenant = {
  id: number
  name: string
  slug: string
  business_model: 'product' | 'service' | 'hybrid' | 'professional'
  plan: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AuthPrincipal = {
  user: AuthUserRecord
  tenant: AuthTenantRecord
  membership: AuthMembershipRecord
  roles: string[]
}

export type AuthContext = {
  token: string
  subject: string
  userId: number
  tenantId: number
  roles: string[]
  version: number
  issuer: string
  audience: string
  jti: string
  issuedAt: number
  expiresAt: number
  sessionId?: string
}

export type AccessTokenPayload = {
  iss: string
  aud: string
  sub: string
  tenant_id: string
  roles: string[]
  ver: number
  iat: number
  exp: number
  jti: string
  sid?: string
}

export type AccessTokenIssueFlow = 'login' | 'refresh' | 'service_exchange' | 'admin_issue'

export type AuthRefreshSessionStatus = 'active' | 'rotated' | 'revoked' | 'expired' | 'reuse_detected'

export type AuthRefreshRevokeReason = 'logout' | 'logout_global' | 'reuse_detected' | 'security_incident' | 'admin_revoked' | 'expired' | 'rotated'

export type RefreshSessionRecord = {
  id: string
  familyId: string
  parentSessionId?: string
  userId: number
  tenantId: number
  tokenHash: string
  tokenFingerprint: string
  status: AuthRefreshSessionStatus
  revokeReason?: AuthRefreshRevokeReason
  issuedAt: string
  expiresAt: string
  lastUsedAt?: string
  rotatedAt?: string
  revokedAt?: string
  createdByIp?: string
  createdByUserAgent?: string
  lastUsedIp?: string
  lastUsedUserAgent?: string
  replacedBySessionId?: string
  authVersion: number
  createdAt: string
  updatedAt: string
}

export type SigningKeyStatus = 'pending' | 'active' | 'verifying' | 'retired' | 'revoked'

export type SigningKeyRecord = {
  id: string
  kid: string
  algorithm: 'RS256'
  status: SigningKeyStatus
  publicKeyPem: string
  privateKeyRef: string
  notBefore: string
  activatesAt: string
  retiresAt?: string
  expiresAt?: string
  issuedTokenCount: number
  createdBy?: string
  rotationReason?: string
  createdAt: string
  updatedAt: string
}

export type AccessAuditRecord = {
  id: string
  jti: string
  sessionId?: string
  userId: number
  tenantId: number
  kid: string
  tokenVersion: number
  issuedAt: string
  expiresAt: string
  audience: string
  issuer: string
  issuedByFlow: AccessTokenIssueFlow
  issuedByIp?: string
  issuedByUserAgent?: string
  createdAt: string
}

export type AuthTokenBundle = {
  tokenType: 'Bearer'
  accessToken: string
  refreshToken: string
  expiresIn: number
  token: string
  user: AuthPublicUser
  tenant: AuthPublicTenant
}

export type RequestClientContext = {
  ip?: string
  userAgent?: string
}

export function toPublicUser(user: AuthUserRecord): AuthPublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    is_active: user.isActive,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }
}

export function toPublicTenant(tenant: AuthTenantRecord): AuthPublicTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    business_model: tenant.businessModel,
    plan: tenant.plan,
    is_active: tenant.isActive,
    created_at: tenant.createdAt,
    updated_at: tenant.updatedAt,
  }
}