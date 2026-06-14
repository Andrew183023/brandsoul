import { createHash, timingSafeEqual } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { BackendDatabase } from '../../db/index.js'

type EntityProfileRow = {
  id: string
  owner_id: string | null
  owner_user_id: number | null
  owner_tenant_id: number | null
  created_at: string | null
  updated_at: string | null
}

type NativeUserRow = {
  id: number
  email: string
  created_at: string | null
  updated_at: string | null
  is_active: number | boolean | null
}

type NativeTenantRow = {
  id: number
  name: string
  slug: string
  created_at: string | null
  updated_at: string | null
  is_active: number | boolean | null
}

type NativeMembershipRow = {
  id: number | string
  user_id: number
  tenant_id: number
  role: string
  created_at: string | null
  updated_at: string | null
  is_active?: number | boolean | null
}

type LegacyUserRow = {
  id: number
  email: string
  created_at: string | null
  updated_at: string | null
  is_active: number | boolean | null
}

type LegacyTenantRow = {
  id: number
  name: string
  slug: string
  created_at: string | null
  updated_at: string | null
  is_active: number | boolean | null
}

type LegacyMembershipRow = {
  id: number | string
  user_id: number
  tenant_id: number
  role: string
  created_at: string | null
}

type OwnershipClassification =
  | 'VALID_OWNER'
  | 'ORPHAN_OWNER'
  | 'RECYCLED_ID_COLLISION'
  | 'TEMPORAL_IMPOSSIBLE_OWNERSHIP'
  | 'MANUAL_REVIEW_REQUIRED'

type BackendContext = {
  backendContext: {
    connection: BackendDatabase
  }
}

function getConnection(app: FastifyInstance) {
  return (app as FastifyInstance & BackendContext).backendContext.connection
}

function hashEmail(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf-8').digest('hex')
}

function toBooleanFlag(value: string | undefined, fallback: boolean) {
  if (typeof value !== 'string') {
    return fallback
  }

  return value.trim().toLowerCase() === 'true'
}

function parseOwnerIds(value: string | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return []
  }

  const unique = new Set<number>()
  for (const rawPart of value.split(',')) {
    const parsed = Number(rawPart.trim())
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null
    }

    unique.add(parsed)
  }

  return [...unique]
}

function uniquePositiveOwnerIdsFromEntities(rows: EntityProfileRow[]) {
  const unique = new Set<number>()
  for (const row of rows) {
    if (Number.isInteger(row.owner_user_id) && Number(row.owner_user_id) > 0) {
      unique.add(Number(row.owner_user_id))
    }
    if (Number.isInteger(row.owner_tenant_id) && Number(row.owner_tenant_id) > 0) {
      unique.add(Number(row.owner_tenant_id))
    }
  }

  return [...unique].sort((left, right) => left - right)
}

function sqlInPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

