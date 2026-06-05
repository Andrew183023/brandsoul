import 'dotenv/config'

import bcrypt from 'bcryptjs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

import { createTestEntity } from '../src/brain/flowmind/testUtils.js'
import { createDatabaseConnection } from '../src/db/index.js'
import { createEntityRepository } from '../src/repositories/entityRepository.js'
import { runSeedMutation } from '../src/sovereignty/sovereignTestMutationHarness.js'

const TARGET_TENANT_ID = 11
const TARGET_USER_ID = 7
const TARGET_OFFICE_ID = 'office-real-1'
const TARGET_PROFESSIONAL_ID = 'prof-owner-1'
const TARGET_TENANT_SLUG = 'brandsoul-legal-dev'
const TARGET_TENANT_NAME = 'BrandSoul Legal Dev'
const TARGET_EMAIL = process.env.LEGAL_BETA_SMOKE_EMAIL?.trim().toLowerCase() || 'owner@brandsoul.local'
const TARGET_PASSWORD = process.env.LEGAL_BETA_SMOKE_PASSWORD?.trim() || 'BrandSoulOwner!2026'
const TARGET_NAME = process.env.LEGAL_BETA_SMOKE_NAME?.trim() || 'Dra. Ana Rocha'
const TARGET_AUTH_DB_PATH = process.env.LEGAL_BETA_AUTH_DB_PATH?.trim()
  || process.env.BRANDSOUL_DB_PATH?.trim()
  || path.join(process.cwd(), 'data', 'legal-beta-auth.sqlite')
const NOW = '2026-06-05T16:45:00.000Z'

type SeedReport = {
  status: 'ready'
  authDbPath: string
  backendDbProvider: string
  seeded: {
    tenantId: number
    userId: number
    officeId: string
    professionalId: string
  }
  credentials: {
    email: string
    password: string
  }
}

function buildOfficeEntityProfile() {
  const entity = createTestEntity()
  entity.id = TARGET_OFFICE_ID
  entity.metadata.createdAt = NOW
  entity.metadata.updatedAt = NOW
  entity.context = {
    ...entity.context,
    brandCategory: 'legal-services',
  }
  entity.social = {
    ...entity.social,
    category: 'legal-services',
    publicName: 'Ferreira Rocha Advocacia',
    visibility: 'public',
  } as typeof entity.social
  entity.metadata.businessConfig = {
    businessType: 'legal',
    officeName: 'Ferreira Rocha Advocacia',
    description: 'Atendimento juridico com triagem inicial clara e acompanhamento responsavel.',
    institutionalDescription: 'Escritorio juridico com foco em proximos passos claros para o cliente.',
    legalAreas: ['Direito Trabalhista'],
    servedCities: ['Sao Paulo'],
    operatingHours: 'Seg-Sex 08:00-18:00',
    avgResponseMinutes: 120,
    trustEvidence: {
      enabled: false,
      approvedCaseIds: [],
    },
    serviceRules: {
      responseWindowLabel: 'Retorno inicial em ate 2 horas',
    },
    channels: {
      whatsapp: '+55 11 99999-9999',
      email: TARGET_EMAIL,
    },
  } as never

  return entity
}

async function seedLegacyAuthDb() {
  const db = await open({
    filename: TARGET_AUTH_DB_PATH,
    driver: sqlite3.Database,
  })

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        business_model TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'starter',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        tenant_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    const passwordHash = bcrypt.hashSync(TARGET_PASSWORD, 10)

    await db.run('DELETE FROM memberships WHERE user_id = ? OR tenant_id = ?', TARGET_USER_ID, TARGET_TENANT_ID)
    await db.run('DELETE FROM users WHERE email = ? AND id <> ?', TARGET_EMAIL, TARGET_USER_ID)
    await db.run('DELETE FROM tenants WHERE slug = ? AND id <> ?', TARGET_TENANT_SLUG, TARGET_TENANT_ID)

    await db.run(
      `
        INSERT INTO users (id, name, email, password_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          password_hash = excluded.password_hash,
          is_active = 1,
          updated_at = excluded.updated_at
      `,
      TARGET_USER_ID,
      TARGET_NAME,
      TARGET_EMAIL,
      passwordHash,
      NOW,
      NOW,
    )

    await db.run(
      `
        INSERT INTO tenants (id, name, slug, business_model, plan, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 'professional', 'pro', 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          slug = excluded.slug,
          business_model = excluded.business_model,
          plan = excluded.plan,
          is_active = 1,
          updated_at = excluded.updated_at
      `,
      TARGET_TENANT_ID,
      TARGET_TENANT_NAME,
      TARGET_TENANT_SLUG,
      NOW,
      NOW,
    )

    await db.run(
      `
        INSERT INTO memberships (id, user_id, tenant_id, role, created_at)
        VALUES (?, ?, ?, 'owner', ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          tenant_id = excluded.tenant_id,
          role = excluded.role,
          created_at = excluded.created_at
      `,
      TARGET_TENANT_ID,
      TARGET_USER_ID,
      TARGET_TENANT_ID,
      NOW,
    )
  } finally {
    await db.close()
  }
}

