import { randomUUID } from 'node:crypto'

import { SignJWT, importPKCS8 } from 'jose'

type AuthStoreLike = {
  createUser(input: {
    name: string
    email: string
    passwordHash: string
    isActive?: boolean
  }): Promise<{ id: number } | null>
  createTenant(input: {
    name: string
    slug: string
    businessModel: 'product' | 'service' | 'hybrid' | 'professional'
    plan?: string
    isActive?: boolean
  }): Promise<{ id: number } | null>
  createMembership(input: {
    userId: number
    tenantId: number
    role: string
    isActive?: boolean
  }): Promise<{ id: number; role: string } | null>
}

export const HERMETIC_GOVERNANCE_ROLES = ['owner', 'admin', 'operator'] as const

type CreateHermeticAdminUserArgs = {
  authStore: AuthStoreLike
  userName?: string
  userEmail?: string
}

type SeedTenantMembershipArgs = {
  authStore: AuthStoreLike
  userId: number
  tenantName?: string
  tenantSlug?: string
  membershipRole?: string
}

type CreateHermeticAccessTokenArgs = {
  userId: number
  tenantId: number
  roles?: string[]
  privateKeyPem: string
  kid: string
  issuer?: string
  audience?: string
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function createHermeticAdminUser(args: CreateHermeticAdminUserArgs) {
  const now = Date.now()
  const user = await args.authStore.createUser({
    name: args.userName ?? 'Hermetic Governance Admin',
    email: args.userEmail ?? `hermetic-admin-${now}@brandsoul.local`,
    passwordHash: 'hermetic-auth-fixture-password-hash',
    isActive: true,
  })

  if (!user) {
    throw new Error('Failed to create hermetic admin user fixture.')
  }

  return user
}

export async function seedTenantMembership(args: SeedTenantMembershipArgs) {
  const tenantName = args.tenantName ?? 'Hermetic Governance Tenant'
  const slugBase = args.tenantSlug ?? `${slugify(tenantName)}-${Date.now().toString(36)}`
  const tenant = await args.authStore.createTenant({
    name: tenantName,
    slug: slugBase,
    businessModel: 'professional',
    plan: 'starter',
    isActive: true,
  })

  if (!tenant) {
    throw new Error('Failed to create hermetic tenant fixture.')
  }

  const role = args.membershipRole ?? 'owner'
  const membership = await args.authStore.createMembership({
    userId: args.userId,
    tenantId: tenant.id,
    role,
    isActive: true,
  })

  if (!membership) {
    throw new Error('Failed to create hermetic tenant membership fixture.')
  }

  return {
    tenant,
    membership,
  }
}

export async function createHermeticAccessToken(args: CreateHermeticAccessTokenArgs) {
  const privateKey = await importPKCS8(args.privateKeyPem, 'RS256')
  const roles = args.roles && args.roles.length > 0 ? args.roles : ['owner']

  return new SignJWT({
    sub: String(args.userId),
    tenant_id: String(args.tenantId),
    roles,
    ver: 1,
    jti: `hermetic-auth-${args.userId}-${args.tenantId}-${randomUUID()}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer(args.issuer ?? 'brandsoul-auth-distributed-sovereignty')
    .setAudience(args.audience ?? 'brandsoul-api-distributed-sovereignty')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}
