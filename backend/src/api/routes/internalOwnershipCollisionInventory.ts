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

type ArchiveOrphansBody = {
  entityIds?: string[]
  reason?: string
  dryRun?: boolean
  confirm?: string
}

type CriticalLinkSummary = {
  cases: number
  caseMessages: number
  professionals: number
  professionalProfiles: number
  entityExports: number
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWildcardEntitySelection(entityIds: string[]) {
  return entityIds.length === 1 && entityIds[0] === '*'
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

async function queryEntityProfileRowsByIds(db: BackendDatabase, entityIds: string[]) {
  const placeholders = sqlInPlaceholders(entityIds.length)
  return db.all<Array<EntityProfileRow & { entity_profile: string }>>(
    `
      SELECT
        id,
        owner_id,
        owner_user_id,
        owner_tenant_id,
        created_at,
        updated_at,
        entity_profile
      FROM entity_profile
      WHERE id IN (${placeholders})
      ORDER BY created_at ASC
    `,
    ...entityIds,
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

async function queryCriticalLinkSummary(db: BackendDatabase, entityId: string): Promise<CriticalLinkSummary> {
  const professionalRows = await db.all<Array<{ id: string }>>(
    db.dialect === 'postgres'
      ? `
        SELECT id
        FROM professionals
        WHERE metadata::text LIKE ?
           OR external_ref LIKE ?
      `
      : `
        SELECT id
        FROM professionals
        WHERE metadata LIKE ?
           OR external_ref LIKE ?
      `,
    `%${entityId}%`,
    `%${entityId}%`,
  )

  const professionalIds = professionalRows.map((row) => row.id)
  const professionalProfiles = professionalIds.length === 0
    ? 0
    : Number((await db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM professional_profiles
        WHERE professional_id IN (${sqlInPlaceholders(professionalIds.length)})
      `,
      ...professionalIds,
    ))?.total ?? 0)

  const [cases, caseMessages, entityExports] = await Promise.all([
    db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM cases
        WHERE entity_id = ?
      `,
      entityId,
    ),
    db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM case_messages
        WHERE case_id IN (
          SELECT id
          FROM cases
          WHERE entity_id = ?
        )
      `,
      entityId,
    ),
    db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM entity_exports
        WHERE entity_id = ?
      `,
      entityId,
    ),
  ])

  return {
    cases: Number(cases?.total ?? 0),
    caseMessages: Number(caseMessages?.total ?? 0),
    professionals: professionalIds.length,
    professionalProfiles,
    entityExports: Number(entityExports?.total ?? 0),
  }
}

function hasCriticalLinks(summary: CriticalLinkSummary) {
  return summary.cases > 0
    || summary.caseMessages > 0
    || summary.professionals > 0
    || summary.professionalProfiles > 0
    || summary.entityExports > 0
}

function isArchivedEntityProfilePayload(payload: unknown) {
  if (!isRecord(payload)) {
    return false
  }

  const directMetadata = isRecord(payload.metadata) ? payload.metadata : {}
  const directLifecycle = isRecord(directMetadata.lifecycle) ? directMetadata.lifecycle : {}
  if (directLifecycle.status === 'archived') {
    return true
  }

  const nestedProfile = isRecord(payload.entity_profile) ? payload.entity_profile : {}
  const nestedMetadata = isRecord(nestedProfile.metadata) ? nestedProfile.metadata : {}
  const nestedLifecycle = isRecord(nestedMetadata.lifecycle) ? nestedMetadata.lifecycle : {}
  return nestedLifecycle.status === 'archived'
}

function archiveEntityProfilePayload(payload: unknown, archivedAt: string, archiveReason: string) {
  const root = isRecord(payload) ? { ...payload } : {}
  const metadata = isRecord(root.metadata) ? { ...root.metadata } : {}
  const lifecycle = isRecord(metadata.lifecycle) ? { ...metadata.lifecycle } : {}
  lifecycle.status = 'archived'
  lifecycle.archivedAt = archivedAt
  lifecycle.archiveReason = archiveReason
  metadata.lifecycle = lifecycle
  root.metadata = metadata
  return root
}

function extractOwnerIds(rows: EntityProfileRow[]) {
  return uniquePositiveOwnerIdsFromEntities(rows)
}

async function loadAuthOwnershipMaps(db: BackendDatabase, rows: EntityProfileRow[]) {
  const ownerIds = extractOwnerIds(rows)
  const [hasFlowAuthUser, hasFlowAuthTenant, hasFlowAuthMembership, hasLegacyUsers, hasLegacyTenants, hasLegacyMemberships] = await Promise.all([
    tableExists(db, 'flow_auth_user'),
    tableExists(db, 'flow_auth_tenant'),
    tableExists(db, 'flow_auth_membership'),
    tableExists(db, 'users'),
    tableExists(db, 'tenants'),
    tableExists(db, 'memberships'),
  ])

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

  return {
    canReadNative,
    canReadLegacy,
    nativeUsers,
    nativeTenants,
    nativeMemberships,
    legacyUsers,
    legacyTenants,
    legacyMemberships,
    nativeUserMap: new Map(nativeUsers.map((row) => [row.id, row])),
    nativeTenantMap: new Map(nativeTenants.map((row) => [row.id, row])),
    nativeMembershipMap: new Map(nativeMemberships.map((row) => [`${row.user_id}:${row.tenant_id}`, row])),
    legacyUserMap: new Map(legacyUsers.map((row) => [row.id, row])),
    legacyTenantMap: new Map(legacyTenants.map((row) => [row.id, row])),
    legacyMembershipMap: new Map(legacyMemberships.map((row) => [`${row.user_id}:${row.tenant_id}`, row])),
  }
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
    const entityProfileRows = all ? await queryAllEntityProfileRows(db) : await queryEntityProfileRows(db, parsedOwnerIds!)

    const ownerIds = all ? uniquePositiveOwnerIdsFromEntities(entityProfileRows) : parsedOwnerIds!
    const {
      canReadNative,
      canReadLegacy,
      nativeUsers,
      nativeTenants,
      nativeMemberships,
      legacyUsers,
      legacyTenants,
      legacyMemberships,
      nativeUserMap,
      nativeTenantMap,
      nativeMembershipMap,
      legacyUserMap,
      legacyTenantMap,
      legacyMembershipMap,
    } = await loadAuthOwnershipMaps(db, entityProfileRows)

    const archivedEntityRows: Array<{
      id: string
      ownerUserId: number | null
      ownerTenantId: number | null
      createdAt: string | null
      updatedAt: string | null
      classification: OwnershipClassification
    }> = []
    const activeEntityProfileRows = entityProfileRows.filter((row) => {
      const maybePayload = (row as EntityProfileRow & { entity_profile?: string | Record<string, unknown> }).entity_profile
      if (typeof maybePayload !== 'string' && !isRecord(maybePayload)) {
        return true
      }

      try {
        const parsedPayload = typeof maybePayload === 'string'
          ? JSON.parse(maybePayload)
          : maybePayload
        if (!isArchivedEntityProfilePayload(parsedPayload)) {
          return true
        }

        archivedEntityRows.push({
          id: row.id,
          ownerUserId: row.owner_user_id,
          ownerTenantId: row.owner_tenant_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          classification: classifyEntityOwnership({
            entity: row,
            nativeUsers: nativeUserMap,
            nativeTenants: nativeTenantMap,
            nativeMemberships: nativeMembershipMap,
            legacyUsers: legacyUserMap,
            legacyTenants: legacyTenantMap,
            legacyMemberships: legacyMembershipMap,
          }),
        })
        return false
      } catch {
        return true
      }
    })

    const classifiedRows = activeEntityProfileRows.map((row) => {
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
      archivedOrphanOwners: archivedEntityRows.filter((row) => row.classification === 'ORPHAN_OWNER').length,
      temporalImpossibleOwners: summary.temporalImpossibleRows,
      topOrphanOffices,
      archivedEntityProfileRows: archivedEntityRows,
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


  app.get<{
    Params: { id: string }
  }>('/internal/admin/ownership/entity-profile/:id', async (request, reply) => {
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

    const db = getConnection(app)
    const row = await db.get<{
      id: string
      owner_id: string | null
      owner_user_id: number | null
      owner_tenant_id: number | null
      created_at: string | null
      updated_at: string | null
      entity_profile: unknown
    }>(
      `
        SELECT
          id,
          owner_id,
          owner_user_id,
          owner_tenant_id,
          created_at,
          updated_at,
          entity_profile
        FROM entity_profile
        WHERE id = ?
      `,
      request.params.id,
    )

    if (!row) {
      return reply.status(404).send({
        status: 'failed',
        error: {
          code: 'ENTITY_PROFILE_NOT_FOUND',
          message: 'Entity profile was not found.',
        },
      })
    }

    const raw = row.entity_profile
    const parsed = typeof raw === 'string'
      ? JSON.parse(raw)
      : raw

    const root = isRecord(parsed) ? parsed : {}
    const metadata = isRecord(root.metadata) ? root.metadata : null
    const lifecycle = metadata && isRecord(metadata.lifecycle) ? metadata.lifecycle : null
    const nestedEntityProfile = isRecord(root.entity_profile) ? root.entity_profile : null
    const nestedMetadata = nestedEntityProfile && isRecord(nestedEntityProfile.metadata) ? nestedEntityProfile.metadata : null
    const nestedLifecycle = nestedMetadata && isRecord(nestedMetadata.lifecycle) ? nestedMetadata.lifecycle : null

    return reply.status(200).send({
      status: 'ready',
      id: row.id,
      ownerId: row.owner_id,
      ownerUserId: row.owner_user_id,
      ownerTenantId: row.owner_tenant_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      entityProfileType: typeof raw,
      entityProfileKeys: Object.keys(root),
      metadata,
      lifecycle,
      nestedMetadata,
      nestedLifecycle,
      rawEntityProfilePreview: JSON.stringify(parsed).slice(0, 2000),
    })
  })

  app.post<{
    Body: ArchiveOrphansBody
  }>('/internal/admin/ownership/archive-orphans', async (request: FastifyRequest, reply: FastifyReply) => {
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

    const body = (request.body ?? {}) as ArchiveOrphansBody
    const entityIds = Array.isArray(body.entityIds)
      ? body.entityIds
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
      : []
    const dryRun = body.dryRun !== false
    const confirm = typeof body.confirm === 'string' ? body.confirm : ''
    const archiveReason = typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim()
      : 'archive orphan ownership entity'

    if (entityIds.length === 0) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'INVALID_ENTITY_IDS',
          message: 'entityIds must contain at least one entity id.',
        },
      })
    }

    if (isWildcardEntitySelection(entityIds) && !dryRun) {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'UNSAFE_WILDCARD_ARCHIVE',
          message: 'Wildcard archive requires dryRun=true.',
        },
      })
    }

    if (!dryRun && confirm !== 'ARCHIVE_ORPHAN_OWNERS') {
      return reply.status(400).send({
        status: 'failed',
        error: {
          code: 'ARCHIVE_CONFIRMATION_REQUIRED',
          message: 'confirm must equal ARCHIVE_ORPHAN_OWNERS when dryRun=false.',
        },
      })
    }

    const db = getConnection(app)
    const selectedRows = isWildcardEntitySelection(entityIds)
      ? await queryAllEntityProfileRows(db)
      : await queryEntityProfileRowsByIds(db, entityIds)
    const authMaps = await loadAuthOwnershipMaps(db, selectedRows)
    const archivedEntityIds: string[] = []
    const skipped: Array<{ entityId: string; reason: string }> = []
    let archivable = 0

    for (const row of selectedRows) {
      const classification = classifyEntityOwnership({
        entity: row,
        nativeUsers: authMaps.nativeUserMap,
        nativeTenants: authMaps.nativeTenantMap,
        nativeMemberships: authMaps.nativeMembershipMap,
        legacyUsers: authMaps.legacyUserMap,
        legacyTenants: authMaps.legacyTenantMap,
        legacyMemberships: authMaps.legacyMembershipMap,
      })

      if (classification !== 'ORPHAN_OWNER') {
        skipped.push({
          entityId: row.id,
          reason: 'not_orphan_owner',
        })
        continue
      }

      const criticalLinks = await queryCriticalLinkSummary(db, row.id)
      if (hasCriticalLinks(criticalLinks)) {
        skipped.push({
          entityId: row.id,
          reason: 'requires_manual_review_critical_links',
        })
        continue
      }

      archivable += 1

      if (dryRun) {
        continue
      }

      const archivedAt = new Date().toISOString()
      const nextPayload = archiveEntityProfilePayload(
        JSON.parse((row as EntityProfileRow & { entity_profile: string }).entity_profile),
        archivedAt,
        archiveReason,
      )

      await db.run(
        `
          UPDATE entity_profile
          SET entity_profile = ?, updated_at = ?
          WHERE id = ?
        `,
        JSON.stringify(nextPayload),
        archivedAt,
        row.id,
      )

      archivedEntityIds.push(row.id)
    }

    request.log.info({
      event: 'internal.ownership.archive-orphans',
      dryRun,
      requested: entityIds.length,
      selectedRows: selectedRows.length,
      archivable,
      archived: archivedEntityIds.length,
      skipped,
      archivedEntityIds,
    }, 'Internal orphan ownership archive action executed')

    return reply.status(200).send({
      status: 'ready',
      dryRun,
      requested: entityIds.length,
      archivable,
      archived: archivedEntityIds.length,
      skipped,
      archivedEntityIds,
    })
  })
}
