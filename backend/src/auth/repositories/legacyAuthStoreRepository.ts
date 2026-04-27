import { open, type Database as SQLiteDatabase } from 'sqlite'
import sqlite3 from 'sqlite3'

import type { AuthMembershipRecord, AuthTenantRecord, AuthUserRecord } from '../authTypes.js'

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

export class LegacyAuthStoreRepository {
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

  async createUser(input: { name: string; email: string; passwordHash: string }) {
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

  async createTenant(input: { name: string; slug: string; businessModel: AuthTenantRecord['businessModel']; plan?: string }) {
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

  async createMembership(input: { userId: number; tenantId: number; role: string }) {
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

  async createPasswordResetToken(input: { userId: number; token: string; expiresAt: string }) {
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