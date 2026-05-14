import { open, type Database as SQLiteDatabase } from 'sqlite'
import sqlite3 from 'sqlite3'

import type { AuthMembershipRecord, AuthTenantRecord, AuthUserRecord } from '../authTypes.js'
import type {
  AuthIdentityStoreRepository,
  CreateAuthMembershipInput,
  CreateAuthPasswordResetTokenInput,
  CreateAuthTenantInput,
  CreateAuthUserInput,
} from './authIdentityStoreRepository.js'

type UserRow = {
  id: number
  name: string
  email: string
  password_hash: string
  is_active: number
  created_at: string
  updated_at: string
}

type TenantRow = {
  id: number
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
  user_id: number
  tenant_id: number
  role: string
  created_at: string
}

type MembershipUserRow = MembershipRow & {
  user_name: string
  user_email: string
  user_is_active: number
  user_created_at: string
  user_updated_at: string
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

type PasswordResetTokenRow = {
  id: number
  user_id: number
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export type AuthPasswordResetTokenRecord = {
  id: number
  userId: number
  token: string
  expiresAt: string
  usedAt?: string
  createdAt: string
}

export type AuthMembershipUserRecord = {
  membership: AuthMembershipRecord
  user: AuthUserRecord
}

export type AuthTenantMembershipRecord = {
  membership: AuthMembershipRecord
  tenant: AuthTenantRecord
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

export class LegacyAuthStoreRepository implements AuthIdentityStoreRepository {
  private dbPromise: Promise<SQLiteDatabase> | null = null

  constructor(private readonly sqliteFile: string) {}

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = open({
        filename: this.sqliteFile,
        driver: sqlite3.Database,
      })
    }

    return this.dbPromise
  }

  async findUserByEmail(email: string) {
    const db = await this.getDb()
    const row = await db.get<UserRow>(`SELECT * FROM users WHERE email = ?`, email.toLowerCase())
    return mapUserRow(row)
  }

  async findUserById(userId: number) {
    const db = await this.getDb()
    const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, userId)
    return mapUserRow(row)
  }

  async findTenantById(tenantId: number) {
    const db = await this.getDb()
    const row = await db.get<TenantRow>(`SELECT * FROM tenants WHERE id = ?`, tenantId)
    return mapTenantRow(row)
  }

  async findTenantBySlug(slug: string) {
    const db = await this.getDb()
    const row = await db.get<TenantRow>(`SELECT * FROM tenants WHERE slug = ?`, slug)
    return mapTenantRow(row)
  }

  async findMembershipForUser(userId: number) {
    const db = await this.getDb()
    const row = await db.get<MembershipRow>(
      `SELECT * FROM memberships WHERE user_id = ? ORDER BY id ASC LIMIT 1`,
      userId,
    )
    return mapMembershipRow(row)
  }

  async findMembershipForUserAndTenant(userId: number, tenantId: number) {
    const db = await this.getDb()
    const row = await db.get<MembershipRow>(
      `
        SELECT *
        FROM memberships
        WHERE user_id = ?
          AND tenant_id = ?
        LIMIT 1
      `,
      userId,
      tenantId,
    )
    return mapMembershipRow(row)
  }

  async listMembershipsForUser(userId: number): Promise<AuthTenantMembershipRecord[]> {
    const db = await this.getDb()
    const rows = await db.all<MembershipTenantRow[]>(
      `
        SELECT
          memberships.id,
          memberships.user_id,
          memberships.tenant_id,
          memberships.role,
          memberships.created_at,
          tenants.name AS tenant_name,
          tenants.slug AS tenant_slug,
          tenants.business_model AS tenant_business_model,
          tenants.plan AS tenant_plan,
          tenants.is_active AS tenant_is_active,
          tenants.created_at AS tenant_created_at,
          tenants.updated_at AS tenant_updated_at
        FROM memberships
        INNER JOIN tenants
          ON tenants.id = memberships.tenant_id
        WHERE memberships.user_id = ?
        ORDER BY memberships.created_at ASC, memberships.id ASC
      `,
      userId,
    )

    return rows
      .map((row) => {
        const membership = mapMembershipRow({
          id: row.id,
          user_id: row.user_id,
          tenant_id: row.tenant_id,
          role: row.role,
          created_at: row.created_at,
        })
        const tenant = mapTenantRow({
          id: row.tenant_id,
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

        return {
          membership,
          tenant,
        }
      })
      .filter((record): record is AuthTenantMembershipRecord => Boolean(record))
  }

  async listMembershipUsersByTenant(tenantId: number): Promise<AuthMembershipUserRecord[]> {
    const db = await this.getDb()
    const rows = await db.all<MembershipUserRow[]>(
      `
        SELECT
          memberships.id,
          memberships.user_id,
          memberships.tenant_id,
          memberships.role,
          memberships.created_at,
          users.name AS user_name,
          users.email AS user_email,
          users.is_active AS user_is_active,
          users.created_at AS user_created_at,
          users.updated_at AS user_updated_at
        FROM memberships
        INNER JOIN users
          ON users.id = memberships.user_id
        WHERE memberships.tenant_id = ?
        ORDER BY memberships.id ASC
      `,
      tenantId,
    )

    return rows
      .map((row) => {
        const membership = mapMembershipRow(row)
        const user = mapUserRow({
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          password_hash: '',
          is_active: row.user_is_active,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        })

        if (!membership || !user) {
          return null
        }

        return {
          membership,
          user,
        }
      })
      .filter((record): record is AuthMembershipUserRecord => Boolean(record))
  }

  async createUser(input: CreateAuthUserInput) {
    const db = await this.getDb()
    const now = new Date().toISOString()
    const result = await db.run(
      `
        INSERT INTO users (name, email, password_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `,
      input.name,
      input.email.toLowerCase(),
      input.passwordHash,
      now,
      now,
    )

    return this.findUserById(Number(result.lastID))
  }

  async createTenant(input: CreateAuthTenantInput) {
    const db = await this.getDb()
    const now = new Date().toISOString()
    const result = await db.run(
      `
        INSERT INTO tenants (name, slug, business_model, plan, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `,
      input.name,
      input.slug,
      input.businessModel,
      input.plan ?? 'starter',
      now,
      now,
    )

    return this.findTenantById(Number(result.lastID))
  }

  async createMembership(input: CreateAuthMembershipInput) {
    const db = await this.getDb()
    const now = new Date().toISOString()
    const result = await db.run(
      `
        INSERT INTO memberships (user_id, tenant_id, role, created_at)
        VALUES (?, ?, ?, ?)
      `,
      input.userId,
      input.tenantId,
      input.role,
      now,
    )

    const row = await db.get<MembershipRow>(`SELECT * FROM memberships WHERE id = ?`, Number(result.lastID))
    return mapMembershipRow(row)
  }

  async updateUserPassword(userId: number, passwordHash: string) {
    const db = await this.getDb()
    const now = new Date().toISOString()
    await db.run(
      `
        UPDATE users
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `,
      passwordHash,
      now,
      userId,
    )

    return this.findUserById(userId)
  }

  async updateUserPasswordHash(userId: number, passwordHash: string) {
    return this.updateUserPassword(userId, passwordHash)
  }

  async createPasswordResetToken(input: CreateAuthPasswordResetTokenInput) {
    const db = await this.getDb()
    const now = new Date().toISOString()
    const result = await db.run(
      `
        INSERT INTO password_reset_tokens (user_id, token, expires_at, used_at, created_at)
        VALUES (?, ?, ?, NULL, ?)
      `,
      input.userId,
      input.token,
      input.expiresAt,
      now,
    )

    const row = await db.get<PasswordResetTokenRow>(`SELECT * FROM password_reset_tokens WHERE id = ?`, Number(result.lastID))
    return mapPasswordResetTokenRow(row)
  }

  async findPasswordResetTokenByToken(token: string) {
    const db = await this.getDb()
    const row = await db.get<PasswordResetTokenRow>(`SELECT * FROM password_reset_tokens WHERE token = ?`, token)
    return mapPasswordResetTokenRow(row)
  }

  async findLatestPasswordResetTokenForUser(userId: number) {
    const db = await this.getDb()
    const row = await db.get<PasswordResetTokenRow>(
      `SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      userId,
    )
    return mapPasswordResetTokenRow(row)
  }

  async markPasswordResetTokenUsed(tokenId: number) {
    const db = await this.getDb()
    const usedAt = new Date().toISOString()
    await db.run(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`, usedAt, tokenId)
    const row = await db.get<PasswordResetTokenRow>(`SELECT * FROM password_reset_tokens WHERE id = ?`, tokenId)
    return mapPasswordResetTokenRow(row)
  }

  async close() {
    if (!this.dbPromise) {
      return
    }

    const db = await this.dbPromise
    await db.close()
    this.dbPromise = null
  }
}

export function createLegacyAuthStoreRepository(sqliteFile: string) {
  return new LegacyAuthStoreRepository(sqliteFile)
}
