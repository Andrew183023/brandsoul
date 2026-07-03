import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'
import { LegalMetricsRecorder } from '../../modules/legalCases/legalMetricsRecorder.js'

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

test('portal access metrics record creation and first use without duplicating refresh or leaking token data', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-portal-access-metrics-')

  try {
    await initializeDatabase(harness.db)
    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const now = '2026-07-01T10:00:00.000Z'

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
      'case-portal-metrics-1',
      21,
      'office-portal-metrics-1',
      'Caso portal metricas',
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
      tenantId: 21,
      caseId: 'case-portal-metrics-1',
      source: 'public_triage_case_created',
      requestId: 'portal-metrics-request-1',
      recorder,
    })

    const firstUse = await markCasePortalAccessTokenUsed({
      db: harness.db,
      tenantId: 21,
      caseId: 'case-portal-metrics-1',
      tokenId: portalAccess.tokenId,
      source: 'legal_beta_client_portal',
      recorder,
    })
    const secondUse = await markCasePortalAccessTokenUsed({
      db: harness.db,
      tenantId: 21,
      caseId: 'case-portal-metrics-1',
      tokenId: portalAccess.tokenId,
      source: 'legal_beta_client_portal',
      recorder,
    })

    assert.equal(firstUse, true)
    assert.equal(secondUse, false)

    const metrics = observability.getMetricsSnapshot()
    assert.equal(metrics.customCounters.legal_portal_access_created_total, 1)
    assert.equal(metrics.customCounters.legal_portal_access_used_total, 1)
    assert.equal(
      metrics.customCounterSeries['legal_portal_access_created_total{entity_id=office-portal-metrics-1,result=success,source=public_triage_case_created,tenant_id=21}'],
      1,
    )
    assert.equal(
      metrics.customCounterSeries['legal_portal_access_used_total{entity_id=office-portal-metrics-1,result=success,source=legal_beta_client_portal,tenant_id=21}'],
      1,
    )

    const serializedSeries = JSON.stringify(metrics.customCounterSeries)
    assert.equal(serializedSeries.includes(portalAccess.rawToken), false)
    assert.equal(serializedSeries.includes(portalAccess.tokenId), false)
    assert.equal(serializedSeries.includes('case-portal-metrics-1'), false)
  } finally {
    await harness.cleanup()
  }
})
