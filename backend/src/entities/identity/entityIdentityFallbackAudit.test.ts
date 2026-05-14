import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { runEntityIdentityFallbackAudit } from './entityIdentityFallbackAudit.js'

test('fallback audit classifies remaining occurrences by authority risk', async () => {
  const report = await runEntityIdentityFallbackAudit({
    workspaceRoot: path.resolve(process.cwd(), '..'),
    roots: [
      'backend/src/services/publicProfileMapper.ts',
      'backend/src/services/globalFeedEngine.ts',
      'backend/src/services/discoveryEngine.ts',
      'backend/src/orchestrator/dashboardProjection.ts',
      'backend/src/services/brandSoulShadowAdapter.ts',
      'backend/src/orchestrator/runtimeSceneProjection.ts',
      'backend/src/entities/identity/entityIdentityFallbackAudit.ts',
      'brandsoul/main.py',
      'backend/src/entities/identity/entityIdentityFallbackAudit.test.ts',
    ],
    now: () => '2026-05-10T18:00:00.000Z',
  })

  assert.equal(report.generatedAt, '2026-05-10T18:00:00.000Z')
  assert.ok(report.countsByClassification.SAFE_COMPATIBILITY >= 1)
  assert.equal(report.countsByClassification.MUST_REPLACE, 0)
  assert.ok(report.countsByClassification.LEGACY_PYTHON_AUTHORITY >= 1)
  assert.ok(report.countsByClassification.TEST_ONLY >= 1)
})
