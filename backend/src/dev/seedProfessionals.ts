import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import type { LegacyAuthStoreRepository, AuthMembershipUserRecord } from '../auth/repositories/legacyAuthStoreRepository.js'
import type { BackendDatabase } from '../db/dbClient.js'

type BackendContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    auth: {
      legacyAuthStoreRepository: LegacyAuthStoreRepository
    }
  }
}

type TenantRow = {
  tenant_id: number | null
}

type ProfessionalRow = {
  id: string
  user_id: number | null
  display_name: string
  status: string
  metadata?: unknown
}

type ProfessionalProfileRow = {
  id: string
}

type RealUserCandidate = {
  userId: number
  displayName: string
}

const DEV_PROFESSIONALS = [
  { displayName: 'Ana Martins', city: 'sao paulo', state: 'sp' },
  { displayName: 'Bruno Almeida', city: 'campinas', state: 'sp' },
  { displayName: 'Carla Souza', city: 'rio de janeiro', state: 'rj' },
  { displayName: 'Diego Ferreira', city: 'belo horizonte', state: 'mg' },
] as const

const SPECIALTIES = ['consumidor', 'trabalhista', 'transito'] as const

function getConnection(app: FastifyInstance) {
  return (app as BackendContext).backendContext.connection
}

function getLegacyAuthStoreRepository(app: FastifyInstance) {
  return (app as BackendContext).backendContext.auth.legacyAuthStoreRepository
}

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomRating() {
  return Math.round((Math.random() * 1.5 + 3.5) * 10) / 10
}

function buildAvailability(city: string, state: string) {
  return {
    available: true,
    city,
    state,
  }
}

function buildMetadata() {
  return {
    experienceYears: randomInteger(2, 15),
    rating: randomRating(),
  }
}

function parseJsonObject(value: unknown) {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }

  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function buildProfessionalMetadata(
  template: { city: string; state: string },
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    location: {
      city: template.city,
      state: template.state,
    },
    ...overrides,
  }
}

function createTemplate(index: number, displayName?: string) {
  const template = DEV_PROFESSIONALS[index % DEV_PROFESSIONALS.length]
  return {
    ...template,
    displayName: displayName ?? template.displayName,
  }
}

async function loadTenantIds(db: BackendDatabase) {
  const rows = await db.all<TenantRow[]>(
    `
      SELECT DISTINCT tenant_id
      FROM (
        SELECT tenant_id
        FROM auth_refresh_session
        UNION
        SELECT tenant_id
        FROM cases
        UNION
        SELECT tenant_id
        FROM professionals
        UNION
        SELECT owner_tenant_id AS tenant_id
        FROM entity_profile
      ) tenant_scope
      WHERE tenant_id IS NOT NULL
    `,
  )

  return rows
    .map((row) => Number(row.tenant_id))
    .filter((tenantId) => Number.isInteger(tenantId) && tenantId > 0)
}

async function ensureProfilesForExistingProfessionals(db: BackendDatabase, tenantId: number) {
  const professionalsWithoutProfile = await db.all<ProfessionalRow[]>(
    `
      SELECT professionals.id
      FROM professionals
      LEFT JOIN professional_profiles
        ON professional_profiles.professional_id = professionals.id
       AND professional_profiles.tenant_id = professionals.tenant_id
      WHERE professionals.tenant_id = ?
        AND professional_profiles.id IS NULL
    `,
    tenantId,
  )

  if (professionalsWithoutProfile.length === 0) {
    return
  }

  for (const [index, professional] of professionalsWithoutProfile.entries()) {
    const template = createTemplate(index, professional.display_name)
    await ensureProfessionalProfile(db, tenantId, professional.id, template)
  }
}