async function seedBackendRuntime() {
  const connection = await createDatabaseConnection()
  const entityRepository = createEntityRepository(connection)

  try {
    await connection.run(
      `
        INSERT INTO flow_auth_user (id, legacy_source, legacy_id, name, email, password_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          password_hash = excluded.password_hash,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `,
      TARGET_USER_ID,
      'brandsoul',
      TARGET_USER_ID,
      TARGET_NAME,
      TARGET_EMAIL,
      `seed-password-hash-${TARGET_USER_ID}`,
      1,
      NOW,
      NOW,
    )

    await connection.run(
      `
        INSERT INTO flow_auth_tenant (id, legacy_source, legacy_id, name, slug, business_model, plan, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          slug = excluded.slug,
          business_model = excluded.business_model,
          plan = excluded.plan,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `,
      TARGET_TENANT_ID,
      'brandsoul',
      TARGET_TENANT_ID,
      TARGET_TENANT_NAME,
      TARGET_TENANT_SLUG,
      'professional',
      'pro',
      1,
      NOW,
      NOW,
    )

    await connection.run(
      `
        INSERT INTO flow_auth_membership (legacy_source, legacy_id, user_id, tenant_id, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(legacy_source, legacy_id) DO UPDATE SET
          user_id = excluded.user_id,
          tenant_id = excluded.tenant_id,
          role = excluded.role,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `,
      'brandsoul',
      `${TARGET_USER_ID}:${TARGET_TENANT_ID}:owner`,
      TARGET_USER_ID,
      TARGET_TENANT_ID,
      'owner',
      1,
      NOW,
      NOW,
    )

    const entityProfile = buildOfficeEntityProfile()
    const existing = await entityRepository.getEntityById(TARGET_OFFICE_ID)
    if (existing) {
      await connection.run(
        `
          UPDATE entity_profile
          SET owner_id = ?, owner_user_id = ?, owner_tenant_id = ?, updated_at = ?, entity_profile = ?
          WHERE id = ?
        `,
        `user:${TARGET_USER_ID}:tenant:${TARGET_TENANT_ID}`,
        TARGET_USER_ID,
        TARGET_TENANT_ID,
        NOW,
        JSON.stringify(entityProfile),
        TARGET_OFFICE_ID,
      )
    } else {
      await runSeedMutation(async () => {
        await entityRepository.createEntity({
          id: TARGET_OFFICE_ID,
          ownerId: `user:${TARGET_USER_ID}:tenant:${TARGET_TENANT_ID}`,
          ownerUserId: TARGET_USER_ID,
          ownerTenantId: TARGET_TENANT_ID,
          entityProfile,
          createdAt: NOW,
          updatedAt: NOW,
        })
      }, 'backend/scripts/seedLegalBetaSmoke.ts#createEntity')
    }

    await connection.run(
      `
        INSERT INTO professionals (
          id, tenant_id, user_id, kind, status, display_name, primary_email, primary_phone, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, 'human', 'active', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          user_id = excluded.user_id,
          kind = excluded.kind,
          status = excluded.status,
          display_name = excluded.display_name,
          primary_email = excluded.primary_email,
          primary_phone = excluded.primary_phone,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `,
      TARGET_PROFESSIONAL_ID,
      TARGET_TENANT_ID,
      TARGET_USER_ID,
      TARGET_NAME,
      TARGET_EMAIL,
      '+55 11 99999-9999',
      JSON.stringify({
        officeId: TARGET_OFFICE_ID,
        source: 'legal-beta-smoke-seed',
      }),
      NOW,
      NOW,
    )

    await connection.run(
      `
        INSERT INTO professional_profiles (
          id, tenant_id, professional_id, bio, specialties, availability, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(professional_id) DO UPDATE SET
          bio = excluded.bio,
          specialties = excluded.specialties,
          availability = excluded.availability,
          metadata = excluded.metadata,
          updated_at = excluded.updated_at
      `,
      `profile-${TARGET_PROFESSIONAL_ID}`,
      TARGET_TENANT_ID,
      TARGET_PROFESSIONAL_ID,
      'Advogada responsavel pelo atendimento inicial e acompanhamento do caso.',
      JSON.stringify(['Direito Trabalhista']),
      JSON.stringify({ available: true, city: 'Sao Paulo', state: 'SP' }),
      JSON.stringify({
        photoUrl: null,
        oabCredential: 'OAB/SP 123456',
        isResponsible: true,
        isPublic: true,
      }),
      NOW,
      NOW,
    )
  } finally {
    await connection.close()
  }
}

async function writeReport(report: SeedReport) {
  const outputDir = path.join(process.cwd(), 'reports')
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'legal-beta-smoke-seed-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
}

async function main() {
  await seedLegacyAuthDb()
  const connection = await createDatabaseConnection()
  const provider = connection.dialect
  await connection.close()
  await seedBackendRuntime()

  const report: SeedReport = {
    status: 'ready',
    authDbPath: TARGET_AUTH_DB_PATH,
    backendDbProvider: provider,
    seeded: {
      tenantId: TARGET_TENANT_ID,
      userId: TARGET_USER_ID,
      officeId: TARGET_OFFICE_ID,
      professionalId: TARGET_PROFESSIONAL_ID,
    },
    credentials: {
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
    },
  }

  await writeReport(report)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
