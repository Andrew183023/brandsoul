import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'

import { issueCasePortalAccessToken, markCasePortalAccessTokenUsed } from './legalBetaSupport.js'

async function createTempSqliteDb(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  return {
    db,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('portal token issue and first use create canonical timeline events without duplicating use on refresh', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-portal-access-timeline-')

  try {
    await initializeDatabase(harness.db)
    const now = '2026-06-30T11:00:00.000Z'
    await harness.db.run(
      `
        INSERT INTO cases (
          id,
          tenant_id,
          entity_id,
          title,
          status,
          priority,
          opened_at,
          centelha_context,
          metadata,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'case-portal-1',
      11,
      'office-portal-1',
      'Caso portal',
      'open',
      'normal',
      now,
      '{}',
      '{}',
      now,
      now,
    )

    const portalAccess = await issueCasePortalAccessToken({
      db: harness.db,
      tenantId: 11,
      caseId: 'case-portal-1',
      source: 'public_triage_case_created',
      requestId: 'portal-request-1',
    })

    const createdEvents = await harness.db.all<{ event_type: string; payload: string }[]>(
      `
        SELECT event_type, payload
        FROM case_timeline
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY occurred_at ASC, created_at ASC
      `,
      11,
      'case-portal-1',
    )

    assert.equal(createdEvents.length, 1)
    assert.equal(createdEvents[0]?.event_type, 'portal_access_created')
    assert.equal(createdEvents[0]?.payload.includes(portalAccess.rawToken), false)

    const firstUse = await markCasePortalAccessTokenUsed({
      db: harness.db,
      tenantId: 11,
      caseId: 'case-portal-1',
      tokenId: portalAccess.tokenId,
      source: 'legal_beta_client_portal',
    })
    const secondUse = await markCasePortalAccessTokenUsed({
      db: harness.db,
      tenantId: 11,
      caseId: 'case-portal-1',
      tokenId: portalAccess.tokenId,
      source: 'legal_beta_client_portal',
    })

    assert.equal(firstUse, true)
    assert.equal(secondUse, false)

    const events = await harness.db.all<{ event_type: string; payload: string }[]>(
      `
        SELECT event_type, payload
        FROM case_timeline
        WHERE tenant_id = ? AND case_id = ?
        ORDER BY occurred_at ASC, created_at ASC
      `,
      11,
      'case-portal-1',
    )

    assert.deepEqual(events.map((entry) => entry.event_type), [
      'portal_access_created',
      'portal_access_used',
    ])
    assert.equal(events[1]?.payload.includes(portalAccess.rawToken), false)
  } finally {
    await harness.cleanup()
  }
})