async function ensureProfessionalProfile(
  db: BackendDatabase,
  tenantId: number,
  professionalId: string,
  template: { displayName: string; city: string; state: string },
) {
  const existingProfile = await db.get<ProfessionalProfileRow>(
    `
      SELECT id
      FROM professional_profiles
      WHERE tenant_id = ? AND professional_id = ?
    `,
    tenantId,
    professionalId,
  )

  const now = new Date().toISOString()
  const specialtiesJson = JSON.stringify(['transito', 'consumidor', 'trabalhista'])
  const availabilityJson = JSON.stringify(buildAvailability(template.city, template.state))
  const metadataJson = JSON.stringify(buildMetadata())

  if (existingProfile) {
    const updateProfileSql = db.dialect === 'postgres'
      ? `
          UPDATE professional_profiles
          SET specialties = ?::jsonb,
              availability = ?::jsonb,
              metadata = COALESCE(NULLIF(metadata, '{}'::jsonb), ?::jsonb),
              updated_at = ?
          WHERE tenant_id = ? AND professional_id = ?
        `
      : `
          UPDATE professional_profiles
          SET specialties = ?,
              availability = ?,
              metadata = CASE
                WHEN metadata = '{}' THEN ?
                ELSE metadata
              END,
              updated_at = ?
          WHERE tenant_id = ? AND professional_id = ?
        `

    await db.run(
      updateProfileSql,
      specialtiesJson,
      availabilityJson,
      metadataJson,
      now,
      tenantId,
      professionalId,
    )
    return
  }

  const insertProfileSql = db.dialect === 'postgres'
    ? `
        INSERT INTO professional_profiles (
          id, professional_id, tenant_id, specialties, availability, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)
      `
    : `
        INSERT INTO professional_profiles (
          id, professional_id, tenant_id, specialties, availability, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `

  await db.run(
    insertProfileSql,
    randomUUID(),
    professionalId,
    tenantId,
    specialtiesJson,
    availabilityJson,
    metadataJson,
    now,
    now,
  )
}

async function loadRealTenantUsers(app: FastifyInstance, tenantId: number): Promise<RealUserCandidate[]> {
  const membershipUsers = await getLegacyAuthStoreRepository(app).listMembershipUsersByTenant(tenantId)
  const activeMembershipUsers = membershipUsers
    .filter((record) => record.user.isActive)
    .map((record) => ({
      userId: record.user.id,
      displayName: record.user.name.trim() || `User ${record.user.id}`,
    }))

  if (activeMembershipUsers.length > 0) {
    return activeMembershipUsers
  }

  const db = getConnection(app)
  const rows = await db.all<Array<{ user_id: number | null }>>(
    `
      SELECT DISTINCT user_id
      FROM auth_refresh_session
      WHERE tenant_id = ?
        AND user_id IS NOT NULL
      ORDER BY user_id ASC
    `,
    tenantId,
  )

  return rows
    .map((row) => Number(row.user_id))
    .filter((userId) => Number.isInteger(userId) && userId > 0)
    .map((userId) => ({
      userId,
      displayName: `User ${userId}`,
    }))
}

