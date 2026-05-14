import type { BackendDatabase } from '../../db/index.js'
import type { AuthMembershipRecord, AuthTenantRecord, AuthUserRecord } from '../authTypes.js'
import type {
  AuthMembershipUserRecord,
  AuthPasswordResetTokenRecord,
  AuthTenantMembershipRecord,
} from './legacyAuthStoreRepository.js'
import type {
  AuthIdentityStoreRepository,
  CreateAuthMembershipInput,
  CreateAuthPasswordResetTokenInput,
  CreateAuthTenantInput,
  CreateAuthUserInput,
} from './authIdentityStoreRepository.js'

type UserRow = {
  id: number
  legacy_source: string | null
  legacy_id: number | null
  name: string
  email: string
  password_hash: string
  is_active: number
  created_at: string
  updated_at: string
}

type TenantRow = {
  id: number
  legacy_source: string | null
  legacy_id: number | null
  name: string
  slug: string
  business_model: 'product' | 'service' | 'hybrid' | 'professional'
  plan: string
  is_active: number
  created_at: string
  updated_at: string
}

type MembershipRow = {
  id: number
  legacy_source: string | null
  legacy_id: number | null
  user_id: number
  tenant_id: number
  role: string
  is_active: number
  created_at: string
  updated_at: string
}

type MembershipTenantRow = MembershipRow & {
  tenant_name: string
  tenant_slug: string
  tenant_business_model: 'product' | 'service' | 'hybrid' | 'professional'
  tenant_plan: string
  tenant_is_active: number
  tenant_created_at: string
  tenant_updated_at: string
}

type MembershipUserRow = MembershipRow & {
  user_name: string
  user_email: string
  user_password_hash: string
  user_is_active: number
  user_created_at: string
  user_updated_at: string
}

type PasswordResetTokenRow = {
  id: number
  legacy_source: string | null
  legacy_id: number | null
  user_id: number
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export type BackendNativeAuthAuditEventRecord = {
  id: string
  eventType: string
  userId?: number
  tenantId?: number
  actorUserId?: number
  actorTenantId?: number
  outcome: string
  metadataJson: string
  createdAt: string
}

type BackendNativeAuthStoreRepositoryOptions = {
  now?: () => string
}

function mapUserRow(row?: UserRow): AuthUserRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTenantRow(row?: TenantRow): AuthTenantRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    businessModel: row.business_model,
    plan: row.plan,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMembershipRow(row?: MembershipRow): AuthMembershipRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
    createdAt: row.created_at,
  }
}

function mapPasswordResetTokenRow(row?: PasswordResetTokenRow): AuthPasswordResetTokenRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
    createdAt: row.created_at,
  }
}

export class BackendNativeAuthStoreRepository implements AuthIdentityStoreRepository {
  private readonly now: () => string