async function tableExists(db: BackendDatabase, tableName: string) {
  if (db.dialect === 'postgres') {
    const row = await db.get<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = ?
        ) AS exists
      `,
      tableName,
    )

    return Boolean(row?.exists)
  }

  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    tableName,
  )
  return Boolean(row?.name)
}

function parseTimestamp(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isTruthyActiveFlag(value: number | boolean | null | undefined) {
  return value === true || value === 1
}

function safeEqualToken(expected: string, received: string | undefined) {
  if (typeof received !== 'string') {
    return false
  }

  const expectedBuffer = Buffer.from(expected, 'utf-8')
  const receivedBuffer = Buffer.from(received, 'utf-8')
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

function classifyEntityOwnership(args: {
  entity: EntityProfileRow
  nativeUsers: Map<number, NativeUserRow>
  nativeTenants: Map<number, NativeTenantRow>
  nativeMemberships: Map<string, NativeMembershipRow>
  legacyUsers: Map<number, LegacyUserRow>
  legacyTenants: Map<number, LegacyTenantRow>
  legacyMemberships: Map<string, LegacyMembershipRow>
}) {
  const ownerUserId = args.entity.owner_user_id
  const ownerTenantId = args.entity.owner_tenant_id

  if (!Number.isInteger(ownerUserId) || !Number.isInteger(ownerTenantId)) {
    return 'MANUAL_REVIEW_REQUIRED' as OwnershipClassification
  }

  const resolvedOwnerUserId = Number(ownerUserId)
  const resolvedOwnerTenantId = Number(ownerTenantId)

  const membershipKey = `${resolvedOwnerUserId}:${resolvedOwnerTenantId}`
  const nativeUser = args.nativeUsers.get(resolvedOwnerUserId)
  const nativeTenant = args.nativeTenants.get(resolvedOwnerTenantId)
  const nativeMembership = args.nativeMemberships.get(membershipKey)
  const legacyUser = args.legacyUsers.get(resolvedOwnerUserId)
  const legacyTenant = args.legacyTenants.get(resolvedOwnerTenantId)
  const legacyMembership = args.legacyMemberships.get(membershipKey)

  const hasNativeOwner = Boolean(nativeUser && nativeTenant && nativeMembership)
  const hasLegacyOwner = Boolean(legacyUser && legacyTenant && legacyMembership)

  if (!hasNativeOwner && !hasLegacyOwner) {
    return 'ORPHAN_OWNER' as OwnershipClassification
  }

  const entityCreatedAtMs = parseTimestamp(args.entity.created_at)
  const userCreatedAtMs = parseTimestamp(nativeUser?.created_at ?? legacyUser?.created_at)
  const tenantCreatedAtMs = parseTimestamp(nativeTenant?.created_at ?? legacyTenant?.created_at)

  if (entityCreatedAtMs === null || userCreatedAtMs === null || tenantCreatedAtMs === null) {
    return 'MANUAL_REVIEW_REQUIRED' as OwnershipClassification
  }

  if (entityCreatedAtMs < userCreatedAtMs || entityCreatedAtMs < tenantCreatedAtMs) {
    return 'TEMPORAL_IMPOSSIBLE_OWNERSHIP' as OwnershipClassification
  }

  return 'VALID_OWNER' as OwnershipClassification
}

async function queryEntityProfileRows(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<EntityProfileRow[]>(
    `
      SELECT
        id,
        owner_id,
        owner_user_id,
        owner_tenant_id,
        created_at,
        updated_at
      FROM entity_profile
      WHERE owner_user_id IN (${placeholders})
         OR owner_tenant_id IN (${placeholders})
      ORDER BY created_at ASC
    `,
    ...ownerIds,
    ...ownerIds,
  )
}

async function queryAllEntityProfileRows(db: BackendDatabase) {
  return db.all<EntityProfileRow[]>(
    `
      SELECT
        id,
        owner_id,
        owner_user_id,
        owner_tenant_id,
        created_at,
        updated_at
      FROM entity_profile
      ORDER BY created_at ASC
    `,
  )
}

async function queryNativeUsers(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<NativeUserRow[]>(
    `
      SELECT
        id,
        email,
        created_at,
        updated_at,
        is_active
      FROM flow_auth_user
      WHERE id IN (${placeholders})
      ORDER BY id
    `,
    ...ownerIds,
  )
}

async function queryNativeTenants(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<NativeTenantRow[]>(
    `
      SELECT
        id,
        name,
        slug,
        created_at,
        updated_at,
        is_active
      FROM flow_auth_tenant
      WHERE id IN (${placeholders})
      ORDER BY id
    `,
    ...ownerIds,
  )
}

async function queryNativeMemberships(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<NativeMembershipRow[]>(
    `
      SELECT
        id,
        user_id,
        tenant_id,
        role,
        created_at,
        updated_at,
        is_active
      FROM flow_auth_membership
      WHERE user_id IN (${placeholders})
         OR tenant_id IN (${placeholders})
      ORDER BY created_at ASC
    `,
    ...ownerIds,
    ...ownerIds,
  )
}

async function queryLegacyUsers(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<LegacyUserRow[]>(
    `
      SELECT
        id,
        email,
        created_at,
        updated_at,
        is_active
      FROM users
      WHERE id IN (${placeholders})
      ORDER BY id
    `,
    ...ownerIds,
  )
}

async function queryLegacyTenants(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<LegacyTenantRow[]>(
    `
      SELECT
        id,
        name,
        slug,
        created_at,
        updated_at,
        is_active
      FROM tenants
      WHERE id IN (${placeholders})
      ORDER BY id
    `,
    ...ownerIds,
  )
}

async function queryLegacyMemberships(db: BackendDatabase, ownerIds: number[]) {
  const placeholders = sqlInPlaceholders(ownerIds.length)
  return db.all<LegacyMembershipRow[]>(
    `
      SELECT
        id,
        user_id,
        tenant_id,
        role,
        created_at
      FROM memberships
      WHERE user_id IN (${placeholders})
         OR tenant_id IN (${placeholders})
      ORDER BY created_at ASC
    `,
    ...ownerIds,
    ...ownerIds,
  )
}

export async function registerInternalOwnershipCollisionInventoryRoutes(app: FastifyInstance) {
  const internalAdminToken = process.env.INTERNAL_ADMIN_TOKEN
  const runtimeIsNonPublic = process.env.NODE_ENV !== 'production' || process.env.RENDER_DEPLOY_MODE !== 'production'

  if (!internalAdminToken && !runtimeIsNonPublic) {
    return
  }

  app.get<{
    Querystring: {
      ownerIds?: string
      includeNativeAuth?: string
      includeLegacyAuth?: string
      all?: string
    }
  }>('/internal/admin/ownership/collision-inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      ownerIds?: string
      includeNativeAuth?: string
      includeLegacyAuth?: string
      all?: string
    }

    if (!internalAdminToken) {
      return reply.status(503).send({
        status: 'failed',
        error: {
          code: 'INTERNAL_ADMIN_TOKEN_NOT_CONFIGURED',
          message: 'Internal admin token is not configured.',
        },
      })
    }

    const receivedToken = request.headers['x-internal-admin-token']
    const tokenValue = Array.isArray(receivedToken) ? receivedToken[0] : receivedToken
    if (!safeEqualToken(internalAdminToken, tokenValue)) {
      return reply.status(401).send({
        status: 'failed',
        error: {
          code: 'INTERNAL_ADMIN_UNAUTHORIZED',
          message: 'Internal admin token is required.',
        },
      })
    }

    const all = toBooleanFlag(query.all, false)
    const parsedOwnerIds = parseOwnerIds(query.ownerIds)
    if (!all && (parsedOwnerIds === null || parsedOwnerIds.length === 0)) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_OWNER_IDS',
          message: 'ownerIds must be a comma-separated list of positive integers when all=true is not provided.',
        },
      })
    }

    const includeNativeAuth = toBooleanFlag(query.includeNativeAuth, true)
    const includeLegacyAuth = toBooleanFlag(query.includeLegacyAuth, true)
    const db = getConnection(app)

    const [
      entityProfileRows,
      hasFlowAuthUser,
      hasFlowAuthTenant,
      hasFlowAuthMembership,
      hasLegacyUsers,
      hasLegacyTenants,
      hasLegacyMemberships,
    ] = await Promise.all([
      all ? queryAllEntityProfileRows(db) : queryEntityProfileRows(db, parsedOwnerIds!),
      tableExists(db, 'flow_auth_user'),
      tableExists(db, 'flow_auth_tenant'),
      tableExists(db, 'flow_auth_membership'),
      tableExists(db, 'users'),
      tableExists(db, 'tenants'),
      tableExists(db, 'memberships'),
    ])

    const ownerIds = all ? uniquePositiveOwnerIdsFromEntities(entityProfileRows) : parsedOwnerIds!

    const canReadNative = hasFlowAuthUser && hasFlowAuthTenant && hasFlowAuthMembership
    const canReadLegacy = hasLegacyUsers && hasLegacyTenants && hasLegacyMemberships

    const [nativeUsers, nativeTenants, nativeMemberships, legacyUsers, legacyTenants, legacyMemberships] = await Promise.all([
      canReadNative && ownerIds.length > 0 ? queryNativeUsers(db, ownerIds) : Promise.resolve([]),
      canReadNative && ownerIds.length > 0 ? queryNativeTenants(db, ownerIds) : Promise.resolve([]),
      canReadNative && ownerIds.length > 0 ? queryNativeMemberships(db, ownerIds) : Promise.resolve([]),
      canReadLegacy && ownerIds.length > 0 ? queryLegacyUsers(db, ownerIds) : Promise.resolve([]),
      canReadLegacy && ownerIds.length > 0 ? queryLegacyTenants(db, ownerIds) : Promise.resolve([]),
      canReadLegacy && ownerIds.length > 0 ? queryLegacyMemberships(db, ownerIds) : Promise.resolve([]),
    ])

    const nativeUserMap = new Map(nativeUsers.map((row) => [row.id, row]))
    const nativeTenantMap = new Map(nativeTenants.map((row) => [row.id, row]))
    const nativeMembershipMap = new Map(nativeMemberships.map((row) => [`${row.user_id}:${row.tenant_id}`, row]))
    const legacyUserMap = new Map(legacyUsers.map((row) => [row.id, row]))
    const legacyTenantMap = new Map(legacyTenants.map((row) => [row.id, row]))
    const legacyMembershipMap = new Map(legacyMemberships.map((row) => [`${row.user_id}:${row.tenant_id}`, row]))

    const classifiedRows = entityProfileRows.map((row) => {
      const classification = classifyEntityOwnership({
        entity: row,
        nativeUsers: nativeUserMap,
        nativeTenants: nativeTenantMap,
        nativeMemberships: nativeMembershipMap,
        legacyUsers: legacyUserMap,
        legacyTenants: legacyTenantMap,
        legacyMemberships: legacyMembershipMap,
      })

      return {
        id: row.id,
        ownerId: row.owner_id,
        ownerUserId: row.owner_user_id,
        ownerTenantId: row.owner_tenant_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        classification,
      }
    })

    const summary = classifiedRows.reduce((accumulator, row) => {
      if (row.classification === 'TEMPORAL_IMPOSSIBLE_OWNERSHIP') {
        accumulator.temporalImpossibleRows += 1
        accumulator.recycledIdCollisionRows += 1
      } else if (row.classification === 'ORPHAN_OWNER') {
        accumulator.orphanOwnerRows += 1
      } else if (row.classification === 'VALID_OWNER') {
        accumulator.validOwnerRows += 1
      } else if (row.classification === 'MANUAL_REVIEW_REQUIRED') {
        accumulator.manualReviewRows += 1
      }

      return accumulator
    }, {
      temporalImpossibleRows: 0,
      recycledIdCollisionRows: 0,
      orphanOwnerRows: 0,
      validOwnerRows: 0,
      manualReviewRows: 0,
    })

    const topOrphanOffices = classifiedRows
      .filter((row) => row.classification === 'ORPHAN_OWNER')
      .slice(0, 100)
      .map((row) => ({
        officeId: row.id,
        ownerUserId: row.ownerUserId,
        ownerTenantId: row.ownerTenantId,
        createdAt: row.createdAt,
        classification: row.classification,
      }))

    return reply.status(200).send({
      status: 'ready',
      all,
      ownerIds,
      totalEntities: classifiedRows.length,
      validOwners: summary.validOwnerRows,
      orphanOwners: summary.orphanOwnerRows,
      temporalImpossibleOwners: summary.temporalImpossibleRows,
      topOrphanOffices,
      entityProfileRows: classifiedRows,
      nativeAuth: {
        users: includeNativeAuth && canReadNative
          ? nativeUsers.map((row) => ({
            id: row.id,
            emailHash: hashEmail(row.email),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: isTruthyActiveFlag(row.is_active),
          }))
          : [],
        tenants: includeNativeAuth && canReadNative
          ? nativeTenants.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: isTruthyActiveFlag(row.is_active),
          }))
          : [],
        memberships: includeNativeAuth && canReadNative
          ? nativeMemberships.map((row) => ({
            id: row.id,
            userId: row.user_id,
            tenantId: row.tenant_id,
            role: row.role,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: isTruthyActiveFlag(row.is_active),
          }))
          : [],
      },
      legacyAuth: {
        available: canReadLegacy,
        users: includeLegacyAuth && canReadLegacy
          ? legacyUsers.map((row) => ({
            id: row.id,
            emailHash: hashEmail(row.email),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: isTruthyActiveFlag(row.is_active),
          }))
          : [],
        tenants: includeLegacyAuth && canReadLegacy
          ? legacyTenants.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: isTruthyActiveFlag(row.is_active),
          }))
          : [],
        memberships: includeLegacyAuth && canReadLegacy
          ? legacyMemberships.map((row) => ({
            id: row.id,
            userId: row.user_id,
            tenantId: row.tenant_id,
            role: row.role,
            createdAt: row.created_at,
          }))
          : [],
      },
      summary,
    })
  })
}