async function seedTenantProfessionals(db: BackendDatabase, tenantId: number) {
  const existing = await db.get<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM professionals
      WHERE tenant_id = ?
    `,
    tenantId,
  )

  if (Number(existing?.total ?? 0) > 0) {
    await ensureProfilesForExistingProfessionals(db, tenantId)
    return 0
  }

  const now = new Date().toISOString()
  const insertProfessionalSql = db.dialect === 'postgres'
    ? `
        INSERT INTO professionals (
          id, tenant_id, user_id, status, display_name, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, 'active', ?, ?::jsonb, ?, ?)
      `
    : `
        INSERT INTO professionals (
          id, tenant_id, user_id, status, display_name, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
      `
  const insertProfileSql = db.dialect === 'postgres'
    ? `
        INSERT INTO professional_profiles (
          id, professional_id, tenant_id, specialties, availability, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)
      `
    : `
        INSERT INTO professional_profiles (
          id, professional_id, tenant_id, specialties, availability, metadata, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `

  for (const [index, template] of DEV_PROFESSIONALS.entries()) {
    const professionalId = randomUUID()

    await db.run(
      insertProfessionalSql,
      professionalId,
      tenantId,
      tenantId * 1_000 + index + 1,
      template.displayName,
      JSON.stringify(buildProfessionalMetadata(template, {
        loginCapable: false,
        sandboxOnly: true,
      })),
      now,
      now,
    )

    await db.run(
      insertProfileSql,
      randomUUID(),
      professionalId,
      tenantId,
      JSON.stringify([...SPECIALTIES]),
      JSON.stringify(buildAvailability(template.city, template.state)),
      JSON.stringify(buildMetadata()),
      now,
      now,
    )
  }

  return DEV_PROFESSIONALS.length
}

export async function seedProfessionals(app: FastifyInstance) {
  const db = getConnection(app)
  const tenantIds = await loadTenantIds(db)

  for (const tenantId of tenantIds) {
    const realUsers = await loadRealTenantUsers(app, tenantId)
    const createdCount = await db.transaction(async (tx) => seedTenantProfessionals(tx, tenantId))
    if (createdCount > 0) {
      app.log.info({ count: createdCount, tenantId }, 'dev.seed.professionals_created')
    }

    if (realUsers.length === 0) {
      continue
    }

    const linkedCount = await db.transaction(async (tx) => {
      const professionals = await tx.all<ProfessionalRow[]>(
        `
          SELECT id, user_id, display_name, status, metadata
          FROM professionals
          WHERE tenant_id = ?
          ORDER BY created_at ASC, id ASC
        `,
        tenantId,
      )

      const existingByUserId = new Map<number, ProfessionalRow>()
      for (const professional of professionals) {
        if (typeof professional.user_id === 'number') {
          existingByUserId.set(professional.user_id, professional)
        }
      }

      let linkedOrUpdatedCount = 0

      for (const [index, realUser] of realUsers.entries()) {
        const existingProfessional = existingByUserId.get(realUser.userId)
        const template = createTemplate(index, realUser.displayName)
        const now = new Date().toISOString()

        if (existingProfessional) {
          await tx.run(
            `
              UPDATE professionals
              SET display_name = ?,
                  status = 'active',
                  metadata = ?,
                  updated_at = ?
              WHERE tenant_id = ? AND id = ?
            `,
            realUser.displayName,
            JSON.stringify(buildProfessionalMetadata(template, {
              ...parseJsonObject(existingProfessional.metadata),
              loginCapable: true,
              sandboxOnly: false,
            })),
            now,
            tenantId,
            existingProfessional.id,
          )
          await ensureProfessionalProfile(tx, tenantId, existingProfessional.id, template)
          linkedOrUpdatedCount += 1
          continue
        }

        const candidateToBackfill = professionals.find((professional) => {
          if (professional.user_id === null) {
            return true
          }

          return !realUsers.some((candidate) => candidate.userId === professional.user_id)
        })

        if (candidateToBackfill) {
          await tx.run(
            `
              UPDATE professionals
              SET user_id = ?,
                  display_name = ?,
                  status = 'active',
                  metadata = ?,
                  updated_at = ?
              WHERE tenant_id = ? AND id = ?
            `,
            realUser.userId,
            realUser.displayName,
            JSON.stringify(buildProfessionalMetadata(template, {
              ...parseJsonObject(candidateToBackfill.metadata),
              loginCapable: true,
              sandboxOnly: false,
            })),
            now,
            tenantId,
            candidateToBackfill.id,
          )
          candidateToBackfill.user_id = realUser.userId
          candidateToBackfill.display_name = realUser.displayName
          candidateToBackfill.status = 'active'
          existingByUserId.set(realUser.userId, candidateToBackfill)
          await ensureProfessionalProfile(tx, tenantId, candidateToBackfill.id, template)
          linkedOrUpdatedCount += 1
          continue
        }

        const insertProfessionalSql = tx.dialect === 'postgres'
          ? `
              INSERT INTO professionals (
                id, tenant_id, user_id, status, display_name, metadata, created_at, updated_at
              )
              VALUES (?, ?, ?, 'active', ?, ?::jsonb, ?, ?)
            `
          : `
              INSERT INTO professionals (
                id, tenant_id, user_id, status, display_name, metadata, created_at, updated_at
              )
              VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
            `
        const professionalId = randomUUID()

        await tx.run(
          insertProfessionalSql,
          professionalId,
          tenantId,
          realUser.userId,
          realUser.displayName,
          JSON.stringify(buildProfessionalMetadata(template, {
            loginCapable: true,
            sandboxOnly: false,
          })),
          now,
          now,
        )
        await ensureProfessionalProfile(tx, tenantId, professionalId, template)
        linkedOrUpdatedCount += 1
      }

      const loginCapableUserIds = new Set(realUsers.map((candidate) => candidate.userId))
      const allProfessionals = await tx.all<ProfessionalRow[]>(
        `
          SELECT id, user_id, display_name, status, metadata
          FROM professionals
          WHERE tenant_id = ?
          ORDER BY created_at ASC, id ASC
        `,
        tenantId,
      )

      for (const [index, professional] of allProfessionals.entries()) {
        const template = createTemplate(index, professional.display_name)
        const metadata = parseJsonObject(professional.metadata)
        const shouldBeLoginCapable = typeof professional.user_id === 'number' && loginCapableUserIds.has(professional.user_id)
        const nextMetadata = buildProfessionalMetadata(template, {
          ...metadata,
          loginCapable: shouldBeLoginCapable,
          sandboxOnly: !shouldBeLoginCapable,
        })

        if (metadata.loginCapable === nextMetadata.loginCapable && metadata.sandboxOnly === nextMetadata.sandboxOnly) {
          continue
        }

        await tx.run(
          `
            UPDATE professionals
            SET metadata = ?, updated_at = ?
            WHERE tenant_id = ? AND id = ?
          `,
          JSON.stringify(nextMetadata),
          new Date().toISOString(),
          tenantId,
          professional.id,
        )
      }

      return linkedOrUpdatedCount
    })

    if (linkedCount > 0) {
      app.log.info({ count: linkedCount, tenantId }, 'dev.seed.professionals_linked_to_real_users')
    }
  }
}