  constructor(
    private readonly db: BackendDatabase,
    options: BackendNativeAuthStoreRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async createUser(input: CreateAuthUserInput) {
    const now = this.now()
    const result = await this.db.run(
      `
        INSERT INTO flow_auth_user (
          legacy_source,
          legacy_id,
          name,
          email,
          password_hash,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.legacySource ?? null,
      input.legacyId ?? null,
      input.name,
      input.email.toLowerCase(),
      input.passwordHash,
      input.isActive === false ? 0 : 1,
      now,
      now,
    )

    return this.findUserById(Number(result.lastID))
  }

  async findUserByEmail(email: string) {
    const row = await this.db.get<UserRow>(
      `
        SELECT *
        FROM flow_auth_user
        WHERE email = ?
      `,
      email.toLowerCase(),
    )

    return mapUserRow(row)
  }

  async findUserById(userId: number) {
    const row = await this.db.get<UserRow>(
      `
        SELECT *
        FROM flow_auth_user
        WHERE id = ?
      `,
      userId,
    )

    return mapUserRow(row)
  }

  async updateUserPasswordHash(userId: number, passwordHash: string) {
    const now = this.now()
    await this.db.run(
      `
        UPDATE flow_auth_user
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `,
      passwordHash,
      now,
      userId,
    )

    return this.findUserById(userId)
  }

  async updateUserPassword(userId: number, passwordHash: string) {
    return this.updateUserPasswordHash(userId, passwordHash)
  }

  async deactivateUser(userId: number) {
    const now = this.now()
    await this.db.run(
      `
        UPDATE flow_auth_user
        SET is_active = 0, updated_at = ?
        WHERE id = ?
      `,
      now,
      userId,
    )

    return this.findUserById(userId)
  }

  async createTenant(input: CreateAuthTenantInput) {
    const now = this.now()
    const result = await this.db.run(
      `
        INSERT INTO flow_auth_tenant (
          legacy_source,
          legacy_id,
          name,
          slug,
          business_model,
          plan,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.legacySource ?? null,
      input.legacyId ?? null,
      input.name,
      input.slug,
      input.businessModel,
      input.plan ?? 'starter',
      input.isActive === false ? 0 : 1,
      now,
      now,
    )

    return this.findTenantById(Number(result.lastID))
  }

  async findTenantById(tenantId: number) {
    const row = await this.db.get<TenantRow>(
      `
        SELECT *
        FROM flow_auth_tenant
        WHERE id = ?
      `,
      tenantId,
    )

    return mapTenantRow(row)
  }

  async findTenantBySlug(slug: string) {
    const row = await this.db.get<TenantRow>(
      `
        SELECT *
        FROM flow_auth_tenant
        WHERE slug = ?
      `,
      slug,
    )

    return mapTenantRow(row)
  }

  async updateTenant(tenantId: number, input: {
    name?: string
    slug?: string
    businessModel?: AuthTenantRecord['businessModel']
    plan?: string
    isActive?: boolean
  }) {
    const current = await this.findTenantById(tenantId)
    if (!current) {
      return null
    }

    const now = this.now()
    await this.db.run(
      `
        UPDATE flow_auth_tenant
        SET name = ?, slug = ?, business_model = ?, plan = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `,
      input.name ?? current.name,
      input.slug ?? current.slug,
      input.businessModel ?? current.businessModel,
      input.plan ?? current.plan,
      input.isActive === undefined ? (current.isActive ? 1 : 0) : (input.isActive ? 1 : 0),
      now,
      tenantId,
    )

    return this.findTenantById(tenantId)
  }

  async createMembership(input: CreateAuthMembershipInput) {
    const now = this.now()
    const result = await this.db.run(
      `
        INSERT INTO flow_auth_membership (
          legacy_source,
          legacy_id,
          user_id,
          tenant_id,
          role,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.legacySource ?? null,
      input.legacyId ?? null,
      input.userId,
      input.tenantId,
      input.role,
      input.isActive === false ? 0 : 1,
      now,
      now,
    )

    const row = await this.db.get<MembershipRow>(
      `
        SELECT *
        FROM flow_auth_membership
        WHERE id = ?
      `,
      Number(result.lastID),
    )
    return mapMembershipRow(row)
  }

  async findMembershipForUserAndTenant(userId: number, tenantId: number) {
    const row = await this.db.get<MembershipRow>(
      `
        SELECT memberships.*
        FROM flow_auth_membership AS memberships
        INNER JOIN flow_auth_tenant AS tenants
          ON tenants.id = memberships.tenant_id
        INNER JOIN flow_auth_user AS users
          ON users.id = memberships.user_id
        WHERE memberships.user_id = ?
          AND memberships.tenant_id = ?
          AND memberships.is_active = 1
          AND tenants.is_active = 1
          AND users.is_active = 1
        LIMIT 1
      `,
      userId,
      tenantId,
    )

    return mapMembershipRow(row)
  }

  async listMembershipsForUser(userId: number): Promise<AuthTenantMembershipRecord[]> {
    const rows = await this.db.all<MembershipTenantRow[]>(
      `
        SELECT
          memberships.id,
          memberships.legacy_source,
          memberships.legacy_id,
          memberships.user_id,
          memberships.tenant_id,
          memberships.role,
          memberships.is_active,
          memberships.created_at,
          memberships.updated_at,
          tenants.name AS tenant_name,
          tenants.slug AS tenant_slug,
          tenants.business_model AS tenant_business_model,
          tenants.plan AS tenant_plan,
          tenants.is_active AS tenant_is_active,
          tenants.created_at AS tenant_created_at,
          tenants.updated_at AS tenant_updated_at
        FROM flow_auth_membership AS memberships
        INNER JOIN flow_auth_tenant AS tenants
          ON tenants.id = memberships.tenant_id
        INNER JOIN flow_auth_user AS users
          ON users.id = memberships.user_id
        WHERE memberships.user_id = ?
          AND memberships.is_active = 1
          AND tenants.is_active = 1
          AND users.is_active = 1
        ORDER BY memberships.created_at ASC, memberships.id ASC
      `,
      userId,
    )

    return rows
      .map((row) => {
        const membership = mapMembershipRow(row)
        const tenant = mapTenantRow({
          id: row.tenant_id,
          legacy_source: null,
          legacy_id: null,
          name: row.tenant_name,
          slug: row.tenant_slug,
          business_model: row.tenant_business_model,
          plan: row.tenant_plan,
          is_active: row.tenant_is_active,
          created_at: row.tenant_created_at,
          updated_at: row.tenant_updated_at,
        })

        if (!membership || !tenant) {
          return null
        }

        return { membership, tenant }
      })
      .filter((record): record is AuthTenantMembershipRecord => Boolean(record))
  }

  async listMembershipUsersByTenant(tenantId: number): Promise<AuthMembershipUserRecord[]> {
    const rows = await this.db.all<MembershipUserRow[]>(
      `
        SELECT
          memberships.id,
          memberships.legacy_source,
          memberships.legacy_id,
          memberships.user_id,
          memberships.tenant_id,
          memberships.role,
          memberships.is_active,
          memberships.created_at,
          memberships.updated_at,
          users.name AS user_name,
          users.email AS user_email,
          users.password_hash AS user_password_hash,
          users.is_active AS user_is_active,
          users.created_at AS user_created_at,
          users.updated_at AS user_updated_at
        FROM flow_auth_membership AS memberships
        INNER JOIN flow_auth_user AS users
          ON users.id = memberships.user_id
        INNER JOIN flow_auth_tenant AS tenants
          ON tenants.id = memberships.tenant_id
        WHERE memberships.tenant_id = ?
          AND memberships.is_active = 1
          AND users.is_active = 1
          AND tenants.is_active = 1
        ORDER BY memberships.id ASC
      `,
      tenantId,
    )

    return rows
      .map((row) => {
        const membership = mapMembershipRow(row)
        const user = mapUserRow({
          id: row.user_id,
          legacy_source: null,
          legacy_id: null,
          name: row.user_name,
          email: row.user_email,
          password_hash: row.user_password_hash,
          is_active: row.user_is_active,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        })

        if (!membership || !user) {
          return null
        }

        return { membership, user }
      })
      .filter((record): record is AuthMembershipUserRecord => Boolean(record))
  }

  async deactivateMembership(userId: number, tenantId: number) {
    const now = this.now()
    await this.db.run(
      `
        UPDATE flow_auth_membership
        SET is_active = 0, updated_at = ?
        WHERE user_id = ?
          AND tenant_id = ?
      `,
      now,
      userId,
      tenantId,
    )
  }

  async createPasswordResetToken(input: CreateAuthPasswordResetTokenInput) {
    const createdAt = this.now()
    const result = await this.db.run(
      `
        INSERT INTO flow_auth_password_reset_token (
          legacy_source,
          legacy_id,
          user_id,
          token,
          expires_at,
          used_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, ?)
      `,
      input.legacySource ?? null,
      input.legacyId ?? null,
      input.userId,
      input.token,
      input.expiresAt,
      createdAt,
    )

    const row = await this.db.get<PasswordResetTokenRow>(
      `
        SELECT *
        FROM flow_auth_password_reset_token
        WHERE id = ?
      `,
      Number(result.lastID),
    )

    return mapPasswordResetTokenRow(row)
  }

  async findPasswordResetTokenByToken(token: string) {
    const row = await this.db.get<PasswordResetTokenRow>(
      `
        SELECT *
        FROM flow_auth_password_reset_token
        WHERE token = ?
      `,
      token,
    )

    return mapPasswordResetTokenRow(row)
  }

  async findLatestPasswordResetTokenForUser(userId: number) {
    const row = await this.db.get<PasswordResetTokenRow>(
      `
        SELECT *
        FROM flow_auth_password_reset_token
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      userId,
    )

    return mapPasswordResetTokenRow(row)
  }

  async markPasswordResetTokenUsed(tokenId: number) {
    const usedAt = this.now()
    await this.db.run(
      `
        UPDATE flow_auth_password_reset_token
        SET used_at = ?
        WHERE id = ?
      `,
      usedAt,
      tokenId,
    )

    const row = await this.db.get<PasswordResetTokenRow>(
      `
        SELECT *
        FROM flow_auth_password_reset_token
        WHERE id = ?
      `,
      tokenId,
    )

    return mapPasswordResetTokenRow(row)
  }

  async appendAuthAuditEvent(input: Omit<BackendNativeAuthAuditEventRecord, 'createdAt'> & { createdAt?: string }) {
    const createdAt = input.createdAt ?? this.now()
    await this.db.run(
      `
        INSERT INTO flow_auth_audit_event (
          id,
          event_type,
          user_id,
          tenant_id,
          actor_user_id,
          actor_tenant_id,
          outcome,
          metadata_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.id,
      input.eventType,
      input.userId ?? null,
      input.tenantId ?? null,
      input.actorUserId ?? null,
      input.actorTenantId ?? null,
      input.outcome,
      input.metadataJson,
      createdAt,
    )
  }
}

export function createBackendNativeAuthStoreRepository(
  db: BackendDatabase,
  options?: BackendNativeAuthStoreRepositoryOptions,
) {
  return new BackendNativeAuthStoreRepository(db, options)
}
