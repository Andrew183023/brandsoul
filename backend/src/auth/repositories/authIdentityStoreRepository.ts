import type { AuthMembershipRecord, AuthTenantRecord, AuthUserRecord } from '../authTypes.js'
import type {
  AuthMembershipUserRecord,
  AuthPasswordResetTokenRecord,
  AuthTenantMembershipRecord,
} from './legacyAuthStoreRepository.js'

export type AuthIdentityLegacyMappingInput = {
  legacySource?: string
  legacyId?: number
}

export type CreateAuthUserInput = {
  name: string
  email: string
  passwordHash: string
  isActive?: boolean
} & AuthIdentityLegacyMappingInput

export type CreateAuthTenantInput = {
  name: string
  slug: string
  businessModel: AuthTenantRecord['businessModel']
  plan?: string
  isActive?: boolean
} & AuthIdentityLegacyMappingInput

export type CreateAuthMembershipInput = {
  userId: number
  tenantId: number
  role: string
  isActive?: boolean
} & AuthIdentityLegacyMappingInput

export type CreateAuthPasswordResetTokenInput = {
  userId: number
  token: string
  expiresAt: string
} & AuthIdentityLegacyMappingInput

export interface AuthIdentityStoreRepository {
  createUser(input: CreateAuthUserInput): Promise<AuthUserRecord | null>
  findUserByEmail(email: string): Promise<AuthUserRecord | null>
  findUserById(userId: number): Promise<AuthUserRecord | null>
  updateUserPassword(userId: number, passwordHash: string): Promise<AuthUserRecord | null>
  updateUserPasswordHash(userId: number, passwordHash: string): Promise<AuthUserRecord | null>
  createTenant(input: CreateAuthTenantInput): Promise<AuthTenantRecord | null>
  findTenantById(tenantId: number): Promise<AuthTenantRecord | null>
  findTenantBySlug(slug: string): Promise<AuthTenantRecord | null>
  createMembership(input: CreateAuthMembershipInput): Promise<AuthMembershipRecord | null>
  findMembershipForUserAndTenant(userId: number, tenantId: number): Promise<AuthMembershipRecord | null>
  listMembershipsForUser(userId: number): Promise<AuthTenantMembershipRecord[]>
  listMembershipUsersByTenant(tenantId: number): Promise<AuthMembershipUserRecord[]>
  createPasswordResetToken(input: CreateAuthPasswordResetTokenInput): Promise<AuthPasswordResetTokenRecord | null>
  findPasswordResetTokenByToken(token: string): Promise<AuthPasswordResetTokenRecord | null>
  findLatestPasswordResetTokenForUser(userId: number): Promise<AuthPasswordResetTokenRecord | null>
  markPasswordResetTokenUsed(tokenId: number): Promise<AuthPasswordResetTokenRecord | null>
}
